const DEFAULT_BUFFER_LIMIT = 600;
const DEFAULT_RECENT_EVENT_LIMIT = 80;
const AGGREGATED_EVENTS = new Set([
  "xr-frame",
  "xr-render-frame",
  "loading-ui-frame-sync"
]);
const HIGH_SIGNAL_EVENTS = new Set([
  "app-start",
  "app-error",
  "hotspot-activate",
  "navigation-request",
  "navigation-scene-loaded",
  "navigation-render-start",
  "navigation-render-complete",
  "scene-transition-begin",
  "scene-transition-placeholder-flush-skipped",
  "loading-start",
  "image-load-start",
  "image-load-complete",
  "image-decode-mode",
  "texture-create",
  "texture-apply",
  "texture-ready",
  "scene-presented",
  "scene-missing-texture",
  "scene-superseded",
  "scene-cleared",
  "scene-presentation-wait-start",
  "scene-presentation-wait-complete",
  "loading-ui-show",
  "loading-ui-hide",
  "loading-ui-still-visible-after-scene-presented",
  "xr-session-start",
  "xr-session-end",
  "xr-visibility-change",
  "window-focus",
  "window-blur",
  "document-visibility-change"
]);

export class XrDebugTimeline {
  constructor({ enabled = false, bufferLimit = DEFAULT_BUFFER_LIMIT, contextProvider = null } = {}) {
    this.enabled = enabled === true;
    this.bufferLimit = Math.max(100, Number(bufferLimit) || DEFAULT_BUFFER_LIMIT);
    this.contextProvider = typeof contextProvider === "function" ? contextProvider : null;
    this.events = [];
    this.transitionIndex = new Map();
    this.transitionAggregates = new Map();
    this.globalAggregates = new Map();
    this.recentEvents = [];
    this.windowListenersAttached = false;
    this.handleWindowFocus = () => this.log("window-focus");
    this.handleWindowBlur = () => this.log("window-blur");
    this.handleVisibilityChange = () => {
      this.log("document-visibility-change", {
        details: {
          visibility: document.visibilityState
        }
      });
    };
  }

  isEnabled() {
    return this.enabled === true;
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    return this.enabled;
  }

  attachWindowEvents() {
    if (!this.isEnabled() || this.windowListenersAttached) {
      return;
    }

    window.addEventListener("focus", this.handleWindowFocus);
    window.addEventListener("blur", this.handleWindowBlur);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.windowListenersAttached = true;
  }

  detachWindowEvents() {
    if (!this.windowListenersAttached) {
      return;
    }

    window.removeEventListener("focus", this.handleWindowFocus);
    window.removeEventListener("blur", this.handleWindowBlur);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.windowListenersAttached = false;
  }

  log(event, payload = {}) {
    if (!this.isEnabled()) {
      return null;
    }

    const baseContext = this.contextProvider?.() ?? {};
    const details = payload.details && typeof payload.details === "object"
      ? payload.details
      : {};
    const transitionId = payload.transitionId ?? baseContext.transitionId ?? null;
    const record = {
      t: Number(performance.now().toFixed(3)),
      iso: new Date().toISOString(),
      event,
      transitionId,
      sceneId: payload.sceneId ?? baseContext.sceneId ?? null,
      src: payload.src ?? baseContext.src ?? null,
      platformId: payload.platformId ?? baseContext.platformId ?? null,
      presenting: payload.presenting ?? baseContext.presenting ?? false,
      focus: payload.focus ?? baseContext.focus ?? document.hasFocus(),
      visibility: payload.visibility ?? baseContext.visibility ?? document.visibilityState,
      overlayVisible: payload.overlayVisible ?? baseContext.overlayVisible ?? false,
      details
    };

    if (AGGREGATED_EVENTS.has(event)) {
      this.aggregateEvent(record);
      return record;
    }

    if (this.isDuplicateOfLast(record)) {
      this.aggregateDuplicate(record);
      return record;
    }

    this.events.push(record);
    if (HIGH_SIGNAL_EVENTS.has(record.event)) {
      this.recentEvents.push(record);
      if (this.recentEvents.length > DEFAULT_RECENT_EVENT_LIMIT) {
        this.recentEvents.shift();
      }
    }
    if (transitionId) {
      if (!this.transitionIndex.has(transitionId)) {
        this.transitionIndex.set(transitionId, []);
      }
      this.transitionIndex.get(transitionId).push(record);
    }
    this.trim();
    return record;
  }

  clear() {
    this.events.length = 0;
    this.transitionIndex.clear();
    this.transitionAggregates.clear();
    this.globalAggregates.clear();
    this.recentEvents.length = 0;
  }

  dump() {
    return {
      generatedAt: new Date().toISOString(),
      eventCount: this.events.length,
      recentEventCount: this.recentEvents.length,
      recentEvents: this.recentEvents.map((event) => ({ ...event })),
      globalAggregates: serializeAggregateMap(this.globalAggregates),
      transitions: this.getTransitionSummaries()
    };
  }

  dumpVerbose() {
    return {
      ...this.dump(),
      events: this.events.map((event) => ({ ...event })),
      transitionReports: Array.from(this.transitionIndex.keys())
        .map((transitionId) => this.getTransitionReport(transitionId))
        .filter(Boolean)
    };
  }

