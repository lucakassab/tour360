// js/vr.js
import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { VRButton } from 'https://unpkg.com/three@0.158.0/examples/jsm/webxr/VRButton.js?module';
import {
  scene,
  camera,
  renderer,
  loadMediaInSphere,
  showButtonHUD,
  updateHUDPositions,
  // Importar as variáveis globais para recarregar última mídia
  lastMediaURL,
  lastMediaStereo
} from './core.js';

export let onEnterXR = null;

// Map de botões do gamepad
// 4 = A; 5 = B (no Quest)
// 0 = Trigger; 1 = Grip; 3 = Thumbstick pressionado
const BUTTON_LABEL = {
  0: 'Trigger',
  1: 'Grip',
  3: 'Thumb',
  4: 'A',
  5: 'B'
};

// Variáveis de estado para thumbstick
let canRotateLeft  = true;
let canRotateRight = true;

// Função para navegar no <select> de mídia
function changeMediaInSelect(delta) {
  const select = document.getElementById('mediaSelect');
  const len = select.options.length;
  if (len === 0) return;

  let idx = parseInt(select.value);
  idx = (idx + delta + len) % len;
  select.value = idx;

  const opt = select.options[idx];
  const url    = opt.getAttribute('data-url');
  const stereo = opt.getAttribute('data-stereo') === 'true';

  loadMediaInSphere(url, stereo);
}

// Rotaciona a cena (rodando o grupo que contém a esfera)
function rotateScene(angleDeg) {
  const angleRad = THREE.MathUtils.degToRad(angleDeg);
  scene.rotation.y += angleRad;
}

export function initialize() {
  if (renderer.xr.enabled) return;
  renderer.xr.enabled = true;

  // Injeta o botão ENTER VR
  document.body.appendChild(VRButton.createButton(renderer));

  // Quando a sessão XR começar, avisamos o loader para trocar de módulo
  renderer.xr.addEventListener('sessionstart', () => {
    if (typeof onEnterXR === 'function') onEnterXR();
    // Após entrar em VR, recarrega a última mídia estéreo automaticamente:
    if (lastMediaURL) {
      loadMediaInSphere(lastMediaURL, lastMediaStereo);
    }
  });

  // Loop principal em VR
  renderer.setAnimationLoop(loop);
}

function loop() {
  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach((source) => {
      if (!source.gamepad) return;
      const gp = source.gamepad;

      // 1) Botões A e B para anterior e próximo
      if (gp.buttons[4]?.pressed) {
        showButtonHUD(BUTTON_LABEL[4]);
        changeMediaInSelect(-1);   // botão 4 → mídia anterior
      }
      if (gp.buttons[5]?.pressed) {
        showButtonHUD(BUTTON_LABEL[5]);
        changeMediaInSelect(+1);   // botão 5 → próxima mídia
      }

      // 2) Thumbstick para girar cena (eixos X, Y)
      // Dependendo do seu controlador, o eixo X do thumbstick pode estar em gp.axes[2] ou gp.axes[0].
      // Aqui a gente tenta gp.axes[2], mas se for undefined, testa gp.axes[0].
      const axisH = gp.axes[2] !== undefined ? gp.axes[2] : gp.axes[0];
      // Se empurrar direita (> +0.5) e antes não estava virando
      if (axisH > 0.5 && canRotateRight) {
        rotateScene(-20);
        canRotateRight = false;
        canRotateLeft  = true;
      }
      // Se empurrar esquerda (< -0.5) e antes não estava virando
      if (axisH < -0.5 && canRotateLeft) {
        rotateScene(+20);
        canRotateLeft  = false;
        canRotateRight = true;
      }
      // Se voltou ao centro
      if (axisH >= -0.5 && axisH <= 0.5) {
        canRotateLeft = true;
        canRotateRight = true;
      }
    });
  }

  // Exibe HUDs e renderiza cena
  updateHUDPositions();
  renderer.render(scene, camera);
}

export function loadMedia(url, stereo) {
  // Em VR, ativa as layers para estéreo; se mono, layer 0.
  if (stereo) {
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
