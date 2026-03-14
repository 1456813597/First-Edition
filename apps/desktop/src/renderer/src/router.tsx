import { createBrowserRouter, Navigate } from "react-router-dom";
import { ShellLayout } from "./components/ShellLayout";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { SymbolDetailPage } from "./pages/SymbolDetailPage";
import { WatchlistPage } from "./pages/WatchlistPage";

export const router = createBrowserRouter([
  {
    path: "/setup",
    element: <SetupPage />
  },
  {
    path: "/",
    element: <ShellLayout />,
    children: [
      { index: true, element: <WatchlistPage /> },
      { path: "symbol/:symbol", element: <SymbolDetailPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  },
  {
    path: "*",
    element: <Navigate to="/" replace />
  }
]);

