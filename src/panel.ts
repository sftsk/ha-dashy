import { ChartSampler, buildSeriesPath, paddedRange } from "./chart";
import { panelConfigToDashboardConfig } from "./config";
import { iconSvg } from "./icons";
import {
  browseSonosFavoriteArtwork,
  getMediaDisplayMode,
  MediaActivityTracker,
  parseSonosFavorites,
  resolveSonosPlaylistName,
  sonosArtworkLookupKey,
  sonosFavoriteButton,
} from "./media";
import {
  callConfiguredService,
  mediaService,
  serviceForToggleEntity,
} from "./services";
import type {
  ClimateConfig,
  ControlConfig,
  DashboardBadgeConfig,
  DashboardConfig,
  HassEntity,
  HassLike,
  PanelInfo,
  PlaylistButtonConfig,
  SceneTileConfig,
  ServiceCall,
} from "./types";

const CHART_WIDTH = 620;
const CHART_HEIGHT = 96;
const MAX_IDLE_PLAYLIST_CARDS = 5;
const TIMED_CLIMATE_ACTIONS = ["sleep", "cleanAir"] as const;

type OptimisticMediaStart = {
  title: string;
  contentId?: string;
  loading: boolean;
  version: number;
};

type TimedClimateAction = (typeof TIMED_CLIMATE_ACTIONS)[number];

export class DashyDashboardPanel extends HTMLElement {
  private readonly view: ShadowRoot;
  private readonly mediaTracker = new MediaActivityTracker();
  private readonly optimisticStates = new Map<string, string>();
  private readonly optimisticVersions = new Map<string, number>();
  private readonly optimisticMediaStarts = new Map<
    string,
    OptimisticMediaStart
  >();
  private config: DashboardConfig = panelConfigToDashboardConfig(undefined);
  private sampler = new ChartSampler(this.config.environment.maxSamples);
  private clockTimer: number | undefined;
  private mediaProgressTimer: number | undefined;
  private toastTimer: number | undefined;
  private optimisticVersion = 0;
  private isFavoritesMenuOpen = false;
  private currentHass: HassLike | undefined;
  private currentPanel: PanelInfo | undefined;
  private readonly sonosArtwork = new Map<string, string>();
  private sonosArtworkRequestKey = "";
  private sonosArtworkRequestVersion = 0;
  private activeTimedClimateAction:
    | {
        action: TimedClimateAction;
        startedAt: number;
      }
    | undefined;
  private pageOverflow:
    | {
        body: string;
        documentElement: string;
      }
    | undefined;

  constructor() {
    super();
    this.view = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    this.lockPageOverflow();
    this.renderShell();
    this.view.addEventListener("click", this.handleClick);
    this.updateClock();
    this.clockTimer = window.setInterval(() => this.updateClock(), 15_000);
    this.mediaProgressTimer = window.setInterval(() => {
      this.updateMediaProgress();
      this.updateClimateProgress();
    }, 1_000);
    this.updateAll();
    void this.refreshSonosArtwork();
  }

  disconnectedCallback(): void {
    this.view.removeEventListener("click", this.handleClick);
    if (this.clockTimer !== undefined) {
      window.clearInterval(this.clockTimer);
    }
    if (this.mediaProgressTimer !== undefined) {
      window.clearInterval(this.mediaProgressTimer);
    }
    if (this.toastTimer !== undefined) {
      window.clearTimeout(this.toastTimer);
    }
    this.restorePageOverflow();
  }

  set hass(value: HassLike | undefined) {
    this.currentHass = value;
    this.reconcileOptimisticStates(value);
    this.sampleEnvironment();
    this.mediaTracker.update(this.config.media.players, value);
    this.updateAll();
    void this.refreshSonosArtwork();
  }

  get hass(): HassLike | undefined {
    return this.currentHass;
  }

  set panel(value: PanelInfo | undefined) {
    this.currentPanel = value;
    this.config = panelConfigToDashboardConfig(value?.config);
    this.sampler = new ChartSampler(this.config.environment.maxSamples);
    this.updateAll();
    void this.refreshSonosArtwork();
  }

  get panel(): PanelInfo | undefined {
    return this.currentPanel;
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>(
      "button[data-dashy-action]",
    );
    if (!button) {
      if (this.isFavoritesMenuOpen) {
        this.isFavoritesMenuOpen = false;
        this.updateMedia();
      }
      return;
    }

    void this.routeAction(button);
  };

