import {
  BarChart3,
  CheckSquare,
  GlassWater,
  Grid3X3,
  Home,
  Share2,
  UserRound
} from "lucide-react";
import type { ReactNode } from "react";
import type { Quota } from "../lib/types";

type TopNavProps = {
  currentView: string;
  quota?: Quota;
  authControls: ReactNode;
  onNavigate: (view: string) => void;
  onShare: () => void;
};

const navItems = [
  { id: "home", label: "首页", icon: Home },
  { id: "create", label: "投递", icon: GlassWater },
  { id: "wall", label: "安利墙", icon: Grid3X3 },
  { id: "admin", label: "数据", icon: BarChart3 }
];

export function TopNav({ currentView, quota, authControls, onNavigate, onShare }: TopNavProps) {
  return (
    <header className="top-nav">
      <button className="brand-lockup" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark" aria-hidden="true">
          ✦
        </span>
        <span>
          <strong>光核安利漂流瓶</strong>
          <small>Game Drift</small>
        </span>
      </button>

      <nav className="nav-tabs" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={currentView === item.id ? "nav-tab active" : "nav-tab"}
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="nav-actions">
        <div className="quota-pill">
          <GlassWater size={16} />
          <span>今日可打捞</span>
          <strong>
            {quota?.remaining ?? 0}/{quota?.max ?? 4}
          </strong>
        </div>
        <button className="icon-text-button task-button" type="button" onClick={() => onNavigate("home")}>
          <CheckSquare size={17} />
          任务
          <span className="red-dot" aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" aria-label="分享" onClick={onShare}>
          <Share2 size={18} />
        </button>
        <div className="auth-shell">
          <UserRound size={17} />
          {authControls}
        </div>
      </div>
    </header>
  );
}
