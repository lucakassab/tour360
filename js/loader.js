(async ()=>{
  // detecta se é mobile e se consegue VR
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const canVR = navigator.xr && await navigator.xr.isSessionSupported?.('immersive-vr')
  // escolhe o módulo adequado
  const entry = canVR ? './vr.js' : (isMobile ? './mobile.js' : './desktop.js')
  // importa dinamicamente
  const mediaModule = await import(entry)
  // inicializa (cada módulo deve exportar initialize())
  mediaModule.initialize?.()

  // API GitHub pra listar /media
  const GITHUB_API = 'https://api.github.com/repos/lucakassab/tour360/contents/media'
  const EXT = ['.jpg','.png','.mp4','.webm','.mov']
  let mediaList = []

  try {
    const resp = await fetch(GITHUB_API)
    if (resp.ok) {
      const arr = await resp.json()
      mediaList = arr
        .filter(item => {
          const n = item.name.toLowerCase()
          return EXT.some(e=>n.endsWith(e))
        })
        .map(item => ({
          name: item.name,
          url: item.download_url,
          stereo: item.name.toLowerCase().includes('_stereo')
        }))
    } else {
      console.error('Falha ao buscar mídias', resp.status)
    }
  } catch(e) {
    console.error('Erro ao buscar mídias', e)
  }

  // Popula o dropdown
  const select = document.getElementById('mediaSelect')
  mediaList.forEach((m, i) => {
    const opt = document.createElement('option')
    opt.value = i
    opt.textContent = m.name
    select.appendChild(opt)
  })

  // Bind do botão Carregar
  const btn = document.getElementById('btnLoad')
  btn.addEventListener('click', () => {
    const sel = mediaList[select.value]
    if (sel) mediaModule.loadMedia?.(sel.url, sel.stereo)
  })

  // Carrega a primeira mídia automaticamente (se existir)
  if (mediaList.length) {
    const first = mediaList[0]
    mediaModule.loadMedia?.(first.url, first.stereo)
  }
})()
