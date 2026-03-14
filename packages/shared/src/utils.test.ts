import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "./utils";

describe("normalizeSymbol", () => {
  it("normalizes plain Shenzhen code", () => {
    expect(normalizeSymbol("000001")).toBe("000001.SZ");
  });

  it("normalizes prefixed code", () => {
    expect(normalizeSymbol("sh600000")).toBe("600000.SH");
  });

  it("rejects malformed input", () => {
    expect(normalizeSymbol("abc")).toBeNull();
  });
});
