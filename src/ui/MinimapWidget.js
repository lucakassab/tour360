const MIN_SCALE = 1;
const MAX_SCALE = 4;
const WHEEL_SCALE_STEP = 0.0015;
const MIN_VISIBLE_RATIO = 0.2;

export class MinimapWidget {
  constructor({ root }) {
    this.root = root;
    this.currentSceneId = null;
    this.currentImageSrc = null;
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.pointers = new Map();
    this.dragState = null;
    this.pinchState = null;

    this.widget = null;
    this.sceneLabel = null;
    this.image = null;
    this.viewport = null;
    this.surface = null;
  }

  render(state) {
    if (!this.root) {
      return;
    }

    const enabled = state.cfg?.features?.minimap_widget === true;
    const scene = state.currentScene;
    const minimapImage = scene?.minimap_image;

    if (!enabled || !minimapImage) {
      this.teardown();
      return;
    }

    this.ensureDom();

    this.widget.title = "Visualizacao auxiliar do minimapa da cena atual.";
    this.sceneLabel.textContent = scene.title ?? scene.id;
    this.image.alt = `${scene.title ?? scene.id} minimap`;
    this.image.title = `Minimapa da cena ${scene.title ?? scene.id}.`;

    const sceneChanged = this.currentSceneId !== scene.id || this.currentImageSrc !== minimapImage;
    if (sceneChanged) {
      this.currentSceneId = scene.id ?? null;
      this.currentImageSrc = minimapImage;
      this.resetView();
      this.image.src = minimapImage;
    }

    this.root.replaceChildren(this.widget);
    this.applyTransform();
  }

  ensureDom() {
    if (this.widget) {
      return;
    }

    const widget = document.createElement("article");
    widget.id = "minimap_widget";
    widget.setAttribute("aria-label", "Minimapa da cena");

    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = "Minimapa";
    title.title = "Resumo visual da cena atual no minimapa.";

    const sceneLabel = document.createElement("span");
    sceneLabel.className = "eyebrow";
    header.append(title, sceneLabel);

    const viewport = document.createElement("div");
    viewport.className = "minimap-widget__viewport";
    viewport.title = "Use o scroll ou pinca para zoom. Arraste para mover a planta.";

    const surface = document.createElement("div");
    surface.className = "minimap-widget__surface";

    const image = document.createElement("img");
    image.className = "minimap-widget__image";
    image.loading = "lazy";
    image.draggable = false;
    image.onerror = () => this.teardown();
    image.onload = () => {
      this.clampTransform();
      this.applyTransform();
    };

    surface.append(image);
    viewport.append(surface);
    widget.append(header, viewport);

    viewport.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
    viewport.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    viewport.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    viewport.addEventListener("pointerup", (event) => this.handlePointerEnd(event));
    viewport.addEventListener("pointercancel", (event) => this.handlePointerEnd(event));
    viewport.addEventListener("pointerleave", (event) => this.handlePointerEnd(event));

    this.widget = widget;
    this.sceneLabel = sceneLabel;
    this.viewport = viewport;
    this.surface = surface;
    this.image = image;
  }

  teardown() {
    this.root?.replaceChildren();
    this.currentSceneId = null;
    this.currentImageSrc = null;
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.pointers.clear();
    this.dragState = null;
    this.pinchState = null;
    this.widget = null;
    this.sceneLabel = null;
    this.viewport = null;
    this.surface = null;
    this.image = null;
  }

