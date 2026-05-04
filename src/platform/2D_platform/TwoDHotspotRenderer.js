import {
  getHotspotLabelRotation,
  getHotspotLabelRoll,
  getHotspotLabelScale,
  getHotspotMarkerIconSrc,
  getHotspotMarkerRotation,
  getHotspotLabelText,
  getHotspotLabelWorldPosition,
  isHotspotLabelBillboard,
  getHotspotMarkerRoll,
  getHotspotScale,
  getHotspotSelectLabel,
  isHotspotMarkerBillboard,
  isHotspotLabelVisible,
  isHotspotMarkerVisible,
  isNavigableHotspot
} from "../../shared/HotspotVisualShared.js";

export class TwoDHotspotRenderer {
  constructor({ root, context, project }) {
    this.root = root;
    this.context = context;
    this.project = project;
    this.items = [];
    this.itemsByKey = new Map();
    this.interactionLocked = false;
  }

  setInteractionLocked(locked) {
    this.interactionLocked = locked === true;
    if (this.root) {
      this.root.style.pointerEvents = this.interactionLocked ? "none" : "";
      this.root.style.visibility = this.interactionLocked ? "hidden" : "";
    }
  }

  render(scene) {
    const nextItems = [];
    const seenKeys = new Set();

    for (const hotspot of scene.hotspots ?? []) {
      if (isHotspotMarkerVisible(hotspot)) {
      const item = this.syncItem(hotspot, {
          kind: "marker",
          position: hotspot.position,
          roll: getHotspotMarkerRoll(hotspot),
          billboard: isHotspotMarkerBillboard(hotspot),
          rotation: getHotspotMarkerRotation(hotspot)
        });
        nextItems.push(item);
        seenKeys.add(item.key);
      }

      if (isHotspotLabelVisible(hotspot)) {
        const item = this.syncItem(hotspot, {
          kind: "label",
          position: getHotspotLabelWorldPosition(hotspot),
          roll: getHotspotLabelRoll(hotspot),
          billboard: isHotspotLabelBillboard(hotspot),
          rotation: getHotspotLabelRotation(hotspot)
        });
        nextItems.push(item);
        seenKeys.add(item.key);
      }
    }

    for (const [key, item] of this.itemsByKey.entries()) {
      if (!seenKeys.has(key)) {
        this.disposeItem(item);
        this.itemsByKey.delete(key);
      }
    }

    this.items = nextItems;
    this.updateProjection();
  }

  syncItem(hotspot, { kind, position, roll, billboard, rotation }) {
    const key = createItemKey(hotspot.id, kind);
    let item = this.itemsByKey.get(key);
    if (!item) {
      item = this.createItem(hotspot, { key, kind, position, roll, billboard, rotation });
      this.itemsByKey.set(key, item);
    }

    item.hotspot = hotspot;
    item.position = position;
    item.roll = roll;
    item.billboard = billboard !== false;
    item.rotation = rotation ?? defaultRotation();
    this.updateItemElement(item);
    return item;
  }

  createItem(hotspot, { key, kind, position, roll, billboard, rotation }) {
    const element = document.createElement(isNavigableHotspot(hotspot) ? "button" : "div");
    const item = {
      key,
      hotspot,
      element,
      kind,
      position,
      roll,
      billboard: billboard !== false,
      rotation: rotation ?? defaultRotation(),
      lastProjectedOrientation: null,
      onPointerDown: stopPointerPropagation,
      onClick: (event) => this.handleHotspotClick(event, item)
    };

    element.dataset.hotspotId = hotspot.id;
    element.dataset.editorItemType = "hotspot";
    element.dataset.hotspotRole = kind;
    element.addEventListener("pointerdown", item.onPointerDown);
    this.root.append(element);
    this.updateItemElement(item);
    return item;
  }

  updateItemElement(item) {
    const { hotspot, element, kind } = item;
    const label = getHotspotSelectLabel(hotspot);
    const navigable = isNavigableHotspot(hotspot);
    const tagName = navigable ? "BUTTON" : "DIV";
    if (element.tagName !== tagName) {
      const replacement = document.createElement(navigable ? "button" : "div");
      replacement.addEventListener("pointerdown", item.onPointerDown);
      element.replaceWith(replacement);
      item.element = replacement;
    }

    const activeElement = item.element;
    activeElement.className = `hotspot hotspot-${kind} ${navigable ? "is-linked" : ""}`;
    activeElement.dataset.hotspotId = hotspot.id;
    activeElement.dataset.editorItemType = "hotspot";
    activeElement.dataset.hotspotRole = kind;
    activeElement.title = label;

    activeElement.removeEventListener("click", item.onClick);
    if (navigable) {
      activeElement.type = "button";
      activeElement.setAttribute("aria-label", label);
      activeElement.addEventListener("click", item.onClick);
    } else {
      activeElement.removeAttribute("type");
      if (kind === "marker") {
        activeElement.setAttribute("aria-label", label);
      } else {
        activeElement.removeAttribute("aria-label");
      }
    }

    syncItemContent(activeElement, hotspot, kind);
  }

