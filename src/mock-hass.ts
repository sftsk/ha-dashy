import type { HassEntity, HassLike, PanelInfo } from "./types";

type DashyElement = HTMLElement & {
  hass?: HassLike;
  panel?: PanelInfo;
};

const MOCK_ART =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 340'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%230a2c2b'/%3E%3Cstop offset='.55' stop-color='%232e4a27'/%3E%3Cstop offset='1' stop-color='%23b8874a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='600' height='340' fill='url(%23g)'/%3E%3Ccircle cx='470' cy='230' r='72' fill='%23f0d7a1' fill-opacity='.28'/%3E%3C/svg%3E";

export function attachMockHomeAssistant(element: DashyElement): void {
  const params = new URLSearchParams(window.location.search);
  const mediaScenario = params.get("mock") ?? "sonos";
  const states: Record<string, HassEntity> = {
    "weather.sample_home": entity("weather.sample_home", "cloudy", {
      temperature: 19.1,
      humidity: 38,
    }),
    "sensor.sample_temperature": entity("sensor.sample_temperature", "25.6", {
      unit_of_measurement: "°C",
    }),
    "sensor.sample_humidity": entity("sensor.sample_humidity", "32", {
      unit_of_measurement: "%",
    }),
    "sensor.sample_air_quality": entity("sensor.sample_air_quality", "860", {
      unit_of_measurement: "ppm",
    }),
    "binary_sensor.sample_bin_full": entity("binary_sensor.sample_bin_full", "off"),
    "sensor.sample_water_level": entity("sensor.sample_water_level", "0"),
    "sensor.sample_appliance_state": entity(
      "sensor.sample_appliance_state",
      "Inactive",
    ),
    "sensor.sample_appliance_remaining": entity(
      "sensor.sample_appliance_remaining",
      "0 min",
    ),
    "sensor.sample_secondary_appliance_state": entity(
      "sensor.sample_secondary_appliance_state",
      "Inactive",
    ),
    "sensor.sample_secondary_appliance_remaining": entity(
      "sensor.sample_secondary_appliance_remaining",
      "0 min",
    ),
    "light.sample_scene_1": entity("light.sample_scene_1", "off"),
    "light.sample_scene_2": entity("light.sample_scene_2", "off"),
    "light.sample_scene_3": entity("light.sample_scene_3", "off"),
    "light.sample_scene_4": entity("light.sample_scene_4", "off"),
    "light.sample_scene_5": entity("light.sample_scene_5", "off"),
    "light.sample_scene_6": entity("light.sample_scene_6", "off"),
    "light.sample_scene_7": entity("light.sample_scene_7", "off"),
    "light.sample_scene_8": entity("light.sample_scene_8", "off"),
    "light.sample_scene_9": entity("light.sample_scene_9", "off"),
    "light.sample_scene_10": entity("light.sample_scene_10", "on"),
    "switch.sample_outlet": entity("switch.sample_outlet", "off"),
    "cover.sample_shade": entity("cover.sample_shade", "open"),
    "switch.sample_preset_one": entity("switch.sample_preset_one", "off"),
    "switch.sample_ambient_mode": entity("switch.sample_ambient_mode", "off"),
    "sensor.sample_favorites": entity("sensor.sample_favorites", "6", {
      items: {
        "favorite:sample-1": "Favorite One",
        "favorite:sample-2": "Favorite Two",
        "favorite:sample-3": "Favorite Three",
        "favorite:sample-4": "Favorite Four",
        "favorite:sample-5": "Favorite Five",
        "favorite:sample-6": "Favorite Six",
      },
    }),
    ...mockMediaStates(mediaScenario),
  };

  applyBadgeParams(states, params);

  const hass: HassLike = {
    states,
    callService: async (domain, service, data) => {
      const entityId = typeof data?.entity_id === "string" ? data.entity_id : "";
      if (domain === "homeassistant" && service === "toggle" && states[entityId]) {
        states[entityId] = { ...states[entityId], state: states[entityId].state === "on" ? "off" : "on" };
      }
      if (domain === "media_player" && entityId && states[entityId]) {
        states[entityId] = mediaTransition(states[entityId], service, data);
      }
      element.hass = { ...hass, states: { ...states } };
    },
    callWS: async (message) => mockBrowseMedia(message),
  };

  element.panel = { config: {} };
  element.hass = { ...hass, states: { ...states } };

  window.setInterval(() => {
    const base = Number(states["sensor.sample_temperature"].state);
    states["sensor.sample_temperature"] = {
      ...states["sensor.sample_temperature"],
      state: (base + (Math.random() - 0.5) * 0.15).toFixed(1),
    };
    element.hass = { ...hass, states: { ...states } };
  }, 5000);
}

function applyBadgeParams(
  states: Record<string, HassEntity>,
  params: URLSearchParams,
): void {
  const badges = params.get("badges")?.toLocaleLowerCase();
  const alerts = params.get("alerts")?.toLocaleLowerCase();
  const status =
    params.get("status")?.toLocaleLowerCase() ??
    (badges === "status" || badges === "running" ? "running" : undefined) ??
    (badges === "finished" ? "finished" : undefined);

  if (
    badges === "all" ||
    badges === "alerts" ||
    badges === "alert" ||
    alerts === "1" ||
    alerts === "true" ||
    alerts === "on"
  ) {
    states["binary_sensor.sample_bin_full"] = {
      ...states["binary_sensor.sample_bin_full"],
      state: "on",
    };
    states["sensor.sample_air_quality"] = {
      ...states["sensor.sample_air_quality"],
      state: "1250",
    };
    states["sensor.sample_water_level"] = {
      ...states["sensor.sample_water_level"],
      state: "1",
    };
  }

  if (badges === "all" || status === "running" || status === "run") {
    states["sensor.sample_appliance_state"] = {
      ...states["sensor.sample_appliance_state"],
      state: "Run",
    };
    states["sensor.sample_appliance_remaining"] = {
      ...states["sensor.sample_appliance_remaining"],
      state: "42 min",
    };
    states["sensor.sample_secondary_appliance_state"] = {
      ...states["sensor.sample_secondary_appliance_state"],
      state: "Run",
    };
    states["sensor.sample_secondary_appliance_remaining"] = {
      ...states["sensor.sample_secondary_appliance_remaining"],
      state: "18 min",
    };
    return;
  }

  if (status === "finished" || status === "done") {
    states["sensor.sample_appliance_state"] = {
      ...states["sensor.sample_appliance_state"],
      state: "Finished",
    };
    states["sensor.sample_secondary_appliance_state"] = {
      ...states["sensor.sample_secondary_appliance_state"],
      state: "Finished",
    };
  }
}

