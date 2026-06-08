import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react";
import {
  Anchor,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Flag,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottleCard } from "./components/BottleCard";
import { CreateBottlePanel } from "./components/CreateBottlePanel";
import { DredgePanel } from "./components/DredgePanel";
import { GameImage } from "./components/GameImage";
import { TaskPanel } from "./components/TaskPanel";
import { TopNav } from "./components/TopNav";
import { WallGrid } from "./components/WallGrid";
import { ApiClient, ClientApiError } from "./lib/api";
import type {
  AdminBottle,
  AdminBottleFilter,
  AdminEvent,
  AdminMetricsData,
  ApiBottle,
  BottleStatus,
  BootstrapData,
  Quota,
  ReportReason,
  StorageAuditData,
  WallSlot
} from "./lib/types";

type AppProps = {
  getToken?: () => Promise<string | null>;
  authControls?: React.ReactNode;
};

const demoGetToken = async () => null;

const adminStatusFilters: Array<{ value: AdminBottleFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "reported", label: "被举报" },
  { value: "pending", label: "待审" },
  { value: "approved", label: "公开" },
  { value: "rejected", label: "下架" }
];

const moderationActions: Array<{
  value: BottleStatus;
  label: string;
  icon: typeof CheckCircle2;
}> = [
  { value: "approved", label: "公开", icon: CheckCircle2 },
  { value: "pending", label: "待审", icon: Clock3 },
  { value: "rejected", label: "下架", icon: XCircle }
];

const reportReasons: Array<{ value: ReportReason; label: string; help: string }> = [
  { value: "spam", label: "刷屏或广告", help: "重复、引流、无关推广" },
  { value: "harassment", label: "攻击或骚扰", help: "辱骂、威胁、恶意针对玩家" },
  { value: "adult", label: "成人或露骨内容", help: "不适合公开活动展示的内容" },
  { value: "hate", label: "仇恨或歧视", help: "针对身份、群体或地域的攻击" },
  { value: "spoiler", label: "严重剧透", help: "破坏关键剧情体验且无提醒" },
  { value: "other", label: "其他问题", help: "需要运营人工判断" }
];

export function ClerkApp() {
  const { getToken } = useAuth();
  const getClerkToken = useCallback(() => getToken(), [getToken]);
  return (
    <App
      getToken={getClerkToken}
      authControls={
        <>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="auth-button" type="button">
                登录 / 注册
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </>
      }
    />
  );
}

