// User Defined Fields — definition rules (CustomFieldsService create/update/reorder/delete),
// against the throwaway test database. Run with `npm run test:udf`.
import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createWorld, dropdownOptions, expectHttpError, fieldDto, resetDatabase, World } from './fixtures';

let w: World;
before(async () => { w = await createWorld(); });
after(async () => { await resetDatabase(w.prisma); await w.prisma.$disconnect(); });

describe('definitions', () => {
  test('create stores the field with its runtime type, scope and next sort order', async () => {
    const { users: u, svc } = w;
    const a = await svc.create(u.adminA1, fieldDto('InventoryReceipt', 'UD_DefA', 'textbox'));
    const b = await svc.create(u.adminA1, fieldDto('InventoryReceipt', 'UD_DefB', 'dropdown', { options: dropdownOptions('Red', 'Blue'), defaultValue: 'Blue' }));
    assert.equal(a.type, 'text');
    assert.equal(a.scope, 'company');
    assert.equal(a.companyId, u.adminA1.companyId);
    assert.equal(a.branchId, null);
    assert.equal(b.type, 'select');
    assert.deepEqual(b.options, ['Red', 'Blue']);
    assert.equal(b.defaultValue, 'Blue');
    assert.equal(b.sortOrder, a.sortOrder + 1);
  });

  test('duplicate (a copy under a new code) is an independent field', async () => {
    const { users: u, svc } = w;
    const src = await svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Src', 'number', { defaultValue: 5 }));
    const copy = await svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Src_Copy', 'number', { name: 'Src (Copy)', defaultValue: 5 }));
    assert.notEqual(copy.id, src.id);
    assert.equal(copy.defaultValue, 5);
    await svc.update(u.adminA1, copy.id, { name: 'Changed' });
    const reread = await w.prisma.customField.findUniqueOrThrow({ where: { id: src.id } });
    assert.equal(reread.name, 'Src');
  });

  test('update changes caption/required/default; code and entity are immutable', async () => {
    const { users: u, svc } = w;
    const f = await svc.create(u.adminA1, fieldDto('FiReceipt', 'UD_Upd', 'textbox'));
    const upd = await svc.update(u.adminA1, f.id, { name: 'New Caption', required: true, defaultValue: 'x' });
    assert.equal(upd.name, 'New Caption');
    assert.equal(upd.required, true);
    assert.equal(upd.defaultValue, 'x');
    await expectHttpError(svc.update(u.adminA1, f.id, { code: 'UD_Other' }), 400, /cannot be changed/);
    await expectHttpError(svc.update(u.adminA1, f.id, { entity: 'YarnCard' }), 400, /another entity/);
    // Not left Required: every later FiReceipt value save in this file would (rightly) need it.
    await svc.update(u.adminA1, f.id, { required: false });
  });

  test('code uniqueness per entity and overlapping scope (case-insensitive)', async () => {
    const { users: u, svc } = w;
    await svc.create(u.adminA1, fieldDto('StyleCard', 'UD_Uniq', 'textbox'));
    await expectHttpError(svc.create(u.adminA1, fieldDto('StyleCard', 'ud_uniq', 'textbox')), 409, /already used/);
    // A branch field may not reuse a company field's code within the same company…
    await expectHttpError(svc.create(u.adminA1, fieldDto('StyleCard', 'UD_Uniq', 'textbox', { scope: 'branch' })), 409);
    // …but another entity, or another company, may.
    await svc.create(u.adminA1, fieldDto('SampleCard', 'UD_Uniq', 'textbox'));
    await svc.create(u.adminB1, fieldDto('StyleCard', 'UD_Uniq', 'textbox'));
  });

  test('invalid code, entity, control type and dropdown are refused', async () => {
    const { users: u, svc } = w;
    await expectHttpError(svc.create(u.adminA1, fieldDto('YarnCard', '1Bad', 'textbox')), 400, /Field Code/);
    await expectHttpError(svc.create(u.adminA1, fieldDto('YarnCard', 'UD Bad', 'textbox')), 400, /Field Code/);
    await expectHttpError(svc.create(u.adminA1, fieldDto('CostingSheet', 'UD_Cs', 'textbox')), 400, /entities whose screens/);
    await expectHttpError(svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Phone', 'phone')), 400, /Unsupported control type/);
    await expectHttpError(svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Dd', 'dropdown', { options: [] })), 400, /at least one option/);
    await expectHttpError(svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Dd', 'dropdown', { options: dropdownOptions('A', 'a') })), 400, /listed twice/);
    await expectHttpError(svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Num', 'number', { defaultValue: 'abc' })), 400, /must be a number/);
    await expectHttpError(svc.create(u.adminA1, fieldDto('YarnCard', 'UD_G', 'textbox', { scope: 'global' })), 403, /Global/);
  });

  test('type and scope lock once the field holds values', async () => {
    const { users: u, svc, records } = w;
    const f = await svc.create(u.adminA1, fieldDto('InventoryReceipt', 'UD_Lock', 'textbox'));
    await svc.update(u.adminA1, f.id, { controlType: 'textarea' }); // no values yet — allowed
    await svc.upsertValues(u.adminA1, 'InventoryReceipt', records.purchaseReceipt, [{ customFieldId: f.id, value: 'kept' }]);
    await expectHttpError(svc.update(u.adminA1, f.id, { controlType: 'number' }), 409, /data type cannot be changed/);
    await expectHttpError(svc.update(u.adminA1, f.id, { scope: 'branch' }), 409, /scope cannot be changed/);
    // Same-type control change (Long Text -> Text Box is a different runtime type) stays locked too.
    await expectHttpError(svc.update(u.adminA1, f.id, { controlType: 'textbox' }), 409);
  });

  test('activate / deactivate keeps values; runtime list shows active fields only', async () => {
    const { users: u, svc, records } = w;
    const f = await svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Act', 'textbox'));
    await svc.upsertValues(u.adminA1, 'YarnCard', records.yarnCard, [{ customFieldId: f.id, value: 'v1' }]);
    await svc.update(u.adminA1, f.id, { isActive: false });
    const runtime = await svc.listForRuntime(u.adminA1, 'YarnCard');
    assert.ok(!runtime.some((x) => x.id === f.id));
    const admin = await svc.listForAdmin(u.adminA1, 'YarnCard');
    assert.equal(admin.find((x) => x.id === f.id)?.valueCount, 1);
    await svc.update(u.adminA1, f.id, { isActive: true });
    assert.ok((await svc.listForRuntime(u.adminA1, 'YarnCard')).some((x) => x.id === f.id));
  });

  test('reorder persists the given order', async () => {
    const { users: u, svc } = w;
    const ids: string[] = [];
    for (const c of ['UD_R1', 'UD_R2', 'UD_R3']) ids.push((await svc.create(u.adminA1, fieldDto('SampleCard', c, 'textbox'))).id);
    const sampleIds = (await svc.listForAdmin(u.adminA1, 'SampleCard')).map((f) => f.id);
    const desired = [...sampleIds].reverse();
    await svc.reorder(u.adminA1, 'SampleCard', desired);
    const after = (await svc.listForRuntime(u.adminA1, 'SampleCard')).map((f) => f.id);
    assert.deepEqual(after, desired);
    await expectHttpError(svc.reorder(u.adminA1, 'YarnCard', [ids[0]]), 400, /do not belong/);
  });

  test('delete: allowed without values, refused with values', async () => {
    const { users: u, svc, records } = w;
    const empty = await svc.create(u.adminA1, fieldDto('FiReceipt', 'UD_Del0', 'textbox'));
    await svc.remove(u.adminA1, empty.id);
    assert.equal(await w.prisma.customField.count({ where: { id: empty.id } }), 0);

    const used = await svc.create(u.adminA1, fieldDto('FiReceipt', 'UD_Del1', 'textbox'));
    await svc.upsertValues(u.adminA1, 'FiReceipt', records.fiReceipt, [{ customFieldId: used.id, value: 'v' }]);
    await expectHttpError(svc.remove(u.adminA1, used.id), 409, /Deactivate it instead/);
    assert.equal(await w.prisma.customFieldValue.count({ where: { customFieldId: used.id } }), 1);
  });

  test('company / branch isolation of definitions', async () => {
    const { users: u, svc } = w;
    const companyField = await svc.create(u.adminA1, fieldDto('StyleCard', 'UD_IsoC', 'textbox'));
    const branchField = await svc.create(u.adminA1, fieldDto('StyleCard', 'UD_IsoB', 'textbox', { scope: 'branch' }));
    const seenByB = (await svc.listForAdmin(u.adminB1, 'StyleCard')).map((f) => f.id);
    assert.ok(!seenByB.includes(companyField.id) && !seenByB.includes(branchField.id));
    const seenByA2 = (await svc.listForAdmin(u.adminA2, 'StyleCard')).map((f) => f.id);
    assert.ok(seenByA2.includes(companyField.id), 'company field visible to every branch of the company');
    assert.ok(!seenByA2.includes(branchField.id), 'branch field hidden from other branches');
    await expectHttpError(svc.update(u.adminB1, companyField.id, { name: 'x' }), 403, /another company/);
    await expectHttpError(svc.remove(u.adminB1, companyField.id), 403);
    await expectHttpError(svc.update(u.adminA2, branchField.id, { name: 'x' }), 403, /another branch/);
    await expectHttpError(svc.reorder(u.adminB1, 'StyleCard', [companyField.id]), 403);
  });

  test('definition changes are audited (create, update, delete)', async () => {
    const { users: u, svc } = w;
    const f = await svc.create(u.adminA1, fieldDto('YarnCard', 'UD_Aud', 'textbox'));
    await svc.update(u.adminA1, f.id, { name: 'Audited' });
    await svc.remove(u.adminA1, f.id);
    const rows = await w.prisma.auditLog.findMany({ where: { entityType: 'CustomField', entityId: f.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(rows.map((r) => r.action), ['create', 'update', 'delete']);
    assert.ok(rows.every((r) => r.changedBy === u.adminA1.id && r.companyId === u.adminA1.companyId && r.documentNo === 'UD_Aud'));
    assert.equal((rows[1].newValues as any).caption, 'Audited');
  });
});
