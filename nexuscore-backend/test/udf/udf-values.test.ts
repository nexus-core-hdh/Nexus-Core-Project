// User Defined Fields — record values: validation, required/default, preservation, record
// authorization, permissions, value auditing, and the five runtime screens + BPM Request Types.
// Runs against the throwaway test database (`npm run test:udf`).
import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { createWorld, dropdownOptions, expectHttpError, fieldDto, resetDatabase, World } from './fixtures';
import { validateFieldValue } from '../../src/modules/entities/custom-fields.service';
import { EntitiesController } from '../../src/modules/entities/entities.controller';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';

let w: World;
before(async () => { w = await createWorld(); });
after(async () => { await resetDatabase(w.prisma); await w.prisma.$disconnect(); });

const stored = async (entity: string, entityId: string) =>
  Object.fromEntries((await w.prisma.customFieldValue.findMany({ where: { entity, entityId } })).map((v) => [v.customFieldId, v.value]));

describe('value validation by control type', () => {
  const def = (type: string, options: string[] | null = null) => ({ name: 'F', type, options });
  const ok = (type: string, raw: unknown, options: string[] | null = null) => {
    const r = validateFieldValue(def(type, options), raw);
    assert.ok('value' in r, `${type} should accept ${JSON.stringify(raw)}: ${'error' in r ? r.error : ''}`);
    return (r as any).value;
  };
  const bad = (type: string, raw: unknown, options: string[] | null = null) =>
    assert.ok('error' in validateFieldValue(def(type, options), raw), `${type} should refuse ${JSON.stringify(raw)}`);

  test('textbox / textarea', () => {
    assert.equal(ok('text', 'hello'), 'hello');
    assert.equal(ok('textarea', 'line1\nline2'), 'line1\nline2');
    bad('text', 12); bad('text', true); bad('text', { a: 1 }); bad('text', 'x'.repeat(2001));
    bad('textarea', ['a']); bad('textarea', 'x'.repeat(10001));
  });
  test('email', () => {
    assert.equal(ok('email', ' a@b.co '), 'a@b.co');
    bad('email', 'not-an-email'); bad('email', 'a@b'); bad('email', 5);
  });
  test('number', () => {
    assert.equal(ok('number', 12.5), 12.5);
    assert.equal(ok('number', 0), 0);
    bad('number', '12'); bad('number', Number.NaN); bad('number', Number.POSITIVE_INFINITY); bad('number', true);
  });
  test('date', () => {
    assert.equal(ok('date', '2026-02-28'), '2026-02-28');
    bad('date', '2026-02-30'); bad('date', '28/02/2026'); bad('date', '2026-2-1'); bad('date', 20260228);
  });
  test('checkbox', () => {
    assert.equal(ok('checkbox', true), true);
    assert.equal(ok('checkbox', false), false);
    bad('checkbox', 'true'); bad('checkbox', 1);
  });
  test('dropdown', () => {
    assert.equal(ok('select', 'Red', ['Red', 'Blue']), 'Red');
    bad('select', 'Green', ['Red', 'Blue']); bad('select', 1, ['Red']); bad('select', 'red', ['Red']);
  });
  test('blank clears for every type', () => {
    for (const t of ['text', 'textarea', 'email', 'number', 'date', 'checkbox', 'select']) {
      assert.equal(ok(t, null, ['A']), null);
      assert.equal(ok(t, undefined, ['A']), null);
      assert.equal(ok(t, '', ['A']), null);
    }
  });
});

