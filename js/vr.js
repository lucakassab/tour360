
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

navigator.xr.requestSession = ((original) => async (...args) => {
  if (args[0] === 'immersive-vr' && typeof args[1] === 'object') {
    args[1].optionalFeatures = args[1].optionalFeatures || [];
    if (!args[1].optionalFeatures.includes('hand-tracking')) {
      args[1].optionalFeatures.push('hand-tracking');
    }
  }
  return original(...args);
})(navigator.xr.requestSession.bind(navigator.xr));

document.body.appendChild(VRButton.createButton(renderer));

function isStereoName(name) {
  return /_stereo/i.test(name);
}

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

    const opt0    = sel.options[0];
    const name0   = opt0.dataset.name;
    const stereo0 = isStereoName(name0);
    loadTexture(opt0.value, stereo0, (tex, isSt) => createSphere(tex, isSt));
  });

document.getElementById('btnLoad').onclick = () => {
  const opt    = sel.options[sel.selectedIndex];
  const name   = opt.dataset.name;
  const stereo = isStereoName(name);
  loadTexture(opt.value, stereo, (tex, isSt) => createSphere(tex, isSt));
};

let prevButtons = [];
let currentButtonIndex = null;
let lastPinchTime = { left: 0, right: 0 };
const pinchCooldown = 1000;

renderer.setAnimationLoop((time, frame) => {
  updateLoadingPosition();
  updateButtonPosition();

  const session = renderer.xr.getSession();
  const referenceSpace = renderer.xr.getReferenceSpace();

  if (session && frame) {
    session.inputSources.forEach(src => {
      if (src.gamepad && src.handedness === 'right') {
        const gp = src.gamepad;
        const nowPressed = gp.buttons.map(btn => btn.pressed);
        let anyNewPress = false;

        for (let i = 0; i < nowPressed.length; i++) {
          const isPressed  = nowPressed[i];
          const wasPressed = prevButtons[i] || false;

          if (isPressed && !wasPressed) {
            anyNewPress = true;
            let buttonName = `Botão ${i}`;
            let actionText = 'sem ação';

            if (i === 4) {
              actionText = 'próxima mídia';
              sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
              const opt = sel.options[sel.selectedIndex];
              const name = opt.dataset.name;
              const stereo = isStereoName(name);
              showLoading(name);
              loadTexture(opt.value, stereo, (tex, isSt) => createSphere(tex, isSt));
              currentButtonIndex = i;
            } else if (i === 5) {
              actionText = 'mídia anterior';
              sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
              const opt = sel.options[sel.selectedIndex];
              const name = opt.dataset.name;
              const stereo = isStereoName(name);
              showLoading(name);
              loadTexture(opt.value, stereo, (tex, isSt) => createSphere(tex, isSt));
              currentButtonIndex = i;
            }

            showButtonHUD(`${buttonName} → ${actionText}`);
            break;
          }
        }

        if (nowPressed[1] && !prevButtons[1]) {
          const opt = sel.options[sel.selectedIndex];
          const name = opt.dataset.name;
          showLoading(name);
        } else if (!nowPressed[1] && prevButtons[1]) {
          hideLoading();
        }

        if (currentButtonIndex !== null && !nowPressed[currentButtonIndex]) {
          hideLoading();
          currentButtonIndex = null;
        }

        if (!anyNewPress) {
          const stillPressed = nowPressed.some(p => p);
          if (!stillPressed) {
            hideButtonHUD();
          }
        }

        prevButtons = nowPressed;

      } else if (src.hand) {
        const hand = src.hand;
        const handedness = src.handedness;

        const thumb = hand.get("thumb-tip");
        const index = hand.get("index-finger-tip");

        if (thumb && index) {
          const thumbPose = frame.getJointPose(thumb, referenceSpace);
          const indexPose = frame.getJointPose(index, referenceSpace);

          if (thumbPose && indexPose) {
            const dx = indexPose.transform.position.x - thumbPose.transform.position.x;
            const dy = indexPose.transform.position.y - thumbPose.transform.position.y;
            const dz = indexPose.transform.position.z - thumbPose.transform.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < 0.015 && (time - lastPinchTime[handedness]) > pinchCooldown) {
              lastPinchTime[handedness] = time;

              if (handedness === 'right') {
                sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
              } else {
                sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
              }

              const opt = sel.options[sel.selectedIndex];
              const name = opt.dataset.name;
              const stereo = isStereoName(name);
              showLoading(name);
              loadTexture(opt.value, stereo, (tex, isSt) => createSphere(tex, isSt));

              showButtonHUD(`🤏 Pinça (${handedness})`);
            }
          }
        }
      }
    });
  } else {
    prevButtons = [];
    hideButtonHUD();
    hideLoading();
    currentButtonIndex = null;
  }

  renderer.render(scene, camera);
});
