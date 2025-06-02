(async ()=>{
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const canVR=navigator.xr && await navigator.xr.isSessionSupported?.('immersive-vr');

  let mediaModule=await import(isMobile ? './mobile.js' : './desktop.js');
  mediaModule.initialize();

  let vrModule=null;
  if(canVR){
    vrModule=await import('./vr.js');
    vrModule.initialize();
    vrModule.onEnterXR=()=>{ mediaModule=vrModule; };
  }

  /* --- Lista de mídias --- */
  const EXT=['.jpg','.png','.mp4','.webm','.mov'];
  const res=await fetch('https://api.github.com/repos/lucakassab/tour360/contents/media');
  const json=res.ok ? await res.json() : [];
  const media=json.filter(f=>EXT.some(e=>f.name.toLowerCase().endsWith(e)))
                  .map(f=>({ name:f.name, url:f.download_url, stereo:f.name.toLowerCase().includes('_stereo') }));

  const sel=document.getElementById('mediaSelect');
  media.forEach((m,i)=>{
    const o=document.createElement('option');o.value=i;o.textContent=m.name;sel.appendChild(o);
  });

  document.getElementById('btnLoad').addEventListener('click',()=>{
    const m=media[sel.value]; if(m) mediaModule.loadMedia(m.url,m.stereo);
  });

  /* Carrega primeira mídia */
  if(media.length) mediaModule.loadMedia(media[0].url,media[0].stereo);
})();