describe('saving values', () => {
  let fields: Record<string, string>;
  const R = () => w.records.purchaseReceipt;

  before(async () => {
    const u = w.users.adminA1;
    const mk = async (code: string, controlType: string, extra: Record<string, unknown> = {}) =>
      (await w.svc.create(u, fieldDto('InventoryReceipt', code, controlType, extra))).id;
    fields = {
      text: await mk('UD_VText', 'textbox'),
      area: await mk('UD_VArea', 'textarea'),
      email: await mk('UD_VEmail', 'email'),
      num: await mk('UD_VNum', 'number'),
      date: await mk('UD_VDate', 'date'),
      chk: await mk('UD_VChk', 'checkbox'),
      dd: await mk('UD_VDd', 'dropdown', { options: dropdownOptions('Red', 'Blue'), defaultValue: 'Red' }),
    };
  });

  test('every control type stores and reloads its value', async () => {
    const values = [
      { customFieldId: fields.text, value: 'Hello' },
      { customFieldId: fields.area, value: 'Multi\nline' },
      { customFieldId: fields.email, value: 'ops@example.com' },
      { customFieldId: fields.num, value: 42.5 },
      { customFieldId: fields.date, value: '2026-10-06' },
      { customFieldId: fields.chk, value: true },
      { customFieldId: fields.dd, value: 'Blue' },
    ];
    const res = await w.svc.upsertValues(w.users.adminA1, 'InventoryReceipt', R(), values);
    assert.equal(res.length, 7);
    const reloaded = await w.svc.getValues(w.users.adminA1, 'InventoryReceipt', R());
    const byId = Object.fromEntries(reloaded.map((v) => [v.customFieldId, v.value]));
    for (const v of values) assert.deepEqual(byId[v.customFieldId], v.value);
  });

  test('invalid values are refused with clear messages and nothing is written', async () => {
    const before = await stored('InventoryReceipt', R());
    await expectHttpError(w.svc.upsertValues(w.users.adminA1, 'InventoryReceipt', R(), [
      { customFieldId: fields.num, value: 'forty' },
      { customFieldId: fields.email, value: 'nope' },
      { customFieldId: fields.dd, value: 'Green' },
      { customFieldId: fields.date, value: '2026-13-01' },
      { customFieldId: fields.chk, value: 'yes' },
    ]), 400, /"VNum" must be a number.*"VEmail" must be a valid email.*"VDd" must be one of its active options.*"VDate" must be a date.*"VChk" must be Yes or No/);
    assert.deepEqual(await stored('InventoryReceipt', R()), before);
  });

  test('malformed payloads are refused', async () => {
    const u = w.users.adminA1;
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), 'x'), 400, /list/);
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ value: 1 }]), 400, /customFieldId/);
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), [
      { customFieldId: fields.text, value: 'a' }, { customFieldId: fields.text, value: 'b' },
    ]), 400, /more than once/);
  });

  test('value update and value clear', async () => {
    const u = w.users.adminA1;
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.text, value: 'Changed' }]);
    assert.equal((await stored('InventoryReceipt', R()))[fields.text], 'Changed');
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.text, value: '' }]);
    assert.ok(!(fields.text in (await stored('InventoryReceipt', R()))), 'cleared value removes the row');
    assert.equal(await w.prisma.customFieldValue.count({ where: { entity: 'InventoryReceipt', entityId: R(), customFieldId: fields.num } }), 1);
  });

  test('values of fields not sent are preserved; a stored value no longer valid is accepted unchanged', async () => {
    const u = w.users.adminA1;
    // Blue is stored; deactivate the Blue option — re-saving the same value must still work.
    await w.svc.update(u, fields.dd, { options: [{ code: '01', label: 'Red', isActive: true }, { code: '02', label: 'Blue', isActive: false }] });
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.dd, value: 'Blue' }]);
    assert.equal((await stored('InventoryReceipt', R()))[fields.dd], 'Blue');
    // …but choosing it anew is refused.
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.dd, value: 'Red' }]);
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.dd, value: 'Blue' }]), 400, /active options/);
    // Sending only one field leaves the others as they were.
    const before = await stored('InventoryReceipt', R());
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.area, value: 'only this' }]);
    const after = await stored('InventoryReceipt', R());
    assert.equal(after[fields.area], 'only this');
    for (const id of [fields.email, fields.num, fields.date, fields.chk, fields.dd]) assert.deepEqual(after[id], before[id]);
  });

  test('inactive field: values kept, writes refused, hidden from runtime list', async () => {
    const u = w.users.adminA1;
    await w.svc.update(u, fields.num, { isActive: false });
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.num, value: 1 }]), 400, /inactive/);
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.text, value: 'other save' }]);
    assert.equal((await stored('InventoryReceipt', R()))[fields.num], 42.5);
    assert.ok(!(await w.svc.listForRuntime(u, 'InventoryReceipt')).some((f) => f.id === fields.num));
    await w.svc.update(u, fields.num, { isActive: true });
  });

  test('required: enforced server-side whether or not the field is sent', async () => {
    const u = w.users.adminA1;
    const req = (await w.svc.create(u, fieldDto('InventoryReceipt', 'UD_VReq', 'textbox', { required: true }))).id;
    // Not sent and nothing stored -> refused even though the payload only touches another field.
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.text, value: 'x' }]), 400, /"VReq" is required/);
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: req, value: '   ' }]), 400, /required/);
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: req, value: 'present' }]);
    // Stored now -> saves that do not send it pass; clearing it is refused.
    await w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: fields.text, value: 'y' }]);
    await expectHttpError(w.svc.upsertValues(u, 'InventoryReceipt', R(), [{ customFieldId: req, value: null }]), 400, /required/);
    // A required field that is inactive is not enforced.
    await w.svc.update(u, req, { isActive: false });
    await w.svc.upsertValues(w.users.adminA1, 'InventoryReceipt', w.records.purchaseReturn, [{ customFieldId: fields.text, value: 'z' }]);
    await w.svc.update(u, req, { isActive: true });
    await w.svc.upsertValues(u, 'InventoryReceipt', w.records.purchaseReturn, [{ customFieldId: req, value: 'filled' }]);
  });

  test('default value: offered at runtime, not stored until saved, never overrides a stored value', async () => {
    const u = w.users.adminA1;
    const rt = (await w.svc.listForRuntime(u, 'InventoryReceipt')).find((f) => f.id === fields.dd)!;
    assert.equal(rt.defaultValue, 'Red');
    const fresh = w.records.purchaseReturn;
    assert.ok(!(fields.dd in (await stored('InventoryReceipt', fresh))), 'a default is not written by itself');
    await w.svc.upsertValues(u, 'InventoryReceipt', fresh, [{ customFieldId: fields.dd, value: 'Red' }]);
    assert.equal((await stored('InventoryReceipt', fresh))[fields.dd], 'Red');
    assert.equal((await stored('InventoryReceipt', R()))[fields.dd], 'Red', 'other record keeps its own value');
  });
});

