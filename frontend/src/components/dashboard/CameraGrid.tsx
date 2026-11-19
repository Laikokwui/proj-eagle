import { useState } from "react";
import type { Camera } from "@/api/cameras";
import CameraCell from "./CameraCell";
import { Grid2X2, Grid3X3, LayoutGrid } from "lucide-react";

const GRID_SIZES = [
  { cols: 2, label: "2×2", icon: Grid2X2 },
  { cols: 3, label: "3×3", icon: Grid3X3 },
  { cols: 4, label: "4×4", icon: LayoutGrid },
];

interface Props {
  cameras: Camera[];
}

export default function CameraGrid({ cameras }: Props) {
  const [cols, setCols] = useState(2);

  const gridClass: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };

  return (
    <div className="space-y-3">
      <div className="panel-head">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="ops-label text-primary">01 / MONITOR</span>
          <h2 className="ops-title">Camera wall</h2>
          <span className="ops-label">{cameras.length} configured</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="ops-label mr-2">Grid</span>
          {GRID_SIZES.map(({ cols: c, label, icon: Icon }) => (
            <button
              key={c}
              onClick={() => setCols(c)}
              title={label}
              className={`p-1.5 border transition-colors ${
                cols === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-panel-raised text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {cameras.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="text-sm">No cameras configured.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Go to Cameras to add your first RTSP stream.
          </p>
        </div>
      ) : (
        <div className={`grid ${gridClass[cols] || "grid-cols-2"} gap-3`}>
          {cameras.map((camera) => (
            <CameraCell key={camera.id} camera={camera} />
          ))}
        </div>
      )}
    </div>
  );
}
