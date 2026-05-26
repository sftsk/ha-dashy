export type ChartSample = {
  temperature: number;
  humidity: number;
  timestamp: number;
};

export type PathBounds = {
  width: number;
  height: number;
  min: number;
  max: number;
  flatYRatio?: number;
};

export class ChartSampler {
  private readonly limit: number;
  private readonly buffer: ChartSample[] = [];

  constructor(limit = 48) {
    this.limit = Math.max(2, Math.floor(limit));
  }

  add(temperature: number, humidity: number, timestamp = Date.now()): void {
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
      return;
    }

    const last = this.buffer.at(-1);
    if (
      last &&
      last.temperature === temperature &&
      last.humidity === humidity &&
      timestamp - last.timestamp < 30_000
    ) {
      return;
    }

    this.buffer.push({ temperature, humidity, timestamp });
    while (this.buffer.length > this.limit) {
      this.buffer.shift();
    }
  }

  samples(): ChartSample[] {
    return [...this.buffer];
  }
}

export function buildSeriesPath(values: number[], bounds: PathBounds): string {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return "";
  }

  const range = bounds.max - bounds.min || 1;

  const xStep = bounds.width / (finite.length - 1);
  const flatY = flatLineY(finite, bounds);
  if (finite.length === 1) {
    const y = flatY ?? bounds.height / 2;
    return `M 0 ${formatNumber(y)} L ${formatNumber(bounds.width)} ${formatNumber(y)}`;
  }

  return finite
    .map((value, index) => {
      const x = xStep * index;
      const normalized = (value - bounds.min) / range;
      const y = flatY ?? bounds.height - normalized * bounds.height;
      return `${index === 0 ? "M" : "L"} ${formatNumber(x)} ${formatNumber(y)}`;
    })
    .join(" ");
}

export function paddedRange(values: number[], fallbackMin: number, fallbackMax: number) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return { min: fallbackMin, max: fallbackMax };
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }

  const padding = (max - min) * 0.15;
  return { min: min - padding, max: max + padding };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function flatLineY(values: number[], bounds: PathBounds): number | undefined {
  if (values.length === 0 || values.some((value) => value !== values[0])) {
    return undefined;
  }

  if (bounds.flatYRatio !== undefined) {
    return bounds.height * bounds.flatYRatio;
  }

  const range = bounds.max - bounds.min || 1;
  const normalized = (values[0] - bounds.min) / range;
  return bounds.height - normalized * bounds.height;
}
