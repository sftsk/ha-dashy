import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      "climate.sample_heat_pump": {
        entity_id: "climate.sample_heat_pump",
        state: "off",
        attributes: {
          current_temperature: 24.8,
          temperature: 23,
          fan_mode: "auto",
        },
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
        "favorite:sample-1": {
          title: "Favorite One With A Very Long Name That Needs Truncation",
          thumbnail: '/local/favorite-one "mix".jpg',
        },
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

function addSonosFavoritesWithoutArt(hass: HassLike): HassLike {
  hass.states["sensor.sample_favorites"] = {
    entity_id: "sensor.sample_favorites",
    state: "5",
    attributes: {
      items: {
        "favorite:sample-1": "A-List Pop",
        "favorite:sample-2": "Bedtime Beats",
        "favorite:sample-3": "Electronic in Spatial Audio",
        "favorite:sample-4": "Favourite Songs",
        "favorite:sample-5": "Lo-Fi Breeze",
      },
    },
  };
  return hass;
}

async function flushPromises(times = 5): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => window.setTimeout(resolve, 0));
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render idle playlist buttons without Sonos favorites", () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass(callService);

    expect(element.shadowRoot?.querySelector('[data-dashy-action="playlist"]')).toBeNull();
    expect(element.shadowRoot?.querySelector(".idle-media")).toBeNull();
    expect(callService).not.toHaveBeenCalled();
  });

  it("renders up to five Sonos favorites as compact artwork cards while idle and optimistically starts the selected favorite", async () => {
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
      "Favorite One With A Very Long Name That Needs Truncation",
      "Favorite Two",
      "Favorite Three",
      "Favorite Four",
      "Favorite Five",
    ]);
    expect(element.shadowRoot?.querySelector(".idle-media")?.textContent).not.toContain(
      "Choose a playlist",
    );
    expect(element.shadowRoot?.querySelector(".idle-media")?.textContent).not.toContain(
      "Start Music",
    );
    expect(element.shadowRoot?.querySelector(".idle-media.card")).toBeNull();
    expect(buttons).toHaveLength(5);
    expect(buttons[0].getAttribute("style")).toContain(
      '--playlist-art: url("/local/favorite-one \\"mix\\".jpg")',
    );
    expect(buttons[0].querySelector(".playlist-art")).not.toBeNull();
    expect(buttons[0].querySelector(".playlist-play-button")).not.toBeNull();
    expect(buttons[0].querySelector(".playlist-note")).toBeNull();
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";
    expect(styles).toContain(".idle-media .playlist-button");
    expect(styles).toContain(
      "grid-template-columns: repeat(auto-fill, minmax(clamp(64px, 22%, 220px), 1fr))",
    );
    expect(styles).not.toContain(
      "grid-template-columns: repeat(auto-fit, minmax(clamp(64px, 22%, 220px), 1fr))",
    );
    expect(styles).not.toContain("clamp(64px, 22vw, 220px)");
    expect(styles).not.toContain("clamp(72px, 23%, 260px)");
    expect(styles).not.toContain("clamp(58px, 30%, 130px)");
    expect(styles).toMatch(/\.playlist-button\s*{[^}]*aspect-ratio:\s*1 \/ 1;/s);
    expect(styles).toMatch(/\.playlist-button\s*{[^}]*padding:\s*7px 7px 14px;/s);
    expect(styles).toMatch(/\.playlist-art::after\s*{[^}]*bottom:\s*0;/s);
    expect(styles).toMatch(/\.playlist-art::after\s*{[^}]*height:\s*58%;/s);
    expect(styles).toMatch(/\.playlist-art::after\s*{[^}]*rgba\(0,\s*0,\s*0,\s*0\)/s);
    expect(styles).toMatch(/\.playlist-play-button\s*{[^}]*color:\s*#fff/s);
    expect(styles).toMatch(/\.playlist-play-button\s*{[^}]*background:\s*rgb\(0 0 0 \/ 28%\)/s);
    expect(styles).toMatch(
      /\.playlist-play-button\s*{[^}]*width:\s*clamp\(30px,\s*7vw,\s*44px\);/s,
    );
    expect(styles).toMatch(
      /\.playlist-play-button\s*{[^}]*height:\s*clamp\(30px,\s*7vw,\s*44px\);/s,
    );
    expect(styles).not.toMatch(/\.playlist-play-button\s*{[^}]*padding:\s*22%/s);
    expect(styles).toMatch(/\.playlist-play-button path\s*{[^}]*transform:\s*scale\(0\.9\)/s);
    expect(styles).toMatch(/\.playlist-button span\s*{[^}]*text-overflow:\s*ellipsis/s);
    expect(styles).toMatch(
      /\.idle-media \.playlist-button\s*{[^}]*padding:\s*5px 5px 11px;/s,
    );
    expect(styles).not.toMatch(/\.playlist-button span\s*{[^}]*background:/s);

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

  it("hydrates idle playlist artwork from the Home Assistant Sonos media browser", async () => {
    const callWS = vi.fn(async (message: Record<string, unknown>) => {
      if (!message.media_content_type) {
        return {
          title: "Sonos",
          media_content_type: "root",
          media_content_id: "",
          children: [
            {
              title: "Favorites",
              media_content_type: "favorites",
              media_content_id: "",
              can_expand: true,
            },
          ],
        };
      }

      if (message.media_content_type === "favorites") {
        return {
          title: "Favorites",
          media_content_type: "favorites",
          media_content_id: "",
          children: [
            {
              title: "Playlists",
              media_content_type: "favorites_folder",
              media_content_id: "object.container.playlistContainer",
              can_expand: true,
            },
          ],
        };
      }

      return {
        title: "Playlists",
        media_content_type: "favorites_folder",
        media_content_id: "object.container.playlistContainer",
        children: [
          {
            title: "A-List Pop",
            media_content_type: "favorite_item_id",
            media_content_id: "favorite:sample-1",
            thumbnail:
              "/api/media_player_proxy/media_player.sample_speaker/browse_media/favorite_item_id/favorite%3Asample-1?token=abc",
          },
        ],
      };
    });
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addSonosFavoritesWithoutArt(baseHass());
    hass.callWS = callWS;

    document.body.append(element);
    element.hass = hass;
    await flushPromises();

    const firstPlaylist = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="playlist"]',
    );

    expect(callWS).toHaveBeenCalledWith({
      type: "media_player/browse_media",
      entity_id: "media_player.sample_speaker",
    });
    expect(firstPlaylist?.getAttribute("style")).toContain(
      "/api/media_player_proxy/media_player.sample_speaker/browse_media/favorite_item_id/favorite%3Asample-1?token=abc",
    );
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
    const controls = mediaCard?.querySelector<HTMLElement>(".player-controls");
    const powerButton = controls?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="media-power"]',
    );
    const transportButtons = [
      ...(controls?.querySelectorAll<HTMLButtonElement>(
        ".media-transport-controls [data-dashy-action]",
      ) ?? []),
    ];
    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(mediaCard?.textContent).toContain("Sample Video");
    expect(mediaCard?.textContent).toContain("Video App");
    expect(mediaCard?.textContent).not.toContain("Display Player");
    expect(element.shadowRoot?.querySelector(".media-more")).toBeNull();
    expect(controls?.firstElementChild).toBe(powerButton);
    expect(
      transportButtons.map((button) => button.dataset.dashyAction),
    ).toEqual(["media-previous", "media-playpause", "media-next"]);
    expect(styles).toMatch(/\.media-controls\.player-controls\s*{[^}]*display:\s*grid/s);
    expect(styles).toMatch(
      /\.media-controls\.player-controls > button\[data-dashy-action="media-power"\]\s*{[^}]*justify-self:\s*start/s,
    );
    expect(styles).toMatch(/\.media-heading > div\s*{[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.media-title\s*{[^}]*white-space:\s*nowrap/s);
    expect(styles).toMatch(/\.media-title\s*{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.media-title\s*{[^}]*text-overflow:\s*ellipsis/s);
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
    expect(element.shadowRoot?.querySelector('[data-dashy-action="media-shuffle"]')).toBeNull();
  });

  it("does not render Display Player controls when Apple TV reports standby", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addSonosFavorites(baseHass());

    document.body.append(element);
    element.hass = {
      ...hass,
      states: {
        ...hass.states,
        "media_player.sample_display": {
          entity_id: "media_player.sample_display",
          state: "playing",
          attributes: {
            media_title: "Sample Video",
            app_name: "Video App",
          },
        },
      },
    };
    element.hass = {
      ...hass,
      states: {
        ...hass.states,
        "media_player.sample_display": {
          entity_id: "media_player.sample_display",
          state: "paused",
          attributes: {
            app_name: "Standby",
          },
        },
      },
    };

    expect(element.shadowRoot?.querySelector(".player-controls")).toBeNull();
    expect(element.shadowRoot?.querySelector(".idle-media")).not.toBeNull();
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
        shuffle: true,
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
    const shuffleButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="media-shuffle"]',
    );
    const controls = mediaCard?.querySelector<HTMLElement>(".sonos-controls");
    const transportButtons = [
      ...(controls?.querySelectorAll<HTMLButtonElement>(
        ".media-transport-controls [data-dashy-action]",
      ) ?? []),
    ];
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
    expect(stopButton?.querySelector(".media-stop-icon")).not.toBeNull();
    expect(shuffleButton?.getAttribute("aria-label")).toBe("Turn shuffle off");
    expect(shuffleButton?.classList.contains("is-active")).toBe(true);
    expect(controls?.firstElementChild).toBe(stopButton);
    expect(controls?.lastElementChild).toBe(shuffleButton);
    expect(
      transportButtons.map((button) => button.dataset.dashyAction),
    ).toEqual(["media-previous", "media-playpause", "media-next"]);
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
    expect(styles).toMatch(/\.sonos-room h2\s*{[^}]*color:\s*#fff/s);
    expect(styles).toMatch(/\.sonos-playing \.media-title\s*{[^}]*color:\s*#fff/s);
    expect(styles).toMatch(/\.media-controls\.sonos-controls,\s*\.media-controls\.player-controls\s*{[^}]*display:\s*grid/s);
    expect(styles).toMatch(
      /\.media-controls\.sonos-controls,\s*\.media-controls\.player-controls\s*{[^}]*grid-template-columns:\s*minmax\(34px,\s*1fr\) auto minmax\(34px,\s*1fr\)/s,
    );
    expect(styles).toMatch(/\.media-transport-controls\s*{[^}]*justify-self:\s*center/s);
    expect(styles).toMatch(
      /\.media-controls\.sonos-controls > button\[data-dashy-action="media-stop"\]\s*{[^}]*justify-self:\s*start/s,
    );
    expect(styles).toMatch(
      /\.media-controls\.sonos-controls > button\[data-dashy-action="media-shuffle"\]\s*{[^}]*justify-self:\s*end/s,
    );
    expect(styles).toMatch(/\.media-controls button\.is-active\s*{[^}]*color:\s*#5da2ff/s);
    expect(styles).toMatch(/\.media-controls button\.is-active\s*{[^}]*background:\s*transparent/s);

    shuffleButton?.click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("media_player", "shuffle_set", {
      entity_id: "media_player.sample_speaker",
      shuffle: false,
    });

    menuButton?.click();
    const favoriteButtons = [
      ...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '[data-dashy-action="sonos-favorite"]',
      ) ?? []),
    ];

    expect(favoriteButtons.map((button) => button.textContent?.trim())).toEqual([
      "Favorite One With A Very Long Name That Needs Truncation",
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

  it("can start a Sonos favorite immediately after stopping the current one", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addSonosFavorites(baseHass(callService));
    hass.states["media_player.sample_speaker"] = {
      entity_id: "media_player.sample_speaker",
      state: "playing",
      attributes: {
        source: "Music Service",
        media_playlist: "Favorite One",
        media_content_id: "favorite:sample-1",
      },
    };

    document.body.append(element);
    element.hass = hass;

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-dashy-action="media-stop"]')
      ?.click();
    await Promise.resolve();

    const favoriteButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="playlist"][data-index="1"]',
    );
    expect(favoriteButton?.textContent).toContain("Favorite Two");

    favoriteButton?.click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("media_player", "media_stop", {
      entity_id: "media_player.sample_speaker",
    });
    expect(callService).toHaveBeenCalledWith("media_player", "play_media", {
      entity_id: "media_player.sample_speaker",
      media_content_type: "favorite_item_id",
      media_content_id: "favorite:sample-2",
      enqueue: "replace",
      extra: { title: "Favorite Two" },
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

  it("resumes a paused Sonos track with media_play instead of toggling or starting a favorite", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = addSonosFavorites(baseHass(callService));
    hass.states["media_player.sample_speaker"] = {
      entity_id: "media_player.sample_speaker",
      state: "paused",
      attributes: {
        source: "Music Service",
        media_playlist: "Favorite Two",
        media_content_id: "favorite:sample-2",
        media_title: "Current Track",
        media_artist: "Current Artist",
        media_position: 42,
        media_duration: 180,
        shuffle: true,
      },
    };

    document.body.append(element);
    element.hass = hass;

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-dashy-action="media-playpause"]')
      ?.click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("media_player", "media_play", {
      entity_id: "media_player.sample_speaker",
    });
    expect(callService).not.toHaveBeenCalledWith(
      "media_player",
      "media_play_pause",
      expect.anything(),
    );
    expect(callService).not.toHaveBeenCalledWith(
      "media_player",
      "play_media",
      expect.anything(),
    );
  });

  it("updates active media progress from media_position_updated_at without a new hass state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
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
        media_position: 10,
        media_duration: 100,
        media_position_updated_at: "2026-05-27T12:00:00.000Z",
      },
    };

    document.body.append(element);
    element.hass = hass;

    const progressWidth = (): string | undefined =>
      element.shadowRoot
        ?.querySelector<HTMLElement>(".progress span")
        ?.style.getPropertyValue("width");

    expect(progressWidth()).toBe("10%");

    vi.advanceTimersByTime(5_000);

    expect(progressWidth()).toBe("15%");
  });

  it("keeps a paused generic media player visible after it was playing", () => {
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = baseHass();

    document.body.append(element);
    element.hass = {
      ...hass,
      states: {
        ...hass.states,
        "media_player.sample_display": {
          entity_id: "media_player.sample_display",
          state: "playing",
          attributes: {
            media_title: "Sample Video",
            app_name: "Video App",
          },
        },
      },
    };
    element.hass = {
      ...hass,
      states: {
        ...hass.states,
        "media_player.sample_display": {
          entity_id: "media_player.sample_display",
          state: "paused",
          attributes: {
            media_title: "Sample Video",
            app_name: "Video App",
          },
        },
      },
    };

    const mediaCard = element.shadowRoot?.querySelector<HTMLElement>(".now-playing");

    expect(mediaCard?.textContent).toContain("Sample Video");
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

    expect(styles).toContain("grid-template-columns: repeat(auto-fit, minmax(clamp(64px, 17%, 170px), 1fr))");
    expect(styles).not.toContain("clamp(64px, 17vw, 170px)");
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
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.scene-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(clamp\(54px,\s*17%,\s*150px\),\s*1fr\)\)/,
    );
    expect(styles).not.toContain("clamp(54px, 17vw, 150px)");
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.scene-tile\s*{[^}]*aspect-ratio:\s*1 \/ 0\.62;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 380px\), \(max-width: 430px\) and \(max-height: 760px\)[\s\S]*\.idle-media \.playlist-button\s*{[^}]*aspect-ratio:\s*1 \/ 1;/,
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
    expect(controlText).not.toContain("Open");
    expect(styles).toContain("color: #f0f0f2");
    expect(styles).not.toContain("#4b83b7");
  });

  it("renders climate as an AC three-way toggle in device controls and calls each service", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };

    document.body.append(element);
    element.hass = baseHass(callService);

    const controls = element.shadowRoot?.querySelector('[data-region="controls"]');
    const controlsCard = element.shadowRoot?.querySelector(".controls-card");
    const media = element.shadowRoot?.querySelector('[data-region="media"]');
    const climateRow = element.shadowRoot?.querySelector(".climate-row");
    const climateActions = element.shadowRoot?.querySelector(".climate-actions");
    const climateButtons = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        ".climate-actions button",
      ) ?? [],
    );
    const [coolButton, cleanAirButton, offButton] = climateButtons;

    expect(climateRow?.closest(".controls-card")).toBe(controlsCard);
    expect(climateRow?.closest('[data-region="controls"]')).toBe(controls);
    expect(climateRow?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "AC Cool Clean Off",
    );
    expect(element.shadowRoot?.querySelector(".climate-card")).toBeNull();
    expect(element.shadowRoot?.querySelector(".climate-state")).toBeNull();
    expect(climateActions?.getAttribute("role")).toBe("group");
    expect(climateActions?.getAttribute("aria-label")).toBe("Sample Heat Pump mode");
    expect(climateButtons.map((button) => button.textContent?.trim())).toEqual([
      "Cool",
      "Clean",
      "Off",
    ]);
    expect(climateButtons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(controls?.compareDocumentPosition(media as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    coolButton?.click();
    await Promise.resolve();
    cleanAirButton?.click();
    await Promise.resolve();
    offButton?.click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("script", "turn_on", {
      entity_id: "script.sample_cool_23",
    });
    expect(callService).toHaveBeenCalledWith("script", "turn_on", {
      entity_id: "script.sample_dry_then_fan_30m",
    });
    expect(callService).toHaveBeenCalledWith("climate", "turn_off", {
      entity_id: "climate.sample_heat_pump",
    });
  });

  it("marks the active climate toggle segment", () => {
    const cases: Array<[string, string[]]> = [
      ["cool", ["true", "false", "false"]],
      ["dry", ["false", "true", "false"]],
      ["fan_only", ["false", "true", "false"]],
      ["off", ["false", "false", "true"]],
      ["unknown", ["false", "false", "false"]],
    ];

    for (const [state, pressedStates] of cases) {
      document.body.innerHTML = "";
      const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
        hass: HassLike;
      };
      const hass = baseHass();
      hass.states["climate.sample_heat_pump"] = {
        ...hass.states["climate.sample_heat_pump"],
        state,
      };

      document.body.append(element);
      element.hass = hass;

      const climateButtons = Array.from(
        element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
          ".climate-actions button",
        ) ?? [],
      );

      expect(climateButtons.map((button) => button.getAttribute("aria-pressed"))).toEqual(
        pressedStates,
      );
      expect(climateButtons.map((button) => button.classList.contains("is-active"))).toEqual(
        pressedStates.map((pressed) => pressed === "true"),
      );
    }
  });

  it("turns the heat pump off from the active clean segment", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const element = document.createElement("dashy-dashboard-panel") as HTMLElement & {
      hass: HassLike;
    };
    const hass = baseHass(callService);
    hass.states["climate.sample_heat_pump"] = {
      ...hass.states["climate.sample_heat_pump"],
      state: "fan_only",
      attributes: {
        current_temperature: 24.8,
        temperature: 23,
        fan_mode: "powerful",
      },
    };

    document.body.append(element);
    element.hass = hass;

    const climateRow = element.shadowRoot?.querySelector(".climate-row");
    const offButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="climate-off"]',
    );

    const cleanAirButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-dashy-action="climate-cleanAir"]',
    );

    expect(climateRow?.textContent).toContain("AC");
    expect(climateRow?.textContent).not.toContain("Fan Only");
    expect(element.shadowRoot?.querySelector(".climate-state")).toBeNull();
    expect(cleanAirButton?.classList.contains("is-active")).toBe(true);
    expect(offButton).not.toBeNull();
    expect(offButton?.textContent?.trim()).toBe("Off");
    expect(offButton?.getAttribute("aria-pressed")).toBe("false");

    offButton?.click();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith("climate", "turn_off", {
      entity_id: "climate.sample_heat_pump",
    });
  });

  it("keeps device action buttons in-row on small screens", () => {
    const element = document.createElement("dashy-dashboard-panel");

    document.body.append(element);

    const styles = element.shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(styles).toContain("grid-template-columns: 34px minmax(0, 1fr) auto");
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(styles).toContain(
      '.climate-actions button.is-active[data-dashy-action="climate-off"]',
    );
    expect(styles).toContain(".control-actions.climate-actions");
    expect(styles).toMatch(/\.climate-actions\s*{[^}]*gap:\s*0;/s);
    expect(styles).toContain("gap: 10px");
    expect(styles).not.toMatch(/\.control-actions\s*{[^}]*grid-column:\s*1 \/ -1/s);
    expect(styles).not.toContain("flex-wrap: wrap");
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
