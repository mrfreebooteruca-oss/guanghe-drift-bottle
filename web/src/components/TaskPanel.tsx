import { Check, Circle } from "lucide-react";
import type { Metrics, TaskItem } from "../lib/types";

type TaskPanelProps = {
  tasks: TaskItem[];
  metrics?: Metrics;
  onShare: () => void;
};

export function TaskPanel({ tasks, metrics, onShare }: TaskPanelProps) {
  return (
    <aside className="right-rail">
      <section className="panel">
        <div className="panel-heading">
          <h2>每日任务</h2>
          <span>刷新倒计时 24:00</span>
        </div>
        <div className="task-list">
          {tasks.map((task, index) => (
            <div className="task-row" key={task.id}>
              <span className={task.done ? "task-status done" : "task-status"}>
                {task.done ? <Check size={14} /> : <Circle size={14} />}
              </span>
              <div>
                <strong>{task.title}</strong>
                <small>{task.reward}</small>
              </div>
              <span className="task-count">
                {Math.min(task.progress, task.limit)}/{task.limit}
              </span>
              {task.id === "share" && !task.done ? (
                <button type="button" onClick={onShare}>
                  去完成
                </button>
              ) : (
                <span className="task-index">{index + 1}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel metrics-panel">
        <div className="panel-heading">
          <h2>漂流数据</h2>
          <span>实时更新</span>
        </div>
        <dl>
          <div>
            <dt>参与玩家</dt>
            <dd>{formatNumber(metrics?.participants ?? 0)}</dd>
          </div>
          <div>
            <dt>漂流瓶总数</dt>
            <dd>{formatNumber(metrics?.bottles ?? 0)}</dd>
          </div>
          <div>
            <dt>已打捞总数</dt>
            <dd>{formatNumber(metrics?.dredges ?? 0)}</dd>
          </div>
          <div>
            <dt>安利墙收藏</dt>
            <dd>{formatNumber(metrics?.wallItems ?? 0)}</dd>
          </div>
          <div>
            <dt>24h 活跃</dt>
            <dd>{formatNumber(metrics?.activeUsers24h ?? 0)}</dd>
          </div>
        </dl>
      </section>

      <section className="quote-panel">
        <p>每一个漂流瓶，都是玩家与玩家之间的真诚连接。</p>
        <span>演示身份 · 配置 Clerk 后启用真实登录</span>
      </section>
    </aside>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
