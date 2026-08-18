/* eslint-disable @typescript-eslint/no-require-imports */
const { NativeModules, Platform } = require("react-native");
const { makeScopedKey } = require("./deployment-state");
const { resolveCurrentVersion } = require("./current-version");

const defaultConfig = {
  baseUrl: "https://app.vexor.one",
  deployment: "Production",
  binaryVersion: "*",
  downloadRetryAttempts: 2,
  downloadRetryDelayMs: 1500,
  debug: false,
};

let runtimeConfig = { ...defaultConfig };
const clientIdKey = "vexorCodePushClientId";

function normalizeUpdateMode(value, fallback = "deferred") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "force" || normalized === "background" || normalized === "deferred" || normalized === "prompt") {
    return normalized;
  }
  return fallback;
}

function updateModeToMandatory(updateMode) {
  return updateMode === "force" || updateMode === "background";
}

function configure(config) {
  runtimeConfig = normalizeConfig({ ...runtimeConfig, ...config });
  return runtimeConfig;
}

function getConfig() {
  return { ...runtimeConfig };
}

async function getCurrentVersion(config = runtimeConfig) {
  const scopedConfig = normalizeConfig({ ...runtimeConfig, ...config });
  const storedVersion = await readScopedVersion(scopedConfig);
  if (Number.isFinite(storedVersion)) {
    debugLog(scopedConfig, "getCurrentVersion", {
      source: "stored",
      storedVersion,
      scope: makeScopedKey("vexorCodePushCurrentVersion", scopedConfig),
    });
    return storedVersion;
  }

  const pending = await readPendingUpdate(scopedConfig);
  const pendingVersion = Number(pending?.version);
  const nativeVersion = await readNativeCurrentVersion();
  const resolvedVersion = resolveCurrentVersion({
    pendingVersion,
    nativeVersion,
  });
  debugLog(scopedConfig, "getCurrentVersion", {
    source: Number.isFinite(pendingVersion) ? "pending" : Number.isFinite(nativeVersion) ? "native" : "empty",
    pendingVersion,
    nativeVersion,
    resolvedVersion,
    scope: makeScopedKey("vexorCodePushCurrentVersion", scopedConfig),
  });
  return resolvedVersion;
}

async function checkUpdate(options = {}) {
  const config = normalizeConfig({ ...runtimeConfig, ...options });
  const currentVersion =
    typeof options.currentVersion === "number" ? options.currentVersion : await getCurrentVersion(config);
  // Always identify the device: the server buckets staged rollouts on this id,
  // and without it every device falls back to a per-request coin flip.
  const clientId = await getClientUniqueId(config);
  const manifestUrl = buildManifestUrl(config, currentVersion, clientId);
  debugLog(config, "checkUpdate:request", {
    currentVersion,
    manifestUrl,
    platform: config.platform,
    binaryVersion: config.binaryVersion,
    deploymentKey: config.deploymentKey,
    appName: config.appName,
    deployment: config.deployment,
  });
  const response = await fetch(manifestUrl, {
    headers: config.headers,
  });
  const manifest = await response.json();

  if (!response.ok) {
    throw new Error(manifest.message || manifest.errorMessage || `OTA manifest failed: ${response.status}`);
  }

  const version = Number(manifest.version || 0);
  const updateMode = normalizeUpdateMode(manifest.updateMode || manifest.metadata?.updateMode, manifest.is_mandatory ? "force" : "deferred");
  const downloadUrl = getDownloadUrl(manifest, config.platform);
  const hasUpdate = version > currentVersion && Boolean(downloadUrl);
  debugLog(config, "checkUpdate:response", {
    status: response.status,
    currentVersion,
    version,
    label: manifest.label,
    hasUpdate,
    downloadUrl,
    updateMode,
    metadata: manifest.metadata,
  });
  return {
    currentVersion,
    hasUpdate,
    manifest,
    manifestUrl,
    version,
    downloadUrl,
    mandatory: updateModeToMandatory(updateMode),
    updateMode,
    metadata: manifest.metadata || {},
  };
}

