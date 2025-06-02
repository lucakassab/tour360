/* -------------- Core compartilhado -------------- */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
export { THREE };

/* ───────── SETUP BÁSICO ───────── */
export const scene    = new THREE.Scene();
export const camera   = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);
export const renderer = new THREE.WebGLRenderer({ antialias: true });

// Ajusta pixelRatio menor em dispositivos móveis pra poupar GPU
const isMobileDevice = /Mobi|Android/i.test(navigator.userAgent);
renderer.setPixelRatio(isMobileDevice ? Math.min(window.devicePixelRatio, 1) : window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ───────── HUD LOADING ───────── */
let loadingSprite = null;
let loadingCnt    = 0;
export function showLoading(msg = 'Loading…') {
  if (loadingSprite) {
    scene.remove(loadingSprite);
    loadingSprite.material.map.dispose();
    loadingSprite.material.dispose();
    loadingSprite = null;
  }
  loadingCnt++;

  const W = 512, H = 128;
  const cv  = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, W / 2, H / 2);

  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv),
    depthTest: false,
    depthWrite: false
  });
  loadingSprite = new THREE.Sprite(mat);
  loadingSprite.scale.set(4, 1, 1);
  loadingSprite.renderOrder = 9999;
  scene.add(loadingSprite);
  updateLoadingPosition();
}
export function hideLoading() {
  loadingCnt = Math.max(loadingCnt - 1, 0);
  if (loadingCnt || !loadingSprite) return;
  scene.remove(loadingSprite);
  loadingSprite.material.map.dispose();
  loadingSprite.material.dispose();
  loadingSprite = null;
}
const _loadDir  = new THREE.Vector3(0,0,-1);
const _loadPos  = new THREE.Vector3();
const _loadQuat = new THREE.Quaternion();
export function updateLoadingPosition() {
  if (!loadingSprite) return;
  const headCam = (renderer.xr.isPresenting && renderer.xr.getCamera(camera)) || camera;
  headCam.updateMatrixWorld();
  headCam.getWorldPosition(_loadPos);
  headCam.getWorldQuaternion(_loadQuat);
  loadingSprite.position
    .copy(_loadDir)
    .applyQuaternion(_loadQuat)
    .multiplyScalar(3.5)
    .add(_loadPos);
  loadingSprite.quaternion.copy(_loadQuat);
}

/* ───────── LAYERS ───────── */
export const layerMono  = 0;
export const layerLeft  = 1;
export const layerRight = 2;

/* ───────── Limpa vídeo anterior ───────── */
export let currentVid = null;
function stopCurrentVid() {
  if (!currentVid) return;
  currentVid.pause();
  currentVid.remove();
  currentVid = null;
}

/* ───────── Helpers para destruir esferas ───────── */
let sphereMono  = null,
    sphereLeft  = null,
    sphereRight = null;

function disposeSphere(s) {
  if (!s) return;
  scene.remove(s);
  s.geometry.dispose();
  s.material.map?.dispose?.();
  s.material.dispose();
}

/* ───────── Cria esfera (foto ou vídeo) ───────── */
export function createSphere(tex, isStereo) {
  const session = renderer.xr.getSession?.();
  if (tex.image?.tagName === 'VIDEO' && session && 'XRWebGLBinding' in window) {
    const gl      = renderer.getContext();
    const binding = new XRWebGLBinding(session, gl);
    const layout  = isStereo ? 'stereo-top-bottom' : 'mono';
    const layer   = binding.createEquirectLayer(tex.image, { layout, radius: 500, colorFormat: 'sRGB' });
    session.updateRenderState({ layers: [layer] });
    return;
  }

  disposeSphere(sphereMono);
  disposeSphere(sphereLeft);
  disposeSphere(sphereRight);
  sphereMono = sphereLeft = sphereRight = null;

  const segW = isMobileDevice || session ? 16 : 32;
  const segH = isMobileDevice || session ?  8 : 16;
  const geo  = new THREE.SphereGeometry(500, segW, segH);

  const setup = t => {
    t.colorSpace      = THREE.SRGBColorSpace;
    t.wrapS           = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter       = THREE.LinearFilter;
    t.generateMipmaps = false;
  };

  if (!isStereo) {
    setup(tex);
    sphereMono = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
    sphereMono.layers.set(layerMono);
    scene.add(sphereMono);
    return;
  }

  const bot = tex.clone(); setup(bot); bot.repeat.set(1,0.5); bot.offset.set(0,0);
  sphereMono = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: bot, side: THREE.BackSide }));
  sphereMono.layers.set(layerMono);
  scene.add(sphereMono);

  sphereLeft = new THREE.Mesh(geo.clone(),
    new THREE.MeshBasicMaterial({ map: bot.clone(), side: THREE.BackSide }));
  sphereLeft.layers.set(layerLeft);
  scene.add(sphereLeft);

  const top = tex.clone(); setup(top); top.repeat.set(1,0.5); top.offset.set(0,0.5);
  sphereRight = new THREE.Mesh(geo.clone(),
    new THREE.MeshBasicMaterial({ map: top, side: THREE.BackSide }));
  sphereRight.layers.set(layerRight);
  scene.add(sphereRight);
}

/* ───────── loadTexture: IMG ou VÍDEO ───────── */
const IMG_RE = /\.(jpe?g|png)$/i;
const VID_RE = /\.(mp4|webm|mov)$/i;

