// desktop.js
import {
  initializeCore,
  loadMediaInSphere,
  scene,
  camera,
  renderer,
  updateHUDPositions
} from './core.js';


import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js?module';

let controls;

export function initialize() {
  // 1) Inicia o core (cria scene, camera, renderer e HUDs)
  initializeCore();

  // 2) Adiciona o canvas do render ao body
  document.body.appendChild(renderer.domElement);

  // 3) Define posição inicial da câmera (está dentro da esfera, mas afastada levemente do centro)
  camera.position.set(0, 0, 0.1);

  // 4) OrbitControls: mouse ou touch (se for tela touch)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;       // não permite translação, só rotação
  controls.minDistance = 0.1;
  controls.maxDistance = 1000;
  controls.rotateSpeed = 0.4;
  controls.zoomSpeed = 1.0;

  // 5) Quando scroll, faz zoom automaticamente (já vem no OrbitControls)
  // 6) Inicia loop de animação
  animate();
}

function animate() {
  requestAnimationFrame(animate);

  // Atualiza controles e HUDs a cada frame
  controls.update();
  updateHUDPositions();

  renderer.render(scene, camera);
}

/**
 * loadMedia(url, isStereo)
 * Apenas repassa para o core carregar a mídia
 */
export function loadMedia(url, isStereo) {
  loadMediaInSphere(url, isStereo);
}
