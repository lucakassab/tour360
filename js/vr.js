import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { VRButton }  from 'https://unpkg.com/three@0.158.0/examples/jsm/webxr/VRButton.js';
import { scene, camera, renderer, loadMediaInSphere, showButtonHUD, updateHUDPositions } from './core.js';

export let onEnterXR = null;              // callback que o loader define

const LABEL = {0:'Trigger',1:'Grip',3:'Thumb',4:'A',5:'B'};

export function initialize() {
  if (renderer.xr.enabled) return;        // já configurado
  renderer.xr.enabled = true;

  // Injeta o botão ENTER VR
  document.body.appendChild(VRButton.createButton(renderer));

  renderer.xr.addEventListener('sessionstart', () => {
    if (typeof onEnterXR === 'function') onEnterXR();
  });

  renderer.setAnimationLoop(loop);
}

function loop() {
  const ses = renderer.xr.getSession();
  if (ses) {
    ses.inputSources.forEach(src => {
      src.gamepad?.buttons.forEach((b,i)=>{
        if (b.pressed && LABEL[i]) showButtonHUD(LABEL[i]);
      });
    });
  }
  updateHUDPositions();
  renderer.render(scene, camera);
}

export function loadMedia(url, stereo) {
  if (stereo) {
    camera.layers.enable(1); camera.layers.enable(2); camera.layers.disable(0);
  } else {
    camera.layers.enable(0); camera.layers.disable(1); camera.layers.disable(2);
  }
  loadMediaInSphere(url, stereo);
}
