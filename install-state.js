const INSTALL_STATES = Object.freeze({
  AVAILABLE: "available",
  DOWNLOADING: "downloading",
  DOWNLOADED: "downloaded",
  INSTALLING: "installing",
  PENDING_READY: "pending-ready",
  READY: "ready",
  FAILED: "failed",
  ROLLED_BACK: "rolled-back",
});

const transitions = {
  [INSTALL_STATES.AVAILABLE]: [INSTALL_STATES.DOWNLOADING, INSTALL_STATES.FAILED],
  [INSTALL_STATES.DOWNLOADING]: [INSTALL_STATES.DOWNLOADED, INSTALL_STATES.FAILED],
  [INSTALL_STATES.DOWNLOADED]: [INSTALL_STATES.INSTALLING, INSTALL_STATES.FAILED],
  [INSTALL_STATES.INSTALLING]: [INSTALL_STATES.PENDING_READY, INSTALL_STATES.FAILED],
  [INSTALL_STATES.PENDING_READY]: [INSTALL_STATES.READY, INSTALL_STATES.ROLLED_BACK],
  [INSTALL_STATES.READY]: [INSTALL_STATES.AVAILABLE],
  [INSTALL_STATES.FAILED]: [INSTALL_STATES.ROLLED_BACK, INSTALL_STATES.AVAILABLE],
  [INSTALL_STATES.ROLLED_BACK]: [INSTALL_STATES.AVAILABLE],
};

function normalizeInstallState(value, fallback = INSTALL_STATES.PENDING_READY) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(INSTALL_STATES).includes(normalized) ? normalized : fallback;
}

function canTransitionInstallState(from, to) {
  const source = normalizeInstallState(from, INSTALL_STATES.AVAILABLE);
  const target = normalizeInstallState(to, "");
  return source === target || transitions[source]?.includes(target) === true;
}

module.exports = {
  INSTALL_STATES,
  canTransitionInstallState,
  normalizeInstallState,
};
