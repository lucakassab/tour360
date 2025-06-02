import {
  THREE,
  scene,
  camera,
  renderer,
  loadTexture,
  createSphere,
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
  const opt = sel.options[sel.selectedIndex];
  const name = opt.dataset.name;
  const stereo = isStereoName(name);
  // loadTexture(url, isStereo, cb, msg)
  loadTexture(opt.value, stereo, tex => createSphere(tex, stereo), name);
}

/* ---------- Gamepad A/B ---------- */
let prevA = false;
let prevB = false;

renderer.setAnimationLoop(() => {
  updateLoadingPosition();
  updateButtonPosition();

  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp = src.gamepad;
        const isA = gp.buttons[3]?.pressed; // botão A
        const isB = gp.buttons[4]?.pressed || gp.buttons[1]?.pressed; // botão B

        if (isA && !prevA) {
          sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
          showButtonHUD('Botão A → próxima mídia');
          loadCurrent();
        }
        if (isB && !prevB) {
          sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
          showButtonHUD('Botão B → mídia anterior');
          loadCurrent();
        }

        // esconde HUD quando soltar
        if (!isA && prevA) hideButtonHUD();
        if (!isB && prevB) hideButtonHUD();

        prevA = isA;
        prevB = isB;
      }
    });
  } else {
    prevA = prevB = false;
    hideButtonHUD();
  }

  renderer.render(scene, camera);
});
