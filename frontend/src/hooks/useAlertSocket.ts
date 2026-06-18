import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { useAlertsStore, type AlertEvent } from "@/store/alerts";

export function useAlertSocket() {
  const token = useAuthStore((s) => s.accessToken);
  const addAlert = useAlertsStore((s) => s.addAlert);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/alerts?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const alert: AlertEvent = JSON.parse(event.data);
          addAlert(alert);
        } catch {}
      };

      ws.onclose = () => {
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [token, addAlert]);
}
