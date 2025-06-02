import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js?module';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js?module';
import { initializeCore, loadMediaInSphere, scene, camera, renderer, updateHUDPositions } from './core.js';

let controls;

export function initialize() {
  initializeCore();
  document.body.appendChild(renderer.domElement);

  camera.position.set(0, 0, 0.1);        // << NOVO

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.rotateSpeed = 0.4;
  controls.zoomSpeed   = 1.0;

  animate();
}
function animate(){
  requestAnimationFrame(animate);
  controls.update();
  updateHUDPositions();
  renderer.render(scene,camera);
}

export function loadMedia(url,isStereo){
  loadMediaInSphere(url,isStereo);
}
