import * as THREE from "../../vendor/three/three.module.js";
import {
  getHotspotLabelText,
  getHotspotMarkerIconSrc,
  getHotspotLabelWorldPosition,
  isHotspotLabelVisible,
  isHotspotMarkerVisible
} from "./HotspotVisualShared.js";

const MARKER_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const ACTIVE_TINT = new THREE.Color("#fff0c8");
const IDLE_TINT = new THREE.Color("#ffffff");
const MARKER_TEXTURE_SIZE = 256;
const MARKER_OUTER_RADIUS = 88;
const MARKER_BORDER_WIDTH = 6;
const MARKER_GLYPH_RADIUS = 54;
const MARKER_GLYPH_BORDER_WIDTH = 16;
const MARKER_ICON_INSET = 14;

export class ThreeHotspotLayer {
  constructor({ contentRoot, assetCache = null }) {
    this.contentRoot = contentRoot;
    this.assetCache = assetCache;
    this.group = new THREE.Group();
    this.group.name = "wpa360-xr-hotspots";
    this.group.visible = false;
    this.contentRoot.add(this.group);

    this.entries = [];
    this.hotspotById = new Map();
    this.interactiveObjects = [];
    this.highlightedHotspotId = null;
    this.markerIconTextureCache = new Map();

    this.tempVectors = {
      cameraPosition: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
      worldPosition: new THREE.Vector3(),
      toHotspot: new THREE.Vector3()
    };
  }

  setHotspots(hotspots = []) {
    const previousEntriesById = new Map(this.entries.map((entry) => [entry.hotspot?.id, entry]));
    const nextEntries = [];
    const nextInteractiveObjects = [];

    for (const hotspot of hotspots) {
      const previousEntry = previousEntriesById.get(hotspot.id) ?? null;
      const entry = previousEntry
        ? this.updateEntry(previousEntry, hotspot)
        : this.createEntry(hotspot);

      previousEntriesById.delete(hotspot.id);
      nextEntries.push(entry);
      if (entry.marker) {
        nextInteractiveObjects.push(...entry.markerSurfaces);
      }
      if (entry.label) {
        nextInteractiveObjects.push(entry.label);
      }
    }

    for (const entry of previousEntriesById.values()) {
      this.disposeEntry(entry);
    }

    this.entries = nextEntries;
    this.hotspotById = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
    this.interactiveObjects = nextInteractiveObjects;
    this.syncHighlightState();
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  setHighlightedHotspot(hotspotId) {
    const nextId = hotspotId ?? null;
    if (this.highlightedHotspotId === nextId) {
      return;
    }

    this.highlightedHotspotId = nextId;
    this.syncHighlightState();
  }

  update(camera) {
    if (!camera || !this.group.visible || this.entries.length === 0) {
      return;
    }

    const cameraPosition = this.tempVectors.cameraPosition;
    camera.getWorldPosition(cameraPosition);

    for (const entry of this.entries) {
      if (entry.marker) {
        orientObject(entry.marker, cameraPosition, entry.markerConfig);
      }

      if (entry.label) {
        orientObject(entry.label, cameraPosition, entry.labelConfig);
      }
    }
  }

  getCenteredHotspot(camera, { maxDegrees = 9 } = {}) {
    if (!camera || this.entries.length === 0) {
      return null;
    }

    const cameraPosition = this.tempVectors.cameraPosition;
    const cameraDirection = this.tempVectors.cameraDirection;
    const worldPosition = this.tempVectors.worldPosition;
    const toHotspot = this.tempVectors.toHotspot;

    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraDirection);

    let bestMatch = null;

    for (const entry of this.entries) {
      if (entry.hotspot.type !== "scene_link" || !entry.hotspot.target_scene) {
        continue;
      }

      this.contentRoot.localToWorld(worldPosition.copy(entry.anchorPosition));
      toHotspot.copy(worldPosition).sub(cameraPosition);
      const distance = toHotspot.length();
      if (distance <= 0.001) {
        continue;
      }

      const angle = THREE.MathUtils.radToDeg(cameraDirection.angleTo(toHotspot.normalize()));
      if (angle > maxDegrees) {
        continue;
      }

      if (!bestMatch || angle < bestMatch.angle) {
        bestMatch = {
          hotspot: entry.hotspot,
          angle
        };
      }
    }

    return bestMatch?.hotspot ?? null;
  }

