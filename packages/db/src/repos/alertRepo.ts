import { eq, inArray } from "drizzle-orm";
import { nowIso, type AlertEvent, type AlertRule, type AlertRuleType, type SymbolId } from "@stockdesk/shared";
import { alertEvents, alertRules } from "../schema/tables";
import type { StockdeskDb } from "../database";

type AlertPayloadValue = string | number | boolean | null;

function parsePayload(value: string): Record<string, AlertPayloadValue> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const result: Record<string, AlertPayloadValue> = {};
    for (const [key, payload] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean" || payload === null) {
        result[key] = payload;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function toRule(row: typeof alertRules.$inferSelect): AlertRule {
  return {
    id: row.id,
    symbol: row.symbol as SymbolId,
    type: row.type as AlertRuleType,
    name: row.name,
    enabled: row.enabled,
    params: parsePayload(row.params),
    lastTriggeredAt: row.lastTriggeredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toEvent(row: typeof alertEvents.$inferSelect): AlertEvent {
  return {
    id: row.id,
    ruleId: row.ruleId,
    symbol: row.symbol as SymbolId,
    type: row.type as AlertRuleType,
    title: row.title,
    message: row.message,
    context: parsePayload(row.context),
    triggeredAt: row.triggeredAt,
    readAt: row.readAt
  };
}

export class AlertRepo {
  constructor(private readonly db: StockdeskDb) {}

  listRules(symbol?: string): AlertRule[] {
    const rows = symbol
      ? this.db.select().from(alertRules).where(eq(alertRules.symbol, symbol)).all()
      : this.db.select().from(alertRules).all();
    return rows
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toRule);
  }

  saveRule(input: {
    id?: string;
    symbol: string;
    type: AlertRuleType;
    name?: string;
    enabled?: boolean;
    params?: Record<string, AlertPayloadValue>;
  }): AlertRule {
    const now = nowIso();
    const id = input.id ?? crypto.randomUUID();
    const existing = input.id
      ? this.db.select().from(alertRules).where(eq(alertRules.id, input.id)).get()
      : null;

    this.db
      .insert(alertRules)
      .values({
        id,
        symbol: input.symbol,
        type: input.type,
        name: input.name ?? existing?.name ?? input.type,
        enabled: input.enabled ?? existing?.enabled ?? true,
        params: JSON.stringify(input.params ?? parsePayload(existing?.params ?? "{}")),
        lastTriggeredAt: existing?.lastTriggeredAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: alertRules.id,
        set: {
          symbol: input.symbol,
          type: input.type,
          name: input.name ?? existing?.name ?? input.type,
          enabled: input.enabled ?? existing?.enabled ?? true,
          params: JSON.stringify(input.params ?? parsePayload(existing?.params ?? "{}")),
          updatedAt: now
        }
      })
      .run();

    return toRule(this.db.select().from(alertRules).where(eq(alertRules.id, id)).get() as typeof alertRules.$inferSelect);
  }

  deleteRule(id: string) {
    this.db.delete(alertRules).where(eq(alertRules.id, id)).run();
  }

  listEnabledRulesBySymbols(symbols: string[]): AlertRule[] {
    if (symbols.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(alertRules)
      .where(inArray(alertRules.symbol, symbols))
      .all()
      .filter((row) => row.enabled)
      .map(toRule);
  }

  updateLastTriggered(ruleId: string, triggeredAt: string) {
    this.db
      .update(alertRules)
      .set({
        lastTriggeredAt: triggeredAt,
        updatedAt: nowIso()
      })
      .where(eq(alertRules.id, ruleId))
      .run();
  }

  createEvent(input: {
    ruleId: string;
    symbol: string;
    type: AlertRuleType;
    title: string;
    message: string;
    context: Record<string, AlertPayloadValue>;
    triggeredAt: string;
  }): AlertEvent {
    const id = crypto.randomUUID();
    this.db
      .insert(alertEvents)
      .values({
        id,
        ruleId: input.ruleId,
        symbol: input.symbol,
        type: input.type,
        title: input.title,
        message: input.message,
        context: JSON.stringify(input.context),
        triggeredAt: input.triggeredAt,
        readAt: null
      })
      .run();
    return toEvent(this.db.select().from(alertEvents).where(eq(alertEvents.id, id)).get() as typeof alertEvents.$inferSelect);
  }

  listEvents(filter?: { symbol?: string; limit?: number }): AlertEvent[] {
    const rows = filter?.symbol
      ? this.db.select().from(alertEvents).where(eq(alertEvents.symbol, filter.symbol)).all()
      : this.db.select().from(alertEvents).all();
    const limit = filter?.limit ?? 50;
    return rows
      .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
      .slice(0, limit)
      .map(toEvent);
  }

  markEventRead(id: string) {
    this.db
      .update(alertEvents)
      .set({
        readAt: nowIso()
      })
      .where(eq(alertEvents.id, id))
      .run();
  }
}
