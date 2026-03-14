import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useBootstrap } from "@/hooks/useBootstrap";
import styles from "./ShellLayout.module.css";

export function ShellLayout() {
  const bootstrap = useBootstrap();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!bootstrap.data && !bootstrap.isPending && location.pathname !== "/setup") {
      navigate("/setup");
      return;
    }

    if (bootstrap.data && !bootstrap.data.settings?.firstRunCompletedAt && location.pathname !== "/setup") {
      navigate("/setup");
    }
  }, [bootstrap.data, bootstrap.isPending, location.pathname, navigate]);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.kicker}>A 股监控与研究</span>
          <h1>StockDesk</h1>
        </div>
        <nav className={styles.nav}>
          <NavLink to="/" end>
            自选
          </NavLink>
          <NavLink to="/history">分析记录</NavLink>
          <NavLink to="/settings">设置</NavLink>
        </nav>
        <div className={styles.license}>
          图表基于 TradingView Lightweight Charts。
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}

