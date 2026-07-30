"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardToServerMessage, ServerToDashboardMessage } from "@/types";

export type WsStatus = "connecting" | "open" | "closed";

interface UseWebSocketOptions {
  role: "dashboard";
  onMessage?: (message: ServerToDashboardMessage) => void;
  enabled?: boolean;
}

interface UseWebSocketResult {
  status: WsStatus;
  send: (payload: DashboardToServerMessage) => boolean;
}

// Mirrors extension/background/background.js's reconnect constants so
// both sides of the transport behave consistently.
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;

export function useWebSocket({ role, onMessage, enabled = true }: UseWebSocketOptions): UseWebSocketResult {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closedByCleanupRef = useRef(false);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled) return;

    closedByCleanupRef.current = false;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/api/ws?role=${role}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;
      setStatus("connecting");

      ws.addEventListener("open", () => {
        attemptsRef.current = 0;
        setStatus("open");
      });

      ws.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data) as ServerToDashboardMessage;
          onMessageRef.current?.(message);
        } catch {
          // ignore malformed frames
        }
      });

      ws.addEventListener("close", () => {
        setStatus("closed");
        if (closedByCleanupRef.current) return;
        attemptsRef.current += 1;
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attemptsRef.current, MAX_BACKOFF_MS);
        const jitter = Math.random() * 0.3 * backoff;
        reconnectTimerRef.current = setTimeout(connect, backoff + jitter);
      });

      ws.addEventListener("error", () => ws.close());
    }

    connect();

    return () => {
      closedByCleanupRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [role, enabled]);

  const send = useCallback((payload: DashboardToServerMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  return { status, send };
}
