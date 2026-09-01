"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Upload, ClipboardPaste, File as FileIcon, ImageOff, X, Plus, Ruler } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { customerApi, uploadApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { SelectSizesDialog } from "../../../_components/select-sizes-dialog";

// Same field set/lookups as plm/style-cards/[id]/_components/general-tab.tsx (Department via
// plmApi.departments.list(), Production/Product Merchandiser + Designer via
// plmApi.employees.list(), Customer via customerApi.getCustomers()) — reused as-is, since these
// StyleCard fields already have real working lookups. Group Code binds to the same
// StyleCard.groupCode field the style-cards General tab already uses (not the separate, unused
// productCode field) — matches both the reference screenshot's "Group Code" label and the
// master template's binding. Brand/Season/Gender/Colourway are F2-searchable
// MasterAutocompleteField pickers bound to the new Brand/Season/Gender Card masters and the
// existing SwatchCard master respectively (see general-definitions/{brand,season,gender}-cards
// for the masters, and swatch-cards for Colourway) — each still just writes the same plain
// string/id the field already stored before, so no schema change on StyleCard. Layout: two-
// column left form + right rail (Attachments / Colorway-Sizes / Explanations), matching the
// legacy reference screenshot instead of the existing screen's single wide card.

export function GeneralTab({ styleCardId, card, onReloadCard }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sizeInput, setSizeInput] = useState("");
  const [colorwayPick, setColorwayPick] = useState<{ id: string; colorName: string; pantoneCode?: string; color?: string } | null>(null);
  const [sizesDialogOpen, setSizesDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  // Synchronous re-entrancy guard for the clipboard button — `uploading` state only flips
  // true once uploadFile() actually starts (after the clipboard read/permission prompt
  // resolves), so a rapid double-click before that state update lands could otherwise fire
  // navigator.clipboard.read() twice and add the same clipboard image as two attachments.
  const clipboardBusyRef = useRef(false);
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
      sentByCustomer: !!card.sentByCustomer,
      contactPerson: card.contactPerson || "",
      productionMerchandiserId: card.productionMerchandiserId || "",
      productMerchandiserId: card.productMerchandiserId || "",
      garmentWash: card.garmentWash || "",
      garmentDye: card.garmentDye || "",
      designerId: card.designerId || "",
      masterSize: card.masterSize || "",
      sizes: Array.isArray(card.sizes) ? card.sizes : [],
      colorways: Array.isArray(card.colorways) ? card.colorways : [],
      attachments: Array.isArray(card.attachments) ? card.attachments : [],
      explanations: card.explanations || "",
    });
  }, [card]);

  useEffect(() => {
    (async () => {
      try {
        const [deps, emps, custs] = await Promise.all([
          plmApi.departments.list(),
          plmApi.employees.list(),
          customerApi.getCustomers().catch(() => []),
        ]);
        setDepartments(Array.isArray(deps) ? deps : deps?.data || []);
        setEmployees(Array.isArray(emps) ? emps : emps?.data || []);
        setCustomers(Array.isArray(custs) ? custs : custs?.data || []);
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

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const user = getCurrentUser();
      const result = await uploadApi.uploadSingle(file, user?.id as any);
      const url = result.relativePath || result.url || `files/${result.type}/${result.name}`;
      set({ attachments: [...form.attachments, { id: `${Date.now()}`, name: file.name, type: file.type, url }] });
      toast.success("File uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadFile(file);
  };

  // "Add Picture from Clipboard" — reuses the exact same uploadApi.uploadSingle() the file-picker
  // path already calls; only the source of the File differs (a pasted image blob instead of a
  // <input type=file> selection). Same clipboard-image-extraction technique already used
  // elsewhere in this codebase (components/ui/custom/minimal-tiptap's file-handler extension),
  // not a new upload mechanism.
  const onPasteImage = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const file = new File([blob], `clipboard-${Date.now()}.${item.type.split("/")[1] || "png"}`, { type: item.type });
        await uploadFile(file);
        return;
      }
    }
  };

  // "Add Picture from Clipboard" button (as opposed to the paste-zone above, which needs the
  // user to click into it first) — reads the OS clipboard directly via the Async Clipboard API
  // on click, but still funnels the result through the exact same uploadFile()/uploadApi
  // .uploadSingle() path as every other attachment here, so it's the same upload/storage
  // workflow and the same StyleCard.attachments record shape, not a second mechanism.
  const onClipboardButtonClick = async () => {
    if (!navigator.clipboard?.read) {
      toast.error("Clipboard access is not supported in this browser");
      return;
    }
    if (clipboardBusyRef.current) return;
    clipboardBusyRef.current = true;
    try {
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          found = true;
          const blob = await item.getType(imageType);
          const file = new File([blob], `clipboard-${Date.now()}.${imageType.split("/")[1] || "png"}`, { type: imageType });
          await uploadFile(file);
          break;
        }
      }
      if (!found) toast.error("No image found in clipboard. Copy an image first, then try again.");
    } catch (e: any) {
      toast.error(e?.message || "Could not read clipboard. Grant clipboard permission, or use Ctrl+V in the paste box below.");
    } finally {
      clipboardBusyRef.current = false;
    }
  };

  const removeAttachment = (id: string) => set({ attachments: form.attachments.filter((a: any) => a.id !== id) });

  const attachmentUrl = (a: any) => (String(a.url || "").startsWith("http") ? a.url : `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || "http://localhost:4000/api/v1"}/${String(a.url || "").replace(/^\//, "")}`);
  const isImage = (a: any) => String(a.type || "").startsWith("image/");

  const save = async () => {
    setSaving(true);
    try {
      await plmApi.styleCards.update(styleCardId, {
        ...form,
        departmentId: form.departmentId || null,
        customerId: form.customerId || null,
        productionMerchandiserId: form.productionMerchandiserId || null,
        productMerchandiserId: form.productMerchandiserId || null,
        designerId: form.designerId || null,
      });
      toast.success("Saved");
      onReloadCard();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!form.sizes) return null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-7 rounded-md border p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <MasterAutocompleteField label="Brand" masterKey="brand" displayValue={form.brand || ""}
            fetchOptions={(t) => plmApi.brands.list({ search: t }) as Promise<any[]>}
            lookupPath="/dashboard/plm/general-definitions/brand-cards"
            onSelect={(o) => set({ brand: o.code })} onClear={() => set({ brand: "" })} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Department</Label>
            <Select value={form.departmentId} onValueChange={(v) => set({ departmentId: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Group Code</Label>
            <Input className="h-8 text-sm" value={form.groupCode} onChange={(e) => set({ groupCode: e.target.value })} />
          </div>
          <MasterAutocompleteField label="Season" masterKey="season" displayValue={form.season || ""}
            fetchOptions={(t) => plmApi.seasons.list({ search: t }) as Promise<any[]>}
            lookupPath="/dashboard/plm/general-definitions/season-cards"
            onSelect={(o) => set({ season: o.code })} onClear={() => set({ season: "" })} />
          <MasterAutocompleteField label="Gender" masterKey="gender" displayValue={form.gender || ""}
            fetchOptions={(t) => plmApi.genders.list({ search: t }) as Promise<any[]>}
            lookupPath="/dashboard/plm/general-definitions/gender-cards"
            onSelect={(o) => set({ gender: o.code })} onClear={() => set({ gender: "" })} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Input className="h-8 text-sm" value={form.category} onChange={(e) => set({ category: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <Select value={form.customerId} onValueChange={(v) => set({ customerId: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Customer Style No</Label>
            <Input className="h-8 text-sm" value={form.customerStyleNo} onChange={(e) => set({ customerStyleNo: e.target.value })} />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!form.sentByCustomer} onCheckedChange={(v) => set({ sentByCustomer: !!v })} />
              Sent by Customer
            </label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Contact Person</Label>
            <Input className="h-8 text-sm" value={form.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Production Merchandiser</Label>
            <Select value={form.productionMerchandiserId} onValueChange={(v) => set({ productionMerchandiserId: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.employeeNumber} — {e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Product Merchandiser</Label>
            <Select value={form.productMerchandiserId} onValueChange={(v) => set({ productMerchandiserId: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.employeeNumber} — {e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Garment Wash</Label>
            <Input className="h-8 text-sm" value={form.garmentWash} onChange={(e) => set({ garmentWash: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Garment Dye</Label>
            <Input className="h-8 text-sm" value={form.garmentDye} onChange={(e) => set({ garmentDye: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Designer</Label>
            <Select value={form.designerId} onValueChange={(v) => set({ designerId: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.employeeNumber} — {e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
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
          <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm">Attachments</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1" />Add New Document
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={uploading} onClick={onClipboardButtonClick}>
                <ClipboardPaste className="h-3.5 w-3.5 mr-1" />Add Picture from Clipboard
              </Button>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
          </CardHeader>
          <CardContent className="space-y-2">
            <div
              ref={pasteZoneRef}
              tabIndex={0}
              onPaste={onPasteImage}
              className="flex items-center gap-2 rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              title="Click here, then paste (Ctrl+V) an image from your clipboard"
            >
              <ClipboardPaste className="h-3.5 w-3.5 shrink-0" />
              {uploading ? "Uploading..." : "Click here, then Ctrl+V to Add Picture from Clipboard"}
            </div>
            {!form.attachments.length ? (
              <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground py-4">
                <ImageOff className="h-5 w-5" />
                <p className="text-xs">No attachments yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {form.attachments.map((a: any) => (
                  <div key={a.id} className="group relative rounded-md border overflow-hidden">
                    {isImage(a) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={attachmentUrl(a)} alt={a.name} className="h-16 w-full object-cover" />
                    ) : (
                      <div className="flex h-16 flex-col items-center justify-center gap-1 bg-muted/40">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="block truncate bg-background/90 px-1 py-0.5 text-[10px]">{a.name}</span>
                    <button
                      onClick={() => removeAttachment(a.id)}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Colorway / Sizes Set</CardTitle></CardHeader>
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

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Explanations</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={4} value={form.explanations} onChange={(e) => set({ explanations: e.target.value })} placeholder="Notes about this sample..." />
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
