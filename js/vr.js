// vr.js
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

/* helper _stereo */
const isStereoName = n => /_stereo/i.test(n);

/* ----------- lista + primeira ----------- */
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
    // Não carrega ainda: aguardamos o gatilho (botão 0)
  })
  .catch(console.error);

/* ---------- Botão “Carregar Mídia” (fora do VR) ---------- */
document.getElementById('btnLoad').onclick = () => {
  loadCurrent();
};

/* carrega mídia atualmente selecionada */
function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);

  loadTexture(
    opt.value,
    stereo,
    tex => createSphere(tex, stereo),
    name
  );
}

/* ---------- gamepad VR ---------- */
let prevButtons = [];

renderer.setAnimationLoop(() => {
  updateLoadingPosition();
  updateButtonPosition();

  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (!src.gamepad || src.handedness !== 'right') return;
      const gp = src.gamepad;
      const nowPressed = gp.buttons.map(b => b.pressed);

      nowPressed.forEach((pressed, i) => {
        if (pressed && !prevButtons[i]) {
          showButtonHUD(`Botão ${i}`);

          // 0 = trigger → carrega a mídia selecionada (user gesture válido)
          if (i === 0) {
            loadCurrent();
          }

          // 4 = A, 5 = B → apenas ajustam o índice, sem tentar play
          if (i === 4) {
            sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
          }
          if (i === 5) {
            sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
          }

          // 1 = grip → mostra loading HUD
          if (i === 1) {
            showLoading(sel.options[sel.selectedIndex].dataset.name);
          }
        }
      });

      if (!nowPressed[1] && prevButtons[1]) {
        hideLoading();
      }
      if (!nowPressed.some(Boolean)) {
        hideButtonHUD();
      }
      prevButtons = nowPressed;
    });
  } else {
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
  }

  renderer.render(scene, camera);
});
