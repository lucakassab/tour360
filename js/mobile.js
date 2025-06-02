import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js?module';
import { initializeCore, loadMediaInSphere, scene, camera, renderer, updateHUDPositions } from './core.js';

let isDragging=false, startX=0,startY=0, lon=0,lat=0;

export function initialize(){
  initializeCore();
  document.body.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('touchstart',e=>{
    if(e.touches.length===1){
      isDragging=true;
      startX=e.touches[0].pageX;
      startY=e.touches[0].pageY;
    }
  },false);

  renderer.domElement.addEventListener('touchmove',e=>{
    if(isDragging && e.touches.length===1){
      const dx=e.touches[0].pageX-startX;
      const dy=e.touches[0].pageY-startY;
      lon-=dx*.1; lat+=dy*.1;
      startX=e.touches[0].pageX; startY=e.touches[0].pageY;
    }
  },false);

  renderer.domElement.addEventListener('touchend',()=>{isDragging=false;},false);

  animate();
}

function animate(){
  requestAnimationFrame(animate);
  lat=Math.max(-85,Math.min(85,lat));
  const phi=THREE.MathUtils.degToRad(90-lat);
  const theta=THREE.MathUtils.degToRad(lon);
  const target=new THREE.Vector3(
    Math.sin(phi)*Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi)*Math.sin(theta)
  );
  camera.lookAt(target);
  updateHUDPositions();
  renderer.render(scene,camera);
}

export function loadMedia(url,isStereo){
  loadMediaInSphere(url,isStereo);
}
