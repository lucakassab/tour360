import {
  getHotspotLabelRoll,
  getHotspotLabelScale,
  getHotspotMarkerIconSrc,
  getHotspotLabelText,
  getHotspotLabelWorldPosition,
  getHotspotMarkerRoll,
  getHotspotScale,
  isHotspotMarkerBackgroundVisible,
  getHotspotSelectLabel,
  isHotspotLabelVisible,
  isHotspotMarkerVisible,
  isNavigableHotspot
} from "../../shared/HotspotVisualShared.js";

export class VRHotspotRenderer {
  constructor({ renderer, context }) {
    this.renderer = renderer;
    this.context = context;
    this.items = [];
    this.itemsByKey = new Map();
    this.sceneItems = [];
    this.activeHotspotId = null;
  }

  render(scene) {
    this.sceneItems = [...(scene.hotspots ?? [])];
    const nextItems = [];
    const seenKeys = new Set();

    for (const eyeName of ["left", "right"]) {
      const layer = eyeName === "left"
        ? this.renderer.leftEye.hotspotLayer
        : this.renderer.rightEye.hotspotLayer;

      for (const hotspot of scene.hotspots ?? []) {
        if (isHotspotMarkerVisible(hotspot)) {
          const item = this.syncItem(layer, eyeName, hotspot, {
            kind: "marker",
            position: hotspot.position,
            roll: getHotspotMarkerRoll(hotspot)
          });
          nextItems.push(item);
          seenKeys.add(item.key);
        }

        if (isHotspotLabelVisible(hotspot)) {
          const item = this.syncItem(layer, eyeName, hotspot, {
            kind: "label",
            position: getHotspotLabelWorldPosition(hotspot),
            roll: getHotspotLabelRoll(hotspot)
          });
          nextItems.push(item);
          seenKeys.add(item.key);
        }
      }
    }

    for (const [key, item] of this.itemsByKey.entries()) {
      if (!seenKeys.has(key)) {
        this.disposeItem(item);
        this.itemsByKey.delete(key);
      }
    }

    this.items = nextItems;
    this.syncActiveStates();
    this.updateProjection();
  }

  syncItem(layer, eyeName, hotspot, { kind, position, roll }) {
    const key = createItemKey(eyeName, hotspot.id, kind);
    let item = this.itemsByKey.get(key);
    if (!item) {
      item = this.createItem(layer, eyeName, hotspot, { key, kind, position, roll });
      this.itemsByKey.set(key, item);
    }

    item.hotspot = hotspot;
    item.position = position;
    item.roll = roll;
    item.eyeName = eyeName;

    if (item.layer !== layer) {
      layer.append(item.element);
      item.layer = layer;
    }

    this.updateItemElement(item);
    return item;
  }

  createItem(layer, eyeName, hotspot, { key, kind, position, roll }) {
    const element = document.createElement(isNavigableHotspot(hotspot) ? "button" : "div");
    const item = {
      key,
      layer,
      eyeName,
      hotspot,
      element,
      kind,
      position,
      roll,
      onPointerDown: stopPointerPropagation,
      onClick: (event) => this.handleHotspotClick(event, item)
    };

    element.addEventListener("pointerdown", item.onPointerDown);
    layer.append(element);
    this.updateItemElement(item);
    return item;
  }

  updateItemElement(item) {
    const { hotspot, kind, eyeName } = item;
    const label = getHotspotSelectLabel(hotspot);
    const navigable = isNavigableHotspot(hotspot);
    const currentElement = item.element;
    const requiredTagName = navigable ? "BUTTON" : "DIV";

    if (currentElement.tagName !== requiredTagName) {
      const replacement = document.createElement(navigable ? "button" : "div");
      replacement.addEventListener("pointerdown", item.onPointerDown);
      currentElement.replaceWith(replacement);
      item.element = replacement;
    }

    const element = item.element;
    element.className = `hotspot hotspot-${kind} ${navigable ? "is-linked" : ""}`;
    if (kind === "marker") {
      element.classList.toggle("is-background-hidden", !isHotspotMarkerBackgroundVisible(hotspot));
    }
    element.dataset.hotspotId = hotspot.id;
    element.dataset.editorItemType = "hotspot";
    element.dataset.hotspotRole = kind;
    element.dataset.eye = eyeName;
    element.title = label;
    element.setAttribute("aria-label", label);

    element.removeEventListener("click", item.onClick);
    if (navigable) {
      element.type = "button";
      element.addEventListener("click", item.onClick);
    } else {
      element.removeAttribute("type");
    }

    syncItemContent(element, hotspot, kind);
  }

  setActiveHotspot(hotspotId) {
    const nextId = hotspotId ?? null;
    if (this.activeHotspotId === nextId) {
      return;
    }

    this.activeHotspotId = nextId;
    this.syncActiveStates();
  }

