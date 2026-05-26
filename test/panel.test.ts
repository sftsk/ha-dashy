import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/main";
import type { HassLike } from "../src/types";

function baseHass(callService = vi.fn()): HassLike {
  return {
    states: {
      "weather.sample_home": {
        entity_id: "weather.sample_home",
        state: "cloudy",
        attributes: { temperature: 19.1, humidity: 38 },
      },
      "sensor.sample_temperature": {
        entity_id: "sensor.sample_temperature",
        state: "25.6",
        attributes: { unit_of_measurement: "°C" },
      },
      "sensor.sample_humidity": {
        entity_id: "sensor.sample_humidity",
        state: "32",
        attributes: { unit_of_measurement: "%" },
      },
      "media_player.sample_display": {
        entity_id: "media_player.sample_display",
        state: "idle",
        attributes: {},
      },
      "media_player.sample_speaker": {
        entity_id: "media_player.sample_speaker",
        state: "idle",
        attributes: {},
      },
      "light.sample_scene_6": {
        entity_id: "light.sample_scene_6",
        state: "off",
        attributes: {},
      },
      "switch.sample_outlet": {
        entity_id: "switch.sample_outlet",
        state: "off",
        attributes: {},
      },
      "cover.sample_shade": {
        entity_id: "cover.sample_shade",
        state: "open",
        attributes: {},
      },
    },
    callService,
  };
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function addSonosFavorites(hass: HassLike): HassLike {
  hass.states["sensor.sample_favorites"] = {
    entity_id: "sensor.sample_favorites",
    state: "6",
    attributes: {
      items: {
        "favorite:sample-1": "Favorite One",
        "favorite:sample-2": "Favorite Two",
        "favorite:sample-3": "Favorite Three",
        "favorite:sample-4": "Favorite Four",
        "favorite:sample-5": "Favorite Five",
        "favorite:sample-6": "Favorite Six",
      },
    },
  };
  return hass;
}

function addActiveProblemBadges(hass: HassLike): HassLike {
  hass.states["binary_sensor.sample_bin_full"] = {
    entity_id: "binary_sensor.sample_bin_full",
    state: "on",
    attributes: {},
  };
  hass.states["sensor.sample_air_quality"] = {
    entity_id: "sensor.sample_air_quality",
    state: "1250",
    attributes: { unit_of_measurement: "ppm" },
  };
  hass.states["sensor.sample_water_level"] = {
    entity_id: "sensor.sample_water_level",
    state: "1",
    attributes: {},
  };
  return hass;
}

function addRunningApplianceBadges(hass: HassLike): HassLike {
  hass.states["sensor.sample_appliance_state"] = {
    entity_id: "sensor.sample_appliance_state",
    state: "Run",
    attributes: {},
  };
  hass.states["sensor.sample_appliance_remaining"] = {
    entity_id: "sensor.sample_appliance_remaining",
    state: "42 min",
    attributes: {},
  };
  hass.states["sensor.sample_secondary_appliance_state"] = {
    entity_id: "sensor.sample_secondary_appliance_state",
    state: "Run",
    attributes: {},
  };
  hass.states["sensor.sample_secondary_appliance_remaining"] = {
    entity_id: "sensor.sample_secondary_appliance_remaining",
    state: "18 min",
    attributes: {},
  };
  return hass;
}

function addFinishedApplianceBadges(hass: HassLike): HassLike {
  hass.states["sensor.sample_appliance_state"] = {
    entity_id: "sensor.sample_appliance_state",
    state: "Finished",
    attributes: {},
  };
  hass.states["sensor.sample_appliance_remaining"] = {
    entity_id: "sensor.sample_appliance_remaining",
    state: "0 min",
    attributes: {},
  };
  hass.states["sensor.sample_secondary_appliance_state"] = {
    entity_id: "sensor.sample_secondary_appliance_state",
    state: "Finished",
    attributes: {},
  };
  hass.states["sensor.sample_secondary_appliance_remaining"] = {
    entity_id: "sensor.sample_secondary_appliance_remaining",
    state: "0 min",
    attributes: {},
  };
  return hass;
}

describe("dashy-dashboard-panel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });

  it("renders idle playlist buttons and routes playlist clicks through hass.callService", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass(callService);

    const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="playlist"][data-index="0"]',
    );

    expect(button?.textContent).toContain("Preset One");
    button?.click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("homeassistant", "toggle", {
      entity_id: "switch.sample_preset_one",
    });
  });

  it("renders top three Sonos favorites while idle and optimistically starts the selected favorite", async () => {
    const serviceCall = deferred();
    const callService = vi.fn().mockReturnValue(serviceCall.promise);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = addSonosFavorites(baseHass(callService));

    const buttons = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '[data-dashy-action="playlist"]',
      ) ?? []),
    ];

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "Favorite One",
      "Favorite Two",
      "Favorite Three",
    ]);
    expect(element.shadowRoot?.querySelector(".idle-media")?.textContent).not.toContain(
      "Choose a playlist",
    );
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";
    expect(styles).toContain(".idle-media .playlist-button");
    expect(styles).toContain("grid-template-columns: 28px minmax(0, 1fr)");
    expect(styles).toContain("white-space: nowrap");

    buttons[1].click();
    await Promise.resolve();

    const loadingPlayer = element.shadowRoot?.querySelector<HTMLElement>(".sonos-playing.is-loading");
    expect(loadingPlayer?.querySelector(".sonos-room")?.textContent).toContain("Favorite Two");
    expect(loadingPlayer?.querySelector(".media-title")?.textContent).toContain("Starting");
    expect(callService).toHaveBeenCalledWith("media_player", "play_media", {
      entity_id: "media_player.sample_speaker",
      media_content_type: "favorite_item_id",
      media_content_id: "favorite:sample-2",
      enqueue: "replace",
      extra: { title: "Favorite Two" },
    });
    serviceCall.resolve();
  });

  it("renders the climate chart as a full-width stretched SVG", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass();

    const chart = element.shadowRoot?.querySelector<SVGElement>(".chart");
    const chartLine = element.shadowRoot?.querySelector<SVGPathElement>(".chart-line");
    const climateCard = element.shadowRoot?.querySelector(".environment-card");
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(chart?.getAttribute("preserveAspectRatio")).toBe("none");
    expect(chartLine?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    expect(climateCard?.textContent).not.toContain("Temperature and humidity");
    expect(styles).toContain("stroke-width: 3");
  });

  it("keeps the header badge row hidden when no badge conditions are active", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass();

    const badgeRow = element.shadowRoot?.querySelector<HTMLElement>(".badge-row");

    expect(badgeRow?.hidden).toBe(true);
    expect(badgeRow?.querySelector(".badge")).toBeNull();
  });

  it("renders active problem and running status badges under the title row", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addRunningApplianceBadges(addActiveProblemBadges(baseHass()));
    hass.formatEntityState = (stateObj) => {
      if (stateObj.entity_id === "sensor.sample_air_quality") {
        return `${stateObj.state} ppm`;
      }
      return stateObj.state;
    };

    document.body.append(element);
    element.hass = hass;

    const badgeRow = element.shadowRoot?.querySelector<HTMLElement>(".badge-row");
    const badges = [
      ...(element.shadowRoot?.querySelectorAll<HTMLElement>(".badge") ?? []),
    ];
    const topbar = element.shadowRoot?.querySelector(".topbar");
    const weather = element.shadowRoot?.querySelector('[data-region="weather"]');

    expect(badgeRow?.hidden).toBe(false);
    expect(badges.map((badge) => badge.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Appliance 42 min",
      "Bin",
      "Air Quality 1250 ppm",
      "Reservoir",
      "Secondary Appliance 18 min",
    ]);
    expect(badges.filter((badge) => badge.classList.contains("is-alert")).length).toBe(3);
    expect(badges.filter((badge) => badge.classList.contains("is-status")).length).toBe(2);
    expect(topbar?.compareDocumentPosition(badgeRow as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(badgeRow?.compareDocumentPosition(weather as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders finished appliance status badges", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = addFinishedApplianceBadges(baseHass());

    const badges = [
      ...(element.shadowRoot?.querySelectorAll<HTMLElement>(".badge") ?? []),
    ];

    expect(badges.map((badge) => badge.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Appliance Finished",
      "Secondary Appliance Finished",
    ]);
    expect(badges.every((badge) => badge.classList.contains("is-status"))).toBe(true);
  });

  it("uses strict numeric thresholds for alert badges", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addActiveProblemBadges(baseHass());
    hass.states["sensor.sample_air_quality"] = {
      ...hass.states["sensor.sample_air_quality"],
      state: "1100",
    };

    document.body.append(element);
    element.hass = hass;

    const badgeText = element.shadowRoot?.querySelector(".badge-row")?.textContent ?? "";

    expect(badgeText).toContain("Bin");
    expect(badgeText).toContain("Reservoir");
    expect(badgeText).not.toContain("Air Quality");
  });

  it("styles alert badges red with white text and status badges white with black text", () => {
    const element = document.createElement("dashy-dashboard-panel");

    document.body.append(element);

    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(styles).toMatch(/\.badge-row\s*{[^}]*overflow-x:\s*auto/s);
    expect(styles).toMatch(/\.badge\s*{[^}]*white-space:\s*nowrap/s);
    expect(styles).toMatch(/\.badge\.is-alert\s*{[^}]*background:\s*#d80000/s);
    expect(styles).toMatch(/\.badge\.is-alert\s*{[^}]*color:\s*#fff/s);
    expect(styles).toMatch(/\.badge\.is-status\s*{[^}]*background:\s*#fff/s);
    expect(styles).toMatch(/\.badge\.is-status\s*{[^}]*color:\s*#111/s);
  });

  it("opens Home Assistant more-info for the badge entity", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const events: Event[] = [];

    document.body.append(element);
    element.addEventListener("hass-more-info", (event) => events.push(event));
    element.hass = addActiveProblemBadges(baseHass());

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-dashy-action="badge"][data-entity="binary_sensor.sample_bin_full"]')
      ?.click();

    expect(events).toHaveLength(1);
    expect((events[0] as CustomEvent).detail).toEqual({
      entityId: "binary_sensor.sample_bin_full",
    });
    expect(events[0].bubbles).toBe(true);
    expect(events[0].composed).toBe(true);
  });

  it("keeps weather and environment values rendering if Home Assistant badge state formatting fails", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addRunningApplianceBadges(baseHass());
    hass.formatEntityState = (stateObj) => {
      if (stateObj.entity_id === "sensor.sample_appliance_remaining") {
        throw new Error("format failed");
      }
      return stateObj.state;
    };

    document.body.append(element);
    element.hass = hass;

    const weatherCard = element.shadowRoot?.querySelector(".weather-card");
    const environmentCard = element.shadowRoot?.querySelector(".environment-card");

    expect(weatherCard?.textContent).toContain("19.1 °C");
    expect(weatherCard?.textContent).toContain("38 %");
    expect(environmentCard?.textContent).toContain("25.6 °C");
    expect(environmentCard?.textContent).toContain("32 %");
  });

  it("renders now playing media without source label or inert overflow button", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = baseHass();
    hass.states["media_player.sample_display"] = {
      entity_id: "media_player.sample_display",
      state: "playing",
      attributes: {
        media_title: "Sample Video",
        app_name: "Video App",
      },
    };

    document.body.append(element);
    element.hass = hass;

    const mediaCard = element.shadowRoot?.querySelector(".now-playing");

    expect(mediaCard?.textContent).toContain("Sample Video");
    expect(mediaCard?.textContent).toContain("Video App");
    expect(mediaCard?.textContent).not.toContain("Display Player");
    expect(element.shadowRoot?.querySelector(".media-more")).toBeNull();
  });

  it("renders Display Player when Sonos is only relaying TV audio", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addSonosFavorites(baseHass());
    hass.states["media_player.sample_display"] = {
      entity_id: "media_player.sample_display",
      state: "playing",
      attributes: {
        media_title: "Sample Video",
        app_name: "Video App",
      },
    };
    hass.states["media_player.sample_speaker"] = {
      entity_id: "media_player.sample_speaker",
      state: "playing",
      attributes: {
        source: "TV",
        media_content_id: "x-rincon-stream:sample-relay",
      },
    };

    document.body.append(element);
    element.hass = hass;

    const mediaCard = element.shadowRoot?.querySelector(".now-playing");

    expect(mediaCard?.textContent).toContain("Sample Video");
    expect(mediaCard?.textContent).not.toContain("Sample Speaker");
    expect(element.shadowRoot?.querySelector(".media-more")).toBeNull();
  });

  it("renders Sonos playlist player with artwork background and a favorites menu", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addSonosFavorites(baseHass(callService));
    hass.states["media_player.sample_display"] = {
      entity_id: "media_player.sample_display",
      state: "playing",
      attributes: {
        media_title: "Sample Display Video",
      },
    };
    hass.states["media_player.sample_speaker"] = {
      entity_id: "media_player.sample_speaker",
      state: "playing",
      attributes: {
        media_title: "Sample track should stay hidden",
        media_artist: "Sample artist should stay hidden",
        media_playlist: "Fallback Favorite",
        media_content_id: "favorite:sample-1",
        entity_picture: "/api/media_player_proxy/media_player.sample_speaker",
      },
    };
    hass.states["sensor.sample_favorites"].attributes.items = {
      ...(hass.states["sensor.sample_favorites"].attributes.items as Record<string, unknown>),
      "favorite:sample-7": "Seventh",
      "favorite:sample-8": "Eighth",
      "favorite:sample-9": "Ninth",
      "favorite:sample-10": "Tenth",
      "favorite:sample-11": "Eleventh",
    };

    document.body.append(element);
    element.hass = hass;

    const mediaCard = element.shadowRoot?.querySelector<HTMLElement>(".sonos-playing");
    const menuButton = element.shadowRoot?.querySelector<HTMLButtonElement>(".media-more");
    const stopButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="media-stop"]',
    );
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(mediaCard?.textContent).toContain("Sample artist should stay hidden - Sample track should stay hidden");
    expect(mediaCard?.textContent).toContain("Favorite One");
    expect(mediaCard?.querySelector(".media-subtitle")).toBeNull();
    expect(mediaCard?.querySelector(".sonos-room")?.textContent).toContain(
      "Favorite One",
    );
    expect(mediaCard?.querySelector(".sonos-room")?.textContent).not.toContain("Sample Speaker");
    expect(mediaCard?.querySelector('[aria-label="Turn off"]')).toBeNull();
    expect(stopButton?.getAttribute("aria-label")).toBe("Stop");
    expect(mediaCard?.getAttribute("style")).toContain("/api/media_player_proxy/media_player.sample_speaker");
    expect(menuButton).not.toBeNull();
    expect(mediaCard?.querySelector(".sonos-art")).not.toBeNull();
    expect(styles).toContain(".sonos-art");
    expect(styles).toMatch(/\.sonos-art\s*{[^}]*overflow:\s*hidden/s);
    expect(styles).toContain("background-image: var(--media-art, none)");
    expect(styles).toContain("overflow: visible");
    expect(styles).toContain("clip-path: inset(0 round 18px)");
    expect(styles).toContain("top: auto");
    expect(styles).toContain("bottom: calc(100% - 44px)");
    expect(styles).toContain(".favorites-popover");
    expect(styles).toMatch(/\.media-heading\.sonos-heading\s*{[^}]*display:\s*flex/s);
    expect(styles).toMatch(/\.media-heading\.sonos-heading\s*{[^}]*justify-content:\s*space-between/s);

    menuButton?.click();
    const favoriteButtons = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '[data-dashy-action="sonos-favorite"]',
      ) ?? []),
    ];

    expect(favoriteButtons.map((button) => button.textContent?.trim())).toEqual([
      "Favorite One",
      "Favorite Two",
      "Favorite Three",
      "Favorite Four",
      "Favorite Five",
      "Favorite Six",
      "Seventh",
      "Eighth",
      "Ninth",
      "Tenth",
    ]);
    expect(favoriteButtons.map((button) => button.textContent).join(" ")).not.toContain(
      "Sample track should stay hidden",
    );

    favoriteButtons[1].click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("media_player", "play_media", {
      entity_id: "media_player.sample_speaker",
      media_content_type: "favorite_item_id",
      media_content_id: "favorite:sample-2",
      enqueue: "replace",
      extra: { title: "Favorite Two" },
    });
    expect(element.shadowRoot?.querySelector(".favorites-popover")).toBeNull();

    const currentStopButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="media-stop"]',
    );
    currentStopButton?.click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("media_player", "media_stop", {
      entity_id: "media_player.sample_speaker",
    });
  });

  it("keeps a paused Sonos music player visible", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addSonosFavorites(baseHass());
    hass.states["media_player.sample_speaker"] = {
      entity_id: "media_player.sample_speaker",
      state: "paused",
      attributes: {
        source: "Music Service",
        media_playlist: "Favorite Two",
        media_content_id: "favorite:sample-2",
        media_title: "Sample Track",
        media_artist: "Sample Artist",
      },
    };

    document.body.append(element);
    element.hass = hass;

    const mediaCard = element.shadowRoot?.querySelector<HTMLElement>(".sonos-playing");

    expect(mediaCard?.querySelector(".sonos-room")?.textContent).toContain("Favorite Two");
    expect(mediaCard?.querySelector(".media-title")?.textContent).toContain("Sample Artist - Sample Track");
    expect(mediaCard?.querySelector('[data-dashy-action="media-playpause"]')).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".idle-media")).toBeNull();
  });

  it("renders weather without redundant label and keeps metrics on the main row until very narrow widths", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass();

    const weatherCard = element.shadowRoot?.querySelector(".weather-card");
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(weatherCard?.textContent).toContain("Cloudy");
    expect(weatherCard?.textContent).not.toContain("Weather");
    expect(styles).toContain("grid-template-columns: auto minmax(0, 1fr) auto");
    expect(styles).toContain("@media (max-width: 430px)");
  });

  it("uses a fitted scene grid and blue-purple active styling", () => {
    const element = document.createElement("dashy-dashboard-panel");

    document.body.append(element);

    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(styles).toContain("grid-template-columns: repeat(auto-fit, minmax(clamp(64px, 17vw, 170px), 1fr))");
    expect(styles).not.toMatch(/\.scene-grid\s*{[^}]*repeat\(4,/s);
    expect(styles).not.toMatch(/\.scene-grid\s*{[^}]*repeat\(3,/s);
    expect(styles).toContain("linear-gradient(135deg, #2563eb, #7c3aed)");
    expect(styles).not.toMatch(/\.scene-tile\.is-active\s*{[^}]*#d80000/s);
  });

  it("defines a compact narrow viewport layout that removes internal dashboard overflow", () => {
    const element = document.createElement("dashy-dashboard-panel");

    document.body.append(element);

    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(styles).toContain(
      "@media (max-width: 380px), (max-width: 430px) and (max-height: 760px)",
    );
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.dashboard\s*{[^}]*padding:\s*8px;[^}]*gap:\s*6px;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.topbar\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*gap:\s*8px;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.date\s*{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.chart\s*{[^}]*height:\s*38px;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.scene-tile\s*{[^}]*aspect-ratio:\s*1 \/ 0\.62;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.idle-media \.playlist-button\s*{[^}]*min-height:\s*34px;/,
    );
  });

  it("clips the kiosk viewport and leaves more spacing below the clock row", () => {
    const element = document.createElement("dashy-dashboard-panel");

    document.body.append(element);

    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(styles).toMatch(/:host\s*{[^}]*height:\s*100dvh/s);
    expect(styles).toMatch(/:host\s*{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.dashboard\s*{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.dashboard\s*{[^}]*overflow:\s*hidden;[^}]*overflow:\s*clip/s);
    expect(styles).toMatch(
      /\.topbar\s*{[^}]*padding-bottom:\s*clamp\(18px, 3vw, 32px\)/s,
    );
  });

  it("locks page overflow while mounted and restores the previous overflow styles", () => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "scroll";
    const element = document.createElement("dashy-dashboard-panel");

    document.body.append(element);

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    element.remove();

    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("renders shade as larger open and close pills without a stop button", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass();

    const openButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[aria-label="Open Shade"]',
    );
    const closeButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[aria-label="Close Shade"]',
    );
    const stopButton = element.shadowRoot?.querySelector('[aria-label="Stop Shade"]');
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(openButton?.classList.contains("cover-pill")).toBe(true);
    expect(closeButton?.classList.contains("cover-pill")).toBe(true);
    expect(openButton?.classList.contains("is-active")).toBe(true);
    expect(closeButton?.classList.contains("is-active")).toBe(false);
    expect(stopButton).toBeNull();
    expect(styles).toContain(".cover-pill");
    expect(styles).toContain(".cover-pill.is-active");
    expect(styles).toContain("border-radius: 999px");
  });

  it("highlights the close pill when the shade is closed", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = baseHass();
    hass.states["cover.sample_shade"] = {
      ...hass.states["cover.sample_shade"],
      state: "closed",
    };

    document.body.append(element);
    element.hass = hass;

    const openButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[aria-label="Open Shade"]',
    );
    const closeButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[aria-label="Close Shade"]',
    );

    expect(openButton?.classList.contains("is-active")).toBe(false);
    expect(closeButton?.classList.contains("is-active")).toBe(true);
  });

  it("does not render text state labels in device controls", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass();

    const controlText = element.shadowRoot?.querySelector(".controls-card")?.textContent ?? "";
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(element.shadowRoot?.querySelector(".control-copy span")).toBeNull();
    expect(controlText).toContain("Outlet");
    expect(controlText).toContain("Shade");
    expect(controlText).not.toContain("Off");
    expect(controlText).not.toContain("Open");
    expect(styles).toContain("color: #f0f0f2");
    expect(styles).not.toContain("#4b83b7");
  });

  it("keeps device action buttons in-row on small screens", () => {
    const element = document.createElement("dashy-dashboard-panel");

    document.body.append(element);

    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(styles).toContain("grid-template-columns: 34px minmax(0, 1fr) auto");
    expect(styles).toContain("gap: 10px");
    expect(styles).not.toMatch(/\.control-actions\s*{[^}]*grid-column:\s*1 \/ -1/s);
  });

  it("optimistically marks a scene tile active before Home Assistant resolves", () => {
    let resolveService: (() => void) | undefined;
    const callService = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveService = resolve;
        }),
    );
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass(callService);

    const sceneButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="scene"][data-index="5"]',
    );
    sceneButton?.click();
    const updatedSceneButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="scene"][data-index="5"]',
    );

    expect(callService).toHaveBeenCalledWith("homeassistant", "toggle", {
      entity_id: "light.sample_scene_6",
    });
    expect(updatedSceneButton?.classList.contains("is-active")).toBe(true);

    resolveService?.();
  });

  it("rolls optimistic scene state back and shows a toast when Home Assistant rejects", async () => {
    const callService = vi.fn().mockRejectedValue(new Error("HA timeout"));
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass(callService);

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-dashy-action="scene"][data-index="5"]')
      ?.click();
    await Promise.resolve();
    await Promise.resolve();

    const sceneButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="scene"][data-index="5"]',
    );
    const toast = element.shadowRoot?.querySelector(".toast");

    expect(sceneButton?.classList.contains("is-active")).toBe(false);
    expect(toast?.classList.contains("is-visible")).toBe(true);
    expect(toast?.textContent).toContain("HA timeout");
  });
});
