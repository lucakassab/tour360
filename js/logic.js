// URL base onde as mídias ficam no GitHub Pages
const BASE_MEDIA_URL = 'https://lucakassab.github.io/tour360/media';

// Endpoint da GitHub API para listar conteúdo da pasta media
const GITHUB_API_MEDIA =
  'https://api.github.com/repos/lucakassab/tour360/contents/media';

// Extensões válidas (pode adicionar .mp4 etc depois)
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

window.addEventListener('load', () => {
  populateMediaList();
});

async function populateMediaList() {
  const selectEl = document.getElementById('mediaSelect');

  try {
    const res = await fetch(GITHUB_API_MEDIA);
    if (!res.ok) throw new Error(`API retornou ${res.status}`);
    const data = await res.json();

    // Filtra só nomes que terminam em _Mono ou _Stereo e com extensão válida
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

    validFiles.forEach(filename => {
      const opt = document.createElement('option');
      opt.value = filename;
      // Remove extensão para exibir algo mais limpo
      const label = filename.replace(/(\.jpg|\.jpeg|\.png)$/i, '');
      opt.textContent = label;
      selectEl.appendChild(opt);
    });

    // Seleciona a primeira opção por padrão
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
  if (!selected) return; // Se não escolher nada, sai

  const isStereo = selected.toLowerCase().includes('_stereo');
  const skyEl = document.getElementById('sky');
  const assetContainer = document.getElementById('assetContainer');

  // Limpa qualquer asset antigo
  assetContainer.innerHTML = '';
  // Garante que o <a-sky> não tenha nenhuma configuração antiga
  skyEl.removeAttribute('material');
  skyEl.removeAttribute('stereo');

  // Monta a URL completa da mídia
  const mediaUrl = `${BASE_MEDIA_URL}/${selected}`;

  // Cria o <img> dentro do <a-assets> para o A-Frame pré-carregar
  const imgEl = document.createElement('img');
  imgEl.setAttribute('id', 'media360');
  imgEl.setAttribute('src', mediaUrl);
  assetContainer.appendChild(imgEl);

  imgEl.onload = () => {
    const scene = document.querySelector('a-scene');
    const isVR = scene.renderer.xr?.isPresenting || false;

    // Configura o material do <a-sky>: shader flat, lado interno e repetições
    // Se for estéreo + NÃO VR, corta a textura ao meio com repeat: "0.5 1".
    // Se for mono ou estiver em VR, usa repeat: "1 1" para mostrar normal.
    const repeatValue = isStereo && !isVR ? '0.5 1' : '1 1';

    skyEl.setAttribute('material', {
      shader: 'flat',
      src: '#media360',
      side: 'back',
      npot: true,
      repeat: repeatValue
    });

    // Se for estéreo E estiver em VR, ativa o componente stereo para renderizar nos dois olhos.
    if (isStereo && isVR) {
      skyEl.setAttribute('stereo', 'true');
    } else {
      skyEl.removeAttribute('stereo');
    }

    // (Opcional) Ajusta rotação se achar necessário mexer no eixo vertical
    // skyEl.setAttribute('rotation', '0 -90 0');
  };

  imgEl.onerror = () => {
    console.error(`Falha ao carregar mídia: ${mediaUrl}`);
  };
}
