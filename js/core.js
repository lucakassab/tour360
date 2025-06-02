// core.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export let scene, camera, renderer;
let currentMesh = null;
let loadingMesh = null;
let buttonHUDMesh = null;

// Variáveis internas HUD
let loadingCanvas, loadingTexture;
let buttonCanvas, buttonTexture;
let buttonTimeout = null;

/**
 * INITIALIZE CORE
 * Cria cena, câmera, renderer e HUDs (Loading e Button).
 */
export function initializeCore() {
  // 1) Cena
  scene = new THREE.Scene();

  // 2) Câmera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 0, 0);
  scene.add(camera);

  // 3) Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Força sRGB como espaço de cor de saída
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 4) HUD “Loading...”
  loadingCanvas = document.createElement('canvas');
  loadingCanvas.width = 512;
  loadingCanvas.height = 128;
  const ctxLoad = loadingCanvas.getContext('2d');
  ctxLoad.fillStyle = 'rgba(0,0,0,0.7)';
  ctxLoad.fillRect(0, 0, loadingCanvas.width, loadingCanvas.height);
  ctxLoad.font = '48px sans-serif';
  ctxLoad.fillStyle = '#ffffff';
  ctxLoad.textAlign = 'center';
  ctxLoad.fillText('Loading...', loadingCanvas.width / 2, loadingCanvas.height / 2 + 16);

  loadingTexture = new THREE.CanvasTexture(loadingCanvas);
  const planeGeo = new THREE.PlaneGeometry(1.5, 0.4);
  const planeMat = new THREE.MeshBasicMaterial({ map: loadingTexture, transparent: true });
  loadingMesh = new THREE.Mesh(planeGeo, planeMat);
  loadingMesh.visible = false;
  scene.add(loadingMesh);

  // 5) HUD “Button Pressed”
  buttonCanvas = document.createElement('canvas');
  buttonCanvas.width = 512;
  buttonCanvas.height = 128;
  const ctxBtn = buttonCanvas.getContext('2d');
  ctxBtn.fillStyle = 'rgba(0,0,0,0.7)';
  ctxBtn.fillRect(0, 0, buttonCanvas.width, buttonCanvas.height);
  ctxBtn.font = 'bold 42px sans-serif';
  ctxBtn.fillStyle = '#ffdd00';
  ctxBtn.textAlign = 'center';
  ctxBtn.fillText('Button: —', buttonCanvas.width / 2, buttonCanvas.height / 2 + 16);

  buttonTexture = new THREE.CanvasTexture(buttonCanvas);
  const btnGeo = new THREE.PlaneGeometry(1.5, 0.4);
  const btnMat = new THREE.MeshBasicMaterial({ map: buttonTexture, transparent: true });
  buttonHUDMesh = new THREE.Mesh(btnGeo, btnMat);
  buttonHUDMesh.visible = false;
  scene.add(buttonHUDMesh);
}

export function showLoading() {
  loadingMesh.visible = true;
}

export function hideLoading() {
  loadingMesh.visible = false;
}

export function updateHUDPositions() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  if (loadingMesh.visible) {
    loadingMesh.position.copy(camera.position).add(dir.clone().multiplyScalar(2));
    loadingMesh.quaternion.copy(camera.quaternion);
  }
  if (buttonHUDMesh.visible) {
    const posBtn = camera.position.clone().add(dir.clone().multiplyScalar(1.5));
    posBtn.y -= 0.5;
    buttonHUDMesh.position.copy(posBtn);
    buttonHUDMesh.quaternion.copy(camera.quaternion);
  }
}

export function showButtonHUD(buttonName) {
  const ctx = buttonCanvas.getContext('2d');
  ctx.clearRect(0, 0, buttonCanvas.width, buttonCanvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, buttonCanvas.width, buttonCanvas.height);
  ctx.fillStyle = '#ffdd00';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Button: ${buttonName}`, buttonCanvas.width / 2, buttonCanvas.height / 2 + 16);
  buttonTexture.needsUpdate = true;

  buttonHUDMesh.visible = true;
  if (buttonTimeout) clearTimeout(buttonTimeout);
  buttonTimeout = setTimeout(() => {
    buttonHUDMesh.visible = false;
  }, 2000);
}

/**
 * LOAD MEDIA (imagem ou vídeo) NA ESFERA 360°
 * Corrige cores e exibe apenas metade no modo 2D se for mídia estéreo.
 */
export async function loadMediaInSphere(url, isStereo) {
  showLoading();

  // Remove mesh anterior
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.traverse(node => {
      if (node.isMesh) {
        if (node.material.map) node.material.map.dispose();
        node.geometry.dispose();
        node.material.dispose();
      }
    });
    currentMesh = null;
  }

  // Gera geometria da esfera invertida
  const geo = new THREE.SphereGeometry(500, 60, 40);
  geo.scale(-1, 1, 1);

  // Detecta extensão e carrega textura (imagem ou vídeo)
  const ext = url.split('.').pop().toLowerCase();
  let texture;
  if (['mp4', 'webm', 'mov'].includes(ext)) {
    // Vídeo
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play().catch(() => {});
    } catch (e) {
      console.warn('Vídeo bloqueado, aguardando interação do usuário.');
    }
    texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.format = THREE.RGBFormat;
    texture.colorSpace = THREE.SRGBColorSpace;
  } else {
    // Imagem
    const loader = new THREE.TextureLoader();
    texture = await new Promise((res, rej) => {
      loader.load(
        url,
        tex => {
          // Garante que a textura seja tratada em sRGB
          tex.colorSpace = THREE.SRGBColorSpace;
          res(tex);
        },
        undefined,
        err => {
          console.error('Erro ao carregar imagem:', err);
          rej(err);
        }
      );
    });
  }

  // Se for estéreo e NÃO ESTIVER em VR, exibe apenas metade superior
  if (isStereo && !renderer.xr.enabled) {
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    mat.map.repeat.set(1, 0.5);
    mat.map.offset.set(0, 0.5);
    mat.map.needsUpdate = true;
    currentMesh = new THREE.Mesh(geo, mat);
    scene.add(currentMesh);
    hideLoading();
    return;
  }

  // Se for estéreo e ESTIVER em VR, cria duas esferas (layer 1 = olho esquerdo / layer 2 = olho direito)
  if (isStereo && renderer.xr.enabled) {
    // Olho esquerdo (metade superior da textura)
    const matL = new THREE.MeshBasicMaterial({ map: texture.clone() });
    matL.map.repeat.set(1, 0.5);
    matL.map.offset.set(0, 0.5);
    matL.map.needsUpdate = true;
    const meshL = new THREE.Mesh(geo.clone(), matL);
    meshL.layers.set(1);

    // Olho direito (metade inferior da textura)
    const matR = new THREE.MeshBasicMaterial({ map: texture.clone() });
    matR.map.repeat.set(1, 0.5);
    matR.map.offset.set(0, 0);
    matR.map.needsUpdate = true;
    const meshR = new THREE.Mesh(geo.clone(), matR);
    meshR.layers.set(2);

    currentMesh = new THREE.Group();
    currentMesh.add(meshL, meshR);
    scene.add(currentMesh);
    hideLoading();
    return;
  }

  // Caso mono (ou fallback)
  const matMono = new THREE.MeshBasicMaterial({ map: texture });
  currentMesh = new THREE.Mesh(geo, matMono);
  scene.add(currentMesh);
  hideLoading();
}