  destroy() {
    this.clear();
    this.group.removeFromParent();
  }

  getInteractiveObjects() {
    return this.interactiveObjects;
  }

  getHotspotByObject(object) {
    let current = object;
    while (current) {
      const hotspotId = current.userData?.hotspotId;
      if (hotspotId && this.hotspotById.has(hotspotId)) {
        return this.hotspotById.get(hotspotId);
      }
      current = current.parent;
    }
    return null;
  }

  intersectRay(raycaster) {
    if (!raycaster || this.interactiveObjects.length === 0) {
      return null;
    }

    const candidates = this.interactiveObjects.filter((object) => object.visible);
    if (candidates.length === 0) {
      return null;
    }

    const intersection = raycaster.intersectObjects(candidates, false)[0];
    if (!intersection) {
      return null;
    }

    return {
      hotspot: this.getHotspotByObject(intersection.object),
      intersection
    };
  }

  clear() {
    for (const entry of this.entries) {
      this.disposeEntry(entry);
    }

    this.group.clear();
    this.entries = [];
    this.hotspotById.clear();
    this.interactiveObjects = [];
    this.highlightedHotspotId = null;
    this.clearMarkerIconTextureCache();
  }

  createEntry(hotspot) {
    const entry = {
      hotspot,
      anchorPosition: vectorFrom(hotspot.position),

      marker: null,
      markerSurfaces: [],
      markerGlow: null,
      markerConfig: null,
      markerBaseSize: 1,
      markerIconSrc: null,
      markerIconRequestToken: null,

      label: null,
      labelGlow: null,
      labelConfig: null,
      labelBaseWidth: 1,
      labelBaseHeight: 1
    };

    this.syncEntryMarker(entry, hotspot);
    this.syncEntryLabel(entry, hotspot);

    return entry;
  }

  updateEntry(entry, hotspot) {
    entry.hotspot = hotspot;
    entry.anchorPosition.copy(vectorFrom(hotspot.position));
    this.syncEntryMarker(entry, hotspot);
    this.syncEntryLabel(entry, hotspot);
    return entry;
  }

  syncEntryMarker(entry, hotspot) {
    if (!isHotspotMarkerVisible(hotspot)) {
      this.removeEntryMarker(entry);
      return;
    }

    if (!entry.marker) {
      const markerMaterial = createMarkerMaterial();
      const marker = new THREE.Group();
      const markerFront = new THREE.Mesh(MARKER_GEOMETRY, markerMaterial);
      const markerBack = new THREE.Mesh(MARKER_GEOMETRY, createMarkerMaterial());
      const markerGlow = createMarkerHighlightMesh();

      markerFront.name = "wpa360-hotspot-marker-front";
      markerBack.name = "wpa360-hotspot-marker-back";
      markerBack.rotation.y = Math.PI;
      markerGlow.visible = false;
      marker.add(markerFront);
      marker.add(markerBack);
      marker.add(markerGlow);
      this.group.add(marker);

      entry.marker = marker;
      entry.markerSurfaces = [markerFront, markerBack];
      entry.markerGlow = markerGlow;
    }

    this.syncEntryMarkerIcon(entry, hotspot);
    entry.markerBaseSize = 0.7 * resolveScale(hotspot.scale, hotspot.reference_depth);
    entry.marker.position.copy(entry.anchorPosition);
    entry.marker.userData.hotspotId = hotspot.id;
    entry.marker.userData.hotspotRole = "marker";
    for (const surface of entry.markerSurfaces) {
      surface.userData.hotspotId = hotspot.id;
      surface.userData.hotspotRole = "marker";
    }
    entry.markerConfig = {
      billboard: hotspot.billboard !== false,
      baseQuaternion: quaternionFromRotation(hotspot.rotation),
      offsetQuaternion: new THREE.Quaternion()
    };
  }

