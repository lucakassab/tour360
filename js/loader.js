// js/loader.js
(async () => {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const canVR = navigator.xr && await navigator.xr.isSessionSupported?.('immersive-vr');

  // módulo 2D
  let mediaModule = await import(isMobile ? './mobile.js' : './desktop.js');
  mediaModule.initialize?.();

  // módulo VR (carregado, mas inativo)
  let vrModule = null;
  if (canVR) {
    try { vrModule = await import('./vr.js'); }
    catch (e) { console.warn('VR indisponível:', e); }
  }

  // lista de mídias
  const GITHUB_API = 'https://api.github.com/repos/lucakassab/tour360/contents/media';
  const EXT = ['.jpg','.png','.mp4','.webm','.mov'];
  const resp = await fetch(GITHUB_API);
  const arr  = resp.ok ? await resp.json() : [];
  const mediaList = arr.filter(f => EXT.some(ext => f.name.toLowerCase().endsWith(ext)))
                       .map(f => ({
                         name: f.name,
                         url:  f.download_url,
                         stereo: f.name.toLowerCase().includes('_stereo')
                       }));

  // dropdown
  const select = document.getElementById('mediaSelect');
  mediaList.forEach((m,i)=>{
    const o = document.createElement('option');
    o.value=i; o.textContent=m.name;
    select.appendChild(o);
  });

  // botão carregar
  const btn = document.getElementById('btnLoad');
  btn.addEventListener('click', ()=>{
    const sel = mediaList[select.value];
    if (sel) mediaModule.loadMedia?.(sel.url, sel.stereo);
  });

  // carrega a primeira mídia
  if (mediaList.length) {
    const first = mediaList[0];
    mediaModule.loadMedia?.(first.url, first.stereo);
  }

  // prepara VR
  if (vrModule) {
    vrModule.initialize?.();           // injeta VRButton agora
    vrModule.onEnterXR = () => {       // quando entrar, troca o módulo ativo
      mediaModule = vrModule;
    };
  }
})();
