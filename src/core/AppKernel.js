import { AppStateStore } from "./AppStateStore.js";
import { PlatformRuntimeCoordinator } from "./PlatformRuntimeCoordinator.js";
import { PlatformSelector, PLATFORM_2D, PLATFORM_VR } from "./PlatformSelector.js";
import { AssetCacheShared } from "../shared/AssetCacheShared.js";
import { CfgLoaderShared } from "../shared/CfgLoaderShared.js";
import { HotspotLoaderShared } from "../shared/HotspotLoaderShared.js";
import { SceneLoaderShared } from "../shared/SceneLoaderShared.js";
import { TourLoaderShared } from "../shared/TourLoaderShared.js";
import { TourRegistryShared } from "../shared/TourRegistryShared.js";
import { XrDebugTimeline } from "../shared/XrDebugTimeline.js";
import { MinimapWidget } from "../ui/MinimapWidget.js";
import { TwoDPlatformLauncher } from "../platform/2D_platform/TwoDPlatformLauncher.js";
import { VRPlatformLauncher } from "../platform/VR_platform/VRPlatformLauncher.js";

export class AppKernel {
  constructor(elements) {
    this.elements = elements;
    this.store = new AppStateStore();
    this.xrDebugEnabled = new URLSearchParams(window.location.search).get("debug_xr") === "1";
    this.xrDebug = new XrDebugTimeline({
      enabled: this.xrDebugEnabled,
      contextProvider: () => this.getXrDebugContext()
    });
    this.assetCache = new AssetCacheShared({ xrDebug: this.xrDebug });
    this.platformSelector = new PlatformSelector();
    this.cfgLoader = new CfgLoaderShared({ assetCache: this.assetCache });
    this.registry = new TourRegistryShared({ assetCache: this.assetCache });
    this.hotspotLoader = new HotspotLoaderShared();
    this.tourLoader = new TourLoaderShared({
      assetCache: this.assetCache,
      hotspotLoader: this.hotspotLoader
    });
    this.navigationInFlight = null;
    this.runtimeTransitionCounter = 0;
    this.activeRuntimeTransition = null;
    this.backgroundPreloadGeneration = 0;
    this.editorTourCatalogCache = new Map();
    this.backgroundWarmJobs = new WeakMap();
    this.activeTourDownloadJob = null;
    this.sceneLoader = new SceneLoaderShared({
      assetCache: this.assetCache,
      hotspotLoader: this.hotspotLoader
    });
    this.serviceWorkerRuntimeState = "idle";
    this.editorModule = null;
    this.deferredInstallPrompt = null;
    this.webxrSupportPromise = null;

    this.context = {
      store: this.store,
      assetCache: this.assetCache,
      getInputProfile: () => this.platformSelector.getInputProfile(),
      goToScene: (sceneId) => this.goToScene(sceneId),
      loadTour: (tourId, options) => this.loadTour(tourId, options),
      goToRelativeScene: (step) => this.goToRelativeScene(step),
      goToRelativeTour: (step) => this.goToRelativeTour(step),
      switchPlatform: (platformId, options) => this.switchPlatform(platformId, options),
      exitVrMode: () => this.exitVrMode(),
      updateTourSettings: (patch) => this.updateTourSettings(patch),
      applyEditorDraft: (tour, sceneId) => this.applyEditorDraft(tour, sceneId),
      goToHotspotTarget: (hotspot, options) => this.goToHotspotTarget(hotspot, options),
      getEditorTourCatalog: (tourId) => this.getEditorTourCatalog(tourId),
      rerender: () => this.platformCoordinator.renderCurrent(),
      screenToWorldFromEvent: (event, options) => this.platformCoordinator.screenToWorldFromEvent(event, options),
      getActiveRenderer: () => this.platformCoordinator.getActiveRenderer(),
      getEditorBridge: () => this.getEditorBridge(),
      isEditorEnabled: () => Boolean(this.getEditorBridge()),
      getRuntimeRoot: () => this.elements.runtimeRoot,
      debugLog: (...args) => this.debugLog(...args),
      xrDebug: this.xrDebug,
      setStatus: (message, options) => this.setStatus(message, options)
    };

    this.platformCoordinator = new PlatformRuntimeCoordinator({
      root: elements.runtimeRoot,
      context: this.context,
      launchers: {
        [PLATFORM_2D]: TwoDPlatformLauncher,
        [PLATFORM_VR]: VRPlatformLauncher
      }
    });

    this.minimapWidget = new MinimapWidget({
      root: elements.minimapRoot,
      assetCache: this.assetCache
    });

    this.handleBeforeInstallPrompt = this.handleBeforeInstallPrompt.bind(this);
    this.handleAppInstalled = this.handleAppInstalled.bind(this);
    this.handleStandaloneModeChange = this.handleStandaloneModeChange.bind(this);
  }

  async start() {
    this.assertDom();
    this.setStatus("Loading project configuration...");
    this.bindStaticUi();
    this.initializeUiHints();
    this.xrDebug.attachWindowEvents();
    this.xrDebug.log("app-start");

    const [cfg, master] = await Promise.all([
      this.cfgLoader.load(),
      this.registry.load()
    ]);

    this.store.patch({ cfg, master });
    this.applyDocumentTitle(cfg);
    this.applyChromeConfig(cfg);
    this.populateTourSelect(master, cfg);

    const initialTourId = this.getInitialTourId(master, cfg);
    await this.loadTour(initialTourId);
    this.updateActiveTourDownloadButton();
    await this.maybeLoadEditor(cfg);

    const initialPlatform = await this.platformSelector.detectInitialPlatform(cfg);
    await this.switchPlatform(initialPlatform, { userInitiated: false });
    this.updatePlatformButtons(initialPlatform);

    this.store.subscribe((state) => {
      this.minimapWidget.render(state);
      this.updatePlatformButtons(state.platformId);
      this.syncSceneSelect(state.currentTour, state.currentSceneId);
      this.updatePlatformBadge(state.platformId);
      this.updateActiveTourDownloadButton();
    });

    await this.maybeRegisterServiceWorker(cfg);
    await this.refreshCapabilityBadges();
    this.updateInstallButton();
    this.updateXrDebugButton();
    this.updateActiveTourDownloadButton();

    this.setStatus("Ready", { hideAfterMs: 1600 });
  }

  assertDom() {
    const required = ["root", "runtimeRoot", "statusRoot", "tourSelect"];
    for (const key of required) {
      if (!this.elements[key]) {
        throw new Error(`Missing DOM element: ${key}`);
      }
    }
  }