  resetView() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.dragState = null;
    this.pinchState = null;
    this.pointers.clear();
  }

  handleWheel(event) {
    if (!this.viewport || !this.image) {
      return;
    }

    event.preventDefault();

    const rect = this.viewport.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const multiplier = Math.exp(-event.deltaY * WHEEL_SCALE_STEP);
    this.zoomTo(this.scale * multiplier, { anchorX, anchorY });
  }

  handlePointerDown(event) {
    if (!this.viewport) {
      return;
    }

    this.viewport.setPointerCapture?.(event.pointerId);
    this.viewport.classList.add("is-interacting");
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 1) {
      this.dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseTranslateX: this.translateX,
        baseTranslateY: this.translateY
      };
      this.pinchState = null;
      return;
    }

    if (this.pointers.size === 2) {
      this.dragState = null;
      this.pinchState = this.createPinchState();
    }
  }

  handlePointerMove(event) {
    if (!this.viewport || !this.image || !this.pointers.has(event.pointerId)) {
      return;
    }

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 2) {
      const pinch = this.createPinchState();
      if (!pinch) {
        return;
      }
      if (!this.pinchState) {
        this.pinchState = pinch;
        return;
      }

      const nextScale = this.pinchState.baseScale * (pinch.distance / this.pinchState.distance);
      this.scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);

      const scaleRatio = this.scale / this.pinchState.baseScale;
      this.translateX = pinch.centerX - ((this.pinchState.baseCenterX - this.pinchState.baseTranslateX) * scaleRatio);
      this.translateY = pinch.centerY - ((this.pinchState.baseCenterY - this.pinchState.baseTranslateY) * scaleRatio);
      this.clampTransform();
      this.applyTransform();
      return;
    }

    if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
      return;
    }

    this.translateX = this.dragState.baseTranslateX + (event.clientX - this.dragState.startX);
    this.translateY = this.dragState.baseTranslateY + (event.clientY - this.dragState.startY);
    this.clampTransform();
    this.applyTransform();
  }

  handlePointerEnd(event) {
    this.pointers.delete(event.pointerId);
    this.viewport?.releasePointerCapture?.(event.pointerId);

    if (this.pointers.size === 0) {
      this.dragState = null;
      this.pinchState = null;
      this.viewport?.classList.remove("is-interacting");
      return;
    }

    if (this.pointers.size === 1) {
      const [remainingPointerId, remaining] = this.pointers.entries().next().value;
      this.dragState = {
        pointerId: remainingPointerId,
        startX: remaining.x,
        startY: remaining.y,
        baseTranslateX: this.translateX,
        baseTranslateY: this.translateY
      };
      this.pinchState = null;
    }
  }

  createPinchState() {
    if (this.pointers.size < 2 || !this.viewport) {
      return null;
    }

    const [first, second] = Array.from(this.pointers.values());
    const rect = this.viewport.getBoundingClientRect();
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const centerX = ((first.x + second.x) / 2) - rect.left;
    const centerY = ((first.y + second.y) / 2) - rect.top;

    return {
      distance,
      centerX,
      centerY,
      baseScale: this.scale,
      baseTranslateX: this.translateX,
      baseTranslateY: this.translateY,
      baseCenterX: centerX,
      baseCenterY: centerY
    };
  }

  zoomTo(nextScale, { anchorX, anchorY }) {
    const clampedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const scaleRatio = clampedScale / this.scale;
    this.scale = clampedScale;
    this.translateX = anchorX - ((anchorX - this.translateX) * scaleRatio);
    this.translateY = anchorY - ((anchorY - this.translateY) * scaleRatio);
    this.clampTransform();
    this.applyTransform();
  }

  clampTransform() {
    if (!this.viewport || !this.image) {
      return;
    }

    const viewportWidth = this.viewport.clientWidth;
    const viewportHeight = this.viewport.clientHeight;
    const imageWidth = (this.image.naturalWidth || viewportWidth) * this.getBaseFitScale(viewportWidth, viewportHeight);
    const imageHeight = (this.image.naturalHeight || viewportHeight) * this.getBaseFitScale(viewportWidth, viewportHeight);
    const scaledWidth = imageWidth * this.scale;
    const scaledHeight = imageHeight * this.scale;

    const minVisibleX = Math.min(viewportWidth * MIN_VISIBLE_RATIO, scaledWidth * 0.5);
    const minVisibleY = Math.min(viewportHeight * MIN_VISIBLE_RATIO, scaledHeight * 0.5);

    const minTranslateX = minVisibleX - scaledWidth;
    const maxTranslateX = viewportWidth - minVisibleX;
    const minTranslateY = minVisibleY - scaledHeight;
    const maxTranslateY = viewportHeight - minVisibleY;

    this.translateX = clamp(this.translateX, minTranslateX, maxTranslateX);
    this.translateY = clamp(this.translateY, minTranslateY, maxTranslateY);
  }

  applyTransform() {
    if (!this.surface || !this.image || !this.viewport) {
      return;
    }

    const viewportWidth = this.viewport.clientWidth;
    const viewportHeight = this.viewport.clientHeight;
    const baseFitScale = this.getBaseFitScale(viewportWidth, viewportHeight);
    const baseWidth = (this.image.naturalWidth || viewportWidth) * baseFitScale;
    const baseHeight = (this.image.naturalHeight || viewportHeight) * baseFitScale;

    this.surface.style.width = `${baseWidth}px`;
    this.surface.style.height = `${baseHeight}px`;
    this.surface.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  getBaseFitScale(viewportWidth, viewportHeight) {
    if (!this.image?.naturalWidth || !this.image?.naturalHeight) {
      return 1;
    }
    return Math.min(
      viewportWidth / this.image.naturalWidth,
      viewportHeight / this.image.naturalHeight
    );
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
