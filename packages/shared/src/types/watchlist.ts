import type { QuoteSnapshot, SymbolId } from "./market";

export interface WatchlistGroup {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistTag {
  id: string;
  name: string;
  color: string | null;
}

export interface WatchlistItem {
  id: string;
  symbol: SymbolId;
  name: string;
  groupId: string | null;
  tags: WatchlistTag[];
  latestQuote: QuoteSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddSymbolsInput {
  symbols: string[];
  groupId?: string | null;
  tags?: string[];
}

export interface BatchResultItem {
  input: string;
  success: boolean;
  symbol: SymbolId | null;
  message: string;
}

export interface BatchResult {
  items: BatchResultItem[];
}

export interface CsvImportPreviewItem {
  inputSymbol: string;
  normalizedSymbol: SymbolId | null;
  groupName: string | null;
  tags: string[];
  status: "ready" | "invalid";
  message: string;
}

export interface ImportPreview {
  rows: CsvImportPreviewItem[];
}