  bindStaticUi() {
    this.elements.tourSelect.addEventListener("change", (event) => {
      this.loadTour(event.target.value).catch((error) => this.handleError(error));
    });

    this.elements.sceneSelect?.addEventListener("change", (event) => {
      this.goToScene(event.target.value).catch((error) => this.handleError(error));
    });

    for (const button of this.elements.platformButtons) {
      button.addEventListener("click", () => {
        this.switchPlatform(button.dataset.platformSwitch, { userInitiated: true }).catch((error) => this.handleError(error));
      });
    }

    this.elements.installButton?.addEventListener("click", () => {
      this.installPwa().catch((error) => this.handleError(error));
    });

    this.elements.xrDebugDownloadButton?.addEventListener("click", () => {
      this.downloadXrDebugLog().catch((error) => this.handleError(error));
    });

    this.elements.downloadActiveTourButton?.addEventListener("click", () => {
      this.downloadActiveTour().catch((error) => this.handleError(error));
    });

    window.addEventListener("beforeinstallprompt", this.handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", this.handleAppInstalled);
    this.standaloneMediaQuery = window.matchMedia?.("(display-mode: standalone)") ?? null;
    this.standaloneMediaQuery?.addEventListener?.("change", this.handleStandaloneModeChange);
  }

  initializeUiHints() {
    this.setElementHint(this.elements.tourSelect, {
      title: "Escolha o tour virtual ativo.",
      ariaLabel: "Selecionar tour virtual"
    });
    this.setElementHint(this.elements.sceneSelect, {
      title: "Escolha a cena ativa do tour atual.",
      ariaLabel: "Selecionar cena ativa"
    });
    this.setElementHint(this.elements.downloadActiveTourButton, {
      title: "Baixe todas as imagens do tour ativo para o cache do navegador e acelere a navegacao.",
      ariaLabel: "Baixar tour ativo"
    });
    this.setElementHint(this.elements.installButton, {
      title: "Instale o tour como aplicativo para abrir com mais rapidez e suporte offline.",
      ariaLabel: "Instalar aplicativo PWA"
    });
    this.setElementHint(this.elements.xrDebugDownloadButton, {
      title: "Baixe o log XR da sessao atual para analise.",
      ariaLabel: "Baixar log XR"
    });

    for (const button of this.elements.platformButtons ?? []) {
      const isVrButton = button.dataset.platformSwitch === PLATFORM_VR;
      this.setElementHint(button, {
        title: isVrButton
          ? "Ativar a visualizacao preparada para VR."
          : "Ativar a visualizacao 2D do tour.",
        ariaLabel: isVrButton ? "Alternar para o modo VR" : "Alternar para o modo 2D"
      });
    }
  }

  setElementHint(element, { title, ariaLabel } = {}) {
    if (!element) {
      return;
    }

    if (title) {
      element.title = title;
    }

    if (ariaLabel) {
      element.setAttribute("aria-label", ariaLabel);
    }
  }

  populateTourSelect(master, cfg) {
    const selectedId = this.getInitialTourId(master, cfg);
    this.elements.tourSelect.replaceChildren(
      ...master.tours.map((tour) => {
        const option = document.createElement("option");
        option.value = tour.id;
        option.textContent = tour.title;
        option.selected = tour.id === selectedId;
        return option;
      })
    );
    this.refreshTourSelectHint();
  }

  syncSceneSelect(tour, selectedSceneId) {
    const select = this.elements.sceneSelect;
    if (!select) {
      return;
    }

    const scenes = tour?.scenes ?? [];
    select.disabled = scenes.length === 0;

    const options = scenes.map((scene) => ({
      value: scene.id,
      label: scene.title || scene.id
    }));

    const signature = JSON.stringify({
      selectedSceneId,
      options
    });

    if (select.dataset.signature !== signature && document.activeElement !== select) {
      select.replaceChildren(
        ...options.map((option) => {
          const element = document.createElement("option");
          element.value = option.value;
          element.textContent = option.label;
          return element;
        })
      );
      select.dataset.signature = signature;
    }

    if (selectedSceneId) {
      select.value = selectedSceneId;
    } else if (options.length > 0) {
      select.value = options[0].value;
    }

    this.refreshSceneSelectHint(tour, select.value || selectedSceneId);
  }

  refreshTourSelectHint() {
    const select = this.elements.tourSelect;
    if (!select) {
      return;
    }

    const activeOption = select.selectedOptions?.[0];
    const label = activeOption?.textContent?.trim();
    const title = label
      ? `Tour ativo: ${label}. Use este seletor para trocar de tour.`
      : "Escolha qual tour virtual abrir.";
    this.setElementHint(select, {
      title,
      ariaLabel: label ? `Tour ativo ${label}. Selecionar outro tour.` : "Selecionar tour virtual"
    });
  }

  refreshSceneSelectHint(tour, selectedSceneId) {
    const select = this.elements.sceneSelect;
    if (!select) {
      return;
    }

    const activeScene = tour?.scenes?.find((scene) => scene.id === selectedSceneId) ?? null;
    const label = activeScene?.title || activeScene?.id || "";
    const title = label
      ? `Cena ativa: ${label}. Use este seletor para navegar entre as cenas do tour atual.`
      : "Escolha a cena ativa do tour atual.";
    this.setElementHint(select, {
      title,
      ariaLabel: label ? `Cena ativa ${label}. Selecionar outra cena.` : "Selecionar cena ativa"
    });
  }

  getInitialTourId(master, cfg) {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tour");
    const fallback = cfg?.app?.default_tour_id;
    return this.registry.findTour(master, requested)?.id
      ?? this.registry.findTour(master, fallback)?.id
      ?? master.tours[0]?.id;
  }

  async loadTour(tourId, { sceneId = null, navigationHotspot = null } = {}) {
    const transitionToken = this.beginRuntimeTransition("load-tour", tourId);
    if (!transitionToken) {
      return;
    }

    const state = this.store.getSnapshot();
    const previousTour = state.currentTour ?? null;
    const entry = this.registry.findTour(state.master, tourId);
    if (!entry) {
      this.finishRuntimeTransition(transitionToken);
      throw new Error("No tour available in master.json.");
    }

    this.setStatus(`Loading ${entry.title}...`);
    this.store.patch({ isLoading: true, error: null });
    const activeRenderer = this.platformCoordinator.getActiveRenderer();
    let handoffLoadingToRenderer = false;
    let loadSucceeded = false;
    activeRenderer?.setLoadingState?.({
      visible: true,
      title: "Carregando tour...",
      detail: entry.title ?? entry.id ?? "Preparando tour"
    });
    await activeRenderer?.flushLoadingUi?.();

    try {
      const tour = await this.tourLoader.load(entry);
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      const requestedSceneId = tour.scenes?.some((candidate) => candidate.id === sceneId)
        ? sceneId
        : tour.initial_scene;
      await this.prepareTourAssets(tour, state.cfg, {
        reason: "load-tour",
        prioritySceneId: requestedSceneId,
        guard: this.createBackgroundPreloadGuard(tour)
      });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      const shouldDeferMediaLoad = state.platformId === PLATFORM_2D;
      const scene = await this.sceneLoader.loadScene(tour, requestedSceneId, state.cfg, {
        preloadAssets: shouldDeferMediaLoad ? false : undefined
      });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      const renderOptions = {
        ...resolveSceneOrientationOptions(scene, navigationHotspot),
        transitionMode: navigationHotspot ? "hotspot-snapshot" : null
      };
      this.xrDebug.log("navigation-scene-loaded", {
        sceneId: scene.id,
        src: scene?.media?.src ?? null,
        details: {
          reason: "load-tour"
        }
      });

      this.elements.tourSelect.value = entry.id;
      this.refreshTourSelectHint();
      this.store.patch({
        currentTourEntry: entry,
        currentTour: tour,
        currentScene: scene,
        currentSceneId: scene.id
      });
      this.editorTourCatalogCache.set(entry.id, {
        tourId: tour.id ?? entry.id,
        title: tour.title ?? entry.title ?? entry.id,
        scenes: (tour.scenes ?? []).map((candidate) => ({
          id: candidate.id,
          title: candidate.title || candidate.id
        }))
      });

      this.syncSceneSelect(tour, scene.id);
      this.applyTourTitle(tour, scene);
      this.xrDebug.log("navigation-render-start", {
        sceneId: scene.id,
        src: scene?.media?.src ?? null,
        details: {
          reason: "load-tour",
          orientationSource: renderOptions.orientationSource
        }
      });
      const renderResult = await this.platformCoordinator.renderCurrent(renderOptions);
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      const presentationResult = await this.awaitRendererScenePresentation(activeRenderer, renderResult, {
        reason: "load-tour",
        sceneId: scene.id
      });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      this.xrDebug.log("navigation-render-complete", {
        transitionId: renderResult?.transitionId ?? presentationResult?.transitionId ?? null,
        sceneId: scene.id,
        src: scene?.media?.src ?? null,
        details: {
          reason: "load-tour",
          renderTransitionId: renderResult?.transitionId ?? null,
          presentationState: presentationResult?.state ?? null
        }
      });
      handoffLoadingToRenderer = Boolean(activeRenderer?.setLoadingState && presentationResult);
      if (previousTour && previousTour !== tour) {
        this.releaseInactiveTourResources(previousTour, scene);
      }
      this.store.patch({ isLoading: false });
      loadSucceeded = true;
    } finally {
      if (this.isRuntimeTransitionActive(transitionToken) && (!loadSucceeded || !handoffLoadingToRenderer)) {
        activeRenderer?.setLoadingState?.({ visible: false });
      }
      this.finishRuntimeTransition(transitionToken);
    }
  }

  async goToScene(sceneId, { navigationHotspot = null } = {}) {
    const transitionToken = this.beginRuntimeTransition("go-to-scene", sceneId);
    if (!transitionToken) {
      return;
    }

    const state = this.store.getSnapshot();
    this.debugLog("navigation:request", {
      from: state.currentSceneId,
      to: sceneId,
      tour: state.currentTour?.id,
      platform: state.platformId
    });
    this.xrDebug.log("navigation-request", {
      sceneId,
      details: {
        from: state.currentSceneId,
        to: sceneId,
        tourId: state.currentTour?.id ?? null,
        platformId: state.platformId
      }
    });

    if (!state.currentTour) {
      this.debugLog("navigation:blocked:no-current-tour", { targetSceneId: sceneId });
      this.finishRuntimeTransition(transitionToken);
      return;
    }

    if (state.currentSceneId === sceneId) {
      this.debugLog("navigation:blocked:same-scene", { sceneId });
      this.finishRuntimeTransition(transitionToken);
      return;
    }

    const targetExists = state.currentTour.scenes?.some((scene) => scene.id === sceneId);
    if (!targetExists) {
      const message = `Hotspot target scene not found: ${sceneId}`;
      this.debugLog("navigation:blocked:missing-target", {
        targetSceneId: sceneId,
        availableScenes: state.currentTour.scenes?.map((scene) => scene.id) ?? []
      });
      this.setStatus(message, { hideAfterMs: 2200 });
      this.finishRuntimeTransition(transitionToken);
      throw new Error(message);
    }

    if (this.navigationInFlight === sceneId) {
      this.debugLog("navigation:blocked:already-loading", { sceneId });
      this.finishRuntimeTransition(transitionToken);
      return;
    }

    this.navigationInFlight = sceneId;
    const activeRenderer = this.platformCoordinator.getActiveRenderer();
    let handoffLoadingToRenderer = false;
    let navigationSucceeded = false;

    try {
      this.setStatus(`Loading scene ${sceneId}...`);
      const targetScene = state.currentTour.scenes?.find((scene) => scene.id === sceneId) ?? null;
      const renderOptions = {
        ...resolveSceneOrientationOptions(targetScene, navigationHotspot),
        transitionMode: navigationHotspot ? "hotspot-snapshot" : null
      };
      const shouldUseVrDeferredMediaLoad = this.shouldUseVrDeferredMediaLoad(state, targetScene);
      if (shouldUseVrDeferredMediaLoad) {
        activeRenderer?.setLoadingState?.({
          visible: true,
          title: "Carregando panorama...",
          detail: targetScene?.title ?? sceneId
        });
        await activeRenderer?.flushLoadingUi?.();
      }

      const shouldDeferMediaLoad = shouldUseVrDeferredMediaLoad || state.platformId === PLATFORM_2D;
      const scene = await this.sceneLoader.loadScene(
        state.currentTour,
        sceneId,
        state.cfg,
        { preloadAssets: shouldDeferMediaLoad ? false : undefined }
      );
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      this.xrDebug.log("navigation-scene-loaded", {
        sceneId: scene.id,
        src: scene?.media?.src ?? null,
        details: {
          reason: "go-to-scene",
          deferredMediaLoad: shouldUseVrDeferredMediaLoad
        }
      });
      this.store.patch({
        currentScene: scene,
        currentSceneId: scene.id
      });

      this.syncSceneSelect(state.currentTour, scene.id);
      this.applyTourTitle(state.currentTour, scene);
      this.xrDebug.log("navigation-render-start", {
        sceneId: scene.id,
        src: scene?.media?.src ?? null,
        details: {
          reason: "go-to-scene",
          orientationSource: renderOptions.orientationSource
        }
      });
      const renderResult = await this.platformCoordinator.renderCurrent(renderOptions);
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      const presentationResult = await this.awaitRendererScenePresentation(activeRenderer, renderResult, {
        reason: "go-to-scene",
        sceneId: scene.id
      });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      this.xrDebug.log("navigation-render-complete", {
        transitionId: renderResult?.transitionId ?? presentationResult?.transitionId ?? null,
        sceneId: scene.id,
        src: scene?.media?.src ?? null,
        details: {
          reason: "go-to-scene",
          renderTransitionId: renderResult?.transitionId ?? null,
          presentationState: presentationResult?.state ?? null
        }
      });
      handoffLoadingToRenderer = Boolean(activeRenderer?.setLoadingState && presentationResult);
      const preloadMode = this.getScenePreloadMode(state.cfg);
      if (preloadMode === "selective" || preloadMode === "minimal" || preloadMode === "hybrid") {
        const preloadGuard = this.createBackgroundPreloadGuard(state.currentTour);
        this.prepareTourAssets(state.currentTour, state.cfg, {
          reason: "scene-change",
          prioritySceneId: scene.id,
          guard: preloadGuard
        }).catch((preloadError) => {
          console.warn("[WPA360] background scene preload failed", preloadError);
        });
      }
      this.debugLog("navigation:complete", {
        from: state.currentSceneId,
        to: scene.id,
        title: scene.title,
        orientationSource: renderOptions.orientationSource,
        entryYaw: renderOptions.entryYaw
      });
      this.setStatus(`Scene: ${scene.title ?? scene.id}`, { hideAfterMs: 1200 });
      navigationSucceeded = true;
      if (this.isRuntimeTransitionActive(transitionToken) && !handoffLoadingToRenderer) {
        activeRenderer?.setLoadingState?.({ visible: false });
      }
    } catch (error) {
      this.debugLog("navigation:error", { targetSceneId: sceneId, error });
      throw error;
    } finally {
      if (this.isRuntimeTransitionActive(transitionToken) && (!navigationSucceeded || !handoffLoadingToRenderer)) {
        activeRenderer?.setLoadingState?.({ visible: false });
      }
      if (this.navigationInFlight === sceneId) {
        this.navigationInFlight = null;
      }
      this.finishRuntimeTransition(transitionToken);
    }
  }

  async goToRelativeScene(step = 1) {
    const state = this.store.getSnapshot();
    const scenes = state.currentTour?.scenes ?? [];
    if (scenes.length === 0) {
      return;
    }

    const currentIndex = scenes.findIndex((scene) => scene.id === state.currentSceneId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = modulo(safeIndex + Number(step || 0), scenes.length);
    const nextScene = scenes[nextIndex];
    if (!nextScene) {
      return;
    }

    await this.goToScene(nextScene.id);
  }

  async goToRelativeTour(step = 1) {
    const state = this.store.getSnapshot();
    const tours = state.master?.tours ?? [];
    if (tours.length === 0) {
      return;
    }

    const currentIndex = tours.findIndex((tour) => tour.id === state.currentTourEntry?.id);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = modulo(safeIndex + Number(step || 0), tours.length);
    const nextTour = tours[nextIndex];
    if (!nextTour) {
      return;
    }

    await this.loadTour(nextTour.id);
  }

  async goToHotspotTarget(hotspot, { source = "runtime" } = {}) {
    const targetSceneId = String(hotspot?.target_scene ?? "").trim();
    if (!targetSceneId) {
      this.debugLog("navigation:blocked:no-hotspot-target-scene", {
        source,
        hotspotId: hotspot?.id ?? null
      });
      return;
    }

    const state = this.store.getSnapshot();
    const currentTourId = state.currentTourEntry?.id ?? state.currentTour?.id ?? null;
    const targetTourId = String(hotspot?.target_tour ?? currentTourId ?? "").trim() || currentTourId;

    this.debugLog("navigation:hotspot-target", {
      source,
      hotspotId: hotspot?.id ?? null,
      targetTourId,
      targetSceneId,
      applyHotspotSceneYaw: hotspot?.apply_hotspot_scene_yaw === true,
      hotspotSceneYaw: Number(hotspot?.hotspot_define_scene_yaw ?? 0)
    });
    this.xrDebug.log("hotspot-activate", {
      sceneId: targetSceneId,
      details: {
        source,
        hotspotId: hotspot?.id ?? null,
        hotspotLabel: hotspot?.label?.text ?? null,
        targetTourId,
        targetSceneId,
        applyHotspotSceneYaw: hotspot?.apply_hotspot_scene_yaw === true
      }
    });

    if (!targetTourId || targetTourId === currentTourId) {
      await this.goToScene(targetSceneId, { navigationHotspot: hotspot });
      return;
    }

    const targetEntry = state.master?.tours?.find((candidate) => candidate.id === targetTourId) ?? null;
    if (!targetEntry) {
      const message = `Hotspot target tour not found: ${targetTourId}`;
      this.setStatus(message, { hideAfterMs: 2400 });
      throw new Error(message);
    }

    await this.loadTour(targetEntry.id, { sceneId: targetSceneId, navigationHotspot: hotspot });
  }

  async exitVrMode() {
    const renderer = this.platformCoordinator.getActiveRenderer();
    if (renderer?.isPresenting?.() && renderer?.exitImmersive) {
      await renderer.exitImmersive();
    }

    await this.switchPlatform(PLATFORM_2D, { userInitiated: true });
  }

  async switchPlatform(platformId, { userInitiated = false } = {}) {
    const transitionToken = this.beginRuntimeTransition("switch-platform", platformId);
    if (!transitionToken) {
      return;
    }

    const cfg = this.store.getSnapshot().cfg;
    if (platformId === PLATFORM_VR && cfg?.features?.vr === false) {
      this.setStatus("VR is disabled in cfg.json.");
      this.finishRuntimeTransition(transitionToken);
      return;
    }

    if (cfg?.platform?.allow_runtime_switch === false) {
      this.setStatus("Runtime platform switching is disabled in cfg.json.");
      this.finishRuntimeTransition(transitionToken);
      return;
    }

    try {
      this.setStatus(`Switching to ${platformId}...`);
      await this.platformCoordinator.switchPlatform(platformId, {
        userInitiated,
        deferRender: true
      });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      const state = this.store.getSnapshot();
      await this.prepareActiveRendererForTour(state.currentTour, state.cfg, {
        reason: platformId === PLATFORM_VR ? "enter-vr" : `switch-${platformId}`,
        prioritySceneId: state.currentSceneId,
        guard: this.createBackgroundPreloadGuard(state.currentTour)
      });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      const activeRenderer = this.platformCoordinator.getActiveRenderer();
      const renderResult = await this.platformCoordinator.renderCurrent({ userInitiated });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      await this.awaitRendererScenePresentation(activeRenderer, renderResult, {
        reason: "switch-platform",
        sceneId: state.currentSceneId
      });
      if (!this.isRuntimeTransitionActive(transitionToken)) {
        return;
      }
      this.setStatus(`${platformId} active`, { hideAfterMs: 1200 });
    } finally {
      this.finishRuntimeTransition(transitionToken);
    }
  }

  updateTourSettings(patch) {
    const state = this.store.getSnapshot();
    if (!state.currentTour) {
      return;
    }

    const nextTour = {
      ...state.currentTour,
      ...patch,
      settings: {
        ...state.currentTour.settings,
        ...patch.settings
      }
    };

    this.store.patch({ currentTour: nextTour });
    this.applyTourTitle(nextTour, state.currentScene);
    this.platformCoordinator.renderCurrent();
  }

  async applyEditorDraft(tour, sceneId) {
    const state = this.store.getSnapshot();
    if (!tour) {
      return;
    }

    const targetSceneId = sceneId ?? tour.initial_scene;
    const currentSceneId = state.currentSceneId;
    const isCurrentSceneDraftUpdate = currentSceneId && targetSceneId === currentSceneId;

    if (isCurrentSceneDraftUpdate) {
      const requestedScene = tour.scenes?.find((candidate) => candidate.id === targetSceneId) ?? null;
      if (requestedScene) {
        const nextScene = {
          ...requestedScene,
          hotspots: this.hotspotLoader.normalizeHotspots(requestedScene.hotspots, requestedScene),
          minimap_image: requestedScene.minimap_image || null,
          media_available: state.currentScene?.media_available ?? true
        };

        this.store.patch({
          currentTour: tour,
          currentScene: nextScene,
          currentSceneId: nextScene.id
        });
        this.syncSceneSelect(tour, nextScene.id);
        this.applyTourTitle(tour, nextScene);
        await this.platformCoordinator.renderCurrent();
        return;
      }
    }

    this.editorDraftApplyToken = (this.editorDraftApplyToken ?? 0) + 1;
    const applyToken = this.editorDraftApplyToken;

    const nextScene = await this.sceneLoader.loadScene(
      tour,
      targetSceneId,
      state.cfg
    );

    if (applyToken !== this.editorDraftApplyToken) {
      return;
    }

    this.store.patch({
      currentTour: tour,
      currentScene: nextScene,
      currentSceneId: nextScene.id
    });
    this.syncSceneSelect(tour, nextScene.id);
    this.applyTourTitle(tour, nextScene);
    await this.platformCoordinator.renderCurrent();
  }

  applyDocumentTitle(cfg) {
    document.title = cfg?.ui?.title ?? cfg?.app?.name ?? "WPA360";
  }

  applyTourTitle(tour, scene) {
    if (!this.elements.titleRoot || !tour) {
      return;
    }
    this.elements.titleRoot.textContent = scene?.title ? `${tour.title} / ${scene.title}` : tour.title;
  }

  updatePlatformButtons(platformId) {
    for (const button of this.elements.platformButtons) {
      const isActive = button.dataset.platformSwitch === platformId;
      const isVrButton = button.dataset.platformSwitch === PLATFORM_VR;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.title = isActive
        ? `${isVrButton ? "Modo VR" : "Modo 2D"} ativo.`
        : `Alternar para ${isVrButton ? "o modo VR" : "o modo 2D"}.`;
    }
  }

  updatePlatformBadge(platformId) {
    const badge = this.elements.platformBadge;
    if (!badge || badge.dataset.uiEnabled === "false") {
      return;
    }

    const label = platformId === PLATFORM_VR
      ? "Plataforma: VR"
      : platformId === PLATFORM_2D
        ? "Plataforma: 2D"
        : "Plataforma: Auto";

    badge.textContent = label;
    badge.title = `${label}. Informa qual plataforma de execucao esta ativa agora.`;
    badge.setAttribute("aria-label", label);
    badge.hidden = false;
    badge.dataset.state = platformId === PLATFORM_VR ? "positive" : "neutral";
    this.updateBadgeStripVisibility();
  }

  async maybeRegisterServiceWorker(cfg) {
    const swAvailability = getServiceWorkerAvailability();
    this.serviceWorkerRuntimeState = swAvailability.state;

    if (cfg?.features?.service_worker === false || !swAvailability.shouldAttemptRegistration) {
      return;
    }

    try {
      await navigator.serviceWorker.register("./sw.js");
      this.serviceWorkerRuntimeState = "registered";
    } catch (error) {
      this.serviceWorkerRuntimeState = "error";
      console.warn("[WPA360] service worker registration failed", error);
    }
  }

  applyChromeConfig(cfg) {
    const chrome = cfg?.ui?.chrome ?? {};
    this.setUiItemVisibility("brand-mark", chrome.show_brand_mark !== false);
    this.setUiItemVisibility("brand-name", chrome.show_brand_name !== false);
    this.setUiItemVisibility("scene-select", chrome.show_scene_select !== false);
    this.setUiItemVisibility("pwa-install-button", chrome.show_pwa_install_button !== false);
    this.primeBadgeItem(this.elements.platformBadge, chrome.show_platform_badge !== false);
    this.primeBadgeItem(this.elements.webxrBadge, chrome.show_webxr_badge !== false);
    this.primeBadgeItem(this.elements.pwaBadge, chrome.show_pwa_badge !== false);
    this.primeBadgeItem(this.elements.serviceWorkerBadge, chrome.show_service_worker_badge !== false);
    this.primeBadgeItem(this.elements.inputBadge, chrome.show_input_badge !== false);
    this.primeBadgeItem(this.elements.standaloneBadge, chrome.show_standalone_badge !== false);
    this.updateInstallButton();
    this.updateActiveTourDownloadButton();
    this.updateBadgeStripVisibility();
  }

  setUiItemVisibility(itemName, isVisible) {
    const item = this.elements.uiItems?.find((candidate) => candidate.dataset.uiItem === itemName);
    if (!item) {
      return;
    }
    item.hidden = !isVisible;
  }

  primeBadgeItem(item, isEnabled) {
    if (!item) {
      return;
    }

    item.dataset.uiEnabled = isEnabled ? "true" : "false";
    if (!isEnabled) {
      item.hidden = true;
      item.textContent = "";
      item.title = "";
      item.removeAttribute("aria-label");
      return;
    }

    if (!String(item.textContent ?? "").trim()) {
      item.hidden = true;
    }
  }

  handleBeforeInstallPrompt(event) {
    event.preventDefault();
    this.deferredInstallPrompt = event;
    this.updateInstallButton();
    this.refreshCapabilityBadges().catch((error) => {
      console.warn("[WPA360] capability refresh failed after beforeinstallprompt", error);
    });
  }

  handleAppInstalled() {
    this.deferredInstallPrompt = null;
    this.updateInstallButton();
    this.refreshCapabilityBadges().catch((error) => {
      console.warn("[WPA360] capability refresh failed after appinstalled", error);
    });
  }

  handleStandaloneModeChange() {
    this.updateInstallButton();
    this.refreshCapabilityBadges().catch((error) => {
      console.warn("[WPA360] capability refresh failed after display-mode change", error);
    });
  }

  async installPwa() {
    if (!this.deferredInstallPrompt) {
      this.setStatus("A instalacao PWA nao esta disponivel neste momento.", { hideAfterMs: 1800 });
      return;
    }

    const installPrompt = this.deferredInstallPrompt;
    this.deferredInstallPrompt = null;
    this.updateInstallButton();

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);

    if (choice?.outcome === "accepted") {
      this.setStatus("Instalacao do app iniciada.", { hideAfterMs: 1800 });
    } else {
      this.setStatus("Instalacao do app cancelada.", { hideAfterMs: 1800 });
    }

    await this.refreshCapabilityBadges();
    this.updateInstallButton();
  }

  updateInstallButton() {
    const button = this.elements.installButton;
    const cfg = this.store.getSnapshot().cfg;
    if (!button) {
      return;
    }

    const visibleByConfig = cfg?.ui?.chrome?.show_pwa_install_button !== false;
    const canInstall = visibleByConfig && this.canInstallPwa();

    button.hidden = !canInstall;
    button.disabled = !canInstall;
    button.title = canInstall
      ? "Instale o tour como aplicativo para abrir mais rapido e usar melhor o modo offline."
      : "A instalacao PWA nao esta disponivel no ambiente atual.";
    button.setAttribute("aria-label", canInstall ? "Instalar aplicativo PWA" : "Instalacao PWA indisponivel");
  }

  updateXrDebugButton() {
    const button = this.elements.xrDebugDownloadButton;
    if (!button) {
      return;
    }

    const enabled = this.xrDebug?.isEnabled?.() === true;
    button.hidden = !enabled;
    button.disabled = !enabled;
    button.title = enabled
      ? "Baixar o log XR da sessao atual para compartilhar na analise."
      : "O download do log XR so fica disponivel quando ?debug_xr=1 esta ativo.";
    button.setAttribute("aria-label", enabled ? "Baixar log XR" : "Download de log XR indisponivel");
  }

  updateActiveTourDownloadButton() {
    const button = this.elements.downloadActiveTourButton;
    const feedbackRoot = this.elements.downloadActiveTourFeedbackRoot;
    const feedbackLabel = this.elements.downloadActiveTourFeedbackLabel;
    const feedbackCount = this.elements.downloadActiveTourFeedbackCount;
    const feedbackBar = this.elements.downloadActiveTourFeedbackBar;
    if (!button) {
      return;
    }

    const state = this.store.getSnapshot();
    const currentTour = state.currentTour ?? null;
    const isRuntimeBusy = Boolean(this.activeRuntimeTransition);
    const downloadJob = this.activeTourDownloadJob;
    const isDownloading = Boolean(downloadJob);
    const completedCount = Number(downloadJob?.completedCount ?? 0);
    const totalCount = Number(downloadJob?.totalCount ?? 0);
    const completionRatio = totalCount > 0
      ? Math.max(0, Math.min(1, completedCount / totalCount))
      : 0;

    button.hidden = false;
    button.disabled = !currentTour || isRuntimeBusy || isDownloading;
    button.textContent = isDownloading && totalCount > 0
      ? "Downloading..."
      : "Download Active Tour";

    if (!currentTour) {
      if (feedbackRoot) {
        feedbackRoot.hidden = true;
      }
      button.title = "Carregue um tour para poder baixar as imagens dele para o cache do navegador.";
      button.setAttribute("aria-label", "Download do tour ativo indisponivel");
      return;
    }

    if (isDownloading) {
      const jobTourTitle = downloadJob?.tourTitle ?? currentTour.title ?? currentTour.id;
      if (feedbackRoot) {
        feedbackRoot.hidden = false;
      }
      if (feedbackLabel) {
        feedbackLabel.textContent = `Baixando ${jobTourTitle}`;
      }
      if (feedbackCount) {
        feedbackCount.textContent = `${completedCount}/${totalCount}`;
      }
      if (feedbackBar) {
        feedbackBar.style.width = `${(completionRatio * 100).toFixed(2)}%`;
      }
      button.title = `Baixando para o cache do navegador as imagens do tour ${jobTourTitle}.`;
      button.setAttribute("aria-label", `Baixando tour ${jobTourTitle}`);
      return;
    }

    if (feedbackRoot) {
      feedbackRoot.hidden = true;
    }
    if (feedbackLabel) {
      feedbackLabel.textContent = "Preparando download...";
    }
    if (feedbackCount) {
      feedbackCount.textContent = "0/0";
    }
    if (feedbackBar) {
      feedbackBar.style.width = "0%";
    }
    button.title = `Baixar para o cache do navegador as imagens do tour ${currentTour.title ?? currentTour.id}, para reduzir a espera entre cenas.`;
    button.setAttribute("aria-label", `Baixar tour ${currentTour.title ?? currentTour.id}`);
  }

  async downloadXrDebugLog() {
    if (!this.xrDebug?.isEnabled?.()) {
      this.setStatus("Ative ?debug_xr=1 para baixar o log XR.", { hideAfterMs: 1800 });
      return;
    }

    const dump = this.xrDebug.dump();
    const payload = JSON.stringify(dump, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const state = this.store.getSnapshot();
    anchor.href = url;
    anchor.download = `wpa360-xr-debug-${sanitizeFileToken(state.currentTour?.id ?? "tour")}-${sanitizeFileToken(state.currentSceneId ?? "scene")}-${createFileTimestamp()}.json`;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    this.setStatus("Log XR baixado.", { hideAfterMs: 1800 });
  }

  async downloadActiveTour() {
    if (this.activeTourDownloadJob?.promise) {
      return this.activeTourDownloadJob.promise;
    }

    const state = this.store.getSnapshot();
    const tour = state.currentTour ?? null;
    if (!tour?.scenes?.length) {
      this.setStatus("Nao ha um tour ativo para baixar.", { hideAfterMs: 1800 });
      return;
    }

    const urls = this.collectActiveTourDownloadSources(tour);
    if (urls.length === 0) {
      this.setStatus("O tour ativo nao possui imagens para baixar.", { hideAfterMs: 1800 });
      return;
    }

    const concurrency = this.getHybridWarmConcurrency(state.cfg);
    const job = {
      tourId: tour.id ?? null,
      tourTitle: tour.title ?? tour.id ?? "tour",
      totalCount: urls.length,
      completedCount: 0,
      promise: null
    };

    const updateProgress = (message) => {
      this.updateActiveTourDownloadButton();
      if (message) {
        this.setStatus(message);
      }
    };

    this.activeTourDownloadJob = job;
    updateProgress(`Baixando tour ${job.tourTitle}... 0/${job.totalCount}`);
    this.debugLog("active-tour-download:start", {
      tourId: job.tourId,
      urlCount: job.totalCount,
      concurrency
    });
    await nextAnimationFrame();

    job.promise = runPromisePool(urls, concurrency, async (url) => {
      try {
        return await this.assetCache.warmUrl(url, { optional: false });
      } finally {
        job.completedCount += 1;
        updateProgress(`Baixando tour ${job.tourTitle}... ${job.completedCount}/${job.totalCount}`);
      }
    });

    try {
      const results = await job.promise;
      const warmedCount = results.filter((result) => result?.status === "fulfilled" && result?.value).length;
      const failedCount = results.filter((result) => result?.status === "rejected").length;
      this.debugLog("active-tour-download:complete", {
        tourId: job.tourId,
        warmedCount,
        failedCount,
        urlCount: job.totalCount
      });
      this.setStatus(
        failedCount > 0
          ? `Tour ${job.tourTitle} baixado parcialmente: ${warmedCount}/${job.totalCount} imagens em cache.`
          : `Tour ${job.tourTitle} baixado: ${warmedCount} imagens em cache.`,
        { hideAfterMs: 2600 }
      );
      return results;
    } finally {
      if (this.activeTourDownloadJob === job) {
        this.activeTourDownloadJob = null;
      }
      this.updateActiveTourDownloadButton();
    }
  }

  canInstallPwa() {
    return Boolean(this.deferredInstallPrompt) && !this.isRunningStandalone();
  }

  isRunningStandalone() {
    return Boolean(
      this.standaloneMediaQuery?.matches
      || window.navigator?.standalone === true
    );
  }

  async refreshCapabilityBadges() {
    const cfg = this.store.getSnapshot().cfg;
    if (!cfg) {
      return;
    }

    const inputProfile = this.platformSelector.getInputProfile();
    const webxrSupported = await this.detectWebxrSupport();

    this.updateCapabilityBadge(this.elements.webxrBadge, cfg?.ui?.chrome?.show_webxr_badge !== false, {
      label: webxrSupported ? "WebXR pronto" : "Sem WebXR",
      state: webxrSupported ? "positive" : "muted",
      title: webxrSupported
        ? "WebXR imersivo detectado e pronto para uso neste navegador."
        : "Este navegador ou dispositivo nao expôs suporte a WebXR imersivo."
    });

    this.updateCapabilityBadge(this.elements.pwaBadge, cfg?.ui?.chrome?.show_pwa_badge !== false, {
      label: this.isRunningStandalone()
        ? "PWA ativo"
        : this.canInstallPwa()
          ? "PWA instalavel"
          : "PWA web",
      state: this.isRunningStandalone() || this.canInstallPwa() ? "positive" : "neutral",
      title: this.isRunningStandalone()
        ? "O tour esta rodando como aplicativo instalado."
        : this.canInstallPwa()
          ? "O tour pode ser instalado como aplicativo PWA neste dispositivo."
          : "O tour esta rodando apenas no navegador, sem instalacao disponivel agora."
    });

    this.updateCapabilityBadge(this.elements.serviceWorkerBadge, cfg?.ui?.chrome?.show_service_worker_badge !== false, {
      ...describeServiceWorkerBadge(this.serviceWorkerRuntimeState)
    });

    this.updateCapabilityBadge(this.elements.inputBadge, cfg?.ui?.chrome?.show_input_badge !== false, {
      label: inputProfile.coarse ? "Input touch" : "Input mouse",
      state: "neutral",
      title: inputProfile.coarse
        ? "Perfil de entrada detectado: toque ou dispositivo com ponteiro impreciso."
        : "Perfil de entrada detectado: mouse ou ponteiro preciso."
    });

    this.updateCapabilityBadge(this.elements.standaloneBadge, cfg?.ui?.chrome?.show_standalone_badge !== false, {
      label: this.isRunningStandalone() ? "Modo app" : "Modo browser",
      state: this.isRunningStandalone() ? "positive" : "neutral",
      title: this.isRunningStandalone()
        ? "A interface esta aberta como aplicativo independente."
        : "A interface esta aberta no navegador."
    });

    this.updateBadgeStripVisibility();
  }

  async detectWebxrSupport() {
    if (!this.webxrSupportPromise) {
      this.webxrSupportPromise = navigator.xr?.isSessionSupported
        ? navigator.xr.isSessionSupported("immersive-vr").catch(() => false)
        : Promise.resolve(false);
    }

    return this.webxrSupportPromise;
  }

  updateCapabilityBadge(element, isEnabled, { label, state = "neutral", title = "" }) {
    if (!element) {
      return;
    }

    element.dataset.uiEnabled = isEnabled ? "true" : "false";
    element.hidden = !isEnabled;
    if (!isEnabled) {
      element.textContent = "";
      element.title = "";
      element.removeAttribute("aria-label");
      return;
    }

    element.textContent = label;
    element.title = title || label;
    element.setAttribute("aria-label", label);
    element.hidden = false;
    element.dataset.state = state;
  }

  updateBadgeStripVisibility() {
    const root = this.elements.badgesRoot;
    if (!root) {
      return;
    }

    const hasVisibleBadge = Array.from(root.children).some((child) => {
      return !child.hidden && String(child.textContent ?? "").trim().length > 0;
    });
    root.hidden = !hasVisibleBadge;
  }

  async maybeLoadEditor(cfg) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("editor") !== "1" || cfg?.features?.editor === false) {
      return;
    }

    if (this.editorModule) {
      return this.editorModule;
    }

    const { mountEditor } = await import("../editor/EditorModule.js");
    this.editorModule = mountEditor({
      root: this.elements.editorRoot,
      context: this.context
    });
    return this.editorModule;
  }

