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

/* ───────── HUD LOADING (sprite único) ───────── */
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
  loadingSprite.position.copy(_loadDir).applyQuaternion(_loadQuat).multiplyScalar(3.5).add(_loadPos);
  loadingSprite.quaternion.copy(_loadQuat);
}

/* ───────── LAYERS ───────── */
export const layerMono=0, layerLeft=1, layerRight=2;

/* ───────── Helpers para destruir esferas ───────── */
let sphereMono=null, sphereLeft=null, sphereRight=null;
function disposeSphere(s){
  if(!s) return;
  // se era vídeo, pausa e limpa o src p/ liberar a memória
  const vid = s.material.map?.image;
  if (vid?.tagName === 'VIDEO') {
    vid.pause();
    vid.src = '';
    vid.load();
  }
  scene.remove(s);
  s.geometry.dispose();
  s.material.map?.dispose?.();
  s.material.dispose();
}

/* ───────── Cria esfera (foto ou vídeo) ───────── */
export function createSphere(tex, isStereo){
  // Se houver layer WebXR de vídeo, cada chamada cria uma nova layer
  // e não adiciona esfera tradicional. Caso contrário, cai no fallback de esfera.
  const session = renderer.xr.getSession?.();
  if (tex.image?.tagName === 'VIDEO' && session && 'XRWebGLBinding' in window) {
    // Cria e configura WebXR Equirect Layer (alto desempenho em VR compatível)
    const gl      = renderer.getContext();
    const binding = new XRWebGLBinding(session, gl);
    const layout  = isStereo ? 'stereo-top-bottom' : 'mono';
    const layer   = binding.createEquirectLayer(tex.image, { layout, colorFormat: 'sRGB', intensity: 1.0, radius: 500 });

    session.updateRenderState({ layers: [layer] });
    return;
  }

  // Fallback: cria esfera invertida com textura (imagem ou vídeo)
  disposeSphere(sphereMono);
  disposeSphere(sphereLeft);
  disposeSphere(sphereRight);
  sphereMono = sphereLeft = sphereRight = null;

  // Reduz segmentos para melhorar desempenho, ainda mantendo boa qualidade 8K
  const geo = new THREE.SphereGeometry(500, 32, 16);
  function setup(t){
    t.colorSpace      = THREE.SRGBColorSpace;
    t.wrapS           = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter       = THREE.LinearFilter;  // evita gastos extras com mipmaps
    t.generateMipmaps = false;
    t.needsUpdate     = true;
  }

  if(!isStereo){
    setup(tex);
    sphereMono = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
    sphereMono.layers.set(layerMono);
    scene.add(sphereMono);
    return;
  }

  // ESTÉREO: dividir top/bottom
  const bot = tex.clone();  setup(bot); bot.repeat.set(1,0.5); bot.offset.set(0,0);
  sphereMono = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: bot, side: THREE.BackSide }));
  sphereMono.layers.set(layerMono); scene.add(sphereMono);

  sphereLeft = new THREE.Mesh(geo.clone(),
    new THREE.MeshBasicMaterial({ map: bot.clone(), side: THREE.BackSide }));
  sphereLeft.layers.set(layerLeft); scene.add(sphereLeft);

  const top = tex.clone();  setup(top); top.repeat.set(1,0.5); top.offset.set(0,0.5);
  sphereRight = new THREE.Mesh(geo.clone(),
    new THREE.MeshBasicMaterial({ map: top, side: THREE.BackSide }));
  sphereRight.layers.set(layerRight); scene.add(sphereRight);
}

/* ───────── loadTexture: aceita IMG ou VÍDEO (alto desempenho) ───────── */
const IMG_RE = /\.(jpe?g|png)$/i;
const VID_RE = /\.(mp4|webm|mov)$/i;

