import { useAlertsStore } from "@/store/alerts";
import { AlertTriangle, X } from "lucide-react";

export default function AlertBanner() {
  const alerts = useAlertsStore((s) => s.alerts);
  const dismissAlert = useAlertsStore((s) => s.dismissAlert);
  const recent = alerts.slice(0, 3);

  if (recent.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {recent.map((alert) => (
        <div
          key={alert.violation_id}
          className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3"
        >
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              PPE Violation — {alert.camera_name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Missing: {alert.missing_ppe.join(", ")} &bull;{" "}
              {new Date(alert.timestamp).toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={() => dismissAlert(alert.violation_id)}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
