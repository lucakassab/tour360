async function loadMedia() {
  const selected = document.getElementById("mediaSelect").value;
  const isStereo = selected.toLowerCase().includes("_stereo");
  const skyEl = document.getElementById("sky");
  const assetContainer = document.getElementById("assetContainer");

  // Limpa assets anteriores
  assetContainer.innerHTML = "";
  skyEl.innerHTML = "";

  // Cria novo asset
  const imgEl = document.createElement("img");
  imgEl.setAttribute("id", "media360");
  imgEl.setAttribute("src", `media/${selected}`);
  assetContainer.appendChild(imgEl);

  // Espera carregar a imagem antes de aplicar
  imgEl.onload = () => {
    const scene = document.querySelector("a-scene");
    const isVR = scene.renderer.xr?.isPresenting || false;

    if (isStereo && isVR) {
      // Estéreo no VR
      skyEl.setAttribute("geometry", {
        primitive: "sphere",
        radius: 5000,
        segmentsWidth: 64,
        segmentsHeight: 64
      });
      skyEl.setAttribute("material", {
        shader: "flat",
        src: "#media360",
        side: "back",
        npot: true
      });
      skyEl.setAttribute("stereo", "true");
    } else {
      // Mono ou estéreo fora do VR (corta metade da textura)
      skyEl.setAttribute("geometry", {
        primitive: "sphere",
        radius: 5000,
        segmentsWidth: 64,
        segmentsHeight: 64
      });
      skyEl.setAttribute("material", {
        shader: "flat",
        src: "#media360",
        side: "back",
        npot: true,
        repeat: isStereo ? "0.5 1" : "1 1"
      });
      skyEl.removeAttribute("stereo");
    }
  };
}

// Carrega a primeira por padrão
window.addEventListener("load", () => {
  loadMedia();
});
