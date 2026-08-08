const BASE = process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1';

async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
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

// Legacy ERP (migrated SQL Server schema, raw-SQL backed)
export const legacyErpApi = {
  warehouses: {
    list: (search?: string) => api.get(`/legacy-erp/warehouses${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/warehouses/${id}`),
    create: (d: any) => api.post('/legacy-erp/warehouses', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/warehouses/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/warehouses/${id}`),
  },
  accounts: {
    list: (search?: string) => api.get(`/legacy-erp/accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/accounts/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/accounts/by-code/${encodeURIComponent(code)}`),
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
    create: (d: any) => api.post('/legacy-erp/unit-sets', d),
    update: (id: number, d: any) => api.put(`/legacy-erp/unit-sets/${id}`, d),
    delete: (id: number) => api.delete(`/legacy-erp/unit-sets/${id}`),
    listItems: (id: number) => api.get(`/legacy-erp/unit-sets/${id}/items`),
    createItem: (id: number, d: any) => api.post(`/legacy-erp/unit-sets/${id}/items`, d),
    updateItem: (id: number, itemId: number, d: any) => api.put(`/legacy-erp/unit-sets/${id}/items/${itemId}`, d),
    removeItem: (id: number, itemId: number) => api.delete(`/legacy-erp/unit-sets/${id}/items/${itemId}`),
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
    removeTabRow: (id: number, tab: string, lineId: number) => api.delete(`/legacy-erp/yarn-cards/${id}/${tab}/${lineId}`),
    listAttachments: (id: number, kind: "document" | "picture") => api.get(`/legacy-erp/yarn-cards/${id}/attachments?kind=${kind}`),
    uploadAttachment: (id: number, d: { kind: "document" | "picture"; fileName: string; dataUrl: string }) => api.post(`/legacy-erp/yarn-cards/${id}/attachments`, d),
    removeAttachment: (id: number, attId: number) => api.delete(`/legacy-erp/yarn-cards/${id}/attachments/${attId}`),
    attachmentContentUrl: (id: number, attId: number) => `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1'}/legacy-erp/yarn-cards/${id}/attachments/${attId}/content`,
  },
  fabricCards: {
    list: (search?: string) => api.get(`/legacy-erp/fabric-cards${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/fabric-cards/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/fabric-cards/by-code/${encodeURIComponent(code)}`),
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
  },
  purchaseOrders: {
    list: (search?: string) => api.get(`/legacy-erp/purchase-orders${search ? `?search=${encodeURIComponent(search)}` : ''}`),
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
  },
  trimInventoryCards: {
    list: (search?: string) => api.get(`/legacy-erp/trim-inventory-cards${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: number) => api.get(`/legacy-erp/trim-inventory-cards/${id}`),
    getByCode: (code: string) => api.get(`/legacy-erp/trim-inventory-cards/by-code/${encodeURIComponent(code)}`),
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
    update: (key: string, id: number, d: { code: string; name: string }) => api.put(`/legacy-erp/master-lookup/${key}/${id}`, d),
    delete: (key: string, id: number) => api.delete(`/legacy-erp/master-lookup/${key}/${id}`),
  },
  lookupParameters: (group: "style-group" | "brand" | "style-department", search?: string) =>
    api.get(`/legacy-erp/lookup/parameters/${group}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  lookupTable: (
    key: "category" | "group" | "mark" | "model" | "variant-type" | "tax" | "withholding-type" | "warehouse"
      | "fabric" | "process" | "finish-gsm" | "dye-type" | "composition" | "forex" | "unit"
      | "service" | "manufacturing-order",
    search?: string,
  ) => api.get(`/legacy-erp/lookup/tables/${key}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
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
