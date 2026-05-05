export class HotspotLoaderShared {
  normalizeHotspots(hotspots = [], scene = null) {
    return hotspots
      .filter((hotspot) => !isSceneLabelHotspot(hotspot, scene))
      .map((hotspot, index) => this.normalizeHotspot(hotspot, index));
  }

  normalizeHotspot(hotspot, index = 0) {
    const source = isObject(hotspot) ? hotspot : {};
    const type = source.type === "scene_link" ? "scene_link" : "annotation";
    const fallbackText = type === "scene_link" ? "Ir para cena" : "Anotacao";

    return {
      ...source,
      id: source.id ?? `hotspot-${index + 1}`,
      type,
      target_tour: type === "scene_link" ? source.target_tour ?? null : null,
      target_scene: type === "scene_link" ? source.target_scene ?? null : null,
      apply_hotspot_scene_yaw: source.apply_hotspot_scene_yaw === true,
      hotspot_define_scene_yaw: toNumber(source.hotspot_define_scene_yaw, 0),
      position: this.normalizeVector(source.position, null, index),
      rotation: this.normalizeRotation(source.rotation),
      scale: toNumber(source.scale, 1),
      reference_depth: toNumber(source.reference_depth, 8),
      billboard: source.billboard !== false,
      billboard_rotation_offset: source.billboard_rotation_offset === true,
      marker_visible: source.marker_visible !== false,
      marker_background_visible: source.marker_background_visible !== false,
      marker_icon: this.normalizeMarkerIcon(source.marker_icon ?? source.marker_icon_src ?? null),
      label: this.normalizeLabelConfig(source.label, {
        fallbackText,
        defaultVisible: true,
        defaultPositionOffset: { x: 0, y: 0.9, z: 0 },
        defaultRotationOffset: { yaw: 0, pitch: 0, roll: 0 },
        fallbackScale: 1,
        fallbackReferenceDepth: toNumber(source.reference_depth, 8),
        defaultReferenceDepthLinked: source.label?.reference_depth == null,
        defaultBillboard: true
      }),
      raw: source
    };
  }

  normalizeMarkerIcon(markerIcon) {
    if (typeof markerIcon === "string") {
      const src = markerIcon.trim();
      return { src: src || null };
    }

    const source = isObject(markerIcon) ? markerIcon : {};
    const src = typeof source.src === "string"
      ? source.src.trim()
      : null;
    return {
      ...source,
      src: src || null
    };
  }

  normalizeLabelConfig(label, {
    fallbackText = "",
    defaultVisible = Boolean(fallbackText),
    defaultPositionOffset = { x: 0, y: 0, z: 0 },
    defaultRotationOffset = { yaw: 0, pitch: 0, roll: 0 },
    fallbackScale = 1,
    fallbackReferenceDepth = 8,
    defaultReferenceDepthLinked = true,
    defaultBillboard = true
  } = {}) {
    const source = isObject(label) ? label : {};
    const text = source.text ?? fallbackText;

    return {
      text: String(text ?? ""),
      visible: source.visible ?? defaultVisible,
      position_offset: this.normalizeVector(source.position_offset, defaultPositionOffset),
      rotation_offset: this.normalizeRotation(source.rotation_offset ?? defaultRotationOffset),
      scale: toNumber(source.scale, fallbackScale),
      reference_depth: toNumber(source.reference_depth, fallbackReferenceDepth),
      reference_depth_linked: source.reference_depth_linked ?? (source.reference_depth == null ? defaultReferenceDepthLinked : false),
      billboard: source.billboard ?? defaultBillboard
    };
  }

  normalizeVector(vector = null, fallback = null, index = 0) {
    const base = fallback ?? this.defaultHotspotPosition(index);
    return {
      x: toNumber(vector?.x, base.x),
      y: toNumber(vector?.y, base.y),
      z: toNumber(vector?.z, base.z)
    };
  }

  defaultHotspotPosition(index) {
    const positions = [
      { x: 5, y: 0.25, z: -8 },
      { x: -5, y: 0.25, z: -8 },
      { x: 0, y: 1.15, z: -8 },
      { x: 2.8, y: -0.35, z: -8 },
      { x: -2.8, y: -0.35, z: -8 }
    ];
    return positions[index % positions.length];
  }

  normalizeRotation(rotation = {}) {
    return {
      yaw: toNumber(rotation?.yaw, 0),
      pitch: toNumber(rotation?.pitch, 0),
      roll: toNumber(rotation?.roll, 0)
    };
  }
}

export function isSceneLabelHotspot(hotspot, scene = null) {
  const id = String(hotspot?.id ?? "").trim().toLowerCase();
  const labelText = String(hotspot?.label?.text ?? "").trim();
  const sceneTitle = String(scene?.title ?? "").trim();
  const annotationOnly = hotspot?.type === "annotation"
    && !hotspot?.target_scene
    && hotspot?.marker_visible === false;
  const looksLikeSceneTitleLabel = id.endsWith("-label")
    || id.endsWith("-scene-label")
    || id === "label"
    || id === "scene-label";

  return annotationOnly
    && looksLikeSceneTitleLabel
    && Boolean(sceneTitle)
    && labelText === sceneTitle;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
