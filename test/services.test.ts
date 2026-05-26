import { describe, expect, it } from "vitest";
import { callConfiguredService, serviceForToggleEntity } from "../src/services";
import type { HassLike } from "../src/types";

describe("serviceForToggleEntity", () => {
  it("uses scene.turn_on for scenes and homeassistant.toggle for simple toggle domains", () => {
    expect(serviceForToggleEntity("scene.sample_scene")).toEqual({
      domain: "scene",
      service: "turn_on",
      data: { entity_id: "scene.sample_scene" },
    });
    expect(serviceForToggleEntity("light.sample_scene")).toEqual({
      domain: "homeassistant",
      service: "toggle",
      data: { entity_id: "light.sample_scene" },
    });
  });
});

describe("callConfiguredService", () => {
  it("routes service calls through hass.callService", async () => {
    const calls: Array<[string, string, Record<string, unknown>]> = [];
    const hass: HassLike = {
      states: {},
      callService: async (domain, service, data) => {
        calls.push([domain, service, data ?? {}]);
      },
    };

    await callConfiguredService(hass, {
      domain: "media_player",
      service: "media_play_pause",
      data: { entity_id: "media_player.sample_speaker" },
    });

    expect(calls).toEqual([
      ["media_player", "media_play_pause", { entity_id: "media_player.sample_speaker" }],
    ]);
  });
});