  getEditorBridge() {
    if (!this.editorModule) {
      return null;
    }

    return {
      draftStore: this.editorModule.draftStore,
      placementController: this.editorModule.placementController
    };
  }

  async getEditorTourCatalog(tourId) {
    const state = this.store.getSnapshot();
    const normalizedTourId = String(tourId ?? "").trim();
    if (!normalizedTourId) {
      return null;
    }

    if (state.currentTour && (state.currentTour.id === normalizedTourId || state.currentTourEntry?.id === normalizedTourId)) {
      return {
        tourId: state.currentTour.id ?? normalizedTourId,
        title: state.currentTour.title ?? normalizedTourId,
        scenes: (state.currentTour.scenes ?? []).map((scene) => ({
          id: scene.id,
          title: scene.title || scene.id
        }))
      };
    }

    if (this.editorTourCatalogCache.has(normalizedTourId)) {
      return this.editorTourCatalogCache.get(normalizedTourId);
    }

    const entry = state.master?.tours?.find((candidate) => candidate.id === normalizedTourId) ?? null;
    if (!entry) {
      return null;
    }

    const tour = await this.tourLoader.load(entry);
    const catalog = {
      tourId: tour.id ?? entry.id,
      title: tour.title ?? entry.title ?? entry.id,
      scenes: (tour.scenes ?? []).map((scene) => ({
        id: scene.id,
        title: scene.title || scene.id
      }))
    };
    this.editorTourCatalogCache.set(normalizedTourId, catalog);
    return catalog;
  }