function entity(
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: {
      friendly_name: entityId.split(".")[1]?.replaceAll("_", " ") ?? entityId,
      ...attributes,
    },
  };
}

function mockBrowseMedia(message: Record<string, unknown>): Record<string, unknown> {
  if (!message.media_content_type) {
    return {
      title: "Sonos",
      media_content_type: "root",
      media_content_id: "",
      can_play: false,
      can_expand: true,
      children: [
        {
          title: "Favorites",
          media_content_type: "favorites",
          media_content_id: "",
          can_play: false,
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
      can_play: false,
      can_expand: true,
      children: [
        {
          title: "Playlists",
          media_content_type: "favorites_folder",
          media_content_id: "object.container.playlistContainer",
          can_play: false,
          can_expand: true,
        },
      ],
    };
  }

  return {
    title: "Playlists",
    media_content_type: "favorites_folder",
    media_content_id: "object.container.playlistContainer",
    can_play: false,
    can_expand: true,
    children: [
      "Favorite One",
      "Favorite Two",
      "Favorite Three",
      "Favorite Four",
      "Favorite Five",
    ].map((title, index) => ({
      title,
      media_content_type: "favorite_item_id",
      media_content_id: `favorite:sample-${index + 1}`,
      can_play: true,
      can_expand: false,
      thumbnail: MOCK_ART,
    })),
  };
}

function mockMediaStates(scenario: string): Record<string, HassEntity> {
  if (scenario === "idle") {
    return {
      "media_player.sample_speaker": entity("media_player.sample_speaker", "idle", {
        source: "Music Service",
      }),
      "media_player.sample_display": entity(
        "media_player.sample_display",
        "idle",
      ),
    };
  }

  if (scenario === "sonos-tv") {
    return {
      "media_player.sample_speaker": entity("media_player.sample_speaker", "playing", {
        source: "TV",
        media_content_id: "x-rincon-stream:sample-relay",
      }),
      "media_player.sample_display": entity(
        "media_player.sample_display",
        "playing",
        {
          media_title: "Sample Video",
          app_name: "Video App",
          media_position: 185,
          media_duration: 250,
          media_position_updated_at: new Date().toISOString(),
        },
      ),
    };
  }

  if (scenario === "sonos-paused") {
    return {
      "media_player.sample_speaker": entity("media_player.sample_speaker", "paused", {
        source: "Music Service",
        media_content_id: "favorite:sample-2",
        media_playlist: "Favorite Two",
        media_title: "Sample Track",
        media_artist: "Sample Artist",
        entity_picture: MOCK_ART,
        media_position: 82,
        media_duration: 230,
        media_position_updated_at: new Date().toISOString(),
        shuffle: false,
      }),
      "media_player.sample_display": entity(
        "media_player.sample_display",
        "idle",
      ),
    };
  }

  return {
    "media_player.sample_speaker": entity("media_player.sample_speaker", "playing", {
      source: "Music Service",
      media_content_id: "favorite:sample-1",
      media_playlist: "Favorite One",
      media_title: "Sample track hidden in Dashy",
      media_artist: "Sample artist hidden in Dashy",
      entity_picture: MOCK_ART,
      media_position: 82,
      media_duration: 230,
      media_position_updated_at: new Date().toISOString(),
      shuffle: false,
    }),
    "media_player.sample_display": entity(
      "media_player.sample_display",
      "playing",
      {
        media_title: "Sample Display Video",
        app_name: "Video App",
        media_position: 185,
        media_duration: 250,
        media_position_updated_at: new Date().toISOString(),
      },
    ),
  };
}

function mediaTransition(
  entityState: HassEntity,
  service: string,
  data?: Record<string, unknown>,
): HassEntity {
  if (service === "turn_off" || service === "media_stop") {
    return { ...entityState, state: "idle" };
  }
  if (service === "media_play_pause") {
    return { ...entityState, state: entityState.state === "playing" ? "paused" : "playing" };
  }
  if (service === "media_play") {
    return { ...entityState, state: "playing" };
  }
  if (service === "media_pause") {
    return { ...entityState, state: "paused" };
  }
  if (service === "play_media") {
    const extra = data?.extra;
    const title =
      typeof extra === "object" &&
      extra !== null &&
      typeof (extra as Record<string, unknown>).title === "string"
        ? (extra as Record<string, string>).title
        : entityState.attributes.media_playlist;
    return {
      ...entityState,
      state: "playing",
      attributes: {
        ...entityState.attributes,
        media_content_id: data?.media_content_id,
        media_playlist: title,
      },
    };
  }
  if (service === "shuffle_set") {
    return {
      ...entityState,
      attributes: {
        ...entityState.attributes,
        shuffle: data?.shuffle === true,
      },
    };
  }
  return entityState;
}