describe('security', () => {
  let fA: string; let fB: string; let fBranchA1: string;

  before(async () => {
    fA = (await w.svc.create(w.users.adminA1, fieldDto('YarnCard', 'UD_SecA', 'textbox'))).id;
    fB = (await w.svc.create(w.users.adminB1, fieldDto('YarnCard', 'UD_SecB', 'textbox'))).id;
    fBranchA1 = (await w.svc.create(w.users.adminA1, fieldDto('StyleCard', 'UD_SecBr', 'textbox', { scope: 'branch' }))).id;
    await w.svc.upsertValues(w.users.adminA1, 'YarnCard', w.records.yarnCard, [{ customFieldId: fA, value: 'secret-A' }]);
    await w.svc.upsertValues(w.users.adminB1, 'YarnCard', w.records.yarnCard, [{ customFieldId: fB, value: 'value-B' }]);
    await w.svc.upsertValues(w.users.adminA1, 'StyleCard', w.records.styleCardA1, [{ customFieldId: fBranchA1, value: 'branch-A1' }]);
  });

  test('another company cannot read this company\'s values', async () => {
    const seenByB = await w.svc.getValues(w.users.adminB1, 'YarnCard', w.records.yarnCard);
    assert.deepEqual(seenByB.map((v) => v.customFieldId), [fB]);
    const seenByA = await w.svc.getValues(w.users.adminA1, 'YarnCard', w.records.yarnCard);
    assert.deepEqual(seenByA.map((v) => v.customFieldId), [fA]);
  });

  test('another company cannot write this company\'s fields', async () => {
    await expectHttpError(w.svc.upsertValues(w.users.adminB1, 'YarnCard', w.records.yarnCard, [{ customFieldId: fA, value: 'hijack' }]), 400, /does not exist/);
    assert.equal((await stored('YarnCard', w.records.yarnCard))[fA], 'secret-A');
  });

  test('another company cannot reach a PLM card at all', async () => {
    await expectHttpError(w.svc.getValues(w.users.adminB1, 'StyleCard', w.records.styleCardA1), 404);
    await expectHttpError(w.svc.upsertValues(w.users.adminB1, 'StyleCard', w.records.styleCardA1, []), 404);
    await expectHttpError(w.svc.getValues(w.users.adminA1, 'StyleCard', w.records.styleCardB1), 404);
  });

  test('another branch cannot access a branch\'s card or its branch fields', async () => {
    await expectHttpError(w.svc.getValues(w.users.adminA2, 'StyleCard', w.records.styleCardA1), 404);
    await expectHttpError(w.svc.upsertValues(w.users.adminA2, 'StyleCard', w.records.styleCardA1, [{ customFieldId: fBranchA1, value: 'x' }]), 404);
    // A company-level user (no branch) reaches the card but not the A1 branch field.
    const seen = await w.svc.getValues(w.users.adminANoBranch, 'StyleCard', w.records.styleCardA1);
    assert.ok(!seen.some((v) => v.customFieldId === fBranchA1));
    await expectHttpError(w.svc.upsertValues(w.users.adminANoBranch, 'StyleCard', w.records.styleCardA1, [{ customFieldId: fBranchA1, value: 'x' }]), 400, /does not exist/);
  });

  test('invalid, deleted or wrong-type record ids cannot bypass authorization', async () => {
    const u = w.users.adminA1;
    for (const [entity, id] of [
      ['YarnCard', '999999999'], ['YarnCard', 'abc'], ['YarnCard', "1 OR 1=1"], ['YarnCard', w.records.nonYarnItem],
      ['InventoryReceipt', w.records.deletedReceipt], ['InventoryReceipt', w.records.unknownTypeReceipt], ['InventoryReceipt', '-1'],
      ['FiReceipt', '999999'],
      ['StyleCard', '00000000-0000-0000-0000-000000000000'], ['SampleCard', w.records.styleCardA1],
      ['WorkOrder', '1'], ['__proto__', '1'], ['constructor', '1'],
    ] as [string, string][]) {
      await expectHttpError(w.svc.getValues(u, entity, id), 404);
      await expectHttpError(w.svc.upsertValues(u, entity, id, []), 404);
    }
    await expectHttpError(w.svc.getValues(u, 'YarnCard', undefined as any), 404);
  });

  test('invalid or foreign field ids cannot bypass authorization', async () => {
    const u = w.users.adminA1;
    const otherEntity = (await w.svc.create(u, fieldDto('FiReceipt', 'UD_SecOther', 'textbox'))).id;
    await expectHttpError(w.svc.upsertValues(u, 'YarnCard', w.records.yarnCard, [{ customFieldId: 'not-a-field', value: 'x' }]), 400, /does not exist/);
    await expectHttpError(w.svc.upsertValues(u, 'YarnCard', w.records.yarnCard, [{ customFieldId: otherEntity, value: 'x' }]), 400, /does not exist/);
    assert.equal(await w.prisma.customFieldValue.count({ where: { customFieldId: otherEntity } }), 0);
  });

  test('writes need the owning screen\'s update permission — crm:update no longer suffices', async () => {
    const payload = [{ customFieldId: fA, value: 'x' }];
    await expectHttpError(w.svc.upsertValues(w.users.noPermsA1, 'YarnCard', w.records.yarnCard, payload), 403);
    await expectHttpError(w.svc.upsertValues(w.users.crmOnlyA1, 'YarnCard', w.records.yarnCard, payload), 403);
    // inventory-receipts:update covers Purchase Receipt (type 2) only; other receipt types use "receipts".
    const ir = (await w.svc.create(w.users.adminA1, fieldDto('InventoryReceipt', 'UD_SecIr', 'textbox'))).id;
    await w.svc.upsertValues(w.users.purchaseReceiptsOnlyA1, 'InventoryReceipt', w.records.purchaseReceipt, [{ customFieldId: ir, value: 'ok' }]);
    await expectHttpError(w.svc.upsertValues(w.users.purchaseReceiptsOnlyA1, 'InventoryReceipt', w.records.purchaseReturn, [{ customFieldId: ir, value: 'no' }]), 403);
    // Reading needs no write permission (the owning screens' reads need none either).
    assert.ok(Array.isArray(await w.svc.getValues(w.users.noPermsA1, 'YarnCard', w.records.yarnCard)));
  });

  test('route permissions: definitions need settings:*, value routes defer to the owning module', () => {
    const reflector = new Reflector();
    const resolve = (handler: keyof EntitiesController, method: string) => {
      const targets = [EntitiesController.prototype[handler] as any, EntitiesController];
      return resolveRequiredPermissions(((key: string) => reflector.getAllAndOverride(key, targets)) as any, method);
    };
    assert.deepEqual(resolve('createCustomField', 'POST'), { kind: 'permissions', permissions: [{ module: 'settings', action: 'create' }], source: 'explicit' });
    assert.deepEqual(resolve('updateCustomField', 'PATCH'), { kind: 'permissions', permissions: [{ module: 'settings', action: 'update' }], source: 'explicit' });
    assert.deepEqual(resolve('deleteCustomField', 'DELETE'), { kind: 'permissions', permissions: [{ module: 'settings', action: 'delete' }], source: 'explicit' });
    assert.deepEqual(resolve('reorderCustomFields', 'POST'), { kind: 'permissions', permissions: [{ module: 'settings', action: 'update' }], source: 'explicit' });
    assert.deepEqual(resolve('upsertCustomFieldValues', 'PUT'), { kind: 'authenticated' });
    assert.deepEqual(resolve('getCustomFieldValues', 'GET'), { kind: 'authenticated' });
  });
});