  setStatus(message, { hideAfterMs = 0 } = {}) {
    const root = this.elements.statusRoot;
    if (!root) {
      return;
    }

    root.textContent = message;
    root.classList.remove("is-hidden");
    window.clearTimeout(this.statusTimer);

    if (hideAfterMs > 0) {
      this.statusTimer = window.setTimeout(() => {
        root.classList.add("is-hidden");
      }, hideAfterMs);
    }
  }

  debugLog(eventName, payload = {}) {
    console.debug("[WPA360]", eventName, payload);
  }

  async prepareTourAssets(tour, cfg, { reason = "runtime", prioritySceneId = null, guard = null } = {}) {
    if (!this.isPreloadGuardActive(guard, tour)) {
      return {
        preloadMode: this.getScenePreloadMode(cfg),
        imageCount: 0,
        failedSceneCount: 0,
        textureCount: 0
      };
    }
    const preloadMode = this.getScenePreloadMode(cfg);
    const platformId = this.store.getSnapshot().platformId ?? null;
    const allowDecodedScenePreload = platformId !== PLATFORM_2D && platformId != null;
    const preloadScenes = this.resolvePreloadScenesForTour(tour, prioritySceneId, cfg);
    if (!tour?.scenes?.length) {
      return {
        preloadMode,
        imageCount: 0,
        failedSceneCount: 0,
        textureCount: 0
      };
    }

    if (preloadMode === "hybrid" && platformId !== PLATFORM_2D) {
      this.startBackgroundTourWarm(tour, cfg, { reason });
    }

    this.assetCache.setPinnedImages(
      allowDecodedScenePreload
        ? this.collectPinnedAssetSources(preloadScenes, cfg)
        : []
    );
    this.debugLog("scene-preload:start", {
      reason,
      tourId: tour.id ?? null,
      prioritySceneId,
      preloadMode,
      sceneIds: preloadScenes.map((scene) => scene.id),
      strategy: allowDecodedScenePreload ? "decoded-preload" : "network-only"
    });

    if (preloadMode === "none" || preloadScenes.length === 0 || !allowDecodedScenePreload) {
      if (!this.isPreloadGuardActive(guard, tour)) {
        return {
          preloadMode,
          imageCount: 0,
          failedSceneCount: 0,
          textureCount: 0
        };
      }
      const textureResults = await this.prepareActiveRendererForTour(tour, cfg, {
        reason,
        prioritySceneId,
        guard
      });
      this.debugLog("scene-preload:complete", {
        reason,
        tourId: tour.id ?? null,
        sceneCount: 0,
        failedSceneCount: 0,
        preloadMode,
        strategy: allowDecodedScenePreload ? "decoded-preload" : "network-only"
      });
      return {
        preloadMode,
        imageCount: 0,
        failedSceneCount: 0,
        textureCount: textureResults.length
      };
    }

    let scenePreloadErrors = [];
    try {
      scenePreloadErrors = await this.sceneLoader.preloadScenes(
        tour,
        preloadScenes.map((scene) => scene.id),
        cfg,
        { prioritySceneId }
      );
      if (!this.isPreloadGuardActive(guard, tour)) {
        return {
          preloadMode,
          imageCount: 0,
          failedSceneCount: 0,
          textureCount: 0
        };
      }
      this.debugLog("scene-preload:complete", {
        reason,
        tourId: tour.id ?? null,
        sceneCount: preloadScenes.length,
        failedSceneCount: scenePreloadErrors.length,
        preloadMode
      });
    } catch (error) {
      console.warn("[WPA360] scene preload failed", error);
      this.debugLog("scene-preload:error", {
        reason,
        tourId: tour.id ?? null,
        preloadMode,
        error: error?.message ?? String(error)
      });
      throw error;
    }

    const textureResults = await this.prepareActiveRendererForTour(tour, cfg, {
      reason,
      prioritySceneId,
      guard
    });
    return {
      preloadMode,
      imageCount: this.collectSceneMediaSources(preloadScenes).length,
      failedSceneCount: scenePreloadErrors.length,
      textureCount: textureResults.length
    };
  }