  lastTransition() {
    const lastEventWithTransition = [...this.events].reverse().find((event) => Boolean(event.transitionId));
    if (!lastEventWithTransition?.transitionId) {
      return null;
    }

    return this.getTransitionReport(lastEventWithTransition.transitionId);
  }

  getTransitionReport(transitionId) {
    const events = (this.transitionIndex.get(transitionId) ?? []).map((event) => ({ ...event }));
    if (events.length === 0) {
      return null;
    }

    const first = events[0];
    const last = events[events.length - 1];
    const seen = new Set(events.map((event) => event.event));
    const sawPresented = seen.has("scene-presented");
    const sawHide = seen.has("loading-ui-hide");

    return {
      transitionId,
      sceneId: last.sceneId ?? first.sceneId ?? null,
      src: last.src ?? first.src ?? null,
      startedAt: first.iso,
      endedAt: last.iso,
      durationMs: Number((last.t - first.t).toFixed(3)),
      eventCount: events.length,
      events,
      aggregates: serializeAggregate(this.transitionAggregates.get(transitionId)),
      summary: {
        order: events.map((event) => event.event),
        lastEvent: last.event,
        finalOverlayVisible: last.overlayVisible,
        sawScenePresented: sawPresented,
        sawLoadingHide: sawHide,
        scenePresentedWithoutHide: sawPresented && !sawHide,
        hideWithoutScenePresented: sawHide && !sawPresented,
        sawFocusRecovery: seen.has("window-focus") || seen.has("document-visibility-change")
      }
    };
  }

  getTransitionSummaries() {
    return Array.from(this.transitionIndex.keys()).map((transitionId) => {
      const report = this.getTransitionReport(transitionId);
      return report
        ? {
            transitionId: report.transitionId,
            sceneId: report.sceneId,
            durationMs: report.durationMs,
            eventCount: report.eventCount,
            lastEvent: report.summary.lastEvent,
            finalOverlayVisible: report.summary.finalOverlayVisible,
            sawScenePresented: report.summary.sawScenePresented,
            sawLoadingHide: report.summary.sawLoadingHide,
            aggregates: report.aggregates
          }
        : null;
    }).filter(Boolean);
  }

  aggregateEvent(record) {
    this.updateAggregateBucket(this.globalAggregates, "global", record);
    if (record.transitionId) {
      this.updateAggregateBucket(this.transitionAggregates, record.transitionId, record);
    }
  }

  updateAggregateBucket(container, key, record) {
    if (!container.has(key)) {
      container.set(key, createAggregateBucket());
    }

    const bucket = container.get(key);
    const eventBucket = bucket[record.event] ?? createAggregateEventBucket(record);
    eventBucket.count += 1;
    eventBucket.lastAt = record.iso;
    eventBucket.lastT = record.t;
    eventBucket.lastOverlayVisible = record.overlayVisible;
    eventBucket.lastDetails = record.details;
    if (!eventBucket.firstAt) {
      eventBucket.firstAt = record.iso;
      eventBucket.firstT = record.t;
      eventBucket.firstDetails = record.details;
    }
    bucket[record.event] = eventBucket;
  }

  isDuplicateOfLast(record) {
    const last = this.events[this.events.length - 1];
    if (!last) {
      return false;
    }

    return last.event === record.event
      && last.transitionId === record.transitionId
      && last.sceneId === record.sceneId
      && last.src === record.src
      && last.overlayVisible === record.overlayVisible
      && JSON.stringify(last.details ?? {}) === JSON.stringify(record.details ?? {});
  }

  aggregateDuplicate(record) {
    this.updateAggregateBucket(this.globalAggregates, "global", {
      ...record,
      event: `${record.event}:duplicate`
    });
    if (record.transitionId) {
      this.updateAggregateBucket(this.transitionAggregates, record.transitionId, {
        ...record,
        event: `${record.event}:duplicate`
      });
    }
  }

  trim() {
    while (this.events.length > this.bufferLimit) {
      const removed = this.events.shift();
      if (!removed?.transitionId) {
        continue;
      }

      const bucket = this.transitionIndex.get(removed.transitionId);
      if (!bucket) {
        continue;
      }

      const nextBucket = bucket.filter((event) => event !== removed);
      if (nextBucket.length === 0) {
        this.transitionIndex.delete(removed.transitionId);
      } else {
        this.transitionIndex.set(removed.transitionId, nextBucket);
      }
    }
  }
}

function createAggregateBucket() {
  return Object.create(null);
}

function createAggregateEventBucket(record) {
  return {
    count: 0,
    firstAt: record.iso,
    firstT: record.t,
    lastAt: record.iso,
    lastT: record.t,
    firstDetails: record.details,
    lastDetails: record.details,
    lastOverlayVisible: record.overlayVisible
  };
}

function serializeAggregateMap(map) {
  return Array.from(map.entries())
    .filter(([key]) => key === "global")
    .map(([, value]) => serializeAggregate(value))[0] ?? {};
}

function serializeAggregate(aggregate) {
  if (!aggregate) {
    return {};
  }

  const output = {};
  for (const [eventName, bucket] of Object.entries(aggregate)) {
    output[eventName] = {
      count: bucket.count,
      firstAt: bucket.firstAt,
      lastAt: bucket.lastAt,
      lastOverlayVisible: bucket.lastOverlayVisible,
      firstDetails: bucket.firstDetails,
      lastDetails: bucket.lastDetails
    };
  }
  return output;
}
