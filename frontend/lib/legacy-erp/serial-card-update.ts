import type { SerialCardUpdateItem } from "@/lib/nexuscore-api";
import type { SerialCardRow } from "@/components/legacy-erp/serial-card-edit-dialog";

const num = (v: any) => (v === "" || v == null ? null : Number(v));

/** A complete SerialCardUpdateItem from a card row. SerialCardService.update() writes EVERY field
 *  from the item (absent → NULL), so any write must start from this, overriding only what changes. */
export function serialCardToUpdateItem(r: Partial<SerialCardRow> & { RecId: number }): SerialCardUpdateItem {
  return {
    id: r.RecId,
    explanation: r.Explanation ?? null,
    partyNo: r.PartyNo ?? null,
    qualityTypeId: r.QualityTypeId ?? null,
    resourceId: r.ResourceId ?? null,
    employeeId: r.EmployeeId ?? null,
    currentAccountId: r.CurrentAccountId ?? null,
    producerSerialCode: r.ProducerSerialCode ?? null,
    manufacturingDate: r.ManufacturingDate ?? null,
    expirationDate: r.ExpirationDate ?? null,
    shelfLife: num(r.ShelfLife),
    quantity: num(r.Quantity),
    quantityMT: num(r.QuantityMT),
    quantity3: num(r.Quantity3),
    width: num(r.Width),
    weight: num(r.Weight),
    rawWidth: num(r.RawWidth),
    rawWeight: num(r.RawWeight),
    rawLength: num(r.RawLength),
    productLength: num(r.ProductLength),
    weightM2: num(r.WeightM2),
    weightMt: num(r.WeightMt),
    pus: num(r.Pus),
    fine: num(r.Fine),
    pieceCount: num(r.PieceCount),
  };
}
