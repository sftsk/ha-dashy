import { describe, expect, it } from "vitest";
import { ChartSampler, buildSeriesPath } from "../src/chart";

describe("ChartSampler", () => {
  it("keeps a bounded live-session buffer and ignores invalid values", () => {
    const sampler = new ChartSampler(3);

    sampler.add(20, 40, 1000);
    sampler.add(Number.NaN, 42, 2000);
    sampler.add(21, 41, 3000);
    sampler.add(22, 42, 4000);
    sampler.add(23, 43, 5000);

    expect(sampler.samples()).toEqual([
      { temperature: 21, humidity: 41, timestamp: 3000 },
      { temperature: 22, humidity: 42, timestamp: 4000 },
      { temperature: 23, humidity: 43, timestamp: 5000 },
    ]);
  });
});

describe("buildSeriesPath", () => {
  it("normalizes values into an SVG path inside the requested bounds", () => {
    const path = buildSeriesPath([10, 20, 30], {
      width: 120,
      height: 60,
      min: 10,
      max: 30,
    });

    expect(path).toBe("M 0 60 L 60 30 L 120 0");
  });

  it("can place flat series on separate lanes to avoid overlap", () => {
    const temperaturePath = buildSeriesPath([25.6, 25.6, 25.6], {
      width: 120,
      height: 60,
      min: 24.6,
      max: 26.6,
      flatYRatio: 0.32,
    });
    const humidityPath = buildSeriesPath([32, 32, 32], {
      width: 120,
      height: 60,
      min: 27,
      max: 37,
      flatYRatio: 0.68,
    });

    expect(temperaturePath).toBe("M 0 19.2 L 60 19.2 L 120 19.2");
    expect(humidityPath).toBe("M 0 40.8 L 60 40.8 L 120 40.8");
  });

  it("draws one-sample flat series across the full width", () => {
    const path = buildSeriesPath([25.6], {
      width: 120,
      height: 60,
      min: 24.6,
      max: 26.6,
      flatYRatio: 0.32,
    });

    expect(path).toBe("M 0 19.2 L 120 19.2");
  });
});
