import type { IndicatorSeriesPoint, KlineBar } from "@stockdesk/shared";

function round(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  return Number(value.toFixed(4));
}

function mapSeries(bars: KlineBar[], values: Array<number | null>): IndicatorSeriesPoint[] {
  return bars.map((bar, index) => ({
    time: bar.time,
    value: round(values[index] ?? null)
  }));
}

export function sma(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = [];
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) {
      sum -= values[index - period];
    }

    result.push(index + 1 >= period ? sum / period : null);
  }

  return result;
}

export function ema(values: number[], period: number): Array<number | null> {
  const multiplier = 2 / (period + 1);
  const result: Array<number | null> = [];
  let previous: number | null = null;

  values.forEach((value, index) => {
    if (index + 1 < period) {
      result.push(null);
      return;
    }

    if (index + 1 === period) {
      previous = values.slice(0, period).reduce((sum, current) => sum + current, 0) / period;
      result.push(previous);
      return;
    }

    previous = (value - (previous ?? value)) * multiplier + (previous ?? value);
    result.push(previous);
  });

  return result;
}

export function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const diff = values.map((_, index) => (fast[index] !== null && slow[index] !== null ? (fast[index] as number) - (slow[index] as number) : null));
  const signal = ema(
    diff.map((item) => item ?? 0),
    9
  );
  const histogram = diff.map((item, index) => (item !== null && signal[index] !== null ? item - (signal[index] as number) : null));

  return { diff, signal, histogram };
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  let gainSum = 0;
  let lossSum = 0;

  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    if (index <= period) {
      gainSum += gain;
      lossSum += loss;
      if (index === period) {
        const rs = lossSum === 0 ? 100 : gainSum / lossSum;
        result[index] = 100 - 100 / (1 + rs);
      }
      continue;
    }

    gainSum = (gainSum * (period - 1) + gain) / period;
    lossSum = (lossSum * (period - 1) + loss) / period;
    const rs = lossSum === 0 ? 100 : gainSum / lossSum;
    result[index] = 100 - 100 / (1 + rs);
  }

  return result;
}

export function boll(values: number[], period = 20, deviations = 2) {
  const middle = sma(values, period);
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];

  values.forEach((_, index) => {
    if (index + 1 < period) {
      upper.push(null);
      lower.push(null);
      return;
    }

    const window = values.slice(index + 1 - period, index + 1);
    const mean = middle[index] as number;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);

    upper.push(mean + deviations * std);
    lower.push(mean - deviations * std);
  });

  return { middle, upper, lower };
}

export function atr(bars: KlineBar[], period = 14): Array<number | null> {
  const trueRanges = bars.map((bar, index) => {
    if (index === 0) {
      return bar.high - bar.low;
    }
    const previousClose = bars[index - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });

  return ema(trueRanges, period);
}

export function obv(bars: KlineBar[]): Array<number | null> {
  let current = 0;
  return bars.map((bar, index) => {
    if (index === 0) {
      current = bar.volume;
      return current;
    }

    const previous = bars[index - 1];
    if (bar.close > previous.close) {
      current += bar.volume;
    } else if (bar.close < previous.close) {
      current -= bar.volume;
    }
    return current;
  });
}

export function kdj(bars: KlineBar[], period = 9) {
  const k: Array<number | null> = [];
  const d: Array<number | null> = [];
  const j: Array<number | null> = [];
  let previousK = 50;
  let previousD = 50;

  bars.forEach((bar, index) => {
    if (index + 1 < period) {
      k.push(null);
      d.push(null);
      j.push(null);
      return;
    }

    const window = bars.slice(index + 1 - period, index + 1);
    const highest = Math.max(...window.map((item) => item.high));
    const lowest = Math.min(...window.map((item) => item.low));
    const rsv = highest === lowest ? 50 : ((bar.close - lowest) / (highest - lowest)) * 100;
    previousK = (2 / 3) * previousK + (1 / 3) * rsv;
    previousD = (2 / 3) * previousD + (1 / 3) * previousK;
    const currentJ = 3 * previousK - 2 * previousD;

    k.push(previousK);
    d.push(previousD);
    j.push(currentJ);
  });

  return { k, d, j };
}

export function buildIndicatorMap(bars: KlineBar[]) {
  const closes = bars.map((bar) => bar.close);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdSeries = macd(closes);
  const rsi14 = rsi(closes, 14);
  const bollSeries = boll(closes, 20);
  const atr14 = atr(bars, 14);
  const obvSeries = obv(bars);
  const kdjSeries = kdj(bars, 9);

  return {
    MA5: mapSeries(bars, ma5),
    MA10: mapSeries(bars, ma10),
    EMA12: mapSeries(bars, ema12),
    EMA26: mapSeries(bars, ema26),
    MACD_DIFF: mapSeries(bars, macdSeries.diff),
    MACD_SIGNAL: mapSeries(bars, macdSeries.signal),
    MACD_HIST: mapSeries(bars, macdSeries.histogram),
    RSI14: mapSeries(bars, rsi14),
    BOLL_MID: mapSeries(bars, bollSeries.middle),
    BOLL_UPPER: mapSeries(bars, bollSeries.upper),
    BOLL_LOWER: mapSeries(bars, bollSeries.lower),
    ATR14: mapSeries(bars, atr14),
    OBV: mapSeries(bars, obvSeries),
    KDJ_K: mapSeries(bars, kdjSeries.k),
    KDJ_D: mapSeries(bars, kdjSeries.d),
    KDJ_J: mapSeries(bars, kdjSeries.j)
  };
}