  syncActiveStates() {
    for (const { hotspot, element } of this.items) {
      const isActive = Boolean(this.activeHotspotId && hotspot.id === this.activeHotspotId);
      element.classList.toggle("is-active", isActive);
      element.setAttribute("aria-pressed", isActive ? "true" : "false");
      element.dataset.active = isActive ? "true" : "false";
    }
  }

  handleHotspotClick(event, item) {
    const hotspot = item.hotspot;
    event.preventDefault();
    event.stopPropagation();

    this.setActiveHotspot(hotspot.id);

    this.context.debugLog?.("hotspot:click", {
      platform: "VR_platform",
      eye: item.eyeName,
      hotspotId: hotspot.id,
      label: getHotspotLabelText(hotspot),
      targetScene: hotspot.target_scene
    });

    if (!hotspot.target_scene) {
      this.context.debugLog?.("hotspot:navigation-skipped:no-target", {
        platform: "VR_platform",
        eye: item.eyeName,
        hotspotId: hotspot.id
      });
      return;
    }

    this.context.goToScene(hotspot.target_scene)
      ?.catch?.((error) => {
        console.error("[WPA360] hotspot navigation failed", error);
        this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
      });
  }

  updateProjection() {
    const presenting = this.renderer.isPresenting();

    for (const { hotspot, element, eyeName, kind, position, roll } of this.items) {
      if (presenting) {
        element.classList.add("is-hidden");
        continue;
      }

      const projected = this.renderer.projectWorldToEye(position, eyeName);
      const scale = kind === "marker"
        ? getHotspotScale(hotspot, projected.depth)
        : getHotspotLabelScale(hotspot, projected.depth);

      element.style.left = `${projected.x}px`;
      element.style.top = `${projected.y}px`;
      element.style.zIndex = String(Math.max(1, Math.round(1000 - projected.depth)));
      element.style.transform = `translate(-50%, -50%) rotate(${roll}deg) scale(${scale})`;
      element.classList.toggle("is-hidden", !projected.visible);
    }

    this.syncActiveStates();
  }

  selectCenteredHotspot() {
    const hotspot = this.renderer.findCenteredHotspot(this.sceneItems);
    if (hotspot?.target_scene) {
      this.setActiveHotspot(hotspot.id);

      this.context.debugLog?.("hotspot:gaze-select", {
        platform: "VR_platform",
        hotspotId: hotspot.id,
        label: getHotspotLabelText(hotspot),
        targetScene: hotspot.target_scene
      });

      this.context.goToScene(hotspot.target_scene)
        ?.catch?.((error) => {
          console.error("[WPA360] hotspot gaze navigation failed", error);
          this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
        });
      return true;
    }

    this.setActiveHotspot(null);
    this.context.setStatus("No scene hotspot is centered right now.", { hideAfterMs: 1200 });
    return false;
  }

  disposeItem(item) {
    item.element?.removeEventListener("pointerdown", item.onPointerDown);
    item.element?.removeEventListener("click", item.onClick);
    item.element?.remove();
  }

  destroy() {
    for (const item of this.itemsByKey.values()) {
      this.disposeItem(item);
    }
    this.items = [];
    this.itemsByKey.clear();
    this.sceneItems = [];
    this.activeHotspotId = null;
    this.renderer?.leftEye?.hotspotLayer.replaceChildren();
    this.renderer?.rightEye?.hotspotLayer.replaceChildren();
  }
}

function createItemKey(eyeName, hotspotId, kind) {
  return `${eyeName}:${hotspotId}:${kind}`;
}

function syncItemContent(element, hotspot, kind) {
  if (kind === "marker") {
    const iconSrc = getHotspotMarkerIconSrc(hotspot);
    let glyph = element.firstElementChild;
    if (iconSrc) {
      if (!glyph || !glyph.classList.contains("hotspot-marker__image")) {
        element.replaceChildren();
        glyph = document.createElement("img");
        glyph.className = "hotspot-marker__image";
        glyph.alt = "";
        glyph.draggable = false;
        glyph.style.width = "100%";
        glyph.style.height = "100%";
        glyph.style.objectFit = "contain";
        glyph.style.display = "block";
        glyph.style.pointerEvents = "none";
        element.append(glyph);
      }
      if (glyph.getAttribute("src") !== iconSrc) {
        glyph.setAttribute("src", iconSrc);
      }
      return;
    }

    if (!glyph || !glyph.classList.contains("hotspot-marker__glyph")) {
      element.replaceChildren();
      glyph = document.createElement("span");
      glyph.className = "hotspot-marker__glyph";
      element.append(glyph);
    }
    return;
  }

  let label = element.firstElementChild;
  if (!label || !label.classList.contains("hotspot-label-text")) {
    element.replaceChildren();
    label = document.createElement("span");
    label.className = "hotspot-label-text";
    element.append(label);
  }

  const nextText = getHotspotLabelText(hotspot);
  if (label.textContent !== nextText) {
    label.textContent = nextText;
  }
}

function stopPointerPropagation(event) {
  event.stopPropagation();
}