async function installUpdate(update, options = {}) {
  const manifest = update.manifest || update;
  const config = normalizeConfig({ ...runtimeConfig, ...options });
  const downloadUrl = update.downloadUrl || getDownloadUrl(manifest, config.platform);
  const version = Number(update.version || manifest.version || 0);
  const reportPayload = await buildReportPayload(manifest, config);
  const extensionBundle = resolveBundleExtension(options, config);

  if (!downloadUrl || !version) {
    throw new Error("No installable OTA update is available.");
  }

  debugLog(config, "installUpdate:start", {
    version,
    label: reportPayload.label,
    downloadUrl,
    extensionBundle,
    restartAfterInstall: options.restartAfterInstall ?? true,
    scope: makeScopedKey("vexorCodePushCurrentVersion", config),
  });
  await reportDownload(reportPayload, config).catch(() => undefined);
  await savePendingUpdate({
    ...reportPayload,
    version,
    label: reportPayload.label,
    installedAt: Date.now(),
  }, config).catch(() => undefined);
  debugLog(config, "installUpdate:pendingSaved", {
    version,
    label: reportPayload.label,
    scope: makeScopedKey("vexorCodePushPendingUpdate", config),
  });

  try {
    await downloadBundleWithRetry({
      downloadUrl,
      version,
      manifest,
      options,
      config,
      extensionBundle,
    });
    debugLog(config, "installUpdate:downloadSuccess", {
      version,
      label: reportPayload.label,
    });
    await writeScopedVersion(config, version);
    debugLog(config, "installUpdate:versionSaved", {
      version,
      scope: makeScopedKey("vexorCodePushCurrentVersion", config),
    });
  } catch (error) {
    debugLog(config, "installUpdate:error", {
      version,
      label: reportPayload.label,
      message: error?.message || String(error),
    });
    await reportDeploy({ ...reportPayload, status: "DeploymentFailed" }, config).catch(() => undefined);
    await clearPendingUpdate(config).catch(() => undefined);
    if (options.onError) options.onError(error);
    throw error;
  }
}

