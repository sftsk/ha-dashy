import { describe, expect, it } from "vitest";
import {
  MediaActivityTracker,
  getMediaDisplayMode,
  parseSonosFavorites,
  resolveSonosPlaylistName,
} from "../src/media";
import type { DashboardConfig, HassLike, HassEntity } from "../src/types";

const config: DashboardConfig["media"] = {
  players: [
    { label: "Display Player", entity: "media_player.sample_display" },
    { label: "Sample Speaker", entity: "media_player.sample_speaker" },
  ],
  idlePlaylistButtons: [
    {
      label: "Sample Preset",
      icon: "playlist",
      service: {
        domain: "script",
        service: "turn_on",
        data: { entity_id: "script.sample_preset" },
      },
    },
  ],
  sonos: {
    playerEntity: "media_player.sample_speaker",
    favoritesSensorEntity: "sensor.sample_favorites",
    limit: 3,
    ignoredSources: ["TV"],
    ignoredContentIds: ["x-rincon-stream:"],
  },
};

function hass(
  states: Record<string, string | { state: string; attributes?: Record<string, unknown> }>,
): HassLike {
  return {
    states: Object.fromEntries(
      Object.entries(states).map(([entityId, value]) => {
        const entityState = typeof value === "string" ? value : value.state;
        const attributes = typeof value === "string" ? {} : (value.attributes ?? {});
        return [
          entityId,
          { entity_id: entityId, state: entityState, attributes } satisfies HassEntity,
        ];
      }),
    ),
    callService: async () => undefined,
  };
}

describe("MediaActivityTracker", () => {
  it("selects the most recently active player when multiple players are playing", () => {
    const tracker = new MediaActivityTracker();

    tracker.update(config.players, hass({ "media_player.sample_display": "playing" }), 1000);
    tracker.update(
      config.players,
      hass({
        "media_player.sample_display": "playing",
        "media_player.sample_speaker": "playing",
      }),
      2000,
    );

    expect(tracker.selected(config.players, hass({
      "media_player.sample_display": "playing",
      "media_player.sample_speaker": "playing",
    }))?.entity).toBe("media_player.sample_speaker");
  });
});

describe("getMediaDisplayMode", () => {
  it("selects Display Player when Sonos is only relaying TV audio", () => {
    const tracker = new MediaActivityTracker();
    const state = hass({
      "media_player.sample_display": "playing",
      "media_player.sample_speaker": {
        state: "playing",
        attributes: {
          source: "TV",
          media_content_id: "x-rincon-stream:sample-relay",
        },
      },
    });
    tracker.update(config.players, state, 1000);

    expect(getMediaDisplayMode(config, tracker, state)).toEqual({
      kind: "player",
      player: { label: "Display Player", entity: "media_player.sample_display" },
    });
  });

  it("selects Sonos when it is playing music even if Display Player is also active", () => {
    const tracker = new MediaActivityTracker();
    const state = hass({
      "media_player.sample_display": "playing",
      "media_player.sample_speaker": {
        state: "playing",
        attributes: {
          source: "Music Service",
          media_content_id: "favorite:sample-1",
        },
      },
    });
    tracker.update(config.players, state, 1000);

    expect(getMediaDisplayMode(config, tracker, state)).toEqual({
      kind: "player",
      player: { label: "Sample Speaker", entity: "media_player.sample_speaker" },
    });
  });

  it("keeps the Sonos player visible when music is paused", () => {
    const tracker = new MediaActivityTracker();
    const state = hass({
      "media_player.sample_display": "idle",
      "media_player.sample_speaker": {
        state: "paused",
        attributes: {
          source: "Music Service",
          media_content_id: "favorite:sample-1",
        },
      },
    });
    tracker.update(config.players, state, 1000);

    expect(getMediaDisplayMode(config, tracker, state)).toEqual({
      kind: "player",
      player: { label: "Sample Speaker", entity: "media_player.sample_speaker" },
    });
  });

  it("does not keep the Sonos player visible when paused TV relay is the only media state", () => {
    const tracker = new MediaActivityTracker();

    const mode = getMediaDisplayMode(config, tracker, hass({
      "media_player.sample_display": "idle",
      "media_player.sample_speaker": {
        state: "paused",
        attributes: {
          source: "TV",
          media_content_id: "x-rincon-stream:sample-relay",
        },
      },
    }));

    expect(mode).toEqual({
      kind: "idle",
      buttons: config.idlePlaylistButtons,
    });
  });

  it("uses the first three Sonos favorites as idle buttons when the sensor is available", () => {
    const tracker = new MediaActivityTracker();
    const state = hass({
      "media_player.sample_display": "idle",
      "media_player.sample_speaker": "idle",
      "sensor.sample_favorites": {
        state: "6",
        attributes: {
          items: {
            "favorite:sample-1": "Favorite One",
            "favorite:sample-2": { title: "Favorite Two" },
            "favorite:sample-3": { name: "Favorite Three" },
            "favorite:sample-4": "Favorite Four",
            "favorite:sample-5": "Favorite Five",
            "favorite:sample-6": "Favorite Six",
          },
        },
      },
    });

    const mode = getMediaDisplayMode(config, tracker, state);

    expect(mode.kind).toBe("idle");
    expect(mode.kind === "idle" ? mode.buttons.map((button) => button.label) : []).toEqual([
      "Favorite One",
      "Favorite Two",
      "Favorite Three",
    ]);
    expect(mode.kind === "idle" ? mode.buttons[0].service : undefined).toEqual({
      domain: "media_player",
      service: "play_media",
      data: {
        entity_id: "media_player.sample_speaker",
        media_content_type: "favorite_item_id",
        media_content_id: "favorite:sample-1",
        enqueue: "replace",
        extra: { title: "Favorite One" },
      },
    });
  });
});

describe("Sonos favorites", () => {
  it("parses Sonos favorite items from object attributes in order", () => {
    const favorites = parseSonosFavorites(
      hass({
        "sensor.sample_favorites": {
          state: "2",
          attributes: {
            items: {
              "favorite:sample-1": "Favorite One",
              "favorite:sample-2": { title: "Favorite Two" },
            },
          },
        },
      }),
      "sensor.sample_favorites",
    );

    expect(favorites).toEqual([
      { id: "favorite:sample-1", title: "Favorite One" },
      { id: "favorite:sample-2", title: "Favorite Two" },
    ]);
  });

  it("resolves the Sonos display name from favorites before falling back to media_playlist", () => {
    const state = hass({
      "sensor.sample_favorites": {
        state: "1",
        attributes: {
          items: {
            "favorite:sample-1": "Favorite One",
          },
        },
      },
      "media_player.sample_speaker": {
        state: "playing",
        attributes: {
          media_title: "Sample track should stay hidden",
          media_playlist: "Fallback Favorite",
          media_content_id: "favorite:sample-1",
        },
      },
    });

    expect(
      resolveSonosPlaylistName(
        state.states["media_player.sample_speaker"],
        parseSonosFavorites(state, "sensor.sample_favorites"),
        "Sample Speaker",
      ),
    ).toBe("Favorite One");

    expect(
      resolveSonosPlaylistName(
        {
          ...state.states["media_player.sample_speaker"],
          attributes: {
            media_title: "Sample track should stay hidden",
            media_playlist: "Fallback Favorite",
            media_content_id: "unknown",
          },
        },
        parseSonosFavorites(state, "sensor.sample_favorites"),
        "Sample Speaker",
      ),
    ).toBe("Fallback Favorite");
  });
});
