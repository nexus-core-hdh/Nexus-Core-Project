// Standard Docket Management reports — seeded for every company (scripts/seed-docket-standard-
// reports.ts) as ordinary, user-editable report definitions over the docket sources in
// report-sources.ts. Same conventions as standard-reports.ts; status values are the ones the
// docket module writes (dockets: incomplete / in_progress / complete / approved / locked; items:
// missing / pending / uploaded / reviewed / approved / rejected).
import type { ReportDefinitionInput, ReportFilter } from './report-builder.service';

type Def = Omit<ReportDefinitionInput, 'filters'> & { filters?: Omit<ReportFilter, 'id'>[] };

const asc = (field: string) => ({ field, direction: 'asc' as const });
const desc = (field: string) => ({ field, direction: 'desc' as const });
const cols = (...fields: (string | { field: string; label?: string; total?: boolean })[]) =>
  fields.map((f) => (typeof f === 'string' ? { field: f } : f));
const total = (field: string, label?: string) => ({ field, total: true, ...(label ? { label } : {}) });
const ask = (field: string, operator: string) => ({ field, operator, prompt: true });
const is = (field: string, operator: string, value?: string, value2?: string) => ({ field, operator, ...(value ? { value } : {}), ...(value2 ? { value2 } : {}) });

const OPEN_DOCKET = [is('status', 'notEquals', 'approved'), is('status', 'notEquals', 'locked')];
const OPEN_ITEM = [is('status', 'notEquals', 'approved')];

// ── Dockets ────────────────────────────────────────────────────────────────────
const DOCKETS: Def[] = [
  {
    name: 'Docket Register',
    description: 'Every docket with what it is for, status, completeness and item counts.',
    dataSource: 'dockets',
    columns: cols('docketNumber', 'title', 'entityType', 'template.name', 'status', 'completeness', total('totalItems'), total('approvedItems'), total('pendingItems'), total('missingItems'), 'createdAt'),
    sorting: [desc('createdAt')],
  },
  {
    name: 'Docket Completeness',
    description: 'Dockets ordered by completeness, least complete first.',
    dataSource: 'dockets',
    columns: cols('docketNumber', 'title', 'entityType', 'status', 'completeness', total('approvedItems'), total('calc.outstanding'), total('totalItems')),
    filters: OPEN_DOCKET,
    sorting: [asc('completeness')],
  },
  {
    name: 'Incomplete Dockets',
    description: 'Dockets still marked incomplete, with how many documents are missing.',
    dataSource: 'dockets',
    columns: cols('docketNumber', 'title', 'entityType', 'completeness', total('missingItems'), total('pendingItems'), 'createdAt'),
    filters: [is('status', 'equals', 'incomplete')],
    sorting: [desc('missingItems')],
  },
  {
    name: 'Dockets with Missing Documents',
    description: 'Dockets that still have at least one missing document.',
    dataSource: 'dockets',
    columns: cols('docketNumber', 'title', 'entityType', 'status', total('missingItems'), 'completeness'),
    filters: [is('missingItems', 'gt', '0')],
    sorting: [desc('missingItems')],
  },
  {
    name: 'Dockets Awaiting Approval',
    description: 'Dockets with documents uploaded but still pending review or approval.',
    dataSource: 'dockets',
    columns: cols('docketNumber', 'title', 'entityType', 'status', total('pendingItems'), 'completeness', 'updatedAt'),
    filters: [is('pendingItems', 'gt', '0'), ...OPEN_DOCKET],
    sorting: [desc('pendingItems')],
  },
  {
    name: 'Approved Dockets',
    description: 'Dockets approved, with who approved them and when.',
    dataSource: 'dockets',
    columns: cols('approvedAt', 'docketNumber', 'title', 'entityType', 'approvedBy', total('totalItems')),
    filters: [is('approvedAt', 'isNotEmpty')],
    sorting: [desc('approvedAt')],
  },
  {
    name: 'Locked Dockets',
    description: 'Dockets locked against further changes.',
    dataSource: 'dockets',
    columns: cols('lockedAt', 'docketNumber', 'title', 'entityType', 'lockedBy', 'status'),
    filters: [is('lockedAt', 'isNotEmpty')],
    sorting: [desc('lockedAt')],
  },
  {
    name: 'Dockets by Type',
    description: 'Dockets for the record type you enter: style_card, sample_card, product_card or plm_order.',
    dataSource: 'dockets',
    columns: cols('entityType', 'docketNumber', 'title', 'status', 'completeness', total('missingItems')),
    filters: [ask('entityType', 'equals')],
    sorting: [asc('entityType'), asc('docketNumber')],
  },
  {
    name: 'Dockets by Status',
    description: 'Dockets at the status you enter.',
    dataSource: 'dockets',
    columns: cols('status', 'docketNumber', 'title', 'entityType', 'completeness', 'updatedAt'),
    filters: [ask('status', 'equals')],
    sorting: [asc('status'), desc('updatedAt')],
  },
  {
    name: 'Dockets by Template',
    description: 'Dockets created from each template.',
    dataSource: 'dockets',
    columns: cols('template.name', 'docketNumber', 'title', 'status', 'completeness'),
    filters: [ask('template.name', 'contains')],
    sorting: [asc('template.name'), asc('docketNumber')],
  },
  {
    name: 'New Dockets (Date Range)',
    description: 'Dockets created between the dates you enter.',
    dataSource: 'dockets',
    columns: cols('createdAt', 'docketNumber', 'title', 'entityType', 'template.name', 'status', 'createdBy'),
    filters: [ask('createdAt', 'between')],
    sorting: [desc('createdAt')],
  },
];

