import { t } from "./i18n.js";
import { syncIndicator, statusMessage, refreshBtn } from "./dom.js";
import { state } from "./state.js";

let lastUpdatedAt = null;
let lastUpdatedTimer = null;

export function setSyncIndicatorState(stateKey, tooltipText) {
  if (!syncIndicator) return;
  syncIndicator.dataset.state = stateKey;
  if (tooltipText) {
    syncIndicator.title = tooltipText;
    syncIndicator.setAttribute("aria-label", tooltipText);
  }
}

export function updateSyncIndicatorTooltip(text) {
  if (!syncIndicator) return;
  const tooltip = `${t("ui.lastUpdated")}: ${text}\nClick to refresh now`;
  syncIndicator.title = tooltip;
  syncIndicator.setAttribute("aria-label", tooltip);
}

export function refreshLastUpdatedLabel() {
  const el = document.getElementById("last-updated");
  if (!el || !lastUpdatedAt) return;
  const seconds = Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let relative = "";
  if (seconds < 60) {
    relative = `${seconds}s ago`;
  } else if (minutes < 60) {
    relative = `${minutes}m ago`;
  } else {
    relative = `${hours}h ago`;
  }

  el.textContent = relative;
  updateSyncIndicatorTooltip(relative);
}

export function updateTimestamp() {
  lastUpdatedAt = new Date();
  refreshLastUpdatedLabel();
  if (lastUpdatedTimer) clearInterval(lastUpdatedTimer);
  lastUpdatedTimer = setInterval(refreshLastUpdatedLabel, 1000);
}

export function toggleLoading(isLoading) {
  if (refreshBtn) {
    refreshBtn.disabled = isLoading;
    refreshBtn.textContent = isLoading ? t("ui.loading") : t("ui.updateNow");
  }
  if (isLoading) {
    const stateKey = state.lastError ? "error-sync" : "syncing";
    setSyncIndicatorState(stateKey, syncIndicator?.title);
  } else {
    setSyncIndicatorState(state.lastError ? "error" : "ok", syncIndicator?.title);
  }
}

export function setStatus(message, isError = false) {
  if (!statusMessage) return;
  const panel = statusMessage.closest(".status-panel");

  if (!isError) {
    if (panel) panel.style.display = "none";
    return;
  }

  const isErrorMsg = typeof message === "string";

  if (
    message &&
    (message.includes("Data updated (Season") || message.includes("資料已更新"))
  ) {
    message = "";
  }

  statusMessage.textContent = message;
  statusMessage.classList.add("error");
  if (isErrorMsg) {
    statusMessage.style.display = "";
  }
  state.lastError = isError ? true : state.lastError;
  if (panel) panel.style.display = "";
}
