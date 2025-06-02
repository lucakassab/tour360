// desktop.js (sem grandes mudanças, já estava otimizado)
import {
  THREE,
  scene,
  camera,
  renderer,
  loadTexture,
  createSphere,
  updateLoadingPosition
} from './core.js';

/* detecta “_stereo” */
const isStereoName = n => /_stereo/i.test(n);

/* ─── Controles de mouse / scroll ─── */
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

renderer.domElement.addEventListener('mouseup', () => {
  dragging = false;
});

/* ─── Carrega lista & primeira mídia (imagem ou vídeo) ─── */
const selDesk = document.getElementById('mediaSelect');

fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    const media = files.filter(
      f => f.type === 'file' && /\.(jpe?g|png|mp4|webm|mov)$/i.test(f.name)
    );
    if (!media.length) {
      console.error('Nenhum arquivo em /media.');
      return;
    }
    media.forEach(f => {
      const o = document.createElement('option');
      o.value = f.download_url;
      o.text  = f.name;
      o.dataset.name = f.name;
      selDesk.appendChild(o);
    });
    selDesk.selectedIndex = 0;
    loadCurrent();
  })
  .catch(err => console.error('Falha no fetch:', err));

document.getElementById('btnLoad').onclick = () => loadCurrent();

function loadCurrent() {
  const opt    = selDesk.options[selDesk.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);
  loadTexture(opt.value, stereo, tex => createSphere(tex, stereo), name);
}

/* ─── render loop ─── */
renderer.setAnimationLoop(() => {
  updateLoadingPosition();

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
  camera.lookAt(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );

  renderer.render(scene, camera);
});
