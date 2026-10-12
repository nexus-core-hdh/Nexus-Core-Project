// User Defined Fields — grid-level runtime (custom-field-grids.ts): one definition per LOGICAL grid
// shared by every screen that shows it, values per row, row ownership resolved server-side, the
// same validation/Required/inactive/audit rules as screen values, batched reads and writes, and
// the Style/Sample Card BOM row identity that grid values depend on.
// Runs against the throwaway test database (`npm run test:udf`).
import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createWorld, dropdownOptions, expectHttpError, fieldDto, resetDatabase, World } from './fixtures';
import { UDF_GRIDS } from '../../src/modules/entities/custom-field-grids';

let w: World;
let queryCount = 0;
before(async () => {
  w = await createWorld();
  (w.prisma as any).$on('query', () => { queryCount++; });
});
after(async () => { await resetDatabase(w.prisma); await w.prisma.$disconnect(); });

const byRow = (values: { entityId: string; customFieldId: string; value: unknown }[], fieldId: string) =>
  Object.fromEntries(values.filter((v) => v.customFieldId === fieldId).map((v) => [v.entityId, v.value]));

/** Database round trips made while `fn` runs (PrismaService emits one event per query). */
async function countQueries(fn: () => Promise<unknown>) {
  const start = queryCount;
  await fn();
  return queryCount - start;
}

describe('registry and administration targets', () => {
  test('targets list screens and grids with their usages, unsupported usages explained', () => {
    const t = w.svc.listTargets();
    for (const s of ['WorkOrder', 'PurchaseOrder', 'SubcontractOrder', 'Contract', 'InventoryReceipt', 'FiReceipt', 'StyleCard', 'SampleCard', 'YarnCard']) {
      assert.ok(t.screens.some((x) => x.key === s), `${s} is a screen target`);
    }
    const order = t.grids.find((g) => g.key === 'OrderLine')!;
    assert.deepEqual(order.usages, ['Purchase Orders', 'Subcontract Orders']);
    const bom = t.grids.find((g) => g.key === 'BomLine')!;
    assert.deepEqual(bom.usages, ['Style Cards', 'Sample Cards']);
    assert.equal(bom.unsupportedUsages[0].usage, 'Work Orders');
    assert.ok(bom.unsupportedUsages[0].reason.length > 20);
    assert.deepEqual(t.grids.map((g) => g.key).sort(), Object.keys(UDF_GRIDS).sort());
  });

  test('grid fields are created once per logical grid, not per screen', async () => {
    const u = w.users.adminA1;
    await w.svc.create(u, fieldDto('OrderLine', 'UD_GridOnce', 'textbox'));
    await expectHttpError(w.svc.create(u, fieldDto('OrderLine', 'UD_GridOnce', 'textbox')), 409, /already used/);
    // Usage keys are not targets of their own.
    await expectHttpError(w.svc.create(u, fieldDto('PurchaseOrderLine', 'UD_X', 'textbox')), 400, /entities whose screens/);
  });
});

