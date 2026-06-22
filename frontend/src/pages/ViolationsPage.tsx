import { useEffect, useRef, useState } from "react";
import { violationsApi, type Violation } from "@/api/violations";
import { camerasApi, type Camera } from "@/api/cameras";
import { useAlertsStore } from "@/store/alerts";
import { useViolationsStore } from "@/store/violations";
import { CheckCheck, Download, Eye, AlertTriangle, Loader2, Brain, Settings2, Video, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import ViolationDetailModal from "@/components/violations/ViolationDetailModal";

const PAGE_SIZE = 50;

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<number | "">("");
  const [acknowledged, setAcknowledged] = useState<boolean | "">("");
  const [detail, setDetail] = useState<Violation | null>(null);

  const { setUnacknowledgedCount, decrement } = useViolationsStore();
  const alerts = useAlertsStore((s) => s.alerts);
  const latestAlertId = useRef<number | null>(null);

  const buildFilters = () => {
    const f: Record<string, unknown> = {};
    if (selectedCamera !== "") f.camera_id = selectedCamera;
    if (acknowledged !== "") f.acknowledged = acknowledged;
    return f;
  };

  const load = async () => {
    const data = await violationsApi.list({ ...buildFilters(), limit: PAGE_SIZE });
    setViolations(data);
    setHasMore(data.length === PAGE_SIZE);
  };

  useEffect(() => {
    Promise.all([camerasApi.list(), violationsApi.list({ limit: PAGE_SIZE }), violationsApi.stats()])
      .then(([cams, viols, stats]) => {
        setCameras(cams);
        setViolations(viols);
        setHasMore(viols.length === PAGE_SIZE);
        setUnacknowledgedCount(stats.unacknowledged_count);
        setLoading(false);
      });
  }, [setUnacknowledgedCount]);

  useEffect(() => {
    if (!loading) load();
  }, [selectedCamera, acknowledged]);

  // Prepend new violations arriving via the alert WebSocket
  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    if (latest.violation_id === latestAlertId.current) return;
    latestAlertId.current = latest.violation_id;

    // Only prepend if not filtered out by current filters
    if (selectedCamera !== "" && latest.camera_id !== selectedCamera) return;
    if (acknowledged === true) return; // new violations are always unacknowledged

    const newV: Violation = {
      id: latest.violation_id,
      camera_id: latest.camera_id,
      camera_name: latest.camera_name,
      ai_model_id: null,
      screenshot_path: latest.screenshot_url,
      screenshot_url: latest.screenshot_url,
      missing_classes: latest.missing_ppe,
      detection_conf: null,
      acknowledged: false,
      acknowledged_by: null,
      acknowledged_at: null,
      occurred_at: latest.timestamp,
    };

    setViolations((prev) =>
      prev.some((v) => v.id === newV.id) ? prev : [newV, ...prev]
    );
  }, [alerts]);

  const handleLoadMore = async () => {
    if (violations.length === 0) return;
    setLoadingMore(true);
    const cursor = violations[violations.length - 1].id;
    const more = await violationsApi.list({ ...buildFilters(), limit: PAGE_SIZE, cursor });
    setViolations((prev) => [...prev, ...more]);
    setHasMore(more.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const handleAcknowledge = async (id: number) => {
    const updated = await violationsApi.acknowledge(id);
    setViolations((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    if (detail?.id === id) setDetail(updated);
    decrement();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );

  const unackCount = violations.filter((v) => !v.acknowledged).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Violations</h2>
          {unackCount > 0 && (
            <p className="text-xs text-destructive mt-0.5">
              {unackCount} unacknowledged
            </p>
          )}
        </div>
        <button
          onClick={() => violationsApi.exportCsv(selectedCamera !== "" ? { camera_id: selectedCamera as number } : {})}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select
          value={selectedCamera}
          onChange={(e) => setSelectedCamera(e.target.value === "" ? "" : Number(e.target.value))}
          className="px-3 py-1.5 bg-secondary border border-border rounded-md text-sm"
        >
          <option value="">All cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={String(acknowledged)}
          onChange={(e) => setAcknowledged(e.target.value === "" ? "" : e.target.value === "true")}
          className="px-3 py-1.5 bg-secondary border border-border rounded-md text-sm"
        >
          <option value="">All statuses</option>
          <option value="false">Unacknowledged</option>
          <option value="true">Acknowledged</option>
        </select>
      </div>

      {violations.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg px-6 py-12">
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-medium text-sm">No violations recorded yet</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Follow these steps to start detecting PPE violations.
              </p>
            </div>
            <div className="space-y-3">
              {[
                {
                  icon: Brain,
                  step: "1",
                  title: "Activate a model",
                  desc: 'Go to Models → Downloaded and click "Set Active" on a YOLO model.',
                },
                {
                  icon: Settings2,
                  step: "2",
                  title: "Configure violation rules",
                  desc: 'Click "Configure Rules" on the active model and check which detected classes should trigger violations (e.g. "no-helmet", "no-vest", or "person" for testing).',
                },
                {
                  icon: Video,
                  step: "3",
                  title: "Start a camera stream",
                  desc: 'Go to Cameras, add a camera with an RTSP/HTTP stream URL, and click Start.',
                },
                {
                  icon: AlertTriangle,
                  step: "4",
                  title: "Violations appear here",
                  desc: "When the model detects a configured violation class in the stream, it will be logged here in real time.",
                },
              ].map(({ icon: Icon, step, title, desc }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-secondary border border-border flex items-center justify-center">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center border-t border-border pt-4">
              Tip: Standard Ultralytics models detect general objects like "person" and "car".
              For real PPE detection, search HuggingFace for a model trained on PPE classes (helmet, vest, gloves).
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Time</th>
                  <th className="text-left px-4 py-3 font-medium">Camera</th>
                  <th className="text-left px-4 py-3 font-medium">Missing PPE</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Confidence</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {violations.map((v) => (
                  <tr key={v.id} className={`hover:bg-secondary/50 ${!v.acknowledged ? "bg-destructive/5" : ""}`}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {format(new Date(v.occurred_at), "MMM d, HH:mm:ss")}
                    </td>
                    <td className="px-4 py-3">{v.camera_name ?? `#${v.camera_id}`}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.missing_classes.map((cls) => (
                          <span key={cls} className="px-2 py-0.5 text-xs bg-destructive/20 text-destructive rounded-full">
                            {cls}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {v.detection_conf != null ? `${(v.detection_conf * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.acknowledged ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCheck className="h-3.5 w-3.5 text-green-400" /> Ack'd
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" /> Open
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setDetail(v)}
                          className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                          title="View detail"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {!v.acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(v.id)}
                            className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-green-400"
                            title="Acknowledge"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm hover:bg-secondary disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </>
      )}

      {detail && (
        <ViolationDetailModal
          violation={detail}
          onClose={() => setDetail(null)}
          onAcknowledge={() => handleAcknowledge(detail.id)}
        />
      )}
    </div>
  );
}
