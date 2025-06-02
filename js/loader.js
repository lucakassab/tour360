(async () => {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const canVR    = navigator.xr && await navigator.xr.isSessionSupported?.('immersive-vr');

  // módulo base
  let mediaModule = await import(isMobile ? './mobile.js' : './desktop.js');
  mediaModule.initialize();

  // pré-carrega lista de mídias
  const GITHUB_API = 'https://api.github.com/repos/lucakassab/tour360/contents/media';
  const EXT = ['.jpg','.png','.mp4','.webm','.mov'];

  const list = await fetch(GITHUB_API).then(r=>r.json()).then(arr =>
      arr.filter(f => EXT.some(e => f.name.toLowerCase().endsWith(e)))
         .map(f => ({name:f.name,url:f.download_url,stereo:f.name.toLowerCase().includes('_stereo')}))
  );

  const sel = document.getElementById('mediaSelect');
  list.forEach((m,i)=>{
    const o=document.createElement('option');o.value=i;o.textContent=m.name;sel.appendChild(o);
  });

  document.getElementById('btnLoad').addEventListener('click', ()=>{
    const m=list[sel.value]; if(m) mediaModule.loadMedia(m.url,m.stereo);
  });

  // carrega a primeira
  if (list.length) mediaModule.loadMedia(list[0].url, list[0].stereo);

  // módulo VR (só configura, não reseta core)
  if (canVR) {
    const vrModule = await import('./vr.js');
    vrModule.initialize();
    vrModule.onEnterXR = () => { mediaModule = vrModule; };
  }
})();