  private lockPageOverflow(): void {
    if (this.pageOverflow) {
      return;
    }

    this.pageOverflow = {
      body: document.body.style.overflow,
      documentElement: document.documentElement.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  private restorePageOverflow(): void {
    if (!this.pageOverflow) {
      return;
    }

    document.documentElement.style.overflow = this.pageOverflow.documentElement;
    document.body.style.overflow = this.pageOverflow.body;
    this.pageOverflow = undefined;
  }

  private async routeAction(button: HTMLButtonElement): Promise<void> {
    const action = button.dataset.dashyAction;
    const index = Number(button.dataset.index);

    if (action === "scene") {
      await this.callScene(this.config.sceneTiles[index]);
      return;
    }

    if (action === "badge") {
      this.openMoreInfo(button.dataset.entity);
      return;
    }

    if (action?.startsWith("control-")) {
      await this.callControl(
        this.config.controls[index],
        action.replace("control-", ""),
      );
      return;
    }

    if (action?.startsWith("climate-")) {
      await this.callClimate(action.replace("climate-", ""));
      return;
    }

    if (action === "media-favorites-menu") {
      this.isFavoritesMenuOpen = !this.isFavoritesMenuOpen;
      this.updateMedia();
      return;
    }

    if (action === "sonos-favorite") {
      this.isFavoritesMenuOpen = false;
      this.updateMedia();
      await this.callSonosFavorite(index);
      return;
    }

    if (action?.startsWith("media-")) {
      await this.callMedia(action.replace("media-", ""));
      return;
    }

    if (action === "playlist") {
      const mode = getMediaDisplayMode(
        this.config.media,
        this.mediaTracker,
        this.effectiveHass(),
      );
      await this.callServiceWithOptimism(
        mode.kind === "idle" ? mode.buttons[index]?.service : undefined,
      );
    }
  }

  private async callScene(tile: SceneTileConfig | undefined): Promise<void> {
    if (!tile) {
      return;
    }

    await this.callServiceWithOptimism(
      tile.service ??
        (tile.entity ? serviceForToggleEntity(tile.entity) : undefined),
      tile.entity,
    );
  }

  private async callControl(
    control: ControlConfig | undefined,
    action: string,
  ): Promise<void> {
    if (!control) {
      return;
    }

    const serviceCall =
      control.actions[action as keyof ControlConfig["actions"]] ??
      (action === "toggle"
        ? serviceForToggleEntity(control.entity)
        : undefined);
    await this.callServiceWithOptimism(serviceCall, control.entity);
  }

  private async callClimate(action: string): Promise<void> {
    const climate = this.config.climate;
    if (!climate) {
      return;
    }

    if (action === "cool") {
      if (this.isClimateCooling(climate)) {
        this.activeTimedClimateAction = undefined;
        await this.callClimateService(climate.actions.off, climate);
        return;
      }

      await this.stopOtherTimedClimateScripts(climate);
      this.activeTimedClimateAction = undefined;
      await this.callClimateService(climate.actions.cool, climate);
      return;
    }

    if (isTimedClimateAction(action)) {
      if (this.isTimedClimateActionActive(climate, action)) {
        this.activeTimedClimateAction = undefined;
        await this.stopClimateScript(action, climate);
        await this.stopClimateStateEntity(action, climate);
        await this.callClimateService(climate.actions.off, climate);
        return;
      }

      await this.stopOtherTimedClimateScripts(climate, action);
      this.activeTimedClimateAction = {
        action,
        startedAt: Date.now(),
      };
      await this.callClimateService(climate.actions[action], climate);
      return;
    }

    const serviceCall = climate.actions[action as keyof ClimateConfig["actions"]];
    await this.callClimateService(serviceCall, climate);
  }

  private async callClimateService(
    serviceCall: ServiceCall | undefined,
    climate: ClimateConfig,
  ): Promise<void> {
    await this.callServiceWithOptimism(
      serviceCall,
      serviceCall?.domain === "climate" ? climate.entity : undefined,
    );
  }

  private async stopClimateScript(
    action: TimedClimateAction,
    climate: ClimateConfig,
  ): Promise<void> {
    const entityId = scriptEntityId(climate.actions[action]);
    if (!entityId) {
      return;
    }

    await this.callServiceWithOptimism(
      {
        domain: "script",
        service: "turn_off",
        data: { entity_id: entityId },
      },
      entityId,
    );
  }

  private async stopOtherTimedClimateScripts(
    climate: ClimateConfig,
    except?: TimedClimateAction,
  ): Promise<void> {
    for (const action of TIMED_CLIMATE_ACTIONS) {
      if (action !== except && this.isTimedClimateActionActive(climate, action)) {
        await this.stopClimateScript(action, climate);
        await this.stopClimateStateEntity(action, climate);
      }
    }

    if (this.activeTimedClimateAction?.action !== except) {
      this.activeTimedClimateAction = undefined;
    }
  }

  private async stopClimateStateEntity(
    action: TimedClimateAction,
    climate: ClimateConfig,
  ): Promise<void> {
    const entityId = stateEntityId(climate.actions[action]);
    if (!entityId || this.entity(entityId)?.state !== "on") {
      return;
    }

    await this.callServiceWithOptimism(
      serviceForToggleEntityOff(entityId),
      entityId,
    );
  }

  private async callMedia(action: string): Promise<void> {
    const hass = this.effectiveHass();
    const mode = getMediaDisplayMode(
      this.config.media,
      this.mediaTracker,
      hass,
    );
    if (mode.kind !== "player") {
      return;
    }

    const serviceByAction: Record<string, ServiceCall> = {
      power: mediaService(mode.player.entity, "turn_off"),
      previous: mediaService(mode.player.entity, "media_previous_track"),
      playpause: mediaService(
        mode.player.entity,
        hass?.states[mode.player.entity]?.state === "playing"
          ? "media_pause"
          : "media_play",
      ),
      next: mediaService(mode.player.entity, "media_next_track"),
      stop: mediaService(mode.player.entity, "media_stop"),
      shuffle: {
        domain: "media_player",
        service: "shuffle_set",
        data: {
          entity_id: mode.player.entity,
          shuffle: hass?.states[mode.player.entity]?.attributes.shuffle !== true,
        },
      },
    };

    await this.callServiceWithOptimism(
      serviceByAction[action],
      mode.player.entity,
    );
  }

  private async callSonosFavorite(index: number): Promise<void> {
    const sonos = this.config.media.sonos;
    if (!sonos) {
      return;
    }

    const favorite = parseSonosFavorites(
      this.currentHass,
      sonos.favoritesSensorEntity,
    )[index];
    if (!favorite) {
      return;
    }

    await this.callServiceWithOptimism(
      sonosFavoriteButton(favorite, sonos.playerEntity).service,
    );
  }

  private async callServiceWithOptimism(
    serviceCall: ServiceCall | undefined,
    preferredEntityId?: string,
  ): Promise<void> {
    if (!this.currentHass || !serviceCall) {
      return;
    }

    const entityId =
      preferredEntityId ?? stringEntityId(serviceCall.data?.entity_id);
    const mediaStart = entityId
      ? this.optimisticMediaStartForService(serviceCall)
      : undefined;
    const mediaOptimism =
      entityId && mediaStart
        ? this.applyOptimisticMediaStart(entityId, mediaStart)
        : undefined;
    const nextState = entityId
      ? this.optimisticStateForService(entityId, serviceCall)
      : undefined;
    const rollback =
      entityId && nextState
        ? this.applyOptimisticState(entityId, nextState)
        : undefined;

    try {
      await callConfiguredService(this.currentHass, serviceCall);
      if (entityId && mediaStart) {
        this.markOptimisticMediaLoaded(entityId, mediaOptimism?.version);
      }
    } catch (error) {
      mediaOptimism?.rollback();
      rollback?.();
      this.updateAll();
      this.showToast(`Action failed: ${errorMessage(error)}`);
    }
  }

  private optimisticStateForService(
    entityId: string,
    serviceCall: ServiceCall,
  ): string | undefined {
    const currentState = this.entity(entityId)?.state;
    if (!currentState) {
      return undefined;
    }

    if (serviceCall.service === "toggle") {
      return isActiveState(currentState) ? "off" : "on";
    }

    if (serviceCall.service === "turn_on") {
      return "on";
    }

    if (serviceCall.service === "turn_off") {
      return "off";
    }

    if (
      serviceCall.domain === "climate" &&
      (serviceCall.service === "set_temperature" ||
        serviceCall.service === "set_hvac_mode") &&
      typeof serviceCall.data?.hvac_mode === "string"
    ) {
      return serviceCall.data.hvac_mode;
    }

    if (serviceCall.service === "media_stop") {
      return "idle";
    }

    if (serviceCall.service === "open_cover") {
      return "open";
    }

    if (serviceCall.service === "close_cover") {
      return "closed";
    }

    if (serviceCall.service === "media_play_pause") {
      return currentState === "playing" ? "paused" : "playing";
    }

    if (serviceCall.service === "media_play") {
      return "playing";
    }

    if (serviceCall.service === "media_pause") {
      return "paused";
    }

    if (serviceCall.service === "play_media") {
      return "playing";
    }

    return undefined;
  }

  private optimisticMediaStartForService(
    serviceCall: ServiceCall,
  ):
    | (Omit<OptimisticMediaStart, "version"> & { contentId?: string })
    | undefined {
    if (
      serviceCall.domain !== "media_player" ||
      serviceCall.service !== "play_media"
    ) {
      return undefined;
    }

    const title = optimisticMediaTitle(serviceCall.data);
    if (!title) {
      return undefined;
    }

    return {
      title,
      contentId: stringEntityId(serviceCall.data?.media_content_id),
      loading: true,
    };
  }

  private applyOptimisticMediaStart(
    entityId: string,
    start: Omit<OptimisticMediaStart, "version">,
  ): { rollback: () => void; version: number } {
    const hadPrevious = this.optimisticMediaStarts.has(entityId);
    const previous = this.optimisticMediaStarts.get(entityId);
    const version = this.optimisticVersion + 1;
    this.optimisticVersion = version;
    this.optimisticMediaStarts.set(entityId, { ...start, version });

    return {
      version,
      rollback: () => {
        if (this.optimisticMediaStarts.get(entityId)?.version !== version) {
          return;
        }

        if (hadPrevious && previous) {
          this.optimisticMediaStarts.set(entityId, previous);
        } else {
          this.optimisticMediaStarts.delete(entityId);
        }
      },
    };
  }

  private markOptimisticMediaLoaded(
    entityId: string,
    version: number | undefined,
  ): void {
    if (version === undefined) {
      return;
    }

    const start = this.optimisticMediaStarts.get(entityId);
    if (!start || start.version !== version) {
      return;
    }

    this.optimisticMediaStarts.set(entityId, { ...start, loading: false });
    this.updateAll();
  }

  private applyOptimisticState(
    entityId: string,
    nextState: string,
  ): () => void {
    const hadPrevious = this.optimisticStates.has(entityId);
    const previousState = this.optimisticStates.get(entityId);
    const version = this.optimisticVersion + 1;
    this.optimisticVersion = version;
    this.optimisticStates.set(entityId, nextState);
    this.optimisticVersions.set(entityId, version);
    this.updateAll();

    return () => {
      if (this.optimisticVersions.get(entityId) !== version) {
        return;
      }

      if (hadPrevious && previousState !== undefined) {
        this.optimisticStates.set(entityId, previousState);
      } else {
        this.optimisticStates.delete(entityId);
      }
      this.optimisticVersions.delete(entityId);
    };
  }

  private reconcileOptimisticStates(hass: HassLike | undefined): void {
    if (!hass) {
      return;
    }

    for (const [entityId, state] of this.optimisticStates) {
      if (hass.states[entityId]?.state === state) {
        this.optimisticStates.delete(entityId);
        this.optimisticVersions.delete(entityId);
        this.optimisticMediaStarts.delete(entityId);
      }
    }
  }

  private showToast(message: string): void {
    const toast = this.view.querySelector<HTMLElement>(".toast");
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add("is-visible");
    if (this.toastTimer !== undefined) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 4_000);
  }

  private openMoreInfo(entityId: string | undefined): void {
    if (!entityId) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }

  private renderShell(): void {
    this.view.innerHTML = `
      <style>${styles}</style>
      <main class="dashboard" part="dashboard">
        <header class="dashboard-header">
          <div class="topbar">
            <div class="date" data-region="date"></div>
            <div class="time" data-region="time"></div>
          </div>
          <section class="badge-row" data-region="badges" aria-label="Alerts and status" hidden></section>
        </header>
        <section data-region="weather"></section>
        <section data-region="environment"></section>
        <section class="scene-grid" data-region="scenes"></section>
        <section data-region="controls"></section>
        <section data-region="media"></section>
      </main>
      <div class="toast" role="status" aria-live="polite"></div>
    `;
  }

  private updateAll(): void {
    if (!this.view.querySelector("[data-region='date']")) {
      return;
    }

    this.updateClock();
    this.updateBadges();
    this.updateWeather();
    this.updateEnvironment();
    this.updateScenes();
    this.updateControls();
    this.updateMedia();
  }

  private updateClock(): void {
    const now = new Date();
    this.setRegion("date", formatDate(now));
    this.setRegion("time", formatTime(now));
  }

  private updateBadges(): void {
    const target = this.view.querySelector<HTMLElement>(
      '[data-region="badges"]',
    );
    if (!target) {
      return;
    }

    const badges = this.config.badges.filter((badge) =>
      this.isBadgeVisible(badge),
    );
    if (badges.length === 0) {
      if (target.innerHTML !== "") {
        target.innerHTML = "";
      }
      target.hidden = true;
      return;
    }

    this.setRegion(
      "badges",
      badges.map((badge) => this.renderBadge(badge)).join(""),
    );
    target.hidden = false;
  }

  private renderBadge(badge: DashboardBadgeConfig): string {
    const state = badge.showState ? this.formatBadgeState(badge) : "";
    const ariaLabel = state ? `${badge.label} ${state}` : badge.label;

    return `<button class="badge is-${badge.tone}" data-dashy-action="badge" data-entity="${escapeHtml(
      badge.entity,
    )}" type="button" aria-label="${escapeHtml(ariaLabel)}">
      ${iconSvg(badge.icon, "badge-icon")}
      <span class="badge-label">${escapeHtml(badge.label)}</span>
      ${state ? `<span class="badge-state">${escapeHtml(state)}</span>` : ""}
    </button>`;
  }

  private isBadgeVisible(badge: DashboardBadgeConfig): boolean {
    if (!this.currentHass?.states[badge.entity]) {
      return false;
    }

    const entity = this.currentHass.states[badge.visibility.entity];
    if (!entity) {
      return false;
    }

    if (badge.visibility.condition === "state") {
      return entity.state === badge.visibility.state;
    }

    const value = Number.parseFloat(entity.state);
    if (!Number.isFinite(value)) {
      return false;
    }

    if (
      badge.visibility.above !== undefined &&
      !(value > badge.visibility.above)
    ) {
      return false;
    }

    if (
      badge.visibility.below !== undefined &&
      !(value < badge.visibility.below)
    ) {
      return false;
    }

    return true;
  }

  private formatBadgeState(badge: DashboardBadgeConfig): string {
    const entity = this.currentHass?.states[badge.entity];
    if (!entity) {
      return "";
    }

    try {
      return (
        this.currentHass?.formatEntityState?.(entity, entity.state) ??
        titleCase(entity.state.replaceAll("_", " "))
      );
    } catch {
      return titleCase(entity.state.replaceAll("_", " "));
    }
  }

  private updateWeather(): void {
    const entity = this.entity(this.config.weather.entity);
    const temperature = readNumber(entity, "temperature");
    const humidity = readNumber(entity, "humidity");
    const state = entity
      ? titleCase(entity.state.replaceAll("_", " "))
      : "Unavailable";

    this.setRegion(
      "weather",
      `<article class="card weather-card">
        <div class="weather-icon">${iconSvg("cloud", "weather-symbol")}</div>
        <div class="weather-copy">
          <div class="weather-state">${escapeHtml(state)}</div>
        </div>
        <div class="weather-metrics">
          <div class="weather-temp">${formatNumeric(temperature, "°C")}</div>
          <div class="weather-humidity">${iconSvg("droplet", "small-icon")} ${formatNumeric(
            humidity,
            "%",
            0,
          )}</div>
        </div>
      </article>`,
    );
  }

  private updateEnvironment(): void {
    const temperature = parseStateNumber(
      this.entity(this.config.environment.temperatureEntity),
    );
    const humidity = parseStateNumber(
      this.entity(this.config.environment.humidityEntity),
    );
    const samples = this.sampler.samples();
    const temperatures = samples.map((sample) => sample.temperature);
    const humidities = samples.map((sample) => sample.humidity);
    const tempRange = paddedRange(
      temperatures,
      temperature - 1,
      temperature + 1,
    );
    const humidityRange = paddedRange(humidities, humidity - 5, humidity + 5);
    const tempPath = buildSeriesPath(temperatures, {
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      ...tempRange,
      flatYRatio: 0.32,
    });
    const humidityPath = buildSeriesPath(humidities, {
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      ...humidityRange,
      flatYRatio: 0.68,
    });

    this.setRegion(
      "environment",
      `<article class="card environment-card">
        <div class="card-head">
          <div>
            <h2>Indoors</h2>
          </div>
          <div class="env-values">
            <span class="temp-dot"></span>${formatNumeric(temperature, "°C", 1)}
            <span class="humidity-dot"></span>${formatNumeric(humidity, "%", 0)}
          </div>
        </div>
        <svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Temperature and humidity trend">
          <path class="chart-grid" vector-effect="non-scaling-stroke" d="M0 ${CHART_HEIGHT * 0.35} H${CHART_WIDTH} M0 ${
            CHART_HEIGHT * 0.7
          } H${CHART_WIDTH}"></path>
          <path class="chart-line temperature-line" vector-effect="non-scaling-stroke" d="${tempPath}"></path>
          <path class="chart-line humidity-line" vector-effect="non-scaling-stroke" d="${humidityPath}"></path>
        </svg>
      </article>`,
    );
  }

  private updateScenes(): void {
    this.setRegion(
      "scenes",
      this.config.sceneTiles
        .map((tile, index) => {
          const state = tile.entity
            ? this.entity(tile.entity)?.state
            : undefined;
          const active = isActiveState(state);
          return `<button class="scene-tile ${active ? "is-active" : ""}" data-dashy-action="scene" data-index="${index}" type="button">
            ${iconSvg(tile.icon, "tile-icon")}
            <span>${escapeHtml(tile.label)}</span>
          </button>`;
        })
        .join(""),
    );
  }

  private updateControls(): void {
    this.setRegion(
      "controls",
      `<article class="card controls-card">
        ${this.config.controls.map((control, index) => this.renderControl(control, index)).join("")}
        ${this.config.climate ? this.renderClimateControl(this.config.climate) : ""}
      </article>`,
    );
  }

  private renderControl(control: ControlConfig, index: number): string {
    const state = this.entity(control.entity)?.state ?? "unavailable";
    const hasCoverControls = control.actions.open || control.actions.close;

    return `<div class="control-row">
      <div class="control-icon">${iconSvg(control.icon, "control-symbol")}</div>
      <div class="control-copy">
        <div>${escapeHtml(control.label)}</div>
      </div>
      <div class="control-actions">
        ${
          hasCoverControls
            ? `<button class="cover-pill ${isCoverOpenState(state) ? "is-active" : ""}" data-dashy-action="control-open" data-index="${index}" type="button" aria-label="Open ${escapeHtml(
                control.label,
              )}">${iconSvg("up")}</button>
              <button class="cover-pill ${isCoverClosedState(state) ? "is-active" : ""}" data-dashy-action="control-close" data-index="${index}" type="button" aria-label="Close ${escapeHtml(
                control.label,
              )}">${iconSvg("down")}</button>`
            : `<button class="toggle ${state === "on" ? "is-on" : ""}" data-dashy-action="control-toggle" data-index="${index}" type="button" aria-label="Toggle ${escapeHtml(
                control.label,
              )}"><span></span></button>`
        }
      </div>
    </div>`;
  }

  private renderClimateControl(climate: ClimateConfig): string {
    const isCool = this.isClimateCooling(climate);
    const isSleep = this.isTimedClimateActionActive(climate, "sleep");
    const isClean = this.isTimedClimateActionActive(climate, "cleanAir");

    return `<div class="control-row climate-row">
      <div class="control-icon">${iconSvg("thermometer", "control-symbol")}</div>
      <div class="control-copy">
        <div>${escapeHtml(climate.label)}</div>
      </div>
      <div class="control-actions climate-actions" role="group" aria-label="${escapeHtml(climate.label)} mode">
        ${this.renderClimateActionButton("cool", "snowflake", isCool, isCool ? `Turn ${climate.label} off` : `Cool ${climate.label}`)}
        ${this.renderClimateActionButton("sleep", "moon", isSleep, isSleep ? `Turn ${climate.label} sleep off` : `Sleep ${climate.label}`, this.timedClimateProgressPercent(climate, "sleep"))}
        ${this.renderClimateActionButton("cleanAir", "fan", isClean, isClean ? `Turn ${climate.label} clean off` : `Clean ${climate.label}`, this.timedClimateProgressPercent(climate, "cleanAir"))}
      </div>
    </div>`;
  }

  private renderClimateActionButton(
    action: "cool" | TimedClimateAction,
    icon: string,
    active: boolean,
    label: string,
    progressPercent?: number,
  ): string {
    const progress = progressPercent ?? 0;
    const classes = [
      "climate-action-button",
      active ? "is-active" : "",
      progressPercent !== undefined ? "has-progress" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `<button class="${classes}" data-dashy-action="climate-${action}" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${active}" style="--progress: ${Math.round(progress * 3.6)}deg">${iconSvg(icon, "climate-icon")}</button>`;
  }

  private isClimateCooling(climate: ClimateConfig): boolean {
    return (
      this.entity(climate.entity)?.state === "cool" &&
      !this.hasActiveTimedClimateAction(climate)
    );
  }

  private hasActiveTimedClimateAction(climate: ClimateConfig): boolean {
    return TIMED_CLIMATE_ACTIONS.some((action) =>
      this.isTimedClimateActionActive(climate, action),
    );
  }

  private isTimedClimateActionActive(
    climate: ClimateConfig,
    action: TimedClimateAction,
  ): boolean {
    const stateEntity = stateEntityId(climate.actions[action]);
    if (stateEntity && this.entity(stateEntity)?.state === "on") {
      return true;
    }

    if (this.isLocalTimedClimateActionActive(climate, action)) {
      return true;
    }

    const scriptId = scriptEntityId(climate.actions[action]);
    const scriptState = scriptId ? this.entity(scriptId)?.state : undefined;
    if (scriptState === "on") {
      return true;
    }

    if (action === "cleanAir") {
      const climateState = this.entity(climate.entity)?.state;
      return climateState === "dry" || climateState === "fan_only";
    }

    return false;
  }

  private isLocalTimedClimateActionActive(
    climate: ClimateConfig,
    action: TimedClimateAction,
  ): boolean {
    const active = this.activeTimedClimateAction;
    if (active?.action !== action) {
      return false;
    }

    const duration = timedClimateDuration(climate.actions[action]);
    if (duration === undefined) {
      return true;
    }

    const isActive = Date.now() - active.startedAt < duration * 1_000;
    if (!isActive) {
      this.activeTimedClimateAction = undefined;
    }

    return isActive;
  }

  private timedClimateProgressPercent(
    climate: ClimateConfig,
    action: TimedClimateAction,
  ): number | undefined {
    const serviceCall = climate.actions[action];
    const scriptId = scriptEntityId(serviceCall);
    const script = scriptId ? this.entity(scriptId) : undefined;
    const stateEntity = stateEntityId(serviceCall);
    const state = stateEntity ? this.entity(stateEntity) : undefined;
    const duration = timedClimateDuration(serviceCall);
    if (duration === undefined) {
      return undefined;
    }

    const localStart =
      this.activeTimedClimateAction?.action === action
        ? this.activeTimedClimateAction.startedAt
        : undefined;
    const start =
      script?.state === "on"
        ? timestampMs(script.attributes.last_triggered) ??
          timestampMs(script.last_changed) ??
          timestampMs(script.last_updated) ??
          localStart
        : state?.state === "on"
          ? timestampMs(state.last_changed) ??
            timestampMs(state.last_updated) ??
            localStart
        : localStart;
    if (start === undefined) {
      return undefined;
    }

    const elapsed = Math.max(0, (Date.now() - start) / 1_000);
    return Math.max(0, Math.min(100, 100 - (elapsed / duration) * 100));
  }

  private async refreshSonosArtwork(): Promise<void> {
    const hass = this.currentHass;
    const sonos = this.config.media.sonos;
    if (!sonos || !hass?.callWS) {
      this.resetSonosArtwork();
      return;
    }

    const favorites = parseSonosFavorites(hass, sonos.favoritesSensorEntity);
    if (favorites.length === 0) {
      this.resetSonosArtwork();
      return;
    }

    const key = `${sonos.playerEntity}|${favorites
      .map((favorite) => `${favorite.id}\u0000${favorite.title}`)
      .join("\u0001")}`;
    if (key === this.sonosArtworkRequestKey) {
      return;
    }

    this.sonosArtworkRequestKey = key;
    const version = this.sonosArtworkRequestVersion + 1;
    this.sonosArtworkRequestVersion = version;

    try {
      const artwork = await browseSonosFavoriteArtwork(hass, sonos.playerEntity);
      if (
        this.sonosArtworkRequestVersion !== version ||
        this.sonosArtworkRequestKey !== key
      ) {
        return;
      }

      this.sonosArtwork.clear();
      for (const [artworkKey, url] of artwork) {
        this.sonosArtwork.set(artworkKey, url);
      }
      this.updateMedia();
    } catch {
      // Home Assistant media browsing is optional; favorites still work without artwork.
    }
  }

  private resetSonosArtwork(): void {
    if (this.sonosArtwork.size === 0 && this.sonosArtworkRequestKey === "") {
      return;
    }

    this.sonosArtwork.clear();
    this.sonosArtworkRequestKey = "";
    this.sonosArtworkRequestVersion += 1;
    this.updateMedia();
  }

  private playlistArtwork(button: PlaylistButtonConfig): string | undefined {
    if (button.art) {
      return button.art;
    }

    const contentId = stringEntityId(button.service.data?.media_content_id);
    return (
      (contentId ? this.sonosArtwork.get(contentId) : undefined) ??
      this.sonosArtwork.get(sonosArtworkLookupKey(button.label))
    );
  }

  private updateMedia(): void {
    const hass = this.effectiveHass();
    const mode = getMediaDisplayMode(
      this.config.media,
      this.mediaTracker,
      hass,
    );
    if (mode.kind === "idle") {
      const playlistButtons = mode.buttons.slice(0, MAX_IDLE_PLAYLIST_CARDS);
      if (playlistButtons.length === 0) {
        this.setRegion("media", "");
        return;
      }

      this.setRegion(
        "media",
        `<div class="idle-media playlist-grid" aria-label="Start music">
            ${playlistButtons
              .map((button, index) => {
                const artwork = this.playlistArtwork(button);
                const artStyle = artwork
                  ? ` style="--playlist-art: ${escapeHtml(cssUrl(artwork))}"`
                  : "";
                return `<button class="playlist-button" data-dashy-action="playlist" data-index="${index}" type="button" aria-label="Start ${escapeHtml(
                  button.label,
                )}"${artStyle}>
                  <div class="playlist-art">${iconSvg("play", "playlist-play-button")}</div>
                  <span>${escapeHtml(button.label)}</span>
                </button>`;
              })
              .join("")}
        </div>`,
      );
      return;
    }

    const player = mode.player;
    const entity = hass?.states[player.entity];
    const attrs = entity?.attributes ?? {};
    if (player.entity === this.config.media.sonos?.playerEntity) {
      this.setRegion("media", this.renderSonosPlayer(player, entity));
      return;
    }

    const title =
      stringAttr(attrs.media_title) ||
      stringAttr(attrs.media_artist) ||
      player.label;
    const subtitle =
      [
        stringAttr(attrs.media_artist),
        stringAttr(attrs.app_name) || stringAttr(attrs.source),
      ]
        .filter(Boolean)
        .join(" · ") || titleCase(entity?.state ?? "playing");
    const progress = progressPercent(entity);

    this.setRegion(
      "media",
      `<article class="media-card now-playing">
        <div class="media-heading">
          <div>
            <p class="media-title">${escapeHtml(title)}</p>
            <span>${escapeHtml(subtitle)}</span>
          </div>
        </div>
        <div class="media-body">
          <div class="media-controls player-controls">
            <button data-dashy-action="media-power" type="button" aria-label="Turn off">${iconSvg(
              "power",
            )}</button>
            <div class="media-transport-controls">
              <button data-dashy-action="media-previous" type="button" aria-label="Previous">${iconSvg(
                "previous",
              )}</button>
              <button data-dashy-action="media-playpause" type="button" aria-label="Play pause">${iconSvg(
                entity?.state === "playing" ? "pause" : "play",
              )}</button>
              <button data-dashy-action="media-next" type="button" aria-label="Next">${iconSvg(
                "skip",
              )}</button>
            </div>
          </div>
          <div class="progress"><span style="width: ${progress}%"></span></div>
        </div>
      </article>`,
    );
  }

  private renderSonosPlayer(
    player: { label: string; entity: string },
    entity: HassEntity | undefined,
  ): string {
    const favorites = parseSonosFavorites(
      this.currentHass,
      this.config.media.sonos?.favoritesSensorEntity ?? "",
    );
    const playlistName = resolveSonosPlaylistName(
      entity,
      favorites,
      player.label,
    );
    const loading =
      this.optimisticMediaStarts.get(player.entity)?.loading === true;
    const artist = stringAttr(entity?.attributes.media_artist);
    const mediaTitle = stringAttr(entity?.attributes.media_title);
    const title = loading
      ? "Starting..."
      : artist && mediaTitle
        ? `${artist} - ${mediaTitle}`
        : mediaTitle || playlistName;
    const picture = stringAttr(entity?.attributes.entity_picture);
    const progress = progressPercent(entity);
    const shuffleEnabled = entity?.attributes.shuffle === true;
    const artStyle = picture
      ? ` style="--media-art: ${escapeHtml(cssUrl(picture))}"`
      : "";

    return `<article class="media-card now-playing sonos-playing ${loading ? "is-loading" : ""}" aria-busy="${loading ? "true" : "false"}"${artStyle}>
      <div class="sonos-art"></div>
      <div class="media-heading sonos-heading">
        <div class="sonos-room">
          ${iconSvg("music", "media-source-icon")}
          <h2>${escapeHtml(playlistName)}</h2>
        </div>
        <button class="icon-button media-more" data-dashy-action="media-favorites-menu" type="button" aria-label="Choose Sonos favorite" aria-expanded="${
          this.isFavoritesMenuOpen ? "true" : "false"
        }">${iconSvg("more")}</button>
      </div>
      <div class="media-body">
        <p class="media-title">${escapeHtml(title)}</p>
        <div class="media-controls sonos-controls">
          <button data-dashy-action="media-stop" type="button" aria-label="Stop">${iconSvg(
            "power",
            "icon media-stop-icon",
          )}</button>
          <div class="media-transport-controls">
            <button data-dashy-action="media-previous" type="button" aria-label="Previous">${iconSvg(
              "previous",
            )}</button>
            <button data-dashy-action="media-playpause" type="button" aria-label="Play pause">${iconSvg(
              entity?.state === "playing" ? "pause" : "play",
            )}</button>
            <button data-dashy-action="media-next" type="button" aria-label="Next">${iconSvg(
              "skip",
            )}</button>
          </div>
          <button class="${shuffleEnabled ? "is-active" : ""}" data-dashy-action="media-shuffle" type="button" aria-label="${
            shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"
          }">${iconSvg("shuffle")}</button>
        </div>
        <div class="progress"><span style="width: ${progress}%"></span></div>
      </div>
      ${
        this.isFavoritesMenuOpen
          ? `<div class="favorites-popover" role="menu" aria-label="Sonos favorites">
              ${favorites
                .slice(0, 10)
                .map(
                  (favorite, index) =>
                    `<button data-dashy-action="sonos-favorite" data-index="${index}" type="button" role="menuitem">${escapeHtml(
                      favorite.title,
                    )}</button>`,
                )
                .join("")}
            </div>`
          : ""
      }
    </article>`;
  }

  private updateMediaProgress(): void {
    const hass = this.effectiveHass();
    const mode = getMediaDisplayMode(
      this.config.media,
      this.mediaTracker,
      hass,
    );
    if (mode.kind !== "player") {
      return;
    }

    const progress = this.view.querySelector<HTMLElement>(
      '[data-region="media"] .progress span',
    );
    if (!progress) {
      return;
    }

    progress.style.width = `${progressPercent(
      hass?.states[mode.player.entity],
    )}%`;
  }

  private updateClimateProgress(): void {
    const climate = this.config.climate;
    if (!climate) {
      return;
    }

    const coolButton = this.view.querySelector<HTMLButtonElement>(
      '[data-dashy-action="climate-cool"]',
    );
    if (coolButton) {
      const active = this.isClimateCooling(climate);
      coolButton.classList.toggle("is-active", active);
      coolButton.setAttribute("aria-pressed", String(active));
    }

    for (const action of TIMED_CLIMATE_ACTIONS) {
      const button = this.view.querySelector<HTMLButtonElement>(
        `[data-dashy-action="climate-${action}"]`,
      );
      if (!button) {
        continue;
      }

      const active = this.isTimedClimateActionActive(climate, action);
      const progress = this.timedClimateProgressPercent(climate, action);
      button.classList.toggle("is-active", active);
      button.classList.toggle("has-progress", progress !== undefined);
      button.setAttribute("aria-pressed", String(active));
      button.style.setProperty(
        "--progress",
        `${Math.round((progress ?? 0) * 3.6)}deg`,
      );
    }
  }

  private sampleEnvironment(): void {
    const temperature = parseStateNumber(
      this.entity(this.config.environment.temperatureEntity),
    );
    const humidity = parseStateNumber(
      this.entity(this.config.environment.humidityEntity),
    );
    this.sampler.add(temperature, humidity);
  }

  private entity(entityId: string): HassEntity | undefined {
    const entity = this.currentHass?.states[entityId];
    const optimisticState = this.optimisticStates.get(entityId);
    const optimisticMediaStart = this.optimisticMediaStarts.get(entityId);
    if (!entity && !optimisticMediaStart) {
      return entity;
    }

    const baseEntity =
      entity ??
      ({
        entity_id: entityId,
        state: "idle",
        attributes: {},
      } satisfies HassEntity);

    return {
      ...baseEntity,
      state: optimisticState ?? baseEntity.state,
      attributes: optimisticMediaStart
        ? {
            ...baseEntity.attributes,
            media_content_id:
              optimisticMediaStart.contentId ??
              baseEntity.attributes.media_content_id,
            media_playlist: optimisticMediaStart.title,
          }
        : baseEntity.attributes,
    };
  }

  private effectiveHass(): HassLike | undefined {
    if (!this.currentHass) {
      return undefined;
    }

    const states = { ...this.currentHass.states };
    for (const entityId of new Set([
      ...this.optimisticStates.keys(),
      ...this.optimisticMediaStarts.keys(),
    ])) {
      const entity = this.entity(entityId);
      if (entity) {
        states[entityId] = entity;
      }
    }

    return { ...this.currentHass, states };
  }

  private setRegion(region: string, html: string): void {
    const target = this.view.querySelector(`[data-region="${region}"]`);
    if (target && target.innerHTML !== html) {
      target.innerHTML = html;
    }
  }
}

