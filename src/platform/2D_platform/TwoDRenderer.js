import { ThreePanoramaRenderer } from "../../shared/ThreePanoramaRenderer.js";

export class TwoDRenderer {
  constructor({ root, cfgProvider, assetCache, context = null }) {
    this.root = root;
    this.cfgProvider = cfgProvider;
    this.assetCache = assetCache;
    this.context = context;
    this.listeners = new Set();
    this.view = {
      yaw: 0,
      pitch: 0,
      fov: 86
    };
    this.appliedSceneYaw = 0;
    this.lastSceneId = null;
    this.lastSceneSrc = "";
    this.interactionLocked = false;
    this.sceneTransitionOverlayActive = false;
    this.sceneTransitionFadeToken = 0;

    this.stage = document.createElement("div");
    this.stage.className = "twod-stage";
    this.stage.setAttribute("aria-label", "2D virtual tour viewport");

    this.panorama = document.createElement("div");
    this.panorama.className = "twod-panorama";
    this.panorama.setAttribute("aria-hidden", "true");
    this.panoramaRenderer = new ThreePanoramaRenderer({
      root: this.panorama,
      assetCache: this.assetCache,
      xrDebug: this.context?.xrDebug ?? null,
      previewMode: "mono",
      xrEnabled: false
    });

    this.unsubscribeFrame = this.panoramaRenderer.onFrame(() => {
      for (const listener of this.listeners) {
        listener(this.getView());
      }
    });

    this.hotspotLayer = document.createElement("div");
    this.hotspotLayer.className = "hotspot-layer";

    this.sceneTransitionOverlay = document.createElement("canvas");
    this.sceneTransitionOverlay.className = "twod-scene-transition-overlay";
    this.sceneTransitionOverlay.hidden = true;
    this.sceneTransitionOverlay.setAttribute("aria-hidden", "true");

    this.caption = document.createElement("section");
    this.caption.className = "scene-caption";

    this.stage.append(this.panorama, this.sceneTransitionOverlay, this.hotspotLayer, this.caption);
    this.root.append(this.stage);
  }

  async showScene(scene, tour, options = {}) {
    this.interactionLocked = true;
    const cfg = this.cfgProvider();
    const platformCfg = cfg?.platform?.two_d ?? {};
    const nextSceneId = scene?.id ?? null;
    const nextSceneSrc = scene?.media?.src ?? "";
    const shouldPreserveView =
      Boolean(nextSceneId)
      && nextSceneId === this.lastSceneId
      && nextSceneSrc === this.lastSceneSrc;
    const hasExplicitEntryYaw = Number.isFinite(Number(options?.entryYaw));
    const preserveOrientation = options?.preserveOrientation === true
      || (!hasExplicitEntryYaw && options?.preserveOrientation == null && scene?.scene_global_yaw === false);
    const nextSceneYaw = hasExplicitEntryYaw
      ? Number(options.entryYaw)
      : (scene?.scene_global_yaw !== false ? Number(scene?.rotation?.yaw ?? 0) : 0);
    const shouldUseSnapshotTransition = this.shouldUseSnapshotTransition(options, nextSceneSrc);

    if (!shouldPreserveView) {
      this.view.fov = Number(platformCfg.default_fov ?? this.view.fov);
      if (preserveOrientation) {
        const effectiveYaw = wrapDegrees(this.view.yaw + this.appliedSceneYaw);
        this.view.yaw = wrapDegrees(effectiveYaw - nextSceneYaw);
      } else {
        this.view.yaw = 0;
        this.view.pitch = 0;
      }
    }

    await this.prepareSceneTransitionVisual({
      enabled: shouldUseSnapshotTransition,
      nextSceneSrc
    });

    const sceneTransition = await this.panoramaRenderer.setScene(scene, {
      eye: scene.media?.mono_eye ?? "left",
      entryYawOverride: hasExplicitEntryYaw ? nextSceneYaw : null,
      preserveCurrentTextureUntilNextReady: shouldUseSnapshotTransition
    });
    this.appliedSceneYaw = nextSceneYaw;

    this.lastSceneId = nextSceneId;
    this.lastSceneSrc = nextSceneSrc;

    if (scene.media?.src && scene.media_available !== false) {
      this.panorama.classList.remove("is-empty");
    } else {
      this.panorama.classList.add("is-empty");
    }

    this.caption.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = scene.title ?? scene.id;
    const help = document.createElement("p");
    help.textContent = "Drag to look around. Select a hotspot to move between scenes.";
    this.caption.append(title, help);

    this.applyView();
    return sceneTransition;
  }

