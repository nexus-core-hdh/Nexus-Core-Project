"use client";

// Record actions of a PLM Costing Sheet — Edit / Save / Lock / Unlock / Print — defined once and
// shown by the Costing Sheets list (right-click / ⋮ per row) and the Costing Sheet screen (⋮), via
// the shared RowContextMenu / RowActionsMenu (components/legacy-erp/row-actions.tsx).
//
// Lock / Unlock call the backend (costing:lock / costing:unlock permissions, checked again by the
// server; a locked sheet refuses every change server-side). Whether the current user holds them
// comes from GET costing-sheets/lock-permissions — the same server-side RBAC, not a UI guess.
// Print opens the company's "Costing Form" report (PLM → Manage Reports, data source
// "Costing Sheet — Costing Form") for the sheet's Costing No (open-document-report.ts).
import { useCallback, useEffect, useState } from "react";
import { FileText, Lock, LockOpen, Pencil, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { COSTING_FORM_REPORT, plmApi } from "@/lib/nexuscore-api";
import type { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { openDocumentReport } from "@/components/reports/open-document-report";
import type { RowAction } from "@/components/legacy-erp/row-actions";

type Router = Parameters<typeof navigateOrOpenTab>[0];

export interface CostingSheetRef {
  id: string | null;
  costingNo: string;
  isLocked: boolean;
}

export function openCostingForm(router: Router, sheet: { costingNo: string }) {
  return openDocumentReport(
    router,
    {
      dataSource: COSTING_FORM_REPORT.dataSource, field: COSTING_FORM_REPORT.sheetField, reportName: COSTING_FORM_REPORT.reportName,
      sourceLabel: "Costing Sheet — Costing Form", module: "plm",
    },
    // The filter value is the Costing No itself (unique), so the label is the same text.
    { id: sheet.costingNo, label: sheet.costingNo },
  );
}

/**
 * Lock permissions of the current user, the lock / unlock requests (each confirmed first) and the
 * confirmation dialog to render. `onChanged` runs after a successful lock / unlock (reload).
 */
export function useCostingSheetActions(router: Router, onChanged: (sheetId: string, isLocked: boolean) => void) {
  const [perms, setPerms] = useState<{ canLock: boolean; canUnlock: boolean }>({ canLock: false, canUnlock: false });
  const [pending, setPending] = useState<{ sheet: CostingSheetRef; lock: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    plmApi.costingSheets.lockPermissions().then((p) => setPerms({ canLock: !!p?.canLock, canUnlock: !!p?.canUnlock })).catch(() => {});
  }, []);

  const confirm = async () => {
    if (!pending?.sheet.id) return;
    const { sheet, lock } = pending;
    setBusy(true);
    try {
      if (lock) await plmApi.costingSheets.lock(sheet.id!);
      else await plmApi.costingSheets.unlock(sheet.id!);
      toast.success(`Costing sheet ${sheet.costingNo} ${lock ? "locked" : "unlocked"}`);
      setPending(null);
      onChanged(sheet.id!, lock);
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${lock ? "lock" : "unlock"} the costing sheet`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The menu for one sheet. `editor` = shown on the sheet's own screen: Edit is hidden there (the
   * sheet is already open) and Save / unsaved-change rules apply; on the list Save has nothing to
   * save.
   */
  const actionsFor = useCallback((sheet: CostingSheetRef, editor?: { dirty: boolean; saving: boolean; onSave: () => void }): RowAction[] => {
    const saved = !!sheet.id;
    const dirty = !!editor?.dirty;
    const unsavedTitle = "Save your changes first";
    return [
      {
        key: "edit", label: sheet.isLocked ? "Open (locked)" : "Edit", icon: Pencil, hidden: !!editor, disabled: !saved,
        title: sheet.isLocked ? "Locked — opens read-only until unlocked" : undefined,
        onSelect: () => { if (sheet.id) router.push(`/plm/costing-sheets/${sheet.id}`); },
      },
      {
        key: "save", label: "Save", icon: Save,
        disabled: !editor || sheet.isLocked || !dirty || editor.saving,
        title: !editor ? "Open the sheet to change it — nothing unsaved here"
          : sheet.isLocked ? "The sheet is locked"
          : !dirty ? "No unsaved changes" : undefined,
        onSelect: () => editor?.onSave(),
      },
      {
        key: "lock", label: "Lock", icon: Lock, separatorBefore: true,
        hidden: sheet.isLocked, disabled: !saved || !perms.canLock || dirty,
        title: !saved ? "Save the sheet first" : !perms.canLock ? "You do not have permission to lock costing sheets" : dirty ? unsavedTitle : undefined,
        onSelect: () => setPending({ sheet, lock: true }),
      },
      {
        key: "unlock", label: "Unlock", icon: LockOpen,
        hidden: !sheet.isLocked, disabled: !saved || !perms.canUnlock,
        title: !perms.canUnlock ? "You do not have permission to unlock costing sheets" : undefined,
        onSelect: () => setPending({ sheet, lock: false }),
      },
      {
        key: "print", label: "Print", icon: Printer, separatorBefore: true, onSelect: () => {},
        disabled: !saved || dirty,
        title: !saved ? "Save the sheet first" : dirty ? `${unsavedTitle} — the Costing Form prints the saved sheet` : undefined,
        subActions: [{
          key: "print-costing-form", label: COSTING_FORM_REPORT.reportName, icon: FileText, disabled: !saved || dirty,
          onSelect: () => { if (saved && !dirty) void openCostingForm(router, sheet); },
        }],
      },
    ];
  }, [perms, router]);

  const dialog = (
    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) setPending(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.lock ? "Lock" : "Unlock"} costing sheet {pending?.sheet.costingNo}?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.lock
              ? "While it is locked nobody can change or delete it. Only a user with permission to unlock costing sheets can unlock it."
              : "It can be changed and deleted again by anyone allowed to edit costing sheets."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void confirm(); }}>
            {busy ? "Please wait..." : pending?.lock ? "Lock" : "Unlock"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { actionsFor, dialog, perms };
}