  handleHotspotClick(event, item) {
    if (this.interactionLocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const hotspot = item.hotspot;
    event.preventDefault();
    event.stopPropagation();

    this.context.debugLog?.("hotspot:click", {
      platform: "2D_platform",
      hotspotId: hotspot.id,
      label: getHotspotLabelText(hotspot),
      targetTour: hotspot.target_tour ?? null,
      targetScene: hotspot.target_scene
    });

    if (!hotspot.target_scene) {
      this.context.debugLog?.("hotspot:navigation-skipped:no-target", {
        platform: "2D_platform",
        hotspotId: hotspot.id
      });
      return;
    }

    const navigate = typeof this.context.goToHotspotTarget === "function"
      ? this.context.goToHotspotTarget(hotspot, { source: "2D_platform" })
      : this.context.goToScene(hotspot.target_scene);

    navigate
      ?.catch?.((error) => {
        console.error("[WPA360] hotspot navigation failed", error);
        this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
      });
  }

  updateProjection() {
    for (const item of this.items) {
      const { hotspot, element, kind, position, roll, billboard, rotation } = item;
      const projected = this.project(position);
      const scale = kind === "marker"
        ? getHotspotScale(hotspot, projected.depth)
        : getHotspotLabelScale(hotspot, projected.depth);
      const nextProjectedOrientation = billboard
        ? null
        : this.projectOrientationBasis(position, rotation, projected);
      const projectedOrientation = nextProjectedOrientation ?? item.lastProjectedOrientation;

      if (nextProjectedOrientation) {
        item.lastProjectedOrientation = nextProjectedOrientation;
      }

      element.style.left = `${projected.x}px`;
      element.style.top = `${projected.y}px`;
      element.style.zIndex = String(Math.max(1, Math.round(1000 - projected.depth)));
      element.style.transform = buildElementTransform({
        billboard,
        roll,
        scale,
        projectedOrientation
      });
      element.classList.toggle("is-hidden", !projected.visible);
    }
  }

  projectOrientationBasis(position, rotation, projectedCenter = null) {
    const basisLength = 0.75;
    const xAxis = rotateVector({ x: basisLength, y: 0, z: 0 }, rotation);
    const yAxis = rotateVector({ x: 0, y: basisLength, z: 0 }, rotation);
    const centerProjection = projectedCenter ?? this.project(position);
    const projectedXAxis = this.project({
      x: position.x + xAxis.x,
      y: position.y + xAxis.y,
      z: position.z + xAxis.z
    });
    const projectedYAxis = this.project({
      x: position.x + yAxis.x,
      y: position.y + yAxis.y,
      z: position.z + yAxis.z
    });

    if (!centerProjection.visible || !isProjectionUsable(projectedXAxis) || !isProjectionUsable(projectedYAxis)) {
      return null;
    }

    const xAxisVector = {
      x: projectedXAxis.x - centerProjection.x,
      y: projectedXAxis.y - centerProjection.y
    };
    const yAxisVector = {
      x: projectedYAxis.x - centerProjection.x,
      y: projectedYAxis.y - centerProjection.y
    };
    const xAxisLength = Math.hypot(xAxisVector.x, xAxisVector.y);
    const yAxisLength = Math.hypot(yAxisVector.x, yAxisVector.y);
    if (xAxisLength < 0.0001 || yAxisLength < 0.0001) {
      return null;
    }
    const normalizationFactor = Math.max(0.0001, (xAxisLength + yAxisLength) / 2);

    return {
      xAxis: {
        x: xAxisVector.x / normalizationFactor,
        y: xAxisVector.y / normalizationFactor
      },
      yAxis: {
        x: yAxisVector.x / normalizationFactor,
        y: yAxisVector.y / normalizationFactor
      }
    };
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
    this.root?.replaceChildren();
  }
}

function createItemKey(hotspotId, kind) {
  return `${hotspotId}:${kind}`;
}

function buildElementTransform({ billboard, roll, scale, projectedOrientation }) {
  if (!billboard && projectedOrientation) {
    const safeScale = Math.max(0.001, Number(scale ?? 1) || 1);
    const a = projectedOrientation.xAxis.x * safeScale;
    const b = projectedOrientation.xAxis.y * safeScale;
    const c = projectedOrientation.yAxis.x * safeScale;
    const d = projectedOrientation.yAxis.y * safeScale;
    return `translate(-50%, -50%) matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
  }

  return `translate(-50%, -50%) rotate(${roll}deg) scale(${scale})`;
}

function isProjectionUsable(projected) {
  return Boolean(
    projected
    && projected.inFrontOfCamera !== false
    && Number.isFinite(projected.x)
    && Number.isFinite(projected.y)
    && Number.isFinite(projected.depth)
  );
}

function rotateVector(vector, rotation) {
  const yaw = toRadians(rotation?.yaw ?? 0);
  const pitch = toRadians(rotation?.pitch ?? 0);
  const roll = toRadians(rotation?.roll ?? 0);

  let x = Number(vector?.x ?? 0);
  let y = Number(vector?.y ?? 0);
  let z = Number(vector?.z ?? 0);

  const yawX = x * Math.cos(yaw) - z * Math.sin(yaw);
  const yawZ = x * Math.sin(yaw) + z * Math.cos(yaw);
  x = yawX;
  z = yawZ;

  const pitchY = y * Math.cos(pitch) - z * Math.sin(pitch);
  const pitchZ = y * Math.sin(pitch) + z * Math.cos(pitch);
  y = pitchY;
  z = pitchZ;

  const rollX = x * Math.cos(roll) - y * Math.sin(roll);
  const rollY = x * Math.sin(roll) + y * Math.cos(roll);

  return { x: rollX, y: rollY, z };
}

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

function defaultRotation() {
  return { yaw: 0, pitch: 0, roll: 0 };
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
