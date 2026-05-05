import { getHotspotMarkerIconSrc } from "../shared/HotspotVisualShared.js";

export class EditorPanel {
  constructor({ root, context, draftStore, placementController }) {
    this.root = root;
    this.context = context;
    this.draftStore = draftStore;
    this.placementController = placementController;
    this.unsubscribe = null;
    this.controls = {};
    this.transformClipboard = null;
    this.activeTabId = "tour";
    this.panelMinimized = false;
    this.tabButtons = new Map();
    this.tabPanels = new Map();
    this.iconLibraryEntries = [];
    this.iconLibraryFolderPath = getStoredIconLibraryFolderPath();
    this.iconLibraryLoading = false;
  }

  mount() {
    this.abortController = new AbortController();
    this.panel = document.createElement("aside");
    this.panel.className = "editor-panel";
    this.panel.setAttribute("aria-label", "Runtime tour editor");
    this.controls.panelToggle = this.createPanelToggleButton();

    const sections = [
      { id: "tour", label: "Tour", help: "Dados gerais do tour.", content: this.createTourSection() },
      { id: "scene", label: "Cena", help: "Configuracoes da cena selecionada.", content: this.createSceneSection() },
      { id: "hotspot", label: "Hotspot", help: "Configuracoes do hotspot selecionado.", content: this.createHotspotSection() },
      { id: "label", label: "Label", help: "Configuracoes da label vinculada ao hotspot.", content: this.createHotspotLabelSection() },
      { id: "json", label: "JSON", help: "Importacao e exportacao do JSON do tour.", content: this.createJsonSection() }
    ];

    this.tabBar = this.createTabBar(sections);
    this.tabContent = document.createElement("div");
    this.tabContent.className = "editor-panel__tab-panels";

    for (const section of sections) {
      const panel = document.createElement("div");
      panel.className = "editor-panel__tab-panel";
      panel.dataset.tabId = section.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-label", section.label);
      panel.append(section.content);
      this.tabPanels.set(section.id, panel);
      this.tabContent.append(panel);
    }

    this.panel.append(
      this.createHeader(),
      this.tabBar,
      this.tabContent
    );
    this.root.replaceChildren(this.panel, this.controls.panelToggle);
    this.selectTab(this.activeTabId);
    this.setPanelMinimized(this.panelMinimized);
    this.unsubscribe = this.draftStore.subscribe((state) => this.sync(state));
    this.setValue(this.controls.iconLibraryFolder.input, this.iconLibraryFolderPath);
    this.refreshIconLibrary().catch((error) => {
      this.context.setStatus(error?.message || "Nao foi possivel carregar a biblioteca de icones.", { hideAfterMs: 2200 });
    });
  }

  createHeader() {
    const header = document.createElement("header");
    header.className = "editor-panel__header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "editor-panel__title-group";

    const title = document.createElement("h2");
    title.textContent = "Editor do tour";
    title.title = "Painel principal para revisar e editar tours, cenas, hotspots e labels.";

    this.controls.status = document.createElement("span");
    this.controls.status.className = "editor-status";

    const headerActions = document.createElement("div");
    headerActions.className = "editor-panel__header-actions";

    this.controls.minimizeButton = document.createElement("button");
    this.controls.minimizeButton.type = "button";
    this.controls.minimizeButton.className = "editor-panel__minimize";
    this.controls.minimizeButton.textContent = "🛠";
    this.controls.minimizeButton.title = "Minimizar o Editor do tour para um botao flutuante.";
    this.controls.minimizeButton.setAttribute("aria-label", "Minimizar o Editor do tour");
    this.controls.minimizeButton.addEventListener("click", () => this.setPanelMinimized(true), { signal: this.abortController.signal });

    titleGroup.append(title, this.controls.status);
    headerActions.append(this.controls.minimizeButton);
    header.append(titleGroup, headerActions);
    return header;
  }

  createPanelToggleButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-panel-toggle";
    button.textContent = "🛠";
    button.title = "Abrir o Editor do tour.";
    button.setAttribute("aria-label", "Abrir o Editor do tour");
    button.hidden = true;
    button.addEventListener("click", () => this.setPanelMinimized(false), { signal: this.abortController.signal });
    return button;
  }

  createTabBar(sections) {
    const tabBar = document.createElement("div");
    tabBar.className = "editor-panel__tabbar";
    tabBar.setAttribute("role", "tablist");
    tabBar.setAttribute("aria-label", "Abas do editor");

    for (const section of sections) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-panel__tab";
      button.textContent = section.label;
      button.title = section.help || section.label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-label", section.help ? `${section.label}. ${section.help}` : section.label);
      button.addEventListener("click", () => this.selectTab(section.id), { signal: this.abortController.signal });
      this.tabButtons.set(section.id, button);
      tabBar.append(button);
    }

    return tabBar;
  }

  createTourSection() {
    const section = this.createSection("Dados do tour", "Informacoes gerais e transformacoes globais aplicadas ao tour inteiro.");
    this.controls.tourId = this.createInput(FIELD_META.tourId);
    this.controls.tourTitle = this.createInput(FIELD_META.tourTitle);
    this.controls.tourMediaType = this.createInput(FIELD_META.tourMediaType);
    this.controls.initialScene = this.createSelect(FIELD_META.initialScene);
    this.controls.tourYaw = this.createNumberInput(FIELD_META.tourYaw);
    this.controls.tourPitch = this.createNumberInput(FIELD_META.tourPitch);
    this.controls.tourRoll = this.createNumberInput(FIELD_META.tourRoll);
    this.controls.tourScale = this.createNumberInput(FIELD_META.tourScale, 0.1);
    this.controls.tourBillboard = this.createCheckbox(FIELD_META.tourBillboard);

    this.bindInput(this.controls.tourId.input, () => this.draftStore.updateTourField("id", this.controls.tourId.input.value), "change");
    this.bindInput(this.controls.tourTitle.input, () => this.draftStore.updateTourField("title", this.controls.tourTitle.input.value));
    this.bindInput(this.controls.tourMediaType.input, () => this.draftStore.updateTourField("media_type", this.controls.tourMediaType.input.value));
    this.bindInput(this.controls.initialScene.input, () => this.draftStore.updateTourField("initial_scene", this.controls.initialScene.input.value), "change");
    this.bindInput(this.controls.tourYaw.input, () => this.draftStore.updateTourSetting("rotation.yaw", readNumber(this.controls.tourYaw.input)));
    this.bindInput(this.controls.tourPitch.input, () => this.draftStore.updateTourSetting("rotation.pitch", readNumber(this.controls.tourPitch.input)));
    this.bindInput(this.controls.tourRoll.input, () => this.draftStore.updateTourSetting("rotation.roll", readNumber(this.controls.tourRoll.input)));
    this.bindInput(this.controls.tourScale.input, () => this.draftStore.updateTourSetting("scale", readNumber(this.controls.tourScale.input, 1)));
    this.bindInput(this.controls.tourBillboard.input, () => this.draftStore.updateTourSetting("billboard", this.controls.tourBillboard.input.checked), "change");

    section.append(
      this.controls.tourId.label,
      this.controls.tourTitle.label,
      this.controls.tourMediaType.label,
      this.controls.initialScene.label,
      this.createFieldGrid(
        this.controls.tourYaw.label,
        this.controls.tourPitch.label,
        this.controls.tourRoll.label,
        this.controls.tourScale.label
      ),
      this.controls.tourBillboard.label
    );
    return section;
  }

  createSceneSection() {
    const section = this.createSection("Cenas do tour", "Gerencie a estrutura das cenas e os dados de midia de cada panorama.");
    this.controls.sceneSelect = this.createSelect(FIELD_META.sceneSelect);
    this.controls.sceneId = this.createInput(FIELD_META.sceneId);
    this.controls.sceneTitle = this.createInput(FIELD_META.sceneTitle);
    this.controls.sceneMediaSrc = this.createAssetField(FIELD_META.sceneMediaSrc, {
      onOpenFolder: () => this.openAssetFolder(this.controls.sceneMediaSrc.input.value)
    });
    this.controls.sceneProjection = this.createInput(FIELD_META.sceneProjection);
    this.controls.sceneStereoLayout = this.createSelect(FIELD_META.sceneStereoLayout, [
      ["top-bottom", "Stereo top-bottom"],
      ["side-by-side", "Stereo side-by-side"],
      ["mono", "Mono"]
    ]);
    this.controls.sceneEyeOrder = this.createSelect(FIELD_META.sceneEyeOrder, [
      ["left-right", "Esquerdo / direito"],
      ["right-left", "Direito / esquerdo"]
    ]);
    this.controls.sceneMonoEye = this.createSelect(FIELD_META.sceneMonoEye, [
      ["left", "Esquerdo / parte superior"],
      ["right", "Direito / parte inferior"]
    ]);
    this.controls.sceneGlobalYaw = this.createCheckbox(FIELD_META.sceneGlobalYaw);
    this.controls.sceneFlipHorizontally = this.createCheckbox(FIELD_META.sceneFlipHorizontally);
    this.controls.sceneMinimap = this.createAssetField(FIELD_META.sceneMinimap, {
      onOpenFolder: () => this.openAssetFolder(this.controls.sceneMinimap.input.value)
    });
    this.controls.sceneYaw = this.createNumberInput(FIELD_META.sceneYaw);
    this.controls.scenePitch = this.createNumberInput(FIELD_META.scenePitch);
    this.controls.sceneRoll = this.createNumberInput(FIELD_META.sceneRoll);
    this.controls.sceneScale = this.createNumberInput(FIELD_META.sceneScale, 0.1);
    this.controls.sceneBillboard = this.createCheckbox(FIELD_META.sceneBillboard);

    const actions = this.createActions([
      {
        label: "Adicionar cena",
        help: "Cria uma nova cena vazia no draft do tour.",
        handler: () => this.draftStore.addScene()
      },
      {
        label: "Duplicar cena atual",
        help: "Cria uma copia da cena selecionada para acelerar a montagem de panoramas parecidos.",
        handler: () => this.draftStore.duplicateScene()
      },
      {
        label: "Remover cena atual",
        help: "Exclui a cena atualmente selecionada do draft.",
        handler: () => this.draftStore.deleteScene()
      }
    ]);

    this.bindInput(this.controls.sceneSelect.input, () => this.draftStore.setSelectedScene(this.controls.sceneSelect.input.value), "change");
    this.bindInput(this.controls.sceneId.input, () => this.draftStore.updateSceneField("id", this.controls.sceneId.input.value), "change");
    this.bindInput(this.controls.sceneTitle.input, () => this.draftStore.updateSceneField("title", this.controls.sceneTitle.input.value));
    this.bindInput(this.controls.sceneMediaSrc.input, () => this.draftStore.updateSceneField("media.src", this.controls.sceneMediaSrc.input.value));
    this.bindInput(this.controls.sceneProjection.input, () => this.draftStore.updateSceneField("media.projection", this.controls.sceneProjection.input.value));
    this.bindInput(this.controls.sceneStereoLayout.input, () => this.draftStore.updateSceneField("media.stereo_layout", this.controls.sceneStereoLayout.input.value), "change");
    this.bindInput(this.controls.sceneEyeOrder.input, () => this.draftStore.updateSceneField("media.eye_order", this.controls.sceneEyeOrder.input.value), "change");
    this.bindInput(this.controls.sceneMonoEye.input, () => this.draftStore.updateSceneField("media.mono_eye", this.controls.sceneMonoEye.input.value), "change");
    this.bindInput(this.controls.sceneGlobalYaw.input, () => this.draftStore.updateSceneField("scene_global_yaw", this.controls.sceneGlobalYaw.input.checked), "change");
    this.bindInput(this.controls.sceneFlipHorizontally.input, () => this.draftStore.updateSceneField("flip_horizontally", this.controls.sceneFlipHorizontally.input.checked), "change");
    this.bindInput(this.controls.sceneMinimap.input, () => this.draftStore.updateSceneField("minimap_image", this.controls.sceneMinimap.input.value || null));
    this.bindInput(this.controls.sceneYaw.input, () => this.draftStore.updateSceneField("rotation.yaw", readNumber(this.controls.sceneYaw.input)));
    this.bindInput(this.controls.scenePitch.input, () => this.draftStore.updateSceneField("rotation.pitch", readNumber(this.controls.scenePitch.input)));
    this.bindInput(this.controls.sceneRoll.input, () => this.draftStore.updateSceneField("rotation.roll", readNumber(this.controls.sceneRoll.input)));
    this.bindInput(this.controls.sceneScale.input, () => this.draftStore.updateSceneField("scale", readNumber(this.controls.sceneScale.input, 1)));
    this.bindInput(this.controls.sceneBillboard.input, () => this.draftStore.updateSceneField("billboard", this.controls.sceneBillboard.input.checked), "change");

    section.append(
      this.controls.sceneSelect.label,
      actions,
      this.controls.sceneId.label,
      this.controls.sceneTitle.label,
      this.controls.sceneMediaSrc.container,
      this.createFieldGrid(
        this.controls.sceneProjection.label,
        this.controls.sceneStereoLayout.label,
        this.controls.sceneEyeOrder.label,
        this.controls.sceneMonoEye.label
      ),
      this.controls.sceneGlobalYaw.label,
      this.controls.sceneFlipHorizontally.label,
      this.controls.sceneMinimap.container,
      this.createFieldGrid(
        this.controls.sceneYaw.label,
        this.controls.scenePitch.label,
        this.controls.sceneRoll.label,
        this.controls.sceneScale.label
      ),
      this.controls.sceneBillboard.label
    );
    return section;
  }

  createHotspotSection() {
    const section = this.createSection("Hotspots da cena", "Crie, selecione e ajuste os hotspots da cena atualmente em edicao.");
    this.controls.hotspotSelect = this.createSelect(FIELD_META.hotspotSelect);
    this.controls.hotspotLibrary = this.createHotspotLibrary();
    this.controls.hotspotId = this.createInput(FIELD_META.hotspotId);
    this.controls.hotspotType = this.createSelect(FIELD_META.hotspotType, [
      ["scene_link", "Navegacao entre cenas"],
      ["annotation", "Anotacao informativa"]
    ]);
    this.controls.hotspotTargetScene = this.createSelect(FIELD_META.hotspotTargetScene);
    this.controls.hotspotMarkerIcon = this.createAssetField(FIELD_META.hotspotMarkerIcon, {
      onOpenFolder: () => this.openAssetFolder(this.controls.hotspotMarkerIcon.input.value),
      clearLabel: "Remover imagem",
      onClear: () => this.clearHotspotMarkerIcon()
    });
    this.controls.iconLibraryFolder = this.createAssetField(FIELD_META.iconLibraryFolder, {
      onOpenFolder: () => this.openAssetFolder(this.controls.iconLibraryFolder.input.value),
      clearLabel: "Usar padrao",
      onClear: () => this.resetIconLibraryFolder()
    });
    this.controls.iconLibrary = this.createIconAssetLibrary();
    this.controls.hotspotMarkerVisible = this.createCheckbox(FIELD_META.hotspotMarkerVisible);
    this.controls.hotspotMarkerBackgroundVisible = this.createCheckbox(FIELD_META.hotspotMarkerBackgroundVisible);
    this.controls.hotspotX = this.createNumberInput(FIELD_META.hotspotX, 0.01);
    this.controls.hotspotY = this.createNumberInput(FIELD_META.hotspotY, 0.01);
    this.controls.hotspotZ = this.createNumberInput(FIELD_META.hotspotZ, 0.01);
    this.controls.hotspotYaw = this.createNumberInput(FIELD_META.hotspotYaw);
    this.controls.hotspotPitch = this.createNumberInput(FIELD_META.hotspotPitch);
    this.controls.hotspotRoll = this.createNumberInput(FIELD_META.hotspotRoll);
    this.controls.hotspotScale = this.createNumberInput(FIELD_META.hotspotScale, 0.1);
    this.controls.hotspotReferenceDepth = this.createNumberInput(FIELD_META.hotspotReferenceDepth, 0.1);
    this.controls.hotspotBillboard = this.createCheckbox(FIELD_META.hotspotBillboard);
    this.controls.hotspotBillboardRotationOffset = this.createCheckbox(FIELD_META.hotspotBillboardRotationOffset);
    this.controls.hotspotApplySceneYaw = this.createCheckbox(FIELD_META.hotspotApplySceneYaw);
    this.controls.hotspotDefineSceneYaw = this.createNumberInput(FIELD_META.hotspotDefineSceneYaw, 0.1);

    const actions = this.createActions([
      {
        label: "Adicionar hotspot de navegacao",
        help: "Cria um hotspot do tipo scene_link para levar o usuario a outra cena.",
        handler: () => this.draftStore.addHotspot("scene_link")
      },
      {
        label: "Adicionar hotspot de anotacao",
        help: "Cria um hotspot informativo do tipo annotation na cena atual.",
        handler: () => this.draftStore.addHotspot("annotation")
      },
      {
        label: "Reposicionar hotspot no panorama",
        help: "Ativa o modo de clique no panorama para gravar uma nova posicao para o hotspot selecionado.",
        handler: () => this.placementController.startHotspotPlacement()
      },
      {
        label: "Remover hotspot selecionado",
        help: "Exclui o hotspot selecionado do draft da cena atual.",
        handler: () => this.draftStore.deleteHotspot()
      }
    ]);

    this.bindInput(this.controls.hotspotSelect.input, () => this.draftStore.setSelectedHotspot(this.controls.hotspotSelect.input.value), "change");
    this.bindInput(this.controls.hotspotId.input, () => this.draftStore.updateHotspotField("id", this.controls.hotspotId.input.value), "change");
    this.bindInput(this.controls.hotspotType.input, () => this.draftStore.updateHotspotField("type", this.controls.hotspotType.input.value), "change");
    this.bindInput(this.controls.hotspotTargetScene.input, () => this.draftStore.updateHotspotField("target_scene", this.controls.hotspotTargetScene.input.value || null), "change");
    this.bindInput(this.controls.hotspotMarkerIcon.input, () => this.draftStore.updateHotspotField("marker_icon.src", normalizeOptionalAssetPath(this.controls.hotspotMarkerIcon.input.value)));
    this.bindInput(this.controls.iconLibraryFolder.input, () => {
      this.handleIconLibraryFolderInput().catch((error) => {
        this.context.setStatus(error?.message || "Nao foi possivel atualizar a biblioteca de icones.", { hideAfterMs: 2200 });
      });
    }, "change");
    this.bindInput(this.controls.hotspotMarkerVisible.input, () => this.draftStore.updateHotspotField("marker_visible", this.controls.hotspotMarkerVisible.input.checked), "change");
    this.bindInput(this.controls.hotspotMarkerBackgroundVisible.input, () => this.draftStore.updateHotspotField("marker_background_visible", this.controls.hotspotMarkerBackgroundVisible.input.checked), "change");
    this.bindInput(this.controls.hotspotX.input, () => this.draftStore.updateHotspotField("position.x", readNumber(this.controls.hotspotX.input)));
    this.bindInput(this.controls.hotspotY.input, () => this.draftStore.updateHotspotField("position.y", readNumber(this.controls.hotspotY.input)));
    this.bindInput(this.controls.hotspotZ.input, () => this.draftStore.updateHotspotField("position.z", readNumber(this.controls.hotspotZ.input, -8)));
    this.bindInput(this.controls.hotspotYaw.input, () => this.draftStore.updateHotspotField("rotation.yaw", readNumber(this.controls.hotspotYaw.input)));
    this.bindInput(this.controls.hotspotPitch.input, () => this.draftStore.updateHotspotField("rotation.pitch", readNumber(this.controls.hotspotPitch.input)));
    this.bindInput(this.controls.hotspotRoll.input, () => this.draftStore.updateHotspotField("rotation.roll", readNumber(this.controls.hotspotRoll.input)));
    this.bindInput(this.controls.hotspotScale.input, () => this.draftStore.updateHotspotField("scale", readNumber(this.controls.hotspotScale.input, 1)));
    this.bindInput(this.controls.hotspotReferenceDepth.input, () => this.draftStore.updateHotspotField("reference_depth", readNumber(this.controls.hotspotReferenceDepth.input, 8)));
    this.bindInput(this.controls.hotspotBillboard.input, () => this.draftStore.updateHotspotField("billboard", this.controls.hotspotBillboard.input.checked), "change");
    this.bindInput(this.controls.hotspotBillboardRotationOffset.input, () => this.draftStore.updateHotspotField("billboard_rotation_offset", this.controls.hotspotBillboardRotationOffset.input.checked), "change");
    this.bindInput(this.controls.hotspotApplySceneYaw.input, () => this.draftStore.updateHotspotField("apply_hotspot_scene_yaw", this.controls.hotspotApplySceneYaw.input.checked), "change");
    this.bindInput(this.controls.hotspotDefineSceneYaw.input, () => this.draftStore.updateHotspotField("hotspot_define_scene_yaw", readNumber(this.controls.hotspotDefineSceneYaw.input, 0)));

    section.append(
      this.controls.hotspotSelect.label,
      this.controls.hotspotLibrary.container,
      actions,
      this.controls.hotspotId.label,
      this.createFieldGrid(this.controls.hotspotType.label, this.controls.hotspotTargetScene.label),
      this.controls.hotspotMarkerIcon.container,
      this.controls.iconLibraryFolder.container,
      this.controls.iconLibrary.container,
      this.createFieldGrid(
        this.controls.hotspotMarkerVisible.label,
        this.controls.hotspotMarkerBackgroundVisible.label,
        this.controls.hotspotBillboard.label,
        this.controls.hotspotBillboardRotationOffset.label
      ),
      this.createTransformGroup({
        title: "Posicao do hotspot",
        help: "Copie ou cole rapidamente as coordenadas X, Y e Z do hotspot selecionado.",
        fields: [
          this.controls.hotspotX.label,
          this.controls.hotspotY.label,
          this.controls.hotspotZ.label
        ],
        onCopy: () => this.copyTransformValues({
          kind: "hotspot-position",
          label: "posicao do hotspot",
          values: {
            x: readNumber(this.controls.hotspotX.input),
            y: readNumber(this.controls.hotspotY.input),
            z: readNumber(this.controls.hotspotZ.input, -8)
          }
        }),
        onPaste: () => this.pasteTransformValues({
          expectedKind: "hotspot-position",
          label: "posicao do hotspot",
          apply: (values) => {
            this.draftStore.updateHotspotField("position.x", values.x);
            this.draftStore.updateHotspotField("position.y", values.y);
            this.draftStore.updateHotspotField("position.z", values.z);
          }
        })
      }),
      this.createTransformGroup({
        title: "Rotacao e escala do hotspot",
        help: "Copie ou cole yaw, pitch, roll e escala do hotspot selecionado.",
        fields: [
          this.controls.hotspotYaw.label,
          this.controls.hotspotPitch.label,
          this.controls.hotspotRoll.label,
          this.controls.hotspotScale.label
        ],
        onCopy: () => this.copyTransformValues({
          kind: "hotspot-rotation-scale",
          label: "rotacao e escala do hotspot",
          values: {
            yaw: readNumber(this.controls.hotspotYaw.input),
            pitch: readNumber(this.controls.hotspotPitch.input),
            roll: readNumber(this.controls.hotspotRoll.input),
            scale: readNumber(this.controls.hotspotScale.input, 1)
          }
        }),
        onPaste: () => this.pasteTransformValues({
          expectedKind: "hotspot-rotation-scale",
          label: "rotacao e escala do hotspot",
          apply: (values) => {
            this.draftStore.updateHotspotField("rotation.yaw", values.yaw);
            this.draftStore.updateHotspotField("rotation.pitch", values.pitch);
            this.draftStore.updateHotspotField("rotation.roll", values.roll);
            this.draftStore.updateHotspotField("scale", values.scale);
          }
        })
      }),
      this.controls.hotspotReferenceDepth.label,
      this.createFieldGrid(this.controls.hotspotApplySceneYaw.label, this.controls.hotspotDefineSceneYaw.label)
    );
    return section;
  }

  createHotspotLibrary() {
    const container = document.createElement("div");
    container.className = "editor-hotspot-library";

    const header = document.createElement("div");
    header.className = "editor-hotspot-library__header";

    const title = document.createElement("p");
    title.className = "editor-hotspot-library__title";
    title.textContent = "Biblioteca rapida de hotspots";
    title.title = "Clique no preview de um hotspot para seleciona-lo rapidamente na cena atual.";

    const help = document.createElement("span");
    help.className = "editor-hotspot-library__help";
    help.textContent = "Clique no preview";
    help.title = "Lista compacta com o preview do icone de cada hotspot da cena atual.";

    header.append(title, help);

    const empty = document.createElement("p");
    empty.className = "editor-hotspot-library__empty";
    empty.textContent = "Nenhum hotspot na cena atual.";

    const grid = document.createElement("div");
    grid.className = "editor-hotspot-library__grid";

    container.append(header, empty, grid);
    return { container, header, title, help, empty, grid };
  }

  createIconAssetLibrary() {
    const container = document.createElement("div");
    container.className = "editor-icon-library";

    const header = document.createElement("div");
    header.className = "editor-icon-library__header";

    const title = document.createElement("p");
    title.className = "editor-icon-library__title";
    title.textContent = "Biblioteca de icones";
    title.title = "Escolha uma pasta de imagens e clique no preview para aplicar o icone ao hotspot selecionado.";

    const actions = document.createElement("div");
    actions.className = "editor-icon-library__actions";

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.textContent = "Atualizar";
    refreshButton.title = "Reler a pasta configurada e atualizar os previews da biblioteca.";
    refreshButton.setAttribute("aria-label", "Atualizar biblioteca de icones");
    refreshButton.addEventListener("click", () => {
      this.refreshIconLibrary().catch((error) => {
        this.context.setStatus(error?.message || "Nao foi possivel atualizar a biblioteca de icones.", { hideAfterMs: 2200 });
      });
    }, { signal: this.abortController.signal });
    actions.append(refreshButton);

    const help = document.createElement("span");
    help.className = "editor-icon-library__help";
    help.textContent = "Clique para aplicar";
    help.title = "Os previews abaixo aplicam a imagem diretamente no hotspot selecionado.";

    header.append(title, actions);

    const empty = document.createElement("p");
    empty.className = "editor-icon-library__empty";
    empty.textContent = "Nenhum icone carregado da pasta configurada.";

    const grid = document.createElement("div");
    grid.className = "editor-icon-library__grid";

    container.append(header, help, empty, grid);
    return { container, header, title, actions, refreshButton, help, empty, grid };
  }

  createHotspotLabelSection() {
    const section = this.createSection("Label vinculada", "Ajuste o texto e a apresentacao visual da label associada ao hotspot selecionado.");
    this.controls.labelScope = document.createElement("p");
    this.controls.labelScope.className = "editor-help-text";

    this.controls.labelText = this.createInput(FIELD_META.labelText);
    this.controls.labelVisible = this.createCheckbox(FIELD_META.labelVisible);
    this.controls.labelOffsetX = this.createNumberInput(FIELD_META.labelOffsetX, 0.01);
    this.controls.labelOffsetY = this.createNumberInput(FIELD_META.labelOffsetY, 0.01);
    this.controls.labelOffsetZ = this.createNumberInput(FIELD_META.labelOffsetZ, 0.01);
    this.controls.labelYaw = this.createNumberInput(FIELD_META.labelYaw);
    this.controls.labelPitch = this.createNumberInput(FIELD_META.labelPitch);
    this.controls.labelRoll = this.createNumberInput(FIELD_META.labelRoll);
    this.controls.labelScale = this.createNumberInput(FIELD_META.labelScale, 0.1);
    this.controls.labelReferenceDepth = this.createNumberInput(FIELD_META.labelReferenceDepth, 0.1);
    this.controls.labelBillboard = this.createCheckbox(FIELD_META.labelBillboard);

    this.bindInput(this.controls.labelText.input, () => this.draftStore.updateHotspotLabelField("text", this.controls.labelText.input.value));
    this.bindInput(this.controls.labelVisible.input, () => this.draftStore.updateHotspotLabelField("visible", this.controls.labelVisible.input.checked), "change");
    this.bindInput(this.controls.labelOffsetX.input, () => this.draftStore.updateHotspotLabelField("position_offset.x", readNumber(this.controls.labelOffsetX.input)));
    this.bindInput(this.controls.labelOffsetY.input, () => this.draftStore.updateHotspotLabelField("position_offset.y", readNumber(this.controls.labelOffsetY.input, 0.9)));
    this.bindInput(this.controls.labelOffsetZ.input, () => this.draftStore.updateHotspotLabelField("position_offset.z", readNumber(this.controls.labelOffsetZ.input)));
    this.bindInput(this.controls.labelYaw.input, () => this.draftStore.updateHotspotLabelField("rotation_offset.yaw", readNumber(this.controls.labelYaw.input)));
    this.bindInput(this.controls.labelPitch.input, () => this.draftStore.updateHotspotLabelField("rotation_offset.pitch", readNumber(this.controls.labelPitch.input)));
    this.bindInput(this.controls.labelRoll.input, () => this.draftStore.updateHotspotLabelField("rotation_offset.roll", readNumber(this.controls.labelRoll.input)));
    this.bindInput(this.controls.labelScale.input, () => this.draftStore.updateHotspotLabelField("scale", readNumber(this.controls.labelScale.input, 1)));
    this.bindInput(this.controls.labelReferenceDepth.input, () => this.draftStore.updateHotspotLabelField("reference_depth", readNumber(this.controls.labelReferenceDepth.input, 8)));
    this.bindInput(this.controls.labelBillboard.input, () => this.draftStore.updateHotspotLabelField("billboard", this.controls.labelBillboard.input.checked), "change");

    section.append(
      this.controls.labelScope,
      this.controls.labelText.label,
      this.createFieldGrid(this.controls.labelVisible.label, this.controls.labelBillboard.label),
      this.createTransformGroup({
        title: "Offset da label",
        help: "Copie ou cole rapidamente o deslocamento X, Y e Z da label vinculada.",
        fields: [
          this.controls.labelOffsetX.label,
          this.controls.labelOffsetY.label,
          this.controls.labelOffsetZ.label
        ],
        onCopy: () => this.copyTransformValues({
          kind: "label-offset",
          label: "offset da label",
          values: {
            x: readNumber(this.controls.labelOffsetX.input),
            y: readNumber(this.controls.labelOffsetY.input, 0.9),
            z: readNumber(this.controls.labelOffsetZ.input)
          }
        }),
        onPaste: () => this.pasteTransformValues({
          expectedKind: "label-offset",
          label: "offset da label",
          apply: (values) => {
            this.draftStore.updateHotspotLabelField("position_offset.x", values.x);
            this.draftStore.updateHotspotLabelField("position_offset.y", values.y);
            this.draftStore.updateHotspotLabelField("position_offset.z", values.z);
          }
        })
      }),
      this.createTransformGroup({
        title: "Rotacao e escala da label",
        help: "Copie ou cole yaw, pitch, roll e escala da label vinculada.",
        fields: [
          this.controls.labelYaw.label,
          this.controls.labelPitch.label,
          this.controls.labelRoll.label,
          this.controls.labelScale.label
        ],
        onCopy: () => this.copyTransformValues({
          kind: "label-rotation-scale",
          label: "rotacao e escala da label",
          values: {
            yaw: readNumber(this.controls.labelYaw.input),
            pitch: readNumber(this.controls.labelPitch.input),
            roll: readNumber(this.controls.labelRoll.input),
            scale: readNumber(this.controls.labelScale.input, 1)
          }
        }),
        onPaste: () => this.pasteTransformValues({
          expectedKind: "label-rotation-scale",
          label: "rotacao e escala da label",
          apply: (values) => {
            this.draftStore.updateHotspotLabelField("rotation_offset.yaw", values.yaw);
            this.draftStore.updateHotspotLabelField("rotation_offset.pitch", values.pitch);
            this.draftStore.updateHotspotLabelField("rotation_offset.roll", values.roll);
            this.draftStore.updateHotspotLabelField("scale", values.scale);
          }
        })
      }),
      this.controls.labelReferenceDepth.label
    );
    return section;
  }

  createJsonSection() {
    const section = this.createSection("Importacao e exportacao", "Aplique, copie ou baixe o JSON consolidado do draft atual.");
    this.controls.jsonEditor = this.createTextarea(FIELD_META.jsonEditor);
    const actions = this.createActions([
      {
        label: "Aplicar JSON ao draft",
        help: "Substitui o draft atual usando o JSON informado abaixo.",
        handler: () => this.draftStore.importJson(this.controls.jsonEditor.input.value)
      },
      {
        label: "Copiar JSON exportado",
        help: "Copia para a area de transferencia o JSON consolidado do draft atual.",
        handler: () => this.copyJson()
      },
      {
        label: "Baixar arquivo tour.json",
        help: "Gera e baixa um arquivo tour.json com o estado atual do draft.",
        handler: () => this.downloadJson()
      }
    ]);

    section.append(this.controls.jsonEditor.label, actions);
    return section;
  }

  sync(state) {
    const draft = state.draft;
    const scene = getScene(draft, state.selectedSceneId);
    const hotspot = getHotspot(scene, state.selectedHotspotId);

    this.controls.status.textContent = state.error ?? this.getStatusText(state, hotspot);
    this.controls.status.classList.toggle("has-error", Boolean(state.error));

    if (!draft) {
      this.syncHotspotLibrary([], null);
      this.syncIconAssetLibrary([]);
      this.setAllDisabled(true);
      return;
    }

    this.setAllDisabled(false);
    this.syncTourControls(draft);
    this.syncSceneControls(draft, scene, state.selectedSceneId);
    this.syncHotspotControls(draft, scene, hotspot, state.selectedHotspotId);
    this.syncHotspotLabelControls(hotspot);
    this.setValue(this.controls.jsonEditor.input, this.draftStore.exportJson());
  }

  getStatusText(state, hotspot) {
    if (state.selectedSceneId && state.activeSceneId && state.selectedSceneId !== state.activeSceneId) {
      return `Editando a cena ${state.selectedSceneId}; cena visivel no runtime: ${state.activeSceneId}`;
    }

    if (hotspot?.id) {
      return state.dirty
        ? `Draft com alteracoes: ${state.activeSceneId} / hotspot ${hotspot.id}`
        : `Cena ativa: ${state.activeSceneId} / hotspot ${hotspot.id}`;
    }

    if (state.activeSceneId) {
      return state.dirty ? `Draft com alteracoes na cena ${state.activeSceneId}` : `Cena ativa: ${state.activeSceneId}`;
    }

    return state.dirty ? "Draft com alteracoes" : "Editor sincronizado";
  }

  syncTourControls(draft) {
    this.setValue(this.controls.tourId.input, draft.id);
    this.setValue(this.controls.tourTitle.input, draft.title);
    this.setValue(this.controls.tourMediaType.input, draft.media_type);
    this.setOptions(this.controls.initialScene.input, draft.scenes.map((scene) => [scene.id, scene.title || scene.id]), draft.initial_scene);
    this.setValue(this.controls.tourYaw.input, draft.settings?.rotation?.yaw);
    this.setValue(this.controls.tourPitch.input, draft.settings?.rotation?.pitch);
    this.setValue(this.controls.tourRoll.input, draft.settings?.rotation?.roll);
    this.setValue(this.controls.tourScale.input, draft.settings?.scale);
    this.controls.tourBillboard.input.checked = draft.settings?.billboard !== false;
  }

  syncSceneControls(draft, scene, selectedSceneId) {
    this.setOptions(this.controls.sceneSelect.input, draft.scenes.map((candidate) => [candidate.id, candidate.title || candidate.id]), selectedSceneId);
    this.setValue(this.controls.sceneId.input, scene?.id);
    this.setValue(this.controls.sceneTitle.input, scene?.title);
    this.setValue(this.controls.sceneMediaSrc.input, scene?.media?.src);
    this.setValue(this.controls.sceneProjection.input, scene?.media?.projection);
    this.setOptions(this.controls.sceneStereoLayout.input, [["top-bottom", "Stereo top-bottom"], ["side-by-side", "Stereo side-by-side"], ["mono", "Mono"]], scene?.media?.stereo_layout ?? "top-bottom");
    this.setOptions(this.controls.sceneEyeOrder.input, [["left-right", "Esquerdo / direito"], ["right-left", "Direito / esquerdo"]], scene?.media?.eye_order ?? "left-right");
    this.setOptions(this.controls.sceneMonoEye.input, [["left", "Esquerdo / parte superior"], ["right", "Direito / parte inferior"]], scene?.media?.mono_eye ?? "left");
    this.controls.sceneGlobalYaw.input.checked = scene?.scene_global_yaw !== false;
    this.controls.sceneFlipHorizontally.input.checked = scene?.flip_horizontally === true || scene?.media?.flip_horizontally === true;
    this.setValue(this.controls.sceneMinimap.input, scene?.minimap_image ?? "");
    this.setValue(this.controls.sceneYaw.input, scene?.rotation?.yaw);
    this.setValue(this.controls.scenePitch.input, scene?.rotation?.pitch);
    this.setValue(this.controls.sceneRoll.input, scene?.rotation?.roll);
    this.setValue(this.controls.sceneScale.input, scene?.scale);
    this.controls.sceneBillboard.input.checked = scene?.billboard !== false;
  }

  syncHotspotControls(draft, scene, hotspot, selectedHotspotId) {
    const hotspots = scene?.hotspots ?? [];
    this.setOptions(this.controls.hotspotSelect.input, hotspots.map((candidate) => [candidate.id, getHotspotDisplayName(candidate)]), selectedHotspotId);
    this.syncHotspotLibrary(hotspots, selectedHotspotId);
    this.setOptions(this.controls.hotspotTargetScene.input, [["", "Sem destino"], ...draft.scenes.map((candidate) => [candidate.id, candidate.title || candidate.id])], hotspot?.target_scene ?? "");
    this.setOptions(this.controls.hotspotType.input, [["scene_link", "Navegacao entre cenas"], ["annotation", "Anotacao informativa"]], hotspot?.type ?? "scene_link");
    this.setValue(this.controls.hotspotId.input, hotspot?.id ?? "");
    this.setValue(this.controls.hotspotMarkerIcon.input, hotspot?.marker_icon?.src ?? "");
    this.setValue(this.controls.hotspotX.input, hotspot?.position?.x ?? "");
    this.setValue(this.controls.hotspotY.input, hotspot?.position?.y ?? "");
    this.setValue(this.controls.hotspotZ.input, hotspot?.position?.z ?? "");
    this.setValue(this.controls.hotspotYaw.input, hotspot?.rotation?.yaw ?? "");
    this.setValue(this.controls.hotspotPitch.input, hotspot?.rotation?.pitch ?? "");
    this.setValue(this.controls.hotspotRoll.input, hotspot?.rotation?.roll ?? "");
    this.setValue(this.controls.hotspotScale.input, hotspot?.scale ?? "");
    this.setValue(this.controls.hotspotReferenceDepth.input, hotspot?.reference_depth ?? 8);
    this.controls.hotspotMarkerVisible.input.checked = hotspot?.marker_visible !== false;
    this.controls.hotspotMarkerBackgroundVisible.input.checked = hotspot?.marker_background_visible !== false;
    this.controls.hotspotBillboard.input.checked = hotspot?.billboard !== false;
    this.controls.hotspotBillboardRotationOffset.input.checked = hotspot?.billboard_rotation_offset === true;
    this.controls.hotspotApplySceneYaw.input.checked = hotspot?.apply_hotspot_scene_yaw === true;
    this.setValue(this.controls.hotspotDefineSceneYaw.input, hotspot?.hotspot_define_scene_yaw ?? 0);

    const controls = [
      this.controls.hotspotId,
      this.controls.hotspotType,
      this.controls.hotspotTargetScene,
      this.controls.hotspotMarkerIcon,
      this.controls.hotspotMarkerVisible,
      this.controls.hotspotMarkerBackgroundVisible,
      this.controls.hotspotX,
      this.controls.hotspotY,
      this.controls.hotspotZ,
      this.controls.hotspotYaw,
      this.controls.hotspotPitch,
      this.controls.hotspotRoll,
      this.controls.hotspotScale,
      this.controls.hotspotReferenceDepth,
      this.controls.hotspotBillboard,
      this.controls.hotspotBillboardRotationOffset,
      this.controls.hotspotApplySceneYaw,
      this.controls.hotspotDefineSceneYaw
    ];

    for (const control of controls) {
      this.setControlDisabled(control, !hotspot);
    }

    this.controls.hotspotTargetScene.input.disabled = !hotspot || hotspot.type !== "scene_link";
    this.controls.hotspotApplySceneYaw.input.disabled = !hotspot || hotspot.type !== "scene_link";
    this.controls.hotspotDefineSceneYaw.input.disabled = !hotspot || hotspot.type !== "scene_link" || hotspot?.apply_hotspot_scene_yaw !== true;
    this.controls.iconLibrary.refreshButton.disabled = this.iconLibraryLoading;
    for (const button of this.controls.iconLibrary.grid.querySelectorAll("button")) {
      button.disabled = !hotspot;
    }
  }

  syncHotspotLibrary(hotspots, selectedHotspotId) {
    const library = this.controls.hotspotLibrary;
    if (!library) {
      return;
    }

    const items = Array.isArray(hotspots) ? hotspots : [];
    library.empty.hidden = items.length > 0;
    library.grid.replaceChildren(
      ...items.map((hotspot) => this.createHotspotLibraryItem(hotspot, hotspot?.id === selectedHotspotId))
    );
  }

  createHotspotLibraryItem(hotspot, isActive) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-hotspot-library__item";
    button.classList.toggle("is-active", isActive);
    button.title = `${getHotspotDisplayName(hotspot)} (${hotspot?.id ?? "hotspot"})`;
    button.setAttribute("aria-label", `Selecionar hotspot ${getHotspotDisplayName(hotspot)}`);
    button.addEventListener("click", () => this.draftStore.setSelectedHotspot(hotspot?.id ?? ""), { signal: this.abortController.signal });

    const preview = document.createElement("span");
    preview.className = "editor-hotspot-library__preview";

    const iconSrc = getHotspotMarkerIconSrc(hotspot);
    if (iconSrc) {
      const image = document.createElement("img");
      image.className = "editor-hotspot-library__preview-image";
      image.src = iconSrc;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        preview.replaceChildren(this.createHotspotLibraryFallbackGlyph());
      }, { once: true });
      preview.append(image);
    } else {
      preview.append(this.createHotspotLibraryFallbackGlyph());
    }

    const text = document.createElement("span");
    text.className = "editor-hotspot-library__label";
    text.textContent = getHotspotDisplayName(hotspot);

    button.append(preview, text);
    return button;
  }

  createHotspotLibraryFallbackGlyph() {
    const glyph = document.createElement("span");
    glyph.className = "editor-hotspot-library__preview-glyph";
    return glyph;
  }

  syncIconAssetLibrary(entries) {
    const library = this.controls.iconLibrary;
    if (!library) {
      return;
    }

    const items = Array.isArray(entries) ? entries : [];
    const hasItems = items.length > 0;
    library.empty.textContent = "Nenhum icone carregado da pasta configurada.";
    library.empty.hidden = hasItems;
    library.help.hidden = !hasItems;
    library.grid.replaceChildren(
      ...items.map((entry) => this.createIconAssetLibraryItem(entry))
    );
  }

  createIconAssetLibraryItem(entry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-icon-library__item";
    button.title = entry?.name || entry?.path || "Aplicar icone";
    button.setAttribute("aria-label", `Aplicar icone ${entry?.name || entry?.path || "selecionado"}`);
    button.disabled = !this.draftStore.getSnapshot()?.selectedHotspotId;
    button.addEventListener("click", () => this.applyIconLibrarySelection(entry?.path ?? null), { signal: this.abortController.signal });

    const image = document.createElement("img");
    image.className = "editor-icon-library__image";
    image.src = entry?.path ?? "";
    image.alt = "";
    image.loading = "lazy";

    const text = document.createElement("span");
    text.className = "editor-icon-library__label";
    text.textContent = entry?.name || entry?.path || "Icone";

    button.append(image, text);
    return button;
  }

  syncHotspotLabelControls(hotspot) {
    const label = hotspot?.label ?? null;
    this.controls.labelScope.textContent = hotspot
      ? `Editando a label vinculada ao hotspot ${hotspot.id}. Toda alteracao abaixo afeta apenas esse hotspot.`
      : "Selecione um hotspot para liberar os controles da label vinculada.";
    this.controls.labelScope.title = this.controls.labelScope.textContent;

    this.setValue(this.controls.labelText.input, label?.text ?? "");
    this.controls.labelVisible.input.checked = label?.visible !== false;
    this.setValue(this.controls.labelOffsetX.input, label?.position_offset?.x ?? "");
    this.setValue(this.controls.labelOffsetY.input, label?.position_offset?.y ?? "");
    this.setValue(this.controls.labelOffsetZ.input, label?.position_offset?.z ?? "");
    this.setValue(this.controls.labelYaw.input, label?.rotation_offset?.yaw ?? "");
    this.setValue(this.controls.labelPitch.input, label?.rotation_offset?.pitch ?? "");
    this.setValue(this.controls.labelRoll.input, label?.rotation_offset?.roll ?? "");
    this.setValue(this.controls.labelScale.input, label?.scale ?? "");
    this.setValue(this.controls.labelReferenceDepth.input, label?.reference_depth ?? 8);
    this.controls.labelBillboard.input.checked = label?.billboard !== false;

    for (const control of [
      this.controls.labelText,
      this.controls.labelVisible,
      this.controls.labelOffsetX,
      this.controls.labelOffsetY,
      this.controls.labelOffsetZ,
      this.controls.labelYaw,
      this.controls.labelPitch,
      this.controls.labelRoll,
      this.controls.labelScale,
      this.controls.labelReferenceDepth,
      this.controls.labelBillboard
    ]) {
      this.setControlDisabled(control, !hotspot);
    }
  }

  createSection(titleText, helpText = "") {
    const section = document.createElement("section");
    section.className = "editor-section";
    const title = document.createElement("h3");
    title.textContent = titleText;
    if (helpText) {
      title.title = helpText;
    }
    section.append(title);
    return section;
  }

  createInput(labelText) {
    const input = document.createElement("input");
    input.type = "text";
    return this.wrapControl(labelText, input);
  }

  createNumberInput(labelText, step = 1) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    return this.wrapControl(labelText, input);
  }

  createSelect(labelText, options = []) {
    const input = document.createElement("select");
    this.setOptions(input, options);
    return this.wrapControl(labelText, input);
  }

  createCheckbox(labelText) {
    const input = document.createElement("input");
    input.type = "checkbox";
    return this.wrapControl(labelText, input);
  }

  createTextarea(labelText) {
    const input = document.createElement("textarea");
    input.spellcheck = false;
    return this.wrapControl(labelText, input);
  }

  createAssetField(meta, { onOpenFolder = null, onClear = null, clearLabel = "Limpar campo" } = {}) {
    const control = this.createInput(meta);
    const container = document.createElement("div");
    container.className = "editor-asset-field";
    container.append(control.label);

    const actions = document.createElement("div");
    actions.className = "editor-asset-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Abrir pasta";
    openButton.title = "Abre em nova aba a pasta que contem o arquivo atualmente informado neste campo.";
    openButton.setAttribute("aria-label", "Abrir a pasta do asset selecionado");
    openButton.addEventListener("click", () => onOpenFolder?.(), { signal: this.abortController.signal });
    actions.append(openButton);

    let clearButton = null;
    if (typeof onClear === "function") {
      clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.textContent = clearLabel;
      clearButton.title = `${clearLabel}.`;
      clearButton.setAttribute("aria-label", clearLabel);
      clearButton.addEventListener("click", () => onClear(), { signal: this.abortController.signal });
      actions.append(clearButton);
    }

    container.append(actions);
    return { ...control, container, openButton, clearButton };
  }

  wrapControl(meta, input) {
    const normalizedMeta = normalizeControlMeta(meta);
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = normalizedMeta.label;
    caption.className = "editor-field-label";
    label.title = normalizedMeta.help || normalizedMeta.label;
    caption.title = normalizedMeta.help || normalizedMeta.label;
    input.title = normalizedMeta.help || normalizedMeta.label;
    input.setAttribute(
      "aria-label",
      normalizedMeta.help
        ? `${normalizedMeta.label}. ${normalizedMeta.help}`
        : normalizedMeta.label
    );
    label.append(caption);
    label.append(input);
    return { label, input, caption, help: normalizedMeta.help };
  }

  createFieldGrid(...children) {
    const grid = document.createElement("div");
    grid.className = "editor-field-grid";
    grid.append(...children);
    return grid;
  }

  createTransformGroup({ title, help = "", fields = [], onCopy, onPaste }) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-transform-group";

    const header = document.createElement("div");
    header.className = "editor-transform-group__header";

    const titleElement = document.createElement("p");
    titleElement.className = "editor-transform-group__title";
    titleElement.textContent = title;
    titleElement.title = help || title;

    const actions = document.createElement("div");
    actions.className = "editor-transform-group__actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copiar";
    copyButton.title = `Copiar ${title.toLowerCase()}.`;
    copyButton.setAttribute("aria-label", `Copiar ${title.toLowerCase()}`);
    copyButton.addEventListener("click", () => onCopy?.(), { signal: this.abortController.signal });

    const pasteButton = document.createElement("button");
    pasteButton.type = "button";
    pasteButton.textContent = "Colar";
    pasteButton.title = `Colar ${title.toLowerCase()} copiada anteriormente.`;
    pasteButton.setAttribute("aria-label", `Colar ${title.toLowerCase()}`);
    pasteButton.addEventListener("click", () => onPaste?.(), { signal: this.abortController.signal });

    actions.append(copyButton, pasteButton);
    header.append(titleElement, actions);
    wrapper.append(header, this.createFieldGrid(...fields));
    return wrapper;
  }

  createActions(actions) {
    const group = document.createElement("div");
    group.className = "editor-actions";
    for (const action of actions) {
      const normalizedAction = normalizeActionMeta(action);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = normalizedAction.label;
      button.title = normalizedAction.help || normalizedAction.label;
      button.setAttribute(
        "aria-label",
        normalizedAction.help
          ? `${normalizedAction.label}. ${normalizedAction.help}`
          : normalizedAction.label
      );
      button.addEventListener("click", normalizedAction.handler, { signal: this.abortController.signal });
      group.append(button);
    }
    return group;
  }

  selectTab(tabId) {
    const nextTabId = this.tabButtons.has(tabId) ? tabId : (this.tabButtons.keys().next().value ?? null);
    if (!nextTabId) {
      return;
    }

    this.activeTabId = nextTabId;

    for (const [id, button] of this.tabButtons.entries()) {
      const isActive = id === nextTabId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    }

    for (const [id, panel] of this.tabPanels.entries()) {
      panel.hidden = id !== nextTabId;
    }
  }

  setPanelMinimized(minimized) {
    this.panelMinimized = minimized === true;
    this.panel.hidden = this.panelMinimized;
    this.controls.panelToggle.hidden = !this.panelMinimized;
    this.root.classList.toggle("is-minimized", this.panelMinimized);
    this.controls.minimizeButton?.setAttribute("aria-expanded", this.panelMinimized ? "false" : "true");
    this.controls.panelToggle?.setAttribute("aria-expanded", this.panelMinimized ? "false" : "true");
  }

  bindInput(input, handler, eventName = "input") {
    input.addEventListener(eventName, handler, { signal: this.abortController.signal });
  }

  setOptions(select, options, selectedValue = select.value) {
    const active = document.activeElement === select;
    if (!active) {
      select.replaceChildren(...options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
      select.value = selectedValue ?? "";
    }
  }

  setValue(input, value) {
    if (document.activeElement === input) {
      return;
    }
    input.value = value == null ? "" : String(value);
  }

  setAllDisabled(isDisabled) {
    for (const control of Object.values(this.controls)) {
      if (control?.input) {
        this.setControlDisabled(control, isDisabled);
      }
    }

    if (this.controls.iconLibrary?.refreshButton) {
      this.controls.iconLibrary.refreshButton.disabled = isDisabled || this.iconLibraryLoading;
    }
    for (const button of this.controls.iconLibrary?.grid?.querySelectorAll?.("button") ?? []) {
      button.disabled = isDisabled;
    }
  }

  setControlDisabled(control, isDisabled) {
    if (!control) {
      return;
    }

    if (control.input) {
      control.input.disabled = isDisabled;
    }
    if (control.openButton) {
      control.openButton.disabled = isDisabled;
    }
    if (control.clearButton) {
      control.clearButton.disabled = isDisabled;
    }
  }

  clearHotspotMarkerIcon() {
    this.setValue(this.controls.hotspotMarkerIcon.input, "");
    this.draftStore.updateHotspotField("marker_icon.src", null);
  }

  async handleIconLibraryFolderInput() {
    const folderPath = normalizeOptionalAssetPath(this.controls.iconLibraryFolder.input.value) || DEFAULT_ICON_LIBRARY_FOLDER;
    this.iconLibraryFolderPath = folderPath;
    storeIconLibraryFolderPath(folderPath);
    await this.refreshIconLibrary();
  }

  resetIconLibraryFolder() {
    this.iconLibraryFolderPath = DEFAULT_ICON_LIBRARY_FOLDER;
    storeIconLibraryFolderPath(DEFAULT_ICON_LIBRARY_FOLDER);
    this.setValue(this.controls.iconLibraryFolder.input, DEFAULT_ICON_LIBRARY_FOLDER);
    this.refreshIconLibrary().catch((error) => {
      this.context.setStatus(error?.message || "Nao foi possivel restaurar a biblioteca padrao.", { hideAfterMs: 2200 });
    });
  }

  async refreshIconLibrary() {
    const library = this.controls.iconLibrary;
    const folderPath = normalizeOptionalAssetPath(this.controls.iconLibraryFolder.input.value)
      || this.iconLibraryFolderPath
      || DEFAULT_ICON_LIBRARY_FOLDER;

    this.iconLibraryFolderPath = folderPath;
    storeIconLibraryFolderPath(folderPath);
    this.setValue(this.controls.iconLibraryFolder.input, folderPath);

    if (!library) {
      return;
    }

    this.iconLibraryLoading = true;
    library.refreshButton.disabled = true;
    library.help.hidden = false;
    library.help.textContent = "Carregando icones...";
    library.empty.hidden = true;

    try {
      const response = await fetch("./__list_assets__", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          folderPath
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || "Nao foi possivel listar a pasta da biblioteca.");
      }

      this.iconLibraryEntries = Array.isArray(payload?.items) ? payload.items : [];
      this.syncIconAssetLibrary(this.iconLibraryEntries);
      library.help.hidden = this.iconLibraryEntries.length === 0;
      library.help.textContent = this.iconLibraryEntries.length > 0
        ? `Pasta: ${folderPath}`
        : "Nenhum icone encontrado";
    } catch (error) {
      this.iconLibraryEntries = [];
      this.syncIconAssetLibrary([]);
      library.help.hidden = false;
      library.help.textContent = "Erro ao carregar biblioteca";
      library.empty.hidden = false;
      library.empty.textContent = error?.message || "Nao foi possivel carregar a biblioteca de icones.";
      throw error;
    } finally {
      this.iconLibraryLoading = false;
      library.refreshButton.disabled = false;
    }
  }

  applyIconLibrarySelection(assetPath) {
    const normalizedAssetPath = normalizeOptionalAssetPath(assetPath);
    if (!normalizedAssetPath) {
      this.context.setStatus("O asset selecionado e invalido.", { hideAfterMs: 1800 });
      return;
    }

    if (!this.draftStore.getSnapshot()?.selectedHotspotId) {
      this.context.setStatus("Selecione um hotspot antes de aplicar um icone.", { hideAfterMs: 1800 });
      return;
    }

    this.setValue(this.controls.hotspotMarkerIcon.input, normalizedAssetPath);
    this.draftStore.updateHotspotField("marker_icon.src", normalizedAssetPath);
    this.context.setStatus("Icone aplicado ao hotspot selecionado.", { hideAfterMs: 1400 });
  }

  copyTransformValues({ kind, label, values }) {
    this.transformClipboard = {
      kind,
      label,
      values: { ...values }
    };
    this.context.setStatus(`${capitalize(label)} copiada.`, { hideAfterMs: 1400 });
  }

  pasteTransformValues({ expectedKind, label, apply }) {
    if (!this.transformClipboard || this.transformClipboard.kind !== expectedKind) {
      this.context.setStatus(`Nenhum valor de ${label} foi copiado ainda.`, { hideAfterMs: 1800 });
      return;
    }

    apply?.(this.transformClipboard.values);
    this.context.setStatus(`${capitalize(label)} colada.`, { hideAfterMs: 1400 });
  }

  async openAssetFolder(assetPath) {
    const normalizedAssetPath = normalizeOptionalAssetPath(assetPath);
    if (!normalizedAssetPath) {
      this.context.setStatus("Informe um arquivo valido antes de abrir a pasta.", { hideAfterMs: 1800 });
      return;
    }

    try {
      const response = await fetch("./__open_folder__", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assetPath: normalizedAssetPath
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || "Nao foi possivel abrir a pasta do asset.");
      }

      this.context.setStatus("Pasta aberta no Explorer.", { hideAfterMs: 1400 });
      return;
    } catch (error) {
      this.context.setStatus(error?.message || "Nao foi possivel abrir a pasta do asset.", { hideAfterMs: 2200 });
    }
  }

  async copyJson() {
    const json = this.draftStore.exportJson();
    try {
      await navigator.clipboard.writeText(json);
      this.context.setStatus("JSON copiado para a area de transferencia.", { hideAfterMs: 1400 });
    } catch (error) {
      this.controls.jsonEditor.input.focus();
      this.controls.jsonEditor.input.select();
      this.context.setStatus("Nao consegui copiar automaticamente; o JSON foi selecionado.", { hideAfterMs: 1800 });
    }
  }

  downloadJson() {
    const json = this.draftStore.exportJson();
    const draft = this.draftStore.getSnapshot().draft;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft?.id || "tour"}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  destroy() {
    this.unsubscribe?.();
    this.abortController?.abort();
    this.root.replaceChildren();
  }
}

