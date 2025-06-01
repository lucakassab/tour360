(async ()=>{
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const canVR=navigator.xr && await navigator.xr.isSessionSupported?.('immersive-vr');
  const entry= canVR ? './js/vr.js' : (isMobile ? './js/mobile.js' : './js/desktop.js');
  import(entry).catch(e=>console.error('Falhou ao carregar',entry,e));
})();