// ── Documents ──────────────────────────────────────────────────────────────────
const DOCUMENTS: Def[] = [
  {
    name: 'Missing Documents',
    description: 'Required document slots with nothing uploaded yet, by due date.',
    dataSource: 'docket-items',
    columns: cols('dueDate', 'docket.docketNumber', 'docket.title', 'documentTypeCard.name', 'title', 'isRequired'),
    filters: [is('status', 'equals', 'missing')],
    sorting: [asc('dueDate')],
  },
  {
    name: 'Overdue Documents',
    description: 'Documents not yet approved and due before the date you enter (enter today for everything overdue).',
    dataSource: 'docket-items',
    columns: cols('dueDate', 'docket.docketNumber', 'documentTypeCard.name', 'title', 'status'),
    filters: [...OPEN_ITEM, ask('dueDate', 'before')],
    sorting: [asc('dueDate')],
  },
  {
    name: 'Documents Due in Period',
    description: 'Docket documents due between the dates you enter.',
    dataSource: 'docket-items',
    columns: cols('dueDate', 'docket.docketNumber', 'documentTypeCard.name', 'title', 'status'),
    filters: [ask('dueDate', 'between')],
    sorting: [asc('dueDate')],
  },
  {
    name: 'Expiring Documents',
    description: 'Documents (certificates, test reports, ...) expiring before the date you enter.',
    dataSource: 'docket-items',
    columns: cols('expiryDate', 'docket.docketNumber', 'docket.title', 'documentTypeCard.name', 'title', 'status', 'currentVersion'),
    filters: [ask('expiryDate', 'before')],
    sorting: [asc('expiryDate')],
  },
  {
    name: 'Expired Documents',
    description: 'Documents whose expiry date is before the date you enter — enter today to list everything already expired.',
    dataSource: 'docket-items',
    columns: cols('expiryDate', 'docket.docketNumber', 'documentTypeCard.name', 'title', 'approvedAt'),
    filters: [is('expiryDate', 'isNotEmpty'), ask('expiryDate', 'before')],
    sorting: [asc('expiryDate')],
  },
  {
    name: 'Documents Pending Review',
    description: 'Uploaded or reviewed documents still waiting for approval.',
    dataSource: 'docket-items',
    columns: cols('docket.docketNumber', 'documentTypeCard.name', 'title', 'status', 'currentVersion', 'dueDate', total('count.documents')),
    filters: [ask('status', 'equals')],
    sorting: [asc('dueDate')],
  },
  {
    name: 'Rejected Documents',
    description: 'Documents rejected, with who rejected them and why.',
    dataSource: 'docket-items',
    columns: cols('rejectedAt', 'docket.docketNumber', 'documentTypeCard.name', 'title', 'rejectedBy', 'rejectionReason'),
    filters: [is('status', 'equals', 'rejected')],
    sorting: [desc('rejectedAt')],
  },
  {
    name: 'Approved Documents',
    description: 'Documents approved, with approver and date.',
    dataSource: 'docket-items',
    columns: cols('approvedAt', 'docket.docketNumber', 'documentTypeCard.name', 'title', 'currentVersion', 'approvedBy'),
    filters: [is('status', 'equals', 'approved')],
    sorting: [desc('approvedAt')],
  },
  {
    name: 'Document Status by Docket',
    description: 'Every document slot of a docket and its status.',
    dataSource: 'docket-items',
    columns: cols('docket.docketNumber', 'sequence', 'documentTypeCard.name', 'title', 'isRequired', 'status', 'currentVersion', 'dueDate', 'expiryDate'),
    filters: [ask('docket.docketNumber', 'contains')],
    sorting: [asc('docket.docketNumber'), asc('sequence')],
  },
  {
    name: 'Document Status by Type',
    description: 'All docket documents of a document type and their status.',
    dataSource: 'docket-items',
    columns: cols('documentTypeCard.name', 'docket.docketNumber', 'title', 'status', 'dueDate', 'expiryDate'),
    filters: [ask('documentTypeCard.name', 'contains')],
    sorting: [asc('documentTypeCard.name'), asc('dueDate')],
  },
  {
    name: 'Most Revised Documents',
    description: 'Docket documents with the most uploaded versions.',
    dataSource: 'docket-items',
    columns: cols('docket.docketNumber', 'documentTypeCard.name', 'title', 'status', 'currentVersion', total('count.documents'), total('count.approvalHistory')),
    sorting: [desc('count.documents')],
  },
  {
    name: 'File Upload Log',
    description: 'Every uploaded file version, newest first.',
    dataSource: 'docket-documents',
    columns: cols('uploadedAt', 'docketItem.docket.docketNumber', 'docketItem.documentTypeCard.name', 'fileName', 'fileType', 'version', total('fileSizeMb'), 'uploadedBy'),
    sorting: [desc('uploadedAt')],
  },
  {
    name: 'Uploads in Period',
    description: 'Files uploaded between the dates you enter.',
    dataSource: 'docket-documents',
    columns: cols('uploadedAt', 'docketItem.docket.docketNumber', 'docketItem.title', 'fileName', 'version', total('fileSizeMb'), 'uploadedBy'),
    filters: [ask('uploadedAt', 'between')],
    sorting: [desc('uploadedAt')],
  },
  {
    name: 'Uploads by User',
    description: 'Files uploaded by the user you enter.',
    dataSource: 'docket-documents',
    columns: cols('uploadedBy', 'uploadedAt', 'docketItem.docket.docketNumber', 'fileName', 'version', total('fileSizeMb')),
    filters: [ask('uploadedBy', 'contains')],
    sorting: [asc('uploadedBy'), desc('uploadedAt')],
  },
  {
    name: 'Large Files',
    description: 'Uploaded files of at least the size (MB) you enter.',
    dataSource: 'docket-documents',
    columns: cols('fileSizeMb', 'fileName', 'fileType', 'docketItem.docket.docketNumber', 'uploadedBy', 'uploadedAt'),
    filters: [ask('fileSizeMb', 'gte')],
    sorting: [desc('fileSizeMb')],
  },
  {
    name: 'Latest Document Versions',
    description: 'Only the current (latest) version of every uploaded document.',
    dataSource: 'docket-documents',
    columns: cols('docketItem.docket.docketNumber', 'docketItem.documentTypeCard.name', 'fileName', 'version', 'isWatermarked', 'uploadedAt'),
    filters: [is('isLatest', 'isTrue')],
    sorting: [asc('docketItem.docket.docketNumber')],
  },
];

