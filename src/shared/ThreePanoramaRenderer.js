import * as THREE from "../../vendor/three/three.module.js";

const DEFAULT_VIEW = {
  yaw: 0,
  pitch: 0,
  fov: 86
};
const DEFAULT_MAX_TEXTURE_ENTRIES = 6;
const DEFAULT_MAX_TEXTURE_ENTRIES_2D = 1;

export class ThreePanoramaRenderer {
  constructor({
    root,
    assetCache,
    xrDebug = null,
    previewMode = "mono",
    xrEnabled = false
  }) {
    this.root = root;
    this.assetCache = assetCache;
    this.xrDebug = xrDebug;
    this.previewMode = previewMode;
    this.xrEnabled = xrEnabled;
    this.listeners = new Set();
    this.sceneStatusListeners = new Set();
    this.frameWaiters = [];
    this.textureCache = new Map();
    this.pinnedTextureSrcs = new Set();
    this.currentSceneSrc = "";
    this.currentTextureSrc = "";
    this.sceneTransitionCounter = 0;
    this.sceneTransitionRecords = new Map();
    this.activeSceneTransitionId = null;
    this.pendingScenePresentation = null;
    this.maxTextureEntries = xrEnabled
      ? DEFAULT_MAX_TEXTURE_ENTRIES
      : DEFAULT_MAX_TEXTURE_ENTRIES_2D;
    this.view = { ...DEFAULT_VIEW };
    this.baseRotation = { yaw: 0, pitch: 0, roll: 0 };
    this.runtimeRotationOffset = { yaw: 0, pitch: 0, roll: 0 };
    this.contentOffset = new THREE.Vector3();
    this.renderStats = {
      mode: "idle",
      frameCount: 0,
      lastFrameTimeMs: 0,
      lastFrameSource: "none"
    };
    this.tempVectors = {
      worldPosition: new THREE.Vector3(),
      worldXAxis: new THREE.Vector3(),
      worldYAxis: new THREE.Vector3(),
      cameraPosition: new THREE.Vector3(),
      sceneCameraPosition: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
      sceneDirection: new THREE.Vector3(),
      toWorldPosition: new THREE.Vector3(),
      unprojectPoint: new THREE.Vector3(),
      headPosition: new THREE.Vector3(),
      scenePosition: new THREE.Vector3()
    };
    this.tempQuaternions = {
      billboardOrientation: new THREE.Quaternion(),
      billboardOffset: new THREE.Quaternion()
    };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#102a31");

    this.contentRoot = new THREE.Group();
    this.contentRoot.rotation.order = "YXZ";
    this.scene.add(this.contentRoot);

    this.orientationProbe = new THREE.Object3D();
    this.orientationProbe.visible = false;
    this.contentRoot.add(this.orientationProbe);

    this.trackedInputRoot = new THREE.Group();
    this.trackedInputRoot.name = "wpa360-tracked-input-root";
    this.scene.add(this.trackedInputRoot);

    this.camera = new THREE.PerspectiveCamera(this.view.fov, 1, 0.1, 2000);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.stereoCamera = new THREE.StereoCamera();
    this.stereoCamera.aspect = 0.5;
    this.cameraStateVersion = 0;
    this.stereoCameraVersion = -1;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.xr.enabled = xrEnabled;
    this.renderer.xr.setReferenceSpaceType?.("local");
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, xrEnabled ? 1.25 : 1.5));
    this.renderer.domElement.className = "three-panorama-canvas";
    this.root.append(this.renderer.domElement);

    if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.geometry = new THREE.SphereGeometry(500, 96, 64);
    this.geometry.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.FrontSide,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.applyTextureCrop(camera);
    };
    this.contentRoot.add(this.mesh);

    this.handleSessionEnd = this.handleSessionEnd.bind(this);
    this.handleXRVisibilityChange = this.handleXRVisibilityChange.bind(this);
    this.handleAnimationFrame = this.handleAnimationFrame.bind(this);
    this.handleXRAnimationFrame = this.handleXRAnimationFrame.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);

    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.onResizeObserved())
      : null;
    this.resizeObserver?.observe(this.root);
    window.addEventListener("resize", this.onWindowResize);
    this.resizeIfNeeded(true);
    this.requestRender("init");
  }

  async setScene(scene, { eye = "left", entryYawOverride = null, preserveCurrentTextureUntilNextReady = false } = {}) {
    this.activeScene = scene ?? null;
    this.stereoLayout = normalizeStereoLayout(scene?.media?.stereo_layout);
    this.eyeOrder = normalizeEyeOrder(scene?.media?.eye_order);
    this.monoEye = eye || scene?.media?.mono_eye || "left";
    this.flipHorizontally = scene?.media?.flip_horizontally === true || scene?.flip_horizontally === true;
    const hasEntryYawOverride = Number.isFinite(Number(entryYawOverride));
    this.baseRotation = {
      yaw: hasEntryYawOverride
        ? Number(entryYawOverride)
        : (scene?.scene_global_yaw !== false ? Number(scene?.rotation?.yaw ?? 0) : 0),
      pitch: Number(scene?.rotation?.pitch ?? 0),
      roll: Number(scene?.rotation?.roll ?? 0)
    };
    this.runtimeRotationOffset = { yaw: 0, pitch: 0, roll: 0 };
    this.applyContentTransform();

    const src = scene?.media_available === false ? "" : scene?.media?.src ?? "";
    const transition = this.beginSceneTransition(scene, src);
    this.xrDebug?.log("scene-transition-begin", {
      transitionId: transition.transitionId,
      sceneId: transition.sceneId,
      src: transition.src,
      details: {
        stereoLayout: this.stereoLayout,
        eyeOrder: this.eyeOrder,
        presenting: this.isPresenting()
      }
    });
    if (!src) {
      this.currentSceneSrc = "";
      this.setTexture(null, "");
      this.clearTextureCache();
      this.root.classList.add("is-empty");
      this.notifySceneStatus({
        state: "scene-cleared",
        transitionId: transition.transitionId,
        sceneId: scene?.id ?? null,
        src: null
      });
      this.settleSceneTransition(transition, {
        state: "scene-cleared",
        presented: false
      });
      this.requestRender("scene-cleared");
      return transition;
    }

    if (this.currentSceneSrc === src && this.material.map) {
      this.root.classList.remove("is-empty");
      this.notifySceneStatus({
        state: "scene-updated",
        transitionId: transition.transitionId,
        sceneId: scene?.id ?? null,
        src
      });
      this.queueScenePresentation(transition);
      this.requestRender("scene-updated");
      return transition;
    }

    this.notifySceneStatus({
      state: "loading-start",
      transitionId: transition.transitionId,
      sceneId: scene?.id ?? null,
      src
    });

    if (this.shouldUseAggressiveSceneSwap(scene, src) && preserveCurrentTextureUntilNextReady !== true) {
      this.releaseCurrentTextureForSwap(src);
      if (this.isPresenting()) {
        this.xrDebug?.log("scene-transition-placeholder-flush-skipped", {
          transitionId: transition.transitionId,
          sceneId: transition.sceneId,
          src: transition.src,
          details: {
            presenting: true,
            reason: "immersive-xr"
          }
        });
      } else {
        await this.flushVisualUpdate({ frames: 1, reason: "scene-transition-placeholder" });
      }
    }

    const token = Symbol(transition.transitionId);
    this.pendingTextureToken = token;
    const loadedAsset = await this.assetCache.loadImage(src, {
      optional: true,
      transitionId: transition.transitionId,
      sceneId: transition.sceneId
    });
    if (this.pendingTextureToken !== token || this.activeSceneTransitionId !== transition.transitionId) {
      this.settleSceneTransition(transition, {
        state: "scene-superseded",
        presented: false
      });
      return transition;
    }

    if (!loadedAsset) {
      this.currentSceneSrc = "";
      this.setTexture(null, "");
      this.clearTextureCache();
      this.root.classList.add("is-empty");
      this.notifySceneStatus({
        state: "scene-missing-texture",
        transitionId: transition.transitionId,
        sceneId: scene?.id ?? null,
        src
      });
      this.settleSceneTransition(transition, {
        state: "scene-missing-texture",
        presented: false
      });
      this.requestRender("scene-missing-texture");
      return transition;
    }

    this.root.classList.remove("is-empty");
    this.currentSceneSrc = src;
    this.setTexture(this.getOrCreateTexture(loadedAsset, scene, transition), src, transition);
    this.evictTextures([src]);
    this.notifySceneStatus({
      state: "texture-ready",
      transitionId: transition.transitionId,
      sceneId: scene?.id ?? null,
      src
    });
    this.queueScenePresentation(transition);
    this.requestRender("scene-texture-ready");
    return transition;
  }

  render({ yaw = 0, pitch = 0, fov = 86 } = {}) {
    this.view = {
      yaw: Number(yaw) || 0,
      pitch: Number(pitch) || 0,
      fov: Number(fov) || DEFAULT_VIEW.fov
    };
    this.applyManualCameraView();
    this.requestRender("view-change");
  }

  setPreviewMode(previewMode = "mono") {
    const nextMode = previewMode === "stereo" ? "stereo" : "mono";
    if (nextMode === this.previewMode) {
      return;
    }
    this.previewMode = nextMode;
    this.requestRender("preview-mode-change");
  }

  setContentCompensation(offset = { x: 0, y: 0, z: 0 }) {
    const nextX = Number(offset?.x ?? 0);
    const nextY = Number(offset?.y ?? 0);
    const nextZ = Number(offset?.z ?? 0);

    if (
      this.contentOffset.x === nextX
      && this.contentOffset.y === nextY
      && this.contentOffset.z === nextZ
    ) {
      return;
    }

    this.contentOffset.set(nextX, nextY, nextZ);
    this.applyContentTransform();
    this.contentRoot.updateMatrixWorld(true);

    if (!this.isPresenting()) {
      this.requestRender("content-compensation");
    }
  }

  setRuntimeRotationOffset(offset = { yaw: 0, pitch: 0, roll: 0 }) {
    const nextYaw = Number(offset?.yaw ?? 0);
    const nextPitch = Number(offset?.pitch ?? 0);
    const nextRoll = Number(offset?.roll ?? 0);

    if (
      this.runtimeRotationOffset.yaw === nextYaw
      && this.runtimeRotationOffset.pitch === nextPitch
      && this.runtimeRotationOffset.roll === nextRoll
    ) {
      return;
    }

    this.runtimeRotationOffset = {
      yaw: nextYaw,
      pitch: nextPitch,
      roll: nextRoll
    };
    this.applyContentTransform();
    this.contentRoot.updateMatrixWorld(true);

    if (!this.isPresenting()) {
      this.requestRender("runtime-rotation-offset");
    }
  }

  onFrame(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onSceneStatusChange(listener) {
    this.sceneStatusListeners.add(listener);
    return () => this.sceneStatusListeners.delete(listener);
  }

  waitForScenePresentation(transitionId) {
    if (!transitionId) {
      return Promise.resolve(null);
    }

    const record = this.sceneTransitionRecords.get(transitionId);
    if (!record) {
      return Promise.resolve(null);
    }

    if (record.settled) {
      return Promise.resolve(record.result);
    }

    return new Promise((resolve) => {
      record.waiters.push(resolve);
    });
  }

  getCurrentSceneTransition() {
    return this.activeSceneTransitionId
      ? this.sceneTransitionRecords.get(this.activeSceneTransitionId)?.metadata ?? null
      : null;
  }

  getPerformanceSnapshot() {
    return {
      ...this.renderStats,
      presenting: this.isPresenting(),
      previewMode: this.previewMode,
      queuedNonXrFrame: Boolean(this.rafHandle),
      textureCacheSize: this.textureCache.size,
      pinnedTextureCount: this.pinnedTextureSrcs.size,
      rendererMemory: this.getRendererMemorySnapshot()
    };
  }

  getRenderResourceStats() {
    return {
      textureCacheSize: this.textureCache.size,
      pinnedTextureCount: this.pinnedTextureSrcs.size,
      currentSceneSrc: this.currentSceneSrc || null,
      currentTextureSrc: this.currentTextureSrc || null,
      rendererMemory: this.getRendererMemorySnapshot()
    };
  }

  captureSnapshot({ maxWidth = 960 } = {}) {
    const sourceCanvas = this.renderer?.domElement;
    if (!sourceCanvas) {
      return null;
    }

    const sourceWidth = Number(sourceCanvas.width ?? sourceCanvas.clientWidth ?? 0);
    const sourceHeight = Number(sourceCanvas.height ?? sourceCanvas.clientHeight ?? 0);
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const targetWidth = Math.max(1, Math.min(sourceWidth, Math.round(Number(maxWidth) || 960)));
    const targetHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * targetWidth));
    const snapshotCanvas = document.createElement("canvas");
    snapshotCanvas.width = targetWidth;
    snapshotCanvas.height = targetHeight;

    const context = snapshotCanvas.getContext("2d", { alpha: false });
    if (!context) {
      return null;
    }

    try {
      this.resizeIfNeeded();
      this.applyManualCameraView();
      this.applyContentTransform();
      this.scene.updateMatrixWorld(true);

      const renderTarget = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
        depthBuffer: false,
        stencilBuffer: false,
        colorSpace: this.renderer.outputColorSpace ?? THREE.SRGBColorSpace
      });
      const pixelBuffer = new Uint8Array(targetWidth * targetHeight * 4);
      const previousTarget = this.renderer.getRenderTarget();
      const previousScissorTest = this.renderer.getScissorTest();
      const previousViewport = new THREE.Vector4();
      const previousScissor = new THREE.Vector4();

      this.renderer.getViewport(previousViewport);
      this.renderer.getScissor(previousScissor);
      try {
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, targetWidth, targetHeight);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, targetWidth, targetHeight, pixelBuffer);
      } finally {
        this.renderer.setRenderTarget(previousTarget);
        this.renderer.setViewport(previousViewport.x, previousViewport.y, previousViewport.z, previousViewport.w);
        this.renderer.setScissor(previousScissor.x, previousScissor.y, previousScissor.z, previousScissor.w);
        this.renderer.setScissorTest(previousScissorTest);
        renderTarget.dispose();
      }

      const imageData = context.createImageData(targetWidth, targetHeight);
      const rowSize = targetWidth * 4;
      for (let y = 0; y < targetHeight; y += 1) {
        const sourceOffset = (targetHeight - y - 1) * rowSize;
        const targetOffset = y * rowSize;
        imageData.data.set(pixelBuffer.subarray(sourceOffset, sourceOffset + rowSize), targetOffset);
      }
      context.putImageData(imageData, 0, 0);
      return snapshotCanvas;
    } catch {
      try {
        context.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
        return snapshotCanvas;
      } catch {
        return null;
      }
    }
  }

  async preloadSceneTextures(scenes = []) {
    const uniqueScenes = [];
    const seenSources = new Set();
    for (const scene of scenes ?? []) {
      const src = scene?.media?.src;
      if (!src) {
        continue;
      }
      const normalizedSrc = this.assetCache?.normalizeUrl?.(src) ?? src;
      if (seenSources.has(normalizedSrc)) {
        continue;
      }
      seenSources.add(normalizedSrc);
      uniqueScenes.push(scene);
    }
    const sources = uniqueScenes.map((scene) => this.assetCache?.normalizeUrl?.(scene?.media?.src) ?? scene?.media?.src);
    this.setPinnedTextureSources(sources);

    const preloadResults = [];
    for (const scene of uniqueScenes) {
      const src = this.assetCache?.normalizeUrl?.(scene?.media?.src) ?? scene?.media?.src;
      const loadedAsset = await this.assetCache.loadImage(src, { optional: true });
      if (!loadedAsset) {
        preloadResults.push({ src, status: "missing" });
        continue;
      }

      const texture = this.getOrCreateTexture(loadedAsset, scene);
      this.renderer.initTexture?.(texture);
      preloadResults.push({ src: loadedAsset.src, status: "ready" });
      if (isStereoScene(scene)) {
        await this.waitForNextRenderFrame();
      }
    }

    this.evictTextures(sources);
    return preloadResults;
  }

  getBaseCamera() {
    return this.camera;
  }

  notifySceneStatus(event) {
    if (event?.state) {
      this.xrDebug?.log(event.state, {
        transitionId: event.transitionId ?? null,
        sceneId: event.sceneId ?? null,
        src: event.src ?? null,
        details: {
          frameSource: event.frameSource ?? null
        }
      });
    }
    for (const listener of this.sceneStatusListeners) {
      listener(event);
    }
  }

  beginSceneTransition(scene, src) {
    if (this.activeSceneTransitionId) {
      this.settleSceneTransition(this.activeSceneTransitionId, {
        state: "scene-superseded",
        presented: false
      });
    }

    const transition = {
      transitionId: `scene-transition-${++this.sceneTransitionCounter}`,
      sceneId: scene?.id ?? null,
      src: src || null
    };
    this.activeSceneTransitionId = transition.transitionId;
    this.sceneTransitionRecords.set(transition.transitionId, {
      metadata: transition,
      settled: false,
      result: null,
      waiters: []
    });
    return transition;
  }

  queueScenePresentation(transition) {
    this.pendingScenePresentation = { ...transition };
  }

  settleSceneTransition(transitionOrId, result = {}) {
    const transitionId = typeof transitionOrId === "string"
      ? transitionOrId
      : transitionOrId?.transitionId;
    if (!transitionId) {
      return null;
    }

    const record = this.sceneTransitionRecords.get(transitionId);
    if (!record) {
      return null;
    }

    if (record.settled) {
      return record.result;
    }

    const finalResult = {
      ...record.metadata,
      ...result
    };
    record.settled = true;
    record.result = finalResult;

    if (
      finalResult.state
      && finalResult.state !== "scene-presented"
      && finalResult.state !== "scene-cleared"
      && finalResult.state !== "scene-missing-texture"
    ) {
      this.xrDebug?.log(finalResult.state, {
        transitionId,
        sceneId: finalResult.sceneId ?? null,
        src: finalResult.src ?? null,
        details: {
          presented: finalResult.presented === true,
          frameSource: finalResult.frameSource ?? null
        }
      });
    }

    for (const resolve of record.waiters) {
      resolve(finalResult);
    }
    record.waiters.length = 0;

    if (this.pendingScenePresentation?.transitionId === transitionId) {
      this.pendingScenePresentation = null;
    }

    this.pruneSceneTransitionRecords();
    return finalResult;
  }

  presentPendingSceneTransition(frameState) {
    const pending = this.pendingScenePresentation;
    if (!pending) {
      return;
    }

    if (pending.transitionId !== this.activeSceneTransitionId) {
      this.settleSceneTransition(pending, {
        state: "scene-superseded",
        presented: false
      });
      return;
    }

    if (!this.material.map) {
      return;
    }

    const currentSrc = this.currentSceneSrc || this.currentTextureSrc || null;
    if (pending.src && currentSrc && pending.src !== currentSrc && pending.src !== this.currentTextureSrc) {
      return;
    }

    this.notifySceneStatus({
      state: "scene-presented",
      transitionId: pending.transitionId,
      sceneId: pending.sceneId ?? null,
      src: pending.src ?? currentSrc,
      frameSource: frameState?.source ?? "unknown"
    });
    this.settleSceneTransition(pending, {
      state: "scene-presented",
      presented: true,
      frameSource: frameState?.source ?? "unknown"
    });
  }

  pruneSceneTransitionRecords(maxSettledEntries = 24) {
    let settledCount = 0;
    for (const record of this.sceneTransitionRecords.values()) {
      if (record.settled) {
        settledCount += 1;
      }
    }

    if (settledCount <= maxSettledEntries) {
      return;
    }

    for (const [transitionId, record] of this.sceneTransitionRecords.entries()) {
      if (!record.settled) {
        continue;
      }

      this.sceneTransitionRecords.delete(transitionId);
      settledCount -= 1;
      if (settledCount <= maxSettledEntries) {
        break;
      }
    }
  }

  projectWorldToScreen(position, viewport = this.root, eye = "center") {
    const rect = viewport.getBoundingClientRect();
    const camera = this.getCameraForEye(eye);

    if (!camera || rect.width <= 0 || rect.height <= 0) {
      return hiddenProjection(rect);
    }

    this.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld?.(true);
    camera.updateProjectionMatrix?.();

    const worldPosition = this.sceneToWorld(position, this.tempVectors.worldPosition);
    const cameraPosition = this.tempVectors.cameraPosition;
    const cameraDirection = this.tempVectors.cameraDirection;
    const toWorldPosition = this.tempVectors.toWorldPosition;

    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraDirection);
    toWorldPosition.copy(worldPosition).sub(cameraPosition);

    const projected = worldPosition.clone().project(camera);
    const inFrontOfCamera = cameraDirection.dot(toWorldPosition) > 0;
    const visible = inFrontOfCamera
      && Number.isFinite(projected.x)
      && Number.isFinite(projected.y)
      && Number.isFinite(projected.z)
      && projected.z >= -1
      && projected.z <= 1
      && projected.x >= -1
      && projected.x <= 1
      && projected.y >= -1
      && projected.y <= 1;

    return {
      visible,
      inFrontOfCamera,
      x: (projected.x + 1) * 0.5 * rect.width,
      y: (1 - projected.y) * 0.5 * rect.height,
      depth: worldPosition.distanceTo(cameraPosition)
    };
  }

  projectBillboardOrientationToScreen(position, rotationOffset = {}, viewport = this.root, eye = "center") {
    const rect = viewport.getBoundingClientRect();
    const camera = this.getCameraForEye(eye);

    if (!camera || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld?.(true);
    camera.updateProjectionMatrix?.();

    const centerProjection = this.projectWorldToScreen(position, viewport, eye);
    if (!centerProjection.visible) {
      return null;
    }

    const cameraPosition = this.tempVectors.cameraPosition;
    const cameraDirection = this.tempVectors.cameraDirection;
    const worldPosition = this.sceneToWorld(position, this.tempVectors.worldPosition);
    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraDirection);

    const probe = this.orientationProbe;
    probe.position.set(
      Number(position?.x ?? 0),
      Number(position?.y ?? 0),
      Number(position?.z ?? -8)
    );
    probe.quaternion.identity();
    probe.lookAt(cameraPosition);
    probe.quaternion.multiply(
      quaternionFromRotation(rotationOffset, this.tempQuaternions.billboardOffset)
    );
    probe.updateMatrixWorld(true);

    const worldQuaternion = probe.getWorldQuaternion(this.tempQuaternions.billboardOrientation);
    const projectedXAxis = projectResolvedWorldToScreen(
      this.tempVectors.worldXAxis
        .set(0.75, 0, 0)
        .applyQuaternion(worldQuaternion)
        .add(worldPosition),
      rect,
      camera,
      cameraPosition,
      cameraDirection,
      this.tempVectors.toWorldPosition
    );
    const projectedYAxis = projectResolvedWorldToScreen(
      this.tempVectors.worldYAxis
        .set(0, 0.75, 0)
        .applyQuaternion(worldQuaternion)
        .add(worldPosition),
      rect,
      camera,
      cameraPosition,
      cameraDirection,
      this.tempVectors.toWorldPosition
    );

    if (!isProjectionUsable(projectedXAxis) || !isProjectionUsable(projectedYAxis)) {
      return null;
    }

    const xAxisVector = {
      x: projectedXAxis.x - centerProjection.x,
      y: projectedXAxis.y - centerProjection.y
    };
    const yAxisVector = {
      x: projectedYAxis.x - centerProjection.x,
      y: projectedYAxis.y - centerProjection.y
    };
    const xAxisLength = Math.hypot(xAxisVector.x, xAxisVector.y);
    const yAxisLength = Math.hypot(yAxisVector.x, yAxisVector.y);
    if (xAxisLength < 0.0001 || yAxisLength < 0.0001) {
      return null;
    }

    const normalizationFactor = Math.max(0.0001, (xAxisLength + yAxisLength) / 2);
    return {
      xAxis: {
        x: xAxisVector.x / normalizationFactor,
        y: xAxisVector.y / normalizationFactor
      },
      yAxis: {
        x: yAxisVector.x / normalizationFactor,
        y: yAxisVector.y / normalizationFactor
      }
    };
  }

  screenToWorld({ clientX, clientY }, viewport = this.root, depth = 8, eye = "center") {
    const rect = viewport.getBoundingClientRect();
    const camera = this.getCameraForEye(eye);

    if (!camera || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld?.(true);
    camera.updateProjectionMatrix?.();

    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const cameraPosition = this.tempVectors.cameraPosition;
    const sceneCameraPosition = this.tempVectors.sceneCameraPosition;
    const worldPoint = this.tempVectors.unprojectPoint.set(x, y, 0.5).unproject(camera);
    camera.getWorldPosition(cameraPosition);
    this.worldToScene(cameraPosition, sceneCameraPosition);

    const direction = worldPoint.sub(cameraPosition).normalize();
    const safeDepth = Math.max(0.1, Number(depth) || 8);
    const sceneDirection = this.tempVectors.sceneDirection
      .copy(cameraPosition)
      .add(direction);
    this.worldToScene(sceneDirection, sceneDirection);
    sceneDirection.sub(sceneCameraPosition).normalize();

    if (!Number.isFinite(sceneDirection.x) || !Number.isFinite(sceneDirection.y) || !Number.isFinite(sceneDirection.z)) {
      return null;
    }

    const scenePosition = this.tempVectors.scenePosition
      .copy(sceneCameraPosition)
      .addScaledVector(sceneDirection, safeDepth);

    return {
      x: scenePosition.x,
      y: scenePosition.y,
      z: scenePosition.z,
      depth: safeDepth
    };
  }

  sceneToWorld(position, target = new THREE.Vector3()) {
    target.set(
      Number(position?.x ?? 0),
      Number(position?.y ?? 0),
      Number(position?.z ?? -8)
    );
    return this.contentRoot.localToWorld(target);
  }

  worldToScene(position, target = new THREE.Vector3()) {
    target.copy(position);
    return this.contentRoot.worldToLocal(target);
  }

  getContentRoot() {
    return this.contentRoot;
  }

  getTrackedInputRoot() {
    return this.trackedInputRoot;
  }

  getXRController(index = 0) {
    return this.renderer.xr.getController(index);
  }

  getXRControllerGrip(index = 0) {
    return this.renderer.xr.getControllerGrip(index);
  }

  getXRHand(index = 0) {
    return this.renderer.xr.getHand(index);
  }

  getHeadPosition() {
    const camera = this.getCameraForEye("center");
    if (!camera) {
      return { x: 0, y: 0, z: 0 };
    }

    camera.getWorldPosition(this.tempVectors.headPosition);
    return {
      x: this.tempVectors.headPosition.x,
      y: this.tempVectors.headPosition.y,
      z: this.tempVectors.headPosition.z
    };
  }

  getCameraForEye(eye = "center") {
    if (this.renderer.xr.isPresenting) {
      const xrCamera = this.renderer.xr.getCamera(this.camera);
      if (xrCamera?.isArrayCamera) {
        const cameras = xrCamera.cameras ?? [];
        if (eye === "right") {
          return cameras[1] ?? cameras[0] ?? this.camera;
        }
        if (eye === "left") {
          return cameras[0] ?? this.camera;
        }
        return xrCamera;
      }
      return xrCamera ?? this.camera;
    }

    this.syncStereoCamera();

    if (this.previewMode === "stereo") {
      if (eye === "left") {
        return this.stereoCamera.cameraL;
      }
      if (eye === "right") {
        return this.stereoCamera.cameraR;
      }
    }

    return this.camera;
  }

  isPresenting() {
    return this.renderer.xr.isPresenting === true;
  }

  async enterImmersive({ userInitiated = false } = {}) {
    if (!this.xrEnabled || this.isPresenting()) {
      return {
        status: this.isPresenting() ? "already-presenting" : "xr-disabled"
      };
    }

    if (!navigator.xr?.requestSession) {
      return { status: "unsupported" };
    }

    if (!userInitiated) {
      const supported = await this.getImmersiveSupport();
      if (!supported) {
        return { status: "unsupported" };
      }
      return { status: "available-but-not-started" };
    }

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"]
      });
      session.addEventListener("end", this.handleSessionEnd);
      session.addEventListener?.("visibilitychange", this.handleXRVisibilityChange);
      this.xrSession = session;
      this.stopNonXrLoop();
      await this.renderer.xr.setSession(session);
      this.startXrLoop();
      return { status: "started" };
    } catch (error) {
      return {
        status: "error",
        error
      };
    }
  }

  async exitImmersive() {
    if (!this.xrSession) {
      return;
    }

    const session = this.xrSession;
    session.removeEventListener?.("end", this.handleSessionEnd);
    session.removeEventListener?.("visibilitychange", this.handleXRVisibilityChange);
    this.xrSession = null;
    await session.end();
    this.stopXrLoop();
    this.requestRender("xr-exit");
  }

  async getImmersiveSupport() {
    if (!this.xrSupportPromise) {
      if (!navigator.xr?.isSessionSupported) {
        this.xrSupportPromise = Promise.resolve(false);
      } else {
        this.xrSupportPromise = navigator.xr.isSessionSupported("immersive-vr")
          .catch(() => false);
      }
    }
    return this.xrSupportPromise;
  }

  destroy() {
    this.stopNonXrLoop();
    this.stopXrLoop();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    this.xrSession?.removeEventListener?.("end", this.handleSessionEnd);
    this.xrSession?.removeEventListener?.("visibilitychange", this.handleXRVisibilityChange);
    this.xrSession?.end?.().catch?.(() => {});
    this.xrSession = null;

    this.pinnedTextureSrcs.clear();
    this.clearTextureCache();
    this.listeners.clear();
    this.sceneStatusListeners.clear();
    this.flushFrameWaiters(this.isPresenting() ? "xr" : "raf", performance.now());
    this.pendingTextureToken = null;
    for (const transitionId of this.sceneTransitionRecords.keys()) {
      this.settleSceneTransition(transitionId, {
        state: "renderer-destroyed",
        presented: false
      });
    }
    this.sceneTransitionRecords.clear();
    this.pendingScenePresentation = null;
    this.activeSceneTransitionId = null;

    this.material.map = null;
    this.material.dispose();
    this.geometry.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  requestRender(reason = "update") {
    if (this.isPresenting()) {
      this.renderStats.lastFrameSource = `xr:${reason}`;
      return;
    }

    if (this.rafHandle) {
      this.renderStats.lastFrameSource = `queued:${reason}`;
      return;
    }

    this.renderStats.mode = "raf";
    this.renderStats.lastFrameSource = `raf:${reason}`;
    this.rafHandle = window.requestAnimationFrame(this.handleAnimationFrame);
  }

  handleAnimationFrame(timestamp) {
    this.rafHandle = 0;
    this.renderFrame({ timestamp, frame: null, source: "raf" });
  }

  handleXRAnimationFrame(timestamp, frame) {
    this.renderFrame({ timestamp, frame, source: "xr" });
  }

  waitForNextRenderFrame() {
    if (!this.isPresenting()) {
      return new Promise((resolve) => {
        window.requestAnimationFrame((timestamp) => resolve({
          source: "raf",
          timestamp
        }));
      });
    }

    return new Promise((resolve) => {
      this.frameWaiters.push({
        source: "xr",
        resolve
      });
    });
  }

  async flushVisualUpdate({ frames = 1, reason = "visual-flush" } = {}) {
    const safeFrames = Math.max(1, Number(frames) || 1);
    for (let index = 0; index < safeFrames; index += 1) {
      this.requestRender(`${reason}:${index + 1}`);
      await this.waitForNextRenderFrame();
    }
  }

  flushFrameWaiters(source, timestamp) {
    if (!this.frameWaiters.length) {
      return;
    }

    const pending = this.frameWaiters;
    this.frameWaiters = [];

    for (const waiter of pending) {
      if (waiter?.source && waiter.source !== source) {
        this.frameWaiters.push(waiter);
        continue;
      }

      waiter.resolve?.({
        source,
        timestamp
      });
    }
  }

  renderFrame({ timestamp, frame, source }) {
    const frameStart = performance.now();
    this.resizeIfNeeded();
    this.applyManualCameraView();
    this.applyContentTransform();
    this.scene.updateMatrixWorld(true);

    const frameState = this.createFrameState(frame, source);
    if (source === "xr" && this.pendingScenePresentation) {
      this.xrDebug?.log("xr-render-frame", {
        transitionId: this.pendingScenePresentation.transitionId,
        sceneId: this.pendingScenePresentation.sceneId ?? null,
        src: this.pendingScenePresentation.src ?? null,
        details: {
          frameIndex: this.renderStats.frameCount + 1,
          cameraReady: Boolean(frameState.camera),
          currentSceneSrc: this.currentSceneSrc || null,
          currentTextureSrc: this.currentTextureSrc || null,
          pendingTextureToken: this.pendingTextureToken ? "active" : null,
          activeSceneTransitionId: this.activeSceneTransitionId,
          pendingScenePresentation: this.pendingScenePresentation?.transitionId ?? null
        }
      });
    }
    this.presentPendingSceneTransition(frameState);
    for (const listener of this.listeners) {
      listener(frameState);
    }

    this.applyContentTransform();
    this.scene.updateMatrixWorld(true);

    if (this.isPresenting()) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.renderWidth, this.renderHeight);
      this.renderer.render(this.scene, this.camera);
    } else if (this.previewMode === "stereo") {
      this.renderStereoPreview();
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.renderWidth, this.renderHeight);
      this.renderer.render(this.scene, this.camera);
    }

    this.renderStats.mode = this.isPresenting() ? "xr" : "idle";
    this.renderStats.frameCount += 1;
    this.renderStats.lastFrameTimeMs = performance.now() - frameStart;
    this.renderStats.lastTimestamp = timestamp;
    this.renderStats.lastFrameSource = source;
    this.flushFrameWaiters(source, timestamp);
  }

  createFrameState(frame, source) {
    return {
      frame,
      source,
      presenting: this.isPresenting(),
      camera: this.getCameraForEye("center"),
      leftCamera: this.getCameraForEye("left"),
      rightCamera: this.getCameraForEye("right"),
      headPosition: this.getHeadPosition(),
      renderer: this.renderer,
      performance: this.getPerformanceSnapshot()
    };
  }

  renderStereoPreview() {
    this.syncStereoCamera();
    const width = this.renderWidth;
    const height = this.renderHeight;
    const halfWidth = Math.max(1, Math.floor(width / 2));

    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, halfWidth, height);
    this.renderer.setScissor(0, 0, halfWidth, height);
    this.renderer.render(this.scene, this.stereoCamera.cameraL);

    this.renderer.setViewport(halfWidth, 0, width - halfWidth, height);
    this.renderer.setScissor(halfWidth, 0, width - halfWidth, height);
    this.renderer.render(this.scene, this.stereoCamera.cameraR);
    this.renderer.setScissorTest(false);
  }

  applyManualCameraView() {
    if (this.isPresenting()) {
      return;
    }

    this.camera.rotation.set(
      THREE.MathUtils.degToRad(this.view.pitch),
      THREE.MathUtils.degToRad(this.view.yaw),
      0,
      "YXZ"
    );
    this.camera.fov = this.view.fov;
    this.camera.updateProjectionMatrix();
    this.bumpCameraStateVersion();
  }

  applyContentTransform() {
    this.contentRoot.position.copy(this.contentOffset);
    this.contentRoot.rotation.set(
      THREE.MathUtils.degToRad(-(this.baseRotation.pitch + this.runtimeRotationOffset.pitch)),
      THREE.MathUtils.degToRad(-(this.baseRotation.yaw + this.runtimeRotationOffset.yaw)),
      THREE.MathUtils.degToRad(-(this.baseRotation.roll + this.runtimeRotationOffset.roll)),
      "YXZ"
    );
  }

  applyTextureCrop(camera) {
    const texture = this.material.map;
    if (!texture) {
      return;
    }

    const requestedEye = camera ? detectRenderEye(camera, this.stereoCamera) : this.monoEye;
    const cropKey = `${this.stereoLayout}:${this.eyeOrder}:${requestedEye}:${this.flipHorizontally ? "flip" : "normal"}`;
    if (texture.userData.wpa360CropKey === cropKey) {
      return;
    }

    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const eyeForTexture = this.flipHorizontally ? invertEye(requestedEye) : requestedEye;

    if (this.stereoLayout === "top-bottom") {
      const useTopHalf = shouldUseTopHalf(eyeForTexture, this.eyeOrder);
      texture.repeat.set(this.flipHorizontally ? -1 : 1, 0.5);
      texture.offset.set(this.flipHorizontally ? 1 : 0, useTopHalf ? 0.5 : 0);
    } else if (this.stereoLayout === "side-by-side") {
      const useLeftHalf = shouldUseLeftHalf(eyeForTexture, this.eyeOrder);
      texture.repeat.set(this.flipHorizontally ? -0.5 : 0.5, 1);
      texture.offset.set(
        this.flipHorizontally
          ? (useLeftHalf ? 0.5 : 1)
          : (useLeftHalf ? 0 : 0.5),
        0
      );
    } else {
      texture.repeat.set(this.flipHorizontally ? -1 : 1, 1);
      texture.offset.set(this.flipHorizontally ? 1 : 0, 0);
    }

    texture.updateMatrix();
    texture.userData.wpa360CropKey = cropKey;
  }

  setTexture(texture, src = "", transition = null) {
    this.material.map = texture;
    this.currentTextureSrc = texture ? src || this.currentTextureSrc : "";
    this.material.color.set(texture ? "#ffffff" : "#102a31");

    this.xrDebug?.log("texture-apply", {
      transitionId: transition?.transitionId ?? this.activeSceneTransitionId ?? null,
      sceneId: transition?.sceneId ?? this.activeScene?.id ?? null,
      src: src || null,
      details: {
        hasTexture: Boolean(texture),
        currentTextureSrc: this.currentTextureSrc || null
      }
    });

    if (texture) {
      texture.userData.wpa360CropKey = null;
      this.applyTextureCrop(this.getCameraForEye("center"));
    }

    this.material.needsUpdate = true;
  }

  getOrCreateTexture(loadedAsset, scene = null, transition = null) {
    const cachedEntry = this.textureCache.get(loadedAsset.src);
    if (cachedEntry) {
      this.touchTextureEntry(loadedAsset.src, cachedEntry);
      this.xrDebug?.log("texture-create", {
        transitionId: transition?.transitionId ?? this.activeSceneTransitionId ?? null,
        sceneId: transition?.sceneId ?? scene?.id ?? null,
        src: loadedAsset.src,
        details: {
          mode: "cache-hit",
          stereo: isStereoScene(scene)
        }
      });
      return cachedEntry.texture;
    }

    const textureProfile = this.getTextureProfile(scene);
    const texture = new THREE.Texture(loadedAsset.image);
    texture.needsUpdate = true;
    texture.minFilter = textureProfile.minFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = textureProfile.generateMipmaps;
    texture.matrixAutoUpdate = false;
    if ("colorSpace" in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if ("encoding" in texture && THREE.sRGBEncoding) {
      texture.encoding = THREE.sRGBEncoding;
    }

    const entry = {
      src: loadedAsset.src,
      texture
    };
    this.textureCache.set(loadedAsset.src, entry);
    this.attachTextureUploadCleanup(texture, loadedAsset.src);
    this.xrDebug?.log("texture-create", {
      transitionId: transition?.transitionId ?? this.activeSceneTransitionId ?? null,
      sceneId: transition?.sceneId ?? scene?.id ?? null,
      src: loadedAsset.src,
      details: {
        mode: "new-texture",
        stereo: isStereoScene(scene),
        imageWidth: Number(loadedAsset.image?.width ?? loadedAsset.image?.videoWidth ?? 0),
        imageHeight: Number(loadedAsset.image?.height ?? loadedAsset.image?.videoHeight ?? 0),
        generateMipmaps: textureProfile.generateMipmaps,
        minFilter: textureProfile.minFilter === THREE.LinearFilter ? "LinearFilter" : "LinearMipmapLinearFilter"
      }
    });
    this.evictTextures([loadedAsset.src]);
    return texture;
  }

  attachTextureUploadCleanup(texture, src) {
    if (this.xrEnabled === true || !texture) {
      return;
    }

    texture.onUpdate = () => {
      this.assetCache?.releaseImage?.(src, { force: true });
      try {
        if (texture.source && "data" in texture.source) {
          texture.source.data = null;
        }
      } catch {}
      try {
        if ("image" in texture) {
          texture.image = null;
        }
      } catch {}
      texture.onUpdate = null;
    };
  }

  getTextureProfile(scene = null) {
    const stereo = isStereoScene(scene);
    const shouldUseLowMemoryTexture = stereo || this.xrEnabled === true;
    return {
      generateMipmaps: !shouldUseLowMemoryTexture,
      minFilter: shouldUseLowMemoryTexture
        ? THREE.LinearFilter
        : THREE.LinearMipmapLinearFilter
    };
  }

  shouldUseAggressiveSceneSwap(scene, nextSrc) {
    if (!this.currentTextureSrc || this.currentTextureSrc === nextSrc) {
      return false;
    }

    if (this.xrEnabled !== true) {
      return true;
    }

    return isStereoScene(scene) && this.xrEnabled === true;
  }

  releaseCurrentTextureForSwap(nextSrc) {
    const previousSrc = this.currentTextureSrc;
    if (!previousSrc || previousSrc === nextSrc) {
      return;
    }

    const previousEntry = this.textureCache.get(previousSrc);
    this.setTexture(null, "");
    this.currentSceneSrc = "";
    if (previousEntry) {
      this.disposeTextureEntry(previousEntry, { forceImageRelease: true });
      this.textureCache.delete(previousSrc);
    }
    this.root.classList.remove("is-empty");
    this.requestRender("scene-transition-placeholder");
  }

  setPinnedTextureSources(srcs = []) {
    this.pinnedTextureSrcs = new Set(
      srcs
        .filter(Boolean)
        .map((src) => this.assetCache?.normalizeUrl?.(src) ?? src)
    );
    this.evictTextures(srcs);
    return this.pinnedTextureSrcs.size;
  }

  evictTextures(preserveSrcs = []) {
    const preserve = new Set(
      preserveSrcs
        .filter(Boolean)
        .map((src) => this.assetCache?.normalizeUrl?.(src) ?? src)
    );
    for (const src of this.pinnedTextureSrcs) {
      preserve.add(src);
    }

    if (this.currentTextureSrc) {
      preserve.add(this.currentTextureSrc);
    }

    while (this.textureCache.size > this.maxTextureEntries) {
      const evictableKey = this.findEvictableTextureKey(preserve);
      if (!evictableKey) {
        break;
      }

      const entry = this.textureCache.get(evictableKey);
      this.disposeTextureEntry(entry);
      this.textureCache.delete(evictableKey);
    }
    this.renderer.renderLists?.dispose?.();
  }

  clearTextureCache() {
    for (const entry of this.textureCache.values()) {
      this.disposeTextureEntry(entry);
    }
    this.textureCache.clear();
    this.renderer.renderLists?.dispose?.();
  }

  findEvictableTextureKey(preserve) {
    for (const key of this.textureCache.keys()) {
      if (!preserve.has(key)) {
        return key;
      }
    }
    return null;
  }

  touchTextureEntry(key, entry) {
    this.textureCache.delete(key);
    this.textureCache.set(key, entry);
  }

  disposeTextureEntry(entry, { forceImageRelease = false } = {}) {
    const texture = entry?.texture ?? null;
    const src = entry?.src ?? null;

    if (texture) {
      try {
        if (texture.source && "data" in texture.source) {
          texture.source.data = null;
        }
      } catch {}

      try {
        if ("image" in texture) {
          texture.image = null;
        }
      } catch {}

      texture.dispose?.();
    }

    if (src) {
      this.assetCache?.releaseImage?.(src, { force: forceImageRelease });
    }
  }

  getRendererMemorySnapshot() {
    return {
      geometries: Number(this.renderer.info?.memory?.geometries ?? 0),
      textures: Number(this.renderer.info?.memory?.textures ?? 0)
    };
  }

  resizeIfNeeded(force = false) {
    const width = Math.max(1, Math.floor(this.root.clientWidth || this.root.getBoundingClientRect().width || 1));
    const height = Math.max(1, Math.floor(this.root.clientHeight || this.root.getBoundingClientRect().height || 1));
    if (!force && width === this.renderWidth && height === this.renderHeight) {
      return false;
    }

    this.renderWidth = width;
    this.renderHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.bumpCameraStateVersion();
    return true;
  }

  syncStereoCamera() {
    if (this.previewMode !== "stereo" || this.isPresenting()) {
      return;
    }

    if (this.stereoCameraVersion === this.cameraStateVersion) {
      return;
    }

    this.stereoCamera.update(this.camera);
    this.stereoCameraVersion = this.cameraStateVersion;
  }

  bumpCameraStateVersion() {
    this.cameraStateVersion += 1;
  }

  onResizeObserved() {
    if (this.resizeIfNeeded(true)) {
      this.requestRender("resize-observer");
    }
  }

  onWindowResize() {
    if (this.resizeIfNeeded(true)) {
      this.requestRender("window-resize");
    }
  }

  startXrLoop() {
    if (this.xrLoopActive) {
      return;
    }

    this.xrLoopActive = true;
    this.renderStats.mode = "xr";
    this.xrDebug?.log("xr-session-start", {
      details: {
        presenting: true
      }
    });
    this.renderer.setAnimationLoop(this.handleXRAnimationFrame);
  }

  stopXrLoop() {
    if (!this.xrLoopActive) {
      return;
    }

    this.xrLoopActive = false;
    this.renderer.setAnimationLoop(null);
    this.renderStats.mode = "idle";
    this.xrDebug?.log("xr-session-end", {
      details: {
        presenting: false
      }
    });
  }

  stopNonXrLoop() {
    if (!this.rafHandle) {
      return;
    }

    window.cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
    this.renderStats.mode = "idle";
  }

  handleSessionEnd() {
    this.xrSession?.removeEventListener?.("end", this.handleSessionEnd);
    this.xrSession?.removeEventListener?.("visibilitychange", this.handleXRVisibilityChange);
    this.xrSession = null;
    this.xrDebug?.log("xr-visibility-change", {
      details: {
        state: "session-ended"
      }
    });
    this.stopXrLoop();
    this.requestRender("xr-session-ended");
  }

  handleXRVisibilityChange() {
    this.xrDebug?.log("xr-visibility-change", {
      details: {
        state: this.xrSession?.visibilityState ?? "unknown"
      }
    });
  }
}

