import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Camera, Brain, AlertTriangle, ShieldCheck, LogOut } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useNavigate } from "react-router-dom";
import { useAlertsStore } from "@/store/alerts";
import { useViolationsStore } from "@/store/violations";
import { violationsApi } from "@/api/violations";

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const alerts = useAlertsStore((s) => s.alerts);
  const { unacknowledgedCount, setUnacknowledgedCount, increment } = useViolationsStore();

  // Load initial unacknowledged count
  useEffect(() => {
    violationsApi.stats().then((s) => setUnacknowledgedCount(s.unacknowledged_count));
  }, [setUnacknowledgedCount]);

  // Increment count when a new alert arrives
  const prevAlertCount = useAlertsStore((s) => s.alerts.length);
  useEffect(() => {
    if (alerts.length > 0) {
      increment();
    }
  }, [alerts[0]?.violation_id]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", badge: null },
    { to: "/cameras", icon: Camera, label: "Cameras", badge: null },
    { to: "/models", icon: Brain, label: "Models", badge: null },
    { to: "/violations", icon: AlertTriangle, label: "Violations", badge: unacknowledgedCount > 0 ? unacknowledgedCount : null },
  ];

  return (
    <aside className="w-16 lg:w-56 bg-card border-r border-border flex flex-col">
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <ShieldCheck className="h-6 w-6 text-primary flex-shrink-0" />
        <span className="font-semibold text-sm hidden lg:block">PPE Monitor</span>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`
            }
          >
            <div className="relative flex-shrink-0">
              <Icon className="h-4 w-4" />
              {badge !== null && (
                <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 bg-destructive text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {badge > 99 ? "!" : badge}
                </span>
              )}
            </div>
            <span className="hidden lg:block">{label}</span>
            {badge !== null && (
              <span className="hidden lg:flex ml-auto items-center justify-center h-5 min-w-5 px-1 bg-destructive text-white text-xs font-bold rounded-full">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span className="hidden lg:block">Logout</span>
        </button>
      </div>
    </aside>
  );
}
