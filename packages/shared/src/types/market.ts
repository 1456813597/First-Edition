export type MarketCode = "CN_A";

export type SymbolSuffix = "SH" | "SZ" | "BJ";

export type SymbolId = `${string}.${SymbolSuffix}`;

export type Timeframe = "1m" | "1d" | "1w" | "1M";

export type AdjustMode = "qfq" | "hfq" | "none";

export type QuoteStatus = "normal" | "halted" | "st" | "delisting";
export type QuoteDataSource = "live" | "cache";

export interface QuoteSnapshot {
  symbol: SymbolId;
  name: string;
  last: number;
  changePct: number;
  turnover: number | null;
  turnoverRate: number | null;
  volumeRatio: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  prevClose: number | null;
  status: QuoteStatus;
  updatedAt: string;
  dataSource: QuoteDataSource;
}

export interface KlineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number | null;
}

export interface IndicatorSeriesPoint {
  time: string;
  value: number | null;
}

export interface KlineSeries {
  symbol: SymbolId;
  timeframe: Timeframe;
  adjustMode: AdjustMode;
  bars: KlineBar[];
  indicators?: Record<string, IndicatorSeriesPoint[]>;
  updatedAt: string;
}

export interface NewsItem {
  id: string;
  symbol: SymbolId;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url: string | null;
}

export interface EventItem {
  id: string;
  symbol: SymbolId;
  type: "suspension" | "earnings_guidance" | "notice" | "other";
  title: string;
  summary: string;
  occurredAt: string;
  source: string;
}

export interface FundamentalSnapshot {
  symbol: SymbolId;
  peTtm: number | null;
  pb: number | null;
  psTtm: number | null;
  totalMarketCap: number | null;
  circulatingMarketCap: number | null;
  roe: number | null;
  netProfitYoY: number | null;
  revenueYoY: number | null;
  reportDate: string | null;
  source: string;
  updatedAt: string;
}

export interface TradingCalendarRange {
  start: string;
  end: string;
  tradingDays: string[];
}