// ── Approvals, audit & sharing ─────────────────────────────────────────────────
const AUDIT: Def[] = [
  {
    name: 'Document Approval History',
    description: 'Every approve / reject / revision action on docket documents.',
    dataSource: 'docket-approvals',
    columns: cols('createdAt', 'docketItem.docket.docketNumber', 'docketItem.documentTypeCard.name', 'action', 'fromStatus', 'toStatus', 'actionBy', 'comments'),
    sorting: [desc('createdAt')],
  },
  {
    name: 'Approval Actions in Period',
    description: 'Approval actions taken between the dates you enter.',
    dataSource: 'docket-approvals',
    columns: cols('createdAt', 'action', 'actionBy', 'docketItem.docket.docketNumber', 'docketItem.title', 'toStatus'),
    filters: [ask('createdAt', 'between')],
    sorting: [desc('createdAt')],
  },
  {
    name: 'Approvals by Approver',
    description: 'Approval actions of the person you enter.',
    dataSource: 'docket-approvals',
    columns: cols('actionBy', 'createdAt', 'action', 'docketItem.docket.docketNumber', 'docketItem.title', 'comments'),
    filters: [ask('actionBy', 'contains')],
    sorting: [asc('actionBy'), desc('createdAt')],
  },
  {
    name: 'Revision Requests',
    description: 'Documents sent back for revision, with comments.',
    dataSource: 'docket-approvals',
    columns: cols('createdAt', 'docketItem.docket.docketNumber', 'docketItem.title', 'actionBy', 'comments', 'documentVersion'),
    filters: [is('action', 'contains', 'revision')],
    sorting: [desc('createdAt')],
  },
  {
    name: 'Docket Audit Trail',
    description: 'Full audit trail of a docket.',
    dataSource: 'docket-audit',
    columns: cols('createdAt', 'docket.docketNumber', 'action', 'entityRef', 'changedBy', 'ipAddress'),
    filters: [ask('docket.docketNumber', 'contains')],
    sorting: [asc('docket.docketNumber'), desc('createdAt')],
  },
  {
    name: 'Audit Activity in Period',
    description: 'All docket activity between the dates you enter.',
    dataSource: 'docket-audit',
    columns: cols('createdAt', 'action', 'changedBy', 'docket.docketNumber', 'entityRef'),
    filters: [ask('createdAt', 'between')],
    sorting: [desc('createdAt')],
  },
  {
    name: 'Activity by User',
    description: 'Docket activity of the user you enter.',
    dataSource: 'docket-audit',
    columns: cols('changedBy', 'createdAt', 'action', 'docket.docketNumber', 'ipAddress'),
    filters: [ask('changedBy', 'contains')],
    sorting: [asc('changedBy'), desc('createdAt')],
  },
  {
    name: 'Active Share Links',
    description: 'Docket share links still active, with expiry and usage.',
    dataSource: 'docket-share-links',
    columns: cols('docket.docketNumber', 'title', 'sharedWith', 'accessType', 'expiresAt', total('accessCount'), 'lastAccessedAt', 'sharedBy'),
    filters: [is('isActive', 'isTrue')],
    sorting: [asc('expiresAt')],
  },
  {
    name: 'Share Links Expiring Soon',
    description: 'Active share links expiring before the date you enter.',
    dataSource: 'docket-share-links',
    columns: cols('expiresAt', 'docket.docketNumber', 'sharedWith', 'accessType', total('accessCount')),
    filters: [is('isActive', 'isTrue'), ask('expiresAt', 'before')],
    sorting: [asc('expiresAt')],
  },
  {
    name: 'Share Link Usage',
    description: 'How often each share link has been opened.',
    dataSource: 'docket-share-links',
    columns: cols('docket.docketNumber', 'sharedWith', 'accessType', total('accessCount'), 'lastAccessedAt', 'isActive', 'createdAt'),
    sorting: [desc('accessCount')],
  },
  {
    name: 'Shared Dockets by Recipient',
    description: 'Dockets shared with the recipient you enter.',
    dataSource: 'docket-share-links',
    columns: cols('sharedWith', 'docket.docketNumber', 'docket.title', 'accessType', 'expiresAt', 'isActive'),
    filters: [ask('sharedWith', 'contains')],
    sorting: [asc('sharedWith'), desc('createdAt')],
  },
];

