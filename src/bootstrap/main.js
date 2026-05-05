import { AppKernel } from "../core/AppKernel.js";

const kernel = new AppKernel({
  root: document.querySelector("#app-root"),
  runtimeRoot: document.querySelector("#runtime-root"),
  editorRoot: document.querySelector("#editor-root"),
  minimapRoot: document.querySelector("#minimap-slot"),
  statusRoot: document.querySelector("#app-status"),
  titleRoot: document.querySelector("#app-title"),
  tourSelect: document.querySelector("#tour-select"),
  sceneSelect: document.querySelector("#scene-select"),
  downloadActiveTourButton: document.querySelector("#download-active-tour-button"),
  downloadActiveTourFeedbackRoot: document.querySelector("#download-active-tour-feedback"),
  downloadActiveTourFeedbackLabel: document.querySelector("#download-active-tour-feedback-label"),
  downloadActiveTourFeedbackCount: document.querySelector("#download-active-tour-feedback-count"),
  downloadActiveTourFeedbackBar: document.querySelector("#download-active-tour-feedback-bar"),
  xrDebugDownloadButton: document.querySelector("#xr-debug-download-button"),
  installButton: document.querySelector("#pwa-install-button"),
  badgesRoot: document.querySelector("#topbar-badges"),
  platformBadge: document.querySelector("#platform-badge"),
  webxrBadge: document.querySelector("#webxr-badge"),
  pwaBadge: document.querySelector("#pwa-badge"),
  serviceWorkerBadge: document.querySelector("#service-worker-badge"),
  inputBadge: document.querySelector("#input-badge"),
  standaloneBadge: document.querySelector("#standalone-badge"),
  uiItems: Array.from(document.querySelectorAll("[data-ui-item]")),
  platformButtons: Array.from(document.querySelectorAll("[data-platform-switch]"))
});

window.__WPA360__ = {
  kernel,
  getState: () => kernel.store.getSnapshot(),
  getRenderer: () => kernel.context.getActiveRenderer?.() ?? null,
  getDebugSnapshot: () => kernel.getDebugSnapshot(),
  xrDebug: {
    enabled: kernel.xrDebug?.isEnabled?.() ?? false,
    dump: () => kernel.xrDebug?.dump?.() ?? null,
    dumpVerbose: () => kernel.xrDebug?.dumpVerbose?.() ?? null,
    clear: () => kernel.xrDebug?.clear?.() ?? null,
    lastTransition: () => kernel.xrDebug?.lastTransition?.() ?? null
  }
};

kernel.start().catch((error) => {
  console.error("[WPA360] boot failed", error);
  const status = document.querySelector("#app-status");
  if (status) {
    status.textContent = `Boot failed: ${error.message}`;
    status.classList.remove("is-hidden");
  }
});
