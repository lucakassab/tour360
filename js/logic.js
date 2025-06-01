// URL base onde as mídias ficam no GitHub Pages
const BASE_MEDIA_URL = 'https://lucakassab.github.io/tour360/media';

// Endpoint da GitHub API para listar conteúdo da pasta media
const GITHUB_API_MEDIA = 
  'https://api.github.com/repos/lucakassab/tour360/contents/media';

// Extensões válidas (se quiser vídeo no futuro, basta adicionar '.mp4', etc)
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

// Quando a página carregar, a gente busca a lista de arquivos e preenche o <select>
window.addEventListener('load', () => {
  populateMediaList();
  // Também carrega o primeiro item (se quiser behavior automático)
  // loadMedia();
});

async function populateMediaList() {
  const selectEl = document.getElementById('mediaSelect');

  try {
    const res = await fetch(GITHUB_API_MEDIA);
    if (!res.ok) throw new Error(`API retornou ${res.status}`);
    const data = await res.json();

    // Filtramos só arquivos: name termina com _Mono ou _Stereo e extensão válida
    const validFiles = data
      .map(item => item.name)
      .filter(name => {
        const lower = name.toLowerCase();
        const hasSuffix = lower.includes('_mono') || lower.includes('_stereo');
        const hasExt = VALID_EXTENSIONS.some(ext => lower.endsWith(ext));
        return hasSuffix && hasExt;
      });

    if (validFiles.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhuma mídia encontrada';
      selectEl.appendChild(opt);
      return;
    }

    // Preenche o <select> com cada arquivo válido
    validFiles.forEach(filename => {
      const opt = document.createElement('option');
      opt.value = filename;
      // Exemplo: remove extensão pra exibir algo mais legível
      const label = filename.replace(/(\.jpg|\.jpeg|\.png)$/i, '');
      opt.textContent = label;
      selectEl.appendChild(opt);
    });

    // (Opcional) Seleciona automaticamente a primeira opção
    selectEl.selectedIndex = 0;

  } catch (err) {
    console.error('Erro ao buscar lista de mídias:', err);
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Erro ao carregar mídias';
    selectEl.appendChild(opt);
  }
}

async function loadMedia() {
  const selectEl = document.getElementById('mediaSelect');
  const selected = selectEl.value;
  if (!selected) return;

  // Decide se é estéreo ou mono baseado no nome
  const isStereo = selected.toLowerCase().includes('_stereo');
  const skyEl = document.getElementById('sky');
  const assetContainer = document.getElementById('assetContainer');

  // Limpa qualquer coisa anterior
  assetContainer.innerHTML = '';
  skyEl.innerHTML = '';

  // Monta o URL completo para a mídia (suporta A-Frame carregando via <img>)
  const mediaUrl = `${BASE_MEDIA_URL}/${selected}`;

  // Cria o elemento <img> dinamicamente
  const imgEl = document.createElement('img');
  imgEl.setAttribute('id', 'media360');
  imgEl.setAttribute('src', mediaUrl);
  assetContainer.appendChild(imgEl);

  imgEl.onload = () => {
    const scene = document.querySelector('a-scene');
    const isVR = scene.renderer.xr?.isPresenting || false;

    // Sempre recria o componente de céu (a-sky genérico)
    skyEl.setAttribute('geometry', {
      primitive: 'sphere',
      radius: 5000,
      segmentsWidth: 64,
      segmentsHeight: 64
    });
    skyEl.setAttribute('material', {
      shader: 'flat',
      src: '#media360',
      side: 'back',
      npot: true,
      // se for estéreo e não estiver em VR, repete só metade
      repeat: isStereo && !isVR ? '0.5 1' : '1 1'
    });

    // Se for estéreo E estiver em VR, ativa o componente stereo
    if (isStereo && isVR) {
      skyEl.setAttribute('stereo', 'true');
    } else {
      skyEl.removeAttribute('stereo');
    }
  };

  imgEl.onerror = () => {
    console.error(`Falha ao carregar mídia: ${mediaUrl}`);
    // Aqui você pode exibir um aviso na tela se quiser
  };
}