  async prepareActiveRendererForTour(tour, cfg, { reason = "runtime", prioritySceneId = null, guard = null } = {}) {
    if (!this.isPreloadGuardActive(guard, tour)) {
      return [];
    }
    const renderer = this.platformCoordinator.getActiveRenderer();
    if (!renderer?.preloadSceneTextures || !tour?.scenes?.length) {
      return [];
    }

    const platformId = this.store.getSnapshot().platformId ?? null;
    if (platformId === PLATFORM_2D) {
      this.debugLog("renderer-texture-preload:skipped", {
        reason,
        tourId: tour.id ?? null,
        platformId,
        skipReason: "2d-renderer-texture-preload-disabled"
      });
      return [];
    }

    const preloadMode = this.getScenePreloadMode(cfg);
    const scenes = this.resolvePreloadScenesForTour(tour, prioritySceneId, cfg);

    this.debugLog("renderer-texture-preload:start", {
      reason,
      tourId: tour.id ?? null,
      platformId,
      sceneCount: scenes.length,
      preloadMode,
      sceneIds: scenes.map((scene) => scene.id)
    });

    const results = await renderer.preloadSceneTextures(scenes);
    if (!this.isPreloadGuardActive(guard, tour)) {
      return [];
    }
    this.debugLog("renderer-texture-preload:complete", {
      reason,
      tourId: tour.id ?? null,
      preloadMode,
      readyTextureCount: results.filter((result) => result?.status === "ready").length,
      skippedTextureCount: results.filter((result) => result?.status !== "ready").length
    });
    return results;
  }

