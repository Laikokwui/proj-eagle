import { useAlertsStore } from "@/store/alerts";
import { AlertTriangle, X } from "lucide-react";
import { format } from "date-fns";

export default function AlertBanner() {
  const alerts = useAlertsStore((s) => s.alerts);
  const dismissAlert = useAlertsStore((s) => s.dismissAlert);
  const recent = alerts.slice(0, 3);

  if (recent.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {recent.map((alert) => (
        <div key={alert.violation_id} className="ops-notice ops-notice-alert">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              PPE violation — {alert.camera_name}
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Missing: {alert.missing_ppe.join(", ")} ·{" "}
              {format(new Date(alert.timestamp), "HH:mm:ss")}
            </p>
          </div>
          <button
            onClick={() => dismissAlert(alert.violation_id)}
            className="text-current opacity-70 hover:opacity-100 flex-shrink-0"
            aria-label="Dismiss alert"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