  setInteractionLocked(locked) {
    this.interactionLocked = locked === true;
    this.stage.classList.toggle("is-interaction-locked", this.interactionLocked);
  }

  isInteractionLocked() {
    return this.interactionLocked === true;
  }

  pan(deltaX, deltaY, pointerType = "mouse") {
    const cfg = this.cfgProvider();
    const platformCfg = cfg?.platform?.two_d ?? {};
    const sensitivity = pointerType === "touch"
      ? Number(platformCfg.touch_sensitivity ?? 0.18)
      : Number(platformCfg.mouse_sensitivity ?? 0.12);

    this.view.yaw = wrapDegrees(this.view.yaw - deltaX * sensitivity);
    this.view.pitch = clamp(this.view.pitch + deltaY * sensitivity, -42, 42);
    this.applyView();
  }

  zoom(delta) {
    const cfg = this.cfgProvider();
    const platformCfg = cfg?.platform?.two_d ?? {};
    const minFov = Number(platformCfg.min_fov ?? 55);
    const maxFov = Number(platformCfg.max_fov ?? 112);
    this.view.fov = clamp(this.view.fov + delta, minFov, maxFov);
    this.applyView();
  }

  setDragging(isDragging) {
    this.stage.classList.toggle("is-dragging", isDragging);
  }

  projectWorldToScreen(position) {
    return this.panoramaRenderer.projectWorldToScreen(position, this.stage, "center");
  }

  projectBillboardOrientation(position, rotation) {
    return this.panoramaRenderer.projectBillboardOrientationToScreen(position, rotation, this.stage, "center");
  }

  screenToWorldFromEvent(event, { depth = 8 } = {}) {
    const position = this.panoramaRenderer.screenToWorld(event, this.stage, depth, "center");
    this.context?.debugLog?.("editor:twod-renderer:screen-to-world", {
      clientX: Number(event?.clientX ?? 0),
      clientY: Number(event?.clientY ?? 0),
      depth: Number(depth ?? 0),
      view: this.getView(),
      position: position ?? null,
      sceneId: this.lastSceneId,
      sceneSrc: this.lastSceneSrc
    });
    return position;
  }

  getView() {
    return { ...this.view };
  }

  onViewChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPerformanceSnapshot() {
    return this.panoramaRenderer.getPerformanceSnapshot();
  }

  getRenderResourceStats() {
    return this.panoramaRenderer.getRenderResourceStats();
  }

  async preloadSceneTextures(scenes = []) {
    return this.panoramaRenderer.preloadSceneTextures(scenes);
  }

  compactSceneResources(scene) {
    const preserveSrcs = [scene?.media?.src, scene?.minimap_image].filter(Boolean);
    this.panoramaRenderer.setPinnedTextureSources(preserveSrcs);
    this.panoramaRenderer.evictTextures(preserveSrcs);
    this.assetCache?.setPinnedImages?.(preserveSrcs);
    this.assetCache?.trimImageCache?.({
      preserveUrls: preserveSrcs,
      maxEntries: Math.max(2, preserveSrcs.length)
    });
  }

  waitForScenePresentation(transitionId) {
    return this.panoramaRenderer.waitForScenePresentation(transitionId);
  }

  getCurrentSceneTransition() {
    return this.panoramaRenderer.getCurrentSceneTransition();
  }

  async completeSceneTransitionVisual() {
    if (!this.sceneTransitionOverlayActive) {
      this.clearSceneTransitionVisual();
      return;
    }

    const fadeToken = ++this.sceneTransitionFadeToken;
    const overlay = this.sceneTransitionOverlay;

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        overlay.removeEventListener("transitionend", handleTransitionEnd);
        clearTimeout(timeoutId);
        resolve();
      };
      const handleTransitionEnd = (event) => {
        if (event.target === overlay && event.propertyName === "opacity") {
          finish();
        }
      };
      const timeoutId = window.setTimeout(finish, 320);

