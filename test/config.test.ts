import { describe, expect, it } from "vitest";
import { defaultDashboardConfig, normalizeDashboardConfig } from "../src/config";
import sampleConfig from "../dashy.config.sample.json";
import gitignore from "../.gitignore?raw";

describe("normalizeDashboardConfig", () => {
  it("uses placeholder entity IDs for the bundled public defaults", () => {
    expect(defaultDashboardConfig.weather.entity).toBe("weather.sample_home");
    expect(defaultDashboardConfig.environment).toMatchObject({
      temperatureEntity: "sensor.sample_temperature",
      humidityEntity: "sensor.sample_humidity",
    });
    expect(defaultDashboardConfig.sceneTiles.map((tile) => tile.entity)).toEqual([
      "light.sample_scene_1",
      "light.sample_scene_2",
      "light.sample_scene_3",
      "light.sample_scene_4",
      "light.sample_scene_5",
      "light.sample_scene_6",
      "light.sample_scene_7",
      "light.sample_scene_8",
      "light.sample_scene_9",
      "light.sample_scene_10",
    ]);
    expect(
      Object.fromEntries(defaultDashboardConfig.sceneTiles.map((tile) => [tile.label, tile.icon])),
    ).toMatchObject({
      "Scene 6": "circle",
      "Scene 9": "owl",
    });
    expect(defaultDashboardConfig.controls.map((control) => control.entity)).toEqual([
      "switch.sample_outlet",
      "cover.sample_shade",
    ]);
    expect(defaultDashboardConfig.media.players).toEqual([
      { label: "Display Player", entity: "media_player.sample_display" },
      { label: "Sample Speaker", entity: "media_player.sample_speaker" },
    ]);
    expect(defaultDashboardConfig.media.sonos).toEqual({
      playerEntity: "media_player.sample_speaker",
      favoritesSensorEntity: "sensor.sample_favorites",
      limit: 3,
      ignoredSources: ["TV"],
      ignoredContentIds: ["x-rincon-stream:"],
    });
    expect(defaultDashboardConfig.media.idlePlaylistButtons.map((button) => button.service.data?.entity_id)).toEqual([
      "switch.sample_preset_one",
      "switch.sample_ambient_mode",
    ]);
    expect(
      defaultDashboardConfig.badges.map((badge) => ({
        label: badge.label,
        entity: badge.entity,
        icon: badge.icon,
        tone: badge.tone,
        showState: badge.showState,
        visibility: badge.visibility,
      })),
    ).toEqual([
      {
        label: "Appliance",
        entity: "sensor.sample_appliance_remaining",
        icon: "power",
        tone: "status",
        showState: true,
        visibility: {
          condition: "state",
          entity: "sensor.sample_appliance_state",
          state: "Run",
        },
      },
      {
        label: "Bin",
        entity: "binary_sensor.sample_bin_full",
        icon: "trash",
        tone: "alert",
        showState: false,
        visibility: {
          condition: "state",
          entity: "binary_sensor.sample_bin_full",
          state: "on",
        },
      },
      {
        label: "Air Quality",
        entity: "sensor.sample_air_quality",
        icon: "co2",
        tone: "alert",
        showState: true,
        visibility: {
          condition: "numeric_state",
          entity: "sensor.sample_air_quality",
          above: 1100,
        },
      },
      {
        label: "Appliance",
        entity: "sensor.sample_appliance_state",
        icon: "power",
        tone: "status",
        showState: true,
        visibility: {
          condition: "state",
          entity: "sensor.sample_appliance_state",
          state: "Finished",
        },
      },
      {
        label: "Reservoir",
        entity: "sensor.sample_water_level",
        icon: "droplet",
        tone: "alert",
        showState: false,
        visibility: {
          condition: "numeric_state",
          entity: "sensor.sample_water_level",
          above: 0,
        },
      },
      {
        label: "Secondary Appliance",
        entity: "sensor.sample_secondary_appliance_remaining",
        icon: "power",
        tone: "status",
        showState: true,
        visibility: {
          condition: "state",
          entity: "sensor.sample_secondary_appliance_state",
          state: "Run",
        },
      },
      {
        label: "Secondary Appliance",
        entity: "sensor.sample_secondary_appliance_state",
        icon: "power",
        tone: "status",
        showState: true,
        visibility: {
          condition: "state",
          entity: "sensor.sample_secondary_appliance_state",
          state: "Finished",
        },
      },
    ]);
  });

  it("keeps defaults while allowing panel config overrides", () => {
    const config = normalizeDashboardConfig({
      media: {
        players: [{ label: "Office Speaker", entity: "media_player.office" }],
        idlePlaylistButtons: [],
      },
    });

    expect(config.weather.entity).toBe(defaultDashboardConfig.weather.entity);
    expect(config.media.players).toEqual([
      { label: "Office Speaker", entity: "media_player.office" },
    ]);
  });

  it("allows panel config to replace the default badge list", () => {
    const config = normalizeDashboardConfig({
      badges: [
        {
          label: "Only",
          entity: "binary_sensor.only_alert",
          icon: "trash",
          tone: "alert",
          showState: false,
          visibility: {
            condition: "state",
            entity: "binary_sensor.only_alert",
            state: "on",
          },
        },
      ],
    });

    expect(config.badges).toEqual([
      {
        label: "Only",
        entity: "binary_sensor.only_alert",
        icon: "trash",
        tone: "alert",
        showState: false,
        visibility: {
          condition: "state",
          entity: "binary_sensor.only_alert",
          state: "on",
        },
      },
    ]);
  });

  it("keeps the public sample config aligned with tracked defaults while ignoring local overrides", () => {
    expect(sampleConfig).toEqual(defaultDashboardConfig);
    expect(gitignore).toContain("dashy.config.local.json");
  });
});
