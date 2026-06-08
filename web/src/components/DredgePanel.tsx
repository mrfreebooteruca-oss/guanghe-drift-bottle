import { Anchor, Archive, Flag, Heart, RefreshCw, Share2 } from "lucide-react";
import { GameImage } from "./GameImage";
import type { ApiBottle, Quota } from "../lib/types";

type DredgePanelProps = {
  bottle: ApiBottle | null;
  quota?: Quota;
  loading: boolean;
  onDredge: () => void;
  onReport: (bottle: ApiBottle) => void;
  onSaveIntent: () => void;
  onShare: () => void;
};

export function DredgePanel({
  bottle,
  quota,
  loading,
  onDredge,
  onReport,
  onSaveIntent,
  onShare
}: DredgePanelProps) {
  return (
    <section className="dredge-layout">
      <div className="panel dredge-detail">
        {bottle ? (
          <>
            <GameImage className="dredge-image" src={bottle.imageUrl} alt={bottle.title} loading="eager" />
            <div className="dredge-copy">
              <span className="category-chip">{bottle.category}</span>
              <h2>{bottle.title}</h2>
              <strong>{bottle.gameName}</strong>
              <p>{bottle.description}</p>
              <div className="dredge-meta">
                <span>来自 {bottle.authorName}</span>
                <span>{new Date(bottle.createdAt).toLocaleDateString("zh-CN")}</span>
              </div>
              <div className="action-row">
                <button className="primary-action" type="button" onClick={onSaveIntent}>
                  <Heart size={17} />
                  保存到安利墙
                </button>
                <button className="secondary-action" type="button" onClick={onDredge} disabled={loading}>
                  <RefreshCw size={17} />
                  再打捞一个
                </button>
                <button className="icon-button" type="button" aria-label="分享瓶子" onClick={onShare}>
                  <Share2 size={17} />
                </button>
                <button
                  className="icon-button danger-soft"
                  type="button"
                  aria-label="举报瓶子"
                  title="举报瓶子"
                  onClick={() => onReport(bottle)}
                >
                  <Flag size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-dredge">
            <Anchor size={42} />
            <h2>打捞一只漂流瓶</h2>
            <p>同一个账号不会重复捞到同一只瓶子。</p>
            <button className="primary-action" type="button" onClick={onDredge} disabled={loading}>
              <Archive size={18} />
              {loading ? "打捞中" : `开始打捞（剩余 ${quota?.remaining ?? 0}）`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