  syncEntryMarkerIcon(entry, hotspot) {
    const iconSrc = getHotspotMarkerIconSrc(hotspot);
    if (entry.markerIconSrc === iconSrc) {
      return;
    }

    entry.markerIconRequestToken = Symbol(iconSrc ?? "default");
    this.releaseEntryMarkerIcon(entry);

    if (!iconSrc) {
      this.setEntryMarkerTexture(entry, () => createDefaultMarkerTexture(), { shared: false });
      entry.markerIconSrc = null;
      return;
    }

    entry.markerIconSrc = iconSrc;
    this.loadMarkerIconTexture(iconSrc, entry.markerIconRequestToken)
      .then((texture) => {
        if (!entry.marker || entry.markerIconRequestToken == null || entry.markerIconSrc !== iconSrc) {
          this.releaseMarkerIconTexture(iconSrc);
          return;
        }

        this.setEntryMarkerTexture(entry, texture, { shared: true });
      })
      .catch(() => {
        if (entry.marker && entry.markerIconSrc === iconSrc) {
          this.setEntryMarkerTexture(entry, () => createDefaultMarkerTexture(), { shared: false });
        }
      });
  }

  syncEntryLabel(entry, hotspot) {
    if (!isHotspotLabelVisible(hotspot)) {
      this.removeEntryLabel(entry);
      return;
    }

    const labelText = getHotspotLabelText(hotspot);
    const linked = hotspot.type === "scene_link";
    const labelReferenceDepth = hotspot.label?.reference_depth ?? hotspot.reference_depth;

    if (!entry.label) {
      const labelTexture = createLabelTexture(labelText, linked);
      const labelMaterial = new THREE.MeshBasicMaterial({
        map: labelTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        color: IDLE_TINT.clone()
      });
      const label = new THREE.Mesh(MARKER_GEOMETRY, labelMaterial);
      const labelGlow = createLabelHighlightMesh();

      labelGlow.visible = false;
      label.add(labelGlow);
      this.group.add(label);

      entry.label = label;
      entry.labelGlow = labelGlow;
      entry.labelText = labelText;
      entry.labelLinked = linked;
    } else if (entry.labelText !== labelText || entry.labelLinked !== linked) {
      entry.label.material.map?.dispose?.();
      entry.label.material.map = createLabelTexture(labelText, linked);
      entry.label.material.needsUpdate = true;
      entry.labelText = labelText;
      entry.labelLinked = linked;
    }

    const labelSize = resolveLabelSize(
      entry.label.material.map.image.width,
      entry.label.material.map.image.height,
      hotspot.label?.scale,
      labelReferenceDepth
    );

    entry.label.position.copy(vectorFrom(getHotspotLabelWorldPosition(hotspot)));
    entry.label.userData.hotspotId = hotspot.id;
    entry.label.userData.hotspotRole = "label";
    entry.labelBaseWidth = labelSize.width;
    entry.labelBaseHeight = labelSize.height;
    entry.labelConfig = {
      billboard: hotspot.label?.billboard !== false,
      baseQuaternion: quaternionFromRotation(hotspot.rotation),
      offsetQuaternion: quaternionFromRotation(hotspot.label?.rotation_offset)
    };
  }

  removeEntryMarker(entry) {
    if (!entry?.marker) {
      return;
    }
    entry.markerIconRequestToken = null;
    this.releaseEntryMarkerIcon(entry);
    disposeMarkerObject(entry.marker);
    entry.marker = null;
    entry.markerSurfaces = [];
    entry.markerGlow = null;
    entry.markerConfig = null;
    entry.markerBaseSize = 1;
    entry.markerIconSrc = null;
  }

  async loadMarkerIconTexture(iconSrc, requestToken) {
    const normalizedSrc = this.normalizeIconSrc(iconSrc);
    if (!normalizedSrc || !this.assetCache) {
      throw new Error("Marker icon asset cache unavailable.");
    }

    const cached = this.markerIconTextureCache.get(normalizedSrc);
    if (cached) {
      cached.refCount += 1;
      return cached.texture;
    }

    const loadedAsset = await this.assetCache.loadImage(normalizedSrc, { optional: true });
    if (!loadedAsset || requestToken == null) {
      throw new Error(`Marker icon unavailable: ${normalizedSrc}`);
    }

    const existing = this.markerIconTextureCache.get(normalizedSrc);
    if (existing) {
      existing.refCount += 1;
      return existing.texture;
    }

    const texture = createMarkerTextureWithIcon(loadedAsset.image);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.markerIconTextureCache.set(normalizedSrc, {
      texture,
      refCount: 1
    });
    return texture;
  }

