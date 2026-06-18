import { useLocation } from "react-router-dom";
import { useAlertsStore } from "@/store/alerts";
import { Bell } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Live Dashboard",
  "/cameras": "Cameras",
  "/models": "AI Models",
  "/violations": "Violations",
};

export default function Header() {
  const location = useLocation();
  const alerts = useAlertsStore((s) => s.alerts);
  const unacknowledged = alerts.length;

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6">
      <h1 className="font-semibold text-sm">
        {PAGE_TITLES[location.pathname] ?? "PPE Monitor"}
      </h1>
      <div className="flex items-center gap-3">
        {unacknowledged > 0 && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <Bell className="h-4 w-4 animate-pulse" />
            <span>{unacknowledged} active alert{unacknowledged !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </header>
  );
}
