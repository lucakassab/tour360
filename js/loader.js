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

  // 4) Se suportar VR, faz apenas um import básico de 'vr.js',
  //    mas sem chamar initialize() imediatamente.
  //    Vamos criar o VRButton dentro do próprio vr.js, para evitar
  //    que o loader faça qualquer “import 'three'” incorreto.
  let vrModule = null;
  if (canVR) {
    try {
      vrModule = await import('./vr.js');
      // OBS: NÃO chamamos vrModule.initialize() aqui. Apenas já temos o módulo carregado.
      //      O botão “Enter VR” só será criado quando o usuário clicar no botão que o vr.js injeta.
      //      Ou seja, deixamos o vr.js preparado para quando for realmente chamado.
    } catch (e) {
      console.warn('Falha ao carregar vr.js (sem VR):', e);
      vrModule = null;
    }
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
    if (!sel) return;

    // Se já entrou em VR (iniciou vrModule.initialize), mediaModule foi trocado para vrModule
    mediaModule.loadMedia?.(sel.url, sel.stereo);
  });

  // 8) Se tiver suporte a VR, injetamos o botão “Enter VR” chamando initialize() do vr.js,
  //    mas só após carregar a primeira mídia 2D, para que a cena 2D esteja pronta.
  if (vrModule) {
    // **ATENÇÃO**: chamamos vrModule.initialize() **depois** de termos feito o primeiro loadMedia(),
    //              assim o usuário já vê a mídia em 2D e depois surge o botão VR.
    //              Se chamarmos initialize() antes, vai reiniciar o core e quebrar o 2D.
    if (mediaList.length) {
      // Primeiro carrega a mídia 2D.
      const first = mediaList[0];
      mediaModule.loadMedia?.(first.url, first.stereo);
    }
    // Depois de um breve setTimeout (para garantir que o primeiro frame 2D já tenha sido desenhado),
    // chamamos vrModule.initialize() para criar o VRButton.  
    // Assim, o scene/camera/renderer serão substituídos pela versão VR **somente quando** 
    // o usuário clicar em “Enter VR”. Enquanto isso, a visualização 2D continua intacta.
    setTimeout(() => {
      vrModule.initialize?.();
      // Agora, após esse ponto, se o usuário clicar em “Enter VR”,
      // o próprio VRButton de vr.js vai disparar a sessão WebXR e o vrModule cuidará
      // de chamar loadMediaInSphere() (já rampa o stereo/mono em VR).
      // Mas ainda neste momento, mediaModule === baseEntry (desktop/mobile),
      // então, ao clicar “Carregar 360” antes de entrar em VR, continuamos no 2D.
      // Se o usuário entrar em VR, a callback do VRButton vai chamar a sessão XR
      // e aí precisaremos ajustar para que loadMedia passe a chamar vrModule.loadMedia.
      // Podemos, então, forçar mediaModule = vrModule após a sessão XR iniciar:
      vrModule.onEnterXR = () => {
        mediaModule = vrModule;
      };
      // Nota: precisaremos editar o 'vr.js' pra expor essa onEnterXR callback (mostro abaixo).
    }, 100);
  } else {
    // Se não for VR, simplesmente carrega a primeira mídia (modo 2D) agora
    if (mediaList.length) {
      const first = mediaList[0];
      mediaModule.loadMedia?.(first.url, first.stereo);
    }
  }
})();
