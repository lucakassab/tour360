import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
export { THREE };

/* ───────── SETUP BÁSICO ───────── */
export const scene    = new THREE.Scene();
export const camera   = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 2000);
export const renderer = new THREE.WebGLRenderer({ antialias:true });

camera.layers.enable(0);           // mono
camera.layers.disable(1);          // left
camera.layers.disable(2);          // right

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ───────── HUD LOADING ───────── */
let loadingSprite=null, loadingCnt=0;
export function showLoading(){
  if(++loadingCnt>1) return;
  const s=256, cv=document.createElement('canvas');
  cv.width=cv.height=s;
  const c=cv.getContext('2d');
  c.fillStyle='rgba(0,0,0,.6)'; c.fillRect(0,0,s,s);
  c.font='bold 48px sans-serif'; c.fillStyle='#fff';
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText('Loading…',s/2,s/2);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), depthTest:false, depthWrite:false
  }));
  spr.scale.set(1,1,1); spr.renderOrder=9999;
  loadingSprite=spr; scene.add(spr);
}
export function hideLoading(){
  if(--loadingCnt>0||!loadingSprite) return;
  scene.remove(loadingSprite);
  loadingSprite.material.map.dispose();
  loadingSprite.material.dispose();
  loadingSprite=null;
}

/* ───────── LAYERS ───────── */
export const layerMono=0, layerLeft=1, layerRight=2;

/* ───────── ESPERAS ───────── */
let sphereMono=null, sphereLeft=null, sphereRight=null;

function disposeSphere(s){
  if(!s) return;
  scene.remove(s); s.geometry.dispose(); s.material.dispose();
}

export function createSphere(tex,isStereo){
  disposeSphere(sphereMono); disposeSphere(sphereLeft); disposeSphere(sphereRight);
  sphereMono=sphereLeft=sphereRight=null;

  const geo=new THREE.SphereGeometry(500,64,32);

  if(!isStereo){
    setupTex(tex);
    sphereMono=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex,side:THREE.BackSide}));
    sphereMono.layers.set(layerMono); scene.add(sphereMono);
    return;
  }

  /* --- stereo: gera bottom-half mono *e* left/right --- */
  // bottom → fake mono (layer 0) + left eye (layer 1)
  const bot=cloneHalf(tex,0);
  sphereMono=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:bot,side:THREE.BackSide}));
  sphereMono.layers.set(layerMono);  scene.add(sphereMono);

  sphereLeft=new THREE.Mesh(geo.clone(),new THREE.MeshBasicMaterial({map:bot.clone(),side:THREE.BackSide}));
  sphereLeft.layers.set(layerLeft);  scene.add(sphereLeft);

  // top → right eye (layer 2)
  const top=cloneHalf(tex,0.5);
  sphereRight=new THREE.Mesh(geo.clone(),new THREE.MeshBasicMaterial({map:top,side:THREE.BackSide}));
  sphereRight.layers.set(layerRight); scene.add(sphereRight);
}

/* ───────── HELPERS ───────── */
function setupTex(t){
  t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  t.minFilter=THREE.LinearFilter;
  t.generateMipmaps=false;
}
function cloneHalf(base,offsetY){
  const t=base.clone();
  setupTex(t);
  t.repeat.set(1,0.5);
  t.offset.set(0,offsetY);
  return t;
}

export function loadTexture(url,isStereo,cb){
  showLoading();
  new THREE.TextureLoader().load(
    url,
    tex=>{ setupTex(tex); cb(tex,isStereo); hideLoading(); },
    undefined,
    err=>{ console.error(err); hideLoading(); }
  );
}
