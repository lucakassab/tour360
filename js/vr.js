import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { VRButton }  from 'https://unpkg.com/three@0.158.0/examples/jsm/webxr/VRButton.js';
import { scene, camera, renderer, loadMediaInSphere, lastMediaURL, lastMediaStereo, showButtonHUD, updateHUDPositions } from './core.js';

export let onEnterXR = null;

const LABEL = {0:'Trigger',1:'Grip',3:'Thumb',4:'A',5:'B'};

export function initialize() {
  if (renderer.xr.enabled) return;
  renderer.xr.enabled = true;

  // Injeta botão ENTER VR
  document.body.appendChild(VRButton.createButton(renderer));

  // Quando a sessão XR realmente começar, recarrega a última mídia em modo estéreo
  renderer.xr.addEventListener('sessionstart', () => {
    if (typeof onEnterXR === 'function') onEnterXR();

    // Recarrega a mídia para exibir em estereoscopia no VR
    if (lastMediaURL && lastMediaStereo) {
      // this chamará loadMediaInSphere com renderer.xr.isPresenting === true
      loadMediaInSphere(lastMediaURL, lastMediaStereo);
    }
  });

  renderer.xr.addEventListener('sessionend', () => {
    // Quando sair do VR, recarrega em modo 2D (se for estéreo, só metade)
    if (lastMediaURL && lastMediaStereo) {
      loadMediaInSphere(lastMediaURL, lastMediaStereo);
    }
  });

  renderer.setAnimationLoop(loop);
}

function loop() {
  const ses = renderer.xr.getSession();
  if (ses) {
    ses.inputSources.forEach(src => {
      src.gamepad?.buttons.forEach((b,i) => {
        if (b.pressed && LABEL[i]) showButtonHUD(LABEL[i]);
      });
    });
  }

  updateHUDPositions();
  renderer.render(scene, camera);
}

export function loadMedia(url, stereo) {
  // Ajusta as layers da câmera para VR vs 2D:
  if (stereo && renderer.xr.isPresenting) {
    camera.layers.enable(1);
    camera.layers.enable(2);
    camera.layers.disable(0);
  } else {
    camera.layers.enable(0);
    camera.layers.disable(1);
    camera.layers.disable(2);
  }

  loadMediaInSphere(url, stereo);
}
