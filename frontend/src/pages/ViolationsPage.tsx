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

  const unackCount = violations.filter((v) => !v.acknowledged).length;

  if (loading) return (
    <div className="panel px-4 py-14">
      <div className="flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="ops-label">Reading event log…</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="panel-head">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="ops-label text-primary">04 / EVENTS</span>
            <h2 className="ops-title">Violation log</h2>
            <span className="ops-label">{violations.length} shown</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unackCount > 0 && (
              <span className="ops-chip ops-chip-alert">
                <AlertTriangle className="h-3 w-3" />
                {unackCount} unacknowledged
              </span>
            )}
            <button
              onClick={() => violationsApi.exportCsv(selectedCamera !== "" ? { camera_id: selectedCamera as number } : {})}
              className="ops-button"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="panel flex flex-wrap items-center gap-3 px-3 py-2">
        <span className="ops-label">Filters</span>
        <select
          value={selectedCamera}
          onChange={(e) => setSelectedCamera(e.target.value === "" ? "" : Number(e.target.value))}
          className="ops-select"
        >
          <option value="">All cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={String(acknowledged)}
          onChange={(e) => setAcknowledged(e.target.value === "" ? "" : e.target.value === "true")}
          className="ops-select"
        >
          <option value="">All statuses</option>
          <option value="false">Unacknowledged</option>
          <option value="true">Acknowledged</option>
        </select>
      </div>

      {violations.length === 0 ? (
        <div className="panel relative px-6 py-12">
          <div className="hazard-rail absolute left-0 top-0 bottom-0 w-1" aria-hidden="true" />
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <ShieldCheck className="h-9 w-9 text-muted-foreground mx-auto" />
              <p className="ops-title mt-3">No violations recorded</p>
              <p className="text-xs text-muted-foreground mt-1">
                Follow this sequence to start logging PPE events.
              </p>
            </div>
            <div className="space-y-3">
              {[
                {
                  icon: Brain,
                  step: "01",
                  title: "Activate a model",
                  desc: 'Models → Downloaded, then “Set Active” on a YOLO model.',
                },
                {
                  icon: Settings2,
                  step: "02",
                  title: "Configure violation rules",
                  desc: 'Check the classes that trigger events — “no-helmet”, “no-vest”, or “person” for testing.',
                },
                {
                  icon: Video,
                  step: "03",
                  title: "Start a camera stream",
                  desc: "Add an RTSP or HTTP stream under Cameras, then start it.",
                },
                {
                  icon: AlertTriangle,
                  step: "04",
                  title: "Events appear here",
                  desc: "Detected rule matches are logged in real time.",
                },
              ].map(({ icon: Icon, step, title, desc }) => (
                <div key={step} className="flex items-start gap-3 border-l-2 border-border pl-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center border border-border bg-panel-raised font-mono text-[10px] text-primary">
                    {step}
                  </span>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center border-t border-border pt-4">
              Standard Ultralytics models detect general objects. For PPE classes such as helmet, vest,
              and gloves, use a PPE-trained model from Hugging Face.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Camera</th>
                  <th>Missing PPE</th>
                  <th className="hidden md:table-cell">Confidence</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.id} className={!v.acknowledged ? "bg-destructive/5" : ""}>
                    <td className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(v.occurred_at), "MMM d, HH:mm:ss")}
                    </td>
                    <td className="text-sm">{v.camera_name ?? `#${v.camera_id}`}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {v.missing_classes.map((cls) => (
                          <span key={cls} className="ops-chip ops-chip-alert">{cls}</span>
                        ))}
                      </div>
                    </td>
                    <td className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {v.detection_conf != null ? `${(v.detection_conf * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td>
                      {v.acknowledged ? (
                        <span className="ops-chip ops-chip-clear">
                          <CheckCheck className="h-3 w-3" /> Ack’d
                        </span>
                      ) : (
                        <span className="ops-chip ops-chip-alert">
                          <AlertTriangle className="h-3 w-3" /> Open
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDetail(v)}
                          className="icon-button"
                          title="View detail"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {!v.acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(v.id)}
                            className="icon-button hover:text-clear"
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
            <div className="flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="ops-button"
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
