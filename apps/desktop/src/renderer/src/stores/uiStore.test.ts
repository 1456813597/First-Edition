import { describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

describe("uiStore", () => {
  it("updates selected group id", () => {
    useUiStore.getState().setSelectedGroupId("group-1");
    expect(useUiStore.getState().selectedGroupId).toBe("group-1");
  });
});
