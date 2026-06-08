import { Grid2X2, Grid3X3, Trash2 } from "lucide-react";
import { GameImage } from "./GameImage";
import type { ApiBottle, WallSlot } from "../lib/types";

type WallGridProps = {
  wall: WallSlot[];
  layout: "grid4" | "grid9";
  selectedBottle?: ApiBottle | null;
  saving?: boolean;
  onLayoutChange: (layout: "grid4" | "grid9") => void;
  onSaveSlot: (slot: number) => void;
};

export function WallGrid({
  wall,
  layout,
  selectedBottle,
  saving,
  onLayoutChange,
  onSaveSlot
}: WallGridProps) {
  const max = layout === "grid4" ? 4 : 9;
  const slots = Array.from({ length: max }, (_, index) => index + 1);
  const bySlot = new Map(wall.map((item) => [item.slot, item.bottle]));

  return (
    <section className="wall-panel panel">
      <div className="panel-heading wall-heading">
        <div>
          <h2>我的安利墙</h2>
          <span>{layout === "grid4" ? "4/4 精选模式" : "9/9 收藏模式"}</span>
        </div>
        <div className="segmented">
          <button
            className={layout === "grid4" ? "active" : ""}
            type="button"
            onClick={() => onLayoutChange("grid4")}
          >
            <Grid2X2 size={15} />
            4
          </button>
          <button
            className={layout === "grid9" ? "active" : ""}
            type="button"
            onClick={() => onLayoutChange("grid9")}
          >
            <Grid3X3 size={15} />
            9
          </button>
        </div>
      </div>

      <div className={layout === "grid4" ? "wall-grid grid4" : "wall-grid grid9"}>
        {slots.map((slot) => {
          const bottle = bySlot.get(slot);
          return (
            <button
              className={bottle ? "wall-slot filled" : "wall-slot"}
              key={slot}
              type="button"
              disabled={!selectedBottle || saving}
              onClick={() => onSaveSlot(slot)}
            >
              <span className="slot-number">{slot}</span>
              {bottle ? (
                <>
                  <GameImage src={bottle.imageUrl} alt={bottle.title} />
                  <strong>{bottle.title}</strong>
                  <span className="slot-remove" aria-hidden="true">
                    <Trash2 size={13} />
                  </span>
                </>
              ) : (
                <span className="empty-slot">{selectedBottle ? "存入这里" : "空位"}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
