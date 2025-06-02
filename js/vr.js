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

/* ---------- Carrega lista + primeira ---------- */
const sel = document.getElementById('mediaSelect');

fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    const imgs = files.filter(
      f => f.type === 'file' && /\.(jpe?g|png)$/i.test(f.name)
    );
    if (!imgs.length) {
      console.error('Nada em /media');
      return;
    }

    imgs.forEach(f => {
      const o = document.createElement('option');
      o.value = f.download_url;
      o.text = f.name;
      o.dataset.name = f.name;
      sel.appendChild(o);
    });

    sel.selectedIndex = 0;
    loadCurrent(); // carrega a primeira
  })
  .catch(err => console.error('Fetch media falhou:', err));

/* ---------- Botão “Carregar” do menu ---------- */
document.getElementById('btnLoad').onclick = () => loadCurrent();

/* carrega a opção selecionada */
function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);
  loadTexture(opt.value, stereo, tex => createSphere(tex, stereo), name);
}

/* ---------- Gamepad ---------- */
let prevButtons = [];
let currentButtonIdxForHUD = null; // qual botão disparou o HUD de navegação

renderer.setAnimationLoop(() => {
  updateLoadingPosition();
  updateButtonPosition();

  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp = src.gamepad;
        const nowPressed = gp.buttons.map(b => b.pressed);

        // Detecta novos cliques
        for (let i = 0; i < nowPressed.length; i++) {
          if (nowPressed[i] && !prevButtons[i]) {
            // Sempre mostra HUD com o nome cru do botão
            showButtonHUD(`Botão ${i}`);

            // Navegação
            if (i === 4) {
              sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
              loadCurrent();
              currentButtonIdxForHUD = i;
            } else if (i === 5) {
              sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
              loadCurrent();
              currentButtonIdxForHUD = i;
            } else {
              currentButtonIdxForHUD = null;
            }

            // Mostrar nome da mídia enquanto segurar o botão 1
            if (i === 1) {
              const opt = sel.options[sel.selectedIndex];
              showLoading(opt.dataset.name);
            }
          }
        }

        // Se botão 1 foi solto, esconde o Loading
        if (!nowPressed[1] && prevButtons[1]) {
          hideLoading();
        }

        // Esconde HUD de botão se ninguém mais estiver pressionando nada
        const stillAnyPressed = nowPressed.some(p => p);
        if (!stillAnyPressed) hideButtonHUD();

        prevButtons = nowPressed;
      }
    });
  } else {
    // Fora de sessão XR
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
  }

  renderer.render(scene, camera);
});