  getScenePreloadMode(cfg) {
    const configuredMode = String(cfg?.asset_cache?.preload_mode ?? "").trim().toLowerCase();
    if (
      configuredMode === "full"
      || configuredMode === "selective"
      || configuredMode === "minimal"
      || configuredMode === "hybrid"
      || configuredMode === "none"
    ) {
      return configuredMode;
    }

    return cfg?.asset_cache?.preload_tour_scene_media === true ? "full" : "none";
  }

  shouldUseVrDeferredMediaLoad(state, scene) {
    return state?.platformId === PLATFORM_VR && isStereoMediaScene(scene);
  }

  async awaitRendererScenePresentation(renderer, renderResult, { reason = "runtime", sceneId = null } = {}) {
    if (!renderer?.waitForScenePresentation) {
      return null;
    }

    const transitionId = renderResult?.transitionId
      ?? renderer.getCurrentSceneTransition?.()?.transitionId
      ?? null;
    if (!transitionId) {
      return null;
    }

    this.xrDebug.log("scene-presentation-wait-start", {
      transitionId,
      sceneId,
      details: {
        reason
      }
    });
    const result = await renderer.waitForScenePresentation(transitionId);
    this.debugLog("scene-presentation:complete", {
      reason,
      platform: this.store.getSnapshot().platformId ?? null,
      sceneId: result?.sceneId ?? sceneId ?? null,
      transitionId,
      state: result?.state ?? null,
      presented: result?.presented === true,
      frameSource: result?.frameSource ?? null
    });
    this.xrDebug.log("scene-presentation-wait-complete", {
      transitionId,
      sceneId: result?.sceneId ?? sceneId ?? null,
      src: result?.src ?? null,
      details: {
        reason,
        state: result?.state ?? null,
        presented: result?.presented === true,
        frameSource: result?.frameSource ?? null
      }
    });
    return result;
  }

