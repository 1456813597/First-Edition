import {
  eventItemSchema,
  fundamentalSnapshotSchema,
  klineSeriesSchema,
  newsItemSchema,
  quoteSnapshotSchema,
  symbolLinkageSchema,
  symbolProfileSchema,
  type AdjustMode,
  type EventItem,
  type FundamentalSnapshot,
  type KlineSeries,
  type LinkageSnapshot,
  type NewsItem,
  type QuoteSnapshot,
  type SymbolLinkage,
  type SymbolProfile,
  type SymbolId,
  type Timeframe
} from "@stockdesk/shared";

export interface DataServiceHealth {
  ok: boolean;
  providerId?: string;
  providerName?: string;
  providerRepo?: string | null;
  market?: string;
  quoteSource?: string;
  klineSource?: string;
  newsSource?: string;
}

interface TradingDaysResponse {
  start: string;
  end: string;
  tradingDays: string[];
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const fallbackMessage = `Data service request failed with ${response.status}`;
    try {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { detail?: string };
        const detail = typeof payload.detail === "string" ? payload.detail : "";
        throw new Error(detail ? `${fallbackMessage}: ${detail}` : fallbackMessage);
      }

      const text = (await response.text()).trim();
      throw new Error(text ? `${fallbackMessage}: ${text}` : fallbackMessage);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(fallbackMessage);
    }
  }

  return (await response.json()) as T;
}

export class DataServiceClient {
  constructor(private readonly baseUrl: string) {}

  async getQuotes(symbols: SymbolId[]): Promise<QuoteSnapshot[]> {
    const response = await fetch(`${this.baseUrl}/quotes/realtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols })
    });
    const payload = await parseJson<unknown>(response);
    return quoteSnapshotSchema.array().parse(payload);
  }

  async getKline(input: { symbol: SymbolId; timeframe: Timeframe; adjustMode: AdjustMode; start?: string; end?: string }): Promise<KlineSeries> {
    const query = new URLSearchParams({
      timeframe: input.timeframe,
      adjust: input.adjustMode,
      ...(input.start ? { start: input.start } : {}),
      ...(input.end ? { end: input.end } : {})
    });
    const response = await fetch(`${this.baseUrl}/klines/${input.symbol}?${query.toString()}`);
    const payload = await parseJson<unknown>(response);
    return klineSeriesSchema.parse(payload);
  }

  async getNews(symbol: SymbolId, input: { start?: string; end?: string; limit?: number }): Promise<NewsItem[]> {
    const query = new URLSearchParams({
      ...(input.start ? { start: input.start } : {}),
      ...(input.end ? { end: input.end } : {}),
      limit: String(input.limit ?? 20)
    });
    const response = await fetch(`${this.baseUrl}/news/${symbol}?${query.toString()}`);
    const payload = await parseJson<unknown>(response);
    return newsItemSchema.array().parse(payload);
  }

  async getEvents(symbol: SymbolId, input: { start?: string; end?: string; limit?: number }): Promise<EventItem[]> {
    const query = new URLSearchParams({
      ...(input.start ? { start: input.start } : {}),
      ...(input.end ? { end: input.end } : {}),
      limit: String(input.limit ?? 20)
    });
    const response = await fetch(`${this.baseUrl}/events/${symbol}?${query.toString()}`);
    const payload = await parseJson<unknown>(response);
    return eventItemSchema.array().parse(payload);
  }

  async getFundamentals(symbol: SymbolId): Promise<FundamentalSnapshot> {
    const response = await fetch(`${this.baseUrl}/fundamentals/${symbol}`);
    const payload = await parseJson<unknown>(response);
    return fundamentalSnapshotSchema.parse(payload);
  }

  async getSymbolProfile(symbol: SymbolId): Promise<SymbolProfile> {
    const response = await fetch(`${this.baseUrl}/profile/${symbol}`);
    const payload = await parseJson<unknown>(response);
    return symbolProfileSchema.parse(payload);
  }

  async getSymbolLinkage(symbol: SymbolId): Promise<SymbolLinkage> {
    const response = await fetch(`${this.baseUrl}/linkage/${symbol}`);
    const payload = await parseJson<unknown>(response);
    return symbolLinkageSchema.parse(payload);
  }

  async searchSymbols(query: string) {
    const response = await fetch(`${this.baseUrl}/symbols/search?q=${encodeURIComponent(query)}&limit=20`);
    return parseJson<Array<{ symbol: string; name: string }>>(response);
  }

  async getHealth(): Promise<DataServiceHealth> {
    const response = await fetch(`${this.baseUrl}/health`);
    return parseJson<DataServiceHealth>(response);
  }

  async getTradingDays(start: string, end: string): Promise<TradingDaysResponse> {
    const query = new URLSearchParams({ start, end });
    const response = await fetch(`${this.baseUrl}/calendar/trading-days?${query.toString()}`);
    return parseJson<TradingDaysResponse>(response);
  }

  async healthCheck() {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.ok;
  }
}
