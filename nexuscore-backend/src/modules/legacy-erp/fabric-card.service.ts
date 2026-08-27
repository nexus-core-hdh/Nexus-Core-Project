import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { DeleteDependencyService } from './delete-dependency.service';
import { LegacyMasterLookupService } from './legacy-master-lookup.service';
import { YarnCardService } from './yarn-card.service';

// Fabric Card, like Yarn Card, is NOT a new master entity — it's the same already-migrated
// IM_Item table, scoped to rows where AccessCode = 'FABRIC'. Confirmed via pg_catalog that
// IM_Item already carries dedicated fabric columns (FabricTypeId -> MD_Fabric, UD_FabGSM,
// UD_FabDyeType, UD_FabComposition, UD_FabYarnCount/1/2/3, UD_FYarnRatio1-4, FWidth/FWeight/
// FRawWidth/FRawWeight, UD_FabDia, UD_FabGuage, UD_FinWidth, ...) — no dedicated Fabric table
// exists or is needed. Code is server-generated, same pattern/prefix-convention as
// yarn-card.service.ts's own nextInventoryCode() (same IM_Item table, same "{ACCESS_CODE}-NNNNN"
// shape) — see that file's own comment for why no shared numbering service exists to reuse
// instead. Client-sent inventoryCode is always ignored; the value assigned at create() time is
// the sole source of truth, matching Yarn Card exactly.
const TABLE = 'IM_Item';
const ACCESS_CODE = 'FABRIC';
const CODE_PREFIX = 'FABRIC';

// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source) — raw
// column names as-is, matching exactly what unified-grid.service.ts's own `SELECT *` returns.
export const HEADER_COLUMNS = [
  // Top section + General tab / General Information
  'InventoryCode', 'InventoryName', 'InUse', 'InventoryType', 'AccessCode', 'SpecialCode',
  'GroupId', 'ProcessId', 'FabricTypeId',
  'UD_FabGSM', 'UD_FabDyeType',
  // General tab — Composition / Yarn Count 1-4 (all pre-existing IM_Item columns)
  'UD_FabComposition', 'UD_FabYarnCount', 'UD_FabYarnCount1', 'UD_FabYarnCount2', 'UD_FabYarnCount3',
  // VAT Rates / Taxes
  'VatId', 'RetailVatId', 'WholeSaleVatId', 'RetailReturnVatId', 'WholeSaleReturnVatId', 'TaxId',
  // Withholding
  'WithholdingFactor', 'WithholdingDivisor', 'SWithholdingFactor', 'SWithholdingDivisor',
  // Using For
  'UseForCommon', 'UseForPurchase', 'UseForSale',
  // Follow-up Types
  'HasVariant', 'HasRowVariant', 'HasSeries', 'HasSeparableSeries',
  // Manufacturer Info
  'CurrentAccountId', 'ProducerInventoryCode',
  // Detail tab — fabric technical/dimensional fields, all pre-existing IM_Item columns
  'FWidth', 'FWeight', 'FRawWidth', 'FRawWeight', 'FPus', 'FFine',
  'WidthShrinkage', 'LengthShrinkage', 'WashCare', 'UD_FabDia', 'UD_FabGuage', 'UD_FinWidth',
  // Variant Types tab
  'Variant1TypeId', 'Variant2TypeId', 'Variant3TypeId', 'Variant4TypeId', 'Variant5TypeId',
  // Integration tab
  'IsoDocumentNo', 'WebContent', 'SeasonCode', 'GenderCode', 'CampaignGroup', 'PriceGroup', 'PlanCapacityGroup',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);
