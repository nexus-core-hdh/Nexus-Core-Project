import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { resolveUdfRecord } from './custom-field-records';

// User Defined Fields — the CustomField (definition) + CustomFieldValue (per-record value) engine
// behind Administration > User Defined Fields and every screen's "Customized Fields" tab.
//
// Runtime contract (unchanged for the five screens that render it): GET custom-fields?entity=X
// returns the caller's ACTIVE fields in sortOrder with `type` one of the runtime types
// (CONTROL_TYPES' values) and `options` a plain array of option labels; a dropdown's saved value
// is the label itself.
//
// Scope: companyId NULL + branchId NULL = global (every company), companyId only = company,
// companyId + branchId = branch. A user sees global + their company's + their branch's fields.
// Company/branch fields can only be changed from inside that company/branch, and global ones not
// at all yet (see refuseGlobal) — enforced here, server-side, not by the screen.

/** Entities whose screens render CustomField definitions today (their "Customized Fields" tab). */
export const RUNTIME_ENTITIES: Record<string, string> = {
  InventoryReceipt: 'Inventory Receipts',
  FiReceipt: 'Financial Receipts',
  YarnCard: 'Yarn Cards',
  StyleCard: 'Style Cards',
  SampleCard: 'Sample Cards',
};

/** The control types the runtime renders, mapped to the runtime `type` each one is stored as. */
const CONTROL_TYPES: Record<string, string> = {
  textbox: 'text',
  textarea: 'textarea',
  email: 'email',
  number: 'number',
  date: 'date',
  checkbox: 'checkbox',
  dropdown: 'select',
};

const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;
const SCREEN_KEY = '/dashboard/administration/user-defined-fields';

type Scope = 'global' | 'company' | 'branch';
interface ActingUser { id: string; companyId: string; branchId?: string | null }
interface OptionInput { code?: string; label?: string; isActive?: boolean }

const scopeOf = (f: { companyId: string | null; branchId: string | null }): Scope =>
  f.branchId ? 'branch' : f.companyId ? 'company' : 'global';

