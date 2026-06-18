import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/store/auth";

export function useStreamSocket(
  cameraId: number,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  enabled: boolean,
  onFps?: (fps: number) => void,
  onFirstFrame?: () => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((s) => s.accessToken);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const firstFrameRef = useRef(false);

  // Use refs for callbacks to avoid re-creating WebSocket on each render
  const onFpsRef = useRef(onFps);
  const onFirstFrameRef = useRef(onFirstFrame);
  useEffect(() => { onFpsRef.current = onFps; }, [onFps]);
  useEffect(() => { onFirstFrameRef.current = onFirstFrame; }, [onFirstFrame]);

  const connect = useCallback(() => {
    if (!enabled || !token || !canvasRef.current) return;

    firstFrameRef.current = false;
    frameCountRef.current = 0;
    lastFpsTimeRef.current = Date.now();

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/stream/${cameraId}?token=${token}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // First frame notification
      if (!firstFrameRef.current) {
        firstFrameRef.current = true;
        onFirstFrameRef.current?.();
      }

      // FPS tracking
      frameCountRef.current++;
      const now = Date.now();
      const elapsed = now - lastFpsTimeRef.current;
      if (elapsed >= 1000) {
        onFpsRef.current?.(Math.round((frameCountRef.current * 1000) / elapsed));
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      const blob = new Blob([event.data], { type: "image/jpeg" });
      createImageBitmap(blob).then((bitmap) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      });
    };

    ws.onclose = () => {
      if (enabled) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, [cameraId, token, enabled, canvasRef]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
