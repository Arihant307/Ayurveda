"use client";

import { useEffect, useRef, useState } from "react";
import type { Alert, Incident } from "./types";

export type LiveMessage =
  | { type: "hello"; user?: string }
  | { type: "ping" }
  | { type: "alert.created" | "alert.updated"; alert: Partial<Alert> & { id: number } }
  | { type: "incident.created" | "incident.updated"; incident: Incident };

export type LiveState = "connecting" | "live" | "reconnecting" | "offline";

// Subscribes to the backend's Server-Sent Events stream (same origin, cookie auth) and falls back
// to the WebSocket endpoint if SSE is not delivered. Reconnects with exponential backoff.
export function useLiveAlerts(onMessage: (m: LiveMessage) => void): LiveState {
  const [state, setState] = useState<LiveState>("connecting");
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let gotHello = false;

    const schedule = (fn: () => void) => {
      if (closed) return;
      setState("reconnecting");
      timer = setTimeout(fn, retry);
      retry = Math.min(retry * 2, 30000);
    };

    const openWs = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const base = process.env.NEXT_PUBLIC_WS_URL || `${proto}://${window.location.host}`;
      ws = new WebSocket(`${base}/api/v1/ws/alerts`);
      ws.onopen = () => {
        retry = 1000;
        setState("live");
      };
      ws.onmessage = (ev) => {
        try {
          handler.current(JSON.parse(ev.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => schedule(openWs);
    };

    const openSse = () => {
      es = new EventSource("/api/v1/stream/alerts", { withCredentials: true });
      const fallback = setTimeout(() => {
        if (!gotHello && !closed) {
          es?.close();
          openWs();
        }
      }, 8000);
      es.addEventListener("hello", () => {
        gotHello = true;
        clearTimeout(fallback);
        retry = 1000;
        setState("live");
      });
      for (const t of ["alert.created", "alert.updated", "incident.created", "incident.updated"]) {
        es.addEventListener(t, (ev) => {
          try {
            handler.current(JSON.parse((ev as MessageEvent).data));
          } catch {
            /* ignore */
          }
        });
      }
      es.onerror = () => {
        clearTimeout(fallback);
        es?.close();
        if (gotHello) schedule(openSse);
        else schedule(openWs);
      };
    };

    openSse();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
      ws?.close();
      setState("offline");
    };
  }, []);

  return state;
}
