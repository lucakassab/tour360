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
let logVisible = false; // se o HUD está exibido

console.log = (...args) => {
  originalLog(...args);
  logBuffer.push(args.map(String).join(' '));
  if (logVisible) {
    const text = logBuffer.slice(-10).join('\n');
    showLogHUD(text);
  }
};

/* ---------- função de autoplay persistente ---------- */
function keepTryingPlay() {
  if (!currentVid) {
    console.log('keepTryingPlay: currentVid is null');
    return;
  }
  console.log('keepTryingPlay: tentando play do vídeo');
  currentVid.play().catch(e => console.log('keepTryingPlay erro:', e));
  const id = setInterval(() => {
    if (!currentVid) {
      clearInterval(id);
      return;
    }
    if (!currentVid.paused) {
      clearInterval(id);
      return;
    }
    console.log('keepTryingPlay (interval): tentando play novamente');
    currentVid.play().catch(e => console.log('interval play erro:', e));
  }, 500);
}

/* destrava autoplay a cada select */
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  if (!s) {
    console.log('sessionstart: sem sessão VR');
    return;
  }
  console.log('sessionstart: adicionando listener select');
  s.addEventListener('select', () => {
    console.log('select evento VR: tentando play');
    if (currentVid && currentVid.paused) {
      currentVid.play().catch(e => console.log('select play erro:', e));
    }
  });
});

/* ---------- dropdown ---------- */
const sel = document.getElementById('mediaSelect');

fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    console.log('fetch media OK, total:', files.length);
    files.filter(f => f.type === 'file' && /\.(jpe?g|png|mp4|webm|mov)$/i.test(f.name))
         .forEach(f => {
           const o = document.createElement('option');
           o.value = f.download_url;
           o.text  = f.name;
           o.dataset.name = f.name;
           sel.appendChild(o);
           console.log('dropdown adicionou:', f.name);
         });
    sel.selectedIndex = 0;
    console.log('dropdown: índice inicial 0');
  })
  .catch(err => console.log('Fetch media falhou:', err));

document.getElementById('btnLoad').onclick = () => {
  console.log('btnLoad clicado (fora do VR)');
  loadCurrent();
  keepTryingPlay();
};

function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);

  console.log('loadCurrent →', name, 'stereo?', stereo);
  loadTexture(opt.value, stereo,
              tex => {
                console.log('loadTexture callback: textura carregada para', name);
                createSphere(tex, stereo);
                console.log('createSphere OK para', name);
              },
              name);
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
      const gp = src.gamepad;
      const now = gp.buttons.map(b => b.pressed);

      now.forEach((pressed, i) => {
        if (pressed && !prevButtons[i]) {
          console.log(`Botão ${i} DOWN`);
          showButtonHUD(`Botão ${i}`);

          if (i === 3) { // thumbstick press
            console.log('thumbstick (3) pressionado → mostrar LOG HUD');
            logVisible = true;
            showLogHUD(logBuffer.slice(-10).join('\n'));
          }
          if (i === 0) { // trigger
            console.log('trigger (0) pressionado → loadCurrent + keepTryingPlay');
            loadCurrent();
            keepTryingPlay();
          }
          if (i === 4) {
            sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
            console.log('A (4) pressionado → índice agora', sel.selectedIndex);
          }
          if (i === 5) {
            sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
            console.log('B (5) pressionado → índice agora', sel.selectedIndex);
          }
          if (i === 1) { // grip
            const nomeAtual = sel.options[sel.selectedIndex].dataset.name;
            console.log('grip (1) pressionado → showLoading', nomeAtual);
            showLoading(nomeAtual);
          }
        }
      });

      // soltou thumbstick
      if (!now[3] && prevButtons[3]) {
        console.log('thumbstick (3) solto → esconder LOG HUD');
        logVisible = false;
        hideLogHUD();
      }
      // soltou grip
      if (!now[1] && prevButtons[1]) {
        console.log('grip (1) solto → hideLoading');
        hideLoading();
      }
      // nenhum botão pressionado
      if (!now.some(Boolean)) {
        hideButtonHUD();
      }

      prevButtons = now;
    });
  } else {
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
    if (logVisible) {
      logVisible = false;
      hideLogHUD();
    }
  }

  renderer.render(scene, camera);
});
