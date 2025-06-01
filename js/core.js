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

/* ───────── HUD LOADING (ref-count, evita sprites duplicados) ───────── */
let loadingSprite = null, loadingCnt = 0;

export function showLoading() {
  if (++loadingCnt > 1) return;
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, s, s);
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Loading…', s / 2, s / 2);

  const tex   = new THREE.CanvasTexture(cv);
  const mat   = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1, 1, 1);
  sprite.renderOrder = 9999;
  loadingSprite = sprite;
  scene.add(sprite);
}

export function hideLoading() {
  if (--loadingCnt > 0 || !loadingSprite) return;
  scene.remove(loadingSprite);
  loadingSprite.material.map.dispose();
  loadingSprite.material.dispose();
  loadingSprite = null;
}

/* ---------- Atualiza posição do sprite de Loading ---------- */
export function updateLoadingPosition() {
  if (!loadingSprite) return;

  const headCam = (renderer.xr.isPresenting && renderer.xr.getCamera(camera)) || camera;

  const DIST = 2;          // ⇦ distância (em metros) do sprite em relação à cabeça
  const tmp  = new THREE.Vector3(0, 0, -1)
                    .applyQuaternion(headCam.quaternion)
                    .multiplyScalar(DIST);

  loadingSprite.position.copy(headCam.position).add(tmp);
  loadingSprite.quaternion.copy(headCam.quaternion);
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
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS      = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter  = THREE.LinearFilter;
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

  // ───── ESTÉREO: metade de baixo → fake mono + olho esquerdo ─────
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

  // ───── metade de cima → olho direito ─────
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

/* ───────── carrega texture e chama callback ───────── */
export function loadTexture(url, isStereo, cb) {
  showLoading();
  new THREE.TextureLoader().load(
    url,
    tex => {
      // Ajusta cor e wrapping antes de usar
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS      = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter  = THREE.LinearFilter;
      tex.generateMipmaps = false;
      cb(tex, isStereo);
      hideLoading();
    },
    undefined,
    err => {
      console.error(err);
      hideLoading();
    }
  );
}
