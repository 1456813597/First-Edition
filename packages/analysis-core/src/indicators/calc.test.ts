import { describe, expect, it } from "vitest";
import { sma } from "./calc";

describe("sma", () => {
  it("returns null until window is full", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});
