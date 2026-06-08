import { Heart, MessageCircle } from "lucide-react";
import { GameImage } from "./GameImage";
import type { ApiBottle } from "../lib/types";

type BottleCardProps = {
  bottle: ApiBottle;
  compact?: boolean;
  onSelect?: (bottle: ApiBottle) => void;
};

export function BottleCard({ bottle, compact = false, onSelect }: BottleCardProps) {
  return (
    <button
      className={compact ? "bottle-card compact" : "bottle-card"}
      type="button"
      onClick={() => onSelect?.(bottle)}
    >
      <GameImage src={bottle.imageUrl} alt={bottle.title} />
      <span className="category-chip">{bottle.category}</span>
      <div className="bottle-card-body">
        <strong>{bottle.title}</strong>
        {!compact && <p>{bottle.description}</p>}
        <div className="card-meta">
          <span>{bottle.authorName}</span>
          <span>
            <Heart size={13} />
            {Math.max(12, bottle.featuredScore)}
          </span>
          <span>
            <MessageCircle size={13} />
            {Math.max(4, Math.round(bottle.featuredScore / 6))}
          </span>
        </div>
      </div>
    </button>
  );
}
