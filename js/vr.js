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
  currentVid,
  showLogHUD,
  hideLogHUD,
  updateLogPosition
} from './core.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';

renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

/* helper */
const isStereoName = n => /_stereo/i.test(n);

/* ---------- buffer de log ---------- */
const originalLog = console.log.bind(console);
let logBuffer = [];
let logVisible = false;              // se o HUD está exibido

console.log = (...args) => {
  originalLog(...args);
  logBuffer.push(args.map(String).join(' '));
  if (logVisible) showLogHUD(logBuffer.slice(-10).join('\n'));
};

/* ---------- função de autoplay persistente ---------- */
function keepTryingPlay() {
  if (!currentVid) return;
  currentVid.play().catch(() => {});
  const id = setInterval(() => {
    if (!currentVid || !currentVid.paused) { clearInterval(id); return; }
    currentVid.play().catch(() => {});
  }, 500);
}

/* destrava autoplay a cada select */
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  if (!s) return;
  s.addEventListener('select', () => currentVid?.paused && currentVid.play().catch(() => {}));
});

/* ---------- dropdown ---------- */
const sel = document.getElementById('mediaSelect');

fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    files.filter(f => f.type === 'file' && /\.(jpe?g|png|mp4|webm|mov)$/i.test(f.name))
         .forEach(f => {
           const o = document.createElement('option');
           o.value = f.download_url;
           o.text  = f.name;
           o.dataset.name = f.name;
           sel.appendChild(o);
         });
    sel.selectedIndex = 0;
  })
  .catch(err => console.log('Fetch media falhou:', err));

document.getElementById('btnLoad').onclick = () => { loadCurrent(); keepTryingPlay(); };

function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const stereo = isStereoName(opt.dataset.name);
  console.log('loadCurrent →', opt.dataset.name);
  loadTexture(opt.value, stereo,
              tex => { createSphere(tex, stereo); console.log('createSphere OK'); },
              opt.dataset.name);
}

/* ---------- gamepad ---------- */
let prevButtons = [];

renderer.setAnimationLoop(() => {
  updateLoadingPosition();
  updateButtonPosition();
  if (logVisible) updateLogPosition();

  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (!src.gamepad || src.handedness !== 'right') return;
      const now = src.gamepad.buttons.map(b => b.pressed);

      now.forEach((pressed, i) => {
        if (pressed && !prevButtons[i]) {
          showButtonHUD(`Botão ${i}`);
          console.log(`Botão ${i} DOWN`);

          if (i === 3) {               // thumbstick: mostrar log
            logVisible = true;
            showLogHUD(logBuffer.slice(-10).join('\n'));
          }
          if (i === 0) {               // trigger: carregar mídia
            loadCurrent(); keepTryingPlay();
          }
          if (i === 4) sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
          if (i === 5) sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
          if (i === 1) showLoading(sel.options[sel.selectedIndex].dataset.name);
        }
      });

      if (!now[3] && prevButtons[3]) { logVisible = false; hideLogHUD(); }
      if (!now[1] && prevButtons[1]) hideLoading();
      if (!now.some(Boolean)) hideButtonHUD();

      prevButtons = now;
    });
  } else {
    prevButtons = [];
    hideButtonHUD(); hideLoading(); hideLogHUD(); logVisible = false;
  }

  renderer.render(scene, camera);
});
