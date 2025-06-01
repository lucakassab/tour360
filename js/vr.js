import {
  THREE,
  scene,
  camera,
  renderer,
  loadTexture,
  createSphere,
  showLoading,
  hideLoading,
  updateLoadingPosition,
  showButtonHUD,
  hideButtonHUD,
  updateButtonPosition
} from './core.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js';

renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

/* ───── Helper pra detectar nome “_stereo” ───── */
function isStereoName(name) {
  return /_stereo/i.test(name);
}

/* ───── Armazena qual botão (A/B/init) acionou o load ───── */
let lastButton = 'init'; // no início, vem do fetch automático

/* ───── Carrega lista + primeira textura ───── */
const sel = document.getElementById('mediaSelect');
fetch('https://api.github.com/repos/lucakassab/tour360/contents/media')
  .then(r => r.json())
  .then(files => {
    files
      .filter(f => f.type === 'file' && /\.(jpe?g|png)$/i.test(f.name))
      .forEach(f => {
        const o = document.createElement('option');
        o.value = f.download_url;
        o.text = f.name;
        o.dataset.name = f.name;
        sel.appendChild(o);
      });
    sel.selectedIndex = 0;

    // Carregamento inicial (botão “init”)
    const opt0    = sel.options[0];
    const name0   = opt0.dataset.name;
    const stereo0 = isStereoName(name0);

    // Mostra loading com nome da mídia e “init”
    lastButton = 'init';
    showLoading(`${name0} [botão ${lastButton}]`);
    loadTexture(opt0.value, stereo0, (tex, isSt) => createSphere(tex, isSt));
  });

/* ───── Handler para clicar em “Carregar 360” ───── */
document.getElementById('btnLoad').onclick = () => {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);

  // Aqui chamamos showLoading com texto customizado
  showLoading(`${name} [botão ${lastButton}]`);
  loadTexture(opt.value, stereo, (tex, isSt) => createSphere(tex, isSt));
};

/* ───── Detecção e exibição de todos os botões ───── */
let prevButtons = []; // armazena estado anterior de cada botão

renderer.setAnimationLoop(() => {
  // 1) Atualiza posição do HUD Loading (se existir)
  updateLoadingPosition();

  // 1.1) Atualiza posição do HUD de botão (se existir)
  updateButtonPosition();

  // 2) Se estiver em VR, lê gamepad do controle direito
  const session = renderer.xr.getSession();
  if (session) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp = src.gamepad;
        const nowPressed = gp.buttons.map(btn => btn.pressed);

        // Itera todos os botões pra detectar novos presses
        let anyNewPress = false;
        for (let i = 0; i < nowPressed.length; i++) {
          const isPressed  = nowPressed[i];
          const wasPressed = prevButtons[i] || false;
          if (isPressed && !wasPressed) {
            anyNewPress = true;
            let buttonName = `Botão ${i}`;
            let actionText = 'sem ação';

            // Mapeia A e B “oficiais” (índice 3 e 4 ou 1)
            if (i === 3) {
              buttonName = 'Botão A';
              actionText = 'próxima mídia';
              sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
              lastButton = 'A';
              document.getElementById('btnLoad').click();
            } else if (i === 4 || i === 1) {
              buttonName = 'Botão B';
              actionText = 'mídia anterior';
              lastButton = 'B';
              sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
              document.getElementById('btnLoad').click();
            }

            // Exibe no HUD de botão: "Botão X → açãoTexto"
            showButtonHUD(`${buttonName} → ${actionText}`);
            break; // mostra só o primeiro botão detectado nessa frame
          }
        }

        // Se não houve nenhum novo pressione, esconde o HUD se nenhum botão estiver segurado
        if (!anyNewPress) {
          const stillPressed = nowPressed.some(p => p);
          if (!stillPressed) {
            hideButtonHUD();
          }
        }

        // Atualiza prevButtons para a próxima iteração
        prevButtons = nowPressed;
      }
    });
  } else {
    prevButtons = [];
    hideButtonHUD();
  }

  // 3) Renderiza cena VR
  renderer.render(scene, camera);
});