describe('OrderLine — shared by Purchase and Subcontract Orders', () => {
  let note: string; let qty: string;
  const u = () => w.users.adminA1;

  before(async () => {
    note = (await w.svc.create(u(), fieldDto('OrderLine', 'UD_LineNote', 'textbox'))).id;
    qty = (await w.svc.create(u(), fieldDto('OrderLine', 'UD_LineQty', 'number'))).id;
  });

  test('one definition appears for every usage of the grid', async () => {
    const runtime = await w.svc.listForRuntime(u(), 'OrderLine');
    assert.deepEqual(runtime.filter((f) => [note, qty].includes(f.id)).map((f) => f.id), [note, qty]);
    // The same definitions resolve for a Purchase Order and a Subcontract Order document.
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [{ rowId: w.lines.po[0], values: [{ customFieldId: note, value: 'po row' }] }]);
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.subcontractOrder, [{ rowId: w.lines.so[0], values: [{ customFieldId: note, value: 'so row' }] }]);
    assert.equal(byRow(await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder), note)[w.lines.po[0]], 'po row');
    assert.equal(byRow(await w.svc.getGridValues(u(), 'OrderLine', w.records.subcontractOrder), note)[w.lines.so[0]], 'so row');
  });

  test('different rows keep different values; reads return only this document\'s rows', async () => {
    const [r1, r2, r3] = w.lines.po;
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [
      { rowId: r1, values: [{ customFieldId: qty, value: 1 }] },
      { rowId: r2, values: [{ customFieldId: qty, value: 2 }, { customFieldId: note, value: 'second' }] },
      { rowId: Number(r3), values: [{ customFieldId: qty, value: 3 }] },
    ]);
    const values = await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder);
    assert.deepEqual(byRow(values, qty), { [r1]: 1, [r2]: 2, [r3]: 3 });
    assert.equal(byRow(values, note)[r1], 'po row', 'a field not sent keeps its value');
    assert.ok(values.every((v) => w.lines.po.includes(v.entityId)));
    // Another document's rows are untouched and not returned here.
    assert.deepEqual(byRow(await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder2), qty), {});
  });

  test('edit and clear one row', async () => {
    const [r1, r2] = w.lines.po;
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [{ rowId: r2, values: [{ customFieldId: qty, value: 22 }, { customFieldId: note, value: null }] }]);
    const values = await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder);
    assert.equal(byRow(values, qty)[r2], 22);
    assert.equal(byRow(values, note)[r2], undefined);
    assert.equal(byRow(values, qty)[r1], 1);
  });

  test('row ownership: other documents\' rows, deleted rows and junk ids are refused, nothing written', async () => {
    const before = await w.prisma.customFieldValue.count();
    const bad = async (parent: string, rowId: unknown, re = /does not belong/) =>
      expectHttpError(w.svc.upsertGridValues(u(), 'OrderLine', parent, [{ rowId, values: [{ customFieldId: qty, value: 5 }] }]), 400, re);
    await bad(w.records.purchaseOrder, w.lines.po2[0]); // live row of another PO
    await bad(w.records.purchaseOrder, w.lines.so[0]); // row of a Subcontract Order
    await bad(w.records.purchaseOrder, w.lines.poDeleted); // soft-deleted row of this PO
    await bad(w.records.purchaseOrder, w.lines.contract[0]); // a row of another grid's table
    await bad(w.records.purchaseOrder, '1 OR 1=1');
    await bad(w.records.purchaseOrder, undefined, /needs a rowId/);
    await bad(w.records.purchaseOrder, { id: 1 }, /needs a rowId/);
    // One bad row refuses the whole batch.
    await expectHttpError(w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [
      { rowId: w.lines.po[0], values: [{ customFieldId: qty, value: 99 }] },
      { rowId: w.lines.po2[0], values: [{ customFieldId: qty, value: 99 }] },
    ]), 400);
    await expectHttpError(w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [
      { rowId: w.lines.po[0], values: [] }, { rowId: w.lines.po[0], values: [] },
    ]), 400, /more than once/);
    await expectHttpError(w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, []), 400, /non-empty/);
    assert.equal(await w.prisma.customFieldValue.count(), before);
    assert.equal(byRow(await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder), qty)[w.lines.po[0]], 1);
  });

  test('parent documents are resolved server-side', async () => {
    for (const [grid, parent] of [
      ['OrderLine', w.records.otherTypeOrder], ['OrderLine', '999999999'], ['OrderLine', 'abc'], ['OrderLine', w.records.purchaseContract + '0'],
      ['ContractLine', w.records.unknownTypeContract], ['NoSuchGrid', w.records.purchaseOrder], ['__proto__', w.records.purchaseOrder],
      ['OrderLine', undefined], ['BomLine', w.records.workOrder], ['BomLine', w.records.styleCardB1],
    ] as [string, string][]) {
      await expectHttpError(w.svc.getGridValues(u(), grid, parent), 404);
      await expectHttpError(w.svc.upsertGridValues(u(), grid, parent, [{ rowId: '1', values: [] }]), 404);
    }
  });

  test('writes need the parent screen\'s update permission (Purchase vs Subcontract Order)', async () => {
    const payload = (rowId: string) => [{ rowId, values: [{ customFieldId: qty, value: 4 }] }];
    await expectHttpError(w.svc.upsertGridValues(w.users.noPermsA1, 'OrderLine', w.records.purchaseOrder, payload(w.lines.po[0])), 403);
    await w.svc.upsertGridValues(w.users.purchaseOrdersOnlyA1, 'OrderLine', w.records.purchaseOrder, payload(w.lines.po[0]));
    await expectHttpError(w.svc.upsertGridValues(w.users.purchaseOrdersOnlyA1, 'OrderLine', w.records.subcontractOrder, payload(w.lines.so[0])), 403);
    // Reading needs no write permission, like the owning screens' own reads.
    assert.ok(Array.isArray(await w.svc.getGridValues(w.users.noPermsA1, 'OrderLine', w.records.purchaseOrder)));
  });

  test('validation per row: types and Required, with the row named', async () => {
    await expectHttpError(w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [
      { rowId: w.lines.po[0], values: [{ customFieldId: qty, value: 1 }] },
      { rowId: w.lines.po[1], values: [{ customFieldId: qty, value: 'two' }] },
    ]), 400, /Row 2: "LineQty" must be a number/);
    const req = (await w.svc.create(u(), fieldDto('OrderLine', 'UD_LineReq', 'dropdown', { required: true, options: dropdownOptions('A', 'B') }))).id;
    // Every row written must end up with the Required value.
    await expectHttpError(w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [
      { rowId: w.lines.po[0], values: [{ customFieldId: req, value: 'A' }] },
      { rowId: w.lines.po[1], values: [{ customFieldId: qty, value: 2 }] },
    ]), 400, /Row 2: "LineReq" is required/);
    assert.equal(await w.prisma.customFieldValue.count({ where: { customFieldId: req } }), 0);
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, w.lines.po.map((rowId) => ({ rowId, values: [{ customFieldId: req, value: 'B' }] })));
    // Required is now satisfied from storage: a later edit of another field alone is fine.
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [{ rowId: w.lines.po[0], values: [{ customFieldId: qty, value: 10 }] }]);
    await w.svc.update(u(), req, { required: false });
  });

  test('a deactivated grid field keeps every row\'s value and refuses writes', async () => {
    const f = (await w.svc.create(u(), fieldDto('OrderLine', 'UD_LineOld', 'textbox'))).id;
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [
      { rowId: w.lines.po[0], values: [{ customFieldId: f, value: 'a' }] }, { rowId: w.lines.po[1], values: [{ customFieldId: f, value: 'b' }] },
    ]);
    await w.svc.update(u(), f, { isActive: false });
    assert.ok(!(await w.svc.listForRuntime(u(), 'OrderLine')).some((x) => x.id === f));
    await expectHttpError(w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [{ rowId: w.lines.po[0], values: [{ customFieldId: f, value: 'z' }] }]), 400, /inactive/);
    // Saving the active fields of every row (what the grid sends) leaves the inactive values alone.
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, w.lines.po.map((rowId) => ({ rowId, values: [{ customFieldId: note, value: 'n' }] })));
    assert.deepEqual(byRow(await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder), f), { [w.lines.po[0]]: 'a', [w.lines.po[1]]: 'b' });
    // Deleting a row keeps its values in place (not shown: the row is no longer live).
    await w.prisma.$executeRawUnsafe(`UPDATE "IM_OrderReceiptItem" SET "IsDeleted" = 1 WHERE "RecId" = ${w.lines.po[1]}`);
    assert.equal(byRow(await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder), f)[w.lines.po[1]], undefined);
    assert.equal(await w.prisma.customFieldValue.count({ where: { entity: 'OrderLine', entityId: w.lines.po[1], customFieldId: f } }), 1);
    await w.prisma.$executeRawUnsafe(`UPDATE "IM_OrderReceiptItem" SET "IsDeleted" = 0 WHERE "RecId" = ${w.lines.po[1]}`);
  });

  test('company isolation: another company\'s grid fields are invisible and unwritable', async () => {
    const fB = (await w.svc.create(w.users.adminB1, fieldDto('OrderLine', 'UD_LineB', 'textbox'))).id;
    await w.svc.upsertGridValues(w.users.adminB1, 'OrderLine', w.records.purchaseOrder, [{ rowId: w.lines.po[0], values: [{ customFieldId: fB, value: 'B only' }] }]);
    const seenByA = await w.svc.getGridValues(u(), 'OrderLine', w.records.purchaseOrder);
    assert.ok(!seenByA.some((v) => v.customFieldId === fB));
    const seenByB = await w.svc.getGridValues(w.users.adminB1, 'OrderLine', w.records.purchaseOrder);
    assert.ok(!seenByB.some((v) => v.customFieldId === note));
    await expectHttpError(w.svc.upsertGridValues(w.users.adminB1, 'OrderLine', w.records.purchaseOrder, [{ rowId: w.lines.po[0], values: [{ customFieldId: note, value: 'x' }] }]), 400, /does not exist/);
  });

  test('grid value changes are audited against the row and its document; unchanged saves are not', async () => {
    const f = (await w.svc.create(u(), fieldDto('OrderLine', 'UD_LineAud', 'textbox'))).id;
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [{ rowId: w.lines.po[2], values: [{ customFieldId: f, value: 'v1' }] }]);
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, [{ rowId: w.lines.po[2], values: [{ customFieldId: f, value: 'v1' }] }]);
    const rows = await w.prisma.auditLog.findMany({ where: { entityType: 'CustomFieldValue', entityId: f } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].parentEntityType, 'OrderLine');
    assert.equal(rows[0].parentEntityId, w.lines.po[2]);
    assert.equal(rows[0].parentDocumentNo, 'PO-1');
    assert.equal(rows[0].screenKey, '/dashboard/legacy-erp/purchase-orders-list');
  });

  test('grid writes never touch the business line rows', async () => {
    const snap = async () => JSON.stringify(await w.prisma.$queryRawUnsafe(`SELECT * FROM "IM_OrderReceiptItem" ORDER BY "RecId"`), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const before = await snap();
    await w.svc.upsertGridValues(u(), 'OrderLine', w.records.purchaseOrder, w.lines.po.map((rowId, i) => ({ rowId, values: [{ customFieldId: qty, value: 100 + i }] })));
    assert.equal(await snap(), before);
  });
});

