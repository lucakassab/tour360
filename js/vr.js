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

/* ───── helper pra detectar nome 「_stereo」 ───── */
function isStereoName(name) {
  return /_stereo/i.test(name);
}

/* ---- lista + load inicial ---- */
const sel = document.getElementById('mediaSelect');
fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    files.filter(f => f.type === 'file' && /\.(jpe?g|png)$/i.test(f.name))
      .forEach(f => {
        const o = document.createElement('option');
        o.value = f.download_url;
        o.text = f.name;
        o.dataset.name = f.name;
        sel.appendChild(o);
      });
    sel.selectedIndex = 0;
    const opt = sel.options[0];
    const stereo = isStereoName(opt.dataset.name);
    loadTexture(opt.value, stereo, (tex, isStereo) => createSphere(tex, isStereo));
  });

document.getElementById('btnLoad').onclick = () => {
  const opt = sel.options[sel.selectedIndex];
  const stereo = isStereoName(opt.dataset.name);
  loadTexture(opt.value, stereo, (tex, isStereo) => createSphere(tex, isStereo));
};

/* ---- botões A/B para trocar mídia em VR ---- */
let prevA = false, prevB = false;
renderer.setAnimationLoop(() => {
  // atualiza posição/rotação do sprite de loading (se existir)
  updateLoadingPosition();

  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp = src.gamepad;
        const isA = gp.buttons[3]?.pressed;
        const isB = gp.buttons[4]?.pressed || gp.buttons[1]?.pressed;

        if (isA && !prevA) {
          sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
          document.getElementById('btnLoad').click();
        }
        if (isB && !prevB) {
          sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
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

  renderer.render(scene, camera);
});
