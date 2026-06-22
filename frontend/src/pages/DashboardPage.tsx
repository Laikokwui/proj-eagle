import { useEffect, useState } from "react";
import { camerasApi } from "@/api/cameras";
import { useCamerasStore } from "@/store/cameras";
import { useAlertSocket } from "@/hooks/useAlertSocket";
import CameraGrid from "@/components/dashboard/CameraGrid";

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
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Loading cameras...</p>
      </div>
    );
  }

  return <CameraGrid cameras={cameras} />;
}