/** Fields visible to a user: global + their company's company-level + their own branch's. */
export function visibleScopeWhere(companyId?: string | null, branchId?: string | null): Prisma.CustomFieldWhereInput {
  const or: Prisma.CustomFieldWhereInput[] = [{ companyId: null, branchId: null }];
  if (companyId) {
    or.push({ companyId, branchId: null });
    if (branchId) or.push({ companyId, branchId });
  }
  return { OR: or };
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_LIMIT: Record<string, number> = { text: 2000, email: 320, textarea: 10000 };

/** Order-insensitive JSON equality for stored vs. sent values (both plain JSON). */
const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Long text is cut down in the audit trail (the full value stays in CustomFieldValue). */
const auditValue = (v: Prisma.JsonValue | null) => (typeof v === 'string' && v.length > 500 ? `${v.slice(0, 500)}…` : v);

const isRealDate = (s: string) => {
  if (!DATE_PATTERN.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * A value for one field, checked against its runtime type — never coerced: a value of the wrong
 * shape is refused with a message naming the field. Blank (null, undefined, '') clears the value.
 * Exported for the test suite.
 */
export function validateFieldValue(
  def: { name: string; type: string; options: Prisma.JsonValue | null },
  raw: unknown,
): { value: Prisma.JsonValue | null } | { error: string } {
  if (isBlank(raw)) return { value: null };
  const field = `"${def.name}"`;
  switch (def.type) {
    case 'text':
    case 'textarea':
    case 'email': {
      if (typeof raw !== 'string') return { error: `${field} must be text.` };
      if (raw.length > TEXT_LIMIT[def.type]) return { error: `${field} is too long (${TEXT_LIMIT[def.type]} characters max).` };
      if (def.type === 'email' && !EMAIL_PATTERN.test(raw.trim())) return { error: `${field} must be a valid email address.` };
      return { value: def.type === 'email' ? raw.trim() : raw };
    }
    case 'number':
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: `${field} must be a number.` };
      return { value: raw };
    case 'date':
      if (typeof raw !== 'string' || !isRealDate(raw)) return { error: `${field} must be a date (YYYY-MM-DD).` };
      return { value: raw };
    case 'checkbox':
      if (typeof raw !== 'boolean') return { error: `${field} must be Yes or No.` };
      return { value: raw };
    case 'select': {
      const options = Array.isArray(def.options) ? def.options.filter((o): o is string => typeof o === 'string') : [];
      if (typeof raw !== 'string' || !options.includes(raw)) return { error: `${field} must be one of its active options.` };
      return { value: raw };
    }
    default:
      return { error: `${field} has an unsupported type.` };
  }
}

@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────────────────────────

  /** Runtime: the caller's active fields for one entity, in display order (the existing contract). */
  async listForRuntime(user: ActingUser, entity?: string) {
    return this.prisma.customField.findMany({
      where: { ...visibleScopeWhere(user.companyId, user.branchId), isActive: true, ...(entity ? { entity } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Administration: every field (active or not) the caller can see, with how many values each holds. */
  async listForAdmin(user: ActingUser, entity?: string) {
    const fields = await this.prisma.customField.findMany({
      where: { ...visibleScopeWhere(user.companyId, user.branchId), ...(entity ? { entity } : {}) },
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = fields.length
      ? await this.prisma.customFieldValue.groupBy({ by: ['customFieldId'], where: { customFieldId: { in: fields.map((f) => f.id) } }, _count: { _all: true } })
      : [];
    const byId = new Map(counts.map((c) => [c.customFieldId, c._count._all]));
    return fields.map((f) => ({ ...f, scope: scopeOf(f), valueCount: byId.get(f.id) ?? 0 }));
  }

  // ── Writes ───────────────────────────────────────────────────────────────────────────────────

  async create(user: ActingUser, dto: any) {
    const entity = String(dto.entity ?? '');
    if (!RUNTIME_ENTITIES[entity]) {
      throw new BadRequestException(`Fields can only be created for entities whose screens display them (${Object.values(RUNTIME_ENTITIES).join(', ')}).`);
    }
    const code = String(dto.code ?? '').trim();
    if (!CODE_PATTERN.test(code)) {
      throw new BadRequestException('Field Code must start with a letter and use only letters, digits and underscores (2–64 characters).');
    }
    const scope = this.parseScope(dto.scope);
    const { companyId, branchId } = await this.resolveScopeForWrite(user, scope);
    await this.assertCodeFree(entity, code, companyId, branchId);

    const shape = this.buildShape(dto);
    const last = await this.prisma.customField.aggregate({ where: { entity, ...visibleScopeWhere(user.companyId, user.branchId) }, _max: { sortOrder: true } });
    const created = await this.prisma.customField.create({
      data: {
        entity, code, companyId, branchId,
        name: shape.name, description: shape.description, type: shape.type, controlType: shape.controlType,
        required: shape.required, isActive: dto.isActive === undefined ? true : !!dto.isActive,
        defaultValue: shape.defaultValue, options: shape.options, config: shape.config,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    await this.log(user, created.id, created.code, AUDIT_ACTIONS.CREATE, undefined, this.snapshot(created));
    return { ...created, scope: scopeOf(created), valueCount: 0 };
  }

  async update(user: ActingUser, id: string, dto: any) {
    const field = await this.findModifiable(user, id);
    // Field Code and entity identify the field (and its stored values) — never changed after
    // creation, so they are rejected rather than silently ignored.
    if (dto.code !== undefined && String(dto.code).trim() !== field.code) {
      throw new BadRequestException('Field Code cannot be changed after the field has been created.');
    }
    if (dto.entity !== undefined && dto.entity !== field.entity) {
      throw new BadRequestException('A field cannot be moved to another entity.');
    }
    const valueCount = await this.prisma.customFieldValue.count({ where: { customFieldId: id } });
    const merged = {
      name: dto.name ?? field.name,
      description: dto.description !== undefined ? dto.description : field.description,
      controlType: dto.controlType ?? field.controlType ?? this.controlTypeOf(field.type),
      required: dto.required !== undefined ? dto.required : field.required,
      defaultValue: dto.defaultValue !== undefined ? dto.defaultValue : field.defaultValue,
      options: dto.options !== undefined ? dto.options : (field.config as any)?.options ?? (field.options as any) ?? [],
    };
    // Checked before the rest of the shape so the reason given is the type lock, not a side effect
    // of it (e.g. the old default no longer fitting the new type).
    const nextType = CONTROL_TYPES[String(merged.controlType)];
    if (valueCount > 0 && nextType && nextType !== field.type) {
      throw new ConflictException(`This field already holds ${valueCount} saved value(s) — its data type cannot be changed.`);
    }
    const shape = this.buildShape(merged);
    let scopePatch: { companyId: string | null; branchId: string | null } = { companyId: field.companyId, branchId: field.branchId };
    if (dto.scope !== undefined && this.parseScope(dto.scope) !== scopeOf(field)) {
      if (valueCount > 0) throw new ConflictException(`This field already holds ${valueCount} saved value(s) — its scope cannot be changed.`);
      scopePatch = await this.resolveScopeForWrite(user, this.parseScope(dto.scope));
      await this.assertCodeFree(field.entity, field.code, scopePatch.companyId, scopePatch.branchId, field.id);
    }
    if (dto.isActive === true && !field.isActive && !RUNTIME_ENTITIES[field.entity]) {
      throw new BadRequestException('Fields can only be activated for entities whose screens display them.');
    }
    const updated = await this.prisma.customField.update({
      where: { id },
      data: {
        name: shape.name, description: shape.description, type: shape.type, controlType: shape.controlType,
        required: shape.required, defaultValue: shape.defaultValue, options: shape.options, config: shape.config,
        ...(dto.isActive !== undefined ? { isActive: !!dto.isActive } : {}),
        ...scopePatch,
      },
    });
    await this.log(user, id, field.code, AUDIT_ACTIONS.UPDATE, this.snapshot(field), this.snapshot(updated));
    return { ...updated, scope: scopeOf(updated), valueCount };
  }

  /** Persists a new display order for one entity's fields (ids in the desired order). */
  async reorder(user: ActingUser, entity: string, ids: string[]) {
    if (!Array.isArray(ids) || !ids.length) throw new BadRequestException('Nothing to reorder.');
    const fields = await this.prisma.customField.findMany({ where: { id: { in: ids }, entity } });
    if (fields.length !== new Set(ids).size) throw new BadRequestException('Some fields do not belong to this entity.');
    for (const f of fields) await this.assertCanModify(user, f);
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.customField.update({ where: { id }, data: { sortOrder: i } })));
    await this.log(user, entity, entity, AUDIT_ACTIONS.UPDATE, undefined, { reorderedFieldCodes: ids.map((id) => fields.find((f) => f.id === id)?.code) });
    return this.listForAdmin(user, entity);
  }

  /**
   * Hard delete only while the field has no stored values at all; otherwise it must be deactivated,
   * which keeps the definition and every value. Values are never removed by this method (the
   * table's cascade is never reached for a field that has any).
   */
  async remove(user: ActingUser, id: string) {
    const field = await this.findModifiable(user, id);
    const valueCount = await this.prisma.customFieldValue.count({ where: { customFieldId: id } });
    if (valueCount > 0) {
      throw new ConflictException(`"${field.name}" already holds ${valueCount} saved value(s) and cannot be deleted. Deactivate it instead — its values are kept.`);
    }
    await this.prisma.customField.delete({ where: { id } });
    await this.log(user, id, field.code, AUDIT_ACTIONS.DELETE, this.snapshot(field), undefined);
    return { message: 'Deleted' };
  }

  // ── Values (the runtime Customized Fields tabs) ─────────────────────────────────────────────
  //
  // Authorization is resolved here, server-side, from the record itself (custom-field-records.ts):
  // the record must exist and be within the caller's reach, a write needs the OWNING screen's
  // `<module>:update` permission, and only values of fields visible to the caller's company/branch
  // are ever read or written. Nothing about scope is taken from the request.

  /** The values of one record, limited to the fields the caller can see. */
  async getValues(user: ActingUser, entity: string, entityId: string) {
    await this.requireRecord(user, entity, entityId);
    return this.readValues(user, entity, entityId);
  }

  /**
   * Sets the values of the fields sent for one record (blank = clear). Values of fields not in the
   * payload — e.g. a deactivated field the screen no longer shows — are kept untouched. Every sent
   * value is validated against its field's control type; a value equal to the one already stored
   * is accepted as-is, so re-saving a record never fails on (or rewrites) a value that was valid
   * when it was saved (e.g. a dropdown option deactivated since). Every active, required field the
   * caller can see must end up with a value, whether it was sent or already stored. Only real
   * changes are written and audited.
   */
  async upsertValues(user: ActingUser, entity: string, entityId: string, values: unknown) {
    const record = await this.requireRecord(user, entity, entityId);
    if (!(await this.userHasPermission(user.id, record.permissionModule, 'update'))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (!Array.isArray(values)) throw new BadRequestException('values must be a list of { customFieldId, value }.');
    const sent = new Map<string, unknown>();
    for (const v of values) {
      if (!v || typeof v !== 'object' || typeof (v as any).customFieldId !== 'string' || !(v as any).customFieldId) {
        throw new BadRequestException('Every value needs a customFieldId.');
      }
      const id = (v as any).customFieldId as string;
      if (sent.has(id)) throw new BadRequestException('A field is listed more than once.');
      sent.set(id, (v as any).value);
    }

    // Every active field of this entity the caller can see (for the required check), plus any
    // sent field — unknown, other-entity or out-of-scope ids find no definition and are refused.
    const defs = await this.prisma.customField.findMany({
      where: { entity, AND: [visibleScopeWhere(user.companyId, user.branchId), { OR: [{ isActive: true }, { id: { in: [...sent.keys()] } }] }] },
    });
    const defById = new Map(defs.map((d) => [d.id, d]));
    const unknown = [...sent.keys()].filter((id) => !defById.has(id));
    if (unknown.length) throw new BadRequestException(`${unknown.length === 1 ? 'A field does' : `${unknown.length} fields do`} not exist for this record.`);
    const inactive = [...sent.keys()].map((id) => defById.get(id)!).filter((d) => !d.isActive);
    if (inactive.length) throw new BadRequestException(`${inactive.map((d) => `"${d.name}"`).join(', ')} ${inactive.length === 1 ? 'is' : 'are'} inactive and cannot be changed.`);

    const stored = await this.prisma.customFieldValue.findMany({ where: { entity, entityId, customFieldId: { in: defs.map((d) => d.id) } } });
    const storedById = new Map<string, Prisma.JsonValue>();
    for (const s of stored) if (!storedById.has(s.customFieldId)) storedById.set(s.customFieldId, s.value);

    const errors: string[] = [];
    const next = new Map<string, Prisma.JsonValue | null>(); // normalized value per sent field; null = clear
    for (const [id, raw] of sent) {
      const def = defById.get(id)!;
      const before = storedById.has(id) ? storedById.get(id)! : null;
      if (!isBlank(raw) && jsonEqual(raw, before)) { next.set(id, before); continue; }
      const checked = validateFieldValue(def, raw);
      if ('error' in checked) errors.push(checked.error);
      else next.set(id, checked.value);
    }
    for (const def of defs) {
      if (!def.isActive || !def.required || def.type === 'checkbox') continue;
      const finalValue = next.has(def.id) ? next.get(def.id) : storedById.get(def.id) ?? null;
      if (isBlank(finalValue)) errors.push(`"${def.name}" is required.`);
    }
    if (errors.length) throw new BadRequestException(errors.join(' '));

    const changes: { def: (typeof defs)[number]; before: Prisma.JsonValue | null; after: Prisma.JsonValue | null }[] = [];
    for (const [id, after] of next) {
      const before = storedById.has(id) ? storedById.get(id)! : null;
      if (!jsonEqual(before, after)) changes.push({ def: defById.get(id)!, before, after });
    }
    if (changes.length) {
      await this.prisma.$transaction(async (tx) => {
        for (const c of changes) {
          const where = { entity, entityId, customFieldId: c.def.id };
          if (c.after === null) await tx.customFieldValue.deleteMany({ where });
          else if (c.before === null) await tx.customFieldValue.create({ data: { ...where, value: c.after as Prisma.InputJsonValue } });
          else await tx.customFieldValue.updateMany({ where, data: { value: c.after as Prisma.InputJsonValue } });
        }
      });
      const correlationId = randomUUID();
      for (const c of changes) {
        const action = c.before === null ? AUDIT_ACTIONS.CREATE : c.after === null ? AUDIT_ACTIONS.DELETE : AUDIT_ACTIONS.UPDATE;
        const shape = (value: Prisma.JsonValue | null) => ({ field: c.def.code, caption: c.def.name, value: auditValue(value) });
        await this.audit.recordSafe({
          userId: user.id, companyId: user.companyId, screenKey: record.screenKey,
          entityType: 'CustomFieldValue', entityId: c.def.id, action,
          before: c.before === null ? undefined : shape(c.before),
          after: c.after === null ? undefined : shape(c.after),
          documentNo: c.def.code,
          parentEntityType: entity, parentEntityId: entityId, parentDocumentNo: record.documentNo,
          correlationId,
        });
      }
    }
    return this.readValues(user, entity, entityId);
  }

  private async readValues(user: ActingUser, entity: string, entityId: string) {
    return this.prisma.customFieldValue.findMany({
      where: { entity, entityId, customField: { entity, ...visibleScopeWhere(user.companyId, user.branchId) } },
      include: { customField: true },
    });
  }

  private async requireRecord(user: ActingUser, entity: string, entityId: string) {
    const record = await resolveUdfRecord(this.prisma, entity, entityId, user);
    if (!record) throw new NotFoundException('Record not found.');
    return record;
  }

  /** Same Role -> RolePermission -> Permission(module, action) check RolesGuard applies to a route. */
  private async userHasPermission(userId: string, module: string, action: string) {
    const count = await this.prisma.userRole.count({
      where: { userId, role: { permissions: { some: { permission: { module, action } } } } },
    });
    return count > 0;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────────────────

  private parseScope(scope: unknown): Scope {
    if (scope === undefined || scope === null || scope === '') return 'company';
    if (scope === 'global' || scope === 'company' || scope === 'branch') return scope;
    throw new BadRequestException('Scope must be Global, Company or Branch.');
  }

  private async resolveScopeForWrite(user: ActingUser, scope: Scope) {
    if (scope === 'global') this.refuseGlobal();
    if (scope === 'branch') {
      if (!user.branchId) throw new BadRequestException('You are not assigned to a branch, so a branch-level field cannot be created.');
      return { companyId: user.companyId, branchId: user.branchId };
    }
    return { companyId: user.companyId, branchId: null };
  }

  /** The caller may change a field only within their own company/branch. */
  private async assertCanModify(user: ActingUser, field: { companyId: string | null; branchId: string | null }) {
    if (!field.companyId) this.refuseGlobal();
    if (field.companyId !== user.companyId) throw new ForbiddenException('This field belongs to another company.');
    if (field.branchId && field.branchId !== user.branchId) throw new ForbiddenException('This field belongs to another branch.');
  }

  // Global fields (companyId and branchId NULL) apply to every company, so changing one must be an
  // ERP-wide administrator's decision — and this ERP's RBAC has no such permission yet (its
  // Admin-only catch-all, system:unclassified-write, is not granted to any role). Reads and the
  // uniqueness rules already handle global fields; creating/changing them waits for that permission.
  private refuseGlobal(): never {
    throw new ForbiddenException('Global fields apply to every company and need an ERP-wide administrator permission that is not configured yet. Use Company or Branch scope.');
  }

  private async findModifiable(user: ActingUser, id: string) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Field not found.');
    await this.assertCanModify(user, field);
    return field;
  }

  /** A code may not repeat for the same entity in any scope a single user could see together. */
  private async assertCodeFree(entity: string, code: string, companyId: string | null, branchId: string | null, excludeId?: string) {
    const overlapping: Prisma.CustomFieldWhereInput[] = companyId === null
      ? [{}] // a global code would show next to every company's and branch's fields
      : [
        { companyId: null, branchId: null },
        { companyId, branchId: null },
        branchId ? { companyId, branchId } : { companyId, branchId: { not: null } },
      ];
    const clash = await this.prisma.customField.findFirst({
      where: { entity, code: { equals: code, mode: 'insensitive' }, OR: overlapping, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (clash) throw new ConflictException(`Field Code "${code}" is already used for this entity (${scopeOf(clash)} field "${clash.name}").`);
  }

  private controlTypeOf(type: string) {
    return Object.keys(CONTROL_TYPES).find((k) => CONTROL_TYPES[k] === type) ?? 'textbox';
  }

  /** Validates and normalizes the editable shape into what is stored (runtime type, labels, default). */
  private buildShape(dto: any) {
    const name = String(dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Caption is required.');
    if (name.length > 120) throw new BadRequestException('Caption is too long (120 characters max).');
    const controlType = String(dto.controlType ?? '');
    const type = CONTROL_TYPES[controlType];
    if (!type) throw new BadRequestException('Unsupported control type.');
    const description = isBlank(dto.description) ? null : String(dto.description).trim().slice(0, 500);

    let options: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    let config: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    let activeLabels: string[] = [];
    if (type === 'select') {
      const list: OptionInput[] = Array.isArray(dto.options) ? dto.options : [];
      const normalized = list.map((o, i) => ({
        code: String(o?.code ?? '').trim() || String(i + 1).padStart(2, '0'),
        label: String(o?.label ?? '').trim(),
        isActive: o?.isActive === undefined ? true : !!o.isActive,
      }));
      if (!normalized.length) throw new BadRequestException('A dropdown needs at least one option.');
      if (normalized.some((o) => !o.label)) throw new BadRequestException('Every option needs a label.');
      const dupLabel = normalized.find((o, i) => normalized.findIndex((x) => x.label.toLowerCase() === o.label.toLowerCase()) !== i);
      if (dupLabel) throw new BadRequestException(`Option "${dupLabel.label}" is listed twice.`);
      const dupCode = normalized.find((o, i) => normalized.findIndex((x) => x.code.toLowerCase() === o.code.toLowerCase()) !== i);
      if (dupCode) throw new BadRequestException(`Option code "${dupCode.code}" is used twice.`);
      activeLabels = normalized.filter((o) => o.isActive).map((o) => o.label);
      if (!activeLabels.length) throw new BadRequestException('A dropdown needs at least one active option.');
      options = activeLabels; // the runtime renders these labels and stores the chosen label
      config = { options: normalized };
    }

    const defaultValue = this.normalizeDefault(type, dto.defaultValue, activeLabels);
    return {
      name, description, type, controlType, options, config, defaultValue,
      required: type === 'checkbox' ? false : !!dto.required,
    };
  }

  private normalizeDefault(type: string, raw: unknown, activeLabels: string[]): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (isBlank(raw)) return Prisma.DbNull;
    switch (type) {
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new BadRequestException('Default Value must be a number.');
        return n;
      }
      case 'checkbox':
        return raw === true || raw === 'true';
      case 'date': {
        const s = String(raw);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) throw new BadRequestException('Default Value must be a date (YYYY-MM-DD).');
        return s;
      }
      case 'email': {
        const s = String(raw).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new BadRequestException('Default Value must be an email address.');
        return s;
      }
      case 'select': {
        const s = String(raw);
        if (!activeLabels.includes(s)) throw new BadRequestException('The default option must be one of the active options.');
        return s;
      }
      default:
        return String(raw).slice(0, 2000);
    }
  }

  private snapshot(f: any) {
    return {
      code: f.code, caption: f.name, entity: RUNTIME_ENTITIES[f.entity] ?? f.entity, type: f.type, controlType: f.controlType,
      required: f.required, active: f.isActive, defaultValue: f.defaultValue, options: (f.config as any)?.options ?? f.options,
      scope: scopeOf(f), description: f.description,
    };
  }

  private async log(user: ActingUser, entityId: string, documentNo: string, action: string, before: unknown, after: unknown) {
    await this.audit.recordSafe({
      userId: user.id, companyId: user.companyId, screenKey: SCREEN_KEY,
      entityType: 'CustomField', entityId, action, before, after, documentNo,
    });
  }
}
