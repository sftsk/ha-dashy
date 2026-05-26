import { describe, expect, it } from "vitest";
import { iconSvg } from "../src/icons";

describe("iconSvg", () => {
  it("has specific glyphs for sample scene tiles", () => {
    const fallback = iconSvg("unknown-dashboard-icon");

    expect(iconSvg("circle")).not.toBe(fallback);
    expect(iconSvg("owl")).not.toBe(fallback);
  });
});
