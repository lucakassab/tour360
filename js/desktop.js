import { THREE, scene, camera, renderer, loadTexture, createSphere, showLoading, hideLoading } from './core.js';

/* ---- Controles de mouse / scroll ---- */
let camDist = 0, lon=0, lat=0, onDx=0, onDy=0, dragging=false;
window.addEventListener('wheel', e => camDist = Math.max(0, Math.min(2000, camDist - e.deltaY*0.5)));
renderer.domElement.addEventListener('mousedown', e => { dragging=true; onDx=e.clientX; onDy=e.clientY; });
renderer.domElement.addEventListener('mousemove', e => {
  if(!dragging) return;
  lon += (onDx - e.clientX)*0.1; lat += (e.clientY - onDy)*0.1;
  onDx=e.clientX; onDy=e.clientY;
});
renderer.domElement.addEventListener('mouseup', ()=> dragging=false);

/* ---- carrega lista & primeira textura ---- */
const sel = document.getElementById('mediaSelect');
fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r=>r.json())
  .then(files=>{
    files.filter(f=>f.type==='file'&&/\.(jpe?g|png)$/i.test(f.name)).forEach(f=>{
      const o=document.createElement('option');
      o.value=f.download_url; o.text=f.name; sel.appendChild(o);
    });
    sel.selectedIndex=0;
    loadTexture(sel.value, false, tex=>createSphere(tex,false));   // assume mono no desktop
  });

document.getElementById('btnLoad').onclick = () => {
  loadTexture(sel.value, false, tex=>createSphere(tex,false));
};

/* ---- render loop ---- */
renderer.setAnimationLoop(()=>{
  // cam orbit básica
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  if(camDist>0){
    camera.position.set(
      camDist*Math.sin(phi)*Math.cos(theta),
      camDist*Math.cos(phi),
      camDist*Math.sin(phi)*Math.sin(theta)
    );
  } else camera.position.set(0,0,0);
  const x=Math.sin(phi)*Math.cos(theta), y=Math.cos(phi), z=Math.sin(phi)*Math.sin(theta);
  camera.lookAt(x,y,z);
  renderer.render(scene,camera);
});
