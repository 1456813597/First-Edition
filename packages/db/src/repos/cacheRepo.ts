import { eq } from "drizzle-orm";
import { nowIso } from "@stockdesk/shared";
import { eventCache, klineBars, newsCache, quoteCache } from "../schema/tables";
import type { StockdeskDb } from "../database";

export class CacheRepo {
  constructor(private readonly db: StockdeskDb) {}

  setQuote(symbol: string, payload: string) {
    this.db
      .insert(quoteCache)
      .values({ symbol, payload, updatedAt: nowIso() })
      .onConflictDoUpdate({
        target: quoteCache.symbol,
        set: { payload, updatedAt: nowIso() }
      })
      .run();
  }

  getQuote(symbol: string) {
    return this.db.select().from(quoteCache).where(eq(quoteCache.symbol, symbol)).get();
  }

  setKline(cacheKey: string, payload: string) {
    this.db
      .insert(klineBars)
      .values({ cacheKey, payload, updatedAt: nowIso() })
      .onConflictDoUpdate({
        target: klineBars.cacheKey,
        set: { payload, updatedAt: nowIso() }
      })
      .run();
  }

  getKline(cacheKey: string) {
    return this.db.select().from(klineBars).where(eq(klineBars.cacheKey, cacheKey)).get();
  }

  setNews(cacheKey: string, payload: string) {
    this.db
      .insert(newsCache)
      .values({ cacheKey, payload, updatedAt: nowIso() })
      .onConflictDoUpdate({
        target: newsCache.cacheKey,
        set: { payload, updatedAt: nowIso() }
      })
      .run();
  }

  getNews(cacheKey: string) {
    return this.db.select().from(newsCache).where(eq(newsCache.cacheKey, cacheKey)).get();
  }

  setEvents(cacheKey: string, payload: string) {
    this.db
      .insert(eventCache)
      .values({ cacheKey, payload, updatedAt: nowIso() })
      .onConflictDoUpdate({
        target: eventCache.cacheKey,
        set: { payload, updatedAt: nowIso() }
      })
      .run();
  }

  getEvents(cacheKey: string) {
    return this.db.select().from(eventCache).where(eq(eventCache.cacheKey, cacheKey)).get();
  }

  clear() {
    this.db.delete(quoteCache).run();
    this.db.delete(klineBars).run();
    this.db.delete(newsCache).run();
    this.db.delete(eventCache).run();
  }
}