  releaseEntryMarkerIcon(entry) {
    if (!entry?.markerIconSrc) {
      for (const material of this.getEntryMarkerMaterials(entry)) {
        releaseMarkerMaterialMap(material);
      }
      return;
    }

    this.releaseMarkerIconTexture(entry.markerIconSrc);
    for (const material of this.getEntryMarkerMaterials(entry)) {
      material.userData.sharedMap = false;
      material.map = null;
    }
  }

  releaseMarkerIconTexture(iconSrc) {
    const normalizedSrc = this.normalizeIconSrc(iconSrc);
    if (!normalizedSrc) {
      return;
    }

    const cached = this.markerIconTextureCache.get(normalizedSrc);
    if (!cached) {
      return;
    }

    cached.refCount -= 1;
    if (cached.refCount > 0) {
      return;
    }

    cached.texture.dispose?.();
    this.markerIconTextureCache.delete(normalizedSrc);
    this.assetCache?.releaseImage?.(normalizedSrc);
  }

  clearMarkerIconTextureCache() {
    for (const [iconSrc, cached] of this.markerIconTextureCache.entries()) {
      cached.texture.dispose?.();
      this.assetCache?.releaseImage?.(iconSrc);
    }
    this.markerIconTextureCache.clear();
  }

  normalizeIconSrc(iconSrc) {
    if (!iconSrc) {
      return null;
    }
    return this.assetCache?.normalizeUrl?.(iconSrc) ?? String(iconSrc);
  }

  getEntryMarkerMaterials(entry) {
    return (entry?.markerSurfaces ?? [])
      .map((surface) => surface?.material)
      .filter(Boolean);
  }

  setEntryMarkerTexture(entry, textureOrFactory, { shared = false } = {}) {
    for (const material of this.getEntryMarkerMaterials(entry)) {
      const texture = typeof textureOrFactory === "function"
        ? textureOrFactory()
        : textureOrFactory;
      setMarkerMaterialMap(material, texture, { shared });
    }
  }

  removeEntryLabel(entry) {
    if (!entry?.label) {
      return;
    }
    disposeObjectTree(entry.label);
    entry.label = null;
    entry.labelGlow = null;
    entry.labelConfig = null;
    entry.labelBaseWidth = 1;
    entry.labelBaseHeight = 1;
    entry.labelText = null;
    entry.labelLinked = null;
  }

  disposeEntry(entry) {
    this.removeEntryMarker(entry);
    this.removeEntryLabel(entry);
  }

  syncHighlightState() {
    for (const entry of this.entries) {
      const isActive = Boolean(
        this.highlightedHotspotId &&
        entry.hotspot?.id === this.highlightedHotspotId
      );

      if (entry.marker) {
        const markerScale = isActive ? 1.16 : 1;
        entry.marker.scale.set(
          entry.markerBaseSize * markerScale,
          entry.markerBaseSize * markerScale,
          1
        );
        for (const surface of entry.markerSurfaces) {
          surface.renderOrder = isActive ? 10 : 2;
          if (surface.material?.color) {
            surface.material.color.copy(isActive ? ACTIVE_TINT : IDLE_TINT);
          }
          if ("opacity" in surface.material) {
            surface.material.opacity = isActive ? 1 : 0.96;
          }
        }
        if (entry.markerGlow) {
          entry.markerGlow.visible = isActive;
        }
      }

      if (entry.label) {
        const labelScale = isActive ? 1.06 : 1;
        entry.label.scale.set(
          entry.labelBaseWidth * labelScale,
          entry.labelBaseHeight * labelScale,
          1
        );
        entry.label.renderOrder = isActive ? 11 : 3;

        if (entry.label.material?.color) {
          entry.label.material.color.copy(isActive ? ACTIVE_TINT : IDLE_TINT);
        }
        if ("opacity" in entry.label.material) {
          entry.label.material.opacity = isActive ? 1 : 0.98;
        }
        if (entry.labelGlow) {
          entry.labelGlow.visible = isActive;
        }
      }
    }
  }
}

