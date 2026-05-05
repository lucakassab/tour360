const CACHE_NAME = "wpa360-pwa-v53";

const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./styles/app.css",
  "./vendor/three/three.core.js",
  "./vendor/three/three.module.js",
  "./vendor/three/examples/jsm/libs/motion-controllers.module.js",
  "./vendor/three/examples/jsm/loaders/GLTFLoader.js",
  "./vendor/three/examples/jsm/utils/BufferGeometryUtils.js",
  "./vendor/three/examples/jsm/utils/SkeletonUtils.js",
  "./vendor/three/examples/jsm/webxr/OculusHandPointerModel.js",
  "./vendor/three/examples/jsm/webxr/XRControllerModelFactory.js",
  "./vendor/three/examples/jsm/webxr/XRHandMeshModel.js",
  "./vendor/three/examples/jsm/webxr/XRHandModelFactory.js",
  "./vendor/three/examples/jsm/webxr/XRHandPrimitiveModel.js",
  "./vendor/webxr-input-profiles/profiles/profilesList.json",
  "./vendor/webxr-input-profiles/profiles/generic-hand/left.glb",
  "./vendor/webxr-input-profiles/profiles/generic-hand/profile.json",
  "./vendor/webxr-input-profiles/profiles/generic-hand/right.glb",
  "./vendor/webxr-input-profiles/profiles/generic-trigger/left.glb",
  "./vendor/webxr-input-profiles/profiles/generic-trigger/none.glb",
  "./vendor/webxr-input-profiles/profiles/generic-trigger/profile.json",
  "./vendor/webxr-input-profiles/profiles/generic-trigger/right.glb",
  "./vendor/webxr-input-profiles/profiles/generic-trigger-squeeze-thumbstick/left.glb",
  "./vendor/webxr-input-profiles/profiles/generic-trigger-squeeze-thumbstick/none.glb",
  "./vendor/webxr-input-profiles/profiles/generic-trigger-squeeze-thumbstick/profile.json",
  "./vendor/webxr-input-profiles/profiles/generic-trigger-squeeze-thumbstick/right.glb",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-plus/left.glb",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-plus/profile.json",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-plus/right.glb",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-plus-v2/left.glb",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-plus-v2/profile.json",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-plus-v2/right.glb",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-pro/left.glb",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-pro/profile.json",
  "./vendor/webxr-input-profiles/profiles/meta-quest-touch-pro/right.glb",
  "./vendor/webxr-input-profiles/profiles/oculus-touch-v2/left.glb",
  "./vendor/webxr-input-profiles/profiles/oculus-touch-v2/profile.json",
  "./vendor/webxr-input-profiles/profiles/oculus-touch-v2/right.glb",
  "./vendor/webxr-input-profiles/profiles/oculus-touch-v3/left.glb",
  "./vendor/webxr-input-profiles/profiles/oculus-touch-v3/profile.json",
  "./vendor/webxr-input-profiles/profiles/oculus-touch-v3/right.glb",
  "./data/cfg.json",
  "./data/master.json",
  "./data/tours/coluna_1/tour.json",
  "./data/tours/coluna_2/tour.json",
  "./data/tours/coluna_3/tour.json",
  "./data/tours/coluna_4/tour.json",
  "./data/tours/coluna_5/tour.json",
  "./data/tours/puc/tour.json",
  "./src/bootstrap/main.js",
  "./src/core/AppKernel.js",
  "./src/core/AppStateStore.js",
  "./src/core/PlatformRuntimeCoordinator.js",
  "./src/core/PlatformSelector.js",
  "./src/shared/AssetCacheShared.js",
  "./src/shared/CfgLoaderShared.js",
  "./src/shared/HotspotLoaderShared.js",
  "./src/shared/HotspotVisualShared.js",
  "./src/shared/SceneLoaderShared.js",
  "./src/shared/ThreeHotspotLayer.js",
  "./src/shared/ThreePanoramaRenderer.js",
  "./src/shared/TourLoaderShared.js",
  "./src/shared/TourRegistryShared.js",
  "./src/ui/MinimapWidget.js",
  "./src/platform/base/BasePlatformLauncher.js",
  "./src/platform/2D_platform/TwoDHotspotRenderer.js",
  "./src/platform/2D_platform/TwoDInputController.js",
  "./src/platform/2D_platform/TwoDPlatformLauncher.js",
  "./src/platform/2D_platform/TwoDRenderer.js",
  "./src/platform/2D_platform/TwoDSceneController.js",
  "./src/platform/VR_platform/VRHotspotRenderer.js",
  "./src/platform/VR_platform/VRHandMenu.js",
  "./src/platform/VR_platform/VRInputController.js",
  "./src/platform/VR_platform/VRInputRig.js",
  "./src/platform/VR_platform/VRMovementCompensator.js",
  "./src/platform/VR_platform/VRPlatformLauncher.js",
  "./src/platform/VR_platform/VRRenderer.js",
  "./src/platform/VR_platform/VRSceneController.js",
  "./src/editor/EditorDraftStore.js",
  "./src/editor/EditorModule.js",
  "./src/editor/EditorPanel.js",
  "./src/editor/EditorPlacementController.js",
  "./src/editor/RightClickEditorMenu.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./offline.html"));
    return;
  }

  if (url.pathname.endsWith(".json") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl = null) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return caches.match(request).then((cached) => cached || (fallbackUrl ? caches.match(fallbackUrl) : undefined));
  }
}