function normalizeStereoLayout(layout) {
  if (layout === "top-bottom" || layout === "topdown" || layout === "top-down") {
    return "top-bottom";
  }
  if (
    layout === "side-by-side"
    || layout === "sidebyside"
    || layout === "left-right"
    || layout === "right-left"
    || layout === "sbs"
  ) {
    return "side-by-side";
  }
  return "mono";
}

function normalizeEyeOrder(order) {
  return order === "right-left" ? "right-left" : "left-right";
}

function shouldUseTopHalf(eye, eyeOrder) {
  return eyeOrder === "right-left"
    ? eye === "right"
    : eye !== "right";
}

function shouldUseLeftHalf(eye, eyeOrder) {
  return eyeOrder === "right-left"
    ? eye !== "right"
    : eye === "left";
}

function detectRenderEye(camera, stereoCamera) {
  if (camera === stereoCamera.cameraR) {
    return "right";
  }

  if (camera === stereoCamera.cameraL) {
    return "left";
  }

  if (camera?.name && /right|cameraR/i.test(camera.name)) {
    return "right";
  }

  if (camera?.viewport?.x > 0) {
    return "right";
  }

  return "left";
}

function invertEye(eye) {
  return eye === "right" ? "left" : "right";
}

function isStereoScene(scene) {
  return normalizeStereoLayout(scene?.media?.stereo_layout) !== "mono";
}

