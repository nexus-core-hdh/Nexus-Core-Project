"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSelectField } from "@/components/forms/form-field";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { fixedAssetsApi, calculateDepreciation, type FixedAsset, type AssetStatus } from "@/lib/finance-erp/fixed-assets/register";
import { assetCategoriesApi, DEPRECIATION_METHODS, type AssetCategory, type DepreciationMethod } from "@/lib/finance-erp/fixed-assets/categories";
import { BRANCHES, DEPARTMENTS, EMPLOYEES } from "@/lib/finance-erp/mock/master-data";

const STATUSES: AssetStatus[] = ["Active", "Under Maintenance", "Disposed", "Transferred"];

type FormState = {
  name: string; categoryId: string; purchaseDate: string; purchaseCost: string;
  usefulLifeYears: string; residualValuePct: string; depreciationMethod: DepreciationMethod;
  locationBranchId: string; departmentId: string; custodianEmployeeId: string; status: AssetStatus;
};

const EMPTY: FormState = {
  name: "", categoryId: "", purchaseDate: todayIso(), purchaseCost: "", usefulLifeYears: "5",
  residualValuePct: "0", depreciationMethod: "Straight Line", locationBranchId: "", departmentId: "",
  custodianEmployeeId: "", status: "Active",
};

export default function AssetRegisterFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [assetIdLabel, setAssetIdLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<FixedAsset | null>(null);

  useEffect(() => {
    assetCategoriesApi.list().then(setCategories);
  }, []);

  useEffect(() => {
    if (!id) { setForm(EMPTY); setAssetIdLabel(null); setExisting(null); return; }
    fixedAssetsApi.get(id).then((a) => {
      if (!a) return;
      setExisting(a);
      setAssetIdLabel(a.assetId);
      setForm({
        name: a.name, categoryId: a.categoryId, purchaseDate: a.purchaseDate, purchaseCost: String(a.purchaseCost),
        usefulLifeYears: String(a.usefulLifeYears), residualValuePct: String(a.residualValuePct),
        depreciationMethod: a.depreciationMethod, locationBranchId: a.locationBranchId,
        departmentId: a.departmentId, custodianEmployeeId: a.custodianEmployeeId, status: a.status,
      });
    });
  }, [id]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const onCategoryChange = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    set({
      categoryId,
      usefulLifeYears: cat ? String(cat.usefulLifeYears) : form.usefulLifeYears,
      residualValuePct: cat ? String(cat.residualValuePct) : form.residualValuePct,
      depreciationMethod: cat ? cat.depreciationMethod : form.depreciationMethod,
    });
  };

  const goBack = () => navigateOrOpenTab(router, "/dashboard/finance-erp/fixed-assets/register-list");

  const buildPayload = () => ({
    name: form.name.trim(),
    categoryId: form.categoryId,
    purchaseDate: form.purchaseDate,
    purchaseCost: Number(form.purchaseCost) || 0,
    usefulLifeYears: Number(form.usefulLifeYears) || 1,
    residualValuePct: Number(form.residualValuePct) || 0,
    depreciationMethod: form.depreciationMethod,
    locationBranchId: form.locationBranchId,
    departmentId: form.departmentId,
    custodianEmployeeId: form.custodianEmployeeId,
    status: form.status,
  });

  const submit = async () => {
    setSaving(true);
    try {
      if (!form.name.trim()) throw new FinanceValidationError("Asset Name is required.");
      if (!form.categoryId) throw new FinanceValidationError("Category is required.");
      if (!form.purchaseCost || Number(form.purchaseCost) <= 0) throw new FinanceValidationError("Purchase Cost must be greater than zero.");
      if (!form.usefulLifeYears || Number(form.usefulLifeYears) <= 0) throw new FinanceValidationError("Useful Life must be greater than zero.");
      if (form.residualValuePct !== "" && (Number(form.residualValuePct) < 0 || Number(form.residualValuePct) > 100)) {
        throw new FinanceValidationError("Residual Value (%) must be between 0 and 100.");
      }

      if (isEdit && id) {
        await fixedAssetsApi.update(id, buildPayload());
        toast.success("Asset updated");
      } else {
        await fixedAssetsApi.create(buildPayload());
        toast.success("Asset added to register");
      }
      goBack();
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  const preview = existing ? calculateDepreciation({ ...existing, ...buildPayload() } as FixedAsset) : null;

  return (
    <div className="mx-auto max-w-[1300px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Asset Register", href: "/dashboard/finance-erp/fixed-assets/register-list" }, { label: isEdit ? assetIdLabel ?? "Edit" : "New Asset" }]} />
      <ModuleHeader icon={Building2} title={isEdit ? `Asset ${assetIdLabel ?? ""}` : "New Fixed Asset"} subtitle="Register a fixed asset and its depreciation basis" />

      <FormSection title="Asset Details">
        <FormTextField label="Asset Name *" value={form.name} onChange={(v) => set({ name: v })} span="wide" />
        <FormSelectField label="Category *" value={form.categoryId} onChange={onCategoryChange} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <FormTextField label="Purchase Date *" type="date" value={form.purchaseDate} onChange={(v) => set({ purchaseDate: v })} />
        <FormTextField label="Purchase Cost *" type="number" value={form.purchaseCost} onChange={(v) => set({ purchaseCost: v })} />
        <FormTextField label="Useful Life (Years)" type="number" value={form.usefulLifeYears} onChange={(v) => set({ usefulLifeYears: v })} />
        <FormTextField label="Residual Value (%)" type="number" value={form.residualValuePct} onChange={(v) => set({ residualValuePct: v })} />
        <FormSelectField label="Depreciation Method" value={form.depreciationMethod} onChange={(v) => set({ depreciationMethod: v as DepreciationMethod })} options={DEPRECIATION_METHODS.map((m) => ({ value: m, label: m }))} />
        <FormSelectField label="Status" value={form.status} onChange={(v) => set({ status: v as AssetStatus })} options={STATUSES.map((s) => ({ value: s, label: s }))} />
      </FormSection>

      <FormSection title="Location & Ownership">
        <FormSelectField label="Location / Branch" value={form.locationBranchId} onChange={(v) => set({ locationBranchId: v })} options={BRANCHES.map((b) => ({ value: b.id, label: b.name }))} />
        <FormSelectField label="Department" value={form.departmentId} onChange={(v) => set({ departmentId: v })} options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))} />
        <FormSelectField label="Custodian" value={form.custodianEmployeeId} onChange={(v) => set({ custodianEmployeeId: v })} options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name }))} />
      </FormSection>

      {preview && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Purchase Cost</div>
            <div className="mt-1 text-lg font-bold">{Number(form.purchaseCost || 0).toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-muted/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Accumulated Depreciation</div>
            <div className="mt-1 text-lg font-bold text-orange-600 dark:text-orange-400">{preview.accumulatedDepreciation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="rounded-lg border bg-muted/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Net Book Value</div>
            <div className="mt-1 text-lg font-bold text-primary">{preview.netBookValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      )}

      <FormActionsBar onCancel={goBack} onSubmit={submit} submitLabel={isEdit ? "Save Changes" : "Add Asset"} saving={saving} />
    </div>
  );
}