  resolvePreloadScenesForTour(tour, currentSceneId = null, cfg = null) {
    const scenes = tour?.scenes ?? [];
    if (scenes.length === 0) {
      return [];
    }

    const preloadMode = this.getScenePreloadMode(cfg);
    if (preloadMode === "full") {
      return [...scenes];
    }

    if (preloadMode === "none") {
      return [];
    }

    const currentScene = scenes.find((scene) => scene.id === currentSceneId) ?? scenes[0] ?? null;
    if (!currentScene) {
      return [];
    }

    const nextSceneIds = this.collectLinkedSceneIdsForPreload(currentScene, tour);
    const linkedSceneLimit = preloadMode === "minimal"
      ? 1
      : preloadMode === "hybrid"
        ? Math.max(0, this.getHybridResidentSceneLimit(cfg) - 1)
        : nextSceneIds.length;
    const limitedLinkedSceneIds = nextSceneIds.slice(0, linkedSceneLimit);
    const orderedSceneIds = [currentScene.id, ...limitedLinkedSceneIds];
    const seenIds = new Set();

    return orderedSceneIds
      .filter((sceneId) => {
        if (!sceneId || seenIds.has(sceneId)) {
          return false;
        }
        seenIds.add(sceneId);
        return true;
      })
      .map((sceneId) => scenes.find((scene) => scene.id === sceneId) ?? null)
      .filter(Boolean);
  }

  getHybridResidentSceneLimit(cfg) {
    const configuredLimit = Number(cfg?.asset_cache?.hybrid_resident_scene_limit ?? 3);
    if (!Number.isFinite(configuredLimit)) {
      return 3;
    }
    return Math.max(1, Math.min(8, Math.floor(configuredLimit)));
  }

  getHybridWarmConcurrency(cfg) {
    const configuredConcurrency = Number(cfg?.asset_cache?.hybrid_download_concurrency ?? 2);
    if (!Number.isFinite(configuredConcurrency)) {
      return 2;
    }
    return Math.max(1, Math.min(4, Math.floor(configuredConcurrency)));
  }

  collectLinkedSceneIdsForPreload(scene, tour) {
    const availableSceneIds = new Set((tour?.scenes ?? []).map((candidate) => candidate.id));
    const currentTourId = String(tour?.id ?? "").trim();
    const linkedSceneIds = [];

    for (const hotspot of scene?.hotspots ?? []) {
      if (hotspot?.type !== "scene_link") {
        continue;
      }

      const targetSceneId = String(hotspot?.target_scene ?? "").trim();
      if (!targetSceneId || !availableSceneIds.has(targetSceneId)) {
        continue;
      }

      const targetTourId = String(hotspot?.target_tour ?? currentTourId).trim() || currentTourId;
      if (targetTourId !== currentTourId) {
        continue;
      }

      linkedSceneIds.push(targetSceneId);
    }

    return Array.from(new Set(linkedSceneIds));
  }

  startBackgroundTourWarm(tour, cfg, { reason = "runtime" } = {}) {
    if (!tour?.scenes?.length || this.getScenePreloadMode(cfg) !== "hybrid") {
      return null;
    }

    const existingJob = this.backgroundWarmJobs.get(tour);
    if (existingJob) {
      return existingJob;
    }

    const urls = this.collectPinnedAssetSources(tour.scenes ?? [], cfg);
    const concurrency = this.getHybridWarmConcurrency(cfg);
    this.debugLog("scene-network-warm:start", {
      reason,
      tourId: tour.id ?? null,
      urlCount: urls.length,
      concurrency
    });

    const warmJob = this.assetCache.warmAssets(urls, {
      optional: true,
      concurrency
    })
      .then((results = []) => {
        const warmedCount = results.filter((result) => result?.status === "fulfilled" && result?.value).length;
        const failedCount = results.filter((result) => result?.status === "rejected").length;
        this.debugLog("scene-network-warm:complete", {
          reason,
          tourId: tour.id ?? null,
          warmedCount,
          failedCount
        });
        return results;
      })
      .catch((error) => {
        console.warn("[WPA360] scene network warm failed", error);
        this.debugLog("scene-network-warm:error", {
          reason,
          tourId: tour.id ?? null,
          error: error?.message ?? String(error)
        });
        throw error;
      })
      .finally(() => {
        if (this.backgroundWarmJobs.get(tour) === warmJob) {
          this.backgroundWarmJobs.delete(tour);
        }
      });

    this.backgroundWarmJobs.set(tour, warmJob);
    return warmJob;
  }

  collectPinnedAssetSources(scenes, cfg) {
    const sources = [...this.collectSceneMediaSources(scenes)];
    if (cfg?.asset_cache?.preload_minimap_images !== false) {
      for (const scene of scenes ?? []) {
        if (scene?.minimap_image) {
          sources.push(scene.minimap_image);
        }
      }
    }
    return sources;
  }

  collectActiveTourDownloadSources(tour) {
    const scenes = tour?.scenes ?? [];
    if (scenes.length === 0) {
      return [];
    }

    const sources = [
      ...this.collectSceneMediaSources(scenes),
      ...this.collectMinimapSources(scenes),
      ...this.collectHotspotMarkerIconSources(scenes)
    ];

    return Array.from(new Set(sources.filter(Boolean)));
  }

  collectSceneMediaSources(source) {
    const scenes = Array.isArray(source)
      ? source
      : (source?.scenes ?? []);
    return Array.from(new Set(
      scenes
        .map((scene) => scene?.media?.src)
        .filter(Boolean)
    ));
  }

  collectMinimapSources(source) {
    const scenes = Array.isArray(source)
      ? source
      : (source?.scenes ?? []);
    return Array.from(new Set(
      scenes
        .map((scene) => scene?.minimap_image)
        .filter(Boolean)
    ));
  }