describe('batched loading — no query per row', () => {
  test('reading and writing 3 rows or 40 rows costs the same number of queries', async () => {
    const u = w.users.adminA1;
    const f = (await w.svc.create(u, fieldDto('ContractLine', 'UD_Bulk', 'number'))).id;
    const g = (await w.svc.create(u, fieldDto('ContractLine', 'UD_Bulk2', 'textbox'))).id;
    const doc = async (n: number) => {
      const id = String((await w.prisma.$queryRawUnsafe<{ id: bigint }[]>(`INSERT INTO "SM_Contract" ("ReceiptType","ReceiptNo") VALUES (1,'PC-BULK-${n}') RETURNING "RecId" AS id`))[0].id);
      const rows: string[] = [];
      for (let i = 0; i < n; i++) {
        rows.push(String((await w.prisma.$queryRawUnsafe<{ id: bigint }[]>(`INSERT INTO "SM_ContractItem" ("ReceiptId") VALUES (${id}) RETURNING "RecId" AS id`))[0].id));
      }
      return { id, rows };
    };
    const small = await doc(3);
    const large = await doc(40);
    const write = (d: { id: string; rows: string[] }, v: number) =>
      w.svc.upsertGridValues(u, 'ContractLine', d.id, d.rows.map((rowId, i) => ({ rowId, values: [{ customFieldId: f, value: v + i }, { customFieldId: g, value: `r${i}` }] })));
    // First write creates every value; the counts compare the same kind of work.
    const smallCreate = await countQueries(() => write(small, 1));
    const largeCreate = await countQueries(() => write(large, 1));
    const smallUpdate = await countQueries(() => write(small, 1000));
    const largeUpdate = await countQueries(() => write(large, 1000));
    const smallRead = await countQueries(() => w.svc.getGridValues(u, 'ContractLine', small.id));
    const largeRead = await countQueries(() => w.svc.getGridValues(u, 'ContractLine', large.id));
    assert.equal(largeRead, smallRead, `read: ${smallRead} vs ${largeRead}`);
    assert.ok(smallRead <= 4, `read uses a fixed handful of queries (${smallRead})`);
    // Writes: reads, new values, clears and the audit trail are a fixed number of statements; only
    // a CHANGED stored value costs one update of its own (inside the one transaction).
    assert.equal(largeCreate, smallCreate, `create: ${smallCreate} vs ${largeCreate}`);
    // Only the number field changed on the second write (the text values were equal): one update per extra row.
    assert.equal(largeUpdate - smallUpdate, 40 - 3, `update: ${smallUpdate} vs ${largeUpdate}`);
    // An unchanged re-save of 40 rows writes nothing: a fixed number of reads.
    const largeNoop = await countQueries(() => write(large, 1000));
    const smallNoop = await countQueries(() => write(small, 1000));
    assert.equal(largeNoop, smallNoop, `no-op: ${smallNoop} vs ${largeNoop}`);
    const values = await w.svc.getGridValues(u, 'ContractLine', large.id);
    assert.equal(values.length, 80);
  });
});

