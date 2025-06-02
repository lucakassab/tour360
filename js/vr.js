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

// Helper pra detectar “_stereo” no nome
const isStereoName = n => /_stereo/i.test(n);

// Guarda o <video> atual (definido dentro de core.js como currentVid)
// Forçar-reprodução se estiver pausado
function forcePlayIfPaused() {
  const v = window.currentVid;
  if (v && v.paused) {
    v.play().catch(() => {
      // Se ainda falhar, deixa para o listener de 'select' disparar depois
    });
  }
}

// Quando a sessão VR começar, garante que qualquer "select" destrave o vídeo
renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  if (!session) return;
  session.addEventListener('select', () => {
    // Sempre que houver um “select” no controlador, tenta dar play de novo
    forcePlayIfPaused();
  });
});

// ---------- Carrega lista + primeira mídia ----------
const sel = document.getElementById('mediaSelect');

fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    const media = files.filter(
      f => f.type === 'file' && /\.(jpe?g|png|mp4|webm|mov)$/i.test(f.name)
    );
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

// ---------- Botão “Carregar Mídia” no menu fora do VR ----------
document.getElementById('btnLoad').onclick = () => {
  // Ao clicar no botão, sempre tentar forçar play logo após carregar
  loadCurrent();
  forcePlayIfPaused();
};

// Carrega a mídia atualmente selecionada no dropdown
function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);

  // loadTexture já põe o <video> em window.currentVid via core.js
  loadTexture(opt.value, stereo, tex => {
    createSphere(tex, stereo);
  }, name);

  // Tenta forçar play imediatamente (se captar o user gesture)
  forcePlayIfPaused();
}

// ---------- Gamepad VR (botões A/B pra trocar) ----------
let prevButtons = [];

renderer.setAnimationLoop(() => {
  // 1) Atualiza HUDs (loading + botão)
  updateLoadingPosition();
  updateButtonPosition();

  // 2) Lê gamepad VR
  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp = src.gamepad;
        const nowPressed = gp.buttons.map(b => b.pressed);

        for (let i = 0; i < nowPressed.length; i++) {
          // Botão acabou de ser pressionado
          if (nowPressed[i] && !prevButtons[i]) {
            showButtonHUD(`Botão ${i}`);

            // Botões 4 e 5: avançar / voltar mídia
            if (i === 4 || i === 5) {
              // Ajusta selectedIndex conforme o botão
              if (i === 4) {
                sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
              } else {
                sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
              }
              loadCurrent();
              // Força play já (se for user gesture reconhecido)
              forcePlayIfPaused();
            }

            // Botão 1: mostrar nome da mídia atual no HUD
            if (i === 1) {
              const nomeAtual = sel.options[sel.selectedIndex].dataset.name;
              showLoading(nomeAtual);
            }
          }
        }

        // Se soltou o botão 1, esconde loading HUD
        if (!nowPressed[1] && prevButtons[1]) {
          hideLoading();
        }

        // Se nenhum botão está mais pressionado, esconde HUD de botão
        if (!nowPressed.some(p => p)) {
          hideButtonHUD();
        }

        prevButtons = nowPressed;
      }
    });
  } else {
    // Fora do VR, só reset nas pressed arrays e HUDs
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
  }

  // 3) Renderiza a cena VR ou padrão
  renderer.render(scene, camera);
});
