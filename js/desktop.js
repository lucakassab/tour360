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

/* ───── CONTROLES MOUSE + WHEEL ───── */
let camDist = 0,
    lon     = 0,
    lat     = 0,
    onDx    = 0,
    onDy    = 0,
    dragging = false;

window.addEventListener('wheel', e => {
  camDist = Math.max(0, Math.min(2000, camDist - e.deltaY * 0.5));
});
renderer.domElement.addEventListener('mousedown', e => {
  dragging = true;
  onDx = e.clientX;
  onDy = e.clientY;
});
renderer.domElement.addEventListener('mousemove', e => {
  if (!dragging) return;
  lon += (onDx - e.clientX) * 0.1;
  lat += (e.clientY - onDy) * 0.1;
  onDx = e.clientX;
  onDy = e.clientY;
});
renderer.domElement.addEventListener('mouseup', () => dragging = false);

/* ───── Helper pra detectar nome “_stereo” ───── */
function isStereoName(name) {
  return /_stereo/i.test(name);
}

/* ───── Carrega lista de mídias e primeira textura ───── */
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
    const opt = sel.options[0];
    const stereo = isStereoName(opt.dataset.name);
    loadTexture(opt.value, stereo, (tex, st) => createSphere(tex, st));
  });

document.getElementById('btnLoad').onclick = () => {
  const opt = sel.options[sel.selectedIndex];
  const stereo = isStereoName(opt.dataset.name);
  loadTexture(opt.value, stereo, (tex, st) => createSphere(tex, st));
};

/* ───── Render loop (camera orbit) ───── */
renderer.setAnimationLoop(() => {
  // 1) Reposiciona sprite de loading (se existir)
  updateLoadingPosition();

  // 2) Calcula órbita da câmera
  const phi   = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);

  if (camDist > 0) {
    camera.position.set(
      camDist * Math.sin(phi) * Math.cos(theta),
      camDist * Math.cos(phi),
      camDist * Math.sin(phi) * Math.sin(theta)
    );
  } else {
    camera.position.set(0, 0, 0);
  }

  const x = Math.sin(phi) * Math.cos(theta),
        y = Math.cos(phi),
        z = Math.sin(phi) * Math.sin(theta);

  camera.lookAt(x, y, z);

  // 3) Render
  renderer.render(scene, camera);
});