async function downloadBundleWithRetry({ downloadUrl, version, manifest, options, config, extensionBundle }) {
  const attempts = positiveInteger(options.downloadRetryAttempts ?? config.downloadRetryAttempts, 1);
  const delayMs = positiveInteger(options.downloadRetryDelayMs ?? config.downloadRetryDelayMs, 0);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let attemptFailedError;
    if (options.onDownloadAttempt) {
      options.onDownloadAttempt({ attempt, attempts, downloadUrl, version });
    }

    try {
      await downloadAndInstallBundleNative({
        downloadUrl,
        version,
        manifest,
        options,
        config,
        extensionBundle,
      });

      if (options.onSuccess) options.onSuccess();
      if (options.restartAfterInstall ?? true) {
        setTimeout(() => {
          NativeModules?.VexorCodePush?.restart?.();
        }, options.restartDelay || 300);
      }

      if (attemptFailedError) throw attemptFailedError;
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) {
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError || new Error("OTA download failed");
}

async function downloadAndInstallBundleNative({ downloadUrl, version, manifest, options, config, extensionBundle }) {
  const nativeModule = NativeModules?.VexorCodePush;
  if (!nativeModule?.downloadAndInstallBundle) {
    throw new Error(
      "VexorCodePush native module does not expose downloadAndInstallBundle. Rebuild the app after installing @vexor-push/react-native-code-push.",
    );
  }

  const success = await nativeModule.downloadAndInstallBundle(
    downloadUrl,
    JSON.stringify(config.headers || {}),
    extensionBundle,
    version,
    positiveInteger(options.maxBundleVersions ?? config.maxBundleVersions, 2),
    JSON.stringify(manifest.metadata || {}),
  );

  if (!success) {
    throw new Error("OTA download failed");
  }
}

async function sync(options = {}) {
  await checkPendingUpdate(options);
  await notifyApplicationReady(options);
  const update = await checkUpdate(options);
  if (!update.hasUpdate) return update;
  if (update.updateMode === "prompt") return update;
  await installUpdate(update, {
    ...options,
    restartAfterInstall: update.updateMode !== "deferred",
  });
  return update;
}

function reset(restart = true) {
  debugLog(runtimeConfig, "reset", { restart });
  const nativeModule = NativeModules?.VexorCodePush;
  if (nativeModule?.deleteBundle) {
    nativeModule.deleteBundle(1).then((removed) => {
      if (removed && restart) {
        setTimeout(() => {
          nativeModule.restart?.();
        }, 300);
      }
    }).catch(() => undefined);
  }
  clearPendingUpdate(runtimeConfig).catch(() => undefined);
  clearScopedVersion(runtimeConfig).catch(() => undefined);
}

async function notifyApplicationReady(options = {}) {
  const config = normalizeConfig({ ...runtimeConfig, ...options });
  const pending = await readPendingUpdate(config);
  if (!pending) {
    debugLog(config, "notifyApplicationReady", { status: "none" });
    return { status: "none" };
  }

  await reportDeploy({ ...pending, status: "DeploymentSucceeded" }, config).catch(() => undefined);
  await clearPendingUpdate(config);
  debugLog(config, "notifyApplicationReady", {
    status: "ready",
    version: pending.version,
    label: pending.label,
  });
  return { status: "ready", pending };
}

async function checkPendingUpdate(options = {}) {
  const config = normalizeConfig({ ...runtimeConfig, ...options });
  const pending = await readPendingUpdate(config);
  if (!pending) {
    debugLog(config, "checkPendingUpdate", { status: "none" });
    return { status: "none" };
  }

  if (pending.launchSeenAt) {
    await reportDeploy({ ...pending, status: "DeploymentFailed" }, config).catch(() => undefined);
    await clearPendingUpdate(config).catch(() => undefined);
    if (options.rollbackOnFailedPending !== false) {
      hotUpdate.removeUpdate(options.restartAfterRollback ?? false);
    }
    debugLog(config, "checkPendingUpdate", {
      status: "rolledBack",
      version: pending.version,
      label: pending.label,
    });
    return { status: "rolledBack", pending };
  }

  const nextPending = { ...pending, launchSeenAt: Date.now() };
  await savePendingUpdate(nextPending, config).catch(() => undefined);
  debugLog(config, "checkPendingUpdate", {
    status: "pending",
    version: nextPending.version,
    label: nextPending.label,
  });
  return { status: "pending", pending: nextPending };
}

function buildManifestUrl(config, currentVersion, clientId) {
  const baseUrl = String(config.baseUrl || defaultConfig.baseUrl).replace(/\/+$/, "");
  const path = config.deploymentKey
    ? `/api/ota/key/${encodeURIComponent(config.deploymentKey)}/update.json`
    : `/api/ota/${encodeURIComponent(required(config.appName, "appName"))}/${encodeURIComponent(
        config.deployment || defaultConfig.deployment,
      )}/update.json`;
  const params = [
    ["currentVersion", String(currentVersion || 0)],
    ["platform", config.platform || Platform.OS],
    ["binaryVersion", config.binaryVersion || defaultConfig.binaryVersion],
  ];
  const resolvedClientId = clientId || config.clientId;
  if (resolvedClientId) {
    params.push(["clientId", String(resolvedClientId)]);
  }
  return `${baseUrl}${path}?${toQueryString(params)}`;
}

function toQueryString(params) {
  return params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function getDownloadUrl(manifest, platform = Platform.OS) {
  if (!manifest) return "";
  if (platform === "android") {
    return manifest.downloadAndroidUrl || manifest.download_url || "";
  }
  return manifest.downloadIosUrl || manifest.download_url || "";
}

async function reportDownload(payload, config = runtimeConfig) {
  return postReport("download", payload, config);
}

async function reportDeploy(payload, config = runtimeConfig) {
  return postReport("deploy", payload, config);
}

async function postReport(kind, payload, config) {
  if (!payload.deploymentKey || !payload.label) return;

  const clientUniqueId = payload.clientUniqueId || (await getClientUniqueId(config));
  if (!clientUniqueId) return;

  const baseUrl = String(config.baseUrl || defaultConfig.baseUrl).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/ota/report/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    },
    body: JSON.stringify({ ...payload, clientUniqueId }),
  });

  if (!response.ok) {
    throw new Error(`OTA report ${kind} failed: ${response.status}`);
  }
}

