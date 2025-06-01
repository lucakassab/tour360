/* -------------- Core compartilhado -------------- */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
export { THREE };

/* ───────── SETUP BÁSICO ───────── */
export const scene    = new THREE.Scene();
export const camera   = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);
export const renderer = new THREE.WebGLRenderer({ antialias: true });

camera.layers.enable(0);  // layerMono
camera.layers.disable(1); // layerLeft
camera.layers.disable(2); // layerRight

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ───────── HUD LOADING (um único sprite) ───────── */
let loadingSprite = null;

/**
 * Agora o showLoading cria um retângulo horizontal maior,
 * para caber textos longos. msg é opcional; se não passar nada, usa "Loading…".
 */
export function showLoading(msg = 'Loading…') {
  // Se já existe um sprite, remove pra recriar com texto atualizado
  if (loadingSprite) {
    scene.remove(loadingSprite);
    loadingSprite.material.map.dispose();
    loadingSprite.material.dispose();
    loadingSprite = null;
  }

  // Dimensões do canvas para um retângulo horizontal
  const W = 512;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width  = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, W / 2, H / 2);

  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const aspect = W / H;      // 512/128 = 4
  sprite.scale.set(aspect, 1, 1); // ajusta proporção no mundo
  sprite.renderOrder = 9999;
  loadingSprite = sprite;
  scene.add(sprite);

  // Posiciona o sprite na frente da câmera (ou da câmera XR, se estiver em VR)
  updateLoadingPosition();
}

export function hideLoading() {
  if (!loadingSprite) return;
  scene.remove(loadingSprite);
  loadingSprite.material.map.dispose();
  loadingSprite.material.dispose();
  loadingSprite = null;
}

/* ───────── Atualiza posição/rotação do sprite “Loading…” ───────── */
const _loadDir  = new THREE.Vector3(0, 0, -1);
const _loadPos  = new THREE.Vector3();
const _loadQuat = new THREE.Quaternion();

export function updateLoadingPosition() {
  if (!loadingSprite) return;
  // Se estiver em VR, pega a câmera XR; senão, a câmera normal
  const headCam = (renderer.xr.isPresenting && renderer.xr.getCamera(camera)) || camera;
  headCam.updateMatrixWorld();
  headCam.getWorldPosition(_loadPos);
  headCam.getWorldQuaternion(_loadQuat);

  const DIST = 3.5; // distância do sprite em relação à câmera
  loadingSprite.position
    .copy(_loadDir)
    .applyQuaternion(_loadQuat)
    .multiplyScalar(DIST)
    .add(_loadPos);
  loadingSprite.quaternion.copy(_loadQuat);
}

/* ───────── LAYERS ───────── */
export const layerMono  = 0;
export const layerLeft  = 1;
export const layerRight = 2;

/* ───────── Helpers para destruir esferas ───────── */
let sphereMono  = null,
    sphereLeft  = null,
    sphereRight = null;

function disposeSphere(s) {
  if (!s) return;
  scene.remove(s);
  s.geometry.dispose();
  s.material.dispose();
}

/* ───────── Cria esfera (mono OU stereo) ───────── */
export function createSphere(tex, isStereo) {
  disposeSphere(sphereMono);
  disposeSphere(sphereLeft);
  disposeSphere(sphereRight);
  sphereMono = sphereLeft = sphereRight = null;

  const geo = new THREE.SphereGeometry(500, 64, 32);

  function setupTex(t) {
    t.colorSpace      = THREE.SRGBColorSpace;
    t.wrapS           = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter       = THREE.LinearFilter;
    t.generateMipmaps = false;
  }

  if (!isStereo) {
    setupTex(tex);
    sphereMono = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
    );
    sphereMono.layers.set(layerMono);
    scene.add(sphereMono);
    return;
  }

  // ESTÉREO: metade de baixo → fake mono + olho esquerdo
  const bot = tex.clone();
  setupTex(bot);
  bot.repeat.set(1, 0.5);
  bot.offset.set(0, 0);
  sphereMono = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ map: bot, side: THREE.BackSide })
  );
  sphereMono.layers.set(layerMono);
  scene.add(sphereMono);

  sphereLeft = new THREE.Mesh(
    geo.clone(),
    new THREE.MeshBasicMaterial({ map: bot.clone(), side: THREE.BackSide })
  );
  sphereLeft.layers.set(layerLeft);
  scene.add(sphereLeft);

  // Metade de cima → olho direito
  const top = tex.clone();
  setupTex(top);
  top.repeat.set(1, 0.5);
  top.offset.set(0, 0.5);
  sphereRight = new THREE.Mesh(
    geo.clone(),
    new THREE.MeshBasicMaterial({ map: top, side: THREE.BackSide })
  );
  sphereRight.layers.set(layerRight);
  scene.add(sphereRight);
}

/* ───────── carrega texture e chama callback com atraso para hideLoading ───────── */
export function loadTexture(url, isStereo, cb) {
  // Só chama showLoading se não houver um loadingSprite ativo (preserva texto customizado)
  if (!loadingSprite) showLoading();

  new THREE.TextureLoader().load(
    url,
    tex => {
      tex.colorSpace      = THREE.SRGBColorSpace;
      tex.wrapS           = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter       = THREE.LinearFilter;
      tex.generateMipmaps = false;
      try {
        cb(tex, isStereo);
      } catch (e) {
        console.error(e);
      }
      // Garante que o sprite de Loading suma 0,2s depois
      setTimeout(hideLoading, 200);
    },
    undefined,
    err => {
      console.error(err);
      setTimeout(hideLoading, 200);
    }
  );
}