function orientObject(object, cameraPosition, config) {
  if (!object || !config) {
    return;
  }

  if (config.billboard) {
    object.lookAt(cameraPosition);
    object.quaternion.multiply(config.offsetQuaternion);
    return;
  }

  object.quaternion.copy(config.baseQuaternion).multiply(config.offsetQuaternion);
}

function createMarkerMaterial() {
  return new THREE.MeshBasicMaterial({
    map: createDefaultMarkerTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.FrontSide,
    color: IDLE_TINT.clone(),
    opacity: 0.96,
    userData: {
      sharedMap: false
    }
  });
}

function createDefaultMarkerTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = MARKER_TEXTURE_SIZE;
  canvas.height = MARKER_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");

  drawDefaultMarkerTextureBase(ctx, canvas.width, canvas.height);
  drawDefaultMarkerGlyph(ctx, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMarkerTextureWithIcon(iconImage) {
  const canvas = document.createElement("canvas");
  canvas.width = MARKER_TEXTURE_SIZE;
  canvas.height = MARKER_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");

  drawDefaultMarkerTextureBase(ctx, canvas.width, canvas.height);
  drawMarkerIconOverlay(ctx, iconImage, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawDefaultMarkerTextureBase(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.arc(centerX, centerY, MARKER_OUTER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = createMarkerOuterGradient(ctx, centerX, centerY);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(centerX, centerY, MARKER_OUTER_RADIUS, 0, Math.PI * 2);
  ctx.lineWidth = MARKER_BORDER_WIDTH;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.stroke();
}

function drawDefaultMarkerGlyph(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.beginPath();
  ctx.arc(centerX, centerY, MARKER_GLYPH_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = createMarkerGlyphGradient(ctx, centerX, centerY);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(centerX, centerY, MARKER_GLYPH_RADIUS * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = "#0b2b33";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(centerX, centerY, MARKER_GLYPH_RADIUS, 0, Math.PI * 2);
  ctx.lineWidth = MARKER_GLYPH_BORDER_WIDTH;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
  ctx.stroke();
}

function drawMarkerIconOverlay(ctx, iconImage, width, height) {
  const sourceWidth = Number(iconImage?.width ?? iconImage?.videoWidth ?? 0);
  const sourceHeight = Number(iconImage?.height ?? iconImage?.videoHeight ?? 0);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const targetBoxSize = Math.max(1, Math.min(width, height) - MARKER_ICON_INSET * 2 - MARKER_BORDER_WIDTH * 2);
  const fit = Math.min(targetBoxSize / sourceWidth, targetBoxSize / sourceHeight);
  const drawWidth = sourceWidth * fit;
  const drawHeight = sourceHeight * fit;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;

  if (isImageBitmapSource(iconImage)) {
    ctx.save();
    ctx.translate(0, height);
    ctx.scale(1, -1);
    ctx.drawImage(iconImage, drawX, height - drawY - drawHeight, drawWidth, drawHeight);
    ctx.restore();
    return;
  }

  ctx.drawImage(iconImage, drawX, drawY, drawWidth, drawHeight);
}

function createMarkerOuterGradient(ctx, centerX, centerY) {
  const gradient = ctx.createLinearGradient(
    centerX - MARKER_OUTER_RADIUS,
    centerY - MARKER_OUTER_RADIUS,
    centerX + MARKER_OUTER_RADIUS,
    centerY + MARKER_OUTER_RADIUS
  );
  gradient.addColorStop(0, "#fff5c8");
  gradient.addColorStop(1, "#f0a85d");
  return gradient;
}

function createMarkerGlyphGradient(ctx, centerX, centerY) {
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, MARKER_GLYPH_RADIUS);
  gradient.addColorStop(0, "#fff7d6");
  gradient.addColorStop(0.52, "#fff7d6");
  gradient.addColorStop(0.53, "#f0a85d");
  gradient.addColorStop(1, "#f0a85d");
  return gradient;
}

function isImageBitmapSource(image) {
  return typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap;
}

function createMarkerHighlightMesh() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(128, 128, 22, 128, 128, 118);
  gradient.addColorStop(0, "rgba(240, 168, 93, 0.35)");
  gradient.addColorStop(0.55, "rgba(240, 168, 93, 0.18)");
  gradient.addColorStop(1, "rgba(240, 168, 93, 0)");

  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.lineWidth = 16;
  ctx.strokeStyle = "rgba(255, 226, 169, 0.85)";
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    opacity: 1
  });

  const mesh = new THREE.Mesh(MARKER_GEOMETRY, material);
  mesh.scale.set(1.7, 1.7, 1);
  mesh.position.z = -0.001;
  mesh.renderOrder = 1;
  return mesh;
}

function createLabelTexture(text, linked) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 44;

  ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
  const paddingX = 40;
  const paddingY = 24;
  const metrics = ctx.measureText(text);

  canvas.width = Math.max(256, Math.ceil(metrics.width + paddingX * 2));
  canvas.height = fontSize + paddingY * 2;

  ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  roundRect(ctx, 0, 0, canvas.width, canvas.height, canvas.height / 2);
  ctx.fillStyle = linked ? "#f0a85d" : "rgba(9, 25, 30, 0.88)";
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = linked ? "rgba(255, 255, 255, 0.92)" : "rgba(255, 255, 255, 0.22)";
  ctx.stroke();

  ctx.fillStyle = linked ? "#0b2b33" : "#f6f0e6";
  ctx.textBaseline = "middle";
  ctx.fillText(text, paddingX, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelHighlightMesh() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, canvas.height / 2 - 8);
  ctx.fillStyle = "rgba(240, 168, 93, 0.22)";
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255, 231, 184, 0.95)";
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    opacity: 1
  });

  const mesh = new THREE.Mesh(MARKER_GEOMETRY, material);
  mesh.scale.set(1.12, 1.14, 1);
  mesh.position.z = -0.001;
  mesh.renderOrder = 2;
  return mesh;
}

