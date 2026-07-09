function normalizeVersion(value) {
  const version = Number(value);
  return Number.isFinite(version) ? version : undefined;
}

function resolveCurrentVersion({ storedVersion, pendingVersion, nativeVersion } = {}) {
  const normalizedStoredVersion = normalizeVersion(storedVersion);

  if (Number.isFinite(normalizedStoredVersion)) {
    return normalizedStoredVersion;
  }

  const normalizedPendingVersion = normalizeVersion(pendingVersion);

  if (Number.isFinite(normalizedPendingVersion)) {
    return normalizedPendingVersion;
  }

  const normalizedNativeVersion = normalizeVersion(nativeVersion);

  return Number.isFinite(normalizedNativeVersion) ? normalizedNativeVersion : 0;
}

module.exports = {
  normalizeVersion,
  resolveCurrentVersion,
};