function hiddenProjection(rect) {
  return {
    visible: false,
    inFrontOfCamera: false,
    x: rect.width / 2,
    y: rect.height / 2,
    depth: Number.POSITIVE_INFINITY
  };
}

function quaternionFromRotation(rotation, target = null) {
  const yaw = THREE.MathUtils.degToRad(Number(rotation?.yaw ?? 0));
  const pitch = THREE.MathUtils.degToRad(Number(rotation?.pitch ?? 0));
  const roll = THREE.MathUtils.degToRad(Number(rotation?.roll ?? 0));

  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
  const quaternion = target ?? new THREE.Quaternion();
  quaternion.copy(qRoll).multiply(qPitch).multiply(qYaw);
  return quaternion;
}

function projectResolvedWorldToScreen(worldPosition, rect, camera, cameraPosition, cameraDirection, toWorldPosition) {
  toWorldPosition.copy(worldPosition).sub(cameraPosition);

  const projected = worldPosition.clone().project(camera);
  const inFrontOfCamera = cameraDirection.dot(toWorldPosition) > 0;
  const visible = inFrontOfCamera
    && Number.isFinite(projected.x)
    && Number.isFinite(projected.y)
    && Number.isFinite(projected.z)
    && projected.z >= -1
    && projected.z <= 1
    && projected.x >= -1
    && projected.x <= 1
    && projected.y >= -1
    && projected.y <= 1;

  return {
    visible,
    inFrontOfCamera,
    x: (projected.x + 1) * 0.5 * rect.width,
    y: (1 - projected.y) * 0.5 * rect.height,
    depth: worldPosition.distanceTo(cameraPosition)
  };
}

function isProjectionUsable(projected) {
  return Boolean(
    projected
    && projected.inFrontOfCamera !== false
    && Number.isFinite(projected.x)
    && Number.isFinite(projected.y)
    && Number.isFinite(projected.depth)
  );
}
