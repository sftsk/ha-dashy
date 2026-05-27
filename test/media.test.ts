import { describe, expect, it } from "vitest";
import {
  browseSonosFavoriteArtwork,
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

  it("keeps a paused player selected after it was playing", () => {
    const tracker = new MediaActivityTracker();
    const playingState = hass({
      "media_player.sample_display": {
        state: "playing",
        attributes: { media_title: "Sample Video" },
      },
    });
    const pausedState = hass({
      "media_player.sample_display": {
        state: "paused",
        attributes: { media_title: "Sample Video" },
      },
    });

    tracker.update(config.players, playingState, 1000);
    tracker.update(config.players, pausedState, 2000);

    expect(tracker.selected(config.players, pausedState)?.entity).toBe(
      "media_player.sample_display",
    );
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
      buttons: [],
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

  it("parses optional Sonos favorite artwork metadata", () => {
    const favorites = parseSonosFavorites(
      hass({
        "sensor.sample_favorites": {
          state: "2",
          attributes: {
            items: [
              {
                id: "favorite:sample-1",
                title: "Favorite One",
                thumbnail: "/local/favorite-one.jpg",
              },
              {
                media_content_id: "favorite:sample-2",
                name: "Favorite Two",
                entity_picture: "/local/favorite-two.jpg",
              },
            ],
          },
        },
      }),
      "sensor.sample_favorites",
    );

    expect(favorites).toEqual([
      {
        id: "favorite:sample-1",
        title: "Favorite One",
        art: "/local/favorite-one.jpg",
      },
      {
        id: "favorite:sample-2",
        title: "Favorite Two",
        art: "/local/favorite-two.jpg",
      },
    ]);
  });

  it("parses Sonos favorites and nested artwork from alternate favorites attributes", () => {
    const favorites = parseSonosFavorites(
      hass({
        "sensor.sample_favorites": {
          state: "3",
          attributes: {
            favorites: {
              "favorite:sample-1": {
                title: "Favorite One",
                thumbnail: { url: "/local/favorite-one.jpg" },
              },
              "favorite:sample-2": {
                name: "Favorite Two",
                image: { uri: "/local/favorite-two.jpg" },
              },
              "favorite:sample-3": {
                label: "Favorite Three",
              },
            },
          },
        },
      }),
      "sensor.sample_favorites",
    );

    expect(favorites).toEqual([
      {
        id: "favorite:sample-1",
        title: "Favorite One",
        art: "/local/favorite-one.jpg",
      },
      {
        id: "favorite:sample-2",
        title: "Favorite Two",
        art: "/local/favorite-two.jpg",
      },
      {
        id: "favorite:sample-3",
        title: "Favorite Three",
      },
    ]);
  });

  it("collects Sonos favorite artwork from Home Assistant media browser thumbnails", async () => {
    const calls: Record<string, unknown>[] = [];
    const state: HassLike = {
      ...hass({}),
      callWS: async (message) => {
        calls.push(message);
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
            {
              title: "Bedtime Beats",
              media_content_type: "favorite_item_id",
              media_content_id: "favorite:sample-2",
              thumbnail:
                "/api/media_player_proxy/media_player.sample_speaker/browse_media/favorite_item_id/favorite%3Asample-2?token=abc",
            },
          ],
        };
      },
    };

    const artwork = await browseSonosFavoriteArtwork(
      state,
      "media_player.sample_speaker",
    );

    expect(calls).toEqual([
      {
        type: "media_player/browse_media",
        entity_id: "media_player.sample_speaker",
      },
      {
        type: "media_player/browse_media",
        entity_id: "media_player.sample_speaker",
        media_content_id: "",
        media_content_type: "favorites",
      },
      {
        type: "media_player/browse_media",
        entity_id: "media_player.sample_speaker",
        media_content_id: "object.container.playlistContainer",
        media_content_type: "favorites_folder",
      },
    ]);
    expect(artwork.get("favorite:sample-1")).toContain("favorite%3Asample-1");
    expect(artwork.get("a-list pop")).toContain("favorite%3Asample-1");
    expect(artwork.get("favorite:sample-2")).toContain("favorite%3Asample-2");
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
