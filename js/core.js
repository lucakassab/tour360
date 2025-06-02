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
let loadingCnt    = 0;

/**
 * showLoading(msg)
 * Exibe um sprite flutuando na frente da câmera com o texto passado.
 * Se já existir um loadingSprite, recria com texto atualizado.
 * @param {string} msg – Texto a exibir. Se não passar nada, usa "Loading…".
 */
export function showLoading(msg = 'Loading…') {
  // Se já existe um sprite, remove para recriar com texto novo
  if (loadingSprite) {
    scene.remove(loadingSprite);
    loadingSprite.material.map.dispose();
    loadingSprite.material.dispose();
    loadingSprite = null;
  }
  loadingCnt++;

  // Dimensões fixas para o retângulo horizontal
  const W = 512;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width  = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  // Fundo semi-transparente
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  // Texto centralizado
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, W / 2, H / 2);

  // Cria textura e sprite
  const tex    = new THREE.CanvasTexture(cv);
  const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);

  // Ajusta proporção: largura = 4 × altura (512/128)
  sprite.scale.set(4, 1, 1);
  sprite.renderOrder = 9999;

  loadingSprite = sprite;
  scene.add(loadingSprite);

  // Posiciona o sprite imediatamente na frente da câmera/XR
  updateLoadingPosition();
}

/**
 * hideLoading()
 * Diminui o contador e, se chegar a zero, remove o sprite de loading.
 */
export function hideLoading() {
  loadingCnt = Math.max(loadingCnt - 1, 0);
  if (loadingCnt > 0) return;
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
let sphereMono  = null;
let sphereLeft  = null;
let sphereRight = null;

function disposeSphere(s) {
  if (!s) return;
  scene.remove(s);
  s.geometry.dispose();
  s.material.dispose();
}

/* ───────── Cria esfera (mono OU stereo) ───────── */
/**
 * createSphere(tex, isStereo)
 * Remove qualquer esfera anterior e cria uma nova numa esfera invertida (radius 500).
 * Se isStereo=false, cria só o sphereMono (mapeia a textura inteira).
 * Se isStereo=true, divide a textura em duas metades (metade de baixo para eye-left e mono, metade de cima para eye-right).
 */
export function createSphere(tex, isStereo) {
  // Limpa esferas antigas
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
    // MONO: aplica a textura inteira numa esfera invertida
    setupTex(tex);
    sphereMono = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
    );
    sphereMono.layers.set(layerMono);
    scene.add(sphereMono);
    return;
  }

  // ESTÉREO: dividimos a textura ao meio verticalmente
  // 1) Metade de baixo → sphereMono (falso mono) + sphereLeft (olho esquerdo)
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

  // 2) Metade de cima → olho direito
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
/**
 * loadTexture(url, isStereo, cb, msg?)
 *   • Mostra “Loading…” (ou o texto passado em msg)
 *   • Carrega a imagem
 *   • Chama cb(tex, isStereo)
 *   • Some com o loading
 */
export function loadTexture(url, isStereo, cb, msg = 'Loading…') {
  showLoading(msg);                 // Um único showLoading com texto personalizado
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
        console.error('Callback deu ruim:', e);
      }
      hideLoading();               // Um único hideLoading
    },
    undefined,
    err => {
      console.error('Falhou loadTexture:', err);
      hideLoading();               // Garante sumiço mesmo se quebrar
    }
  );
}

/* ───────── HUD de Botão -------------- */
let buttonSprite = null;

/**
 * showButtonHUD(msg)
 * Exibe um sprite na frente da câmera/XR com o texto do botão que foi pressionado.
 * Se já existir, recria com o texto atualizado.
 * @param {string} msg – Texto a exibir (ex: "Botão 4 → próxima mídia").
 */
export function showButtonHUD(msg = '') {
  if (buttonSprite) {
    scene.remove(buttonSprite);
    buttonSprite.material.map.dispose();
    buttonSprite.material.dispose();
    buttonSprite = null;
  }

  // Canvas retangular para o HUD de botão
  const W = 512;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width  = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  // Fundo semi-transparente escuro
  ctx.fillStyle = 'rgba(30,30,30,0.8)';
  ctx.fillRect(0, 0, W, H);

  // Texto em vermelho (para destacar)
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#ff3333';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, W / 2, H / 2);

  const tex    = new THREE.CanvasTexture(cv);
  const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);

  // Mesma proporção do loading (4:1)
  sprite.scale.set(4, 1, 1);
  sprite.renderOrder = 9999;

  buttonSprite = sprite;
  scene.add(buttonSprite);

  updateButtonPosition();
}

/**
 * hideButtonHUD()
 * Remove o sprite de HUD de botão, se existir.
 */
export function hideButtonHUD() {
  if (!buttonSprite) return;
  scene.remove(buttonSprite);
  buttonSprite.material.map.dispose();
  buttonSprite.material.dispose();
  buttonSprite = null;
}

const _btnDir  = new THREE.Vector3(0, 0, -1);
const _btnPos  = new THREE.Vector3();
const _btnQuat = new THREE.Quaternion();

/**
 * updateButtonPosition()
 * Posiciona o HUD de botão a 3.5m na frente e 0.8m abaixo da câmera/XR, olhando para o usuário.
 */
export function updateButtonPosition() {
  if (!buttonSprite) return;
  const headCam = (renderer.xr.isPresenting && renderer.xr.getCamera(camera)) || camera;
  headCam.updateMatrixWorld();
  headCam.getWorldPosition(_btnPos);
  headCam.getWorldQuaternion(_btnQuat);

  // Vetor para frente da câmera
  const forward = _btnDir.clone().applyQuaternion(_btnQuat);

  const DIST = 3.5;  // distância frontal
  const DOWN = 0.8;  // desloca para baixo (em metros)
  const pos = forward.multiplyScalar(DIST).add(_btnPos);
  pos.y -= DOWN;
  buttonSprite.position.copy(pos);
  buttonSprite.quaternion.copy(_btnQuat);
}
