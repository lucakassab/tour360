import { TwoDHotspotRenderer } from "./TwoDHotspotRenderer.js";
import { TwoDInputController } from "./TwoDInputController.js";
import { TwoDRenderer } from "./TwoDRenderer.js";

export class TwoDSceneController {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
    this.renderToken = 0;
    this.destroyed = false;
  }

  mount() {
    this.destroyed = false;
    this.renderer = new TwoDRenderer({
      root: this.root,
      cfgProvider: () => this.context.store.getSnapshot().cfg,
      assetCache: this.context.assetCache,
      context: this.context
    });
    this.hotspotRenderer = new TwoDHotspotRenderer({
      root: this.renderer.hotspotLayer,
      context: this.context,
      project: (position) => this.renderer.projectWorldToScreen(position)
    });
    this.inputController = new TwoDInputController({
      target: this.renderer.stage,
      renderer: this.renderer,
      inputProfile: this.context.getInputProfile()
    });
    this.renderer.onViewChange(() => this.hotspotRenderer.updateProjection());
    this.inputController.attach();
  }

  async render(state, options = {}) {
    if (!state.currentScene) {
      return;
    }
    const renderToken = ++this.renderToken;
    let renderCompleted = false;

    this.renderer.setInteractionLocked(true);
    this.hotspotRenderer.setInteractionLocked(true);

    try {
      const sceneTransition = await this.renderer.showScene(state.currentScene, state.currentTour, options);
      if (!this.isRenderActive(renderToken)) {
        return sceneTransition;
      }
      await this.renderer.waitForScenePresentation(sceneTransition?.transitionId);
      if (!this.isRenderActive(renderToken)) {
        return sceneTransition;
      }
      this.renderer.compactSceneResources(state.currentScene);
      if (!this.isRenderActive(renderToken)) {
        return sceneTransition;
      }
      this.hotspotRenderer.render(state.currentScene);
      this.hotspotRenderer.updateProjection();
      await waitForUiCommit();
      if (!this.isRenderActive(renderToken)) {
        return sceneTransition;
      }
      await this.renderer.completeSceneTransitionVisual();
      if (!this.isRenderActive(renderToken)) {
        return sceneTransition;
      }
      renderCompleted = true;
      return sceneTransition;
    } finally {
      if (!renderCompleted) {
        this.renderer.cancelSceneTransitionVisual();
      }
      if (this.isRenderActive(renderToken)) {
        this.hotspotRenderer.setInteractionLocked(false);
        this.renderer.setInteractionLocked(false);
      }
    }
  }

  isRenderActive(renderToken) {
    return this.destroyed !== true && renderToken === this.renderToken;
  }

  screenToWorldFromEvent(event, options) {
    return this.renderer?.screenToWorldFromEvent(event, options) ?? null;
  }

  destroy() {
    this.destroyed = true;
    this.renderToken += 1;
    this.inputController?.destroy();
    this.hotspotRenderer?.destroy();
    this.renderer?.destroy();
  }
}

function waitForUiCommit() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
