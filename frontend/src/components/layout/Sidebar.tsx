import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Camera, Brain, AlertTriangle, Settings, ShieldCheck, LogOut } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useNavigate } from "react-router-dom";
import { useAlertsStore } from "@/store/alerts";
import { useViolationsStore } from "@/store/violations";
import { violationsApi } from "@/api/violations";
import { systemApi } from "@/api/system";

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const alerts = useAlertsStore((s) => s.alerts);
  const { unacknowledgedCount, setUnacknowledgedCount, increment } = useViolationsStore();
  const [version, setVersion] = useState("");

  useEffect(() => {
    systemApi
      .version()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(""));
  }, []);

  useEffect(() => {
    violationsApi.stats().then((s) => setUnacknowledgedCount(s.unacknowledged_count));
  }, [setUnacknowledgedCount]);

  const prevAlertCount = useAlertsStore((s) => s.alerts.length);
  useEffect(() => {
    if (alerts.length > 0) increment();
  }, [alerts[0]?.violation_id]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", code: "01", badge: null },
    { to: "/cameras", icon: Camera, label: "Cameras", code: "02", badge: null },
    { to: "/models", icon: Brain, label: "Models", code: "03", badge: null },
    {
      to: "/violations",
      icon: AlertTriangle,
      label: "Violations",
      code: "04",
      badge: unacknowledgedCount > 0 ? unacknowledgedCount : null,
    },
    { to: "/settings", icon: Settings, label: "Settings", code: "05", badge: null },
  ];

  return (
    <aside className="w-16 lg:w-60 flex-shrink-0 border-r border-border bg-panel flex flex-col">
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <ShieldCheck className="h-6 w-6 text-primary flex-shrink-0" />
        <div className="hidden lg:block min-w-0">
          <p className="font-semibold text-sm tracking-tight">PPE Monitor</p>
          <p className="ops-label mt-0.5">Compliance console</p>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ to, icon: Icon, label, code, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-panel-raised text-foreground"
                  : "text-muted-foreground hover:bg-panel-raised/60 hover:text-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />}
                <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                <span className="hidden lg:block flex-1">{label}</span>
                <span className="hidden lg:block ops-label">{code}</span>
                {badge !== null && (
                  <span className="hidden lg:flex items-center justify-center h-5 min-w-5 px-1 bg-fault text-paper font-mono text-[10px]">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                {badge !== null && (
                  <span className="lg:hidden absolute -top-1 right-1 h-2 w-2 bg-fault" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        {version && (
          <div
            className="px-1 pb-2 text-center ops-label lg:px-3 lg:text-left"
            title={`Build ${version}`}
          >
            <span className="lg:hidden">v{version}</span>
            <span className="hidden lg:inline">Build {version}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-sm text-muted-foreground hover:bg-panel-raised hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span className="hidden lg:block">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
