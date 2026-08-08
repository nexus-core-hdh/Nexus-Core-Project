"use client";

import { useEffect, useRef } from "react";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";

/**
 * Registers a screen's "has unsaved changes" flag (and, optionally, its own save
 * function) with the Workspace Tab Bar, so closing the tab can warn the user and
 * offer Save & Close / Close Without Saving / Cancel. A no-op when the screen is
 * rendered standalone (outside the workspace stack) — nothing to register against.
 */
export function useWorkspaceDirty(isDirty: boolean, onSave?: () => void | Promise<void>) {
  const ctx = useWorkspaceTabContext();
  const setDirty = useWorkspaceStore((s) => s.setDirty);
  const registerSaveHandler = useWorkspaceStore((s) => s.registerSaveHandler);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!ctx) return;
    setDirty(ctx.tabKey, isDirty);
  }, [ctx, isDirty, setDirty]);

  useEffect(() => {
    if (!ctx) return;
    registerSaveHandler(ctx.tabKey, onSaveRef.current ? () => onSaveRef.current?.() : null);
    return () => registerSaveHandler(ctx.tabKey, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, registerSaveHandler]);
}
