// core.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

/**
 * Exporta cena, câmera e renderer para os demais módulos usarem.
 * Também guarda as referências às HUDs e ao objeto 360° atual.
 */
export let scene, camera, renderer;
let currentMesh = null;
let loadingMesh = null;
let buttonHUDMesh = null;

// --- VARIÁVEIS INTERNAS PARA GERENCIAR HUD “Loading...” ---
let loadingCanvas, loadingTexture;
let isLoadingVisible = false;

// --- VARIÁVEL PARA GERENCIAR HUD “Button Pressed” ---
let buttonCanvas, buttonTexture;
let buttonTimeout = null;

/**
 * INITIALIZE CORE
 * 
 * Cria cena, câmera, renderer e configura o básico de Three.js.
 * Também cria o HUD de Loading (mas não adiciona à cena até ser chamado).
 */
export function initializeCore() {
  // 1) CENA
  scene = new THREE.Scene();

  // 2) CÂMARA: Padrão Perspective, FOV 75
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 0, 0); // dentro da esfera
  scene.add(camera);

  // 3) RENDERER
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Ajuste de resize no render
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 4) HUD “Loading...” (canvas → textura → plano)
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
  loadingMesh.visible = false; // inicia invisível
  // posicione à frente da câmera (cada frame reposicionado)
  scene.add(loadingMesh);

  // 5) HUD “Button Pressed” (canvas → textura → plano)
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

/**
 * SHOW LOADING HUD
 * Exibe o plano "Loading..." e garante que ele fique em frente à câmera.
 */
export function showLoading() {
  isLoadingVisible = true;
  loadingMesh.visible = true;
}

/**
 * HIDE LOADING HUD
 * Esconde o plano "Loading...".
 */
export function hideLoading() {
  isLoadingVisible = false;
  loadingMesh.visible = false;
}

/**
 * ATUALIZA POSIÇÃO DO LOADING e BUTTON HUDS
 * Sempre deve ser chamado no loop de animação de cada ambiente (desktop/mobile/VR)
 * para fixar os HUDs à frente da câmera.
 */
export function updateHUDPositions() {
  // calcula direção da câmera (vetor)
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  // plota o Loading 2 unidades à frente
  if (loadingMesh.visible) {
    loadingMesh.position.copy(camera.position).add(dir.clone().multiplyScalar(2));
    loadingMesh.quaternion.copy(camera.quaternion);
  }
  // plota o Button HUD 1.5 unidades à frente, um pouco abaixo
  if (buttonHUDMesh.visible) {
    const posBtn = camera.position.clone().add(dir.clone().multiplyScalar(1.5));
    posBtn.y -= 0.5;
    buttonHUDMesh.position.copy(posBtn);
    buttonHUDMesh.quaternion.copy(camera.quaternion);
  }
}

/**
 * EXIBE MENSAGEM DE BOTÃO (“Button: X”)
 * Mostra por 2 segundos qual botão foi pressionado no VR.
 */
export function showButtonHUD(buttonName) {
  // reescreve texto no canvas
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
  // limpa timer anterior (se houver)
  if (buttonTimeout) clearTimeout(buttonTimeout);
  // some depois de 2 segundos
  buttonTimeout = setTimeout(() => {
    buttonHUDMesh.visible = false;
  }, 2000);
}

/**
 * LOAD MEDIA (imagem ou vídeo) NA ESFERA 360°
 * @param {string} url - URL do arquivo (imagem ou vídeo)
 * @param {boolean} isStereo - se contem "_stereo" (top-bottom)
 *
 * Exibe o HUD de Loading, carrega o recurso, aplica na esfera e remove o HUD.
 */
export async function loadMediaInSphere(url, isStereo) {
  showLoading();

  // 1) Se já existir um objeto anterior, remova e descarte
  if (currentMesh) {
    scene.remove(currentMesh);
    if (currentMesh.material.map) currentMesh.material.map.dispose();
    currentMesh.geometry.dispose();
    currentMesh.material.dispose();
    currentMesh = null;
  }

  // 2) Cria geometria da esfera invertida (normais para dentro)
  const geo = new THREE.SphereGeometry(500, 60, 40);
  geo.scale(-1, 1, 1);

  // 3) Decide se é imagem ou vídeo
  const ext = url.split('.').pop().toLowerCase();
  let texture = null;

  if (['mp4', 'webm', 'mov'].includes(ext)) {
    // === VÍDEO ===
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play().catch(()=>{}); // tenta autoplay
    } catch (e) {
      // se navegador bloquear, precisa de interação
      console.warn('Vídeo bloqueado, aguardando interação do usuário.');
    }
    texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.format = THREE.RGBFormat;
  } else {
    // === IMAGEM ===
    const loader = new THREE.TextureLoader();
    texture = await new Promise((res, rej) => {
      loader.load(
        url,
        tex => res(tex),
        undefined,
        err => {
          console.error('Erro ao carregar imagem:', err);
          rej(err);
        }
      );
    });
  }

  // 4) Se for stereo (top-bottom) E estivermos em VR, vamos criar duas malhas: 
  //    - uma esfera para olho esquerdo (metade superior da textura)
  //    - outra para olho direito (metade inferior da textura)
  //    Atribuímos layers 1 e 2 para distinguir cada um.
  if (isStereo && renderer.xr.enabled) {
    // Layer 1 → esquerda; Layer 2 → direita
    // Define repetição da textura para cada metade
    // Metade superior: offset.y = 0.5, repeat.y = 0.5
    // Metade inferior: offset.y = 0.0, repeat.y = 0.5

    // Esfera olho esquerdo
    const matL = new THREE.MeshBasicMaterial({ map: texture.clone() });
    matL.map.repeat.set(1, 0.5);
    matL.map.offset.set(0, 0.5);
    matL.map.needsUpdate = true;
    const meshL = new THREE.Mesh(geo.clone(), matL);
    meshL.layers.set(1);

    // Esfera olho direito
    const matR = new THREE.MeshBasicMaterial({ map: texture.clone() });
    matR.map.repeat.set(1, 0.5);
    matR.map.offset.set(0, 0);
    matR.map.needsUpdate = true;
    const meshR = new THREE.Mesh(geo.clone(), matR);
    meshR.layers.set(2);

    currentMesh = new THREE.Group();
    currentMesh.add(meshL, meshR);
  } else {
    // === 360° MONO NORMAL ===
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    currentMesh = new THREE.Mesh(geo, mat);
  }

  scene.add(currentMesh);

  hideLoading();
}
