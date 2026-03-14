export interface ExportPayload {
  settings: import("./settings").AppSettings | null;
  groups: import("./watchlist").WatchlistGroup[];
  items: import("./watchlist").WatchlistItem[];
  analysisRuns: import("./analysis").AnalysisRunDetail[];
  exportedAt: string;
}

