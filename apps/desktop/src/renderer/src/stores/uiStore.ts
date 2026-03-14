import { create } from "zustand";

interface UiStore {
  selectedGroupId: string | null;
  setSelectedGroupId(value: string | null): void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedGroupId: null,
  setSelectedGroupId: (selectedGroupId) => set({ selectedGroupId })
}));

