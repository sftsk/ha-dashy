import { afterEach, describe, expect, it, vi } from "vitest";
import { attachMockHomeAssistant } from "../src/mock-hass";
import type { HassLike, PanelInfo } from "../src/types";

type DashyElement = HTMLElement & {
  hass?: HassLike;
  panel?: PanelInfo;
};

describe("attachMockHomeAssistant", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("supports URL params for testing alert and status badges", () => {
    vi.spyOn(window, "setInterval").mockReturnValue(0);
    window.history.replaceState(null, "", "/?alerts=1&status=running");
    const element = document.createElement("dashy-dashboard-panel") as DashyElement;

    attachMockHomeAssistant(element);

    expect(element.hass?.states["binary_sensor.sample_bin_full"].state).toBe("on");
    expect(element.hass?.states["sensor.sample_air_quality"].state).toBe("1250");
    expect(element.hass?.states["sensor.sample_water_level"].state).toBe("1");
    expect(element.hass?.states["sensor.sample_appliance_state"].state).toBe("Run");
    expect(element.hass?.states["sensor.sample_secondary_appliance_state"].state).toBe("Run");
  });
});
