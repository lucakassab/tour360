import {
  THREE,
  scene,
  camera,
  renderer,
  loadTexture,
  createSphere,
  showLoading,
  hideLoading,
  updateLoadingPosition,
  showButtonHUD,
  hideButtonHUD,
  updateButtonPosition
} from './core.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';

renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

/* helper “_stereo” */
const isStereoName = n => /_stereo/i.test(n);

/* força play se vídeo estiver pausado */
function forcePlayIfPaused() {
  const v = window.currentVid;
  if (v && v.paused) v.play().catch(() => {});
}

/* ---------- Carrega lista + primeira ---------- */
const sel = document.getElementById('mediaSelect');

fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    const media = files.filter(f => f.type === 'file' && /\.(jpe?g|png|mp4|webm|mov)$/i.test(f.name));
    if (!media.length) {
      console.error('Nada em /media');
      return;
    }
    media.forEach(f => {
      const o = document.createElement('option');
      o.value = f.download_url;
      o.text  = f.name;
      o.dataset.name = f.name;
      sel.appendChild(o);
    });
    sel.selectedIndex = 0;
    loadCurrent();
  })
  .catch(err => console.error('Fetch media falhou:', err));

/* ---------- Botão “Carregar Mídia” ---------- */
document.getElementById('btnLoad').onclick = () => {
  loadCurrent();
  forcePlayIfPaused(); // forçar play no clique “Carregar” fora do VR
};

/* carrega a opção selecionada */
function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const stereo = isStereoName(opt.dataset.name);
  loadTexture(opt.value, stereo, tex => createSphere(tex, stereo), opt.dataset.name);
  forcePlayIfPaused(); // forçar play logo após criar o vídeo
}

/* ---------- Gamepad VR ---------- */
let prevButtons = [];

renderer.setAnimationLoop(() => {
  updateLoadingPosition();
  updateButtonPosition();

  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp         = src.gamepad;
        const nowPressed = gp.buttons.map(b => b.pressed);

        for (let i = 0; i < nowPressed.length; i++) {
          if (nowPressed[i] && !prevButtons[i]) {
            showButtonHUD(`Botão ${i}`);

            if (i === 4 || i === 5) {
              // troca mídia (avançar / voltar)
              sel.selectedIndex =
                (i === 4)
                  ? (sel.selectedIndex + 1) % sel.options.length
                  : (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
              loadCurrent();
              forcePlayIfPaused(); // usa gesto 4/5 para destravar play
            }

            if (i === 1) {
              const name = sel.options[sel.selectedIndex].dataset.name;
              showLoading(name);
            }
          }
        }

        if (!nowPressed[1] && prevButtons[1]) hideLoading();
        if (!nowPressed.some(p => p))        hideButtonHUD();

        prevButtons = nowPressed;
      }
    });
  } else {
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
  }

  renderer.render(scene, camera);
});
