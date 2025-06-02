import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js?module';
import { VRButton } from 'https://unpkg.com/three@0.158.0/examples/jsm/webxr/VRButton.js?module';
import { initializeCore, loadMediaInSphere, scene, camera, renderer, showButtonHUD, updateHUDPositions } from './core.js';

export let onEnterXR = null;

let currentSession=null;
const BTN_LABEL = {0:'Trigger',1:'Grip',3:'Thumb',4:'A',5:'B'};

export function initialize(){
  initializeCore();
  renderer.xr.enabled=true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  camera.layers.enable(0);
  camera.layers.disable(1);
  camera.layers.disable(2);

  renderer.xr.addEventListener('sessionstart',e=>{
    currentSession=e.session;
    if(typeof onEnterXR==='function') onEnterXR();
  });
  renderer.xr.addEventListener('sessionend',()=>currentSession=null);

  renderer.setAnimationLoop(loop);
}

function loop(){
  const ses=renderer.xr.getSession();
  if(ses){
    ses.inputSources.forEach(src=>{
      if(src.gamepad){
        src.gamepad.buttons.forEach((b,i)=>{
          if(b.pressed && BTN_LABEL[i]) showButtonHUD(BTN_LABEL[i]);
        });
      }
    });
  }
  updateHUDPositions();
  renderer.render(scene,camera);
}

export function loadMedia(url,isStereo){
  if(isStereo){
    camera.layers.enable(1);camera.layers.enable(2);camera.layers.disable(0);
  }else{
    camera.layers.enable(0);camera.layers.disable(1);camera.layers.disable(2);
  }
  loadMediaInSphere(url,isStereo);
}