describe('value auditing', () => {
  let f: string;
  const rec = () => w.records.fiReceipt;
  const valueAudits = () => w.prisma.auditLog.findMany({ where: { entityType: 'CustomFieldValue', entityId: f }, orderBy: { createdAt: 'asc' } });

  before(async () => { f = (await w.svc.create(w.users.adminA1, fieldDto('FiReceipt', 'UD_AudV', 'textbox'))).id; });

  test('create, update and clear are audited with field, record and before/after', async () => {
    const u = w.users.adminA1;
    await w.svc.upsertValues(u, 'FiReceipt', rec(), [{ customFieldId: f, value: 'first' }]);
    await w.svc.upsertValues(u, 'FiReceipt', rec(), [{ customFieldId: f, value: 'second' }]);
    await w.svc.upsertValues(u, 'FiReceipt', rec(), [{ customFieldId: f, value: null }]);
    const rows = await valueAudits();
    assert.deepEqual(rows.map((r) => r.action), ['create', 'update', 'delete']);
    for (const r of rows) {
      assert.equal(r.changedBy, u.id);
      assert.equal(r.companyId, u.companyId);
      assert.equal(r.documentNo, 'UD_AudV');
      assert.equal(r.parentEntityType, 'FiReceipt');
      assert.equal(r.parentEntityId, rec());
      assert.equal(r.parentDocumentNo, 'FR-1');
      assert.equal(r.screenKey, '/dashboard/legacy-erp/financial-receipt-master-data');
      assert.ok(r.createdAt instanceof Date);
    }
    assert.equal(rows[0].oldValues, null);
    assert.deepEqual(rows[0].newValues, { field: 'UD_AudV', caption: 'AudV', value: 'first' });
    assert.deepEqual(rows[1].oldValues, { field: 'UD_AudV', caption: 'AudV', value: 'first' });
    assert.deepEqual(rows[1].newValues, { field: 'UD_AudV', caption: 'AudV', value: 'second' });
    assert.deepEqual(rows[2].oldValues, { field: 'UD_AudV', caption: 'AudV', value: 'second' });
    assert.equal(rows[2].newValues, null);
  });

  test('an unchanged save writes nothing and audits nothing', async () => {
    const u = w.users.adminA1;
    await w.svc.upsertValues(u, 'FiReceipt', rec(), [{ customFieldId: f, value: 'stable' }]);
    const auditsBefore = (await valueAudits()).length;
    const row = await w.prisma.customFieldValue.findFirstOrThrow({ where: { customFieldId: f, entityId: rec() } });
    await w.svc.upsertValues(u, 'FiReceipt', rec(), [{ customFieldId: f, value: 'stable' }]);
    await w.svc.upsertValues(u, 'FiReceipt', rec(), []);
    assert.equal((await valueAudits()).length, auditsBefore);
    const again = await w.prisma.customFieldValue.findFirstOrThrow({ where: { customFieldId: f, entityId: rec() } });
    assert.equal(again.id, row.id);
    assert.equal(again.updatedAt.getTime(), row.updatedAt.getTime());
    // Clearing a value that was never stored is not a change either.
    const g = (await w.svc.create(u, fieldDto('FiReceipt', 'UD_AudNone', 'textbox'))).id;
    await w.svc.upsertValues(u, 'FiReceipt', rec(), [{ customFieldId: g, value: '' }]);
    assert.equal(await w.prisma.auditLog.count({ where: { entityType: 'CustomFieldValue', entityId: g } }), 0);
  });
});

