import {
  THREE,
  scene,
  camera,
  renderer,
  loadTexture,
  createSphere,
  showLoading,
  hideLoading,
  updateLoadingPosition
} from './core.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';

renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

/* ───── Helper pra detectar nome “_stereo” ───── */
function isStereoName(name) {
  return /_stereo/i.test(name);
}

/* ───── Armazena qual botão (A/B/init) acionou o load ───── */
let lastButton = 'init'; // no início, vem do fetch automático

/* ───── Carrega lista + primeira textura ───── */
const sel = document.getElementById('mediaSelect');
fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    files
      .filter(f => f.type === 'file' && /\.(jpe?g|png)$/i.test(f.name))
      .forEach(f => {
        const o = document.createElement('option');
        o.value = f.download_url;
        o.text = f.name;
        o.dataset.name = f.name;
        sel.appendChild(o);
      });
    sel.selectedIndex = 0;

    // Carregamento inicial (botão “init”)
    const opt0    = sel.options[0];
    const name0   = opt0.dataset.name;
    const stereo0 = isStereoName(name0);

    // Mostra loading com nome da mídia e “init”
    lastButton = 'init';
    showLoading(`${name0} [botão ${lastButton}]`);
    loadTexture(opt0.value, stereo0, (tex, isSt) => createSphere(tex, isSt));
  });

/* ───── Handler para clicar em “Carregar 360” ───── */
document.getElementById('btnLoad').onclick = () => {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);

  // Aqui chamamos showLoading com texto customizado
  showLoading(`${name} [botão ${lastButton}]`);
  loadTexture(opt.value, stereo, (tex, isSt) => createSphere(tex, isSt));
};

/* ───── Botões A/B para trocar mídia em VR ───── */
let prevA = false, prevB = false;

renderer.setAnimationLoop(() => {
  // 1) Reposiciona sprite de Loading (se existir)
  updateLoadingPosition();

  // 2) Lê gamepad e troca mídia se A/B pressionado
  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp = src.gamepad;
        const isA = gp.buttons[3]?.pressed;             // Botão A (index 3)
        const isB = gp.buttons[4]?.pressed || gp.buttons[1]?.pressed; // B ou Y (index 4 ou 1)

        if (isA && !prevA) {
          // Se apertou A agora, salta para próxima mídia
          sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
          lastButton = 'A'; // marca que foi A
          document.getElementById('btnLoad').click();
        }
        if (isB && !prevB) {
          // Se apertou B (ou Y) agora, volta mídia
          sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
          lastButton = 'B'; // marca que foi B
          document.getElementById('btnLoad').click();
        }
        prevA = isA;
        prevB = isB;
      }
    });
  } else {
    prevA = false;
    prevB = false;
  }

  // 3) Render VR
  renderer.render(scene, camera);
});
