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

/* ---- Controles touch simples ---- */
let lonTouch = 0, latTouch = 0, onX = 0, onY = 0, draggingTouch = false;
renderer.domElement.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  draggingTouch = true;
  onX = e.touches[0].pageX;
  onY = e.touches[0].pageY;
});
renderer.domElement.addEventListener('touchmove', e => {
  if (!draggingTouch) return;
  lonTouch += (onX - e.touches[0].pageX) * 0.1;
  latTouch += (e.touches[0].pageY - onY) * 0.1;
  onX = e.touches[0].pageX;
  onY = e.touches[0].pageY;
});
renderer.domElement.addEventListener('touchend', () => { draggingTouch = false; });

/* ---- carrega lista & primeira textura ---- */
const selMob = document.getElementById('mediaSelect');
fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    files
      .filter(f => f.type === 'file' && /\.(jpe?g|png)$/i.test(f.name))
      .forEach(f => {
        const o = document.createElement('option');
        o.value = f.download_url;
        o.text  = f.name;
        o.dataset.name = f.name;
        selMob.appendChild(o);
      });
    selMob.selectedIndex = 0;

    // Detecta estéreo pelo nome
    const name0 = selMob.options[0].dataset.name.toLowerCase();
    const isStereo0 = name0.includes('_stereo');

    showLoading();
    loadTexture(selMob.value, isStereo0, tex => {
      createSphere(tex, isStereo0);
    });
  });

document.getElementById('btnLoad').onclick = () => {
  const chosenName = selMob.options[selMob.selectedIndex].dataset.name.toLowerCase();
  const isStereo   = chosenName.includes('_stereo');
  showLoading();
  loadTexture(selMob.value, isStereo, tex => {
    createSphere(tex, isStereo);
  });
};

/* ---- render loop ---- */
renderer.setAnimationLoop(() => {
  // 1) atualiza posição do Loading (se existir)
  updateLoadingPosition();

  // 2) orbita câmera
  const phi   = THREE.MathUtils.degToRad(90 - latTouch);
  const theta = THREE.MathUtils.degToRad(lonTouch);
  camera.position.set(0, 0, 0);
  camera.lookAt(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );

  // 3) render
  renderer.render(scene, camera);
});
