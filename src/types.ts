export type EntityId = string;

export type HassEntity = {
  entity_id: EntityId;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

export type HassLike = {
  states: Record<EntityId, HassEntity>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ) => Promise<unknown>;
  callWS?: (message: Record<string, unknown>) => Promise<unknown>;
  formatEntityState?: (stateObj: HassEntity, state?: string) => string;
  formatEntityAttributeValue?: (
    stateObj: HassEntity,
    attribute: string,
    value?: unknown,
  ) => string;
};

export type ServiceCall = {
  domain: string;
  service: string;
  data?: Record<string, unknown>;
  durationSeconds?: number;
  stateEntity?: EntityId;
};

export type SceneTileConfig = {
  label: string;
  icon: string;
  entity?: EntityId;
  service?: ServiceCall;
};

export type ControlActions = {
  toggle?: ServiceCall;
  primary?: ServiceCall;
  open?: ServiceCall;
  close?: ServiceCall;
  stop?: ServiceCall;
};

export type ControlConfig = {
  label: string;
  icon: string;
  entity: EntityId;
  actions: ControlActions;
};

export type ClimateActions = {
  cool?: ServiceCall;
  sleep?: ServiceCall;
  cleanAir?: ServiceCall;
  off?: ServiceCall;
};

export type ClimateConfig = {
  label: string;
  entity: EntityId;
  actions: ClimateActions;
};

export type MediaPlayerConfig = {
  label: string;
  entity: EntityId;
  priority?: number;
};

export type PlaylistButtonConfig = {
  label: string;
  icon: string;
  art?: string;
  service: ServiceCall;
};

export type BadgeTone = "alert" | "status";

export type BadgeVisibility =
  | {
      condition: "state";
      entity: EntityId;
      state: string;
    }
  | {
      condition: "numeric_state";
      entity: EntityId;
      above?: number;
      below?: number;
    };

export type DashboardBadgeConfig = {
  label: string;
  entity: EntityId;
  icon: string;
  tone: BadgeTone;
  showState: boolean;
  visibility: BadgeVisibility;
};

export type SonosConfig = {
  playerEntity: EntityId;
  favoritesSensorEntity: EntityId;
  limit?: number;
  ignoredSources?: string[];
  ignoredContentIds?: string[];
};

export type DashboardConfig = {
  weather: { entity: EntityId };
  environment: {
    temperatureEntity: EntityId;
    humidityEntity: EntityId;
    maxSamples?: number;
  };
  sceneTiles: SceneTileConfig[];
  controls: ControlConfig[];
  badges: DashboardBadgeConfig[];
  climate?: ClimateConfig;
  media: {
    players: MediaPlayerConfig[];
    sonos?: SonosConfig;
  };
};

export type PanelInfo = {
  config?: unknown;
};