export function loadTexture(url, isStereo, cb, msg = 'Loading…') {
  showLoading(msg);
  stopCurrentVid();

  if (IMG_RE.test(url)) {
    new THREE.TextureLoader().load(
      url,
      tex => { try { cb(tex, isStereo); } finally { hideLoading(); } },
      undefined,
      err => { console.error(err); hideLoading(); }
    );
    return;
  }

  /* ---------- VÍDEO ---------- */
  if (VID_RE.test(url)) {
    const vid = document.createElement('video');
    vid.crossOrigin  = 'anonymous';
    vid.src          = url;
    vid.muted        = true;
    vid.loop         = true;
    vid.playsInline  = true;
    vid.autoplay     = true;
    vid.preload      = 'auto';
    vid.style.display = 'none';
    document.body.appendChild(vid);
    currentVid = vid;
    window.currentVid = vid; // expõe também na window, caso algo use window.currentVid

    /* primeira tentativa de play no contexto do gesto */
    const tryPlay = () => vid.play().catch(() => {});
    tryPlay();
    /* fallback clique desktop/mobile */
    document.addEventListener('click', tryPlay, { once: true, capture: true });

    /* ❶ qualquer botão VR dispara nova tentativa */
    if (renderer.xr.isPresenting) {
      const session = renderer.xr.getSession();
      const onInput = () => {
        if (vid.paused) tryPlay();
      };
      session.addEventListener('inputsourceschange', onInput);
    }

    /* ❷ preenche a textura quando vierem dados, e tenta play de novo */
    const onReady = () => {
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace      = THREE.SRGBColorSpace;
      tex.minFilter       = THREE.LinearFilter;
      tex.generateMipmaps = false;

      if (vid.requestVideoFrameCallback) {
        const upd = () => {
          tex.needsUpdate = true;
          vid.requestVideoFrameCallback(upd);
        };
        vid.requestVideoFrameCallback(upd);
      }

      try { cb(tex, isStereo); } finally { hideLoading(); }
      if (vid.paused) tryPlay(); // nova tentativa após buffer
    };

    if (vid.readyState >= 2) onReady();
    else vid.addEventListener('loadeddata', onReady, { once: true });

    return;
  }

  console.error('Extensão não suportada:', url);
  hideLoading();
}   // fim loadTexture

/* ───────── HUD de Botão ───────── */
let buttonSprite = null;
export function showButtonHUD(msg = '') {
  if (buttonSprite) {
    scene.remove(buttonSprite);
    buttonSprite.material.map.dispose();
    buttonSprite.material.dispose();
  }
  const W = 512, H = 128;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(30,30,30,0.8)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#ff3333';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, W / 2, H / 2);

  buttonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv),
    depthTest: false,
    depthWrite: false
  }));
  buttonSprite.scale.set(4, 1, 1);
  buttonSprite.renderOrder = 9999;
  scene.add(buttonSprite);
  updateButtonPosition();
}
export function hideButtonHUD() {
  if (!buttonSprite) return;
  scene.remove(buttonSprite);
  buttonSprite.material.map.dispose();
  buttonSprite.material.dispose();
  buttonSprite = null;
}
const _btnDir = new THREE.Vector3(0,0,-1);
const _btnPos = new THREE.Vector3();
const _btnQuat = new THREE.Quaternion();
export function updateButtonPosition() {
  if (!buttonSprite) return;
  const headCam = (renderer.xr.isPresenting && renderer.xr.getCamera(camera)) || camera;
  headCam.updateMatrixWorld();
  headCam.getWorldPosition(_btnPos);
  headCam.getWorldQuaternion(_btnQuat);
  const pos = _btnDir.clone().applyQuaternion(_btnQuat).multiplyScalar(3.5).add(_btnPos);
  pos.y -= 0.8;
  buttonSprite.position.copy(pos);
  buttonSprite.quaternion.copy(_btnQuat);
}

/* ───────── HUD de Log (botão 3) ───────── */
let logSprite = null;
export function showLogHUD(text = '') {
  if (logSprite) {
    scene.remove(logSprite);
    logSprite.material.map.dispose();
    logSprite.material.dispose();
  }

  const lines = text.split('\n').slice(-10); // mostra apenas as últimas 10 linhas
  const W = 1024, H = 256;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = cv.getContext('2d');

  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '18px monospace';
  ctx.fillStyle = '#0f0';
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillText(line, 10, i * 24);
  });

  logSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv),
    depthTest: false,
    depthWrite: false
  }));

  logSprite.scale.set(6, 1.5, 1);
  logSprite.renderOrder = 9999;
  scene.add(logSprite);
  updateLogPosition();
}

export function hideLogHUD() {
  if (!logSprite) return;
  scene.remove(logSprite);
  logSprite.material.map.dispose();
  logSprite.material.dispose();
  logSprite = null;
}

const _logDir = new THREE.Vector3(0, 0, -1);
const _logPos = new THREE.Vector3();
const _logQuat = new THREE.Quaternion();
export function updateLogPosition() {
  if (!logSprite) return;
  const headCam = (renderer.xr.isPresenting && renderer.xr.getCamera(camera)) || camera;
  headCam.updateMatrixWorld();
  headCam.getWorldPosition(_logPos);
  headCam.getWorldQuaternion(_logQuat);
  const pos = _logDir.clone().applyQuaternion(_logQuat).multiplyScalar(3.5).add(_logPos);
  pos.y += 1.2;
  logSprite.position.copy(pos);
  logSprite.quaternion.copy(_logQuat);
}
