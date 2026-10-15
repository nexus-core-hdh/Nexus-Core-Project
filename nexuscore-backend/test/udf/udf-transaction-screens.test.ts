// User Defined Fields — screen-level runtime for the transaction screens connected in this phase:
// Work Orders, Purchase Orders, Subcontract Orders and Contracts (Purchase + Sale). Each one goes
// through the full lifecycle the screen's Customized Fields tab drives (definition -> runtime list
// -> save -> reload -> edit -> clear), plus Required, invalid values, inactive-field retention,
// permissions, company isolation, auditing and "UDF writes never touch the business tables".
// Runs against the throwaway test database (`npm run test:udf`).
import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createWorld, dropdownOptions, expectHttpError, fieldDto, resetDatabase, World } from './fixtures';

let w: World;
before(async () => { w = await createWorld(); });
after(async () => { await resetDatabase(w.prisma); await w.prisma.$disconnect(); });

const valueOf = async (entity: string, entityId: string, fieldId: string) =>
  (await w.prisma.customFieldValue.findFirst({ where: { entity, entityId, customFieldId: fieldId } }))?.value ?? null;

/** Every business row the suite's legacy documents live in — compared before/after UDF writes. */
const businessSnapshot = async () => {
  const out: Record<string, unknown> = {};
  for (const t of ['MA_WorkOrder', 'IM_OrderReceipt', 'SM_Contract', 'IM_OrderReceiptItem', 'SM_ContractItem']) {
    out[t] = await w.prisma.$queryRawUnsafe(`SELECT * FROM "${t}" ORDER BY "RecId"`);
  }
  return JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
};

const SCREENS: { entity: string; record: () => string; documentNo: string; screenKey: string }[] = [
  { entity: 'WorkOrder', record: () => w.records.workOrder, documentNo: 'WO-1', screenKey: '/legacy-erp/work-orders-list' },
  { entity: 'PurchaseOrder', record: () => w.records.purchaseOrder, documentNo: 'PO-1', screenKey: '/legacy-erp/purchase-orders-list' },
  { entity: 'SubcontractOrder', record: () => w.records.subcontractOrder, documentNo: 'SC-1', screenKey: '/legacy-erp/subcontract-orders-list' },
  { entity: 'Contract', record: () => w.records.purchaseContract, documentNo: 'PC-1', screenKey: '/legacy-erp/contracts-list?receiptType=1' },
];

