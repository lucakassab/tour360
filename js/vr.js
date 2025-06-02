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

/* play em loop até funcionar */
function keepTryingPlay() {
  const v = window.currentVid;
  if (!v) return;

  // Tenta imediatamente
  v.play().catch(() => {});

  // Loop de retomada (para bloquear só até dar certo)
  const id = setInterval(() => {
    if (!v.paused || v.readyState === 0) {
      clearInterval(id);          // já tocando ou vídeo removido
      return;
    }
    v.play().catch(() => {});
  }, 500);
}

/* quando entrar no VR, qualquer select/selectstart também tenta play */
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  if (!s) return;

  const resume = () => {
    const v = window.currentVid;
    if (v && v.paused) v.play().catch(() => {});
  };

  s.addEventListener('select', resume);
  s.addEventListener('selectstart', resume);
});

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
    loadCurrent();
  })
  .catch(console.error);

/* botão “Carregar” (fora do VR) */
document.getElementById('btnLoad').onclick = () => {
  loadCurrent();
  keepTryingPlay();          // clique normal conta como gesture
};

/* carrega mídia atual */
function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const stereo = isStereoName(opt.dataset.name);

  loadTexture(
    opt.value,
    stereo,
    tex => createSphere(tex, stereo),
    opt.dataset.name
  );

  keepTryingPlay();          // já começa a tentar
}

/* ---------- gamepad (botões 4/5) ---------- */
let prevButtons = [];

renderer.setAnimationLoop(() => {
  updateLoadingPosition();
  updateButtonPosition();

  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (!src.gamepad || src.handedness !== 'right') return;
      const now = src.gamepad.buttons.map(b => b.pressed);

      now.forEach((pressed, i) => {
        if (pressed && !prevButtons[i]) {
          showButtonHUD(`Botão ${i}`);

          if (i === 4 || i === 5) {
            sel.selectedIndex =
              i === 4
                ? (sel.selectedIndex + 1) % sel.options.length
                : (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
            loadCurrent();
            keepTryingPlay();   // gesto 4/5 deve destravar o vídeo
          }

          if (i === 1) {
            showLoading(sel.options[sel.selectedIndex].dataset.name);
          }
        }
      });

      if (!now[1] && prevButtons[1]) hideLoading();
      if (!now.some(Boolean))        hideButtonHUD();

      prevButtons = now;
    });
  } else {
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
  }

  renderer.render(scene, camera);
});