  collectHotspotMarkerIconSources(source) {
    const scenes = Array.isArray(source)
      ? source
      : (source?.scenes ?? []);
    return Array.from(new Set(
      scenes.flatMap((scene) => (
        scene?.hotspots ?? []
      ).map((hotspot) => {
        const explicitMarkerIcon = hotspot?.marker_icon;
        if (typeof explicitMarkerIcon === "string") {
          return explicitMarkerIcon;
        }
        if (explicitMarkerIcon && typeof explicitMarkerIcon.src === "string") {
          return explicitMarkerIcon.src;
        }
        return typeof hotspot?.marker_icon_src === "string" ? hotspot.marker_icon_src : null;
      }).filter(Boolean))
    ));
  }

  getDebugSnapshot() {
    const state = this.store.getSnapshot();
    const renderer = this.platformCoordinator.getActiveRenderer();

    return {
      platformId: state.platformId,
      tourId: state.currentTour?.id ?? null,
      sceneId: state.currentSceneId ?? null,
      presenting: renderer?.isPresenting?.() ?? false,
      preloadMode: this.getScenePreloadMode(state.cfg),
      caches: this.assetCache.getStats(),
      performance: renderer?.getPerformanceSnapshot?.() ?? null,
      rendererResources: renderer?.getRenderResourceStats?.() ?? null
    };
  }

  getXrDebugContext() {
    const state = this.store.getSnapshot();
    const renderer = this.platformCoordinator.getActiveRenderer();
    const transition = renderer?.getCurrentSceneTransition?.() ?? null;
    const loadingState = renderer?.getLoadingDebugState?.() ?? null;

    return {
      platformId: state.platformId ?? null,
      sceneId: state.currentSceneId ?? transition?.sceneId ?? null,
      src: transition?.src ?? state.currentScene?.media?.src ?? null,
      transitionId: transition?.transitionId ?? null,
      presenting: renderer?.isPresenting?.() ?? false,
      overlayVisible: loadingState?.visible === true,
      focus: document.hasFocus(),
      visibility: document.visibilityState
    };
  }

  handleError(error) {
    console.error("[WPA360]", error);
    this.xrDebug.log("app-error", {
      details: {
        message: error?.message ?? String(error)
      }
    });
    this.store.patch({ error, isLoading: false });
    this.setStatus(error.message);
  }

  beginRuntimeTransition(kind, target = null) {
    if (this.activeRuntimeTransition) {
      this.debugLog("transition:blocked", {
        requestedKind: kind,
        requestedTarget: target,
        activeKind: this.activeRuntimeTransition.kind,
        activeTarget: this.activeRuntimeTransition.target
      });
      return null;
    }

    const token = ++this.runtimeTransitionCounter;
    this.activeRuntimeTransition = { token, kind, target };
    this.backgroundPreloadGeneration += 1;
    this.store.patch({ isLoading: true, error: null });
    this.applyRuntimeBusyState(true);
    this.xrDebug.log("runtime-transition-start", {
      details: {
        token,
        kind,
        target
      }
    });
    return token;
  }

  finishRuntimeTransition(token) {
    if (!this.isRuntimeTransitionActive(token)) {
      return;
    }

    this.xrDebug.log("runtime-transition-complete", {
      details: {
        token,
        kind: this.activeRuntimeTransition?.kind ?? null,
        target: this.activeRuntimeTransition?.target ?? null
      }
    });
    this.activeRuntimeTransition = null;
    this.store.patch({ isLoading: false });
    this.applyRuntimeBusyState(false);
  }

  isRuntimeTransitionActive(token) {
    return this.activeRuntimeTransition?.token === token;
  }

  createBackgroundPreloadGuard(tour) {
    return {
      generation: this.backgroundPreloadGeneration,
      tourId: tour?.id ?? null
    };
  }

  isPreloadGuardActive(guard, tour) {
    if (!guard) {
      return true;
    }

    return guard.generation === this.backgroundPreloadGeneration
      && guard.tourId === (tour?.id ?? null);
  }

  applyRuntimeBusyState(isBusy) {
    if (this.elements.tourSelect) {
      this.elements.tourSelect.disabled = isBusy;
    }

    if (this.elements.sceneSelect) {
      const state = this.store.getSnapshot();
      this.elements.sceneSelect.disabled = isBusy || (state.currentTour?.scenes?.length ?? 0) === 0;
    }

    for (const button of this.elements.platformButtons ?? []) {
      button.disabled = isBusy;
    }

    this.updateActiveTourDownloadButton();
  }

  releaseInactiveTourResources(previousTour, activeScene = null) {
    this.sceneLoader.clearTourCache(previousTour);
    this.backgroundWarmJobs.delete(previousTour);

    const preserveUrls = [
      activeScene?.media?.src,
      activeScene?.minimap_image
    ].filter(Boolean);

    this.assetCache.setPinnedImages(preserveUrls);
    this.assetCache.trimImageCache({
      preserveUrls,
      maxEntries: Math.max(2, preserveUrls.length)
    });

    const renderer = this.platformCoordinator.getActiveRenderer();
    renderer?.setPinnedTextureSources?.(preserveUrls);
    renderer?.evictTextures?.(preserveUrls);
  }
}

async function runPromisePool(items, concurrency, worker) {
  const queue = Array.isArray(items) ? items : [];
  if (queue.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(Number(concurrency) || 1, queue.length));
  const results = new Array(queue.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: safeConcurrency }, async () => {
    while (cursor < queue.length) {
      const currentIndex = cursor;
      cursor += 1;
      const currentItem = queue[currentIndex];
      try {
        const value = await worker(currentItem, currentIndex);
        results[currentIndex] = { status: "fulfilled", value };
      } catch (error) {
        results[currentIndex] = { status: "rejected", reason: error };
      }
    }
  }));

  return results;
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}

function resolveSceneOrientationOptions(scene, hotspot = null) {
  if (hotspot?.apply_hotspot_scene_yaw === true) {
    return {
      preserveOrientation: false,
      entryYaw: safeNumber(hotspot?.hotspot_define_scene_yaw, 0),
      orientationSource: "hotspot"
    };
  }

  if (scene?.scene_global_yaw !== false) {
    return {
      preserveOrientation: false,
      entryYaw: safeNumber(scene?.rotation?.yaw, 0),
      orientationSource: "scene"
    };
  }

  return {
    preserveOrientation: true,
    entryYaw: null,
    orientationSource: "preserve"
  };
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getServiceWorkerAvailability() {
  if (!("serviceWorker" in navigator)) {
    return {
      shouldAttemptRegistration: false,
      state: "unsupported"
    };
  }

  if (window.isSecureContext !== true) {
    return {
      shouldAttemptRegistration: false,
      state: "insecure-context"
    };
  }

  const locationUrl = new URL(window.location.href);
  if (locationUrl.protocol === "https:" && isPrivateNetworkHost(locationUrl.hostname)) {
    return {
      shouldAttemptRegistration: false,
      state: "skipped-local-https"
    };
  }

  return {
    shouldAttemptRegistration: true,
    state: "supported"
  };
}

function describeServiceWorkerBadge(runtimeState) {
  switch (runtimeState) {
    case "registered":
      return {
        label: "SW ativo",
        state: "positive",
        title: "O service worker foi registrado com sucesso para cache e funcionamento offline."
      };
    case "supported":
      return {
        label: "SW suportado",
        state: "positive",
        title: "O navegador suporta service worker para cache e funcionamento offline."
      };
    case "skipped-local-https":
      return {
        label: "SW local pulado",
        state: "neutral",
        title: "O registro do service worker foi desativado neste host local com HTTPS por IP para evitar falhas de certificado durante o desenvolvimento."
      };
    case "insecure-context":
      return {
        label: "SW indisponivel",
        state: "muted",
        title: "O contexto atual nao e seguro o suficiente para registrar service worker."
      };
    case "error":
      return {
        label: "SW com erro",
        state: "muted",
        title: "O navegador suporta service worker, mas o registro falhou nesta sessao."
      };
    default:
      return {
        label: "Sem SW",
        state: "muted",
        title: "O navegador atual nao suporta service worker."
      };
  }
}

function isPrivateNetworkHost(hostname) {
  const normalized = String(hostname ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") {
    return true;
  }

  if (/^127(?:\.\d{1,3}){3}$/.test(normalized)) {
    return true;
  }

  const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((value) => Number.parseInt(value, 10));
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  if (octets[0] === 10) {
    return true;
  }

  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }

  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
    return true;
  }

  return false;
}

function sanitizeFileToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || "item";
}

function createFileTimestamp() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function isStereoMediaScene(scene) {
  const layout = String(scene?.media?.stereo_layout ?? "").trim().toLowerCase();
  return layout === "top-bottom"
    || layout === "topdown"
    || layout === "top-down"
    || layout === "side-by-side"
    || layout === "sidebyside"
    || layout === "sbs"
    || layout === "left-right"
    || layout === "right-left";
}