      overlay.addEventListener("transitionend", handleTransitionEnd);
      window.requestAnimationFrame(() => {
        if (fadeToken !== this.sceneTransitionFadeToken || !this.sceneTransitionOverlayActive) {
          finish();
          return;
        }
        overlay.classList.add("is-fading-out");
      });
    });

    if (fadeToken === this.sceneTransitionFadeToken) {
      this.clearSceneTransitionVisual();
    }
  }

  cancelSceneTransitionVisual() {
    this.sceneTransitionFadeToken += 1;
    this.clearSceneTransitionVisual();
  }

  applyView() {
    this.panoramaRenderer.render({
      yaw: this.view.yaw,
      pitch: this.view.pitch,
      fov: this.view.fov
    });
  }

  destroy() {
    this.listeners.clear();
    this.unsubscribeFrame?.();
    this.cancelSceneTransitionVisual();
    this.panoramaRenderer.destroy();
    this.stage.remove();
  }

  shouldUseSnapshotTransition(options, nextSceneSrc) {
    return options?.transitionMode === "hotspot-snapshot"
      && Boolean(this.lastSceneSrc)
      && Boolean(nextSceneSrc)
      && nextSceneSrc !== this.lastSceneSrc;
  }

  async prepareSceneTransitionVisual({ enabled, nextSceneSrc }) {
    this.sceneTransitionFadeToken += 1;
    const fadeToken = this.sceneTransitionFadeToken;

    if (!enabled) {
      this.clearSceneTransitionVisual();
      return false;
    }

    const snapshotUrl = this.createSceneTransitionSnapshot();

    if (!snapshotUrl || nextSceneSrc === this.lastSceneSrc) {
      this.clearSceneTransitionVisual();
      return false;
    }

    const overlay = this.sceneTransitionOverlay;
    this.drawSceneTransitionSnapshot(snapshotUrl);
    overlay.classList.remove("is-fading-out");
    overlay.hidden = false;

    if (fadeToken !== this.sceneTransitionFadeToken) {
      return false;
    }

    await waitForPaintCommit(2);
    if (fadeToken !== this.sceneTransitionFadeToken) {
      return false;
    }

    this.sceneTransitionOverlay.hidden = false;
    this.sceneTransitionOverlayActive = true;
    return true;
  }

  clearSceneTransitionVisual() {
    this.sceneTransitionOverlayActive = false;
    this.sceneTransitionOverlay.hidden = true;
    this.sceneTransitionOverlay.classList.remove("is-fading-out");
    const overlay = this.sceneTransitionOverlay;
    const context = overlay.getContext("2d");
    context?.clearRect(0, 0, overlay.width, overlay.height);
  }

  createSceneTransitionSnapshot() {
    const attempts = [
      { maxWidth: 2048 },
      { maxWidth: 1600 },
      { maxWidth: 1280 }
    ];

    for (const attempt of attempts) {
      const snapshotCanvas = this.panoramaRenderer.captureSnapshot(attempt);
      if (snapshotCanvas) {
        return snapshotCanvas;
      }
    }

    return null;
  }

  drawSceneTransitionSnapshot(snapshotCanvas) {
    const overlay = this.sceneTransitionOverlay;
    const context = overlay.getContext("2d", { alpha: false });
    const width = Math.max(1, Math.floor(this.stage.clientWidth || this.stage.getBoundingClientRect().width || snapshotCanvas.width || 1));
    const height = Math.max(1, Math.floor(this.stage.clientHeight || this.stage.getBoundingClientRect().height || snapshotCanvas.height || 1));

    if (!context || width <= 0 || height <= 0) {
      return;
    }

    if (overlay.width !== width) {
      overlay.width = width;
    }
    if (overlay.height !== height) {
      overlay.height = height;
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(snapshotCanvas, 0, 0, width, height);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function waitForPaintCommit(frameCount = 1) {
  const safeFrameCount = Math.max(1, Number(frameCount) || 1);
  let pending = Promise.resolve();
  for (let index = 0; index < safeFrameCount; index += 1) {
    pending = pending.then(() => new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    }));
  }
  return pending;
}
