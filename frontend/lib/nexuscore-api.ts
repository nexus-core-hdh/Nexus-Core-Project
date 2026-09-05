const BASE = process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1';

async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    // Every response from this API is dynamic, per-user data with no Cache-Control header of its
    // own (confirmed live — Express's default `etag` middleware adds an ETag but nothing tells
    // the browser the response is non-cacheable). Without this, the browser's default fetch
    // caching can serve a stale GET response — e.g. re-fetching a record's BOM right after
    // saving a new line and getting back the pre-save body — exactly the "save works, DB is
    // correct, but reopening shows stale data" class of bug. GETs must always hit the network.
    cache: 'no-store',
    ...init,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Request failed' }));
    const error = new Error(err.message || 'Request failed');
    (error as any).status = res.status;
    throw error;
  }

  const json = await res.json();
  // Unwrap NexusCore's global response envelope { success, data, message }
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T = any>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T = any>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Auth helpers for the login page
export const nexuscoreAuth = {
  login: (credentials: { email: string; password: string; [key: string]: any }) =>
    api.post<{
      user: { id: string; email: string; companyId: string; mustChangePassword?: boolean; [key: string]: any };
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', credentials),

  changePassword: (payload: { newPassword: string }) =>
    api.post('/auth/change-password', payload),
};

// Custom Entity Pages (backed by NexusCore /api/v1/entities/pages)
export const customEntityPageApi = {
  getCustomEntityPages: (companyId?: string | number, branchId?: string | number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', String(companyId));
    if (branchId) params.append('branchId', String(branchId));
    const qs = params.toString();
    return api.get(`/entities/pages${qs ? `?${qs}` : ''}`);
  },

  getCustomEntityPageBySlug: (slug: string) => api.get(`/entities/pages/slug/${slug}`),

  createCustomEntityPage: (dto: any) => api.post('/entities/pages', dto),
  updateCustomEntityPage: (id: string, dto: any) => api.patch(`/entities/pages/${id}`, dto),
  deleteCustomEntityPage: (id: string) => api.delete(`/entities/pages/${id}`),
};

// Entities helpers (custom fields engine, /api/v1/entities)
const entities = (path: string, q?: Record<string, string>) => {
  const qs = q ? '?' + new URLSearchParams(q).toString() : '';
  return `/entities${path}${qs}`;
};

export const entitiesApi = {
  getCustomFields: (entity: string) => api.get(entities('/custom-fields', { entity })),
  getCustomFieldValues: (entity: string, entityId: string) => api.get(entities('/custom-field-values', { entity, entityId })),
  upsertCustomFieldValues: (entity: string, entityId: string, values: any[]) =>
    api.put(entities('/custom-field-values'), { entity, entityId, values }),
};

// PLM helpers
const plm = (path: string, q?: Record<string, string>) => {
  const qs = q ? '?' + new URLSearchParams(q).toString() : '';
  return `/plm${path}${qs}`;
};

export const plmApi = {
  // Definitions
  sampleTypes: { list: () => api.get(plm('/style-sample-types')), create: (d: any) => api.post(plm('/style-sample-types'), d), update: (id: string, d: any) => api.put(plm(`/style-sample-types/${id}`), d), delete: (id: string) => api.delete(plm(`/style-sample-types/${id}`)) },
  designDetailTypes: { list: () => api.get(plm('/design-detail-types')), create: (d: any) => api.post(plm('/design-detail-types'), d), update: (id: string, d: any) => api.put(plm(`/design-detail-types/${id}`), d), delete: (id: string) => api.delete(plm(`/design-detail-types/${id}`)) },
  measurementDefs: { list: () => api.get(plm('/measurement-definitions')), create: (d: any) => api.post(plm('/measurement-definitions'), d), update: (id: string, d: any) => api.put(plm(`/measurement-definitions/${id}`), d), delete: (id: string) => api.delete(plm(`/measurement-definitions/${id}`)) },
  departments: { list: (q?: any) => api.get(plm('/department-cards', q)), create: (d: any) => api.post(plm('/department-cards'), d), get: (id: string) => api.get(plm(`/department-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/department-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/department-cards/${id}`)), employees: (id: string) => api.get(plm(`/department-cards/${id}/employees`)) },
  processCards: { list: (q?: any) => api.get(plm('/process-cards', q)), create: (d: any) => api.post(plm('/process-cards'), d), get: (id: string) => api.get(plm(`/process-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/process-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/process-cards/${id}`)) },
  employees: { list: (q?: any) => api.get(plm('/employee-cards', q)), create: (d: any) => api.post(plm('/employee-cards'), d), get: (id: string) => api.get(plm(`/employee-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/employee-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/employee-cards/${id}`)) },
  resources: { list: (q?: any) => api.get(plm('/resource-cards', q)), create: (d: any) => api.post(plm('/resource-cards'), d), get: (id: string) => api.get(plm(`/resource-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/resource-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/resource-cards/${id}`)) },
  activityTypes: { list: (q?: any) => api.get(plm('/activity-type-cards', q)), create: (d: any) => api.post(plm('/activity-type-cards'), d), get: (id: string) => api.get(plm(`/activity-type-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/activity-type-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/activity-type-cards/${id}`)) },
  colors: { list: (q?: any) => api.get(plm('/color-cards', q)), create: (d: any) => api.post(plm('/color-cards'), d), get: (id: string) => api.get(plm(`/color-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/color-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/color-cards/${id}`)) },
  brands: { list: (q?: any) => api.get(plm('/brand-cards', q)), create: (d: any) => api.post(plm('/brand-cards'), d), get: (id: string) => api.get(plm(`/brand-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/brand-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/brand-cards/${id}`)) },
  seasons: { list: (q?: any) => api.get(plm('/season-cards', q)), create: (d: any) => api.post(plm('/season-cards'), d), get: (id: string) => api.get(plm(`/season-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/season-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/season-cards/${id}`)) },
  genders: { list: (q?: any) => api.get(plm('/gender-cards', q)), create: (d: any) => api.post(plm('/gender-cards'), d), get: (id: string) => api.get(plm(`/gender-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/gender-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/gender-cards/${id}`)) },
  sizes: { list: (q?: any) => api.get(plm('/size-cards', q)), create: (d: any) => api.post(plm('/size-cards'), d), get: (id: string) => api.get(plm(`/size-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/size-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/size-cards/${id}`)) },
  companyCards: { list: () => api.get(plm('/company-cards')), create: (d: any) => api.post(plm('/company-cards'), d), get: (id: string) => api.get(plm(`/company-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/company-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/company-cards/${id}`)) },
  sampleTaskTypes: { list: (q?: any) => api.get(plm('/sample-task-types', q)), create: (d: any) => api.post(plm('/sample-task-types'), d), get: (id: string) => api.get(plm(`/sample-task-types/${id}`)), update: (id: string, d: any) => api.put(plm(`/sample-task-types/${id}`), d), delete: (id: string) => api.delete(plm(`/sample-task-types/${id}`)) },
  routeCards: {
    list: (q?: any) => api.get(plm('/route-cards', q)), create: (d: any) => api.post(plm('/route-cards'), d), get: (id: string) => api.get(plm(`/route-cards/${id}`)), update: (id: string, d: any) => api.put(plm(`/route-cards/${id}`), d), delete: (id: string) => api.delete(plm(`/route-cards/${id}`)),
    addLine: (id: string, d: any) => api.post(plm(`/route-cards/${id}/lines`), d), updateLine: (id: string, lineId: string, d: any) => api.put(plm(`/route-cards/${id}/lines/${lineId}`), d), deleteLine: (id: string, lineId: string) => api.delete(plm(`/route-cards/${id}/lines/${lineId}`)),
  },
  studyTemplates: { list: (q?: any) => api.get(plm('/study-templates', q)), create: (d: any) => api.post(plm('/study-templates'), d), get: (id: string) => api.get(plm(`/study-templates/${id}`)), update: (id: string, d: any) => api.put(plm(`/study-templates/${id}`), d), delete: (id: string) => api.delete(plm(`/study-templates/${id}`)), upsertLines: (id: string, lines: any[]) => api.put(plm(`/study-templates/${id}/lines`), lines), deleteLine: (id: string, lineId: string) => api.delete(plm(`/study-templates/${id}/lines/${lineId}`)) },
  templates: { list: (q?: any) => api.get(plm('/templates', q)), create: (d: any) => api.post(plm('/templates'), d), get: (id: string) => api.get(plm(`/templates/${id}`)), update: (id: string, d: any) => api.put(plm(`/templates/${id}`), d), delete: (id: string) => api.delete(plm(`/templates/${id}`)), duplicate: (id: string) => api.post(plm(`/templates/${id}/duplicate`)) },
  costingSheets: {
    list: (q?: any) => api.get(plm('/costing-sheets', q)),
    create: (d: any) => api.post(plm('/costing-sheets'), d),
    get: (id: string) => api.get(plm(`/costing-sheets/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/costing-sheets/${id}`), d),
    delete: (id: string) => api.delete(plm(`/costing-sheets/${id}`)),
    upsertRawMaterialLines: (id: string, lines: any[]) => api.put(plm(`/costing-sheets/${id}/raw-material-lines`), lines),
    upsertLaborLines: (id: string, lines: any[]) => api.put(plm(`/costing-sheets/${id}/labor-lines`), lines),
    upsertOtherLines: (id: string, lines: any[]) => api.put(plm(`/costing-sheets/${id}/other-lines`), lines),
    getProfitBreakdown: (id: string) => api.get(plm(`/costing-sheets/${id}/profit-breakdown`)),
  },
  // Cards
  moodBoards: { list: (q?: any) => api.get(plm('/mood-boards', q)), create: (d: any) => api.post(plm('/mood-boards'), d), get: (id: string) => api.get(plm(`/mood-boards/${id}`)), update: (id: string, d: any) => api.put(plm(`/mood-boards/${id}`), d), delete: (id: string) => api.delete(plm(`/mood-boards/${id}`)), addImages: (id: string, images: string[]) => api.post(plm(`/mood-boards/${id}/images`), { images }) },
  styleCards: {
    // Sample Card Master screen — Code preview, same convention as legacyErpApi.yarnCards'
    // previewNextCode().
    previewNextCode: () => api.get(plm('/style-cards/next-code')),
    list: (q?: any) => api.get(plm('/style-cards', q)),
    create: (d: any) => api.post(plm('/style-cards'), d),
    get: (id: string) => api.get(plm(`/style-cards/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/style-cards/${id}`), d),
    delete: (id: string) => api.delete(plm(`/style-cards/${id}`)),
    changeStatus: (id: string, d: any) => api.patch(plm(`/style-cards/${id}/status`), d),
    updateStatus: (id: string, status: string) => api.patch(plm(`/style-cards/${id}/status`), { status }),
    addDetail: (id: string, d: any) => api.post(plm(`/style-cards/${id}/details`), d),
    getDetails: (id: string) => api.get(plm(`/style-cards/${id}/details`)),
    upsertDetails: (id: string, details: any[]) => api.put(plm(`/style-cards/${id}/details`), details),
    getSamples: (id: string) => api.get(plm(`/style-cards/${id}/samples`)),
    getProducts: (id: string) => api.get(plm(`/style-cards/${id}/products`)),
    getOrders: (id: string) => api.get(plm(`/style-cards/${id}/orders`)),
    getCostingSheets: (id: string) => api.get(plm(`/style-cards/${id}/costing-sheets`)),
    issueCostingSheet: (id: string, d?: any) => api.post(plm(`/style-cards/${id}/issue-costing-sheet`), d || {}),
    duplicate: (id: string) => api.post(plm(`/style-cards/${id}/duplicate`)),
  },
  styleBom: {
    get: (styleCardId: string) => api.get(plm(`/style-cards/${styleCardId}/bom-lines`)),
    upsertLines: (styleCardId: string, lines: any[]) => api.put(plm(`/style-cards/${styleCardId}/bom-lines`), lines),
  },
  styleWashCare: {
    get: (styleCardId: string) => api.get(plm(`/style-cards/${styleCardId}/wash-care`)),
    upsert: (styleCardId: string, data: any) => api.put(plm(`/style-cards/${styleCardId}/wash-care`), data),
  },
  styleExpenses: {
    get: (styleCardId: string) => api.get(plm(`/style-cards/${styleCardId}/expense-lines`)),
    upsertLines: (styleCardId: string, lines: any[]) => api.put(plm(`/style-cards/${styleCardId}/expense-lines`), lines),
  },
  // Sample Card's own independent BOM/Wash & Care — exact mirror of styleBom/styleWashCare
  // above, own SampleBomLine/SampleWashCare tables, never linked to any Style Card.
  sampleBom: {
    get: (sampleCardId: string) => api.get(plm(`/sample-cards/${sampleCardId}/bom-lines`)),
    upsertLines: (sampleCardId: string, lines: any[]) => api.put(plm(`/sample-cards/${sampleCardId}/bom-lines`), lines),
  },
  sampleWashCare: {
    get: (sampleCardId: string) => api.get(plm(`/sample-cards/${sampleCardId}/wash-care`)),
    upsert: (sampleCardId: string, data: any) => api.put(plm(`/sample-cards/${sampleCardId}/wash-care`), data),
  },
  sampleCards: {
    list: (q?: any) => api.get(plm('/sample-cards', q)),
    create: (d: any) => api.post(plm('/sample-cards'), d),
    get: (id: string) => api.get(plm(`/sample-cards/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/sample-cards/${id}`), d),
    delete: (id: string) => api.delete(plm(`/sample-cards/${id}`)),
    changeStatus: (id: string, d: any) => api.patch(plm(`/sample-cards/${id}/status`), d),
    updateStatus: (id: string, status: string, notes?: string) => api.patch(plm(`/sample-cards/${id}/status`), { status, notes }),
    getHistory: (id: string) => api.get(plm(`/sample-cards/${id}/history`)),
    duplicate: (id: string) => api.post(plm(`/sample-cards/${id}/duplicate`)),
    // Creates a NEW, independent StyleCard from this Sample Card (own id/code, own copied child
    // rows) — never links back to or modifies this Sample Card. See plm-cards.service.ts's
    // createStyleCardFromSample() for the exact field mapping.
    createStyleCard: (id: string) => api.post(plm(`/sample-cards/${id}/create-style-card`)),
    getDetails: (id: string) => api.get(plm(`/sample-cards/${id}/details`)),
    upsertDetails: (id: string, details: any[]) => api.put(plm(`/sample-cards/${id}/details`), details),
    getOrders: (id: string) => api.get(plm(`/sample-cards/${id}/orders`)),
    getCostingSheets: (id: string) => api.get(plm(`/sample-cards/${id}/costing-sheets`)),
    issueCostingSheet: (id: string, d?: any) => api.post(plm(`/sample-cards/${id}/issue-costing-sheet`), d || {}),
  },
  swatchCards: {
    list: (q?: any) => api.get(plm('/swatch-cards', q)),
    create: (d: any) => api.post(plm('/swatch-cards'), d),
    get: (id: string) => api.get(plm(`/swatch-cards/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/swatch-cards/${id}`), d),
    delete: (id: string) => api.delete(plm(`/swatch-cards/${id}`)),
    linkProduct: (id: string, productCardId: string, isPrimary?: boolean) => api.post(plm(`/swatch-cards/${id}/link-product`), { productCardId, isPrimary }),
  },
  productCards: {
    list: (q?: any) => api.get(plm('/product-cards', q)),
    create: (d: any) => api.post(plm('/product-cards'), d),
    get: (id: string) => api.get(plm(`/product-cards/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/product-cards/${id}`), d),
    delete: (id: string) => api.delete(plm(`/product-cards/${id}`)),
    changeStatus: (id: string, d: any) => api.patch(plm(`/product-cards/${id}/status`), d),
    updateStatus: (id: string, status: string) => api.patch(plm(`/product-cards/${id}/status`), { status }),
    getMeasurements: (id: string) => api.get(plm(`/product-cards/${id}/measurements`)),
    addMeasurement: (id: string, d: any) => api.post(plm(`/product-cards/${id}/measurements`), d),
    upsertMeasurements: (id: string, data: any[]) => api.put(plm(`/product-cards/${id}/measurements`), data),
    getSwatches: (id: string) => api.get(plm(`/product-cards/${id}/swatches`)),
    addSwatch: (id: string, d: any) => api.post(plm(`/product-cards/${id}/swatches`), d),
    removeSwatch: (id: string, swatchId: string) => api.delete(plm(`/product-cards/${id}/swatches/${swatchId}`)),
    getSamples: (id: string) => api.get(plm(`/product-cards/${id}/samples`)),
    duplicate: (id: string, createdBy?: string) => api.post(plm(`/product-cards/${id}/duplicate`), { createdBy }),
  },
  // Operations
  orders: {
    list: (q?: any) => api.get(plm('/orders', q)),
    create: (d: any) => api.post(plm('/orders'), d),
    get: (id: string) => api.get(plm(`/orders/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/orders/${id}`), d),
    delete: (id: string) => api.delete(plm(`/orders/${id}`)),
    changeStatus: (id: string, d: any) => api.patch(plm(`/orders/${id}/status`), d),
    updateStatus: (id: string, status: string, notes?: string) => api.patch(plm(`/orders/${id}/status`), { status, notes }),
    getTasks: (id: string) => api.get(plm(`/orders/${id}/tasks`)),
    createTask: (id: string, d: any) => api.post(plm(`/orders/${id}/tasks`), d),
  },
  tasks: {
    list: (q?: any) => api.get(plm('/tasks', q)),
    create: (d: any) => api.post(plm('/tasks'), d),
    myTasks: (userId?: string) => api.get(plm('/tasks/my-tasks', userId ? { userId } : undefined)),
    overdue: () => api.get(plm('/tasks/overdue')),
    get: (id: string) => api.get(plm(`/tasks/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/tasks/${id}`), d),
    delete: (id: string) => api.delete(plm(`/tasks/${id}`)),
    changeStatus: (id: string, d: any) => api.patch(plm(`/tasks/${id}/status`), d),
    updateStatus: (id: string, status: string, actualHrs?: number, notes?: string) => api.patch(plm(`/tasks/${id}/status`), { status, actualHrs, notes }),
  },
  criticalPath: {
    list: (q?: any) => api.get(plm('/critical-path', q)),
    create: (d: any) => api.post(plm('/critical-path'), d),
    get: (id: string) => api.get(plm(`/critical-path/${id}`)),
    gantt: (cpId: string) => api.get(plm(`/critical-path/${cpId}/gantt`)),
    getGantt: (cpId: string) => api.get(plm(`/critical-path/${cpId}/gantt`)),
    addTask: (cpId: string, d: any) => api.post(plm(`/critical-path/${cpId}/tasks`), d),
    updateTask: (cpId: string, taskId: string, d: any) => api.put(plm(`/critical-path/${cpId}/tasks/${taskId}`), d),
    updateTaskStatus: (cpId: string, taskId: string, status: string) => api.patch(plm(`/critical-path/${cpId}/tasks/${taskId}/status`), { status }),
    deleteTask: (cpId: string, taskId: string) => api.delete(plm(`/critical-path/${cpId}/tasks/${taskId}`)),
  },
  documents: {
    list: (q?: any) => api.get(plm('/documents', q)),
    create: (d: any) => api.post(plm('/documents'), d),
    upload: (d: any) => api.post(plm('/documents'), d),
    get: (id: string) => api.get(plm(`/documents/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/documents/${id}`), d),
    delete: (id: string) => api.delete(plm(`/documents/${id}`)),
    newVersion: (id: string, d: any) => api.post(plm(`/documents/${id}/new-version`), d),
    versions: (id: string) => api.get(plm(`/documents/${id}/versions`)),
  },
  measurementCharts: {
    list: (q?: any) => api.get(plm('/measurement-charts', q)),
    create: (d: any) => api.post(plm('/measurement-charts'), d),
    get: (id: string) => api.get(plm(`/measurement-charts/${id}`)),
    update: (id: string, d: any) => api.put(plm(`/measurement-charts/${id}`), d),
    delete: (id: string) => api.delete(plm(`/measurement-charts/${id}`)),
    addLine: (id: string, d: any) => api.post(plm(`/measurement-charts/${id}/lines`), d),
    upsertLines: (id: string, lines: any[]) => api.put(plm(`/measurement-charts/${id}/lines`), lines),
    deleteLine: (id: string, lineId: string) => api.delete(plm(`/measurement-charts/${id}/lines/${lineId}`)),
  },
  // Reports
  reports: {
    delayedTasks: (q?: any) => api.get(plm('/reports/delayed-tasks', q)),
    dailyTasks: (q?: any) => api.get(plm('/reports/daily-tasks', q)),
    cancelledTasks: (q?: any) => api.get(plm('/reports/cancelled-tasks', q)),
    sampleCost: (q?: any) => api.get(plm('/reports/sample-cost', q)),
    sampleHistory: (q?: any) => api.get(plm('/reports/sample-history', q)),
    analyseCubes: (q?: any) => api.get(plm('/reports/analyse-cubes', q)),
  },
};

// Cutting Orders (nexuscore-backend/src/modules/cutting) — production floor cutting
// jobs/batches, the only real "shop-floor process" tracking module in the schema today.
export const cuttingApi = {
  list: (q?: { branchId?: string; status?: string; page?: number; limit?: number }) => {
    const params: Record<string, string> = {};
    if (q?.branchId) params.branchId = q.branchId;
    if (q?.status) params.status = q.status;
    if (q?.page != null) params.page = String(q.page);
    if (q?.limit != null) params.limit = String(q.limit);
    const qs = Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : "";
    return api.get(`/cutting-orders${qs}`);
  },
  get: (id: string) => api.get(`/cutting-orders/${id}`),
};

// Finance / Sales Orders (nexuscore-backend/src/modules/finance, model `Order`) — the
// real Sales Order entity (OrderStatus/OrderType enums), company+branch scoped
// server-side via CurrentUser. Note: frontend/lib/api.ts's `orderApi.getOrders()` calls
// `/orders`, which does not exist (the controller is mounted at `/finance`, so the real
// route is `/finance/orders`) — a pre-existing bug in that client, silently masked
// everywhere it's used by a blanket `.catch(() => [])`. Rather than touch that shared
// file (used elsewhere, out of scope here), this is a correctly-pathed client added
// alongside the other real-data clients (cuttingApi, plmApi) already in this file.
export const financeApi = {
  orders: {
    list: (q?: { status?: string; type?: string }) => {
      const params: Record<string, string> = {};
      if (q?.status) params.status = q.status;
      if (q?.type) params.type = q.type;
      const qs = Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : "";
      return api.get(`/finance/orders${qs}`);
    }
  }
};

// Item Statement / Stock Control Ledger filters — mirrors item-statement.service.ts's own
// ItemStatementFilters exactly (kept as a plain interface here, not a shared package, since
// frontend/backend don't share a types package in this repo).
export interface ItemStatementFilters {
  dateFrom?: string;
  dateTo?: string;
  receiptType?: number;
  documentOrReceiptNo?: string;
  colorCardId?: string;
  lotBatch?: string;
  warehouseId?: number;
  currentAccountId?: number;
  itemCode?: string;
  itemName?: string;
}

function buildItemStatementQuery(filters?: ItemStatementFilters): string {
  const qs = new URLSearchParams();
  if (filters?.dateFrom) qs.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) qs.set("dateTo", filters.dateTo);
  if (filters?.receiptType != null) qs.set("receiptType", String(filters.receiptType));
  if (filters?.documentOrReceiptNo) qs.set("documentOrReceiptNo", filters.documentOrReceiptNo);
  if (filters?.colorCardId) qs.set("colorCardId", filters.colorCardId);
  if (filters?.lotBatch) qs.set("lotBatch", filters.lotBatch);
  if (filters?.warehouseId != null) qs.set("warehouseId", String(filters.warehouseId));
  if (filters?.currentAccountId != null) qs.set("currentAccountId", String(filters.currentAccountId));
  if (filters?.itemCode) qs.set("itemCode", filters.itemCode);
  if (filters?.itemName) qs.set("itemName", filters.itemName);
  return qs.toString();
}

