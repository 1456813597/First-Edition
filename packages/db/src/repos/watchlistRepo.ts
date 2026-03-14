import { eq, inArray } from "drizzle-orm";
import type { BatchResult, BatchResultItem, ImportPreview, SymbolId, WatchlistGroup, WatchlistItem, WatchlistTag } from "@stockdesk/shared";
import { normalizeSymbol, nowIso } from "@stockdesk/shared";
import { watchlistGroups, watchlistItems, watchlistItemTags, watchlistTags } from "../schema/tables";
import type { StockdeskDb } from "../database";

function uuid() {
  return crypto.randomUUID();
}

export class WatchlistRepo {
  constructor(private readonly db: StockdeskDb) {}

  listGroups(): WatchlistGroup[] {
    return this.db.select().from(watchlistGroups).orderBy(watchlistGroups.sortOrder).all();
  }

  saveGroup(input: { id?: string; name: string; color?: string | null }): WatchlistGroup {
    const now = nowIso();
    const id = input.id ?? uuid();
    const existing = input.id ? this.db.select().from(watchlistGroups).where(eq(watchlistGroups.id, input.id)).get() : null;
    this.db
      .insert(watchlistGroups)
      .values({
        id,
        name: input.name,
        color: input.color ?? null,
        sortOrder: existing?.sortOrder ?? this.listGroups().length,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: watchlistGroups.id,
        set: {
          name: input.name,
          color: input.color ?? null,
          updatedAt: now
        }
      })
      .run();

    return this.db.select().from(watchlistGroups).where(eq(watchlistGroups.id, id)).get() as WatchlistGroup;
  }

  deleteGroup(id: string) {
    this.db.delete(watchlistGroups).where(eq(watchlistGroups.id, id)).run();
  }

  listItems(groupId?: string | null): WatchlistItem[] {
    const items = groupId
      ? this.db.select().from(watchlistItems).where(eq(watchlistItems.groupId, groupId)).all()
      : this.db.select().from(watchlistItems).all();
    const tagJoins = this.db.select().from(watchlistItemTags).all();
    const tags = this.db.select().from(watchlistTags).all();
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

    return items.map((item) => ({
      ...item,
      symbol: item.symbol as SymbolId,
      tags: tagJoins
        .filter((join) => join.itemId === item.id)
        .map((join) => tagsById.get(join.tagId))
        .filter(Boolean) as WatchlistTag[],
      latestQuote: null
    }));
  }

  addSymbols(input: { symbols: string[]; groupId?: string | null; tags?: string[] }): BatchResult {
    const items: BatchResultItem[] = input.symbols.map((rawInput) => {
      const normalized = normalizeSymbol(rawInput);
      if (!normalized) {
        return { input: rawInput, success: false, symbol: null, message: "无法识别股票代码" };
      }

      const now = nowIso();
      const id = uuid();
      const existing = this.db.select().from(watchlistItems).where(eq(watchlistItems.symbol, normalized)).get();
      if (!existing) {
        this.db
          .insert(watchlistItems)
          .values({
            id,
            symbol: normalized,
            name: normalized,
            groupId: input.groupId ?? null,
            createdAt: now,
            updatedAt: now
          })
          .run();
      }

      input.tags?.forEach((tagName) => {
        const tagId = this.ensureTag(tagName);
        const itemId = existing?.id ?? id;
        this.db.insert(watchlistItemTags).values({ itemId, tagId }).onConflictDoNothing().run();
      });

      return { input: rawInput, success: true, symbol: normalized, message: existing ? "已存在，已更新标签" : "已添加" };
    });

    return { items };
  }

  removeItems(ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    this.db.delete(watchlistItems).where(inArray(watchlistItems.id, ids)).run();
  }

  importPreview(csvText: string): ImportPreview {
    const rows = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(1)
      .map((line) => {
        const [symbol, groupName, tags] = line.split(",").map((item) => item?.trim() ?? "");
        const normalized = normalizeSymbol(symbol);
        return {
          inputSymbol: symbol,
          normalizedSymbol: normalized,
          groupName: groupName || null,
          tags: tags ? tags.split("|").filter(Boolean) : [],
          status: normalized ? "ready" : "invalid",
          message: normalized ? "可导入" : "代码无效"
        } as const;
      });

    return { rows };
  }

  applyImportPreview(preview: ImportPreview): BatchResult {
    const resultItems: BatchResultItem[] = [];
    preview.rows.forEach((row) => {
      if (!row.normalizedSymbol) {
        resultItems.push({ input: row.inputSymbol, success: false, symbol: null, message: row.message });
        return;
      }

      let groupId: string | null = null;
      if (row.groupName) {
        const group = this.listGroups().find((item) => item.name === row.groupName) ?? this.saveGroup({ name: row.groupName });
        groupId = group.id;
      }

      const batch = this.addSymbols({ symbols: [row.normalizedSymbol], groupId, tags: row.tags });
      resultItems.push(...batch.items);
    });

    return { items: resultItems };
  }

  private ensureTag(name: string): string {
    const existing = this.db.select().from(watchlistTags).where(eq(watchlistTags.name, name)).get();
    if (existing) {
      return existing.id;
    }

    const id = uuid();
    this.db.insert(watchlistTags).values({ id, name, color: null }).run();
    return id;
  }
}
