import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
export { THREE };

/* ───────── SETUP BÁSICO ───────── */
export const scene    = new THREE.Scene();
export const camera   = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 2000);
export const renderer = new THREE.WebGLRenderer({ antialias: true });

camera.layers.enable(0);  // layerMono
camera.layers.disable(1); // layerLeft
camera.layers.disable(2); // layerRight

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ───────── HUD LOADING (ref-count, evita sprites duplos) ───────── */
let loadingSprite = null, loadingCnt = 0;
export function showLoading() {
  if (++loadingCnt > 1) return;
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillRect(0, 0, s, s);
  c.font = 'bold 48px sans-serif';
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('Loading…', s/2, s/2);

  const sprMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv),
    depthTest: false,
    depthWrite: false
  });
  const spr = new THREE.Sprite(sprMat);
  spr.scale.set(1, 1, 1);
  spr.renderOrder = 9999;
  loadingSprite = spr;
  scene.add(spr);
}
export function hideLoading() {
  if (--loadingCnt > 0 || !loadingSprite) return;
  scene.remove(loadingSprite);
  loadingSprite.material.map.dispose();
  loadingSprite.material.dispose();
  loadingSprite = null;
}

/* ───────── LAYERS ───────── */
export const layerMono  = 0;
export const layerLeft  = 1;
export const layerRight = 2;

/* ───────── ESPERA / DERRUBA ESPERA ───────── */
let sphereMono = null, sphereLeft = null, sphereRight = null;
function disposeSphere(s) {
  if (!s) return;
  scene.remove(s);
  s.geometry.dispose();
  s.material.dispose();
}

/* ───────── cria esfera (mono OU stereo) ───────── */
export function createSphere(tex, isStereo) {
  disposeSphere(sphereMono);
  disposeSphere(sphereLeft);
  disposeSphere(sphereRight);
  sphereMono = sphereLeft = sphereRight = null;

  const geo = new THREE.SphereGeometry(500, 64, 32);

  if (!isStereo) {
    // MONO puro: usa a textura inteira
    setupTex(tex);
    sphereMono = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
    );
    sphereMono.layers.set(layerMono);
    scene.add(sphereMono);
    return;
  }

  // ───── ESTÉREO: gera “fake mono” (metade de baixo) + layers L e R ─────
  // 1) metade de baixo → fake mono + olho esquerdo
  const bot = cloneHalf(tex, 0);
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

  // 2) metade de cima → olho direito
  const top = cloneHalf(tex, 0.5);
  sphereRight = new THREE.Mesh(
    geo.clone(),
    new THREE.MeshBasicMaterial({ map: top, side: THREE.BackSide })
  );
  sphereRight.layers.set(layerRight);
  scene.add(sphereRight);
}

/* ───────── HELPERS ───────── */
function setupTex(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
}
function cloneHalf(base, offsetY) {
  const t = base.clone();
  setupTex(t);
  t.repeat.set(1, 0.5);
  t.offset.set(0, offsetY);
  return t;
}

/* ───────── carrega texture e chama de volta ───────── */
export function loadTexture(url, isStereo, cb) {
  showLoading();
  new THREE.TextureLoader().load(
    url,
    tex => {
      setupTex(tex);
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
