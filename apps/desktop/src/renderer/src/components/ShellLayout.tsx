import { Badge } from "@fluentui/react-components";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useBootstrap } from "@/hooks/useBootstrap";
import styles from "./ShellLayout.module.css";

export function ShellLayout() {
  const bootstrap = useBootstrap();
  const location = useLocation();
  const navigate = useNavigate();
  const settings = bootstrap.data?.settings ?? null;
  const activeModel = settings?.llmProfiles.find((item) => item.id === settings.activeLlmProfileId)?.model ?? "未配置";

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
          <Badge appearance="filled" color="informative">
            Windows Research Terminal
          </Badge>
          <div>
            <span className={styles.kicker}>A 股监控与研究</span>
            <h1>StockDesk</h1>
          </div>
        </div>
        <nav className={styles.nav}>
          <NavLink to="/" end>
            市场工作台
          </NavLink>
          <NavLink to="/history">分析档案</NavLink>
          <NavLink to="/settings">系统设置</NavLink>
        </nav>
        <div className={styles.sidebarMeta}>
          <div>
            <span>LLM</span>
            <strong>{activeModel}</strong>
          </div>
          <div>
            <span>数据源</span>
            <strong>内嵌本地服务</strong>
          </div>
        </div>
        <div className={styles.license}>Lightweight Charts · Electron · Fluent UI</div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.dragRegion}>
            <span className={styles.windowTitle}>StockDesk 研究终端</span>
          </div>
          <div className={styles.topbarStatus}>
            <Badge appearance="tint" color="brand">
              CN A-Share
            </Badge>
            <Badge appearance="tint" color={settings ? "success" : "warning"}>
              {settings ? "Ready" : "Setup Required"}
            </Badge>
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
