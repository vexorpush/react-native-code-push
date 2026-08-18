import type { PlatformOSType } from "react-native";

export type UpdateMode = "force" | "background" | "deferred" | "prompt";

export type VexorOtaManifest = {
  version: number;
  downloadAndroidUrl?: string;
  downloadIosUrl?: string;
  download_url?: string;
  label?: string;
  is_mandatory?: boolean;
  updateMode?: UpdateMode;
  metadata?: Record<string, unknown> & {
    mandatory?: boolean;
    updateMode?: UpdateMode;
    rollout?: number;
    targetBinaryVersion?: string;
    deploymentKey?: string;
  };
  [key: string]: unknown;
};

export type VexorOtaConfig = {
  baseUrl?: string;
  appName?: string;
  deploymentKey?: string;
  deployment?: string;
  binaryVersion?: string;
  platform?: PlatformOSType;
  clientId?: string;
  previousDeploymentKey?: string;
  previousLabelOrAppVersion?: string;
  downloadRetryAttempts?: number;
  downloadRetryDelayMs?: number;
  debug?: boolean;
  storage?: {
    getItem: (key: string) => string | null | Promise<string | null>;
    setItem: (key: string, value: string) => void | Promise<void>;
    removeItem: (key: string) => void | Promise<void>;
  };
  headers?: Record<string, string>;
};

export type CheckUpdateOptions = Partial<VexorOtaConfig> & {
  currentVersion?: number;
};

export type VexorOtaUpdate = {
  currentVersion: number;
  hasUpdate: boolean;
  manifest: VexorOtaManifest;
  manifestUrl: string;
  version: number;
  downloadUrl?: string;
  mandatory: boolean;
  updateMode: UpdateMode;
  metadata: Record<string, unknown>;
};

export type InstallUpdateOptions = Partial<VexorOtaConfig> & {
  restartAfterInstall?: boolean;
  restartDelay?: number;
  extensionBundle?: string;
  maxBundleVersions?: number;
  rollbackOnFailedPending?: boolean;
  restartAfterRollback?: boolean;
  onSuccess?: () => void;
  onError?: (error?: unknown) => void;
  onProgress?: (received: string | number, total: string | number) => void;
  onDownloadAttempt?: (info: {
    attempt: number;
    attempts: number;
    downloadUrl: string;
    version: number;
  }) => void;
};

export function configure(config: VexorOtaConfig): VexorOtaConfig &
  Required<Pick<VexorOtaConfig, "baseUrl" | "deployment" | "binaryVersion" | "platform">>;
export function getConfig(): Partial<VexorOtaConfig>;
export function getCurrentVersion(config?: Partial<VexorOtaConfig>): Promise<number>;
export function getClientUniqueId(config?: Partial<VexorOtaConfig>): Promise<string>;
export function checkUpdate(options?: CheckUpdateOptions): Promise<VexorOtaUpdate>;
export function installUpdate(update: VexorOtaUpdate | VexorOtaManifest, options?: InstallUpdateOptions): Promise<void>;
export function sync(options?: CheckUpdateOptions & InstallUpdateOptions): Promise<VexorOtaUpdate>;
export function reset(restart?: boolean): void;
export function notifyApplicationReady(options?: Partial<VexorOtaConfig>): Promise<{
  status: "none" | "ready";
  pending?: Record<string, unknown>;
}>;
export function checkPendingUpdate(options?: Partial<VexorOtaConfig> & {
  rollbackOnFailedPending?: boolean;
  restartAfterRollback?: boolean;
}): Promise<{
  status: "none" | "pending" | "rolledBack";
  pending?: Record<string, unknown>;
}>;
export function reportDownload(payload: Record<string, unknown>, config?: Partial<VexorOtaConfig>): Promise<void>;
export function reportDeploy(payload: Record<string, unknown>, config?: Partial<VexorOtaConfig>): Promise<void>;
export function buildManifestUrl(
  config: VexorOtaConfig,
  currentVersion?: number,
  clientId?: string,
): string;
export function getDownloadUrl(manifest: VexorOtaManifest, platform?: PlatformOSType): string;
