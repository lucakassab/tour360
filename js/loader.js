// js/loader.js
(async () => {
  // 1) Detecta se é mobile
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // 2) Detecta se o browser/hardware suporta WebXR (“immersive-vr”)
  const canVR = navigator.xr && await navigator.xr.isSessionSupported?.('immersive-vr');

  // 3) Carrega SEMPRE o módulo 2D primeiro (desktop ou mobile)
  const baseEntry = isMobile ? './mobile.js' : './desktop.js';
  let mediaModule = await import(baseEntry);
  mediaModule.initialize?.();

  // 4) Se suportar VR, injeta botão “Enter VR” mas NÃO carrega vr.js de imediato
  if (canVR) {
    // Importa apenas o VRButton do CDN (não importa "three" diretamente)
    const { VRButton } = await import(
      'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js'
    );
    // Importa apenas o renderer (e câmera) do nosso core.js
    const { renderer } = await import('./core.js');

    // Cria o botão “Enter VR”
    const vrButton = VRButton.createButton(renderer);
    vrButton.style.position = 'absolute';
    vrButton.style.bottom = '20px';
    vrButton.style.right = '20px';
    document.body.appendChild(vrButton);

    // Só quando o usuário clicar em “Enter VR” é que carregamos o módulo vr.js
    vrButton.addEventListener('click', async () => {
      mediaModule = await import('./vr.js');
      mediaModule.initialize?.();
    });
  }

  // 5) Busca a lista de mídias na pasta /media do GitHub
  const GITHUB_API = 'https://api.github.com/repos/lucakassab/tour360/contents/media';
  const EXT = ['.jpg', '.png', '.mp4', '.webm', '.mov'];
  let mediaList = [];

  try {
    const resp = await fetch(GITHUB_API);
    if (resp.ok) {
      const arr = await resp.json();
      mediaList = arr
        .filter(item => {
          const nome = item.name.toLowerCase();
          return EXT.some(e => nome.endsWith(e));
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

  // 6) Preenche o <select> com as mídias
  const select = document.getElementById('mediaSelect');
  mediaList.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m.name;
    select.appendChild(opt);
  });

  // 7) Botão “Carregar 360” repassa para o módulo ativo (desktop/mobile ou vr)
  const btn = document.getElementById('btnLoad');
  btn.addEventListener('click', () => {
    const sel = mediaList[select.value];
    if (sel) mediaModule.loadMedia?.(sel.url, sel.stereo);
  });

  // 8) Se houver ao menos uma mídia, carrega a primeira por padrão
  if (mediaList.length) {
    const first = mediaList[0];
    mediaModule.loadMedia?.(first.url, first.stereo);
  }
})();
