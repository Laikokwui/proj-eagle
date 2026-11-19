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
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-head">
          <div>
            <p className="ops-label text-primary">04 / EVENT</p>
            <h2 className="ops-title mt-1">Violation #{v.id}</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {v.screenshot_url && (
            <div className="reticle relative border border-border bg-black">
              <img
                src={v.screenshot_url}
                alt="Violation screenshot"
                className="w-full"
              />
            </div>
          )}

          <div className="data-grid">
            <div>
              <p className="ops-label">Camera</p>
              <p className="mt-1 text-sm">{v.camera_name ?? `#${v.camera_id}`}</p>
            </div>
            <div>
              <p className="ops-label">Time</p>
              <p className="mt-1 font-mono text-xs">
                {format(new Date(v.occurred_at), "MMM d yyyy, HH:mm:ss")}
              </p>
            </div>
            <div>
              <p className="ops-label">Confidence</p>
              <p className="mt-1 font-mono text-xs">
                {v.detection_conf != null ? `${(v.detection_conf * 100).toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="ops-label">Status</p>
              <div className="mt-1">
                {v.acknowledged ? (
                  <span className="ops-chip ops-chip-clear">Acknowledged</span>
                ) : (
                  <span className="ops-chip ops-chip-alert">Open</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="ops-label">Missing PPE</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {v.missing_classes.map((cls) => (
                <span key={cls} className="ops-chip ops-chip-alert">{cls}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-border p-5">
          <button onClick={onClose} className="ops-button flex-1">
            Close
          </button>
          {!v.acknowledged && (
            <button
              onClick={() => { onAcknowledge(); onClose(); }}
              className="ops-button ops-button-primary flex-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Acknowledge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