describe('other registered legacy grids resolve their own documents', () => {
  for (const [grid, entityRecord, rows] of [
    ['InventoryReceiptLine', () => w.records.purchaseReceipt, () => w.lines.irPurchase],
    ['FiReceiptLine', () => w.records.fiReceipt, () => w.lines.fi],
    ['ContractLine', () => w.records.purchaseContract, () => w.lines.contract],
  ] as [string, () => string, () => string[]][]) {
    test(`${grid}: save and reload per row`, async () => {
      const u = w.users.adminA1;
      const f = (await w.svc.create(u, fieldDto(grid, `UD_${grid}F`, 'date'))).id;
      const [a, b] = rows();
      await w.svc.upsertGridValues(u, grid, entityRecord(), [
        { rowId: a, values: [{ customFieldId: f, value: '2026-01-31' }] }, { rowId: b, values: [{ customFieldId: f, value: '2026-02-28' }] },
      ]);
      assert.deepEqual(byRow(await w.svc.getGridValues(u, grid, entityRecord()), f), { [a]: '2026-01-31', [b]: '2026-02-28' });
      await expectHttpError(w.svc.upsertGridValues(u, grid, entityRecord(), [{ rowId: a, values: [{ customFieldId: f, value: '2026-02-30' }] }]), 400, /must be a date/);
      // A row of another grid's document is not a row of this one.
      await expectHttpError(w.svc.upsertGridValues(u, grid, entityRecord(), [{ rowId: w.lines.po[0], values: [] }]), 400, /does not belong/);
    });
  }
});

