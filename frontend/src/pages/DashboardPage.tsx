import { useEffect, useState } from "react";
import { camerasApi } from "@/api/cameras";
import { useCamerasStore } from "@/store/cameras";
import { useAlertSocket } from "@/hooks/useAlertSocket";
import CameraGrid from "@/components/dashboard/CameraGrid";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  useAlertSocket();
  const { cameras, setCameras } = useCamerasStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    camerasApi.list().then((data) => {
      setCameras(data);
      setLoading(false);
    });
  }, [setCameras]);

  if (loading) {
    return (
      <div className="panel px-4 py-14">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="ops-label">Loading camera wall…</span>
        </div>
      </div>
    );
  }

  return <CameraGrid cameras={cameras} />;
}
