export class RightClickEditorMenu {
  constructor({ context, draftStore, placementController }) {
    this.context = context;
    this.draftStore = draftStore;
    this.placementController = placementController;
    this.runtimeRoot = context.getRuntimeRoot?.();
    this.menu = null;

    this.onContextMenu = this.onContextMenu.bind(this);
    this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  mount() {
    this.runtimeRoot?.addEventListener("contextmenu", this.onContextMenu, { capture: true });
    document.addEventListener("pointerdown", this.onDocumentPointerDown, { capture: true });
    window.addEventListener("keydown", this.onKeyDown);
  }

  destroy() {
    this.runtimeRoot?.removeEventListener("contextmenu", this.onContextMenu, { capture: true });
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, { capture: true });
    window.removeEventListener("keydown", this.onKeyDown);
    this.close();
  }

  onContextMenu(event) {
    const hotspotElement = event.target.closest?.("[data-editor-item-type='hotspot']");
    if (!hotspotElement || !this.runtimeRoot?.contains(hotspotElement)) {
      this.close();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sceneId = this.context.store.getSnapshot().currentSceneId;
    const hotspotId = hotspotElement.dataset.hotspotId;
    if (!this.draftStore.selectHotspot(sceneId, hotspotId)) {
      this.context.setStatus?.("Nao consegui selecionar esse hotspot.", { hideAfterMs: 1600 });
      return;
    }

    this.context.debugLog?.("editor:right-click-menu:open", { sceneId, hotspotId });
    this.open(event, { sceneId, hotspotId });
  }

  open(event, { sceneId, hotspotId }) {
    this.close();
    const hotspot = this.getHotspotSnapshot(sceneId, hotspotId);
    if (!hotspot) {
      this.context.setStatus?.("Nao consegui carregar os dados desse hotspot.", { hideAfterMs: 1600 });
      return;
    }

    this.menu = document.createElement("div");
    this.menu.className = "editor-context-menu";
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", "Menu rapido do hotspot");

    const title = document.createElement("p");
    title.className = "editor-context-menu__title";
    title.textContent = `Hotspot: ${hotspotId}`;
    title.title = "Menu com acoes rapidas para o hotspot selecionado.";

    const quickSection = this.createSectionTitle(
      "Edicao rapida",
      "Ajustes imediatos para o hotspot selecionado."
    );

    const hotspotScaleField = this.createSpinboxField({
      label: "Escala do hotspot",
      tooltip: "Aumenta ou reduz a escala do marcador em passos de 0.1.",
      value: hotspot.scale,
      step: 0.1,
      min: 0.1,
      onChange: (value) => this.draftStore.updateHotspotField("scale", value)
    });

    const referenceDepthField = this.createSpinboxField({
      label: "Profundidade",
      tooltip: "Ajusta a profundidade de referencia do hotspot em passos de 0.1.",
      value: hotspot.reference_depth,
      step: 0.1,
      min: 0.1,
      onChange: (value) => this.draftStore.updateHotspotField("reference_depth", value)
    });

    const labelScaleField = this.createSpinboxField({
      label: "Escala da label",
      tooltip: "Ajusta a escala do texto associado ao hotspot em passos de 0.1.",
      value: hotspot.label?.scale,
      step: 0.1,
      min: 0.1,
      onChange: (value) => this.draftStore.updateHotspotLabelField("scale", value)
    });

    const markerVisibleField = this.createCheckboxField({
      label: "Exibir marcador",
      tooltip: "Mostra ou oculta o marcador visual do hotspot.",
      checked: hotspot.marker_visible !== false,
      onChange: (checked) => this.draftStore.updateHotspotField("marker_visible", checked)
    });

    const billboardField = this.createCheckboxField({
      label: "Billboard do hotspot",
      tooltip: "Mantem o hotspot sempre voltado para a camera.",
      checked: hotspot.billboard !== false,
      onChange: (checked) => this.draftStore.updateHotspotField("billboard", checked)
    });

    const labelVisibleField = this.createCheckboxField({
      label: "Exibir label",
      tooltip: "Ativa ou desativa o texto do hotspot diretamente pelo menu rapido.",
      checked: hotspot.label?.visible !== false,
      onChange: (checked) => this.draftStore.updateHotspotLabelField("visible", checked)
    });

    const labelBillboardField = this.createCheckboxField({
      label: "Billboard da label",
      tooltip: "Mantem a label sempre voltada para a camera.",
      checked: hotspot.label?.billboard !== false,
      onChange: (checked) => this.draftStore.updateHotspotLabelField("billboard", checked)
    });

    const content = document.createElement("div");
    content.className = "editor-context-menu__content";
    content.append(
      quickSection,
      hotspotScaleField,
      referenceDepthField,
      labelScaleField,
      markerVisibleField,
      billboardField,
      labelVisibleField,
      labelBillboardField
    );

    if (hotspot.type === "scene_link") {
      content.append(
        this.createCheckboxField({
          label: "Aplicar yaw de entrada",
          tooltip: "Usa o yaw definido no hotspot ao entrar na cena de destino.",
          checked: hotspot.apply_hotspot_scene_yaw === true,
          onChange: (checked) => this.draftStore.updateHotspotField("apply_hotspot_scene_yaw", checked)
        }),
        this.createSpinboxField({
          label: "Yaw de entrada",
          tooltip: "Define o yaw de entrada usado quando a opcao acima estiver ativa.",
          value: hotspot.hotspot_define_scene_yaw,
          step: 1,
          onChange: (value) => this.draftStore.updateHotspotField("hotspot_define_scene_yaw", value)
        })
      );
    }

    const actionSection = this.createSectionTitle(
      "Acoes",
      "Acoes de fluxo para reposicionar, selecionar ou remover o hotspot."
    );

    const moveButton = this.createButton(
      "Reposicionar hotspot no panorama",
      "Ativa o modo de clique para escolher uma nova posicao para o hotspot no panorama atual.",
      () => {
      this.close();
      this.placementController.startHotspotPlacement({ sceneId, hotspotId });
      }
    );

    const selectButton = this.createButton(
      "Selecionar hotspot no editor",
      "Mantem este hotspot como item ativo no painel principal do editor.",
      () => {
      this.close();
      this.context.setStatus?.("Hotspot selecionado no editor.", { hideAfterMs: 1200 });
      }
    );

    const deleteButton = this.createButton(
      "Excluir hotspot da cena",
      "Remove o hotspot selecionado da cena atual no draft.",
      () => {
      this.close();
      this.draftStore.deleteHotspot();
      this.context.debugLog?.("editor:right-click-menu:delete-hotspot", { sceneId, hotspotId });
      this.context.setStatus?.("Hotspot removido.", { hideAfterMs: 1200 });
      }
    );

    const actionGroup = document.createElement("div");
    actionGroup.className = "editor-context-menu__actions";
    actionGroup.append(moveButton, selectButton, deleteButton);

    this.menu.append(title, content, actionSection, actionGroup);
    document.body.append(this.menu);
    this.positionMenu(event.clientX, event.clientY);
  }

  createButton(label, tooltip, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.title = tooltip || label;
    button.setAttribute("aria-label", tooltip ? `${label}. ${tooltip}` : label);
    button.addEventListener("click", handler);
    return button;
  }

  createSectionTitle(label, tooltip) {
    const title = document.createElement("p");
    title.className = "editor-context-menu__section-title";
    title.textContent = label;
    title.title = tooltip || label;
    return title;
  }

  createCheckboxField({ label, tooltip, checked, onChange }) {
    const wrapper = document.createElement("label");
    wrapper.className = "editor-context-menu__checkbox";
    wrapper.title = tooltip || label;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked === true;
    input.setAttribute("aria-label", tooltip ? `${label}. ${tooltip}` : label);
    input.addEventListener("change", () => {
      onChange?.(input.checked);
    });

    const text = document.createElement("span");
    text.textContent = label;

    wrapper.append(input, text);
    return wrapper;
  }

  createSpinboxField({ label, tooltip, value, step = 0.1, min = null, onChange }) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-context-menu__field";

    const labelElement = document.createElement("label");
    labelElement.className = "editor-context-menu__field-label";
    labelElement.textContent = label;
    labelElement.title = tooltip || label;

    const controls = document.createElement("div");
    controls.className = "editor-context-menu__spinbox";

    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    if (min != null) {
      input.min = String(min);
    }
    input.value = this.formatNumber(value, step);
    input.title = tooltip || label;
    input.setAttribute("aria-label", tooltip ? `${label}. ${tooltip}` : label);

    const commit = (nextValue) => {
      const normalized = this.normalizeSpinboxValue(nextValue, {
        fallback: value,
        step,
        min
      });
      input.value = this.formatNumber(normalized, step);
      onChange?.(normalized);
    };

    const createStepButton = (direction, ariaLabel) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-context-menu__step-button";
      button.textContent = direction < 0 ? "−" : "+";
      button.title = ariaLabel;
      button.setAttribute("aria-label", ariaLabel);
      button.addEventListener("click", () => {
        const baseValue = this.normalizeSpinboxValue(input.value, {
          fallback: value,
          step,
          min
        });
        commit(baseValue + (direction * step));
      });
      return button;
    };

