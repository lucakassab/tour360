// vr.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';
import {
  initializeCore,
  loadMediaInSphere,
  scene,
  camera,
  renderer,
  showLoading,
  hideLoading,
  showButtonHUD,
  updateHUDPositions
} from './core.js';

let currentSession = null;

// Map de códigos de botão do gamepad para nome legível
const BUTTON_NAMES = {
  0: 'Trigger (0)',
  1: 'Grip (1)',
  3: 'Thumbstick (3)',
  4: 'A (4)',
  5: 'B (5)'
};

/**
 * INITIALIZE VR
 * - Habilita XR no renderer
 * - Cria VRButton e injeta no DOM
 * - Define camada da câmera para exibir corretamente esferas estéreo
 */
export function initialize() {
  // 1) Inicia o core (cria cena, câmera, renderer, HUDs)
  initializeCore();

  // 2) Habilita XR e insere botão “Enter VR”
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // 3) Configura câmera para usar camadas: 
  //    - layer 0 = mono (usado quando não for stereo)
  //    - layer 1 = olho esquerdo, layer 2 = olho direito (pra stereo)
  camera.layers.enable(0);
  camera.layers.disable(1);
  camera.layers.disable(2);

  // 4) Ao iniciar sessão XR, capturamos o session para depois monitorar gamepads
  renderer.xr.addEventListener('sessionstart', (event) => {
    currentSession = event.session;
    // Se quiser, aqui pode configurar options adicionais (e.g. hand-tracking)
  });
  renderer.xr.addEventListener('sessionend', () => {
    currentSession = null;
  });

  // 5) Inicia loop de animação em VR
  renderer.setAnimationLoop(animate);
}

/**
 * ANIMATE (loop em VR)
 * - Renderiza a cena em XR
 * - Checa input do gamepad para liberar autoplay e exibir HUD
 * - Atualiza HUDs de Loading e Button Pressed
 */
function animate() {
  // 1) Monitora gamepads conectados
  const session = renderer.xr.getSession();
  if (session) {
    const inputSources = session.inputSources;
    inputSources.forEach(source => {
      if (source.gamepad) {
        source.gamepad.buttons.forEach((btn, idx) => {
          if (btn.pressed && BUTTON_NAMES[idx]) {
            // Exibe HUD de botão (por 2 segundos)
            showButtonHUD(BUTTON_NAMES[idx]);
            // Se vídeo estiver pausado por falta de interação, poderíamos disparar um "play()" aqui
          }
        });
      }
    });
  }

  // 2) Atualiza HUDs (posiciona Loading/ Button em frente aos olhos)
  updateHUDPositions();

  // 3) Renderiza frame em XR
  renderer.render(scene, camera);
}

/**
 * loadMedia(url, isStereo)
 *  - Chamado pelo loader.js quando o usuário clica "Carregar 360"
 *  - Aqui vamos:
 *     • Ajustar camadas da câmera para stereo x mono
 *     • Chamar loadMediaInSphere (que automaticamente mostra/hide o HUD de loading)
 */
export function loadMedia(url, isStereo) {
  // Se for stereo, habilita camadas 1 e 2; caso contrário, habilita só a camada 0
  if (isStereo) {
    camera.layers.enable(1);
    camera.layers.enable(2);
    camera.layers.disable(0);
  } else {
    camera.layers.enable(0);
    camera.layers.disable(1);
    camera.layers.disable(2);
  }

  // Chama o core para carregar o recurso
  loadMediaInSphere(url, isStereo);
}
