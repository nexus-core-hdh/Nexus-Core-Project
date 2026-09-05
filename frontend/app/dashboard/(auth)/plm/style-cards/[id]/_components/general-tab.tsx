"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, ImageOff, X, Plus, Ruler } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { customerApi } from "@/lib/api";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { SelectSizesDialog } from "../../../_components/select-sizes-dialog";

// General tab, rewired to match the reference screenshot's grouped layout (unlabeled top
// field grid, "Customer Info" / Access-Special-Code / Designer-Representative-Wash-Dye
// sections, Preview on the right) and to reuse the same F2-searchable MasterAutocompleteField
// pattern already built for plm/sample-cards' General tab: Brand/Season/Gender against the new
// BrandCard/SeasonCard/GenderCard masters, Colourway against the existing SwatchCard master.
// Group Code/Category/Garment Wash/Garment Dye stay free text — no master exists for any of
// these anywhere in the codebase, same call already made on the sample-cards screen. Contact
// Person and Representative both search the existing EmployeeCard list (same data source as
// Designer): Representative is a real FK (representativeId, added this session — see
// schema.prisma), while Contact Person stays the existing free-text column with search assist
// only (onFreeTextCommit), since changing its storage shape to an FK was not requested and
// would be a bigger, unrequested schema change. Attachments/Picture Gallery/Explanation moved
// out into their own tabs (per the new 12-tab list) — this tab keeps only a read-only image
// Preview strip, matching the screenshot, plus the existing Sizes/Colorway management (no tab
// in the new list supersedes it, so it stays here rather than being dropped).
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3 space-y-3">
      {title && <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>}
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export function GeneralTab({ styleCardId, card, onReloadCard }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  // Customer — the resolved Name for the currently stored customerId, sourced from the already-
  // included `card.customer` relation (getStyleCard's own include), same "id stored, Name shown"
  // convention as Designer/Representative below. Updated locally on selection so the field
  // reflects a new pick immediately, without waiting for a reload.
  const [customerLabel, setCustomerLabel] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [colorwayPick, setColorwayPick] = useState<{ id: string; colorName: string; pantoneCode?: string; color?: string } | null>(null);
  const [sizesDialogOpen, setSizesDialogOpen] = useState(false);
  // Colourway — the full ColorCard master, fetched once so it can drive the swatch preview
  // for BOTH the picker (dropdown + staged colorwayPick) and the already-saved colorways list
  // below (which only stores {swatchCardId,colorName,pantoneCode}, no color hex of its own).
  const [colorCards, setColorCards] = useState<{ id: string; code: string; name: string; color: string }[]>([]);
  useEffect(() => {
    // No branchId filter — matches purchase-order-line-grid.tsx's own plmApi.colors.list()
    // call for its Color cell exactly (the already-working reference for this master).
    plmApi.colors.list().then((r: any) => {
      setColorCards((Array.isArray(r) ? r : []).filter((c: any) => c.inUse !== false));
    }).catch((e: any) => {
      toast.error(e?.message || "Failed to load Color Cards");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const colorById = new Map(colorCards.map((c) => [String(c.id), c]));

  useEffect(() => {
    setForm({
      brand: card.brand || "",
      departmentId: card.departmentId || "",
      groupCode: card.groupCode || "",
      season: card.season || "",
      gender: card.gender || "",
      category: card.category || "",
      customerId: card.customerId || "",
      customerStyleNo: card.customerStyleNo || "",
      contactPerson: card.contactPerson || "",
      accessCode: card.accessCode || "",
      specialCode: card.specialCode || "",
      designerId: card.designerId || "",
      representativeId: card.representativeId || "",
      garmentWash: card.garmentWash || "",
      garmentDye: card.garmentDye || "",
      masterSize: card.masterSize || "",
      sizes: Array.isArray(card.sizes) ? card.sizes : [],
      colorways: Array.isArray(card.colorways) ? card.colorways : [],
      attachments: Array.isArray(card.attachments) ? card.attachments : [],
    });
    setCustomerLabel(card.customer?.name || "");
  }, [card]);

  useEffect(() => {
    (async () => {
      try {
        const [deps, emps] = await Promise.all([
          plmApi.departments.list(),
          plmApi.employees.list(),
        ]);
        setDepartments(Array.isArray(deps) ? deps : deps?.data || []);
        setEmployees(Array.isArray(emps) ? emps : emps?.data || []);
      } catch {
        // lookups are best-effort; form still works with free text
      }
    })();
  }, []);

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const addSize = () => {
    const v = sizeInput.trim();
    if (!v) return;
    if (!form.sizes.includes(v)) set({ sizes: [...form.sizes, v] });
    setSizeInput("");
  };
  const removeSize = (v: string) => set({ sizes: form.sizes.filter((s: string) => s !== v) });

  const addColorway = () => {
    if (!colorwayPick) return;
    if (form.colorways.some((c: any) => c.swatchCardId === colorwayPick.id)) return;
    set({ colorways: [...form.colorways, { swatchCardId: colorwayPick.id, colorName: colorwayPick.colorName, pantoneCode: colorwayPick.pantoneCode }] });
    setColorwayPick(null);
  };
  const removeColorway = (swatchCardId: string) => set({ colorways: form.colorways.filter((c: any) => c.swatchCardId !== swatchCardId) });

  const save = async () => {
    setSaving(true);
    try {
      await plmApi.styleCards.update(styleCardId, {
        ...form,
        departmentId: form.departmentId || null,
        customerId: form.customerId || null,
        designerId: form.designerId || null,
        representativeId: form.representativeId || null,
      });
      toast.success("Saved");
      onReloadCard();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const employeeOptions = (t: string) =>
    Promise.resolve(employees.filter((e) => `${e.employeeNumber} ${e.name}`.toLowerCase().includes(t.toLowerCase())).map((e) => ({ id: e.id, code: e.employeeNumber, name: e.name })));

  const attachmentUrl = (a: any) => (String(a.url || "").startsWith("http") ? a.url : `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || "http://localhost:4000/api/v1"}/${String(a.url || "").replace(/^\//, "")}`);
  const isImage = (a: any) => String(a.type || "").startsWith("image/");
  const previewImages = (form.attachments || []).filter(isImage).slice(0, 4);

  if (!form.sizes) return null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-7 space-y-3">
        <Section>
          <MasterAutocompleteField label="Brand" masterKey="brand" displayValue={form.brand || ""}
            fetchOptions={(t) => plmApi.brands.list({ search: t }) as Promise<any[]>}
            lookupPath="/dashboard/plm/general-definitions/brand-cards"
            onSelect={(o) => set({ brand: o.code })} onClear={() => set({ brand: "" })} />
          <MasterAutocompleteField label="Season" masterKey="season" displayValue={form.season || ""}
            fetchOptions={(t) => plmApi.seasons.list({ search: t }) as Promise<any[]>}
            lookupPath="/dashboard/plm/general-definitions/season-cards"
            onSelect={(o) => set({ season: o.code })} onClear={() => set({ season: "" })} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Department</Label>
            <Select value={form.departmentId} onValueChange={(v) => set({ departmentId: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <MasterAutocompleteField label="Gender" masterKey="gender" displayValue={form.gender || ""}
            fetchOptions={(t) => plmApi.genders.list({ search: t }) as Promise<any[]>}
            lookupPath="/dashboard/plm/general-definitions/gender-cards"
            onSelect={(o) => set({ gender: o.code })} onClear={() => set({ gender: "" })} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Group Code</Label>
            <Input className="h-8 text-sm" value={form.groupCode} onChange={(e) => set({ groupCode: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Input className="h-8 text-sm" value={form.category} onChange={(e) => set({ category: e.target.value })} />
          </div>
        </Section>

        <Section title="Customer Info">
          {/* Customer — was a plain <Select> populated from one unfiltered full-table fetch,
              the only lookup on this tab not using the shared searchable-lookup pattern every
              other field here (Brand/Season/Gender/Designer/Representative/Colourway) already
              uses. Reuses customerApi.getCustomers (the existing Finance Customer CRUD's own
              search-capable list — no new Customer API) and the existing CRM Customer list
              screen for F2/the search icon, instead of the generic Master Lookup screen. */}
          <MasterAutocompleteField
            label="Customer"
            masterKey="customer"
            displayValue={customerLabel}
            fetchOptions={(t) =>
              customerApi.getCustomers({ search: t }).then((r: any) =>
                (Array.isArray(r) ? r : r?.data || []).map((c: any) => ({ id: c.id, name: c.name }))
              )
            }
            lookupPath="/dashboard/crm/customers"
            onSelect={(o) => { set({ customerId: String(o.id) }); setCustomerLabel(o.name); }}
            onClear={() => { set({ customerId: "" }); setCustomerLabel(""); }}
          />
          <div />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Customer Style No</Label>
            <Input className="h-8 text-sm" value={form.customerStyleNo} onChange={(e) => set({ customerStyleNo: e.target.value })} />
          </div>
          <MasterAutocompleteField label="Contact Person" masterKey="contact-person" displayValue={form.contactPerson || ""}
            fetchOptions={employeeOptions}
            lookupPath="/dashboard/plm/general-definitions/employee-cards"
            onSelect={(o) => set({ contactPerson: o.name })} onClear={() => set({ contactPerson: "" })}
            onFreeTextCommit={(text) => set({ contactPerson: text })} />
        </Section>

        <Section>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Access Code</Label>
            <Input className="h-8 text-sm" value={form.accessCode} onChange={(e) => set({ accessCode: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Special Code</Label>
            <Input className="h-8 text-sm" value={form.specialCode} onChange={(e) => set({ specialCode: e.target.value })} />
          </div>
        </Section>

        <Section>
          <MasterAutocompleteField label="Designer" masterKey="designer" displayValue={employees.find((e) => e.id === form.designerId)?.name || ""}
            fetchOptions={employeeOptions}
            lookupPath="/dashboard/plm/general-definitions/employee-cards"
            onSelect={(o) => set({ designerId: String(o.id) })} onClear={() => set({ designerId: "" })} />
          <MasterAutocompleteField label="Representative" masterKey="representative" displayValue={employees.find((e) => e.id === form.representativeId)?.name || ""}
            fetchOptions={employeeOptions}
            lookupPath="/dashboard/plm/general-definitions/employee-cards"
            onSelect={(o) => set({ representativeId: String(o.id) })} onClear={() => set({ representativeId: "" })} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Garment Wash</Label>
            <Input className="h-8 text-sm" value={form.garmentWash} onChange={(e) => set({ garmentWash: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Garment Dye</Label>
            <Input className="h-8 text-sm" value={form.garmentDye} onChange={(e) => set({ garmentDye: e.target.value })} />
          </div>
        </Section>

        <div className="flex justify-end pt-2">
          {/* Distinct label from the page header's own "Save" button (which only persists
              Title/In Use) — this one is what actually persists Brand/Season/Gender/Sizes/
              Colorways/Explanations. Same label collision existed before; naming it clearly
              is the fix for "added a colorway, saved, but it didn't stick" reports. */}
          <Button size="sm" onClick={save} disabled={saving} title="Saves Brand, Season, Sizes, Colorways and the rest of this tab">
            <Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save General Info"}
          </Button>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-5 space-y-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
          <CardContent>
            {previewImages.length === 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex h-24 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <ImageOff className="h-5 w-5" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {previewImages.map((a: any) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={attachmentUrl(a)} alt={a.name} className="h-24 w-full rounded-md border object-cover" />
                ))}
                {Array.from({ length: Math.max(0, 4 - previewImages.length) }).map((_, i) => (
                  <div key={`ph-${i}`} className="flex h-24 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <ImageOff className="h-5 w-5" />
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">Manage images in the Picture Gallery tab.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Colorway / Sizes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Master Size</Label>
              <Input className="h-8 text-sm w-32" value={form.masterSize} onChange={(e) => set({ masterSize: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sizes</Label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {form.sizes.map((s: string) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <button onClick={() => removeSize(s)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input className="h-8 text-sm" placeholder="e.g. 2Y" value={sizeInput} onChange={(e) => setSizeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSize())} />
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addSize} title="Add typed size"><Plus className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setSizesDialogOpen(true)}><Ruler className="h-3.5 w-3.5 mr-1" />Select Sizes</Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Colorways</Label>
              <div className="space-y-1 mb-1.5">
                {form.colorways.map((c: any) => {
                  const cached = colorById.get(String(c.swatchCardId));
                  return (
                    <div key={c.swatchCardId} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ backgroundColor: cached?.color || "#e5e7eb" }} />
                      <span className="flex-1">{c.colorName}{c.pantoneCode ? ` — ${c.pantoneCode}` : ""}</span>
                      <button onClick={() => removeColorway(c.swatchCardId)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 items-start">
                <div
                  className="h-8 w-8 shrink-0 rounded-md border"
                  style={{ backgroundColor: colorwayPick?.color || "transparent" }}
                  title={colorwayPick ? colorwayPick.colorName : "No color selected"}
                />
                <div className="flex-1">
                  <MasterAutocompleteField label="Colourway" compact masterKey="colourway"
                    displayValue={colorwayPick ? colorwayPick.colorName + (colorwayPick.pantoneCode ? ` — ${colorwayPick.pantoneCode}` : "") : ""}
                    fetchOptions={(t) => {
                      const term = t.trim().toLowerCase();
                      const matches = term
                        ? colorCards.filter((c) => c.code?.toLowerCase().includes(term) || c.name?.toLowerCase().includes(term))
                        : colorCards;
                      return Promise.resolve(matches.map((c) => ({
                        id: c.id, code: c.code,
                        // Code is only shown when it actually adds information — many real
                        // records have Code === Name, and "DARK DENIM — DARK DENIM" is noise.
                        name: c.code && c.code.trim().toLowerCase() !== c.name.trim().toLowerCase() ? `${c.name} — ${c.code}` : c.name,
                      })));
                    }}
                    lookupPath="/dashboard/plm/general-definitions/color-cards"
                    renderOption={(o) => {
                      const cached = colorById.get(String(o.id));
                      return (
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ backgroundColor: cached?.color || "#e5e7eb" }} />
                          <span className="truncate">{o.name}</span>
                        </span>
                      );
                    }}
                    onSelect={(o) => {
                      const cached = colorById.get(String(o.id));
                      const code = cached?.code && cached.code.trim().toLowerCase() !== cached.name?.trim().toLowerCase() ? cached.code : undefined;
                      setColorwayPick({ id: String(o.id), colorName: cached?.name ?? o.name, pantoneCode: code, color: cached?.color });
                    }}
                    onClear={() => setColorwayPick(null)} />
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addColorway} disabled={!colorwayPick}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <SelectSizesDialog
        open={sizesDialogOpen}
        onOpenChange={setSizesDialogOpen}
        styleCardId={styleCardId}
        currentSizes={form.sizes || []}
        onSaved={onReloadCard}
      />
    </div>
  );
}
