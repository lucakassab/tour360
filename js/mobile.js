import { THREE, scene, camera, renderer, loadTexture, createSphere } from './core.js';

/* ---- Controles touch simples ---- */
let lon=0, lat=0, onX=0, onY=0, dragging=false;
renderer.domElement.addEventListener('touchstart', e=>{
  if(e.touches.length!==1) return;
  dragging=true; onX=e.touches[0].pageX; onY=e.touches[0].pageY;
});
renderer.domElement.addEventListener('touchmove', e=>{
  if(!dragging) return;
  lon += (onX - e.touches[0].pageX)*0.1;
  lat += (e.touches[0].pageY - onY)*0.1;
  onX=e.touches[0].pageX; onY=e.touches[0].pageY;
});
renderer.domElement.addEventListener('touchend', ()=> dragging=false);

/* ---- carrega lista ---- */
const sel=document.getElementById('mediaSelect');
fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r=>r.json())
  .then(files=>{
    files.filter(f=>f.type==='file'&&/\.(jpe?g|png)$/i.test(f.name)).forEach(f=>{
      const o=document.createElement('option');
      o.value=f.download_url; o.text=f.name; o.dataset.name=f.name; sel.appendChild(o);
    });
    sel.selectedIndex=0;
    loadTexture(opt.value,isStereoName(opt.dataset.name),(tex,st)=>createSphere(tex,st));
  });
document.getElementById('btnLoad').onclick=()=> loadTexture(sel.value,false,(tex)=>createSphere(tex,false));

renderer.setAnimationLoop(()=>{
  const phi=THREE.MathUtils.degToRad(90-lat);
  const theta=THREE.MathUtils.degToRad(lon);
  camera.position.set(0,0,0);
  camera.lookAt(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
  renderer.render(scene,camera);
});
