// mobile.js (pixelRatio reduzido via core.js já ajuda bastante)
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

/* ─── Touch orbit básico ─── */
let lon = 0, lat = 0, dist = 0;
let dx = 0, dy = 0, dragging = false;

renderer.domElement.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  dragging = true;
  dx = e.touches[0].clientX;
  dy = e.touches[0].clientY;
});

renderer.domElement.addEventListener('touchmove', e => {
  if (!dragging || e.touches.length !== 1) return;
  lon += (dx - e.touches[0].clientX) * 0.1;
  lat += (e.touches[0].clientY - dy) * 0.1;
  dx = e.touches[0].clientX;
  dy = e.touches[0].clientY;
});

renderer.domElement.addEventListener('touchend', () => {
  dragging = false;
});

window.addEventListener('wheel', e => {
  dist = Math.max(0, Math.min(2000, dist - e.deltaY * 0.5));
});

/* ─── lista & primeira mídia ─── */
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
  .catch(err => console.error('fetch media falhou:', err));

document.getElementById('btnLoad').onclick = () => loadCurrent();

function loadCurrent() {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);
  loadTexture(opt.value, stereo, tex => createSphere(tex, stereo), name);
}

/* ─── render loop ─── */
renderer.setAnimationLoop(() => {
  updateLoadingPosition();

  const phi   = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);

  if (dist > 0) {
    camera.position.set(
      dist * Math.sin(phi) * Math.cos(theta),
      dist * Math.cos(phi),
      dist * Math.sin(phi) * Math.sin(theta)
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