export function loadTexture(url, isStereo, cb, msg = 'Loading…') {
  showLoading(msg);

  // ---------- IMAGEM ----------
  if (IMG_RE.test(url)) {
    new THREE.TextureLoader().load(
      url,
      tex => { try { cb(tex, isStereo); } finally { hideLoading(); } },
      undefined,
      err => { console.error(err); hideLoading(); }
    );
    return;
  }

  // ---------- VÍDEO (fetch → blob para evitar bloqueios CORS) ----------
  if (VID_RE.test(url)) {
    fetch(url, { mode: 'cors' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const objectURL = URL.createObjectURL(blob);
        const vid = document.createElement('video');

        // Configurações para autoplay em modern browsers e VR
        vid.crossOrigin  = 'anonymous';
        vid.src          = objectURL;
        vid.muted        = true;
        vid.loop         = true;
        vid.playsInline  = true;
        vid.autoplay     = true;
        vid.preload      = 'auto';
        vid.style.display = 'none';

        document.body.appendChild(vid);

        const onReady = () => {
          const videoTexture = new THREE.VideoTexture(vid);
          videoTexture.colorSpace      = THREE.SRGBColorSpace;
          videoTexture.minFilter       = THREE.LinearFilter;
          videoTexture.generateMipmaps = false;

          // Use requestVideoFrameCallback se disponível, para texture.needsUpdate otimizado
          if (vid.requestVideoFrameCallback) {
            const updateFrame = () => {
              videoTexture.needsUpdate = true;
              vid.requestVideoFrameCallback(updateFrame);
            };
            vid.requestVideoFrameCallback(updateFrame);
          }

          try { cb(videoTexture, isStereo); } finally { hideLoading(); }

          // Tenta tocar o vídeo; se bloqueado, tenta no primeiro clique
          const playPromise = vid.play();
          if (playPromise?.catch) {
            playPromise.catch(() => {
              const resume = () => {
                vid.play().finally(() => document.removeEventListener('click', resume, true));
              };
              document.addEventListener('click', resume, true);
            });
          }
        };

        vid.addEventListener('canplaythrough', onReady, { once: true });
        if (vid.readyState >= 3) onReady();
      })
      .catch(err => {
        console.error('Falha ao baixar vídeo:', err);
        hideLoading();
      });
    return;
  }

  console.error('Extensão não suportada:', url);
  hideLoading();
}   // fim loadTexture

/* ───────── HUD de Botão (mesmo de antes) ───────── */
let buttonSprite=null;
export function showButtonHUD(msg=''){
  if(buttonSprite){
    scene.remove(buttonSprite);
    buttonSprite.material.map.dispose();
    buttonSprite.material.dispose();
  }
  const W=512,H=128;
  const cv=Object.assign(document.createElement('canvas'),{width:W,height:H});
  const ctx=cv.getContext('2d');
  ctx.fillStyle='rgba(30,30,30,0.8)'; ctx.fillRect(0,0,W,H);
  ctx.font='bold 28px sans-serif'; ctx.fillStyle='#ff3333';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(msg,W/2,H/2);

  buttonSprite=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(cv), depthTest:false, depthWrite:false
  }));
  buttonSprite.scale.set(4,1,1);
  buttonSprite.renderOrder=9999;
  scene.add(buttonSprite);
  updateButtonPosition();
}
export function hideButtonHUD(){
  if(!buttonSprite) return;
  scene.remove(buttonSprite);
  buttonSprite.material.map.dispose();
  buttonSprite.material.dispose();
  buttonSprite=null;
}
const _btnDir=new THREE.Vector3(0,0,-1);
const _btnPos=new THREE.Vector3();
const _btnQuat=new THREE.Quaternion();
export function updateButtonPosition(){
  if(!buttonSprite) return;
  const headCam=(renderer.xr.isPresenting && renderer.xr.getCamera(camera))||camera;
  headCam.updateMatrixWorld();
  headCam.getWorldPosition(_btnPos);
  headCam.getWorldQuaternion(_btnQuat);
  const pos=_btnDir.clone().applyQuaternion(_btnQuat).multiplyScalar(3.5).add(_btnPos);
  pos.y-=0.8;
  buttonSprite.position.copy(pos);
  buttonSprite.quaternion.copy(_btnQuat);
}
