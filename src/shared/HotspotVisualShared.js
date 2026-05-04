export function isNavigableHotspot(hotspot) {
  return hotspot?.type === "scene_link" && Boolean(hotspot?.target_scene);
}

export function isHotspotMarkerVisible(hotspot) {
  return hotspot?.marker_visible !== false;
}

export function getHotspotMarkerIconSrc(hotspot) {
  const markerIcon = hotspot?.marker_icon;

  if (typeof markerIcon === "string") {
    const normalizedString = markerIcon.trim();
    return normalizedString || null;
  }

  if (markerIcon && typeof markerIcon === "object" && !Array.isArray(markerIcon)) {
    const normalizedObjectSrc = typeof markerIcon.src === "string"
      ? markerIcon.src.trim()
      : "";
    return normalizedObjectSrc || null;
  }

  if (typeof hotspot?.marker_icon_src === "string") {
    const normalizedLegacySrc = hotspot.marker_icon_src.trim();
    return normalizedLegacySrc || null;
  }

  return null;
}

export function getHotspotLabelText(hotspot) {
  return String(hotspot?.label?.text ?? hotspot?.id ?? "Hotspot");
}

export function isHotspotLabelVisible(hotspot) {
  return hotspot?.label?.visible !== false && Boolean(getHotspotLabelText(hotspot).trim());
}

export function getHotspotLabelWorldPosition(hotspot) {
  const position = normalizeVector(hotspot?.position, { x: 0, y: 0, z: -8 });
  const offset = rotateVector(
    normalizeVector(hotspot?.label?.position_offset, { x: 0, y: 0, z: 0 }),
    hotspot?.rotation
  );

  return {
    x: position.x + offset.x,
    y: position.y + offset.y,
    z: position.z + offset.z
  };
}

export function getHotspotScale(hotspot, depth) {
  return getDepthScale(hotspot?.scale, hotspot?.reference_depth, depth);
}

export function isHotspotMarkerBillboard(hotspot) {
  return hotspot?.billboard !== false;
}

export function getHotspotMarkerRotation(hotspot) {
  return normalizeRotation(hotspot?.rotation);
}

export function getHotspotMarkerRoll(hotspot) {
  if (hotspot?.billboard === false) {
    return Number(hotspot?.rotation?.roll ?? 0);
  }
  return 0;
}

export function getHotspotLabelScale(hotspot, depth) {
  const referenceDepth = hotspot?.label?.reference_depth_linked === true
    ? hotspot?.reference_depth
    : (hotspot?.label?.reference_depth ?? hotspot?.reference_depth);
  return getDepthScale(hotspot?.label?.scale, referenceDepth, depth);
}

export function isHotspotLabelBillboard(hotspot) {
  return hotspot?.label?.billboard !== false;
}

export function getHotspotLabelRotation(hotspot) {
  return addRotation(
    normalizeRotation(hotspot?.rotation),
    normalizeRotation(hotspot?.label?.rotation_offset)
  );
}

export function getHotspotLabelRoll(hotspot) {
  const labelRoll = Number(hotspot?.label?.rotation_offset?.roll ?? 0);
  if (hotspot?.label?.billboard === false) {
    return Number(hotspot?.rotation?.roll ?? 0) + labelRoll;
  }
  return labelRoll;
}

export function getHotspotSelectLabel(hotspot) {
  return getHotspotLabelText(hotspot).trim() || hotspot?.id || "Hotspot";
}

function getDepthScale(scale, referenceDepth, depth) {
  const baseScale = Math.max(0.001, Number(scale ?? 1) || 1);
  const baseDepth = Math.max(0.001, Number(referenceDepth ?? 8) || 8);
  const safeDepth = Math.max(0.001, Number(depth) || baseDepth);
  return baseScale * clamp(baseDepth / safeDepth, 0.55, 1.45);
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

function normalizeVector(vector, fallback) {
  return {
    x: Number(vector?.x ?? fallback.x),
    y: Number(vector?.y ?? fallback.y),
    z: Number(vector?.z ?? fallback.z)
  };
}

function normalizeRotation(rotation) {
  return {
    yaw: Number(rotation?.yaw ?? 0),
    pitch: Number(rotation?.pitch ?? 0),
    roll: Number(rotation?.roll ?? 0)
  };
}

function addRotation(baseRotation, offsetRotation) {
  return {
    yaw: Number(baseRotation?.yaw ?? 0) + Number(offsetRotation?.yaw ?? 0),
    pitch: Number(baseRotation?.pitch ?? 0) + Number(offsetRotation?.pitch ?? 0),
    roll: Number(baseRotation?.roll ?? 0) + Number(offsetRotation?.roll ?? 0)
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}