export function App({ getToken = demoGetToken, authControls }: AppProps) {
  const [view, setView] = useState("home");
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [quota, setQuota] = useState<Quota | undefined>();
  const [wall, setWall] = useState<WallSlot[]>([]);
  const [dredged, setDredged] = useState<ApiBottle | null>(null);
  const [selectedBottle, setSelectedBottle] = useState<ApiBottle | null>(null);
  const [adminData, setAdminData] = useState<AdminMetricsData | null>(null);
  const [adminBottles, setAdminBottles] = useState<AdminBottle[]>([]);
  const [adminEvents, setAdminEvents] = useState<AdminEvent[]>([]);
  const [selectedAdminBottleIds, setSelectedAdminBottleIds] = useState<string[]>([]);
  const [adminError, setAdminError] = useState<string>("");
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminBottleFilter>("all");
  const [adminEventType, setAdminEventType] = useState("");
  const [adminEventTypeDraft, setAdminEventTypeDraft] = useState("");
  const [adminStorage, setAdminStorage] = useState<StorageAuditData | null>(null);
  const [adminScoreDrafts, setAdminScoreDrafts] = useState<Record<string, string>>({});
  const [adminAction, setAdminAction] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ApiBottle | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [wallLayout, setWallLayout] = useState<"grid4" | "grid9">("grid9");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");

  const api = useMemo(() => new ApiClient(getToken), [getToken]);

  const load = useCallback(async () => {
    setBusy("bootstrap");
    setError("");
    try {
      const data = await api.bootstrap();
      setBootstrap(data);
      setQuota(data.quota);
      setWall(data.wall);
      setWallLayout(data.wall[0]?.layout ?? "grid9");
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(null);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAdmin = useCallback(async () => {
    setBusy("admin");
    setAdminError("");
    try {
      const [metrics, bottleResult, eventResult] = await Promise.all([
        api.adminMetrics(),
        api.adminBottles(adminStatusFilter, 50),
        api.adminEvents(20, adminEventType || undefined)
      ]);
      setAdminData(metrics);
      setAdminBottles(bottleResult.bottles);
      setAdminEvents(eventResult.events);
      setAdminScoreDrafts(
        Object.fromEntries(bottleResult.bottles.map((bottle) => [bottle.id, String(bottle.featuredScore)]))
      );
      setSelectedAdminBottleIds([]);
    } catch (caught) {
      setAdminData(null);
      setAdminBottles([]);
      setAdminEvents([]);
      setSelectedAdminBottleIds([]);
      setAdminError(formatError(caught));
    } finally {
      setBusy(null);
    }
  }, [adminEventType, adminStatusFilter, api]);

  useEffect(() => {
    if (view === "admin") {
      void loadAdmin();
    }
  }, [loadAdmin, view]);

  async function handleSubmitBottle(input: Parameters<ApiClient["submitBottle"]>[0]) {
    setBusy("submit");
    setError("");
    setNotice("");
    try {
      const result = await api.submitBottle(input);
      setNotice("漂流瓶已经扔出，今日打捞机会 +1。");
      await load();
      setView("home");
      return result.bottle;
    } catch (caught) {
      setError(formatError(caught));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleDredge() {
    setBusy("dredge");
    setError("");
    setNotice("");
    try {
      const result = await api.dredge();
      setDredged(result.bottle);
      setSelectedBottle(result.bottle);
      setQuota(result.quota);
      setView("dredge");
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveSlot(slot: number) {
    if (!selectedBottle) return;
    setBusy("wall");
    setError("");
    try {
      const result = await api.saveWall(selectedBottle.id, slot, wallLayout);
      setWall(result.wall);
      setNotice(`已保存到安利墙 ${slot} 号位。`);
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    setBusy("share");
    setError("");
    try {
      const result = await api.shareTask();
      setNotice(result.message ?? (result.granted ? "分享任务完成，今日打捞机会 +1。" : "分享已记录。"));
      await load();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(null);
    }
  }

  function openReportDialog(bottle: ApiBottle) {
    setReportTarget(bottle);
    setReportReason("spam");
    setReportDetails("");
    setNotice("");
    setError("");
  }

  async function handleSubmitReport() {
    if (!reportTarget) return;
    setBusy("report");
    setError("");
    setNotice("");
    try {
      const result = await api.reportBottle(reportTarget.id, reportReason, reportDetails);
      setNotice(
        result.report.autoQueued
          ? "举报已收到，这只漂流瓶已转入待审。"
          : "举报已收到，运营会复核这只漂流瓶。"
      );
      setReportTarget(null);
      setReportDetails("");
      await load();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleAdminModeration(bottle: AdminBottle, status: BottleStatus) {
    setAdminAction(`${bottle.id}:${status}`);
    setAdminError("");
    setNotice("");
    const featuredScore = Number(adminScoreDrafts[bottle.id] ?? bottle.featuredScore);
    try {
      await api.updateBottleModeration(
        bottle.id,
        status,
        Number.isFinite(featuredScore) ? featuredScore : bottle.featuredScore
      );
      setNotice(`已将「${bottle.title}」标记为${statusLabel(status)}。`);
      await loadAdmin();
    } catch (caught) {
      setAdminError(formatError(caught));
    } finally {
      setAdminAction(null);
    }
  }

  function handleAdminSelectBottle(bottleId: string, selected: boolean) {
    setSelectedAdminBottleIds((current) => {
      if (selected) return [...new Set([...current, bottleId])];
      return current.filter((id) => id !== bottleId);
    });
  }

  function handleAdminSelectVisible(selected: boolean) {
    const visibleIds = adminBottles.map((bottle) => bottle.id);
    setSelectedAdminBottleIds((current) => {
      if (selected) return [...new Set([...current, ...visibleIds])];
      return current.filter((id) => !visibleIds.includes(id));
    });
  }

  async function handleAdminBulkModeration(status: BottleStatus) {
    if (selectedAdminBottleIds.length === 0) return;
    setAdminAction(`bulk:${status}`);
    setAdminError("");
    setNotice("");
    try {
      const result = await api.bulkUpdateBottleModeration(selectedAdminBottleIds, status);
      setNotice(`已批量将 ${result.updated} 条漂流瓶标记为${statusLabel(status)}。`);
      setSelectedAdminBottleIds([]);
      await loadAdmin();
    } catch (caught) {
      setAdminError(formatError(caught));
    } finally {
      setAdminAction(null);
    }
  }

  async function handleAdminExport() {
    setAdminAction("export");
    setAdminError("");
    setNotice("");
    try {
      const blob = await api.exportAdminBottles(adminStatusFilter, 1000);
      downloadBlob(blob, `guanghe-bottles-${adminStatusFilter}.csv`);
      setNotice("CSV 已生成下载。");
    } catch (caught) {
      setAdminError(formatError(caught));
    } finally {
      setAdminAction(null);
    }
  }

  async function handleAdminAudit(cursor?: string | null) {
    setAdminAction("audit");
    setAdminError("");
    setNotice("");
    try {
      const result = await api.adminStorageAudit(1000, cursor);
      setAdminStorage(result.storage);
      setNotice("R2 存储巡检完成。");
    } catch (caught) {
      setAdminError(formatError(caught));
    } finally {
      setAdminAction(null);
    }
  }

  const loading = busy === "bootstrap" && !bootstrap;
  const visibleAdminBottleIds = adminBottles.map((bottle) => bottle.id);
  const allVisibleAdminSelected =
    visibleAdminBottleIds.length > 0 && visibleAdminBottleIds.every((id) => selectedAdminBottleIds.includes(id));

  return (
    <div className="app-shell">
      <TopNav
        currentView={view}
        quota={quota}
        authControls={authControls ?? <span className="demo-auth">演示玩家</span>}
        onNavigate={setView}
        onShare={handleShare}
      />

      <main>
        {notice && <div className="notice success">{notice}</div>}
        {error && <div className="notice error">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <Loader2 size={28} className="spin" />
            <span>正在连接漂流海域</span>
          </div>
        ) : (
          <div className="main-grid">
            <div className="content-stack">
              {view === "home" && (
                <>
                  <section className="hero-actions">
                    <button className="hero-card throw" type="button" onClick={() => setView("create")}>
                      <span className="hero-copy">
                        <strong>扔出漂流瓶</strong>
                        <small>分享一款你热爱的游戏</small>
                        <span className="primary-action inline">
                          去扔出
                          <ArrowRight size={18} />
                        </span>
                      </span>
                    </button>
                    <button className="hero-card dredge" type="button" onClick={handleDredge}>
                      <span className="hero-copy">
                        <strong>打捞漂流瓶</strong>
                        <small>从陌生玩家那里收到一份真诚安利</small>
                        <span className="primary-action inline">
                          去打捞
                          <ArrowRight size={18} />
                        </span>
                      </span>
                    </button>
                  </section>

                  <section className="panel">
                    <div className="panel-heading">
                      <h2>最近的公开漂流瓶</h2>
                      <button type="button" onClick={load}>
                        <RefreshCw size={15} />
                        刷新
                      </button>
                    </div>
                    <div className="bottle-row">
                      {(bootstrap?.latest ?? []).map((bottle) => (
                        <BottleCard bottle={bottle} key={bottle.id} onSelect={setSelectedBottle} />
                      ))}
                    </div>
                  </section>

                  <WallGrid
                    layout={wallLayout}
                    selectedBottle={selectedBottle}
                    saving={busy === "wall"}
                    wall={wall}
                    onLayoutChange={setWallLayout}
                    onSaveSlot={handleSaveSlot}
                  />
                </>
              )}

              {view === "create" && (
                <CreateBottlePanel
                  categories={bootstrap?.categories ?? []}
                  turnstileSiteKey={bootstrap?.security.turnstileSiteKey}
                  turnstileRequired={bootstrap?.security.turnstileRequired}
                  submitting={busy === "submit"}
                  onSubmit={handleSubmitBottle}
                />
              )}

              {view === "dredge" && (
                <>
                  <DredgePanel
                    bottle={dredged}
                    quota={quota}
                    loading={busy === "dredge"}
                    onDredge={handleDredge}
                    onReport={openReportDialog}
                    onSaveIntent={() => {
                      setSelectedBottle(dredged);
                      setView("wall");
                    }}
                    onShare={handleShare}
                  />
                  <WallGrid
                    layout={wallLayout}
                    selectedBottle={selectedBottle}
                    saving={busy === "wall"}
                    wall={wall}
                    onLayoutChange={setWallLayout}
                    onSaveSlot={handleSaveSlot}
                  />
                </>
              )}

              {view === "wall" && (
                <>
                  <section className="panel selected-panel">
                    <div>
                      <h2>{selectedBottle ? selectedBottle.title : "选择一个打捞到的瓶子"}</h2>
                      <p>
                        {selectedBottle
                          ? selectedBottle.description
                          : "打捞后可把喜欢的内容保存到个人安利墙。"}
                      </p>
                    </div>
                    <button className="secondary-action" type="button" onClick={handleDredge}>
                          <Anchor size={17} />
                          打捞新瓶子
                        </button>
                  </section>
                  <WallGrid
                    layout={wallLayout}
                    selectedBottle={selectedBottle}
                    saving={busy === "wall"}
                    wall={wall}
                    onLayoutChange={setWallLayout}
                    onSaveSlot={handleSaveSlot}
                  />
                </>
              )}

              {view === "admin" && (
                <section className="panel admin-panel">
                  <div className="panel-heading admin-heading">
                    <div>
                      <h2>运营后台</h2>
                      <small>{adminFilterLabel(adminStatusFilter)}</small>
                    </div>
                    <div className="admin-tools">
                      <button type="button" onClick={handleAdminExport} disabled={adminAction === "export"}>
                        {adminAction === "export" ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                        导出
                      </button>
                      <button type="button" onClick={() => handleAdminAudit()} disabled={adminAction === "audit"}>
                        {adminAction === "audit" ? <Loader2 size={15} className="spin" /> : <Database size={15} />}
                        巡检
                      </button>
                      <button type="button" onClick={loadAdmin}>
                        <RefreshCw size={15} />
                        刷新
                      </button>
                    </div>
                  </div>
                  {busy === "admin" && !adminData ? (
                    <div className="admin-empty">
                      <Loader2 size={22} className="spin" />
                      <span>正在读取运营数据</span>
                    </div>
                  ) : adminError ? (
                    <div className="admin-empty restricted">
                      <strong>后台访问受限</strong>
                      <span>{adminError}</span>
                    </div>
                  ) : (
                    <>
                      <div className="admin-grid">
                        <Metric label="参与玩家" value={adminData?.metrics.participants ?? 0} />
                        <Metric label="投递瓶数" value={adminData?.metrics.bottles ?? 0} />
                        <Metric label="打捞次数" value={adminData?.metrics.dredges ?? 0} />
                        <Metric label="安利墙收藏" value={adminData?.metrics.wallItems ?? 0} />
                      </div>

                      <div className="admin-filter-bar" aria-label="审核状态筛选">
                        {adminStatusFilters.map((item) => (
                          <button
                            className={adminStatusFilter === item.value ? "active" : ""}
                            key={item.value}
                            type="button"
                            onClick={() => setAdminStatusFilter(item.value)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      <form
                        className="admin-event-filter"
                        onSubmit={(event) => {
                          event.preventDefault();
                          setAdminEventType(adminEventTypeDraft.trim());
                        }}
                      >
                        <label>
                          <span>事件类型</span>
                          <input
                            inputMode="text"
                            placeholder="例如 bottle_reported"
                            value={adminEventTypeDraft}
                            onChange={(event) => setAdminEventTypeDraft(event.target.value)}
                          />
                        </label>
                        <button type="submit">
                          <Search size={15} />
                          过滤事件
                        </button>
                        {adminEventType && (
                          <button
                            className="secondary-action compact-action"
                            type="button"
                            onClick={() => {
                              setAdminEventType("");
                              setAdminEventTypeDraft("");
                            }}
                          >
                            清除事件过滤
                          </button>
                        )}
                      </form>

                      {selectedAdminBottleIds.length > 0 && (
                        <div className="admin-bulk-bar" aria-live="polite">
                          <strong>已选择 {selectedAdminBottleIds.length} 条</strong>
                          <span>批量审核</span>
                          <div className="admin-bulk-actions">
                            {moderationActions.map((action) => {
                              const Icon = action.icon;
                              const actionKey = `bulk:${action.value}`;
                              return (
                                <button
                                  className={`moderation-button ${action.value}`}
                                  disabled={adminAction === actionKey}
                                  key={action.value}
                                  type="button"
                                  onClick={() => handleAdminBulkModeration(action.value)}
                                >
                                  {adminAction === actionKey ? (
                                    <Loader2 size={14} className="spin" />
                                  ) : (
                                    <Icon size={14} />
                                  )}
                                  {action.label}
                                </button>
                              );
                            })}
                            <button
                              className="secondary-action compact-action"
                              type="button"
                              onClick={() => setSelectedAdminBottleIds([])}
                            >
                              清除
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="admin-table" role="table" aria-label="漂流瓶审核列表">
                        <div className="admin-table-head" role="row">
                          <span className="admin-select-cell">
                            <input
                              aria-label="选择当前页全部漂流瓶"
                              checked={allVisibleAdminSelected}
                              type="checkbox"
                              onChange={(event) => handleAdminSelectVisible(event.target.checked)}
                            />
                          </span>
                          <span>内容</span>
                          <span>状态</span>
                          <span>精选分</span>
                          <span>操作</span>
                        </div>
                        {adminBottles.length === 0 ? (
                          <div className="admin-empty compact">
                            <ShieldCheck size={22} />
                            <span>暂无匹配内容</span>
                          </div>
                        ) : (
                          adminBottles.map((bottle) => (
                            <article
                              className={`admin-row ${
                                selectedAdminBottleIds.includes(bottle.id) ? "selected" : ""
                              }`}
                              key={bottle.id}
                              role="row"
                            >
                              <label className="admin-select-cell">
                                <input
                                  aria-label={`选择 ${bottle.title}`}
                                  checked={selectedAdminBottleIds.includes(bottle.id)}
                                  type="checkbox"
                                  onChange={(event) => handleAdminSelectBottle(bottle.id, event.target.checked)}
                                />
                              </label>
                              <div className="admin-bottle-cell">
                                <GameImage className="admin-thumb" src={bottle.imageUrl} alt={bottle.title} />
                                <div>
                                  <strong>{bottle.title}</strong>
                                  <p>{bottle.description}</p>
                                  <div className="admin-row-meta">
                                    <span>{bottle.gameName}</span>
                                    <span>{bottle.category}</span>
                                    <span>{bottle.authorName}</span>
                                    <ReportBadge count={bottle.reportCount} />
                                    <span>{formatDate(bottle.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                              <StatusBadge status={bottle.status} />
                              <label className="score-field">
                                <span>精选分</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  value={adminScoreDrafts[bottle.id] ?? String(bottle.featuredScore)}
                                  onChange={(event) =>
                                    setAdminScoreDrafts((current) => ({
                                      ...current,
                                      [bottle.id]: event.target.value
                                    }))
                                  }
                                />
                              </label>
                              <div className="admin-row-actions">
                                {moderationActions.map((action) => {
                                  const Icon = action.icon;
                                  const actionKey = `${bottle.id}:${action.value}`;
                                  return (
                                    <button
                                      className={`moderation-button ${action.value}`}
                                      disabled={adminAction === actionKey || bottle.status === action.value}
                                      key={action.value}
                                      type="button"
                                      onClick={() => handleAdminModeration(bottle, action.value)}
                                    >
                                      {adminAction === actionKey ? (
                                        <Loader2 size={14} className="spin" />
                                      ) : (
                                        <Icon size={14} />
                                      )}
                                      {action.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </article>
                          ))
                        )}
                      </div>

                      <div className="admin-events" aria-label="最近后台事件">
                        <div className="admin-subheading">
                          <h3>最近事件</h3>
                          <span>{adminEventType ? `${adminEventType} · ${adminEvents.length} 条` : `${adminEvents.length} 条`}</span>
                        </div>
                        {adminEvents.length === 0 ? (
                          <div className="admin-empty compact">
                            <ShieldCheck size={22} />
                            <span>暂无事件</span>
                          </div>
                        ) : (
                          <div className="admin-event-list">
                            {adminEvents.map((event) => (
                              <article className="admin-event-row" key={event.id}>
                                <div>
                                  <strong>{event.type}</strong>
                                  <span>{event.userId ?? "system"}</span>
                                </div>
                                <code>{formatMetadata(event.metadata)}</code>
                                <time>{formatDate(event.createdAt)}</time>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>

                      {adminStorage && (
                        <div className="storage-audit">
                          <div className="storage-audit-summary">
                            <Metric label="R2 已扫描" value={adminStorage.scannedR2Objects} />
                            <Metric label="D1 已登记" value={adminStorage.trackedD1Images} />
                            <Metric label="孤儿样本" value={adminStorage.orphanKeysSample.length} />
                            <Metric label="缺失样本" value={adminStorage.missingKeysSample.length} />
                          </div>
                          <div className="storage-samples">
                            <StorageSample title="孤儿对象" items={adminStorage.orphanKeysSample} />
                            <StorageSample title="缺失对象" items={adminStorage.missingKeysSample} />
                          </div>
                          {adminStorage.truncated && adminStorage.cursor && (
                            <button
                              className="secondary-action storage-next"
                              type="button"
                              onClick={() => handleAdminAudit(adminStorage.cursor)}
                              disabled={adminAction === "audit"}
                            >
                              <Database size={15} />
                              继续巡检
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}
            </div>

            <TaskPanel tasks={bootstrap?.tasks ?? []} metrics={bootstrap?.metrics} onShare={handleShare} />
          </div>
        )}
      </main>

      {reportTarget && (
        <ReportDialog
          bottle={reportTarget}
          busy={busy === "report"}
          details={reportDetails}
          reason={reportReason}
          reasons={reportReasons}
          onCancel={() => setReportTarget(null)}
          onDetailsChange={setReportDetails}
          onReasonChange={setReportReason}
          onSubmit={handleSubmitReport}
        />
      )}
    </div>
  );
}

function ReportDialog({
  bottle,
  busy,
  details,
  reason,
  reasons,
  onCancel,
  onDetailsChange,
  onReasonChange,
  onSubmit
}: {
  bottle: ApiBottle;
  busy: boolean;
  details: string;
  reason: ReportReason;
  reasons: Array<{ value: ReportReason; label: string; help: string }>;
  onCancel: () => void;
  onDetailsChange: (value: string) => void;
  onReasonChange: (value: ReportReason) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="report-dialog-header">
          <div>
            <span className="report-kicker">
              <Flag size={15} />
              社区安全
            </span>
            <h2 id="report-title">举报漂流瓶</h2>
          </div>
          <button className="icon-button" type="button" aria-label="关闭举报窗口" onClick={onCancel} disabled={busy}>
            <X size={17} />
          </button>
        </div>

        <div className="report-target">
          <span>当前内容</span>
          <strong>{bottle.title}</strong>
          <small>{bottle.gameName} · {bottle.authorName}</small>
        </div>

        <div className="report-options" role="radiogroup" aria-label="举报原因">
          {reasons.map((item) => (
            <label className={reason === item.value ? "report-option selected" : "report-option"} key={item.value}>
              <input
                checked={reason === item.value}
                name="report-reason"
                type="radio"
                value={item.value}
                onChange={() => onReasonChange(item.value)}
              />
              <span>
                <strong>{item.label}</strong>
                <small>{item.help}</small>
              </span>
            </label>
          ))}
        </div>

        <label className="report-details">
          <span>补充说明</span>
          <textarea
            maxLength={500}
            placeholder="可选，写下你希望运营注意的点。"
            value={details}
            onChange={(event) => onDetailsChange(event.target.value)}
          />
          <small>{details.length}/500</small>
        </label>

        <div className="report-actions">
          <button className="secondary-action" type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button className="primary-action" type="button" onClick={onSubmit} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Flag size={16} />}
            提交举报
          </button>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{new Intl.NumberFormat("zh-CN").format(value)}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: BottleStatus }) {
  return <span className={`status-badge ${status}`}>{statusLabel(status)}</span>;
}

function ReportBadge({ count }: { count: number }) {
  return (
    <span className={count > 0 ? "report-badge active" : "report-badge"}>
      <Flag size={12} />
      举报 {count}
    </span>
  );
}

function StorageSample({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="storage-sample">
      <strong>{title}</strong>
      {items.length === 0 ? <span>0</span> : items.slice(0, 5).map((item) => <code key={item}>{item}</code>)}
    </div>
  );
}

function adminFilterLabel(filter: AdminBottleFilter) {
  if (filter === "all") return "全部漂流瓶";
  if (filter === "reported") return "被举报漂流瓶";
  return `${statusLabel(filter)}漂流瓶`;
}

function statusLabel(status: BottleStatus) {
  if (status === "approved") return "公开";
  if (status === "pending") return "待审";
  return "下架";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatMetadata(value: string | null) {
  if (!value) return "{}";
  return value.length > 96 ? `${value.slice(0, 96)}...` : value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatError(caught: unknown) {
  if (caught instanceof ClientApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return "出现未知错误。";
}
