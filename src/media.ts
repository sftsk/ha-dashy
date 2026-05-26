import type {
  DashboardConfig,
  HassEntity,
  HassLike,
  MediaPlayerConfig,
  PlaylistButtonConfig,
  SonosConfig,
} from "./types";

type MediaDisplayMode =
  | {
      kind: "player";
      player: MediaPlayerConfig;
    }
  | {
      kind: "idle";
      buttons: PlaylistButtonConfig[];
    };

export class MediaActivityTracker {
  private readonly lastActive = new Map<string, number>();
  private readonly wasPlaying = new Map<string, boolean>();

  update(players: MediaPlayerConfig[], hass: HassLike | undefined, now = Date.now()): void {
    for (const player of players) {
      const isPlaying = hass?.states[player.entity]?.state === "playing";
      const previouslyPlaying = this.wasPlaying.get(player.entity) === true;

      if (isPlaying && !previouslyPlaying) {
        this.lastActive.set(player.entity, now);
      }

      if (isPlaying && !this.lastActive.has(player.entity)) {
        this.lastActive.set(player.entity, now);
      }

      this.wasPlaying.set(player.entity, isPlaying);
    }
  }

  selected(players: MediaPlayerConfig[], hass: HassLike | undefined): MediaPlayerConfig | null {
    const active = players.filter((player) => hass?.states[player.entity]?.state === "playing");
    if (active.length === 0) {
      return null;
    }

    return active
      .map((player, index) => ({
        player,
        index,
        lastActive: this.lastActive.get(player.entity) ?? 0,
        priority: player.priority ?? 0,
      }))
      .sort((left, right) => {
        if (right.lastActive !== left.lastActive) {
          return right.lastActive - left.lastActive;
        }
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }
        return left.index - right.index;
      })[0].player;
  }
}

export type SonosFavorite = {
  id: string;
  title: string;
};

export function getMediaDisplayMode(
  mediaConfig: DashboardConfig["media"],
  tracker: MediaActivityTracker,
  hass: HassLike | undefined,
): MediaDisplayMode {
  const sonosPlayer = mediaConfig.sonos
    ? mediaConfig.players.find(
        (player) => player.entity === mediaConfig.sonos?.playerEntity,
      )
    : undefined;
  const sonosEntity = mediaConfig.sonos
    ? hass?.states[mediaConfig.sonos.playerEntity]
    : undefined;

  if (
    sonosPlayer &&
    isSonosMusicSession(sonosEntity) &&
    !isIgnoredSonosPlayback(sonosEntity, mediaConfig.sonos)
  ) {
    return { kind: "player", player: sonosPlayer };
  }

  const selectablePlayers = mediaConfig.players.filter((player) => {
    if (player.entity !== mediaConfig.sonos?.playerEntity) {
      return true;
    }

    const entity = hass?.states[player.entity];
    return entity ? !isIgnoredSonosPlayback(entity, mediaConfig.sonos) : true;
  });
  const player = tracker.selected(selectablePlayers, hass);
  if (player) {
    return { kind: "player", player };
  }

  const sonosButtons = sonosFavoriteButtons(mediaConfig, hass);
  if (sonosButtons.length > 0) {
    return {
      kind: "idle",
      buttons: sonosButtons,
    };
  }

  return {
    kind: "idle",
    buttons: mediaConfig.idlePlaylistButtons,
  };
}

export function parseSonosFavorites(
  hass: HassLike | undefined,
  sensorEntity: string,
): SonosFavorite[] {
  const items = hass?.states[sensorEntity]?.attributes.items;
  if (!items || typeof items !== "object") {
    return [];
  }

  if (Array.isArray(items)) {
    return items
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const record = item as Record<string, unknown>;
        const id = stringValue(record.id) ?? stringValue(record.media_content_id);
        const title =
          stringValue(record.title) ??
          stringValue(record.name) ??
          stringValue(record.label);
        return id && title ? { id, title } : null;
      })
      .filter((favorite): favorite is SonosFavorite => favorite !== null);
  }

  return Object.entries(items as Record<string, unknown>)
    .map(([id, value]) => {
      if (typeof value === "string") {
        return { id, title: value };
      }

      if (!value || typeof value !== "object") {
        return null;
      }

      const record = value as Record<string, unknown>;
      const title =
        stringValue(record.title) ??
        stringValue(record.name) ??
        stringValue(record.label);
      return title ? { id, title } : null;
    })
    .filter((favorite): favorite is SonosFavorite => favorite !== null);
}

export function resolveSonosPlaylistName(
  entity: HassEntity | undefined,
  favorites: SonosFavorite[],
  fallback: string,
): string {
  const contentId = stringValue(entity?.attributes.media_content_id);
  const favorite = favorites.find((item) => item.id === contentId);
  return (
    favorite?.title ??
    stringValue(entity?.attributes.media_playlist) ??
    stringValue(entity?.attributes.source) ??
    fallback
  );
}

export function isIgnoredSonosPlayback(
  entity: HassEntity,
  config: SonosConfig | undefined,
): boolean {
  if (!config) {
    return false;
  }

  const source = stringValue(entity.attributes.source);
  if (
    source &&
    (config.ignoredSources ?? []).some(
      (ignored) => ignored.toLocaleLowerCase() === source.toLocaleLowerCase(),
    )
  ) {
    return true;
  }

  const contentId = stringValue(entity.attributes.media_content_id);
  return Boolean(
    contentId &&
      (config.ignoredContentIds ?? []).some((prefix) =>
        contentId.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()),
      ),
  );
}

export function sonosFavoriteButtons(
  mediaConfig: DashboardConfig["media"],
  hass: HassLike | undefined,
  limit = mediaConfig.sonos?.limit ?? 5,
): PlaylistButtonConfig[] {
  const sonos = mediaConfig.sonos;
  if (!sonos) {
    return [];
  }

  return parseSonosFavorites(hass, sonos.favoritesSensorEntity)
    .slice(0, limit)
    .map((favorite) => sonosFavoriteButton(favorite, sonos.playerEntity));
}

export function sonosFavoriteButton(
  favorite: SonosFavorite,
  targetEntity: string,
): PlaylistButtonConfig {
  return {
    label: favorite.title,
    icon: "playlist",
    service: {
      domain: "media_player",
      service: "play_media",
      data: {
        entity_id: targetEntity,
        media_content_type: "favorite_item_id",
        media_content_id: favorite.id,
        enqueue: "replace",
        extra: { title: favorite.title },
      },
    },
  };
}

function isSonosMusicSession(entity: HassEntity | undefined): entity is HassEntity {
  return entity?.state === "playing" || entity?.state === "paused";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