    input.addEventListener("change", () => commit(input.value));
    input.addEventListener("blur", () => {
      input.value = this.formatNumber(
        this.normalizeSpinboxValue(input.value, { fallback: value, step, min }),
        step
      );
    });

    controls.append(
      createStepButton(-1, `${label}: reduzir em ${step}`),
      input,
      createStepButton(1, `${label}: aumentar em ${step}`)
    );

    wrapper.append(labelElement, controls);
    return wrapper;
  }

  getHotspotSnapshot(sceneId, hotspotId) {
    const snapshot = this.draftStore.getSnapshot();
    const scene = snapshot?.draft?.scenes?.find((candidate) => candidate.id === sceneId) ?? null;
    return scene?.hotspots?.find((candidate) => candidate.id === hotspotId) ?? null;
  }

  normalizeSpinboxValue(value, { fallback = 0, step = 0.1, min = null } = {}) {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) ? parsed : Number(fallback ?? 0);
    const clampedValue = min == null ? safeValue : Math.max(min, safeValue);
    const decimals = this.countStepDecimals(step);
    const rounded = Number(clampedValue.toFixed(decimals));
    return Number.isFinite(rounded) ? rounded : Number(fallback ?? 0);
  }

  formatNumber(value, step = 0.1) {
    const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    const decimals = this.countStepDecimals(step);
    return safeValue.toFixed(decimals);
  }

  countStepDecimals(step) {
    const stepText = String(step ?? "");
    const decimalPart = stepText.includes(".") ? stepText.split(".")[1] : "";
    return decimalPart.length;
  }

  positionMenu(clientX, clientY) {
    const margin = 12;
    const rect = this.menu.getBoundingClientRect();
    const x = Math.min(clientX, window.innerWidth - rect.width - margin);
    const y = Math.min(clientY, window.innerHeight - rect.height - margin);
    this.menu.style.left = `${Math.max(margin, x)}px`;
    this.menu.style.top = `${Math.max(margin, y)}px`;
  }

  onDocumentPointerDown(event) {
    if (this.menu && !this.menu.contains(event.target)) {
      this.close();
    }
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      this.close();
    }
  }

  close() {
    this.menu?.remove();
    this.menu = null;
  }
}
