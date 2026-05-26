import type { HassLike, ServiceCall } from "./types";

const TOGGLE_DOMAINS = new Set([
  "automation",
  "fan",
  "humidifier",
  "input_boolean",
  "light",
  "switch",
]);

export function serviceForToggleEntity(entityId: string): ServiceCall {
  const domain = entityId.split(".")[0] ?? "";

  if (domain === "scene" || domain === "script") {
    return {
      domain,
      service: "turn_on",
      data: { entity_id: entityId },
    };
  }

  if (TOGGLE_DOMAINS.has(domain)) {
    return {
      domain: "homeassistant",
      service: "toggle",
      data: { entity_id: entityId },
    };
  }

  return {
    domain: "homeassistant",
    service: "turn_on",
    data: { entity_id: entityId },
  };
}

export function mediaService(entityId: string, service: string): ServiceCall {
  return {
    domain: "media_player",
    service,
    data: { entity_id: entityId },
  };
}

export async function callConfiguredService(
  hass: HassLike | undefined,
  serviceCall: ServiceCall | undefined,
): Promise<void> {
  if (!hass || !serviceCall) {
    return;
  }

  await hass.callService(serviceCall.domain, serviceCall.service, serviceCall.data ?? {});
}
