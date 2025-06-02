// mobile.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { initializeCore, loadMediaInSphere, scene, camera, renderer, updateHUDPositions } from './core.js';

let isUserInteracting = false;
let onTouchStartX = 0, onTouchStartY = 0;
let lon = 0, lat = 0, phi = 0, theta = 0;
let touchZoomDistanceStart = 0, touchZoomDistanceEnd = 0;

export function initialize() {
  // 1) Inicia o core (cria scene, camera, renderer e HUDs)
  initializeCore();
  document.body.appendChild(renderer.domElement);

  // 2) Camera levemente afastada do centro (evita 0,0,0 exato)
  camera.position.set(0, 0, 0.1);

  // 3) Listeners de toque
  renderer.domElement.addEventListener('touchstart', onTouchStart, false);
  renderer.domElement.addEventListener('touchmove', onTouchMove, false);
  renderer.domElement.addEventListener('touchend', onTouchEnd, false);

  // 4) Bloqueia gestos nativos do navegador (touch-action:none no CSS já ajuda)
  window.addEventListener('gesturestart', e => e.preventDefault());
  window.addEventListener('gesturechange', e => e.preventDefault());

  // 5) Inicia loop de animação
  animate();
}

function onTouchStart(event) {
  isUserInteracting = true;
  if (event.touches.length === 1) {
    // Swipe
    onTouchStartX = event.touches[0].pageX;
    onTouchStartY = event.touches[0].pageY;
  } else if (event.touches.length === 2) {
    // Pinch-zoom: calcula distância inicial
    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;
    touchZoomDistanceStart = Math.sqrt(dx * dx + dy * dy);
  }
}

function onTouchMove(event) {
  if (isUserInteracting) {
    if (event.touches.length === 1) {
      // Swipe para girar câmera
      const deltaX = event.touches[0].pageX - onTouchStartX;
      const deltaY = event.touches[0].pageY - onTouchStartY;
      lon -= deltaX * 0.1;
      lat += deltaY * 0.1;
      onTouchStartX = event.touches[0].pageX;
      onTouchStartY = event.touches[0].pageY;
    } else if (event.touches.length === 2) {
      // Pinch-zoom
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);
      const zoomFactor = (touchZoomDistanceStart / touchZoomDistanceEnd);
      camera.fov = THREE.MathUtils.clamp(camera.fov * zoomFactor, 30, 100);
      camera.updateProjectionMatrix();
      touchZoomDistanceStart = touchZoomDistanceEnd;
    }
  }
}

function onTouchEnd(/*event*/) {
  isUserInteracting = false;
}

function animate() {
  requestAnimationFrame(animate);

  lat = Math.max(-85, Math.min(85, lat));
  phi = THREE.MathUtils.degToRad(90 - lat);
  theta = THREE.MathUtils.degToRad(lon);

  const target = new THREE.Vector3();
  target.x = Math.sin(phi) * Math.cos(theta);
  target.y = Math.cos(phi);
  target.z = Math.sin(phi) * Math.sin(theta);
  camera.lookAt(target);

  updateHUDPositions();
  renderer.render(scene, camera);
}

export function loadMedia(url, isStereo) {
  loadMediaInSphere(url, isStereo);
}
