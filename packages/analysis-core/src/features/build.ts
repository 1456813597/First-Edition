import type { EventItem, FeaturePack, FeatureValue, FundamentalSnapshot, KlineBar, NewsItem, QuoteSnapshot, SymbolId } from "@stockdesk/shared";
import { nowIso } from "@stockdesk/shared";
import { atr, boll, buildIndicatorMap, ema, macd, obv, rsi, sma } from "../indicators/calc";

function pctChange(current: number, previous: number): number {
  return previous === 0 ? 0 : ((current - previous) / previous) * 100;
}

function maxDrawdown(closes: number[]): number {
  let peak = closes[0] ?? 0;
  let max = 0;
  closes.forEach((close) => {
    peak = Math.max(peak, close);
    if (peak > 0) {
      max = Math.max(max, ((peak - close) / peak) * 100);
    }
  });
  return max;
}

function feature(featureRef: string, label: string, value: string | number | boolean | null): FeatureValue {
  return { featureRef, label, value };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function pctReturns(values: number[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    if (previous === 0) {
      continue;
    }
    returns.push(((values[index] - previous) / previous) * 100);
  }
  return returns;
}

function dedupeNews(news: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return news.filter((item) => {
    const key = `${item.title}|${item.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildFeaturePack(input: {
  symbol: SymbolId;
  quote: QuoteSnapshot | null;
  dailyBars: KlineBar[];
  intradayBars: KlineBar[];
  news: NewsItem[];
  events: EventItem[];
  fundamentals?: FundamentalSnapshot | null;
  marketSummary: string[];
}): FeaturePack {
  const closes = input.dailyBars.map((bar) => bar.close);
  const volumes = input.dailyBars.map((bar) => bar.volume);
  const returns = pctReturns(closes);
  const latestClose = closes.at(-1) ?? null;
  const twentyBarWindow = input.dailyBars.slice(-20);
  const recentHigh = twentyBarWindow.length > 0 ? Math.max(...twentyBarWindow.map((bar) => bar.high)) : null;
  const recentLow = twentyBarWindow.length > 0 ? Math.min(...twentyBarWindow.map((bar) => bar.low)) : null;
  const ma5 = sma(closes, 5).at(-1) ?? null;
  const ma10 = sma(closes, 10).at(-1) ?? null;
  const ema12 = ema(closes, 12).at(-1) ?? null;
  const ema26 = ema(closes, 26).at(-1) ?? null;
  const macdSeries = macd(closes);
  const rsi14 = rsi(closes, 14).at(-1) ?? null;
  const bollSeries = boll(closes, 20);
  const atr14 = atr(input.dailyBars, 14).at(-1) ?? null;
  const obvSeries = obv(input.dailyBars).at(-1) ?? null;
  buildIndicatorMap(input.dailyBars);

  const features: FeatureValue[] = [];
  if (closes.length >= 2) {
    features.push(feature("ret_1d", "1d收益率(%)", pctChange(closes.at(-1) as number, closes.at(-2) as number)));
  }
  if (closes.length >= 6) {
    features.push(feature("ret_5d", "5d收益率(%)", pctChange(closes.at(-1) as number, closes.at(-6) as number)));
  }
  if (closes.length >= 11) {
    features.push(feature("ret_10d", "10d收益率(%)", pctChange(closes.at(-1) as number, closes.at(-11) as number)));
  }
  if (closes.length >= 21) {
    features.push(feature("ret_20d", "20d收益率(%)", pctChange(closes.at(-1) as number, closes.at(-21) as number)));
  }

  features.push(feature("volatility_10d", "10d收益率波动(%)", returns.length >= 10 ? standardDeviation(returns.slice(-10)) : null));
  features.push(feature("volatility_20d", "20d收益率波动(%)", returns.length >= 20 ? standardDeviation(returns.slice(-20)) : null));
  features.push(feature("drawdown_20d", "20d最大回撤(%)", closes.length >= 20 ? maxDrawdown(closes.slice(-20)) : null));
  features.push(feature("ma5", "MA5", ma5));
  features.push(feature("ma10", "MA10", ma10));
  features.push(feature("ema12", "EMA12", ema12));
  features.push(feature("ema26", "EMA26", ema26));
  features.push(feature("macd_diff", "MACD_DIFF", macdSeries.diff.at(-1) ?? null));
  features.push(feature("macd_signal", "MACD_SIGNAL", macdSeries.signal.at(-1) ?? null));
  features.push(feature("macd_hist", "MACD_HIST", macdSeries.histogram.at(-1) ?? null));
  features.push(feature("rsi14", "RSI14", rsi14));
  features.push(feature("boll_mid", "BOLL_MID", bollSeries.middle.at(-1) ?? null));
  features.push(feature("boll_upper", "BOLL_UPPER", bollSeries.upper.at(-1) ?? null));
  features.push(feature("boll_lower", "BOLL_LOWER", bollSeries.lower.at(-1) ?? null));
  features.push(feature("atr14", "ATR14", atr14));
  features.push(feature("obv", "OBV", obvSeries));
  features.push(feature("support_20d", "20日支撑位", recentLow));
  features.push(feature("resistance_20d", "20日压力位", recentHigh));
  features.push(feature("distance_to_high_20d_pct", "距20日高点(%)", latestClose && recentHigh ? pctChange(latestClose, recentHigh) : null));
  features.push(feature("distance_to_low_20d_pct", "距20日低点(%)", latestClose && recentLow ? pctChange(latestClose, recentLow) : null));
  features.push(
    feature(
      "volume_ratio_20d",
      "成交量/20日均量",
      volumes.length >= 20 ? (volumes.at(-1) as number) / average(volumes.slice(-20)) : null
    )
  );
  features.push(feature("quote_last", "现价", input.quote?.last ?? latestClose));
  features.push(feature("quote_change_pct", "涨跌幅(%)", input.quote?.changePct ?? null));
  features.push(feature("status", "状态", input.quote?.status ?? "normal"));
  features.push(feature("intraday_samples", "分时样本数", input.intradayBars.length));
  features.push(feature("news_count_7d", "近7天新闻数", input.news.length));
  features.push(feature("event_count_30d", "近30天事件数", input.events.length));
  features.push(feature("fund_pe_ttm", "PE(TTM)", input.fundamentals?.peTtm ?? null));
  features.push(feature("fund_pb", "PB", input.fundamentals?.pb ?? null));
  features.push(feature("fund_ps_ttm", "PS(TTM)", input.fundamentals?.psTtm ?? null));
  features.push(feature("fund_roe", "ROE(%)", input.fundamentals?.roe ?? null));
  features.push(feature("fund_net_profit_yoy", "净利同比(%)", input.fundamentals?.netProfitYoY ?? null));
  features.push(feature("fund_revenue_yoy", "营收同比(%)", input.fundamentals?.revenueYoY ?? null));
  features.push(feature("fund_total_market_cap", "总市值", input.fundamentals?.totalMarketCap ?? null));
  features.push(feature("fund_circulating_market_cap", "流通市值", input.fundamentals?.circulatingMarketCap ?? null));
  features.push(feature("fund_report_date", "财报报告期", input.fundamentals?.reportDate ?? null));

  const dataQualityFlags: string[] = [];
  if (input.dailyBars.length < 30) {
    dataQualityFlags.push("日线样本不足30根");
  }
  if (input.intradayBars.length === 0) {
    dataQualityFlags.push("缺少当日分时数据");
  }
  if (input.news.length === 0) {
    dataQualityFlags.push("近7天无新闻摘要");
  }
  if (input.events.length === 0) {
    dataQualityFlags.push("近30天无事件摘要");
  }
  if (!input.fundamentals) {
    dataQualityFlags.push("缺少财务与估值快照");
  }

  return {
    symbol: input.symbol,
    generatedAt: nowIso(),
    marketSummary: input.marketSummary,
    technicalFeatures: features,
    eventDigest: input.events.slice(0, 8),
    newsDigest: dedupeNews(input.news).slice(0, 8),
    dataQualityFlags
  };
}

export function attachIndicators(bars: KlineBar[]) {
  return buildIndicatorMap(bars);
}