for (const s of SCREENS) {
  describe(`${s.entity} Customized Fields`, () => {
    const u = () => w.users.adminA1;
    let text: string; let num: string; let dd: string; let req: string;

    before(async () => {
      text = (await w.svc.create(u(), fieldDto(s.entity, `UD_${s.entity}Text`, 'textbox', { defaultValue: 'preset' }))).id;
      num = (await w.svc.create(u(), fieldDto(s.entity, `UD_${s.entity}Num`, 'number'))).id;
      dd = (await w.svc.create(u(), fieldDto(s.entity, `UD_${s.entity}Dd`, 'dropdown', { options: dropdownOptions('Low', 'High') }))).id;
    });

    test('runtime lists the active fields in order, with the default value and dropdown labels', async () => {
      const runtime = (await w.svc.listForRuntime(u(), s.entity)).filter((f) => [text, num, dd].includes(f.id));
      assert.deepEqual(runtime.map((f) => f.id), [text, num, dd]);
      assert.equal(runtime[0].defaultValue, 'preset');
      assert.deepEqual(runtime[2].options, ['Low', 'High']);
      // A default is offered, never stored on its own.
      assert.equal(await valueOf(s.entity, s.record(), text), null);
    });

    test('save, reload, edit and clear — business rows untouched', async () => {
      const before = await businessSnapshot();
      await w.svc.upsertValues(u(), s.entity, s.record(), [
        { customFieldId: text, value: 'preset' }, { customFieldId: num, value: 12.5 }, { customFieldId: dd, value: 'High' },
      ]);
      let reloaded = await w.svc.getValues(u(), s.entity, s.record());
      const by = () => Object.fromEntries(reloaded.map((v) => [v.customFieldId, v.value]));
      assert.deepEqual([by()[text], by()[num], by()[dd]], ['preset', 12.5, 'High']);

      await w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: num, value: 7 }, { customFieldId: dd, value: '' }]);
      reloaded = await w.svc.getValues(u(), s.entity, s.record());
      assert.equal(by()[num], 7);
      assert.equal(by()[dd], undefined, 'cleared value is removed');
      assert.equal(by()[text], 'preset', 'a field not sent keeps its value');
      assert.equal(await businessSnapshot(), before);
    });

    test('values stay on their own record', async () => {
      const other = SCREENS.find((x) => x.entity !== s.entity)!;
      const values = await w.svc.getValues(u(), other.entity, other.record());
      assert.ok(!values.some((v) => [text, num, dd].includes(v.customFieldId)));
    });

    test('invalid values are refused and nothing is written', async () => {
      await expectHttpError(w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: num, value: 'abc' }]), 400, /must be a number/);
      await expectHttpError(w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: dd, value: 'Medium' }]), 400, /active options/);
      assert.equal(await valueOf(s.entity, s.record(), num), 7);
    });

    test('required is enforced server-side, sent or not', async () => {
      req = (await w.svc.create(u(), fieldDto(s.entity, `UD_${s.entity}Req`, 'textbox', { required: true }))).id;
      await expectHttpError(w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: num, value: 8 }]), 400, /is required/);
      await expectHttpError(w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: req, value: '  ' }]), 400, /is required/);
      assert.equal(await valueOf(s.entity, s.record(), num), 7, 'a refused save writes nothing');
      await w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: req, value: 'given' }, { customFieldId: num, value: 8 }]);
      assert.equal(await valueOf(s.entity, s.record(), num), 8);
    });

    test('a deactivated field keeps its value, leaves the runtime list and refuses writes', async () => {
      await w.svc.update(u(), req, { isActive: false });
      assert.ok(!(await w.svc.listForRuntime(u(), s.entity)).some((f) => f.id === req));
      assert.equal(await valueOf(s.entity, s.record(), req), 'given');
      await expectHttpError(w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: req, value: 'x' }]), 400, /inactive/);
      // Saving the other fields (what the screen sends) does not touch the inactive one.
      await w.svc.upsertValues(u(), s.entity, s.record(), [{ customFieldId: num, value: 9 }]);
      assert.equal(await valueOf(s.entity, s.record(), req), 'given');
    });

    test('changes are audited against the document', async () => {
      const rows = await w.prisma.auditLog.findMany({ where: { entityType: 'CustomFieldValue', entityId: num }, orderBy: { createdAt: 'asc' } });
      assert.ok(rows.length >= 3);
      for (const r of rows) {
        assert.equal(r.parentEntityType, s.entity);
        assert.equal(r.parentEntityId, s.record());
        assert.equal(r.parentDocumentNo, s.documentNo);
        assert.equal(r.screenKey, s.screenKey);
      }
    });

    test('another company neither sees nor writes these fields; no-permission users cannot write', async () => {
      const seenByB = await w.svc.getValues(w.users.adminB1, s.entity, s.record());
      assert.ok(!seenByB.some((v) => [text, num, dd].includes(v.customFieldId)));
      await expectHttpError(w.svc.upsertValues(w.users.adminB1, s.entity, s.record(), [{ customFieldId: num, value: 1 }]), 400, /does not exist/);
      await expectHttpError(w.svc.upsertValues(w.users.noPermsA1, s.entity, s.record(), [{ customFieldId: num, value: 1 }]), 403);
      assert.equal(await valueOf(s.entity, s.record(), num), 9);
    });
  });
}

describe('Contract covers Purchase and Sale contracts as one entity', () => {
  test('one definition, separate values per contract', async () => {
    const u = w.users.adminA1;
    const f = (await w.svc.create(u, fieldDto('Contract', 'UD_BothTypes', 'textbox'))).id;
    await w.svc.upsertValues(u, 'Contract', w.records.purchaseContract, [{ customFieldId: f, value: 'purchase' }]);
    await w.svc.upsertValues(u, 'Contract', w.records.saleContract, [{ customFieldId: f, value: 'sale' }]);
    assert.equal(await valueOf('Contract', w.records.purchaseContract, f), 'purchase');
    assert.equal(await valueOf('Contract', w.records.saleContract, f), 'sale');
    const audit = await w.prisma.auditLog.findFirstOrThrow({ where: { entityType: 'CustomFieldValue', entityId: f, parentEntityId: w.records.saleContract } });
    assert.equal(audit.screenKey, '/legacy-erp/contracts-list?receiptType=2');
  });
});
