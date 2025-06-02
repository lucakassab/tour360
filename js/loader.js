// js/loader.js
(async () => {
  // 1) Detecta if é Mobile
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  // 2) Detecta se é capaz de VR (este método só diz se o browser/hardware suporta)
  const canVR = navigator.xr && await navigator.xr.isSessionSupported?.('immersive-vr');

  // 3) Carrega módulo 2D (desktop ou mobile) SEMPRE primeiro
  const baseEntry = isMobile ? './mobile.js' : './desktop.js';
  let mediaModule = await import(baseEntry);
  // Aí inicia controles 2D (OrbitControls ou touch) na cena
  mediaModule.initialize?.();

  // 4) Se suportar VR, cria o botão “Enter VR” mas NÃO carrega o vr.js ainda
  if (canVR) {
    // Importa VRButton e pega renderer/camera do core
    const { VRButton } = await import('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js');
    const { renderer } = await import('./core.js');

    // Gera o elemento do botão
    const vrButton = VRButton.createButton(renderer);
    // Estiliza posição (opcional)
    vrButton.style.position = 'absolute';
    vrButton.style.bottom = '20px';
    vrButton.style.right = '20px';
    document.body.appendChild(vrButton);

    // Quando o usuário clicar em “Enter VR”, só aí carregamos vr.js
    vrButton.addEventListener('click', async () => {
      // Import dinâmico de vr.js (substitui o mediaModule atual)
      mediaModule = await import('./vr.js');
      mediaModule.initialize?.();
    });
  }

  // 5) Busca lista de mídias no GitHub e monta o dropdown
  const GITHUB_API = 'https://api.github.com/repos/lucakassab/tour360/contents/media';
  const EXT = ['.jpg', '.png', '.mp4', '.webm', '.mov'];
  let mediaList = [];

  try {
    const resp = await fetch(GITHUB_API);
    if (resp.ok) {
      const arr = await resp.json();
      mediaList = arr
        .filter(item => {
          const n = item.name.toLowerCase();
          return EXT.some(e => n.endsWith(e));
        })
        .map(item => ({
          name: item.name,
          url: item.download_url,
          stereo: item.name.toLowerCase().includes('_stereo')
        }));
    } else {
      console.error('Falha ao buscar mídias', resp.status);
    }
  } catch (e) {
    console.error('Erro ao buscar mídias', e);
  }

  // 6) Preenche <select> com as mídias
  const select = document.getElementById('mediaSelect');
  mediaList.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m.name;
    select.appendChild(opt);
  });

  // 7) Botão “Carregar 360” repassa para o mediaModule (desktop/mobile ou vr) 
  const btn = document.getElementById('btnLoad');
  btn.addEventListener('click', () => {
    const sel = mediaList[select.value];
    if (sel) mediaModule.loadMedia?.(sel.url, sel.stereo);
  });

  // 8) Carrega a primeira mídia (se existir) no módulo 2D
  if (mediaList.length) {
    const first = mediaList[0];
    mediaModule.loadMedia?.(first.url, first.stereo);
  }
})();
