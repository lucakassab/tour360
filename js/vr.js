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
  currentVid
} from './core.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';

renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

/* helper _stereo */
const isStereoName = n => /_stereo/i.test(n);

/* ─────────── Override do console.log para bufferizar mensagens ─────────── */
const originalConsoleLog = console.log.bind(console);
let logBuffer = [];
console.log = (...args) => {
  originalConsoleLog(...args);
  logBuffer.push(args.map(a => String(a)).join(' '));
  if (logBox) logBox.innerText = logBuffer.join('\n');
};

/* ─────────── Criação do elemento de log ─────────── */
let logBox = null;
(function createLogBox() {
  logBox = document.createElement('div');
  logBox.style.position = 'absolute';
  logBox.style.top = '10px';
  logBox.style.left = '10px';
  logBox.style.width = 'calc(100% - 20px)';
  logBox.style.maxHeight = '40%';
  logBox.style.overflowY = 'auto';
  logBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  logBox.style.color = '#fff';
  logBox.style.fontFamily = 'monospace';
  logBox.style.fontSize = '12px';
  logBox.style.padding = '10px';
  logBox.style.borderRadius = '4px';
  logBox.style.display = 'none';
  logBox.style.zIndex = '9999';
  document.body.appendChild(logBox);
})();

/* ─────────── Função de play contínuo ─────────── */
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

/* ─────────── Listener global de select para destravar autoplay ─────────── */
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  if (!s) return;
  const resume = () => {
    if (currentVid && currentVid.paused) currentVid.play().catch(() => {});
  };
  s.addEventListener('select', resume);
  s.addEventListener('selectstart', resume);
});

/* ─────────── Carrega lista + primeira mídia no dropdown ─────────── */
const sel = document.getElementById('mediaSelect');
fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    const media = files.filter(f => f.type === 'file' && /\.(jpe?g|png|mp4|webm|mov)$/i.test(f.name));
    if (!media.length) {
      console.log('Nada em /media');
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
    // Não chamamos loadCurrent() aqui, aguardamos o trigger (botão 0)
  })
  .catch(err => {
    console.log('Fetch media falhou:', err);
  });

/* ─────────── Botão “Carregar Mídia” (fora do VR) ─────────── */
document.getElementById('btnLoad').onclick = () => {
  loadCurrent();
  keepTryingPlay();
};

/* ─────────── Carrega a mídia selecionada ─────────── */
function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);

  console.log('loadCurrent →', name);
  loadTexture(
    opt.value,
    stereo,
    tex => {
      createSphere(tex, stereo);
      console.log('createSphere chamado para', name);
    },
    name
  );
}

/* ─────────── Gamepad VR (botões 3, 4 e 5) ─────────── */
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
        // Se acabou de pressionar
        if (pressed && !prevButtons[i]) {
          console.log(`Botão ${i} pressionado`);
          showButtonHUD(`Botão ${i}`);

          // Botão 3 (thumbstick pressionado) → mostra logBox
          if (i === 3) {
            logBox.style.display = 'block';
          }

          // Botão 0 (trigger) → carrega e tenta play
          if (i === 0) {
            console.log('Trigger (0) acionado: carregando mídia');
            loadCurrent();
            keepTryingPlay();
          }

          // Botão 4 (A) → próximo índice
          if (i === 4) {
            sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
            console.log('A (4): índice agora', sel.selectedIndex);
          }

          // Botão 5 (B) → índice anterior
          if (i === 5) {
            sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
            console.log('B (5): índice agora', sel.selectedIndex);
          }

          // Botão 1 (grip) → mostra loading HUD
          if (i === 1) {
            const nomeAtual = sel.options[sel.selectedIndex].dataset.name;
            console.log('Grip (1): mostrando Loading para', nomeAtual);
            showLoading(nomeAtual);
          }
        }
      });

      // Se soltou o botão 3 (thumbstick), esconde logBox
      if (!nowPressed[3] && prevButtons[3]) {
        logBox.style.display = 'none';
      }

      // Se soltou o botão 1, esconde loading HUD
      if (!nowPressed[1] && prevButtons[1]) {
        hideLoading();
      }

      // Se nenhum botão está pressionado, esconde HUD de botão
      if (!nowPressed.some(Boolean)) {
        hideButtonHUD();
      }

      prevButtons = nowPressed;
    });
  } else {
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
    logBox.style.display = 'none';
  }

  renderer.render(scene, camera);
});
