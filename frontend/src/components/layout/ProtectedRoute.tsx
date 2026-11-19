import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import Sidebar from "./Sidebar";

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hazard-rail w-1.5 flex-shrink-0" aria-hidden="true" />
      <Sidebar />
      <main className="ops-grid flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
