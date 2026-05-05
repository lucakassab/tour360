export class RightClickEditorMenu {
  constructor({ context, draftStore, placementController }) {
    this.context = context;
    this.draftStore = draftStore;
    this.placementController = placementController;
    this.runtimeRoot = context.getRuntimeRoot?.();
    this.menu = null;
    this.iconLibraryFolderPath = getStoredIconLibraryFolderPath();
    this.iconLibraryEntries = [];
    this.iconLibraryRequestToken = 0;

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
    if (!this.runtimeRoot?.contains(event.target)) {
      this.close();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sceneId = this.context.store.getSnapshot().currentSceneId;
    const hotspotElement = event.target.closest?.("[data-editor-item-type='hotspot']");
    const hotspotId = hotspotElement?.dataset?.hotspotId ?? null;

    if (!hotspotId) {
      this.context.debugLog?.("editor:right-click-menu:open-panorama", { sceneId });
      this.openPanoramaMenu(event, { sceneId });
      return;
    }

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

    const titleRow = document.createElement("div");
    titleRow.className = "editor-context-menu__title-row";

    const title = document.createElement("p");
    title.className = "editor-context-menu__title";
    title.textContent = `Hotspot: ${hotspotId}`;
    title.title = "Menu com acoes rapidas para o hotspot selecionado.";

    const typePill = document.createElement("span");
    typePill.className = "editor-context-menu__pill";
    typePill.textContent = hotspot.type === "scene_link" ? "Link de cena" : "Anotacao";
    typePill.title = hotspot.type === "scene_link"
      ? "Hotspot que navega para outra cena."
      : "Hotspot de anotacao.";

    titleRow.append(title, typePill);

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

    const positionField = this.createTripleNumberField({
      label: "Posicao",
      tooltip: "Ajusta rapidamente a posicao do hotspot nos eixos X, Y e Z.",
      fields: [
        {
          axis: "X",
          value: hotspot.position?.x,
          step: 0.01,
          onChange: (value) => this.draftStore.updateHotspotField("position.x", value)
        },
        {
          axis: "Y",
          value: hotspot.position?.y,
          step: 0.01,
          onChange: (value) => this.draftStore.updateHotspotField("position.y", value)
        },
        {
          axis: "Z",
          value: hotspot.position?.z,
          step: 0.01,
          onChange: (value) => this.draftStore.updateHotspotField("position.z", value)
        }
      ]
    });

    const rotationField = this.createTripleNumberField({
      label: "Rotacao",
      tooltip: "Ajusta a rotacao do hotspot nos eixos X, Y e Z. Internamente mapeia X para pitch, Y para yaw e Z para roll.",
      fields: [
        {
          axis: "X",
          value: hotspot.rotation?.pitch,
          step: 1,
          onChange: (value) => this.draftStore.updateHotspotField("rotation.pitch", value)
        },
        {
          axis: "Y",
          value: hotspot.rotation?.yaw,
          step: 1,
          onChange: (value) => this.draftStore.updateHotspotField("rotation.yaw", value)
        },
        {
          axis: "Z",
          value: hotspot.rotation?.roll,
          step: 1,
          onChange: (value) => this.draftStore.updateHotspotField("rotation.roll", value)
        }
      ]
    });

    const markerVisibleField = this.createCheckboxField({
      label: "Exibir marcador",
      tooltip: "Mostra ou oculta o marcador visual do hotspot.",
      checked: hotspot.marker_visible !== false,
      onChange: (checked) => this.draftStore.updateHotspotField("marker_visible", checked)
    });

    const markerBackgroundVisibleField = this.createCheckboxField({
      label: "Fundo automatico",
      tooltip: "Ativa ou desativa o fundo amarelo automatico do hotspot.",
      checked: hotspot.marker_background_visible !== false,
      onChange: (checked) => this.draftStore.updateHotspotField("marker_background_visible", checked)
    });

    const billboardField = this.createCheckboxField({
      label: "Billboard do hotspot",
      tooltip: "Mantem o hotspot sempre voltado para a camera.",
      checked: hotspot.billboard !== false,
      onChange: (checked) => this.draftStore.updateHotspotField("billboard", checked)
    });

    const billboardRotationOffsetField = this.createCheckboxField({
      label: "Usar rotacao como offset do billboard",
      tooltip: "Mantem o billboard ativo, mas usa yaw, pitch e roll do hotspot como offset da orientacao final.",
      checked: hotspot.billboard_rotation_offset === true,
      onChange: (checked) => this.draftStore.updateHotspotField("billboard_rotation_offset", checked)
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

    const iconDropdownField = this.createIconDropdownField({
      label: "Icone da biblioteca",
      tooltip: "Troca rapidamente o icone do hotspot usando a pasta configurada na biblioteca do editor.",
      value: hotspot.marker_icon?.src ?? "",
      onChange: (value) => {
        const normalizedValue = normalizeOptionalAssetPath(value);
        this.draftStore.updateHotspotField("marker_icon.src", normalizedValue);
        this.context.setStatus?.(
          normalizedValue ? "Icone do hotspot atualizado." : "Icone do hotspot removido.",
          { hideAfterMs: 1400 }
        );
      }
    });

    const content = document.createElement("div");
    content.className = "editor-context-menu__content";

    const transformCard = this.createCard({
      title: "Transformacao",
      tooltip: "Ajustes espaciais do hotspot selecionado.",
      children: [
        positionField,
        rotationField,
        this.createGrid("editor-context-menu__field-grid", [
          hotspotScaleField,
          referenceDepthField,
          labelScaleField
        ])
      ]
    });

    const appearanceCard = this.createCard({
      title: "Aparencia",
      tooltip: "Visibilidade e comportamento visual do hotspot e da label.",
      children: [
        iconDropdownField.wrapper,
        this.createGrid("editor-context-menu__toggle-grid", [
          markerVisibleField,
          markerBackgroundVisibleField,
          billboardField,
          billboardRotationOffsetField,
          labelVisibleField,
          labelBillboardField
        ])
      ]
    });

    content.append(transformCard, appearanceCard);

    if (hotspot.type === "scene_link") {
      const applyYawField = this.createCheckboxField({
          label: "Aplicar yaw de entrada",
          tooltip: "Usa o yaw definido no hotspot ao entrar na cena de destino.",
          checked: hotspot.apply_hotspot_scene_yaw === true,
          onChange: (checked) => this.draftStore.updateHotspotField("apply_hotspot_scene_yaw", checked)
        });
      const entryYawField = this.createSpinboxField({
          label: "Yaw de entrada",
          tooltip: "Define o yaw de entrada usado quando a opcao acima estiver ativa.",
          value: hotspot.hotspot_define_scene_yaw,
          step: 1,
          onChange: (value) => this.draftStore.updateHotspotField("hotspot_define_scene_yaw", value)
        });

      content.append(this.createCard({
        title: "Destino",
        tooltip: "Ajustes especificos para hotspots que navegam entre cenas.",
        children: [
          applyYawField,
          entryYawField
        ]
      }));
    }

    const copyButton = this.createButton(
      "Copiar hotspot",
      "Copia a configuracao completa do hotspot atual para colar em outro ponto do mesmo tour.",
      () => {
        this.close();
        const copied = this.draftStore.copySelectedHotspot();
        if (!copied) {
          this.context.setStatus?.("Nao consegui copiar esse hotspot.", { hideAfterMs: 1600 });
          return;
        }
        this.context.debugLog?.("editor:right-click-menu:copy-hotspot", copied);
        this.context.setStatus?.("Hotspot copiado.", { hideAfterMs: 1200 });
      }
    );

    const pasteButton = this.createButton(
      "Colar hotspot",
      "Duplica o hotspot copiado na cena atual, preservando suas configuracoes.",
      () => {
        this.close();
        const result = this.draftStore.pasteHotspotCopy();
        if (!result?.ok) {
          this.context.setStatus?.(this.getPasteErrorMessage(result?.reason), { hideAfterMs: 1800 });
          return;
        }
        this.context.debugLog?.("editor:right-click-menu:paste-hotspot", result);
        this.context.setStatus?.(`Hotspot colado: ${result.id}`, { hideAfterMs: 1600 });
      }
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
    deleteButton.classList.add("editor-context-menu__button--danger");

    const actionGroup = document.createElement("div");
    actionGroup.className = "editor-context-menu__actions-grid";
    actionGroup.append(copyButton, pasteButton, moveButton, selectButton, deleteButton);

    const actionsCard = this.createCard({
      title: "Acoes",
      tooltip: "Comandos rapidos de edicao para o hotspot selecionado.",
      children: [actionGroup]
    });

    this.menu.append(titleRow, content, actionsCard);
    document.body.append(this.menu);
    this.positionMenu(event.clientX, event.clientY);
    this.populateIconLibraryDropdown(iconDropdownField, hotspot.marker_icon?.src ?? null).catch((error) => {
      this.setIconDropdownStatus(iconDropdownField, {
        text: "Erro ao carregar biblioteca",
        iconSrc: hotspot.marker_icon?.src ?? null,
        disabled: false,
        error: true
      });
      this.context.setStatus?.(error?.message || "Nao foi possivel carregar a biblioteca de icones.", {
        hideAfterMs: 2200
      });
      this.context.debugLog?.("editor:right-click-menu:icon-library:error", {
        error: error?.message || String(error)
      });
    });
  }

  openPanoramaMenu(event, { sceneId }) {
    this.close();

    const clipboard = this.draftStore.getHotspotClipboardSnapshot();
    const clickWorldPosition = this.getWorldPositionFromClientPoint(
      event.clientX,
      event.clientY,
      clipboard?.referenceDepth
    );

    this.menu = document.createElement("div");
    this.menu.className = "editor-context-menu";
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", "Menu rapido do panorama");

    const titleRow = document.createElement("div");
    titleRow.className = "editor-context-menu__title-row";

    const title = document.createElement("p");
    title.className = "editor-context-menu__title";
    title.textContent = "Panorama";
    title.title = "Menu rapido para colar hotspots no panorama.";

    const typePill = document.createElement("span");
    typePill.className = "editor-context-menu__pill";
    typePill.textContent = "Panorama";
    typePill.title = "Clique no panorama para colar um hotspot copiado nessa posicao.";

    titleRow.append(title, typePill);

    const content = document.createElement("div");
    content.className = "editor-context-menu__content";
    content.append(this.createCard({
      title: "Colagem rapida",
      tooltip: "Use este menu para colar o hotspot copiado exatamente na posicao clicada do panorama.",
      children: [
        this.createHelpText(
          clickWorldPosition
            ? "O hotspot sera colado na posicao clicada do panorama."
            : "Nao foi possivel calcular a posicao 3D desse clique. O hotspot ainda pode ser colado usando a referencia original."
        ),
        this.createHelpText(
          clipboard
            ? `Hotspot copiado: ${clipboard.hotspotId}`
            : "Nenhum hotspot copiado no momento."
        )
      ]
    }));

    const pasteHereButton = this.createButton(
      "Colar hotspot aqui",
      "Duplica o hotspot copiado e tenta colocá-lo exatamente na posicao clicada do panorama.",
      () => {
        this.close();
        const currentClipboard = this.draftStore.getHotspotClipboardSnapshot();
        const result = this.draftStore.pasteHotspotCopy({
          sceneId,
          position: clickWorldPosition,
          referenceDepth: currentClipboard?.referenceDepth
        });
        if (!result?.ok) {
          this.context.setStatus?.(this.getPasteErrorMessage(result?.reason), { hideAfterMs: 1800 });
          return;
        }

        this.context.debugLog?.("editor:right-click-menu:paste-hotspot-panorama", {
          ...result,
          sceneId,
          clickWorldPosition
        });
        this.context.setStatus?.(`Hotspot colado: ${result.id}`, { hideAfterMs: 1600 });
      }
      );

      const addSceneLinkButton = this.createButton(
        "Adicionar hotspot aqui",
        "Cria um hotspot de navegacao exatamente na posicao clicada do panorama.",
        () => {
          this.close();
          if (!clickWorldPosition) {
            this.context.setStatus?.("Nao consegui calcular a posicao 3D desse clique.", { hideAfterMs: 1800 });
            return;
          }

          const createdHotspotId = this.draftStore.addHotspot("scene_link", {
            sceneId,
            position: clickWorldPosition,
            referenceDepth: clickWorldPosition.depth
          });
          if (!createdHotspotId) {
            this.context.setStatus?.("Nao consegui criar o hotspot nesta cena.", { hideAfterMs: 1800 });
            return;
          }

          this.context.debugLog?.("editor:right-click-menu:add-hotspot-panorama", {
            sceneId,
            hotspotId: createdHotspotId,
            clickWorldPosition,
            type: "scene_link"
          });
          this.context.setStatus?.(`Hotspot criado: ${createdHotspotId}`, { hideAfterMs: 1600 });
        }
      );

      const addAnnotationButton = this.createButton(
        "Adicionar hotspot de anotacao aqui",
        "Cria um hotspot de anotacao exatamente na posicao clicada do panorama.",
        () => {
          this.close();
          if (!clickWorldPosition) {
            this.context.setStatus?.("Nao consegui calcular a posicao 3D desse clique.", { hideAfterMs: 1800 });
            return;
          }

          const createdHotspotId = this.draftStore.addHotspot("annotation", {
            sceneId,
            position: clickWorldPosition,
            referenceDepth: clickWorldPosition.depth
          });
          if (!createdHotspotId) {
            this.context.setStatus?.("Nao consegui criar o hotspot de anotacao nesta cena.", { hideAfterMs: 1800 });
            return;
          }

          this.context.debugLog?.("editor:right-click-menu:add-annotation-panorama", {
            sceneId,
            hotspotId: createdHotspotId,
            clickWorldPosition,
            type: "annotation"
          });
          this.context.setStatus?.(`Anotacao criada: ${createdHotspotId}`, { hideAfterMs: 1600 });
        }
      );

      addSceneLinkButton.disabled = !clickWorldPosition;
      addAnnotationButton.disabled = !clickWorldPosition;

      const actionGroup = document.createElement("div");
      actionGroup.className = "editor-context-menu__actions-grid";
      actionGroup.append(pasteHereButton, addSceneLinkButton, addAnnotationButton);

    const actionsCard = this.createCard({
      title: "Acoes",
      tooltip: "Comandos disponiveis para o clique no panorama.",
      children: [actionGroup]
    });

    this.menu.append(titleRow, content, actionsCard);
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

  createCard({ title, tooltip, children = [] }) {
    const card = document.createElement("section");
    card.className = "editor-context-menu__card";

    const heading = this.createSectionTitle(title, tooltip);
    card.append(heading);

    for (const child of children) {
      if (child) {
        card.append(child);
      }
    }

    return card;
  }

  createGrid(className, children = []) {
    const grid = document.createElement("div");
    grid.className = className;
    for (const child of children) {
      if (child) {
        grid.append(child);
      }
    }
    return grid;
  }

  createHelpText(text) {
    const element = document.createElement("p");
    element.className = "editor-context-menu__help-text";
    element.textContent = text;
    element.title = text;
    return element;
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

  createSelectField({ label, tooltip, options = [], value = "", onChange }) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-context-menu__field";

    const labelElement = document.createElement("label");
    labelElement.className = "editor-context-menu__field-label";
    labelElement.textContent = label;
    labelElement.title = tooltip || label;

    const input = document.createElement("select");
    input.title = tooltip || label;
    input.setAttribute("aria-label", tooltip ? `${label}. ${tooltip}` : label);
    this.setSelectOptions(input, options, value);
    input.addEventListener("change", () => {
      onChange?.(input.value);
    });

    wrapper.append(labelElement, input);
    return { wrapper, input };
  }

  createIconDropdownField({ label, tooltip, value = "", onChange }) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-context-menu__field";

    const labelElement = document.createElement("label");
    labelElement.className = "editor-context-menu__field-label";
    labelElement.textContent = label;
    labelElement.title = tooltip || label;

    const dropdown = document.createElement("div");
    dropdown.className = "editor-context-menu__icon-dropdown";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "editor-context-menu__icon-trigger";
    trigger.title = tooltip || label;
    trigger.setAttribute("aria-label", tooltip ? `${label}. ${tooltip}` : label);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const preview = document.createElement("span");
    preview.className = "editor-context-menu__icon-trigger-preview";

    const text = document.createElement("span");
    text.className = "editor-context-menu__icon-trigger-text";

    const chevron = document.createElement("span");
    chevron.className = "editor-context-menu__icon-trigger-chevron";
    chevron.textContent = "▾";
    chevron.setAttribute("aria-hidden", "true");

    trigger.append(preview, text, chevron);

    const panel = document.createElement("div");
    panel.className = "editor-context-menu__icon-panel";
    panel.setAttribute("role", "listbox");
    panel.hidden = true;

    trigger.addEventListener("click", () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      dropdown.classList.toggle("is-open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    dropdown.append(trigger, panel);
    wrapper.append(labelElement, dropdown);

    const field = {
      wrapper,
      dropdown,
      trigger,
      preview,
      text,
      panel,
      currentValue: normalizeOptionalAssetPath(value),
      onChange
    };

    this.setIconDropdownStatus(field, {
      text: "Carregando icones...",
      iconSrc: field.currentValue,
      disabled: true
    });

    return field;
  }

  createTripleNumberField({ label, tooltip, fields = [] }) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-context-menu__field";

    const labelElement = document.createElement("label");
    labelElement.className = "editor-context-menu__field-label";
    labelElement.textContent = label;
    labelElement.title = tooltip || label;

    const controls = document.createElement("div");
    controls.className = "editor-context-menu__triplet";
    controls.title = tooltip || label;

    for (const field of fields) {
      const group = document.createElement("label");
      group.className = "editor-context-menu__triplet-group";
      group.title = tooltip || label;

      const axis = document.createElement("span");
      axis.className = "editor-context-menu__triplet-axis";
      axis.textContent = field.axis;

      const input = document.createElement("input");
      input.type = "number";
      const step = field.step ?? 0.1;
      const min = field.min ?? null;
      input.step = String(step);
      if (min != null) {
        input.min = String(min);
      }
      input.value = this.formatNumber(field.value, step);
      input.setAttribute("aria-label", tooltip ? `${label} ${field.axis}. ${tooltip}` : `${label} ${field.axis}`);
      input.addEventListener("change", () => {
        const normalized = this.normalizeSpinboxValue(input.value, {
          fallback: field.value,
          step,
          min
        });
        input.value = this.formatNumber(normalized, step);
        field.onChange?.(normalized);
      });
      input.addEventListener("blur", () => {
        input.value = this.formatNumber(
          this.normalizeSpinboxValue(input.value, {
            fallback: field.value,
            step,
            min
          }),
          step
        );
      });

      group.append(axis, input);
      controls.append(group);
    }

    wrapper.append(labelElement, controls);
    return wrapper;
  }

  setSelectOptions(select, options = [], selectedValue = "") {
    if (!select) {
      return;
    }

    select.replaceChildren(
      ...options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value ?? "";
        option.textContent = label ?? String(value ?? "");
        return option;
      })
    );

    select.value = options.some(([value]) => (value ?? "") === (selectedValue ?? ""))
      ? (selectedValue ?? "")
      : (options[0]?.[0] ?? "");
  }

  setIconDropdownStatus(field, {
    text = "Selecionar icone",
    iconSrc = null,
    disabled = false,
    error = false
  } = {}) {
    if (!field) {
      return;
    }

    field.trigger.disabled = disabled === true;
    field.dropdown.classList.toggle("has-error", error === true);
    field.currentValue = normalizeOptionalAssetPath(iconSrc);
    field.preview.replaceChildren();

    const normalizedIconSrc = normalizeOptionalAssetPath(iconSrc);
    if (normalizedIconSrc) {
      const image = document.createElement("img");
      image.className = "editor-context-menu__icon-trigger-image";
      image.src = normalizedIconSrc;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        if (!field.preview.isConnected) {
          return;
        }
        field.preview.replaceChildren(this.createIconDropdownGlyph());
      }, { once: true });
      field.preview.append(image);
    } else {
      field.preview.append(this.createIconDropdownGlyph());
    }

    field.text.textContent = text;
  }

  createIconDropdownGlyph() {
    const glyph = document.createElement("span");
    glyph.className = "editor-context-menu__icon-trigger-glyph";
    glyph.textContent = "•";
    return glyph;
  }

  createIconDropdownOption({
    value,
    label,
    imageSrc = null,
    selected = false,
    onSelect
  }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-context-menu__icon-option";
    button.classList.toggle("is-selected", selected);
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.title = label;

    const preview = document.createElement("span");
    preview.className = "editor-context-menu__icon-option-preview";

    const normalizedImageSrc = normalizeOptionalAssetPath(imageSrc);
    if (normalizedImageSrc) {
      const image = document.createElement("img");
      image.className = "editor-context-menu__icon-option-image";
      image.src = normalizedImageSrc;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        if (!preview.isConnected) {
          return;
        }
        preview.replaceChildren(this.createIconDropdownGlyph());
      }, { once: true });
      preview.append(image);
    } else {
      preview.append(this.createIconDropdownGlyph());
    }

    const text = document.createElement("span");
    text.className = "editor-context-menu__icon-option-label";
    text.textContent = label;

    button.append(preview, text);
    button.addEventListener("click", () => onSelect?.(value));
    return button;
  }

  async populateIconLibraryDropdown(field, currentValue) {
    if (!field) {
      return;
    }

    const folderPath = getStoredIconLibraryFolderPath();
    const requestToken = ++this.iconLibraryRequestToken;
    this.iconLibraryFolderPath = folderPath;
    this.setIconDropdownStatus(field, {
      text: "Carregando icones...",
      iconSrc: currentValue,
      disabled: true
    });
    field.panel.replaceChildren(this.createHelpText("Lendo a pasta configurada..."));

    const response = await fetch("./__list_assets__", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ folderPath })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.error || "Nao foi possivel listar a pasta da biblioteca.");
    }

    if (requestToken !== this.iconLibraryRequestToken || this.menu == null || !document.body.contains(this.menu)) {
      return;
    }

    this.iconLibraryEntries = Array.isArray(payload?.items) ? payload.items : [];
    const normalizedCurrent = normalizeOptionalAssetPath(currentValue);
    const options = [{
      value: "",
      label: "Sem icone",
      imageSrc: null
    }];
    const knownPaths = new Set();

    for (const entry of this.iconLibraryEntries) {
      const normalizedPath = normalizeOptionalAssetPath(entry?.path);
      if (!normalizedPath || knownPaths.has(normalizedPath)) {
        continue;
      }
      knownPaths.add(normalizedPath);
      options.push({
        value: normalizedPath,
        label: entry?.name || normalizedPath,
        imageSrc: normalizedPath
      });
    }

    if (normalizedCurrent && !knownPaths.has(normalizedCurrent)) {
      options.splice(1, 0, {
        value: normalizedCurrent,
        label: `${getAssetDisplayName(normalizedCurrent)} (atual)`,
        imageSrc: normalizedCurrent
      });
    }

    const hasOptions = options.length > 1;
    field.panel.replaceChildren(
      ...options.map((option) => this.createIconDropdownOption({
        value: option.value,
        label: option.label,
        imageSrc: option.imageSrc ?? null,
        selected: (option.value ?? "") === (normalizedCurrent ?? ""),
        onSelect: (value) => {
          const normalizedValue = normalizeOptionalAssetPath(value);
          field.currentValue = normalizedValue;
          field.panel.hidden = true;
          field.dropdown.classList.remove("is-open");
          field.trigger.setAttribute("aria-expanded", "false");
          this.setIconDropdownStatus(field, {
            text: normalizedValue ? getAssetDisplayName(normalizedValue) : "Sem icone",
            iconSrc: normalizedValue,
            disabled: false
          });
          field.onChange?.(value ?? "");
        }
      }))
    );

    if (!hasOptions) {
      field.panel.replaceChildren(
        this.createHelpText("Nenhum icone encontrado na pasta configurada."),
        this.createIconDropdownOption({
          value: "",
          label: "Sem icone",
          selected: normalizedCurrent == null,
          onSelect: (value) => {
            field.currentValue = null;
            field.panel.hidden = true;
            field.dropdown.classList.remove("is-open");
            field.trigger.setAttribute("aria-expanded", "false");
            this.setIconDropdownStatus(field, {
              text: "Sem icone",
              iconSrc: null,
              disabled: false
            });
            field.onChange?.(value);
          }
        })
      );
    }

    this.setIconDropdownStatus(field, {
      text: normalizedCurrent ? getAssetDisplayName(normalizedCurrent) : "Sem icone",
      iconSrc: normalizedCurrent,
      disabled: false
    });
  }

  getHotspotSnapshot(sceneId, hotspotId) {
    const snapshot = this.draftStore.getSnapshot();
    const scene = snapshot?.draft?.scenes?.find((candidate) => candidate.id === sceneId) ?? null;
    return scene?.hotspots?.find((candidate) => candidate.id === hotspotId) ?? null;
  }

  getWorldPositionFromClientPoint(clientX, clientY, depthHint = null) {
    const safeDepth = Math.max(0.1, Number(depthHint) || 8);
    return this.context.screenToWorldFromEvent?.({ clientX, clientY }, { depth: safeDepth }) ?? null;
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

  getPasteErrorMessage(reason) {
    if (reason === "tour-mismatch") {
      return "O hotspot copiado pertence a outro tour.";
    }
    if (reason === "no-scene") {
      return "Nao consegui colar o hotspot nesta cena.";
    }
    return "Nenhum hotspot copiado para colar.";
  }

  positionMenu(clientX, clientY) {
    const margin = 12;
    const cursorOffset = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const totalUsableHeight = Math.max(0, viewportHeight - (margin * 2));
    const availableRight = Math.max(0, viewportWidth - clientX - margin - cursorOffset);
    const availableLeft = Math.max(0, clientX - margin - cursorOffset);
    const availableBelow = Math.max(0, viewportHeight - clientY - margin - cursorOffset);
    const availableAbove = Math.max(0, clientY - margin - cursorOffset);

    this.menu.style.maxHeight = `${totalUsableHeight}px`;
    const initialRect = this.menu.getBoundingClientRect();
    const naturalHeight = Math.min(this.menu.scrollHeight, totalUsableHeight);
    const naturalWidth = initialRect.width;

    const openAbove = naturalHeight > availableBelow && availableAbove > availableBelow;
    const openLeft = naturalWidth > availableRight && availableLeft > availableRight;

    const rect = this.menu.getBoundingClientRect();
    const maxLeft = Math.max(margin, viewportWidth - rect.width - margin);
    const maxTop = Math.max(margin, viewportHeight - rect.height - margin);
    const preferredRightLeft = clientX + cursorOffset;
    const preferredLeftLeft = clientX - rect.width - cursorOffset;
    const preferredBelowTop = clientY + cursorOffset;
    const preferredAboveTop = clientY - rect.height - cursorOffset;

    const x = openLeft
      ? Math.max(margin, preferredLeftLeft)
      : Math.min(Math.max(margin, preferredRightLeft), maxLeft);
    const y = openAbove
      ? Math.max(margin, preferredAboveTop)
      : Math.min(Math.max(margin, preferredBelowTop), maxTop);

    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
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

const ICON_LIBRARY_FOLDER_STORAGE_KEY = "wpa360.editor.iconLibraryFolder";
const DEFAULT_ICON_LIBRARY_FOLDER = "./assets/icons";

function normalizeOptionalAssetPath(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getStoredIconLibraryFolderPath() {
  try {
    return normalizeOptionalAssetPath(window.localStorage?.getItem?.(ICON_LIBRARY_FOLDER_STORAGE_KEY))
      || DEFAULT_ICON_LIBRARY_FOLDER;
  } catch {
    return DEFAULT_ICON_LIBRARY_FOLDER;
  }
}

function getAssetDisplayName(assetPath) {
  const normalizedPath = normalizeOptionalAssetPath(assetPath);
  if (!normalizedPath) {
    return "Icone";
  }

  const parts = normalizedPath.split(/[\\/]/);
  return parts[parts.length - 1] || normalizedPath;
}
