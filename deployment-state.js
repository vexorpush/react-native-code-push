function normalizeDeployment(deployment) {
  const value = String(deployment || "").trim().toLowerCase();
  if (value === "development" || value === "staging") return value;
  return "production";
}

function normalizePlatform(platform) {
  const value = String(platform || "").trim().toLowerCase();
  return value === "android" ? "android" : "ios";
}

function getDeploymentScope(config = {}) {
  const deploymentKey = String(config.deploymentKey || "").trim();
  if (deploymentKey) {
    return `deployment-key:${deploymentKey}`;
  }

  const platform = normalizePlatform(config.platform);
  const appName = String(config.appName || "").trim() || "*";
  const deployment = normalizeDeployment(config.deployment);
  return `deployment:${platform}:${appName}:${deployment}`;
}

function makeScopedKey(prefix, config = {}) {
  return `${prefix}:${getDeploymentScope(config)}`;
}

module.exports = {
  getDeploymentScope,
  makeScopedKey,
  normalizeDeployment,
  normalizePlatform,
};