async function buildReportPayload(manifest, config) {
  return {
    deploymentKey: config.deploymentKey || manifest.metadata?.deploymentKey || "",
    label: manifest.label || manifest.metadata?.label || "",
    clientUniqueId: await getClientUniqueId(config),
    previousDeploymentKey: config.previousDeploymentKey,
    previousLabelOrAppVersion: config.previousLabelOrAppVersion || config.binaryVersion,
  };
}

async function getClientUniqueId(config = runtimeConfig) {
  if (config.clientId) return String(config.clientId);

  const existing = await storageGetItem(clientIdKey);
  if (existing) return existing;

  const generated = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await storageSetItem(clientIdKey, generated).catch(() => undefined);
  return generated;
}

async function savePendingUpdate(payload, config = runtimeConfig) {
  await writeJson(makeScopedKey("vexorCodePushPendingUpdate", config), payload);
}

async function readPendingUpdate(config = runtimeConfig) {
  return readJson(makeScopedKey("vexorCodePushPendingUpdate", config));
}

async function clearPendingUpdate(config = runtimeConfig) {
  await removeItem(makeScopedKey("vexorCodePushPendingUpdate", config));
}

async function writeScopedVersion(config, version) {
  await writeJson(makeScopedKey("vexorCodePushCurrentVersion", config), {
    version: Number(version) || 0,
  });
}

async function readScopedVersion(config) {
  const stored = await readJson(makeScopedKey("vexorCodePushCurrentVersion", config));
  const version = Number(stored?.version);
  return Number.isFinite(version) ? version : undefined;
}

async function readNativeCurrentVersion() {
  const nativeModule = NativeModules?.VexorCodePush;

  if (!nativeModule?.getCurrentVersion) {
    return undefined;
  }

  try {
    const version = await nativeModule.getCurrentVersion(0);
    const parsed = Number(version);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function clearScopedVersion(config = runtimeConfig) {
  await removeItem(makeScopedKey("vexorCodePushCurrentVersion", config));
}

async function readJson(key) {
  const value = await storageGetItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function writeJson(key, value) {
  await storageSetItem(key, JSON.stringify(value));
}

async function storageGetItem(key) {
  if (runtimeConfig.storage?.getItem) return runtimeConfig.storage.getItem(key);
  if (globalThis.localStorage?.getItem) return globalThis.localStorage.getItem(key);
  return memoryStorage.get(key) ?? null;
}

async function storageSetItem(key, value) {
  if (runtimeConfig.storage?.setItem) return runtimeConfig.storage.setItem(key, value);
  if (globalThis.localStorage?.setItem) return globalThis.localStorage.setItem(key, value);
  memoryStorage.set(key, value);
}

async function removeItem(key) {
  if (runtimeConfig.storage?.removeItem) return runtimeConfig.storage.removeItem(key);
  if (globalThis.localStorage?.removeItem) return globalThis.localStorage.removeItem(key);
  memoryStorage.delete(key);
}

const memoryStorage = new Map();

function normalizeConfig(config) {
  return {
    ...config,
    baseUrl: config.baseUrl || defaultConfig.baseUrl,
    deployment: config.deployment || defaultConfig.deployment,
    binaryVersion: config.binaryVersion || defaultConfig.binaryVersion,
    platform: config.platform || Platform.OS,
  };
}

function resolveBundleExtension(options = {}, config = runtimeConfig) {
  if (options.extensionBundle) return options.extensionBundle;
  return config.platform === "android" ? ".bundle" : ".jsbundle";
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function required(value, name) {
  if (!value) throw new Error(`OTA config "${name}" is required.`);
  return value;
}

function debugLog(config, event, payload = {}) {
  if (!config?.debug && !runtimeConfig.debug) return;
  console.log("[VEXOR-CODEPUSH-DEBUG]", event, payload);
}

module.exports = {
  configure,
  getConfig,
  getCurrentVersion,
  getClientUniqueId,
  checkUpdate,
  installUpdate,
  sync,
  reset,
  notifyApplicationReady,
  checkPendingUpdate,
  reportDownload,
  reportDeploy,
  buildManifestUrl,
  getDownloadUrl,
};