// Legacy ERP (migrated SQL Server schema, raw-SQL backed)
export const legacyErpApi = {
  warehouses: {
    list: (search?: string) => api.get(`/legacy-erp/warehouses${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/warehouses/${id}`),
    // Preview only — the authoritative code is always (re)generated server-side at create()
    // time; this is just what the Create form shows before Save. See warehouse.service.ts.
    previewNextCode: () => api.get(`/legacy-erp/warehouses/next-code`),
    create: (d: any) => api.post('/legacy-erp/warehouses', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/warehouses/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/warehouses/${id}`),
  },
  // Module ('FABRIC'|'YARN'|'TRIM') + Warehouse scoped config — see warehouse-parameter.service.ts.
  warehouseParameters: {
    get: (module: string, warehouseId: number) => api.get(`/legacy-erp/warehouse-parameters?module=${encodeURIComponent(module)}&warehouseId=${warehouseId}`),
    save: (d: any) => api.put('/legacy-erp/warehouse-parameters', d),
  },
  accounts: {
    list: (search?: string) => api.get(`/legacy-erp/accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/accounts/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/accounts/by-code/${encodeURIComponent(code)}`),
    // Preview only — the authoritative code is always (re)generated server-side at create()
    // time; this is just what the Create form shows before Save. See account.service.ts.
    nextCode: (type: string | number) => api.get(`/legacy-erp/accounts/next-code?type=${encodeURIComponent(String(type))}`),
    create: (d: any) => api.post('/legacy-erp/accounts', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/accounts/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/accounts/${id}`),
    listTab: (id: number, tab: string) => api.get(`/legacy-erp/accounts/${id}/${tab}`),
    createTabRow: (id: number, tab: string, d: any) => api.post(`/legacy-erp/accounts/${id}/${tab}`, d),
    removeTabRow: (id: number, tab: string, lineId: number) => api.delete(`/legacy-erp/accounts/${id}/${tab}/${lineId}`),
    totals: (id: number) => api.get(`/legacy-erp/accounts/${id}/totals/all`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/accounts/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/accounts/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/accounts/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/accounts/${id}/attachments/${attId}/content`,
    getAttachmentViewToken: (id: number, attId: number) => api.get(`/legacy-erp/accounts/${id}/attachments/${attId}/view-token`),
  },
  trimCards: {
    list: (search?: string) => api.get(`/legacy-erp/trim-cards${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/trim-cards/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/trim-cards/by-code/${encodeURIComponent(code)}`),
    previewNextCode: () => api.get(`/legacy-erp/trim-cards/next-code`),
    create: (d: any) => api.post('/legacy-erp/trim-cards', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/trim-cards/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/trim-cards/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/trim-cards/${id}/items`),
    createItem: (id: number, d: any) => api.post(`/legacy-erp/trim-cards/${id}/items`, d),
    updateItem: (id: number, itemId: number, d: any) => api.put(`/legacy-erp/trim-cards/${id}/items/${itemId}`, d),
    removeItem: (id: number, itemId: number) => api.delete(`/legacy-erp/trim-cards/${id}/items/${itemId}`),
  },
  unitSets: {
    list: (search?: string) => api.get(`/legacy-erp/unit-sets${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/unit-sets/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/unit-sets/by-code/${encodeURIComponent(code)}`),
    previewNextCode: () => api.get(`/legacy-erp/unit-sets/next-code`),
    create: (d: any) => api.post('/legacy-erp/unit-sets', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/unit-sets/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/unit-sets/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/unit-sets/${id}/items`),
    createItem: (id: number, d: any) => api.post(`/legacy-erp/unit-sets/${id}/items`, d),
    updateItem: (id: number, itemId: number, d: any) => api.put(`/legacy-erp/unit-sets/${id}/items/${itemId}`, d),
    removeItem: (id: number, itemId: number) => api.delete(`/legacy-erp/unit-sets/${id}/items/${itemId}`),
  },
  // MA_SizeSet/MA_SizeSetItem — same shape as unitSets above (see size-set.service.ts).
  sizeSets: {
    list: (search?: string) => api.get(`/legacy-erp/size-sets${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/size-sets/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/size-sets/by-code/${encodeURIComponent(code)}`),
    previewNextCode: () => api.get(`/legacy-erp/size-sets/next-code`),
    create: (d: any) => api.post('/legacy-erp/size-sets', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/size-sets/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/size-sets/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/size-sets/${id}/items`),
    createItem: (id: number, d: any) => api.post(`/legacy-erp/size-sets/${id}/items`, d),
    updateItem: (id: number, itemId: number, d: any) => api.put(`/legacy-erp/size-sets/${id}/items/${itemId}`, d),
    removeItem: (id: number, itemId: number) => api.delete(`/legacy-erp/size-sets/${id}/items/${itemId}`),
  },
  yarnCards: {
    list: (search?: string) => api.get(`/legacy-erp/yarn-cards${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/yarn-cards/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/yarn-cards/by-code/${encodeURIComponent(code)}`),
    previewNextCode: () => api.get(`/legacy-erp/yarn-cards/next-code`),
    create: (d: any) => api.post('/legacy-erp/yarn-cards', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/yarn-cards/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/yarn-cards/${id}`),
    listTab: (id: number, tab: string) => api.get(`/legacy-erp/yarn-cards/${id}/${tab}`),
    createTabRow: (id: number, tab: string, d: any) => api.post(`/legacy-erp/yarn-cards/${id}/${tab}`, d),
    updateTabRow: (id: number, tab: string, lineId: number, d: any) => api.put(`/legacy-erp/yarn-cards/${id}/${tab}/${lineId}`, d),
    removeTabRow: (id: number, tab: string, lineId: number) => api.delete(`/legacy-erp/yarn-cards/${id}/${tab}/${lineId}`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/yarn-cards/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/yarn-cards/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/yarn-cards/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/yarn-cards/${id}/attachments/${attId}/content`,
  },
  workOrders: {
    list: (search?: string) => api.get(`/legacy-erp/work-orders${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/work-orders/${id}`),
    previewNextCode: () => api.get(`/legacy-erp/work-orders/next-code`),
    create: (d: any) => api.post('/legacy-erp/work-orders', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/work-orders/${id}`, d),
    remove: (id: number) => api.delete(`/legacy-erp/work-orders/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/work-orders/${id}/items`),
    upsertItems: (id: number, lines: any[]) => api.put(`/legacy-erp/work-orders/${id}/items`, lines),
    listItemVariants: (itemId: number) => api.get(`/legacy-erp/work-orders/items/${itemId}/variants`),
    upsertItemVariants: (itemId: number, lines: any[]) => api.put(`/legacy-erp/work-orders/items/${itemId}/variants`, lines),
    listTab: (id: number, tab: string) => api.get(`/legacy-erp/work-orders/${id}/${tab}`),
    createTabRow: (id: number, tab: string, d: any) => api.post(`/legacy-erp/work-orders/${id}/${tab}`, d),
    updateTabRow: (id: number, tab: string, lineId: number, d: any) => api.put(`/legacy-erp/work-orders/${id}/${tab}/${lineId}`, d),
    removeTabRow: (id: number, tab: string, lineId: number) => api.delete(`/legacy-erp/work-orders/${id}/${tab}/${lineId}`),
    listBom: (id: number, lineType: "fabric" | "trim" | "ornament" | "process") => api.get(`/legacy-erp/work-orders/${id}/bom/${lineType}`),
    upsertBom: (id: number, lineType: "fabric" | "trim" | "ornament" | "process", lines: any[]) => api.put(`/legacy-erp/work-orders/${id}/bom/${lineType}`, lines),
    transferBomFromStyleCard: (id: number, styleCardId: string) => api.post(`/legacy-erp/work-orders/${id}/bom/transfer-from-style-card`, { styleCardId }),
  },
  fabricCards: {
    list: (search?: string) => api.get(`/legacy-erp/fabric-cards${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/fabric-cards/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/fabric-cards/by-code/${encodeURIComponent(code)}`),
    previewNextCode: () => api.get(`/legacy-erp/fabric-cards/next-code`),
    create: (d: any) => api.post('/legacy-erp/fabric-cards', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/fabric-cards/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/fabric-cards/${id}`),
    listTab: (id: number, tab: string) => api.get(`/legacy-erp/fabric-cards/${id}/${tab}`),
    createTabRow: (id: number, tab: string, d: any) => api.post(`/legacy-erp/fabric-cards/${id}/${tab}`, d),
    updateTabRow: (id: number, tab: string, lineId: number, d: any) => api.put(`/legacy-erp/fabric-cards/${id}/${tab}/${lineId}`, d),
    removeTabRow: (id: number, tab: string, lineId: number) => api.delete(`/legacy-erp/fabric-cards/${id}/${tab}/${lineId}`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/fabric-cards/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/fabric-cards/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/fabric-cards/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/fabric-cards/${id}/attachments/${attId}/content`,
    getYarnRecipe: (id: number) => api.get(`/legacy-erp/fabric-cards/${id}/yarn-recipe`),
    upsertYarnRecipe: (id: number, lines: any[]) => api.put(`/legacy-erp/fabric-cards/${id}/yarn-recipe`, lines),
  },
  purchaseOrders: {
    list: (search?: string, approvalStatus?: "all" | "approved" | "unapproved" | "rejected") => {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (approvalStatus) qs.set("approvalStatus", approvalStatus);
      const query = qs.toString();
      return api.get(`/legacy-erp/purchase-orders${query ? `?${query}` : ''}`);
    },
    get: (id: number) => api.get(`/legacy-erp/purchase-orders/${id}`),
    getByReceiptNo: (receiptNo: string) => api.get(`/legacy-erp/purchase-orders/by-receipt-no/${encodeURIComponent(receiptNo)}`),
    previewNextReceiptNo: () => api.get(`/legacy-erp/purchase-orders/next-receipt-no`),
    create: (d: any) => api.post('/legacy-erp/purchase-orders', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/purchase-orders/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/purchase-orders/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/purchase-orders/${id}/items`),
    createItem: (id: number, d: any) => api.post(`/legacy-erp/purchase-orders/${id}/items`, d),
    updateItem: (id: number, itemId: number, d: any) => api.put(`/legacy-erp/purchase-orders/${id}/items/${itemId}`, d),
    removeItem: (id: number, itemId: number) => api.delete(`/legacy-erp/purchase-orders/${id}/items/${itemId}`),
    // Variant breakdown (Variant2 column) — the composite Variant1+Variant2 combinations
    // available for a given inventory item (item-master-driven, not order-specific), plus
    // CRUD for the per-line variant quantity rows.
    itemVariantOptions: (inventoryId: number) => api.get(`/legacy-erp/purchase-orders/item-variant-options/${inventoryId}`),
    // Purchase Receipt -> Current Account -> right-click -> Pending Orders — POs for this
    // account with real outstanding quantity, grouped with their pending lines. See
    // purchase-order.service.ts's listPending() for how PendingQty is computed.
    listPending: (currentAccountId: number) => api.get(`/legacy-erp/purchase-orders/pending?currentAccountId=${currentAccountId}`),
    // Universal Action Menu -> Return/Purchase Receipt submenu — Purchase Receipt (type 2),
    // Received Connection Receipt (type 11), and Purchase Return (type 122) rows tracing back
    // to this PO. See purchase-order.service.ts's listRelatedReceipts().
    getRelatedReceipts: (id: number) => api.get(`/legacy-erp/purchase-orders/${id}/related-receipts`),
    listItemVariants: (id: number, itemId: number) => api.get(`/legacy-erp/purchase-orders/${id}/items/${itemId}/variants`),
    createItemVariant: (id: number, itemId: number, d: any) => api.post(`/legacy-erp/purchase-orders/${id}/items/${itemId}/variants`, d),
    updateItemVariant: (id: number, itemId: number, variantLineId: number, d: any) => api.put(`/legacy-erp/purchase-orders/${id}/items/${itemId}/variants/${variantLineId}`, d),
    removeItemVariant: (id: number, itemId: number, variantLineId: number) => api.delete(`/legacy-erp/purchase-orders/${id}/items/${itemId}/variants/${variantLineId}`),
    listExplanations: (id: number) => api.get(`/legacy-erp/purchase-orders/${id}/explanations`),
    createExplanation: (id: number, d: { explanationText: string; explanationDate?: string }) => api.post(`/legacy-erp/purchase-orders/${id}/explanations`, d),
    removeExplanation: (id: number, explanationId: number) => api.delete(`/legacy-erp/purchase-orders/${id}/explanations/${explanationId}`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/purchase-orders/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/purchase-orders/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/purchase-orders/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/purchase-orders/${id}/attachments/${attId}/content`,
    // General Settings -> Approval Configuration — no-op (existing workflow unchanged) whenever
    // approval isn't configured/required for this screen. Same shape as inventoryReceipts' own.
    getApprovalStatus: (id: number) => api.get(`/legacy-erp/purchase-orders/${id}/approval-status`),
    submitForApproval: (id: number) => api.post(`/legacy-erp/purchase-orders/${id}/submit-for-approval`, {}),
    approve: (id: number, remarks?: string) => api.post(`/legacy-erp/purchase-orders/${id}/approve`, { remarks }),
    reject: (id: number, remarks: string) => api.post(`/legacy-erp/purchase-orders/${id}/reject`, { remarks }),
  },
  // Order Screen Replication — same shape as `purchaseOrders` above (drop-in for
  // PurchaseOrderLineGrid's `api` prop), hitting order-type.controller.ts's generic
  // `/legacy-erp/orders/:receiptType/...` route instead. Purchase Order (type 1) stays on
  // `purchaseOrders` above — this is for Subcontract Order (type 3) and any future order type.
  orders: (receiptType: number) => {
    const base = `/legacy-erp/orders/${receiptType}`;
    return {
      list: (search?: string, approvalStatus?: "all" | "approved" | "unapproved" | "rejected") => {
        const qs = new URLSearchParams();
        if (search) qs.set("search", search);
        if (approvalStatus) qs.set("approvalStatus", approvalStatus);
        const query = qs.toString();
        return api.get(`${base}${query ? `?${query}` : ''}`);
      },
      get: (id: number) => api.get(`${base}/${id}`),
      getByReceiptNo: (receiptNo: string) => api.get(`${base}/by-receipt-no/${encodeURIComponent(receiptNo)}`),
      previewNextReceiptNo: () => api.get(`${base}/next-receipt-no`),
      create: (d: any) => api.post(base, d),
      update: (id: number, d: any) => api.put(`${base}/${id}`, d),
      delete: (id: number) => api.delete(`${base}/${id}`),
      listItems: (id: number) => api.get(`${base}/${id}/items`),
      createItem: (id: number, d: any) => api.post(`${base}/${id}/items`, d),
      updateItem: (id: number, itemId: number, d: any) => api.put(`${base}/${id}/items/${itemId}`, d),
      removeItem: (id: number, itemId: number) => api.delete(`${base}/${id}/items/${itemId}`),
      itemVariantOptions: (inventoryId: number) => api.get(`${base}/item-variant-options/${inventoryId}`),
      // Receiving screen -> Current Account -> Pending Orders — this order type's own outstanding
      // lines for the account, grouped with their pending quantities. `receivingReceiptType` is
      // required so the backend's approval gate checks the right receiving screen's screenKey
      // (e.g. Outside Process Receive Receipt=11 for Subcontract Order) — see
      // purchase-order.service.ts's listPending().
      listPending: (currentAccountId: number, receivingReceiptType: number) =>
        api.get(`${base}/pending?currentAccountId=${currentAccountId}&receivingReceiptType=${receivingReceiptType}`),
      getRelatedReceipts: (id: number) => api.get(`${base}/${id}/related-receipts`),
      listItemVariants: (id: number, itemId: number) => api.get(`${base}/${id}/items/${itemId}/variants`),
      createItemVariant: (id: number, itemId: number, d: any) => api.post(`${base}/${id}/items/${itemId}/variants`, d),
      updateItemVariant: (id: number, itemId: number, variantLineId: number, d: any) => api.put(`${base}/${id}/items/${itemId}/variants/${variantLineId}`, d),
      removeItemVariant: (id: number, itemId: number, variantLineId: number) => api.delete(`${base}/${id}/items/${itemId}/variants/${variantLineId}`),
      listExplanations: (id: number) => api.get(`${base}/${id}/explanations`),
      createExplanation: (id: number, d: { explanationText: string; explanationDate?: string }) => api.post(`${base}/${id}/explanations`, d),
      removeExplanation: (id: number, explanationId: number) => api.delete(`${base}/${id}/explanations/${explanationId}`),
      listAttachments: (id: number, kind: "document" | "picture") => api.get(`${base}/${id}/attachments?kind=${kind}`),
      uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`${base}/${id}/attachments`, d),
      removeAttachment: (id: number, attId: number) => api.delete(`${base}/${id}/attachments/${attId}`),
      attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}${base}/${id}/attachments/${attId}/content`,
      getApprovalStatus: (id: number) => api.get(`${base}/${id}/approval-status`),
      submitForApproval: (id: number) => api.post(`${base}/${id}/submit-for-approval`, {}),
      approve: (id: number, remarks?: string) => api.post(`${base}/${id}/approve`, { remarks }),
      reject: (id: number, remarks: string) => api.post(`${base}/${id}/reject`, { remarks }),
    };
  },
  // IM_Receipt/IM_ReceiptItem — a separate "physical goods receipt" spine from Purchase Order's
  // IM_OrderReceipt (see inventory-receipt.service.ts's own comment). Same shape as
  // purchaseOrders above minus the variant/explanation endpoints (not part of this screen).
  inventoryReceipts: {
    list: (search?: string) => api.get(`/legacy-erp/inventory-receipts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/inventory-receipts/${id}`),
    getByReceiptNo: (receiptNo: string) => api.get(`/legacy-erp/inventory-receipts/by-receipt-no/${encodeURIComponent(receiptNo)}`),
    previewNextReceiptNo: () => api.get(`/legacy-erp/inventory-receipts/next-receipt-no`),
    create: (d: any) => api.post('/legacy-erp/inventory-receipts', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/inventory-receipts/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/inventory-receipts/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/inventory-receipts/${id}/items`),
    createItem: (id: number, d: any) => api.post(`/legacy-erp/inventory-receipts/${id}/items`, d),
    updateItem: (id: number, itemId: number, d: any) => api.put(`/legacy-erp/inventory-receipts/${id}/items/${itemId}`, d),
    removeItem: (id: number, itemId: number) => api.delete(`/legacy-erp/inventory-receipts/${id}/items/${itemId}`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/inventory-receipts/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/inventory-receipts/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/inventory-receipts/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/inventory-receipts/${id}/attachments/${attId}/content`,
    // General Settings -> Approval Configuration — no-op (existing workflow unchanged) whenever
    // approval isn't configured/required for this screen. See inventory-receipt.service.ts.
    getApprovalStatus: (id: number) => api.get(`/legacy-erp/inventory-receipts/${id}/approval-status`),
    submitForApproval: (id: number) => api.post(`/legacy-erp/inventory-receipts/${id}/submit-for-approval`, {}),
    approve: (id: number, remarks?: string) => api.post(`/legacy-erp/inventory-receipts/${id}/approve`, { remarks }),
    reject: (id: number, remarks: string) => api.post(`/legacy-erp/inventory-receipts/${id}/reject`, { remarks }),
    // Universal Action Menu -> Return/Purchase Receipt submenu — walks back to the originating
    // Purchase Order (if any) and returns its whole receipt family minus this record itself.
    // See inventory-receipt.service.ts's listRelatedReceipts() / ReceiptTraceabilityService.
    getRelatedReceipts: (id: number) => api.get(`/legacy-erp/inventory-receipts/${id}/related-receipts`),
    // "Import Related Receipt" lives on Purchase Return (ReceiptType=122), not here — see
    // legacyErpApi.receipts(receiptType)'s own listRelatedImportable below.
    // Variant breakdown — same shape as legacyErpApi.purchaseOrders' own itemVariantOptions/
    // listItemVariants/createItemVariant/updateItemVariant/removeItemVariant (IM_ItemVariant
    // read-side is identical; the write side targets IM_ReceiptItemVariant instead of
    // IM_OrderReceiptItemVariant — see inventory-receipt.service.ts).
    itemVariantOptions: (inventoryId: number) => api.get(`/legacy-erp/inventory-receipts/item-variant-options/${inventoryId}`),
    listItemVariants: (id: number, itemId: number) => api.get(`/legacy-erp/inventory-receipts/${id}/items/${itemId}/variants`),
    createItemVariant: (id: number, itemId: number, d: any) => api.post(`/legacy-erp/inventory-receipts/${id}/items/${itemId}/variants`, d),
    updateItemVariant: (id: number, itemId: number, variantLineId: number, d: any) => api.put(`/legacy-erp/inventory-receipts/${id}/items/${itemId}/variants/${variantLineId}`, d),
    removeItemVariant: (id: number, itemId: number, variantLineId: number) => api.delete(`/legacy-erp/inventory-receipts/${id}/items/${itemId}/variants/${variantLineId}`),
  },
  // Financial Receipt (FI_Receipt) — a genuinely separate legacy entity from IM_Receipt above
  // (see fi-receipt.service.ts's own header comment). Same shape as `inventoryReceipts`.
  financialReceipts: {
    list: (search?: string) => api.get(`/legacy-erp/financial-receipts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/financial-receipts/${id}`),
    getByReceiptNo: (receiptNo: string) => api.get(`/legacy-erp/financial-receipts/by-receipt-no/${encodeURIComponent(receiptNo)}`),
    previewNextReceiptNo: () => api.get(`/legacy-erp/financial-receipts/next-receipt-no`),
    create: (d: any) => api.post('/legacy-erp/financial-receipts', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/financial-receipts/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/financial-receipts/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/financial-receipts/${id}/items`),
    createItem: (id: number, d: any) => api.post(`/legacy-erp/financial-receipts/${id}/items`, d),
    updateItem: (id: number, itemId: number, d: any) => api.put(`/legacy-erp/financial-receipts/${id}/items/${itemId}`, d),
    removeItem: (id: number, itemId: number) => api.delete(`/legacy-erp/financial-receipts/${id}/items/${itemId}`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/financial-receipts/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/financial-receipts/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/financial-receipts/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/financial-receipts/${id}/attachments/${attId}/content`,
  },
  // Receipt Screen Replication — same shape as `inventoryReceipts` above (drop-in for
  // InventoryReceiptLineGrid's `api` prop and AttachmentsTab's `AttachmentsApi`), just hitting
  // receipt-type.controller.ts's generic `/legacy-erp/receipts/:receiptType/...` route instead.
  // Purchase Receipt (type 1) stays on `inventoryReceipts` above — this is for the other 11.
  receipts: (receiptType: number) => {
    const base = `/legacy-erp/receipts/${receiptType}`;
    return {
      // `subcontractTypeId` — Subcontract Receipts List's own "Subcontractation" filter
      // dropdown; every other caller omits it and gets the exact same rows as before.
      list: (search?: string, subcontractTypeId?: number) => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (subcontractTypeId !== undefined) params.set('subcontractTypeId', String(subcontractTypeId));
        const qs = params.toString();
        return api.get(`${base}${qs ? `?${qs}` : ''}`);
      },
      get: (id: number) => api.get(`${base}/${id}`),
      getByReceiptNo: (receiptNo: string) => api.get(`${base}/by-receipt-no/${encodeURIComponent(receiptNo)}`),
      previewNextReceiptNo: () => api.get(`${base}/next-receipt-no`),
      create: (d: any) => api.post(base, d),
      update: (id: number, d: any) => api.put(`${base}/${id}`, d),
      delete: (id: number) => api.delete(`${base}/${id}`),
      listItems: (id: number) => api.get(`${base}/${id}/items`),
      createItem: (id: number, d: any) => api.post(`${base}/${id}/items`, d),
      updateItem: (id: number, itemId: number, d: any) => api.put(`${base}/${id}/items/${itemId}`, d),
      removeItem: (id: number, itemId: number) => api.delete(`${base}/${id}/items/${itemId}`),
      // Variant breakdown (Color + Variant1 enhancement) — same shape as legacyErpApi.orders(type)'s
      // own itemVariantOptions/listItemVariants/createItemVariant/updateItemVariant/removeItemVariant,
      // now exposed generically by receipt-type.controller.ts so every non-Purchase-Receipt type
      // (Purchase Return, Outside Process Receive, etc.) gets Variant1 support too, not just
      // Purchase Receipt's own dedicated `inventoryReceipts` client below.
      itemVariantOptions: (inventoryId: number) => api.get(`${base}/item-variant-options/${inventoryId}`),
      listItemVariants: (id: number, itemId: number) => api.get(`${base}/${id}/items/${itemId}/variants`),
      createItemVariant: (id: number, itemId: number, d: any) => api.post(`${base}/${id}/items/${itemId}/variants`, d),
      updateItemVariant: (id: number, itemId: number, variantLineId: number, d: any) => api.put(`${base}/${id}/items/${itemId}/variants/${variantLineId}`, d),
      removeItemVariant: (id: number, itemId: number, variantLineId: number) => api.delete(`${base}/${id}/items/${itemId}/variants/${variantLineId}`),
      listAttachments: (id: number, kind: "document" | "picture") => api.get(`${base}/${id}/attachments?kind=${kind}`),
      uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`${base}/${id}/attachments`, d),
      removeAttachment: (id: number, attId: number) => api.delete(`${base}/${id}/attachments/${attId}`),
      attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}${base}/${id}/attachments/${attId}/content`,
      // General Settings -> Approval Configuration — same shape as inventoryReceipts' own,
      // now exposed generically by receipt-type.controller.ts (Purchase Return, Received
      // Connection Receipt, etc. previously had no Approve/Reject route at all).
      getApprovalStatus: (id: number) => api.get(`${base}/${id}/approval-status`),
      submitForApproval: (id: number) => api.post(`${base}/${id}/submit-for-approval`, {}),
      approve: (id: number, remarks?: string) => api.post(`${base}/${id}/approve`, { remarks }),
      reject: (id: number, remarks: string) => api.post(`${base}/${id}/reject`, { remarks }),
      // Universal Action Menu -> Return/Purchase Receipt submenu — same shared traceability
      // walk as inventoryReceipts' own, now available for Purchase Return, Received Connection
      // Receipt, and every other generic receipt type.
      getRelatedReceipts: (id: number) => api.get(`${base}/${id}/related-receipts`),
      // Universal Action Menu -> "Import Related Receipt" — Purchase Return (122) only; the
      // backend rejects this call for any other receiptType (see receipt-type.controller.ts's
      // own guard). Current-Account-aware source picker over Receipt Type 2/11 lines — see
      // inventory-receipt.service.ts's listRelatedImportable().
      listRelatedImportable: (currentAccountId: number) => api.get(`${base}/related-lines?currentAccountId=${currentAccountId}`),
    };
  },
  // "00-Purchase Contract" / "00-Sale Contract" — same shape as `receipts` above (drop-in for
  // ContractLineGrid's `api` prop and AttachmentsTab's `AttachmentsApi`), hitting
  // contract.controller.ts's generic `/legacy-erp/contracts/:receiptType/...` route. Both
  // contract kinds share this one client, parameterized by receiptType — no dedicated "master"
  // route exists here (unlike inventoryReceipts/receipts).
  contracts: (receiptType: number) => {
    const base = `/legacy-erp/contracts/${receiptType}`;
    return {
      list: (search?: string) => api.get(`${base}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
      get: (id: number) => api.get(`${base}/${id}`),
      getByReceiptNo: (receiptNo: string) => api.get(`${base}/by-receipt-no/${encodeURIComponent(receiptNo)}`),
      previewNextReceiptNo: () => api.get(`${base}/next-receipt-no`),
      create: (d: any) => api.post(base, d),
      update: (id: number, d: any) => api.put(`${base}/${id}`, d),
      delete: (id: number) => api.delete(`${base}/${id}`),
      listItems: (id: number) => api.get(`${base}/${id}/items`),
      createItem: (id: number, d: any) => api.post(`${base}/${id}/items`, d),
      updateItem: (id: number, itemId: number, d: any) => api.put(`${base}/${id}/items/${itemId}`, d),
      removeItem: (id: number, itemId: number) => api.delete(`${base}/${id}/items/${itemId}`),
      listAttachments: (id: number, kind: "document" | "picture") => api.get(`${base}/${id}/attachments?kind=${kind}`),
      uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`${base}/${id}/attachments`, d),
      removeAttachment: (id: number, attId: number) => api.delete(`${base}/${id}/attachments/${attId}`),
      attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}${base}/${id}/attachments/${attId}/content`,
    };
  },
  trimInventoryCards: {
    list: (search?: string) => api.get(`/legacy-erp/trim-inventory-cards${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/trim-inventory-cards/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/trim-inventory-cards/by-code/${encodeURIComponent(code)}`),
    previewNextCode: () => api.get(`/legacy-erp/trim-inventory-cards/next-code`),
    create: (d: any) => api.post('/legacy-erp/trim-inventory-cards', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/trim-inventory-cards/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/trim-inventory-cards/${id}`),
    listTab: (id: number, tab: string) => api.get(`/legacy-erp/trim-inventory-cards/${id}/${tab}`),
    createTabRow: (id: number, tab: string, d: any) => api.post(`/legacy-erp/trim-inventory-cards/${id}/${tab}`, d),
    updateTabRow: (id: number, tab: string, lineId: number, d: any) => api.put(`/legacy-erp/trim-inventory-cards/${id}/${tab}/${lineId}`, d),
    removeTabRow: (id: number, tab: string, lineId: number) => api.delete(`/legacy-erp/trim-inventory-cards/${id}/${tab}/${lineId}`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/trim-inventory-cards/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/trim-inventory-cards/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/trim-inventory-cards/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/trim-inventory-cards/${id}/attachments/${attId}/content`,
  },
  // Item Statement / Stock Control Ledger — reachable from Trim/Fabric/Yarn/Inventory Card
  // List's "View Statement" row action (itemId = the row's real IM_Item.RecId), or standalone
  // (no itemId) as a general ledger across items. Same backend tables/direction rules either way
  // — see item-statement.service.ts.
  itemStatement: {
    get: (itemId: number | null, filters?: ItemStatementFilters) => {
      const query = buildItemStatementQuery(filters);
      const path = itemId != null ? `/legacy-erp/inventory-items/${itemId}/statement` : `/legacy-erp/inventory-items/ledger`;
      return api.get(`${path}${query ? `?${query}` : ''}`);
    },
    getDetailed: (itemId: number | null, filters?: ItemStatementFilters, dimensions?: { color?: boolean; lot?: boolean; warehouse?: boolean }) => {
      const qs = new URLSearchParams(buildItemStatementQuery(filters));
      if (dimensions?.color) qs.set("dimColor", "true");
      if (dimensions?.lot) qs.set("dimLot", "true");
      if (dimensions?.warehouse) qs.set("dimWarehouse", "true");
      const query = qs.toString();
      const path = itemId != null ? `/legacy-erp/inventory-items/${itemId}/statement/detailed` : `/legacy-erp/inventory-items/ledger/detailed`;
      return api.get(`${path}${query ? `?${query}` : ''}`);
    },
  },
  // Unified read-only aggregation over Fabric/Yarn/Trim (Inventory Card List) — see
  // inventory-card.service.ts; never writes, each card type is still created/edited through
  // its own existing screen/API above.
  inventoryCards: {
    list: (params?: { search?: string; sortBy?: string; sortDir?: "asc" | "desc" }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set("search", params.search);
      if (params?.sortBy) qs.set("sortBy", params.sortBy);
      if (params?.sortDir) qs.set("sortDir", params.sortDir);
      const query = qs.toString();
      return api.get(`/legacy-erp/inventory-cards${query ? `?${query}` : ''}`);
    },
  },
  // Full-CRUD "Master Lookup" management screens (Fab Type Master today; any future master
  // added purely via backend config reuses these exact same calls with a different `key`).
  masterLookup: {
    meta: (key: string) => api.get(`/legacy-erp/master-lookup/${key}/meta`),
    list: (key: string, search?: string) => api.get(`/legacy-erp/master-lookup/${key}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    create: (key: string, d: { code: string; name: string }) => api.post(`/legacy-erp/master-lookup/${key}`, d),
    update: (key: string, id: number, d: { code: string; name: string; active?: boolean }) => api.put(`/legacy-erp/master-lookup/${key}/${id}`, d),
    delete: (key: string, id: number) => api.delete(`/legacy-erp/master-lookup/${key}/${id}`),
  },
  lookupParameters: (group: "style-group" | "brand" | "style-department", search?: string) =>
    api.get(`/legacy-erp/lookup/parameters/${group}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  lookupTable: (
    key: "category" | "group" | "mark" | "model" | "variant-type" | "tax" | "withholding-type" | "warehouse"
      | "fabric" | "process" | "finish-gsm" | "dye-type" | "composition" | "forex" | "unit"
      | "service" | "manufacturing-order" | "size-parameter" | "city" | "state" | "country"
      | "cash" | "cost-center" | "subcontract-type" | "subcontract-receipt"
      | "employee" | "certification" | "initial-cost" | "project",
    search?: string,
  ) => api.get(`/legacy-erp/lookup/tables/${key}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  // Resolve one stored FK id back to its display Code/Name — for loading an EXISTING record
  // (e.g. Work Order Detail tab) where lookupTable() above only supports typeahead search.
  lookupTableGet: (key: string, id: number) => api.get(`/legacy-erp/lookup/tables/${key}/${id}`),
  // Purchase Order per-line Unit dropdown, scoped to the selected Item's own configured units
  // (IM_ItemUnitItemSize) — not the flat cross-item `unit` lookup above.
  lookupItemUnits: (inventoryId: number) => api.get(`/legacy-erp/lookup/tables/item-units/${inventoryId}`),
  // Read-only "Receipt & Master Data" unified grid (see unified-grid.service.ts) — every
  // write action from that screen still calls the tables above (inventoryReceipts/accounts/
  // warehouses/masterLookup/accounts.removeTabRow), never this.
  unifiedGrid: {
    meta: () => api.get(`/legacy-erp/unified-grid/meta`),
    list: (key: string, search?: string) => api.get(`/legacy-erp/unified-grid/${key}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  },
  // "Customize Worklist" — shared by Receipt & Master Data, Financial Receipt & Master Data,
  // and every per-entity list screen. See worklist-fields.service.ts / worklist-rows.service.ts.
  // No write path; persistence goes through settingsApi.updateCurrentSettings
  // (tablePreferences.<screen>Worklists, one key per screen).
  worklistFields: {
    // `primary` is optional and scopes the returned sources to one screen's own source(s) (see
    // ALLOWED_SOURCES_BY_PRIMARY in worklist-fields.service.ts). Omitted by Receipt & Master
    // Data / Financial Receipt & Master Data, which intentionally see every source.
    list: (primary?: string) => api.get(`/legacy-erp/worklist-fields${primary ? `?primary=${encodeURIComponent(primary)}` : ''}`),
    // Server-side relational resolution: primaryTable stays the sole row-identity/search source
    // (unchanged priority), fields are resolved against it via real FK relationships only.
    resolve: (primaryTable: string, fields: { source: string; key: string }[], search?: string) =>
      api.post(`/legacy-erp/worklist-fields/resolve`, { primaryTable, fields, search }),
  },
};

// Centralized General Settings -> Approval Configuration framework. screenKey values are
// Legacy ERP MenuItem.href strings (the existing screen/module registry) — they already
// contain "/" and often their own "?query=", so they travel in the body/query string rather
// than as URL path segments. See nexuscore-backend/src/modules/approval/.
export const approvalConfigApi = {
  list: () => api.get('/general-settings/approval-configurations'),
  update: (d: { screenKey: string; approvalRequired?: boolean; approvalLevel?: number; isActive?: boolean; selfApprovalAllowed?: boolean }) =>
    api.put('/general-settings/approval-configurations', d),
};

// Centralized Settings -> Screen Parameters — same "screenKey travels as a query string, never a
// path segment" reasoning as approvalConfigApi above (a screen key is a MenuItem.href, which
// already contains "/" and often its own "?query="). See
// nexuscore-backend/src/modules/general-settings/.
export const screenParametersApi = {
  // Admin management list — every parameter for one screen, active or not.
  list: (screenKey: string) => api.get(`/general-settings/screen-parameters?screenKey=${encodeURIComponent(screenKey)}`),
  // The dynamic API: active parameters only, for any screen to consume by its own screenKey.
  listActive: (screenKey: string) => api.get(`/general-settings/screen-parameters/active?screenKey=${encodeURIComponent(screenKey)}`),
  create: (d: { screenKey: string; paramKey: string; name: string; description?: string; type: string; value?: string | null; options?: string[]; isActive?: boolean }) =>
    api.post('/general-settings/screen-parameters', d),
  update: (id: string, d: Partial<{ name: string; description: string | null; type: string; value: string | null; options: string[]; isActive: boolean }>) =>
    api.put(`/general-settings/screen-parameters/${id}`, d),
  delete: (id: string) => api.delete(`/general-settings/screen-parameters/${id}`),
};

export const approvalApi = {
  submit: (screenKey: string, transactionId: string | number) => api.post('/approval/submit', { screenKey, transactionId }),
  approve: (screenKey: string, transactionId: string | number, remarks?: string) => api.post('/approval/approve', { screenKey, transactionId, remarks }),
  reject: (screenKey: string, transactionId: string | number, remarks: string) => api.post('/approval/reject', { screenKey, transactionId, remarks }),
  pending: (screenKey?: string) => api.get(`/approval/pending${screenKey ? `?screenKey=${encodeURIComponent(screenKey)}` : ''}`),
  history: (screenKey: string, transactionId: string | number) =>
    api.get(`/approval/history?screenKey=${encodeURIComponent(screenKey)}&transactionId=${encodeURIComponent(String(transactionId))}`),
  status: (screenKey: string, transactionId: string | number) =>
    api.get(`/approval/status?screenKey=${encodeURIComponent(screenKey)}&transactionId=${encodeURIComponent(String(transactionId))}`),
};

// BPM helpers
export const bpmApi = {
  getTasks: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/bpm/tasks${qs}`);
  },
  getTask: (id: string) => api.get(`/bpm/tasks/${id}`),
  moveStage: (id: string, toStageId: string, comment?: string) =>
    api.patch(`/bpm/tasks/${id}/move-stage`, { toStageId, comment }),
  assignTask: (id: string, assignedTo: string) =>
    api.post(`/bpm/tasks/${id}/assign`, { assignedTo }),
  getProcesses: () => api.get('/bpm/processes'),
};