// ── Setup ──────────────────────────────────────────────────────────────────────
const SETUP: Def[] = [
  {
    name: 'Document Type List',
    description: 'All document types with category, approval requirement, validity and usage.',
    dataSource: 'document-types',
    columns: cols('code', 'name', 'category', 'requiresApproval', 'expiryDays', 'maxSizeMb', 'isActive', total('count.docketItems'), total('count.docketTemplateItems')),
    sorting: [asc('category'), asc('code')],
  },
  {
    name: 'Document Types Requiring Approval',
    description: 'Document types that must be approved.',
    dataSource: 'document-types',
    columns: cols('code', 'name', 'category', 'expiryDays', total('count.docketItems')),
    filters: [is('requiresApproval', 'isTrue')],
    sorting: [asc('code')],
  },
  {
    name: 'Unused Document Types',
    description: 'Active document types used in no template — candidates for clean-up or for adding to templates.',
    dataSource: 'document-types',
    columns: cols('code', 'name', 'category', 'createdAt', total('count.docketTemplateItems'), total('count.docketItems')),
    filters: [is('isActive', 'isTrue')],
    sorting: [asc('count.docketTemplateItems'), asc('code')],
  },
  {
    name: 'Docket Template List',
    description: 'All docket templates with what they are for, number of documents and dockets using them.',
    dataSource: 'docket-templates',
    columns: cols('code', 'name', 'entityType', 'isDefault', 'isActive', total('count.items'), total('count.dockets')),
    sorting: [asc('entityType'), asc('code')],
  },
];

export const STANDARD_DOCKET_REPORTS: Def[] = [...DOCKETS, ...DOCUMENTS, ...AUDIT, ...SETUP];

export function standardDocketReportInputs(): ReportDefinitionInput[] {
  return STANDARD_DOCKET_REPORTS.map((d) => ({ ...d, filters: (d.filters ?? []) as ReportFilter[] }));
}
