import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../database";
import { WatchlistRepo } from "./watchlistRepo";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("WatchlistRepo", () => {
  it("imports and normalizes symbols", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "stockdesk-db-"));
    tempDirs.push(dir);
    const { db, sqlite } = createDatabase(path.join(dir, "test.db"));
    const repo = new WatchlistRepo(db);
    const preview = repo.importPreview("symbol,group,tags\n000001,银行,龙头|关注");

    expect(preview.rows[0].normalizedSymbol).toBe("000001.SZ");
    sqlite.close();
  });
});