function parseStateNumber(entity: HassEntity | undefined): number {
  const value = Number.parseFloat(String(entity?.state ?? ""));
  return Number.isFinite(value) ? value : Number.NaN;
}

function readNumber(entity: HassEntity | undefined, attribute: string): number {
  const value = Number(entity?.attributes[attribute]);
  return Number.isFinite(value) ? value : Number.NaN;
}

function formatNumeric(
  value: number,
  unit: string,
  fractionDigits = 1,
): string {
  if (!Number.isFinite(value)) {
    return `-- ${unit}`;
  }

  return `${value.toFixed(fractionDigits)} ${unit}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isActiveState(state: string | undefined): boolean {
  return state === "on" || state === "playing" || state === "open";
}

function isCoverOpenState(state: string | undefined): boolean {
  return state === "open" || state === "opening";
}

function isCoverClosedState(state: string | undefined): boolean {
  return state === "closed" || state === "closing";
}

function stringEntityId(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function scriptEntityId(serviceCall: ServiceCall | undefined): string | undefined {
  const entityId = stringEntityId(serviceCall?.data?.entity_id);
  return entityId?.startsWith("script.") ? entityId : undefined;
}

function stateEntityId(serviceCall: ServiceCall | undefined): string | undefined {
  return stringEntityId(serviceCall?.stateEntity);
}

function serviceForToggleEntityOff(entityId: string): ServiceCall {
  const domain = entityId.split(".")[0] ?? "";
  if (domain === "input_boolean" || domain === "switch" || domain === "light") {
    return {
      domain,
      service: "turn_off",
      data: { entity_id: entityId },
    };
  }

  return {
    domain: "homeassistant",
    service: "turn_off",
    data: { entity_id: entityId },
  };
}

function timedClimateDuration(serviceCall: ServiceCall | undefined): number | undefined {
  const duration = Number(serviceCall?.durationSeconds);
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function isTimedClimateAction(action: string): action is TimedClimateAction {
  return TIMED_CLIMATE_ACTIONS.includes(action as TimedClimateAction);
}

function optimisticMediaTitle(
  data: Record<string, unknown> | undefined,
): string {
  const extra = data?.extra;
  if (extra && typeof extra === "object") {
    const title = (extra as Record<string, unknown>).title;
    if (typeof title === "string" && title.length > 0) {
      return title;
    }
  }

  const title = data?.media_playlist ?? data?.title;
  return typeof title === "string" ? title : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Home Assistant service failed";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssUrl(value: string): string {
  return `url("${cssString(value)}")`;
}

function cssString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\a ")
    .replaceAll("\r", "\\d ")
    .replaceAll("\f", "\\c ");
}

function stringAttr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function progressPercent(
  entity: HassEntity | undefined,
  now = Date.now(),
): number {
  const attrs = entity?.attributes ?? {};
  const duration = Number(attrs.media_duration);
  const position = projectedMediaPosition(entity, now);
  if (
    !Number.isFinite(duration) ||
    !Number.isFinite(position) ||
    duration <= 0
  ) {
    return 72;
  }

  return Math.max(0, Math.min(100, Math.round((position / duration) * 100)));
}

function projectedMediaPosition(
  entity: HassEntity | undefined,
  now: number,
): number {
  const attrs = entity?.attributes ?? {};
  const position = Number(attrs.media_position);
  if (!Number.isFinite(position)) {
    return Number.NaN;
  }

  if (entity?.state !== "playing") {
    return position;
  }

  const updatedAt =
    timestampMs(attrs.media_position_updated_at) ??
    timestampMs(entity.last_updated) ??
    timestampMs(entity.last_changed);
  if (updatedAt === undefined) {
    return position;
  }

  return position + Math.max(0, (now - updatedAt) / 1_000);
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

const styles = `
  :host {
    display: block;
    height: 100vh;
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: none;
    color: #ececec;
    background: #0d0d0e;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  * {
    box-sizing: border-box;
  }

  button {
    color: inherit;
    font: inherit;
    border: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .dashboard {
    width: min(100%, 1000px);
    height: 100%;
    min-height: 0;
    margin: 0 auto;
    padding: clamp(12px, 2.8vw, 24px);
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 1.3vw, 12px);
    overflow: hidden;
    overflow: clip;
  }

  .dashboard-header {
    display: grid;
    gap: clamp(8px, 1.2vw, 12px);
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: clamp(18px, 3vw, 32px);
  }

  .date,
  .time {
    font-size: clamp(26px, 5.2vw, 41px);
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .badge-row {
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .badge-row::-webkit-scrollbar {
    display: none;
  }

  .badge-row[hidden] {
    display: none;
  }

  .badge {
    flex: 0 0 auto;
    min-width: 0;
    min-height: 34px;
    padding: 7px 11px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    font-size: clamp(14px, 2.2vw, 18px);
    font-weight: 800;
    line-height: 1;
  }

  .badge.is-alert {
    background: #d80000;
    color: #fff;
  }

  .badge.is-status {
    background: #fff;
    color: #111;
  }

  .badge-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
  }

  .badge-label,
  .badge-state {
    min-width: 0;
  }

  .card,
  .media-card {
    border: 1px solid #343436;
    background: #1b1b1c;
    border-radius: 18px;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 2%);
  }

  .weather-card {
    padding: clamp(14px, 2.8vw, 24px);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: clamp(10px, 2vw, 18px);
  }

  .weather-symbol {
    width: clamp(42px, 7vw, 62px);
    height: clamp(42px, 7vw, 62px);
    color: #e8e8e8;
  }

  .weather-copy {
    min-width: 0;
  }

  .weather-state {
    font-size: clamp(30px, 5.4vw, 50px);
    line-height: 1.05;
    white-space: nowrap;
  }

  .muted {
    color: #a6a6aa;
  }

  .weather-humidity {
    font-size: clamp(17px, 2.8vw, 26px);
  }

  .weather-metrics {
    text-align: right;
    white-space: nowrap;
  }

  .weather-temp {
    font-size: clamp(30px, 5.4vw, 50px);
    line-height: 1.1;
  }

  .weather-humidity {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #a6a6aa;
  }

  .small-icon {
    width: 20px;
    height: 20px;
  }

  .environment-card {
    padding: 16px 20px 14px;
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 6px;
  }

  h2 {
    margin: 0;
    font-size: clamp(24px, 4vw, 31px);
    line-height: 1.2;
  }

  p {
    margin: 0;
  }

  .env-values {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: clamp(22px, 4vw, 34px);
    line-height: 1;
    white-space: nowrap;
  }

  .temp-dot,
  .humidity-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    display: inline-block;
  }

  .temp-dot {
    background: #ff595f;
  }

  .humidity-dot {
    background: #38a8ff;
    margin-left: 8px;
  }

  .chart {
    width: 100%;
    height: clamp(48px, 8vw, 72px);
    display: block;
    overflow: visible;
  }

  .chart-grid {
    fill: none;
    stroke: #2a2a2d;
    stroke-width: 1;
  }

  .chart-line {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .temperature-line {
    stroke: #ff595f;
  }

  .humidity-line {
    stroke: #38a8ff;
  }

  .scene-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(clamp(64px, 17%, 170px), 1fr));
    gap: clamp(8px, 1.3vw, 12px);
  }

  .scene-tile {
    aspect-ratio: 1 / 0.78;
    min-width: 0;
    padding: 9px 8px;
    border-radius: 14px;
    background: #1b1b1c;
    border: 1px solid #343436;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #e7e7e8;
  }

  .scene-tile.is-active {
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    border-color: #8b5cf6;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 12%);
    color: #fff;
  }

  .tile-icon {
    width: clamp(32px, 4.8vw, 42px);
    height: clamp(32px, 4.8vw, 42px);
  }

  .scene-tile span {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: clamp(15px, 2.4vw, 24px);
    line-height: 1.05;
  }

  .controls-card {
    padding: 16px 20px;
    display: grid;
    gap: 14px;
  }

  .control-row {
    display: grid;
    grid-template-columns: 34px 1fr auto;
    align-items: center;
    gap: 18px;
    min-height: 50px;
  }

  .control-symbol {
    width: 34px;
    height: 34px;
    color: #f0f0f2;
  }

  .control-copy {
    font-size: clamp(20px, 3.8vw, 30px);
    line-height: 1.2;
  }

  .control-copy span {
    color: #9d9da3;
    display: block;
    font-size: 0.82em;
    margin-top: 3px;
  }

  .control-actions {
    display: flex;
    align-items: center;
    gap: clamp(16px, 4vw, 38px);
  }

  .icon-button {
    width: 38px;
    height: 38px;
    background: transparent;
    color: #e9e9eb;
    display: inline-grid;
    place-items: center;
  }

  .icon-button .icon {
    width: 29px;
    height: 29px;
  }

  .cover-pill {
    width: clamp(58px, 8vw, 72px);
    height: 42px;
    border-radius: 999px;
    border: 1px solid #4b4b50;
    background: #252529;
    color: #f0f0f2;
    display: inline-grid;
    place-items: center;
  }

  .cover-pill.is-active {
    border-color: #8b5cf6;
    background: #375eea;
    color: #fff;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 12%);
  }

  .cover-pill .icon {
    width: 28px;
    height: 28px;
  }

  .toggle {
    width: 68px;
    height: 34px;
    padding: 3px;
    border-radius: 999px;
    border: 2px solid #727277;
    background: #2c2c2f;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .toggle span {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #a9a9ad;
    display: block;
  }

  .toggle.is-on {
    justify-content: flex-end;
    border-color: #8b5cf6;
    background: #375eea;
  }

  .toggle.is-on span {
    background: #fff;
  }

  .climate-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .control-actions.climate-actions {
    gap: 10px;
  }

  .climate-action-button {
    --progress: 0deg;
    position: relative;
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #4b4b50;
    color: #f0f0f2;
    isolation: isolate;
  }

  .climate-action-button::before {
    content: "";
    position: absolute;
    inset: 3px;
    z-index: 0;
    border-radius: inherit;
    background: #252529;
  }

  .climate-action-button.has-progress {
    background: conic-gradient(#4b4b50 calc(360deg - var(--progress)), #5da2ff 0);
  }

  .climate-action-button.is-active {
    background: #8b5cf6;
    color: #fff;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 12%);
  }

  .climate-action-button.is-active.has-progress {
    background: conic-gradient(#4b4b50 calc(360deg - var(--progress)), #8b5cf6 0);
  }

  .climate-action-button.is-active::before {
    background: #375eea;
    color: #fff;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 12%);
  }

  .climate-action-button:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .climate-icon {
    position: relative;
    z-index: 1;
    width: 24px;
    height: 24px;
  }

  .media-card {
    min-height: 0;
    overflow: hidden;
  }

  .now-playing {
    padding: 12px 18px 14px;
    background: #0aa0c2;
    border-color: #20b7d6;
    color: white;
  }

  .sonos-playing {
    position: relative;
    isolation: isolate;
    overflow: visible;
    background: #171717;
    border-color: #3b3b3f;
    color: #f4f0e8;
  }

  .sonos-art {
    position: absolute;
    inset: 1px;
    z-index: 0;
    overflow: hidden;
    border-radius: inherit;
    clip-path: inset(0 round 18px);
    pointer-events: none;
  }

  .sonos-art::before,
  .sonos-art::after {
    content: "";
    position: absolute;
    pointer-events: none;
  }

  .sonos-art::before {
    inset: -10px;
    background-image: var(--media-art, none);
    background-size: cover;
    background-position: center;
    opacity: 0.58;
    filter: blur(8px) saturate(0.85);
  }

  .sonos-art::after {
    inset: 0;
    background:
      linear-gradient(90deg, rgb(18 18 18 / 94%) 0%, rgb(18 18 18 / 72%) 42%, rgb(18 18 18 / 25%) 100%),
      linear-gradient(0deg, rgb(0 0 0 / 42%), rgb(0 0 0 / 8%));
  }

  .sonos-heading,
  .sonos-playing .media-body {
    position: relative;
    z-index: 1;
  }

  .media-heading.sonos-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .sonos-room {
    display: inline-flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    gap: 10px;
  }

  .sonos-room .media-source-icon {
    flex: 0 0 auto;
    color: #fff;
  }

  .sonos-room h2 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #fff;
  }

  .sonos-playing .media-title {
    max-width: 100%;
    color: #fff;
  }

  .sonos-playing.is-loading .media-title {
    opacity: 0.78;
  }

  .sonos-playing .media-controls {
    color: #fff;
  }

  .sonos-playing .progress {
    background: rgb(255 255 255 / 30%);
  }

  .sonos-playing .progress span {
    background: #c3aa6c;
  }

  .sonos-playing.is-loading .progress span {
    width: 38% !important;
    animation: loading-progress 1.1s ease-in-out infinite alternate;
  }

  @keyframes loading-progress {
    from {
      transform: translateX(-35%);
    }
    to {
      transform: translateX(150%);
    }
  }

  .media-more {
    position: relative;
    z-index: 4;
  }

  .favorites-popover {
    position: absolute;
    top: auto;
    bottom: calc(100% - 44px);
    right: 12px;
    z-index: 5;
    width: min(290px, calc(100% - 24px));
    max-height: min(420px, calc(100dvh - 24px));
    overflow: auto;
    padding: 8px;
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 12px;
    background: rgb(22 22 24 / 96%);
    box-shadow: 0 14px 38px rgb(0 0 0 / 40%);
  }

  .favorites-popover button {
    width: 100%;
    min-height: 42px;
    padding: 8px 10px;
    border-radius: 9px;
    background: transparent;
    color: #f4f0e8;
    text-align: left;
    font-size: 16px;
    line-height: 1.15;
  }

  .favorites-popover button:focus-visible,
  .favorites-popover button:hover {
    outline: none;
    background: rgb(255 255 255 / 10%);
  }

  .media-heading {
    display: block;
  }

  .media-heading > div {
    min-width: 0;
  }

  .media-source-icon {
    width: 30px;
    height: 30px;
  }

  .media-heading h2 {
    font-size: clamp(18px, 2.8vw, 24px);
    font-weight: 500;
  }

  .media-title {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(21px, 3.5vw, 30px);
    line-height: 1.12;
  }

  .media-subtitle {
    display: block;
    margin-top: 2px;
    color: rgb(255 255 255 / 72%);
    font-size: clamp(15px, 2.2vw, 19px);
    line-height: 1.15;
  }

  .media-heading span {
    display: block;
    margin-top: 4px;
    font-size: clamp(17px, 2.7vw, 24px);
  }

  .media-body {
    display: grid;
    gap: 9px;
    margin-top: 9px;
  }

  .media-controls {
    display: flex;
    align-items: center;
    gap: clamp(24px, 5vw, 48px);
  }

  .media-controls.sonos-controls,
  .media-controls.player-controls {
    display: grid;
    grid-template-columns: minmax(34px, 1fr) auto minmax(34px, 1fr);
    gap: 0;
  }

  .media-transport-controls {
    justify-self: center;
    display: flex;
    align-items: center;
    gap: clamp(24px, 5vw, 48px);
  }

  .media-controls.sonos-controls > button[data-dashy-action="media-stop"] {
    justify-self: start;
  }

  .media-controls.player-controls > button[data-dashy-action="media-power"] {
    justify-self: start;
  }

  .media-controls.sonos-controls > button[data-dashy-action="media-shuffle"] {
    justify-self: end;
  }

  .media-controls button {
    width: 34px;
    height: 34px;
    background: transparent;
    display: grid;
    place-items: center;
  }

  .media-controls .icon {
    width: 29px;
    height: 29px;
  }

  .media-controls button.is-active {
    color: #5da2ff;
    background: transparent;
  }

  .progress {
    height: 8px;
    border-radius: 999px;
    background: rgb(255 255 255 / 35%);
    overflow: hidden;
    align-self: end;
  }

  .progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #ff9b00;
  }

  .playlist-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(64px, 22%, 220px), 1fr));
    gap: 8px;
  }

  .idle-media.playlist-grid {
    margin-top: 0;
  }

  .playlist-button {
    position: relative;
    aspect-ratio: 1 / 1;
    min-width: 0;
    min-height: 0;
    border-radius: 14px;
    overflow: hidden;
    background: #242427;
    border: 1px solid #3a3a3d;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: end;
    justify-items: stretch;
    gap: 0;
    padding: 7px 7px 14px;
    color: #fff;
  }

  .playlist-art {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #252529;
    pointer-events: none;
  }

  .playlist-art::before,
  .playlist-art::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .playlist-art::before {
    background-image: var(--playlist-art, linear-gradient(135deg, #303844, #232427));
    background-position: center;
    background-size: cover;
    opacity: 0.9;
  }

  .playlist-art::after {
    top: auto;
    bottom: 0;
    height: 58%;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.74), rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0));
  }

  .playlist-play-button {
    position: relative;
    z-index: 1;
    width: clamp(30px, 7vw, 44px);
    height: clamp(30px, 7vw, 44px);
    padding: 0;
    border-radius: 999px;
    background: rgb(0 0 0 / 28%);
    color: #fff;
    filter: drop-shadow(0 2px 5px rgb(0 0 0 / 55%));
  }

  .playlist-play-button path {
    transform: scale(0.9);
    transform-origin: center;
  }

  .playlist-button span {
    position: relative;
    z-index: 1;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    overflow-wrap: normal;
    white-space: nowrap;
    padding: 0 2px 1px;
    font-size: clamp(13px, 2vw, 17px);
    line-height: 1.05;
    text-align: center;
    text-shadow: 0 1px 4px rgb(0 0 0 / 80%);
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 18px;
    z-index: 20;
    max-width: min(520px, calc(100vw - 32px));
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid #8b5cf6;
    background: #231d31;
    color: #fff;
    font-size: 14px;
    line-height: 1.3;
    text-align: center;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 8px);
    transition:
      opacity 160ms ease,
      transform 160ms ease;
  }

  .toast.is-visible {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  @media (max-width: 560px) {
    .dashboard {
      padding: 12px;
    }

    .controls-card {
      padding: 14px 16px;
      gap: 12px;
    }

    .control-row {
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 10px;
    }

    .control-copy {
      min-width: 0;
    }

    .control-actions {
      gap: 10px;
      justify-content: flex-end;
    }

    .cover-pill {
      width: 54px;
      height: 40px;
    }

    .climate-action-button {
      width: 42px;
      height: 42px;
    }
  }

  @media (max-width: 430px) {
    .weather-card {
      grid-template-columns: auto 1fr;
    }

    .weather-metrics {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      text-align: left;
    }
  }

  @media (max-width: 380px), (max-width: 430px) and (max-height: 760px) {
    .dashboard {
      padding: 8px;
      gap: 6px;
    }

    .topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding-bottom: 6px;
    }

    .date,
    .time {
      font-size: 22px;
    }

    .date {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .time {
      justify-self: end;
    }

    .badge-row {
      min-height: 30px;
      gap: 5px;
    }

    .badge {
      min-height: 28px;
      padding: 5px 8px;
      gap: 5px;
      font-size: 13px;
    }

    .badge-icon {
      width: 15px;
      height: 15px;
    }

    .weather-card {
      min-height: 72px;
      padding: 10px 12px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 8px;
    }

    .weather-symbol {
      width: 34px;
      height: 34px;
    }

    .weather-state,
    .weather-temp {
      font-size: 27px;
    }

    .weather-humidity {
      font-size: 16px;
    }

    .small-icon {
      width: 16px;
      height: 16px;
    }

    .environment-card {
      padding: 10px 12px 8px;
    }

    .card-head {
      gap: 10px;
      margin-bottom: 2px;
    }

    h2 {
      font-size: 21px;
    }

    .env-values {
      gap: 6px;
      font-size: 21px;
    }

    .temp-dot,
    .humidity-dot {
      width: 8px;
      height: 8px;
    }

    .humidity-dot {
      margin-left: 4px;
    }

    .chart {
      height: 38px;
    }

    .scene-grid {
      grid-template-columns: repeat(auto-fit, minmax(clamp(54px, 17%, 150px), 1fr));
      gap: 6px;
    }

    .scene-tile {
      aspect-ratio: 1 / 0.62;
      padding: 5px;
      border-radius: 10px;
      gap: 3px;
    }

    .tile-icon {
      width: 25px;
      height: 25px;
    }

    .scene-tile span {
      font-size: 13px;
      line-height: 1;
    }

    .controls-card {
      padding: 10px 12px;
      gap: 8px;
    }

    .control-row {
      grid-template-columns: 34px minmax(0, 1fr) auto;
      min-height: 40px;
      gap: 8px;
    }

    .control-symbol {
      width: 28px;
      height: 28px;
    }

    .control-copy {
      font-size: 20px;
    }

    .control-actions {
      gap: 8px;
    }

    .toggle {
      width: 56px;
      height: 30px;
      padding: 2px;
    }

    .toggle span {
      width: 24px;
      height: 24px;
    }

    .cover-pill {
      width: 48px;
      height: 36px;
    }

    .cover-pill .icon {
      width: 24px;
      height: 24px;
    }

    .climate-action-button {
      width: 38px;
      height: 38px;
    }

    .climate-icon {
      width: 21px;
      height: 21px;
    }

    .now-playing {
      padding: 10px 12px;
    }

    .media-heading h2 {
      font-size: 18px;
    }

    .media-title {
      font-size: 19px;
    }

    .media-body {
      gap: 6px;
      margin-top: 6px;
    }

    .media-controls {
      gap: 22px;
    }

    .media-controls button {
      width: 30px;
      height: 30px;
    }

    .media-controls .icon {
      width: 24px;
      height: 24px;
    }

    .progress {
      height: 6px;
    }

    .playlist-grid {
      gap: 6px;
      margin-top: 8px;
      grid-template-columns: repeat(auto-fill, minmax(clamp(64px, 22%, 220px), 1fr));
    }

    .idle-media.playlist-grid {
      margin-top: 0;
    }

    .idle-media .playlist-button {
      aspect-ratio: 1 / 1;
      padding: 5px 5px 11px;
    }

    .idle-media .playlist-button span {
      font-size: 13px;
    }
  }
`;