const HEADER_SELECT = Prisma.raw(['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));

// The 8 fields that together make up a Fabric Card's identity (required on every Create AND
// Save — see fabric-card requirements #1/#4). `kind: 'master'` fields resolve through the
// existing generic LegacyMasterLookupService (config already has 'fabric'/'finish-gsm'/
// 'dye-type'/'composition' entries — no new lookup logic). Yarn Count 1-4 resolve through the
// existing YarnCardService instead (see legacy-master-lookup.service.ts's own comment on why
// Yarn deliberately has no generic-lookup entry: it's a full Yarn Card record, not a flat
// master row). UD_FabGSM/UD_FabDyeType/UD_FabComposition/UD_FabYarnCount* are all pre-existing
// `character varying` columns on IM_Item (confirmed via information_schema) — they store the
// resolved master's RecId as a string (the same "id-as-string in a varchar column" convention
// this form's Yarn Count fields already used before this change), never free text.
const IDENTITY_FIELDS: { col: (typeof HEADER_COLUMNS)[number]; label: string; kind: 'master' | 'yarn'; masterKey?: string }[] = [
  { col: 'FabricTypeId', label: 'Fabric Type', kind: 'master', masterKey: 'fabric' },
  { col: 'UD_FabGSM', label: 'Finish GSM', kind: 'master', masterKey: 'finish-gsm' },
  { col: 'UD_FabDyeType', label: 'Dye Type', kind: 'master', masterKey: 'dye-type' },
  { col: 'UD_FabComposition', label: 'Composition', kind: 'master', masterKey: 'composition' },
  { col: 'UD_FabYarnCount', label: 'Yarn Count 1', kind: 'yarn' },
  { col: 'UD_FabYarnCount1', label: 'Yarn Count 2', kind: 'yarn' },
  { col: 'UD_FabYarnCount2', label: 'Yarn Count 3', kind: 'yarn' },
  { col: 'UD_FabYarnCount3', label: 'Yarn Count 4', kind: 'yarn' },
];

@Injectable()
export class FabricCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deleteGuard: DeleteDependencyService,
    private readonly masterLookup: LegacyMasterLookupService,
    private readonly yarnCardsSvc: YarnCardService,
  ) {}

  private async toDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, TABLE));
  }

  // Validates all 8 identity fields are present and reference real records — server-side
  // authority per requirement #6 (frontend validation is supplementary only). Returns both the
  // normalized numeric ids (for the duplicate check) and each field's resolved master display
  // value (for the auto-generated Name) — fetched fresh from the master tables, never trusted
  // from client input, per requirement #2's "use selected master IDs as the source of truth, do
  // not hardcode lookup names".
  //
  // `currentIds` — this same record's previously-saved identity (from update()'s own this.get(id)
  // — omitted on create(), where every field is necessarily new) — lets a field that hasn't
  // actually changed since it was saved resolve even if its master was deactivated in the
  // meantime: an existing Fabric Card must stay saveable/valid without silently dropping or
  // replacing that reference. A field whose value IS changing (including a brand-new record,
  // where every field counts as changing) must still resolve to an active master.
  private async resolveIdentity(
    dto: Record<string, any>,
    currentIds?: Record<string, number>,
  ): Promise<{ ids: Record<string, number>; names: Record<string, string> }> {
    const missing: string[] = [];
    const ids: Record<string, number> = {};
    for (const f of IDENTITY_FIELDS) {
      const raw = dto[camel(f.col)];
      const id = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
      if (!Number.isFinite(id)) missing.push(f.label);
      else ids[f.col] = id;
    }
    if (missing.length) {
      throw new BadRequestException(`Missing required field(s): ${missing.join(', ')}`);
    }

    const invalid: string[] = [];
    const names: Record<string, string> = {};
    await Promise.all(
      IDENTITY_FIELDS.map(async (f) => {
        const unchanged = currentIds !== undefined && currentIds[f.col] === ids[f.col];
        if (f.kind === 'master') {
          const rec = await this.masterLookup.getById(f.masterKey!, ids[f.col], { includeInactive: unchanged });
          if (!rec) invalid.push(f.label);
          else names[f.col] = rec.name;
        } else {
          // Yarn Count has no active/inactive concept (see legacy-master-lookup.service.ts's
          // own comment on why Yarn Card isn't in that generic table) — YarnCardService.get()
          // already only requires the Yarn Card to exist and not be deleted, unaffected by
          // `unchanged`.
          const rec = await this.yarnCardsSvc.get(ids[f.col]).catch(() => null);
          if (!rec) invalid.push(f.label);
          else names[f.col] = rec.inventoryCode;
        }
      }),
    );
    if (invalid.length) {
      throw new BadRequestException(`Invalid selection for: ${invalid.join(', ')} — record not found or inactive.`);
    }
    return { ids, names };
  }

  // Fabric Card has no pre-existing naming convention of its own to reuse (verified — Yarn/
  // Trim Card names are plain user-typed text, and nothing in this codebase already composes
  // a Fabric Card name). This is the one convention: FabType | GSM | DyeType | Composition |
  // the 4 Yarn Card codes — every segment sourced from the resolved master/Yarn Card record
  // (never client-typed text), so the Name always reflects the real current selections.
  private buildIdentityName(names: Record<string, string>): string {
    const yarns = ['UD_FabYarnCount', 'UD_FabYarnCount1', 'UD_FabYarnCount2', 'UD_FabYarnCount3']
      .map((c) => names[c])
      .join('/');
    return `${names.FabricTypeId} | ${names.UD_FabGSM} GSM | ${names.UD_FabDyeType} | ${names.UD_FabComposition} | ${yarns}`;
  }

  // Requirement #4/#5 — the complete 8-Master-ID identity combination must be unique among
  // non-deleted Fabric Cards. Compared in the exact storage shape create()/update() write:
  // FabricTypeId as the real integer FK, the other 7 as the string form stored in their
  // varchar columns. `excludeId` lets update() ignore the record being saved itself, so
  // saving a Fabric Card back with its own unchanged identity always succeeds.
  private async assertNoDuplicateIdentity(ids: Record<string, number>, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "InventoryCode" as code, "InventoryName" as name FROM "IM_Item"
      WHERE "AccessCode" = ${ACCESS_CODE} AND "IsDeleted" = 0
        AND "FabricTypeId" = ${ids.FabricTypeId}
        AND "UD_FabGSM" = ${String(ids.UD_FabGSM)}
        AND "UD_FabDyeType" = ${String(ids.UD_FabDyeType)}
        AND "UD_FabComposition" = ${String(ids.UD_FabComposition)}
        AND "UD_FabYarnCount" = ${String(ids.UD_FabYarnCount)}
        AND "UD_FabYarnCount1" = ${String(ids.UD_FabYarnCount1)}
        AND "UD_FabYarnCount2" = ${String(ids.UD_FabYarnCount2)}
        AND "UD_FabYarnCount3" = ${String(ids.UD_FabYarnCount3)}
        ${exclude}
      LIMIT 1
    `);
    if (rows.length) {
      const existing = sanitizeRawRow(rows[0]);
      throw new ConflictException(
        `A Fabric Card with the same Fabric Type, Finish GSM, Dye Type, Composition, and Yarn Counts already exists (${existing.code} - ${existing.name}).`,
      );
    }
  }

  async list(search?: string) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_Item"
          WHERE "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
            AND ("InventoryCode" ILIKE ${`%${search}%`} OR "InventoryName" ILIKE ${`%${search}%`})
          ORDER BY "InventoryCode" LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${HEADER_SELECT} FROM "IM_Item"
          WHERE "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
          ORDER BY "InventoryCode" LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Item" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
    `);
    if (!rows.length) throw new NotFoundException('Fabric card not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "IM_Item" WHERE "InventoryCode" = ${code} AND "IsDeleted" = 0 AND "AccessCode" = ${ACCESS_CODE}
    `);
    if (!rows.length) throw new NotFoundException('Fabric card not found');
    return sanitizeRawRow(rows[0]);
  }

  // Same shape/prefix convention as yarn-card.service.ts's own nextInventoryCode() — scans ALL
  // rows including soft-deleted ones so a deleted card's code is never reissued. Public so the
  // controller can expose a preview-only endpoint for the Create screen.
  async nextInventoryCode(): Promise<string> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "InventoryCode" as code FROM "IM_Item"
      WHERE "AccessCode" = ${ACCESS_CODE} AND "InventoryCode" LIKE ${CODE_PREFIX + '-%'}
      ORDER BY "InventoryCode" DESC LIMIT 1
    `);
    const lastSeq = rows.length ? parseInt(String(rows[0].code).split('-').pop() || '0', 10) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${CODE_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private static readonly MAX_CODE_RETRIES = 5;

  async create(dto: Record<string, any>, userId: number, insertedByUserId?: string) {
    // Requirement #1/#4 — validate all 8 identity fields before anything else, then block on
    // an exact existing 8-Master-ID combination before ever generating a Code.
    const { ids, names } = await this.resolveIdentity(dto);
    await this.assertNoDuplicateIdentity(ids);
    const inventoryName = this.buildIdentityName(names);

    const toDb = await this.toDb();
    // AccessCode always defaults to FABRIC for this screen — it's what scopes IM_Item rows
    // to "Fabric Card" in list()/get()/getByCode(), regardless of what the form sends.
    // InventoryCode is always server-generated — client input for it is ignored, same as
    // Yarn Card. The DB's real (CompanyId, InventoryCode) unique constraint is the actual
    // source of truth; a collision against it just regenerates the next code and retries.
    for (let attempt = 1; attempt <= FabricCardService.MAX_CODE_RETRIES; attempt++) {
      const inventoryCode = await this.nextInventoryCode();
      // Name and the 8 identity columns are always the server-resolved values, never whatever
      // the client sent for them (requirement #2/#6) — the ids are re-stringified into the
      // same varchar-column shape create()/assertNoDuplicateIdentity() both already expect.
      const effective = {
        ...dto,
        accessCode: ACCESS_CODE,
        inventoryCode,
        inventoryName,
        fabricTypeId: ids.FabricTypeId,
        uD_FabGSM: String(ids.UD_FabGSM),
        uD_FabDyeType: String(ids.UD_FabDyeType),
        uD_FabComposition: String(ids.UD_FabComposition),
        uD_FabYarnCount: String(ids.UD_FabYarnCount),
        uD_FabYarnCount1: String(ids.UD_FabYarnCount1),
        uD_FabYarnCount2: String(ids.UD_FabYarnCount2),
        uD_FabYarnCount3: String(ids.UD_FabYarnCount3),
      };
      const cols = HEADER_COLUMNS.filter((c) => toDb(c, effective[camel(c)]) !== undefined);
      // InsertedByUserId is the real NexusCore User.id (text/uuid) — separate from the legacy
      // InsertedBy integer (which Number(uuid) always collapses to a fallback value, so it can
      // never resolve to a real user). Lets the Inventory Card List join back to the real
      // Users/Auth table for a real creator name instead of a placeholder.
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"InsertedByUserId"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => toDb(c, effective[camel(c)]));
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "IM_Item" (${colList})
          VALUES (1, 1, ${Prisma.join(values)}, now(), ${userId}, ${insertedByUserId ?? null}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('InventoryCode');
        if (isCodeCollision && attempt < FabricCardService.MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Code — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    const current = await this.get(id);
    // Requirement #1/#5 — the 8 identity fields stay mandatory on every Save, not just Create
    // (the page always resubmits the full form on update, same as every other IM_Item card
    // screen). Excludes this same record from the duplicate check, so re-saving an unchanged
    // identity always succeeds; changing it to match a DIFFERENT existing Fabric Card is
    // still blocked.
    //
    // currentIds — this record's own previously-saved identity — is what lets resolveIdentity()
    // accept an unchanged field whose master has since been deactivated (see its own comment),
    // instead of a normal Save failing just because time passed.
    const currentIds: Record<string, number> = {};
    for (const f of IDENTITY_FIELDS) {
      const n = Number(current[camel(f.col)]);
      if (Number.isFinite(n)) currentIds[f.col] = n;
    }
    const { ids, names } = await this.resolveIdentity(dto, currentIds);
    await this.assertNoDuplicateIdentity(ids, id);
    const inventoryName = this.buildIdentityName(names);

    const toDb = await this.toDb();
    // InventoryCode is immutable after creation — never editable via update, regardless of
    // what the client sends. Matches yarn-card.service.ts's own update() guard. Name and the
    // 8 identity columns are always the server-resolved values, same as create() above.
    const effective = {
      ...dto,
      inventoryName,
      fabricTypeId: ids.FabricTypeId,
      uD_FabGSM: String(ids.UD_FabGSM),
      uD_FabDyeType: String(ids.UD_FabDyeType),
      uD_FabComposition: String(ids.UD_FabComposition),
      uD_FabYarnCount: String(ids.UD_FabYarnCount),
      uD_FabYarnCount1: String(ids.UD_FabYarnCount1),
      uD_FabYarnCount2: String(ids.UD_FabYarnCount2),
      uD_FabYarnCount3: String(ids.UD_FabYarnCount3),
    };
    const cols = HEADER_COLUMNS.filter((c) => c !== 'InventoryCode' && toDb(c, effective[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id);
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, effective[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_Item" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await this.deleteGuard.assertDeletable('IM_Item', id, tx);
      await tx.$executeRaw`
        UPDATE "IM_Item" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
      `;
    });
    return { message: 'Deleted' };
  }
}