describe('runtime screens and BPM regression', () => {
  const screens: [string, () => string][] = [
    ['InventoryReceipt', () => w.records.purchaseReturn],
    ['FiReceipt', () => w.records.fiReceipt],
    ['YarnCard', () => w.records.yarnCard],
    ['StyleCard', () => w.records.styleCardA1],
    ['SampleCard', () => w.records.sampleCardA1],
  ];

  for (const [entity, id] of screens) {
    test(`${entity}: definition -> runtime list -> save -> reload`, async () => {
      const u = w.users.adminA1;
      const f = await w.svc.create(u, fieldDto(entity, `UD_Rt${entity}`, 'dropdown', { options: dropdownOptions('One', 'Two'), defaultValue: 'One' }));
      const runtime = await w.svc.listForRuntime(u, entity);
      const rt = runtime.find((x) => x.id === f.id)!;
      assert.deepEqual(rt.options, ['One', 'Two']);
      // The screen sends every active field it shows (fields with required values elsewhere are
      // already satisfied for these records).
      await w.svc.upsertValues(u, entity, id(), [{ customFieldId: f.id, value: 'Two' }]);
      const reloaded = await w.svc.getValues(u, entity, id());
      assert.equal(reloaded.find((v) => v.customFieldId === f.id)?.value, 'Two');
    });
  }

  test('BPM Request Types: the new add-field payload creates a real UDF the schema lists', async () => {
    const u = w.users.adminA1;
    // Exactly what bpm/request-types/page.tsx now sends.
    const created = await w.svc.create(u, {
      entity: 'StyleCard', code: 'UD_BpmColour', name: 'Bpm Colour', controlType: 'dropdown', required: false,
      options: [{ code: '01', label: 'Red', isActive: true }, { code: '02', label: 'Green', isActive: true }], scope: 'company',
    });
    const schema = await w.entities.getEntitySchema('StyleCard', u.companyId, u.branchId ?? undefined);
    const listed = schema.customFields.find((f) => f.id === created.id);
    assert.ok(listed, 'BPM Entity Fields lists the new field');
    assert.equal(listed!.code, 'UD_BpmColour');
    assert.equal(listed!.name, 'Bpm Colour');
    // Delete from BPM goes through the same protected service call.
    await w.svc.remove(u, created.id);
    assert.ok(!(await w.entities.getEntitySchema('StyleCard', u.companyId)).customFields.some((f) => f.id === created.id));
  });

  test('BPM Request Types: the old payload and unsupported entities are still refused (rules not weakened)', async () => {
    const u = w.users.adminA1;
    await expectHttpError(w.svc.create(u, { entity: 'StyleCard', name: 'old', label: 'Old', type: 'text', required: false }), 400, /Field Code/);
    await expectHttpError(w.svc.create(u, { entity: 'Lead', code: 'UD_Lead', name: 'Lead field', controlType: 'textbox' }), 400, /entities whose screens/);
  });
});