describe('BomLine — Style and Sample Card BOM rows keep their identity through Save', () => {
  const line = (over: Record<string, unknown>) => ({ lineType: 'trim', fabricInventoryId: null, quantity: 1, ...over });
  let note: string;

  before(async () => {
    note = (await w.svc.create(w.users.adminA1, fieldDto('BomLine', 'UD_BomNote', 'textbox'))).id;
  });

  test('Style Card: ids survive save/reload; values survive; new rows get new ids; foreign ids are not adopted', async () => {
    const u = w.users.adminA1;
    const card = w.records.styleCardA1;
    const first = await w.styleExtras.upsertBomLines(card, [line({ explanation: 'button' }), line({ explanation: 'zip' })]);
    const [button, zip] = first.map((l) => l.id);
    await w.svc.upsertGridValues(u, 'BomLine', card, [
      { rowId: button, values: [{ customFieldId: note, value: 'button note' }] }, { rowId: zip, values: [{ customFieldId: note, value: 'zip note' }] },
    ]);
    // A row of ANOTHER card, offered as this card's row id, must not be adopted.
    const other = await w.styleExtras.upsertBomLines(w.records.styleCardA2, [line({ explanation: 'other card' })]);
    const second = await w.styleExtras.upsertBomLines(card, [
      { ...first[0], quantity: 5 }, // edited
      line({ id: 'client-temp-id', explanation: 'label' }), // new
      line({ id: other[0].id, explanation: 'spoof' }), // foreign id
      { ...first[1] },
    ]);
    assert.equal(second[0].id, button);
    assert.equal(Number(second[0].quantity), 5);
    assert.equal(second[3].id, zip);
    assert.notEqual(second[1].id, 'client-temp-id');
    assert.notEqual(second[2].id, other[0].id);
    assert.equal((await w.prisma.styleBomLine.findUniqueOrThrow({ where: { id: other[0].id } })).styleCardId, w.records.styleCardA2);
    const values = byRow(await w.svc.getGridValues(u, 'BomLine', card), note);
    assert.deepEqual(values, { [button]: 'button note', [zip]: 'zip note' });
    // Rows are this card's only: the other card's row is refused here.
    await expectHttpError(w.svc.upsertGridValues(u, 'BomLine', card, [{ rowId: other[0].id, values: [] }]), 400, /does not belong/);
  });

  test('Style Card colour expansion: only the visible row keeps its id; the colour siblings never inherit its values', async () => {
    const u = w.users.adminA1;
    const card = w.records.styleCardA1;
    const { branchId } = await w.prisma.styleCard.findUniqueOrThrow({ where: { id: card } });
    const colorA = await w.prisma.colorCard.create({ data: { code: `CA-${Date.now()}`, name: 'A', color: '#000000', branchId } });
    const colorB = await w.prisma.colorCard.create({ data: { code: `CB-${Date.now()}`, name: 'B', color: '#ffffff', branchId } });
    const current = await w.styleExtras.getBomLines(card);
    const button = current.find((l) => l.explanation === 'button')!;
    // What bom-tab.tsx's expandMultiColorRows sends: the visible row with its id, then one clone
    // per extra colour WITHOUT an id (and the server also refuses to reuse an id twice).
    const saved = await w.styleExtras.upsertBomLines(card, [
      { ...button, colorCardId: colorA.id },
      { ...button, id: undefined, colorCardId: colorB.id },
      { ...button, colorCardId: colorB.id }, // duplicate id — not reused
    ]);
    assert.equal(saved[0].id, button.id);
    assert.notEqual(saved[1].id, button.id);
    assert.notEqual(saved[2].id, button.id);
    assert.equal(new Set(saved.map((l) => l.id)).size, 3);
    const values = byRow(await w.svc.getGridValues(u, 'BomLine', card), note);
    assert.deepEqual(values, { [button.id]: 'button note' }, 'one value, on the visible row only');
    // The removed rows' values are kept (not deleted), just no longer reachable through the grid.
    assert.equal(await w.prisma.customFieldValue.count({ where: { entity: 'BomLine', customFieldId: note } }), 2);
  });

  test('Sample Card: same identity rule on its own table', async () => {
    const u = w.users.adminA1;
    const card = w.records.sampleCardA1;
    const first = await w.styleExtras.upsertSampleBomLines(card, [line({ explanation: 's1' }), line({ explanation: 's2' })]);
    await w.svc.upsertGridValues(u, 'BomLine', card, first.map((l, i) => ({ rowId: l.id, values: [{ customFieldId: note, value: `sample ${i}` }] })));
    const second = await w.styleExtras.upsertSampleBomLines(card, [first[1], first[0]]);
    assert.deepEqual(second.map((l) => l.id), [first[1].id, first[0].id]);
    assert.deepEqual(byRow(await w.svc.getGridValues(u, 'BomLine', card), note), { [first[0].id]: 'sample 0', [first[1].id]: 'sample 1' });
    // Style Card rows are not Sample Card rows.
    const styleRow = (await w.styleExtras.getBomLines(w.records.styleCardA1))[0];
    await expectHttpError(w.svc.upsertGridValues(u, 'BomLine', card, [{ rowId: styleRow.id, values: [] }]), 400, /does not belong/);
  });

  test('BOM grid values follow the PLM card\'s branch reach and the plm update permission', async () => {
    await expectHttpError(w.svc.getGridValues(w.users.adminA2, 'BomLine', w.records.styleCardA1), 404);
    await expectHttpError(w.svc.getGridValues(w.users.adminB1, 'BomLine', w.records.styleCardA1), 404);
    const row = (await w.styleExtras.getBomLines(w.records.styleCardA1))[0];
    await expectHttpError(w.svc.upsertGridValues(w.users.noPermsA1, 'BomLine', w.records.styleCardA1, [{ rowId: row.id, values: [] }]), 403);
  });

  test('a Work Order is not a BomLine parent (unsupported usage)', async () => {
    await expectHttpError(w.svc.getGridValues(w.users.adminA1, 'BomLine', w.records.workOrder), 404);
  });
});
