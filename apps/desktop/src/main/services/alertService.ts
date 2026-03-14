import { nowIso, type AlertRule, type QuoteSnapshot, type SymbolId } from "@stockdesk/shared";
import { AlertRepo } from "@stockdesk/db";
import { DataServiceClient } from "./dataServiceClient";

function toFixed(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return value.toFixed(digits);
}

function startDateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export class AlertService {
  private ma20Cache = new Map<string, { value: number | null; expiresAt: number }>();
  private readonly ma20TtlMs = 60_000;
  private readonly evaluatingSymbols = new Set<string>();

  constructor(
    private readonly deps: {
      alertRepo: AlertRepo;
      dataServiceClient: DataServiceClient;
    }
  ) {}

  listRules(symbol?: string) {
    return this.deps.alertRepo.listRules(symbol);
  }

  saveRule(input: {
    id?: string;
    symbol: string;
    type: AlertRule["type"];
    name?: string;
    enabled?: boolean;
    params?: Record<string, string | number | boolean | null>;
  }) {
    return this.deps.alertRepo.saveRule(input);
  }

  deleteRule(id: string) {
    this.deps.alertRepo.deleteRule(id);
  }

  listEvents(filter?: { symbol?: string; limit?: number }) {
    return this.deps.alertRepo.listEvents(filter);
  }

  markEventRead(id: string) {
    this.deps.alertRepo.markEventRead(id);
  }

  async evaluate(input?: { symbol?: string }) {
    const symbols = input?.symbol
      ? [input.symbol as SymbolId]
      : [...new Set(this.deps.alertRepo.listRules().map((rule) => rule.symbol as SymbolId))];
    if (symbols.length === 0) {
      return { ok: true, message: "No symbols configured for alerts.", triggered: 0 };
    }

    const quotes = await this.deps.dataServiceClient.getQuotes(symbols);
    const triggered = await this.evaluateQuotes(quotes);
    return {
      ok: true,
      message: triggered > 0 ? `Triggered ${triggered} alert(s).` : "No alerts triggered.",
      triggered
    };
  }

  async evaluateQuotes(quotes: QuoteSnapshot[]): Promise<number> {
    if (quotes.length === 0) {
      return 0;
    }

    const symbolSet = [...new Set(quotes.map((quote) => quote.symbol))];
    const rules = this.deps.alertRepo.listEnabledRulesBySymbols(symbolSet);
    if (rules.length === 0) {
      return 0;
    }

    const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    let triggeredCount = 0;

    for (const rule of rules) {
      if (this.evaluatingSymbols.has(rule.symbol)) {
        continue;
      }
      this.evaluatingSymbols.add(rule.symbol);
      try {
        const quote = quoteBySymbol.get(rule.symbol as SymbolId);
        if (!quote) {
          continue;
        }
        const shouldSkip = this.wasTriggeredToday(rule.lastTriggeredAt);
        if (shouldSkip) {
          continue;
        }

        const triggered = await this.evaluateRule(rule, quote);
        if (!triggered) {
          continue;
        }

        const triggeredAt = nowIso();
        this.deps.alertRepo.createEvent({
          ruleId: rule.id,
          symbol: rule.symbol,
          type: rule.type,
          title: triggered.title,
          message: triggered.message,
          context: triggered.context,
          triggeredAt
        });
        this.deps.alertRepo.updateLastTriggered(rule.id, triggeredAt);
        triggeredCount += 1;
      } finally {
        this.evaluatingSymbols.delete(rule.symbol);
      }
    }

    return triggeredCount;
  }

  private wasTriggeredToday(lastTriggeredAt: string | null) {
    if (!lastTriggeredAt) {
      return false;
    }
    return lastTriggeredAt.slice(0, 10) === nowIso().slice(0, 10);
  }

  private async evaluateRule(rule: AlertRule, quote: QuoteSnapshot): Promise<{
    title: string;
    message: string;
    context: Record<string, string | number | boolean | null>;
  } | null> {
    if (rule.type === "price_above") {
      const threshold = Number(rule.params.price ?? 0);
      if (Number.isFinite(threshold) && quote.last >= threshold) {
        return {
          title: `${quote.symbol} 价格上穿 ${threshold.toFixed(2)}`,
          message: `现价 ${toFixed(quote.last)}，已达到上方价格提醒。`,
          context: { last: quote.last, threshold }
        };
      }
      return null;
    }

    if (rule.type === "price_below") {
      const threshold = Number(rule.params.price ?? 0);
      if (Number.isFinite(threshold) && quote.last <= threshold) {
        return {
          title: `${quote.symbol} 价格跌破 ${threshold.toFixed(2)}`,
          message: `现价 ${toFixed(quote.last)}，已触发下方价格提醒。`,
          context: { last: quote.last, threshold }
        };
      }
      return null;
    }

    if (rule.type === "price_below_ma20") {
      const ma20 = await this.getMa20(rule.symbol as SymbolId);
      if (ma20 != null && quote.last < ma20) {
        return {
          title: `${quote.symbol} 跌破 20 日线`,
          message: `现价 ${toFixed(quote.last)}，MA20 ${toFixed(ma20)}。`,
          context: { last: quote.last, ma20 }
        };
      }
      return null;
    }

    if (rule.type === "volume_breakout") {
      const minVolumeRatio = Number(rule.params.minVolumeRatio ?? 2);
      const minChangePct = Number(rule.params.minChangePct ?? 0);
      if ((quote.volumeRatio ?? 0) >= minVolumeRatio && quote.changePct >= minChangePct) {
        return {
          title: `${quote.symbol} 放量突破提醒`,
          message: `量比 ${toFixed(quote.volumeRatio)}，涨跌幅 ${toFixed(quote.changePct)}%。`,
          context: { volumeRatio: quote.volumeRatio, changePct: quote.changePct, minVolumeRatio, minChangePct }
        };
      }
      return null;
    }

    if (rule.type === "limit_up_open") {
      if (!quote.prevClose || !quote.high) {
        return null;
      }
      const limitPct = quote.status === "st" ? 0.05 : 0.1;
      const limitPrice = quote.prevClose * (1 + limitPct);
      const touchedLimit = quote.high >= limitPrice * 0.999;
      const opened = quote.last < limitPrice * 0.995;
      if (touchedLimit && opened) {
        return {
          title: `${quote.symbol} 涨停打开提醒`,
          message: `涨停价 ${toFixed(limitPrice)}，最新价 ${toFixed(quote.last)}。`,
          context: { limitPrice, last: quote.last, high: quote.high }
        };
      }
      return null;
    }

    return null;
  }

  private async getMa20(symbol: SymbolId): Promise<number | null> {
    const current = this.ma20Cache.get(symbol);
    const now = Date.now();
    if (current && current.expiresAt > now) {
      return current.value;
    }

    try {
      const series = await this.deps.dataServiceClient.getKline({
        symbol,
        timeframe: "1d",
        adjustMode: "qfq",
        start: startDateDaysAgo(120)
      });
      const closes = series.bars.map((item) => item.close).filter((item) => Number.isFinite(item));
      if (closes.length < 20) {
        this.ma20Cache.set(symbol, { value: null, expiresAt: now + this.ma20TtlMs });
        return null;
      }
      const recent = closes.slice(-20);
      const value = recent.reduce((sum, item) => sum + item, 0) / recent.length;
      this.ma20Cache.set(symbol, { value, expiresAt: now + this.ma20TtlMs });
      return value;
    } catch {
      this.ma20Cache.set(symbol, { value: null, expiresAt: now + 15_000 });
      return null;
    }
  }
}