function resolveLabelSize(width, height, scale, referenceDepth) {
  const baseHeight = 0.55 * resolveScale(scale, referenceDepth);
  const ratio = width / Math.max(1, height);
  return {
    width: baseHeight * ratio,
    height: baseHeight
  };
}

function resolveScale(scale, referenceDepth) {
  const safeScale = Math.max(0.001, Number(scale ?? 1) || 1);
  const safeDepth = Math.max(0.001, Number(referenceDepth ?? 8) || 8);
  return safeScale * (safeDepth / 8);
}

function quaternionFromRotation(rotation) {
  const yaw = THREE.MathUtils.degToRad(Number(rotation?.yaw ?? 0));
  const pitch = THREE.MathUtils.degToRad(Number(rotation?.pitch ?? 0));
  const roll = THREE.MathUtils.degToRad(Number(rotation?.roll ?? 0));

  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);

  return qRoll.multiply(qPitch).multiply(qYaw);
}

function vectorFrom(position) {
  return new THREE.Vector3(
    Number(position?.x ?? 0),
    Number(position?.y ?? 0),
    Number(position?.z ?? -8)
  );
}

function disposeObjectTree(object) {
  if (!object) {
    return;
  }

  object.traverse?.((child) => {
    if (child.material) {
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material?.map?.dispose?.();
          material?.dispose?.();
        }
      } else {
        child.material?.map?.dispose?.();
        child.material?.dispose?.();
      }
    }
  });

  object.removeFromParent();
}

function disposeMarkerObject(object) {
  if (!object) {
    return;
  }

  object.traverse?.((child) => {
    if (child.material) {
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          releaseMarkerMaterialMap(material);
          material?.dispose?.();
        }
      } else {
        releaseMarkerMaterialMap(child.material);
        child.material?.dispose?.();
      }
    }
  });

  object.removeFromParent();
}

function setMarkerMaterialMap(material, texture, { shared = false } = {}) {
  if (!material) {
    return;
  }

  releaseMarkerMaterialMap(material);
  material.map = texture;
  material.userData = {
    ...material.userData,
    sharedMap: shared
  };
  material.needsUpdate = true;
}

function releaseMarkerMaterialMap(material) {
  if (!material?.map) {
    return;
  }

  if (material.userData?.sharedMap !== true) {
    material.map.dispose?.();
  }
  material.map = null;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