function getScene(tour, sceneId) {
  return tour?.scenes?.find((scene) => scene.id === sceneId) ?? null;
}

function getHotspot(scene, hotspotId) {
  return scene?.hotspots?.find((hotspot) => hotspot.id === hotspotId) ?? null;
}

function getHotspotDisplayName(hotspot) {
  const text = String(hotspot?.label?.text ?? "").trim();
  return text || hotspot?.id || "Hotspot";
}

function readNumber(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeOptionalAssetPath(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function capitalize(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function normalizeControlMeta(meta) {
  if (typeof meta === "string") {
    return { label: meta, help: "" };
  }

  return {
    label: meta?.label ?? "",
    help: meta?.help ?? ""
  };
}

function normalizeActionMeta(action) {
  if (Array.isArray(action)) {
    const [label, handler] = action;
    return { label, handler, help: "" };
  }

  return {
    label: action?.label ?? "",
    handler: action?.handler ?? (() => {}),
    help: action?.help ?? ""
  };
}

const FIELD_META = {
  tourId: {
    label: "ID do tour",
    help: "Identificador interno usado para localizar e exportar o tour."
  },
  tourTitle: {
    label: "Nome do tour",
    help: "Titulo principal exibido na interface para este tour."
  },
  tourMediaType: {
    label: "Tipo de midia",
    help: "Informe o tipo de midia esperado pelo runtime para o tour."
  },
  initialScene: {
    label: "Cena inicial",
    help: "Define qual cena deve abrir primeiro quando o tour for carregado."
  },
  tourYaw: {
    label: "Yaw global",
    help: "Rotacao horizontal aplicada ao tour inteiro."
  },
  tourPitch: {
    label: "Pitch global",
    help: "Rotacao vertical global aplicada ao tour inteiro."
  },
  tourRoll: {
    label: "Roll global",
    help: "Rotacao de inclinacao aplicada ao tour inteiro."
  },
  tourScale: {
    label: "Escala global",
    help: "Multiplicador de escala aplicado ao tour inteiro."
  },
  tourBillboard: {
    label: "Billboard global",
    help: "Quando ativo, o tour usa o comportamento global de billboard configurado no draft."
  },
  sceneSelect: {
    label: "Cena em edicao",
    help: "Escolha qual cena do draft deseja editar agora."
  },
  sceneId: {
    label: "ID da cena",
    help: "Identificador interno da cena selecionada."
  },
  sceneTitle: {
    label: "Nome da cena",
    help: "Titulo apresentado para a cena selecionada."
  },
  sceneMediaSrc: {
    label: "Arquivo de midia",
    help: "Caminho da imagem ou arquivo de midia usado pelo panorama da cena."
  },
  sceneProjection: {
    label: "Projecao da midia",
    help: "Tipo de projecao da imagem panoramica, como equirectangular."
  },
  sceneStereoLayout: {
    label: "Layout estereo",
    help: "Organizacao dos olhos na textura estereo da cena."
  },
  sceneEyeOrder: {
    label: "Ordem dos olhos",
    help: "Define qual olho aparece primeiro no arquivo estereo."
  },
  sceneMonoEye: {
    label: "Olho exibido no 2D",
    help: "Escolhe qual metade da imagem sera usada quando a visualizacao for mono."
  },
  sceneGlobalYaw: {
    label: "Scene Global Yaw",
    help: "Quando ativo, a cena abre aplicando o yaw configurado nela. Quando desligado, a navegacao preserva a orientacao atual da camera."
  },
  sceneFlipHorizontally: {
    label: "Flip horizontally",
    help: "Inverte horizontalmente o panorama da cena. Em imagens estereo, tambem ajusta os canais left/right para preservar o 3D."
  },
  sceneMinimap: {
    label: "Imagem do minimapa",
    help: "Arquivo opcional mostrado no widget de minimapa da cena."
  },
  sceneYaw: {
    label: "Yaw da cena",
    help: "Rotacao horizontal especifica da cena."
  },
  scenePitch: {
    label: "Pitch da cena",
    help: "Rotacao vertical especifica da cena."
  },
  sceneRoll: {
    label: "Roll da cena",
    help: "Inclinacao especifica da cena."
  },
  sceneScale: {
    label: "Escala da cena",
    help: "Escala aplicada apenas a cena selecionada."
  },
  sceneBillboard: {
    label: "Billboard da cena",
    help: "Controla se a cena usa o comportamento de billboard configurado para ela."
  },
  hotspotSelect: {
    label: "Hotspot em edicao",
    help: "Escolha qual hotspot da cena atual deseja editar."
  },
  hotspotId: {
    label: "ID do hotspot",
    help: "Identificador interno do hotspot selecionado."
  },
  hotspotType: {
    label: "Tipo do hotspot",
    help: "Define se o hotspot navega para outra cena ou funciona como anotacao."
  },
  hotspotTargetScene: {
    label: "Cena de destino",
    help: "Cena aberta quando um hotspot de navegacao for ativado."
  },
  hotspotMarkerIcon: {
    label: "Imagem do hotspot",
    help: "Arquivo opcional usado como icone do marcador visual do hotspot."
  },
  iconLibraryFolder: {
    label: "Pasta da biblioteca de icones",
    help: "Pasta usada para listar os previews de icones que podem ser aplicados ao hotspot selecionado."
  },
  hotspotMarkerVisible: {
    label: "Marcador visivel",
    help: "Mostra ou oculta o marker principal do hotspot."
  },
  hotspotMarkerBackgroundVisible: {
    label: "Fundo automatico",
    help: "Ativa ou desativa o fundo amarelo automatico do marcador do hotspot."
  },
  hotspotX: {
    label: "Posicao X",
    help: "Coordenada horizontal local do hotspot."
  },
  hotspotY: {
    label: "Posicao Y",
    help: "Coordenada vertical do hotspot."
  },
  hotspotZ: {
    label: "Posicao Z",
    help: "Coordenada de profundidade local do hotspot."
  },
  hotspotYaw: {
    label: "Yaw do hotspot",
    help: "Rotacao horizontal do hotspot selecionado."
  },
  hotspotPitch: {
    label: "Pitch do hotspot",
    help: "Rotacao vertical do hotspot selecionado."
  },
  hotspotRoll: {
    label: "Roll do hotspot",
    help: "Inclinacao do hotspot selecionado."
  },
  hotspotScale: {
    label: "Escala do hotspot",
    help: "Tamanho geral do hotspot selecionado."
  },
  hotspotReferenceDepth: {
    label: "Profundidade de referencia",
    help: "Profundidade usada para ancorar o hotspot no espaco da cena."
  },
  hotspotBillboard: {
    label: "Billboard do hotspot",
    help: "Controla se o hotspot acompanha a orientacao do usuario."
  },
  hotspotBillboardRotationOffset: {
    label: "Usar rotacao como offset do billboard",
    help: "Quando ativo, yaw, pitch e roll do hotspot passam a funcionar como offset da orientacao do billboard."
  },
  hotspotApplySceneYaw: {
    label: "Aplicar yaw de entrada",
    help: "Quando ativo, este hotspot define o yaw inicial da cena de destino durante a transicao."
  },
  hotspotDefineSceneYaw: {
    label: "Yaw de entrada do hotspot",
    help: "Yaw aplicado na cena de destino quando o toggle de yaw do hotspot estiver ativo."
  },
  labelText: {
    label: "Texto da label",
    help: "Conteudo exibido pela label vinculada ao hotspot."
  },
  labelVisible: {
    label: "Label visivel",
    help: "Mostra ou oculta a label vinculada ao hotspot."
  },
  labelOffsetX: {
    label: "Offset X da label",
    help: "Deslocamento lateral da label em relacao ao hotspot."
  },
  labelOffsetY: {
    label: "Offset Y da label",
    help: "Deslocamento vertical da label em relacao ao hotspot."
  },
  labelOffsetZ: {
    label: "Offset Z da label",
    help: "Deslocamento de profundidade da label em relacao ao hotspot."
  },
  labelYaw: {
    label: "Yaw da label",
    help: "Rotacao horizontal adicional da label."
  },
  labelPitch: {
    label: "Pitch da label",
    help: "Rotacao vertical adicional da label."
  },
  labelRoll: {
    label: "Roll da label",
    help: "Inclinacao adicional da label."
  },
  labelScale: {
    label: "Escala da label",
    help: "Tamanho geral da label vinculada."
  },
  labelReferenceDepth: {
    label: "Profundidade ref. da label",
    help: "Profundidade de referencia usada para a label."
  },
  labelBillboard: {
    label: "Billboard da label",
    help: "Controla se a label acompanha a orientacao do usuario."
  },
  jsonEditor: {
    label: "JSON final do tour",
    help: "Visualize, importe ou revise manualmente o JSON consolidado do draft atual."
  }
};

const ICON_LIBRARY_FOLDER_STORAGE_KEY = "wpa360.editor.iconLibraryFolder";
const DEFAULT_ICON_LIBRARY_FOLDER = "./assets/icons";

function getStoredIconLibraryFolderPath() {
  try {
    return normalizeOptionalAssetPath(window.localStorage?.getItem?.(ICON_LIBRARY_FOLDER_STORAGE_KEY))
      || DEFAULT_ICON_LIBRARY_FOLDER;
  } catch {
    return DEFAULT_ICON_LIBRARY_FOLDER;
  }
}

function storeIconLibraryFolderPath(value) {
  try {
    window.localStorage?.setItem?.(ICON_LIBRARY_FOLDER_STORAGE_KEY, normalizeOptionalAssetPath(value) || DEFAULT_ICON_LIBRARY_FOLDER);
  } catch {}
}
