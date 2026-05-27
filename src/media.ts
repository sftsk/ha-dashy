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
    const active = players.filter((player) => {
      const state = hass?.states[player.entity]?.state;
      return (
        state === "playing" ||
        (state === "paused" && this.lastActive.has(player.entity))
      );
    });
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
  art?: string;
};

type MediaBrowserItem = {
  title?: unknown;
  media_content_type?: unknown;
  media_content_id?: unknown;
  thumbnail?: unknown;
  children?: unknown;
  can_expand?: unknown;
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
    buttons: [],
  };
}

export function parseSonosFavorites(
  hass: HassLike | undefined,
  sensorEntity: string,
): SonosFavorite[] {
  const items = favoriteItems(hass?.states[sensorEntity]?.attributes);
  if (!items || typeof items !== "object") {
    return [];
  }

  if (Array.isArray(items)) {
    return items
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        return favoriteFromRecord(item as Record<string, unknown>);
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

      return favoriteFromRecord(value as Record<string, unknown>, id);
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
    .slice(0, Math.min(limit, 5))
    .map((favorite) => sonosFavoriteButton(favorite, sonos.playerEntity));
}

export function sonosFavoriteButton(
  favorite: SonosFavorite,
  targetEntity: string,
): PlaylistButtonConfig {
  return {
    label: favorite.title,
    icon: "playlist",
    ...(favorite.art ? { art: favorite.art } : {}),
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

export async function browseSonosFavoriteArtwork(
  hass: HassLike | undefined,
  playerEntity: string,
): Promise<Map<string, string>> {
  const artwork = new Map<string, string>();
  if (!hass?.callWS) {
    return artwork;
  }

  const root = await browseMediaPlayer(hass, playerEntity);
  const rootItem = mediaBrowserItem(root);
  if (!rootItem) {
    return artwork;
  }

  collectArtwork(rootItem, artwork);

  const favoritesNode =
    mediaContentType(rootItem) === "favorites"
      ? rootItem
      : findChild(rootItem, (child) => mediaContentType(child) === "favorites");
  if (!favoritesNode) {
    collectChildrenArtwork(rootItem, artwork);
    return artwork;
  }

  const favorites =
    favoritesNode === rootItem && childItems(rootItem).length > 0
      ? favoritesNode
      : mediaBrowserItem(
          await browseMediaPlayer(
            hass,
            playerEntity,
            mediaContentId(favoritesNode) ?? "",
            mediaContentType(favoritesNode) ?? "favorites",
          ),
        ) ?? favoritesNode;

  collectArtwork(favorites, artwork);
  collectChildrenArtwork(favorites, artwork);

  const favoriteFolders = childItems(favorites).filter(
    (child) =>
      mediaContentType(child) === "favorites_folder" ||
      (child.can_expand === true && mediaContentId(child) !== undefined),
  );

  for (const folder of favoriteFolders) {
    const folderId = mediaContentId(folder);
    const folderType = mediaContentType(folder);
    if (folderId === undefined || folderType === undefined) {
      continue;
    }

    const folderPayload = mediaBrowserItem(
      await browseMediaPlayer(hass, playerEntity, folderId, folderType),
    );
    if (!folderPayload) {
      continue;
    }

    collectArtwork(folderPayload, artwork);
    collectChildrenArtwork(folderPayload, artwork);
  }

  return artwork;
}

export function sonosArtworkLookupKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

async function browseMediaPlayer(
  hass: HassLike,
  entityId: string,
  mediaContentId?: string,
  mediaContentType?: string,
): Promise<unknown> {
  const message: Record<string, unknown> = {
    type: "media_player/browse_media",
    entity_id: entityId,
  };

  if (mediaContentId !== undefined) {
    message.media_content_id = mediaContentId;
  }
  if (mediaContentType !== undefined) {
    message.media_content_type = mediaContentType;
  }

  return hass.callWS?.(message);
}

function collectChildrenArtwork(
  item: MediaBrowserItem,
  artwork: Map<string, string>,
): void {
  for (const child of childItems(item)) {
    collectArtwork(child, artwork);
  }
}

function collectArtwork(
  item: MediaBrowserItem,
  artwork: Map<string, string>,
): void {
  const thumbnail = artValue(item.thumbnail);
  if (!thumbnail) {
    return;
  }

  const id = mediaContentId(item);
  const title = stringValue(item.title);
  if (id) {
    artwork.set(id, thumbnail);
  }
  if (title) {
    artwork.set(sonosArtworkLookupKey(title), thumbnail);
  }
}

function findChild(
  item: MediaBrowserItem,
  predicate: (child: MediaBrowserItem) => boolean,
): MediaBrowserItem | undefined {
  return childItems(item).find(predicate);
}

function childItems(item: MediaBrowserItem): MediaBrowserItem[] {
  return Array.isArray(item.children)
    ? item.children
        .map((child) => mediaBrowserItem(child))
        .filter((child): child is MediaBrowserItem => child !== undefined)
    : [];
}

function mediaBrowserItem(value: unknown): MediaBrowserItem | undefined {
  return value && typeof value === "object"
    ? (value as MediaBrowserItem)
    : undefined;
}

function mediaContentId(item: MediaBrowserItem): string | undefined {
  return stringValue(item.media_content_id);
}

function mediaContentType(item: MediaBrowserItem): string | undefined {
  return stringValue(item.media_content_type);
}

function isSonosMusicSession(entity: HassEntity | undefined): entity is HassEntity {
  return entity?.state === "playing" || entity?.state === "paused";
}

function favoriteItems(
  attrs: Record<string, unknown> | undefined,
): object | undefined {
  if (!attrs) {
    return undefined;
  }

  return objectValue(attrs.items) ?? objectValue(attrs.favorites);
}

function favoriteFromRecord(
  record: Record<string, unknown>,
  fallbackId?: string,
): SonosFavorite | null {
  const id =
    stringValue(record.id) ??
    stringValue(record.media_content_id) ??
    stringValue(record.favorite_id) ??
    stringValue(record.item_id) ??
    fallbackId;
  const title =
    stringValue(record.title) ??
    stringValue(record.name) ??
    stringValue(record.label);
  const art = favoriteArt(record);
  return id && title ? { id, title, ...(art ? { art } : {}) } : null;
}

function favoriteArt(record: Record<string, unknown>): string | undefined {
  return (
    artValue(record.art) ??
    artValue(record.coverArt) ??
    artValue(record.cover_art) ??
    artValue(record.cover) ??
    artValue(record.thumbnail) ??
    artValue(record.thumbnail_url) ??
    artValue(record.image) ??
    artValue(record.image_url) ??
    artValue(record.entity_picture) ??
    artValue(record.albumArt) ??
    artValue(record.album_art) ??
    artValue(record.picture) ??
    artValue(record.artwork)
  );
}

function artValue(value: unknown): string | undefined {
  const direct = stringValue(value);
  if (direct) {
    return direct;
  }

  const record = objectValue(value);
  if (!record) {
    return undefined;
  }

  return (
    stringValue(record.url) ??
    stringValue(record.uri) ??
    stringValue(record.src) ??
    stringValue(record.path)
  );
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
