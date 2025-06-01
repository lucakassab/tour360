import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
export { THREE };

export const scene    = new THREE.Scene();
export const camera   = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);
export const renderer = new THREE.WebGLRenderer({ antialias: true });

camera.layers.enable(0);
camera.layers.disable(1);
camera.layers.disable(2);

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// HUD loading
let loadingSprite = null;
let loadingCount  = 0;
export function showLoading() {
  loadingCount++;
  if (loadingSprite) return;

  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0,0,size,size);
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Loading…', size/2, size/2);

  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  loadingSprite = new THREE.Sprite(mat);
  loadingSprite.scale.set(1,1,1);
  loadingSprite.renderOrder = 9999;
  scene.add(loadingSprite);
}
export function hideLoading() {
  loadingCount = Math.max(loadingCount - 1, 0);
  if (loadingCount > 0 || !loadingSprite) return;
  scene.remove(loadingSprite);
  loadingSprite.material.map.dispose();
  loadingSprite.material.dispose();
  loadingSprite = null;
}

export const layerMono  = 0;
export const layerLeft  = 1;
export const layerRight = 2;

let sphereMono = null, sphereLeft = null, sphereRight = null;

export function createSphere(tex, isStereo) {
  [sphereMono, sphereLeft, sphereRight].forEach(s => {
    if (!s) return;
    scene.remove(s); s.geometry.dispose(); s.material.dispose();
  });
  sphereMono = sphereLeft = sphereRight = null;

  const geo = new THREE.SphereGeometry(500, 64, 32);

  if (isStereo) {
    const top = tex.clone();
    top.repeat.set(1, 0.5);
    top.offset.set(0, 0.5);
    top.wrapS = top.wrapT = THREE.ClampToEdgeWrapping;
    top.minFilter = THREE.LinearFilter;
    top.generateMipmaps = false;
    top.colorSpace = THREE.SRGBColorSpace;

    sphereRight = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ map: top, side: THREE.BackSide }));
    sphereRight.layers.set(layerRight);
    scene.add(sphereRight);

    const bot = tex.clone();
    bot.repeat.set(1, 0.5);
    bot.offset.set(0, 0);
    bot.wrapS = bot.wrapT = THREE.ClampToEdgeWrapping;
    bot.minFilter = THREE.LinearFilter;
    bot.generateMipmaps = false;
    bot.colorSpace = THREE.SRGBColorSpace;

    sphereLeft = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ map: bot, side: THREE.BackSide }));
    sphereLeft.layers.set(layerLeft);
    scene.add(sphereLeft);
  } else {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    sphereMono = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
    sphereMono.layers.set(layerMono);
    scene.add(sphereMono);
  }
}

export function loadTexture(url, isStereo, cb) {
  showLoading();
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(url,
    tex => {
      tex.colorSpace = THREE.SRGBColorSpace; // Corrige cor aqui tbm
      cb(tex, isStereo);
      hideLoading();
    },
    undefined,
    err => {
      hideLoading();
      console.error(err);
    }
  );
}
