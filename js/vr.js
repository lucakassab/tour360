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
  updateButtonPosition,
  currentVid       // ← Importa o currentVid exportado
} from './core.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';

renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

const isStereoName = n => /_stereo/i.test(n);

// ⬇ Não precisamos mais de window.currentVid; usamos currentVid do módulo
function keepTryingPlay() {
  if (!currentVid) return;
  currentVid.play().catch(() => {});
  const id = setInterval(() => {
    if (!currentVid || !currentVid.paused) {
      clearInterval(id);
      return;
    }
    currentVid.play().catch(() => {});
  }, 500);
}

// No sessionstart, qualquer select também tenta tocar currentVid
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  if (!s) return;
  const resume = () => {
    if (currentVid && currentVid.paused) currentVid.play().catch(() => {});
  };
  s.addEventListener('select', resume);
  s.addEventListener('selectstart', resume);
});

// Popula dropdown mas NÃO carrega até trigger (botão 0)
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
  })
  .catch(console.error);

// Botão “Carregar 360” fora do VR
document.getElementById('btnLoad').onclick = () => {
  loadCurrent();
  keepTryingPlay();
};

function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);
  loadTexture(opt.value, stereo, tex => createSphere(tex, stereo), name);
}

// Mapeamento de gamepad VR (aperta 4/5 só altera índice, e 0 dispara loadCurrent)
let prevButtons = [];
renderer.setAnimationLoop(() => {
  updateLoadingPosition();
  updateButtonPosition();
  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (!src.gamepad || src.handedness !== 'right') return;
      const gp = src.gamepad;
      const now = gp.buttons.map(b => b.pressed);
      now.forEach((pressed, i) => {
        if (pressed && !prevButtons[i]) {
          showButtonHUD(`Botão ${i}`);

          // 0 = trigger → carrega e toca (gesto válido)
          if (i === 0) {
            loadCurrent();
            keepTryingPlay();
          }
          // 4 = A → próximo índice
          if (i === 4) {
            sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
          }
          // 5 = B → índice anterior
          if (i === 5) {
            sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
          }
          // 1 = grip → mostra loading HUD
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
