"use client";

import { useEffect } from "react";
import { exceptionLogsApi } from "@/lib/api";

function normalizeError(err: any) {
  if (!err) return { type: "Error", message: "Unknown error", stack: undefined };
  if (err instanceof Error) return { type: err.name, message: err.message, stack: err.stack };
  if (typeof err === "string") return { type: "Error", message: err, stack: undefined };
  return { type: err.name || "Error", message: err.message || JSON.stringify(err), stack: err.stack };
}

export function ExceptionLogger() {
  useEffect(() => {
    const seen = new Set<string>();

    const send = async (payload: any) => {
      try {
        const key = `${payload.type}:${payload.message}:${payload.stack || ""}`;
        if (seen.has(key)) return;
        seen.add(key);

        await exceptionLogsApi.createExceptionLog({
          ...payload,
          source: payload.source || "Frontend",
          requestUrl: window.location.href,
          requestMethod: "GET",
          userAgent: navigator.userAgent
        });
      } catch {
        // ignore to avoid loops
      }
    };

    const onError = (event: ErrorEvent) => {
      const { type, message, stack } = normalizeError(event.error || event.message);
      send({
        type,
        severity: "high",
        message,
        stack,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const { type, message, stack } = normalizeError(event.reason);
      send({
        type,
        severity: "high",
        message,
        stack,
        metadata: { unhandledRejection: true }
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}



















