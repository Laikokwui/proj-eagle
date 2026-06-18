import type { Violation } from "@/api/violations";
import { X, CheckCheck } from "lucide-react";
import { format } from "date-fns";

interface Props {
  violation: Violation;
  onClose: () => void;
  onAcknowledge: () => void;
}

export default function ViolationDetailModal({ violation: v, onClose, onAcknowledge }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Violation Detail</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {v.screenshot_url && (
          <img
            src={v.screenshot_url}
            alt="Violation screenshot"
            className="w-full rounded-lg border border-border"
          />
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Camera</p>
            <p>{v.camera_name ?? `#${v.camera_id}`}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Time</p>
            <p>{format(new Date(v.occurred_at), "MMM d yyyy, HH:mm:ss")}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Confidence</p>
            <p>{v.detection_conf != null ? `${(v.detection_conf * 100).toFixed(1)}%` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Status</p>
            <p>{v.acknowledged ? "Acknowledged" : "Open"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs mb-1">Missing PPE</p>
            <div className="flex flex-wrap gap-1">
              {v.missing_classes.map((cls) => (
                <span key={cls} className="px-2 py-0.5 text-xs bg-destructive/20 text-destructive rounded-full">
                  {cls}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-border rounded-md text-sm hover:bg-secondary">
            Close
          </button>
          {!v.acknowledged && (
            <button
              onClick={() => { onAcknowledge(); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-700 text-white rounded-md text-sm hover:bg-green-600"
            >
              <CheckCheck className="h-4 w-4" />
              Acknowledge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
