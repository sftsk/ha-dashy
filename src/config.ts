import type { DashboardConfig } from "./types";

declare const __DASHY_BUNDLED_DASHBOARD_CONFIG__: unknown;

const emptyDashboardConfig: DashboardConfig = {
  weather: { entity: "" },
  environment: {
    temperatureEntity: "",
    humidityEntity: "",
    maxSamples: 48,
  },
  sceneTiles: [],
  controls: [],
  badges: [],
  media: {
    players: [],
  },
};

export const defaultDashboardConfig: DashboardConfig = normalizeDashboardConfig(
  __DASHY_BUNDLED_DASHBOARD_CONFIG__,
  emptyDashboardConfig,
);

export function resolveBundledDashboardConfig(input?: unknown): DashboardConfig {
  return input === undefined || input === null
    ? defaultDashboardConfig
    : normalizeDashboardConfig(input, emptyDashboardConfig);
}

export function normalizeDashboardConfig(
  input?: unknown,
  fallbackConfig: DashboardConfig = defaultDashboardConfig,
): DashboardConfig {
  const override = isRecord(input) ? input : {};
  const media = isRecord(override.media) ? override.media : {};
  const environment = isRecord(override.environment) ? override.environment : {};
  const climate = isRecord(override.climate) ? override.climate : undefined;
  const climateActions = isRecord(climate?.actions) ? climate.actions : {};

  return {
    weather: {
      ...fallbackConfig.weather,
      ...(isRecord(override.weather) ? override.weather : {}),
    },
    environment: {
      ...fallbackConfig.environment,
      ...environment,
    },
    sceneTiles: Array.isArray(override.sceneTiles)
      ? override.sceneTiles
      : fallbackConfig.sceneTiles,
    controls: Array.isArray(override.controls)
      ? override.controls
      : fallbackConfig.controls,
    badges: Array.isArray(override.badges)
      ? override.badges
      : fallbackConfig.badges,
    climate: climate
      ? {
          ...fallbackConfig.climate,
          ...climate,
          actions: {
            ...fallbackConfig.climate?.actions,
            ...climateActions,
          },
        }
      : fallbackConfig.climate,
    media: {
      players: Array.isArray(media.players)
        ? media.players
        : fallbackConfig.media.players,
      sonos: isRecord(media.sonos)
        ? {
            ...fallbackConfig.media.sonos,
            ...media.sonos,
          }
        : fallbackConfig.media.sonos,
    },
  } as DashboardConfig;
}

export function panelConfigToDashboardConfig(
  panelConfig: unknown,
  fallbackConfig: DashboardConfig = defaultDashboardConfig,
): DashboardConfig {
  const override = isRecord(panelConfig) && isRecord(panelConfig.dashboard)
    ? panelConfig.dashboard
    : panelConfig;

  if (!isRecord(override) || Object.keys(override).length === 0) {
    return fallbackConfig;
  }

  return normalizeDashboardConfig(override, fallbackConfig);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
