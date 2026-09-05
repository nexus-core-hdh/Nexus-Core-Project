

export const API_BASE_URL = process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || 'http://localhost:4000/api/v1';

// Get auth headers
export function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return {
    Authorization: token ? `Bearer ${token}` : '',
  };
}

// Generic fetch function
async function apiRequest(endpoint: string, options?: RequestInit) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Merge headers properly - ensure Content-Type is preserved
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };
  
  const headers: HeadersInit = {
    ...defaultHeaders,
    ...(options?.headers || {}),
  };

  // Build fetch options, ensuring body is included
  const method = options?.method || 'GET';
  const fetchOptions: RequestInit = {
    method,
    headers,
    // Same fix as nexuscore-api.ts's own request() — these responses carry no Cache-Control
    // header, so the browser's default fetch caching can otherwise serve a stale GET after a
    // mutation. GETs through this client must always hit the network too.
    cache: 'no-store',
  };

  // Only include body for methods that support it
  if (options?.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchOptions.body = options.body;
  }

  // Include other options
  if (options?.signal) {
    fetchOptions.signal = options.signal;
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (fetchError: any) {
    // Network error (server not reachable, CORS, etc.)
    const error = new Error(`Network error: ${fetchError.message || 'Failed to fetch'}`);
    (error as any).isNetworkError = true;
    (error as any).originalError = fetchError;
    throw error;
  }

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.statusText}`;
    let trialExpired = false;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
      if (errorData.details) {
        errorMessage += ` - ${errorData.details}`;
      }
      trialExpired = errorData.trialExpired || false;
    } catch {
      // If response is not JSON, use status text
    }
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).trialExpired = trialExpired;
    throw error;
  }

  // Some endpoints return 204 No Content (common for DELETE).
  if (response.status === 204) return null;

  // Avoid throwing on empty bodies (e.g. misconfigured APIs returning 200 with no JSON).
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!text) return null;
  if (contentType.includes('application/json')) {
    const parsed = JSON.parse(text);
    // Unwrap NexusCore ResponseInterceptor envelope { success, data, message }
    if (parsed && typeof parsed === 'object' && 'success' in parsed && 'data' in parsed) {
      return parsed.data;
    }
    return parsed;
  }
  // If it's not JSON, return raw text.
  return text as any;
}

// Notes API functions
export const notesApi = {

  // Get all notes for a user
  getNotes: (userId: number) => apiRequest(`/users/${userId}/notes`),

  // Get a single notegetNote: (id: number) => apiRequest(`/${id}`),

  createNote: (note: any) => apiRequest('/notes', {
    method: 'POST',
    body: JSON.stringify(note),
  }),

  updateNote: (id: number, note: any) => apiRequest(`/${id}`, {
    method: 'PUT',
    body: JSON.stringify(note),
  }),

  deleteNote: (id: number) => apiRequest(`/${id}`, {
    method: 'DELETE',
  }),

getNoteLabels: (userId: number) => apiRequest(`/users/${userId}/note-labels`),

createNoteLabel: (label: any) => apiRequest('/note-labels', {
  method: 'POST',
  body: JSON.stringify(label),
}),

updateNoteLabel: (id: number, label: any) => apiRequest(`/note-labels/${id}`, {
  method: 'PUT',
  body: JSON.stringify(label),
}),

deleteNoteLabel: (id: number) => apiRequest(`/note-labels/${id}`, {
  method: 'DELETE',
}),
};

// Companies API functions
export const companiesApi = {
  // The backend is single-company-per-tenant (`GET /company`, current user's
  // own company — there is no `/companies` listing/multi-tenant directory
  // endpoint). Wrapped in an array so the existing Companies list page, which
  // expects `Company[]`, keeps working unchanged.
  getCompanies: async () => {
    const company = await apiRequest('/company', { headers: getAuthHeaders() });
    return company ? [company] : [];
  },

  // Get a single company
  getCompany: (id: number) => apiRequest(`/companies/${id}`),

  // Get company by slug
  getCompanyBySlug: (slug: string) => apiRequest(`/companies/slug/${slug}`),

  // Create company
  createCompany: (company: any) => apiRequest('/companies', {
    method: 'POST',
    body: JSON.stringify(company),
  }),

  // Update company
  updateCompany: (id: number, company: any) => apiRequest(`/companies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(company),
  }),

  // Delete company
  deleteCompany: (id: number) => apiRequest(`/companies/${id}`, {
    method: 'DELETE',
  }),
};

// Pricing Plans API functions
export const pricingPlansApi = {
  // Get all pricing plans
  getPricingPlans: (params?: { industry?: string; isActive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.industry) queryParams.append('industry', params.industry);
    if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
    const query = queryParams.toString();
    return apiRequest(`/pricing-plans${query ? `?${query}` : ''}`);
  },

  // Get pricing plans by industry
  getPricingPlansByIndustry: (industry: string) => apiRequest(`/pricing-plans/industry/${industry}`),

  // Get a single pricing plan
  getPricingPlan: (id: number) => apiRequest(`/pricing-plans/${id}`),

  // Create pricing plan
  createPricingPlan: (plan: any) => apiRequest('/pricing-plans', {
    method: 'POST',
    body: JSON.stringify(plan),
  }),

  // Update pricing plan
  updatePricingPlan: (id: number, plan: any) => apiRequest(`/pricing-plans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(plan),
  }),

  // Delete pricing plan
  deletePricingPlan: (id: number) => apiRequest(`/pricing-plans/${id}`, {
    method: 'DELETE',
  }),
};

// Branches API functions
export const branchesApi = {
  // Get all branches
  getBranches: () => apiRequest('/branches'),

  // Get a single branch
  getBranch: (id: number) => apiRequest(`/branches/${id}`),

  // Create branch
  createBranch: (branch: any) => apiRequest('/branches', {
    method: 'POST',
    body: JSON.stringify(branch),
  }),

  // Update branch
  updateBranch: (id: number, branch: any) => apiRequest(`/branches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(branch),
  }),

  // Delete branch
  deleteBranch: (id: number) => apiRequest(`/branches/${id}`, {
    method: 'DELETE',
  }),
};

// Form Sections API functions
export const formSectionsApi = {
  // Get all sections
  getSections: (companyId?: number) => {
    const query = companyId ? `?companyId=${companyId}` : '';
    return apiRequest(`/form-sections${query}`);
  },

  // Get a single section
  getSection: (id: number) => apiRequest(`/form-sections/${id}`),

  // Create section
  createSection: (section: any) => apiRequest('/form-sections', {
    method: 'POST',
    body: JSON.stringify(section),
  }),

  // Update section
  updateSection: (id: number, section: any) => apiRequest(`/form-sections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(section),
  }),

  // Delete section
  deleteSection: (id: number) => apiRequest(`/form-sections/${id}`, {
    method: 'DELETE',
  }),
};

// Form Fields API functions
export const formFieldsApi = {
  // Get all fields
  getFields: (sectionId?: number) => {
    const query = sectionId ? `?sectionId=${sectionId}` : '';
    return apiRequest(`/form-fields${query}`);
  },

  // Get a single field
  getField: (id: number) => apiRequest(`/form-fields/${id}`),

  // Create field
  createField: (field: any) => apiRequest('/form-fields', {
    method: 'POST',
    body: JSON.stringify(field),
  }),

  // Update field
  updateField: (id: number, field: any) => apiRequest(`/form-fields/${id}`, {
    method: 'PUT',
    body: JSON.stringify(field),
  }),

  // Delete field
  deleteField: (id: number) => apiRequest(`/form-fields/${id}`, {
    method: 'DELETE',
  }),

  // Reorder fields
  reorderFields: (fieldIds: number[]) => apiRequest('/form-fields/reorder', {
    method: 'POST',
    body: JSON.stringify({ fieldIds }),
  }),
};

// Form Permissions API functions
export const formPermissionsApi = {
  // Section permissions
  getSectionPermissions: (sectionId: number) => 
    apiRequest(`/form-permissions/sections/${sectionId}`, {
      headers: getAuthHeaders(),
    }),

  updateSectionPermission: (sectionId: number, data: { userId: number; canView: boolean }) =>
    apiRequest(`/form-permissions/sections/${sectionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  bulkUpdateSectionPermissions: (sectionId: number, permissions: Array<{ userId: number; canView: boolean }>) =>
    apiRequest(`/form-permissions/sections/${sectionId}/bulk`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ permissions }),
    }),

  // Field permissions
  getFieldPermissions: (fieldId: number) => 
    apiRequest(`/form-permissions/fields/${fieldId}`, {
      headers: getAuthHeaders(),
    }),

  updateFieldPermission: (fieldId: number, data: { userId: number; canView: boolean }) =>
    apiRequest(`/form-permissions/fields/${fieldId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  bulkUpdateFieldPermissions: (fieldId: number, permissions: Array<{ userId: number; canView: boolean }>) =>
    apiRequest(`/form-permissions/fields/${fieldId}/bulk`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ permissions }),
    }),
};

// Activities API functions
export const activitiesApi = {
  // Get all activities
  getActivities: (params?: { userId?: number; companyId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return apiRequest(`/activities${query}`);
  },

  // Get a single activity
  getActivity: (id: number) => apiRequest(`/activities/${id}`),

  // Create activity
  createActivity: (activity: any) => apiRequest('/activities', {
    method: 'POST',
    body: JSON.stringify(activity),
  }),

  // Delete activity
  deleteActivity: (id: number) => apiRequest(`/activities/${id}`, {
    method: 'DELETE',
  }),
};

// Comments API functions
export const commentsApi = {
  // Get all comments
  getComments: (companyId?: number) => {
    const query = companyId ? `?companyId=${companyId}` : '';
    return apiRequest(`/comments${query}`);
  },

  // Get a single comment
  getComment: (id: number) => apiRequest(`/comments/${id}`),

  // Create comment
  createComment: (comment: any) => apiRequest('/comments', {
    method: 'POST',
    body: JSON.stringify(comment),
  }),

  // Update comment
  updateComment: (id: number, comment: any) => apiRequest(`/comments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(comment),
  }),

  // Delete comment
  deleteComment: (id: number) => apiRequest(`/comments/${id}`, {
    method: 'DELETE',
  }),
};

// Messages API functions
export const messagesApi = {
  // Get all messages
  getMessages: (companyId?: number) => {
    const query = companyId ? `?companyId=${companyId}` : '';
    return apiRequest(`/messages${query}`);
  },

  // Get a single message
  getMessage: (id: number) => apiRequest(`/messages/${id}`),

  // Create message
  createMessage: (message: any) => apiRequest('/messages', {
    method: 'POST',
    body: JSON.stringify(message),
  }),

  // Delete message
  deleteMessage: (id: number) => apiRequest(`/messages/${id}`, {
    method: 'DELETE',
  }),
};

// Users API functions
export const usersApi = {
  // Get all users
  getUsers: () => apiRequest('/users'),

  // Get a single user
  getUser: (id: number) => apiRequest(`/users/${id}`),

  // Get user profile with enriched data
  getUserProfile: (id: number) => apiRequest(`/users/${id}/profile`, {
    headers: getAuthHeaders(),
  }),

  // Create user
  createUser: (user: any) => apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(user),
  }),

  // Update user
  updateUser: (id: number, user: any) => apiRequest(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(user),
  }),

  // Delete user
  deleteUser: (id: number) => apiRequest(`/users/${id}`, {
    method: 'DELETE',
  }),

  // Set/reset user password (admin only)
  setUserPassword: (id: number, data: { password?: string; generateTemporary?: boolean }) => 
    apiRequest(`/users/set-password/${id}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// User Connections API functions
export const userConnectionsApi = {
  // Get all connections for a user
  getConnections: (userId: number, status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiRequest(`/users/${userId}/connections${query}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a connection request
  createConnection: (userId: number, userId2: number) => 
    apiRequest(`/users/${userId}/connections`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId2 }),
    }),

  // Accept a connection
  acceptConnection: (connectionId: number) => 
    apiRequest(`/connections/${connectionId}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }),

  // Update connection status
  updateConnection: (connectionId: number, status: 'connected' | 'blocked') => 
    apiRequest(`/connections/${connectionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    }),

  // Delete a connection
  deleteConnection: (connectionId: number) => 
    apiRequest(`/connections/${connectionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),
};

// Auth API functions
export const authApi = {
  // Login
  login: (credentials: { email: string; password: string; latitude?: number; longitude?: number; city?: string; region?: string; country?: string; timezone?: string; ipAddress?: string; userAgent?: string; device?: string; browser?: string; os?: string }) => apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),

  // Register
  register: (userData: {
    name: string;
    email: string;
    password: string;
    country?: string;
    role?: string;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  // Verify token
  verifyToken: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    return apiRequest('/auth/verify', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },

  // Change password
  changePassword: (data: { userId: number; currentPassword?: string; newPassword: string }) => 
    apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Forgot password
  forgotPassword: (email: string) => 
    apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  // Reset password
  resetPassword: (data: { token: string; newPassword: string }) => 
    apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Google login
  googleLogin: (data: { idToken: string; latitude?: number; longitude?: number; city?: string; region?: string; country?: string; timezone?: string; ipAddress?: string; userAgent?: string; device?: string; browser?: string; os?: string }) => 
    apiRequest('/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Login History API functions
export const loginHistoryApi = {
  // Get login history
  getLoginHistory: () => apiRequest('/login-history'),
};

// Drive Usage API functions
export const driveUsageApi = {
  getDriveUsage: (params?: { companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    const query = searchParams.toString();
    return apiRequest(`/drive-usage${query ? `?${query}` : ''}`);
  }
};

// System Settings API functions
export const systemSettingsApi = {
  getSystemSettings: (params?: { companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    const query = searchParams.toString();
    return apiRequest(`/system-settings${query ? `?${query}` : ''}`);
  },
  updateSystemSettings: (settings: Record<string, any>) =>
    apiRequest('/system-settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    })
};

// Exception Logs API functions
export const exceptionLogsApi = {
  getExceptionLogs: (params?: {
    companyId?: number;
    branchId?: number;
    severity?: string;
    resolved?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.resolved) searchParams.append('resolved', params.resolved);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    const query = searchParams.toString();
    return apiRequest(`/exception-logs${query ? `?${query}` : ''}`);
  },
  createExceptionLog: (log: any) =>
    apiRequest('/exception-logs', {
      method: 'POST',
      body: JSON.stringify(log)
    }),
  updateExceptionLog: (id: number, data: any) =>
    apiRequest(`/exception-logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  deleteExceptionLog: (id: number) =>
    apiRequest(`/exception-logs/${id}`, {
      method: 'DELETE'
    })
};

// Todos API functions
export const todosApi = {
  // Get all todos (optionally filtered by userId)
  getTodos: (userId?: number) => {
    const query = userId ? `?userId=${userId}` : '';
    return apiRequest(`/todos${query}`);
  },

  // Get todos for a specific user
  getTodosForUser: (userId: number) => apiRequest(`/users/${userId}/todos`),

  // Get a single todo
  getTodo: (id: string) => apiRequest(`/todos/${id}`),

  // Create todo
  createTodo: (todo: any) => apiRequest('/todos', {
    method: 'POST',
    body: JSON.stringify(todo),
  }),

  // Update todo
  updateTodo: (id: string, todo: any) => apiRequest(`/todos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(todo),
  }),

  // Delete todo
  deleteTodo: (id: string) => apiRequest(`/todos/${id}`, {
    method: 'DELETE',
  }),

  // Reorder todos
  reorderTodos: (todoPositions: { id: string; position: number }[]) => 
    apiRequest('/todos/reorder', {
      method: 'POST',
      body: JSON.stringify({ todoPositions }),
    }),

  // Add comment to todo
  addComment: (todoId: string, text: string) => 
    apiRequest(`/todos/${todoId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // Delete comment
  deleteComment: (todoId: string, commentId: string) => 
    apiRequest(`/todos/${todoId}/comments/${commentId}`, {
      method: 'DELETE',
    }),

  // Add file to todo
  addFile: (todoId: string, file: { name: string; url: string; type: string; size: number }) => 
    apiRequest(`/todos/${todoId}/files`, {
      method: 'POST',
      body: JSON.stringify(file),
    }),

  // Remove file from todo
  removeFile: (todoId: string, fileId: string) => 
    apiRequest(`/todos/${todoId}/files/${fileId}`, {
      method: 'DELETE',
    }),

  // Add subtask to todo
  addSubTask: (todoId: string, title: string) => 
    apiRequest(`/todos/${todoId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  // Update subtask
  updateSubTask: (todoId: string, subTaskId: string, data: { title?: string; completed?: boolean }) => 
    apiRequest(`/todos/${todoId}/subtasks/${subTaskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Remove subtask from todo
  removeSubTask: (todoId: string, subTaskId: string) => 
    apiRequest(`/todos/${todoId}/subtasks/${subTaskId}`, {
      method: 'DELETE',
    }),
};

// Settings API functions
// Lead Stages API functions
export const leadStagesApi = {
  // Get all lead stages
  getLeadStages: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/lead-stages${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a lead stage
  createLeadStage: (stage: any) => apiRequest('/lead-stages', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Update a lead stage
  updateLeadStage: (id: number, stage: any) => apiRequest(`/lead-stages/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Delete a lead stage
  deleteLeadStage: (id: number) => apiRequest(`/lead-stages/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder lead stages
  reorderLeadStages: (stages: Array<{ id: number; order: number }>) => apiRequest('/lead-stages/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ stages }),
  }),
};

// Document Stages API functions
export const documentStagesApi = {
  // Get all document stages
  getDocumentStages: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/document-stages${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a document stage
  createDocumentStage: (stage: any) => apiRequest('/document-stages', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Update a document stage
  updateDocumentStage: (id: number, stage: any) => apiRequest(`/document-stages/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Delete a document stage
  deleteDocumentStage: (id: number) => apiRequest(`/document-stages/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder document stages
  reorderDocumentStages: (stages: Array<{ id: number; order: number }>) => apiRequest('/document-stages/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ stages }),
  }),
};

// Currencies API functions
export const currenciesApi = {
  // Get all currencies
  getCurrencies: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/currencies${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a currency
  createCurrency: (currency: any) => apiRequest('/currencies', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(currency),
  }),

  // Update a currency
  updateCurrency: (id: number, currency: any) => apiRequest(`/currencies/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(currency),
  }),

  // Delete a currency
  deleteCurrency: (id: number) => apiRequest(`/currencies/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Locations API functions
export const locationsApi = {
  // Get all locations
  getLocations: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/locations${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a location
  createLocation: (location: any) => apiRequest('/locations', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(location),
  }),

  // Update a location
  updateLocation: (id: number, location: any) => apiRequest(`/locations/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(location),
  }),

  // Delete a location
  deleteLocation: (id: number) => apiRequest(`/locations/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Taxes API functions
export const taxesApi = {
  // Get all taxes
  getTaxes: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/taxes${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a tax
  createTax: (tax: any) => apiRequest('/taxes', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(tax),
  }),

  // Update a tax
  updateTax: (id: number, tax: any) => apiRequest(`/taxes/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(tax),
  }),

  // Delete a tax
  deleteTax: (id: number) => apiRequest(`/taxes/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Units of Measurement API functions
export const unitsApi = {
  // Get all units of measurement
  getUnits: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/units${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a unit of measurement
  createUnit: (unit: any) => apiRequest('/units', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(unit),
  }),

  // Update a unit of measurement
  updateUnit: (id: number, unit: any) => apiRequest(`/units/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(unit),
  }),

  // Delete a unit of measurement
  deleteUnit: (id: number) => apiRequest(`/units/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Product Properties API functions
export const productPropertiesApi = {
  // Get all product properties
  getProductProperties: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/product-properties${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a product property
  createProductProperty: (property: any) => apiRequest('/product-properties', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(property),
  }),

  // Update a product property
  updateProductProperty: (id: number, property: any) => apiRequest(`/product-properties/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(property),
  }),

  // Delete a product property
  deleteProductProperty: (id: number) => apiRequest(`/product-properties/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Deal Pipelines API functions
export const dealPipelinesApi = {
  // Get all deal pipelines
  getDealPipelines: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/deal-pipelines${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single deal pipeline with stages and connections
  getDealPipeline: (id: number) => apiRequest(`/deal-pipelines/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a deal pipeline
  createDealPipeline: (pipeline: any) => apiRequest('/deal-pipelines', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(pipeline),
  }),

  // Update a deal pipeline
  updateDealPipeline: (id: number, pipeline: any) => apiRequest(`/deal-pipelines/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(pipeline),
  }),

  // Delete a deal pipeline
  deleteDealPipeline: (id: number) => apiRequest(`/deal-pipelines/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  reorderDealPipelines: (pipelines: Array<{ id: number; order: number }>) => apiRequest(`/deal-pipelines/reorder`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ pipelines }),
  }),

  // Stage management
  getPipelineStages: (pipelineId: number) => apiRequest(`/deal-pipelines/${pipelineId}/stages`, {
    headers: getAuthHeaders(),
  }),

  createPipelineStage: (pipelineId: number, stage: any) => apiRequest(`/deal-pipelines/${pipelineId}/stages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  updatePipelineStage: (pipelineId: number, stageId: number, stage: any) => apiRequest(`/deal-pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  deletePipelineStage: (pipelineId: number, stageId: number) => apiRequest(`/deal-pipelines/${pipelineId}/stages/${stageId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  reorderPipelineStages: (pipelineId: number, stages: Array<{ id: number; order: number }>) => apiRequest(`/deal-pipelines/${pipelineId}/stages/reorder`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ stages }),
  }),

  // Connection management
  getPipelineConnections: (pipelineId: number) => apiRequest(`/deal-pipelines/${pipelineId}/connections`, {
    headers: getAuthHeaders(),
  }),

  createPipelineConnection: (pipelineId: number, connection: { fromStageId: number; toStageId: number }) => apiRequest(`/deal-pipelines/${pipelineId}/connections`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(connection),
  }),

  deletePipelineConnection: (pipelineId: number, connectionId: number) => apiRequest(`/deal-pipelines/${pipelineId}/connections/${connectionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// User Roles API functions
export const userRolesApi = {
  // Get all user roles
  getUserRoles: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/user-roles${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a user role
  createUserRole: (role: any) => apiRequest('/user-roles', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(role),
  }),

  // Update a user role
  updateUserRole: (id: number, role: any) => apiRequest(`/user-roles/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(role),
  }),

  // Delete a user role
  deleteUserRole: (id: number) => apiRequest(`/user-roles/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Access Controls API functions
export const accessControlsApi = {
  // Get all access controls
  getAccessControls: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/access-controls${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create an access control
  createAccessControl: (accessControl: any) => apiRequest('/access-controls', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(accessControl),
  }),

  // Update an access control
  updateAccessControl: (id: number, accessControl: any) => apiRequest(`/access-controls/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(accessControl),
  }),

  // Delete an access control
  deleteAccessControl: (id: number) => apiRequest(`/access-controls/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Check drag-drop permission
  checkDragDropPermission: (resource: string, fromStageId: number, toStageId: number, pipelineId?: number | null) => apiRequest('/access-controls/check-drag-drop', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ resource, fromStageId, toStageId, pipelineId }),
  }),
};

// Security API functions
export const securitiesApi = {
  // Get all security settings
  getSecurities: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/securities${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a security setting
  createSecurity: (security: any) => apiRequest('/securities', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(security),
  }),

  // Update a security setting
  updateSecurity: (id: number, security: any) => apiRequest(`/securities/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(security),
  }),

  // Delete a security setting
  deleteSecurity: (id: number) => apiRequest(`/securities/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Custom Fields API functions
export const customFieldsApi = {
  // Get all custom fields
  getCustomFields: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/custom-fields${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a custom field
  createCustomField: (field: any) => apiRequest('/custom-fields', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(field),
  }),

  // Update a custom field
  updateCustomField: (id: number, field: any) => apiRequest(`/custom-fields/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(field),
  }),

  // Delete a custom field
  deleteCustomField: (id: number) => apiRequest(`/custom-fields/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Analytical Reports API functions
export const analyticalReportsApi = {
  // Get all analytical reports
  getAnalyticalReports: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/analytical-reports${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create an analytical report
  createAnalyticalReport: (report: any) => apiRequest('/analytical-reports', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(report),
  }),

  // Update an analytical report
  updateAnalyticalReport: (id: number, report: any) => apiRequest(`/analytical-reports/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(report),
  }),

  // Delete an analytical report
  deleteAnalyticalReport: (id: number) => apiRequest(`/analytical-reports/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Auto-Numbering API functions
export const autoNumberingApi = {
  // Get all auto-numbering settings
  getAutoNumberings: (companyId?: number, branchId?: number, entity?: string) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (entity) params.append('entity', entity);
    const query = params.toString();
    return apiRequest(`/auto-numbering${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create an auto-numbering setting
  createAutoNumbering: (setting: any) => apiRequest('/auto-numbering', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(setting),
  }),

  // Update an auto-numbering setting
  updateAutoNumbering: (id: number, setting: any) => apiRequest(`/auto-numbering/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(setting),
  }),

  // Delete an auto-numbering setting
  deleteAutoNumbering: (id: number) => apiRequest(`/auto-numbering/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Get next number for an entity
  getNextNumber: (entity: string) => apiRequest(`/auto-numbering/next/${entity}`, {
    headers: getAuthHeaders(),
  }),
};

// Permission Settings API functions
export const permissionSettingsApi = {
  // Get all permission settings
  getPermissionSettings: (companyId?: number, branchId?: number, roleId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (roleId) params.append('roleId', roleId.toString());
    const query = params.toString();
    return apiRequest(`/permission-settings${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get permission settings matrix
  getPermissionSettingsMatrix: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/permission-settings/matrix${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Upsert permission settings (bulk)
  upsertPermissionSettings: (roleId: number, permissions: any[]) => apiRequest('/permission-settings/upsert', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ roleId, permissions }),
  }),

  // Delete a permission setting
  deletePermissionSetting: (id: number) => apiRequest(`/permission-settings/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Get roles
  getRoles: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/user-roles${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get hierarchical permissions for a role
  getHierarchicalPermissions: (roleId: number, companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    params.append('roleId', roleId.toString());
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    return apiRequest(`/permission-settings/hierarchical?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
  },

  // Upsert hierarchical permissions
  upsertHierarchicalPermissions: (roleId: number, permissions: any[]) => apiRequest('/permission-settings/hierarchical/upsert', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ roleId, permissions }),
  }),

  // Check if user has permission for a resource path
  checkResourcePermission: (
    resourcePath: string,
    opts?: { action?: 'add' | 'write' | 'edit' }
  ) => {
    const params = new URLSearchParams();
    params.append('resourcePath', resourcePath);
    if (opts?.action) params.append('action', opts.action);
    return apiRequest(`/permission-settings/check?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
  },

  // Batched form of checkResourcePermission — one request for many paths
  // instead of one request per path. Use this whenever checking more than a
  // handful of resources at once (e.g. filtering the whole menu by permission)
  // to avoid tripping the global request-rate limiter.
  checkResourcePermissionsBatch: (resourcePaths: string[]) => apiRequest(`/permission-settings/check-batch`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ resourcePaths }),
  }),
};

// Business Processes API functions
export const businessProcessesApi = {
  // Get all business processes
  getBusinessProcesses: (companyId?: number, branchId?: number, status?: string) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (status) params.append('status', status);
    const query = params.toString();
    return apiRequest(`/business-processes${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single business process
  getBusinessProcess: (id: number) => apiRequest(`/business-processes/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a business process
  createBusinessProcess: (process: any) => apiRequest('/business-processes', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(process),
  }),

  // Update a business process
  updateBusinessProcess: (id: number, process: any) => apiRequest(`/business-processes/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(process),
  }),

  // Toggle business process (activate/deactivate)
  toggleBusinessProcess: (id: number, isActive: boolean) => apiRequest(`/business-processes/${id}/toggle`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ isActive }),
  }),

  // Delete a business process
  deleteBusinessProcess: (id: number) => apiRequest(`/business-processes/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Email Templates API functions
export const emailTemplatesApi = {
  // Get all email templates
  getEmailTemplates: (companyId?: number, branchId?: number, category?: string, isActive?: boolean) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (category) params.append('category', category);
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    const query = params.toString();
    return apiRequest(`/email-templates${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single email template
  getEmailTemplate: (id: number) => apiRequest(`/email-templates/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create an email template
  createEmailTemplate: (template: any) => apiRequest('/email-templates', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(template),
  }),

  // Update an email template
  updateEmailTemplate: (id: number, template: any) => apiRequest(`/email-templates/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(template),
  }),

  // Delete an email template
  deleteEmailTemplate: (id: number) => apiRequest(`/email-templates/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Toggle email template active status
  toggleEmailTemplate: (id: number) => apiRequest(`/email-templates/${id}/toggle`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }),

  // Duplicate an email template
  duplicateEmailTemplate: (id: number) => apiRequest(`/email-templates/${id}/duplicate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }),
};

// SMTP Settings API functions
export const smtpSettingsApi = {
  // Get all SMTP settings
  getSmtpSettings: (companyId?: number, branchId?: number, isActive?: boolean) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    const query = params.toString();
    return apiRequest(`/smtp-settings${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single SMTP setting
  getSmtpSetting: (id: number) => apiRequest(`/smtp-settings/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create an SMTP setting
  createSmtpSetting: (setting: any) => apiRequest('/smtp-settings', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(setting),
  }),

  // Update an SMTP setting
  updateSmtpSetting: (id: number, setting: any) => apiRequest(`/smtp-settings/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(setting),
  }),

  // Delete an SMTP setting
  deleteSmtpSetting: (id: number) => apiRequest(`/smtp-settings/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Toggle SMTP setting active status
  toggleSmtpSetting: (id: number) => apiRequest(`/smtp-settings/${id}/toggle`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }),

  // Test SMTP connection
  testSmtpConnection: (id: number) => apiRequest(`/smtp-settings/${id}/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }),
};

// Mail API
export const mailApi = {
  // Get all mails
  getMails: (params?: {
    folder?: string;
    isRead?: boolean;
    isStarred?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.folder) queryParams.append('folder', params.folder);
    if (params?.isRead !== undefined) queryParams.append('isRead', params.isRead.toString());
    if (params?.isStarred !== undefined) queryParams.append('isStarred', params.isStarred.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return apiRequest(`/mail${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get mail by ID
  getMailById: (id: number) => apiRequest(`/mail/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Send mail
  sendMail: (mail: {
    toEmail: string;
    toName?: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    smtpSettingId?: number;
    inReplyTo?: number;
  }) => apiRequest('/mail/send', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(mail),
  }),

  // Save draft
  saveDraft: (draft: {
    id?: number;
    toEmail?: string;
    toName?: string;
    subject?: string;
    body?: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    inReplyTo?: number;
  }) => apiRequest('/mail/draft', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(draft),
  }),

  // Update mail
  updateMail: (id: number, updates: {
    isRead?: boolean;
    isStarred?: boolean;
    isImportant?: boolean;
    folder?: string;
    labels?: string[];
  }) => apiRequest(`/mail/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  }),

  // Bulk update mails
  bulkUpdateMails: (updates: {
    mailIds: number[];
    isRead?: boolean;
    isStarred?: boolean;
    folder?: string;
    labels?: string[];
  }) => apiRequest('/mail/bulk-update', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  }),

  // Delete mail
  deleteMail: (id: number) => apiRequest(`/mail/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Get mail accounts (SMTP settings)
  getMailAccounts: () => apiRequest('/mail/accounts', {
    headers: getAuthHeaders(),
  }),

  // Get mail counts by folder and labels
  getMailCounts: () => apiRequest('/mail/counts', {
    headers: getAuthHeaders(),
  }),

  // Fetch emails from IMAP server
  fetchEmails: (smtpSettingId: number) => apiRequest('/mail/fetch', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ smtpSettingId }),
  }),

  // Test IMAP connection
  testImapConnection: (smtpSettingId: number) => apiRequest('/mail/test-imap', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ smtpSettingId }),
  }),
};

// Email Notifications API functions
export const emailNotificationsApi = {
  // Get all email notifications
  getEmailNotifications: (companyId?: number, branchId?: number, type?: string, isActive?: boolean, frequency?: string) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (type) params.append('type', type);
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    if (frequency) params.append('frequency', frequency);
    const query = params.toString();
    return apiRequest(`/email-notifications${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single email notification
  getEmailNotification: (id: number) => apiRequest(`/email-notifications/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create an email notification
  createEmailNotification: (notification: any) => apiRequest('/email-notifications', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(notification),
  }),

  // Update an email notification
  updateEmailNotification: (id: number, notification: any) => apiRequest(`/email-notifications/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(notification),
  }),

  // Delete an email notification
  deleteEmailNotification: (id: number) => apiRequest(`/email-notifications/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Toggle email notification active status
  toggleEmailNotification: (id: number) => apiRequest(`/email-notifications/${id}/toggle`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }),

  // Duplicate an email notification
  duplicateEmailNotification: (id: number) => apiRequest(`/email-notifications/${id}/duplicate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }),
};

export const emailSignaturesApi = {
  // Get all email signatures
  getEmailSignatures: (companyId?: number, branchId?: number, userId?: number, isActive?: boolean, isDefault?: boolean) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (userId) params.append('userId', userId.toString());
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    if (isDefault !== undefined) params.append('isDefault', isDefault.toString());
    const query = params.toString();
    return apiRequest(`/email-signatures${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single email signature
  getEmailSignature: (id: number) => apiRequest(`/email-signatures/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create an email signature
  createEmailSignature: (signature: any) => apiRequest('/email-signatures', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(signature),
  }),

  // Update an email signature
  updateEmailSignature: (id: number, signature: any) => apiRequest(`/email-signatures/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(signature),
  }),

  // Delete an email signature
  deleteEmailSignature: (id: number) => apiRequest(`/email-signatures/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Toggle active status
  toggleEmailSignature: (id: number) => apiRequest(`/email-signatures/${id}/toggle`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }),

  // Duplicate an email signature
  duplicateEmailSignature: (id: number) => apiRequest(`/email-signatures/${id}/duplicate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }),
};

export const formTemplatesApi = {
  // Get all form templates
  getFormTemplates: (companyId?: number, branchId?: number, entityType?: string, isActive?: boolean) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (entityType) params.append('entityType', entityType);
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    const query = params.toString();
    return apiRequest(`/form-templates${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single form template
  getFormTemplate: (id: number) => apiRequest(`/form-templates/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Get form template by path
  getFormTemplateByPath: (path: string) => apiRequest(`/form-templates/path/${path}`, {
    headers: getAuthHeaders(),
  }),

  // Create a form template
  createFormTemplate: (template: any) => apiRequest('/form-templates', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(template),
  }),

  // Update a form template
  updateFormTemplate: (id: number, template: any) => apiRequest(`/form-templates/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(template),
  }),

  // Delete a form template
  deleteFormTemplate: (id: number) => apiRequest(`/form-templates/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Toggle active status
  toggleFormTemplate: (id: number) => apiRequest(`/form-templates/${id}/toggle`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  }),

  // Duplicate a form template
  duplicateFormTemplate: (id: number) => apiRequest(`/form-templates/${id}/duplicate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }),

  // Get available database models
  getDatabaseModels: () => apiRequest('/form-templates/models', {
    headers: getAuthHeaders(),
  }),

  // Get data from a specific model
  getModelData: (modelName: string, displayField?: string, valueField?: string, filter?: any) => {
    const params = new URLSearchParams();
    if (displayField) params.append('displayField', displayField);
    if (valueField) params.append('valueField', valueField);
    if (filter) params.append('filter', JSON.stringify(filter));
    const query = params.toString();
    return apiRequest(`/form-templates/models/${modelName}/data${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },
};

// Invoice Stages API functions
export const invoiceStagesApi = {
  // Get all invoice stages
  getInvoiceStages: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/invoice-stages${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create an invoice stage
  createInvoiceStage: (stage: any) => apiRequest('/invoice-stages', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Update an invoice stage
  updateInvoiceStage: (id: number, stage: any) => apiRequest(`/invoice-stages/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Delete an invoice stage
  deleteInvoiceStage: (id: number) => apiRequest(`/invoice-stages/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder invoice stages
  reorderInvoiceStages: (stages: Array<{ id: number; order: number }>) => apiRequest('/invoice-stages/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ stages }),
  }),
};

// Estimate Stages API functions
export const estimateStagesApi = {
  // Get all estimate stages
  getEstimateStages: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/estimate-stages${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create an estimate stage
  createEstimateStage: (stage: any) => apiRequest('/estimate-stages', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Update an estimate stage
  updateEstimateStage: (id: number, stage: any) => apiRequest(`/estimate-stages/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(stage),
  }),

  // Delete an estimate stage
  deleteEstimateStage: (id: number) => apiRequest(`/estimate-stages/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder estimate stages
  reorderEstimateStages: (stages: Array<{ id: number; order: number }>) => apiRequest('/estimate-stages/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ stages }),
  }),
};

// Sources API functions
export const sourcesApi = {
  // Get all sources
  getSources: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/sources${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a source
  createSource: (source: any) => apiRequest('/sources', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(source),
  }),

  // Update a source
  updateSource: (id: number, source: any) => apiRequest(`/sources/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(source),
  }),

  // Delete a source
  deleteSource: (id: number) => apiRequest(`/sources/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder sources
  reorderSources: (sources: Array<{ id: number; order: number }>) => apiRequest('/sources/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ sources }),
  }),
};

// Contact Types API functions
export const contactTypesApi = {
  // Get all contact types
  getContactTypes: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/contact-types${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a contact type
  createContactType: (contactType: any) => apiRequest('/contact-types', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(contactType),
  }),

  // Update a contact type
  updateContactType: (id: number, contactType: any) => apiRequest(`/contact-types/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(contactType),
  }),

  // Delete a contact type
  deleteContactType: (id: number) => apiRequest(`/contact-types/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder contact types
  reorderContactTypes: (contactTypes: Array<{ id: number; order: number }>) => apiRequest('/contact-types/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ contactTypes }),
  }),
};

// Salutations API functions
export const salutationsApi = {
  // Get all salutations
  getSalutations: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/salutations${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a salutation
  createSalutation: (salutation: any) => apiRequest('/salutations', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(salutation),
  }),

  // Update a salutation
  updateSalutation: (id: number, salutation: any) => apiRequest(`/salutations/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(salutation),
  }),

  // Delete a salutation
  deleteSalutation: (id: number) => apiRequest(`/salutations/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder salutations
  reorderSalutations: (salutations: Array<{ id: number; order: number }>) => apiRequest('/salutations/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ salutations }),
  }),
};

// Call Statuses API functions
export const callStatusesApi = {
  // Get all call statuses
  getCallStatuses: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/call-statuses${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a call status
  createCallStatus: (callStatus: any) => apiRequest('/call-statuses', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(callStatus),
  }),

  // Update a call status
  updateCallStatus: (id: number, callStatus: any) => apiRequest(`/call-statuses/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(callStatus),
  }),

  // Delete a call status
  deleteCallStatus: (id: number) => apiRequest(`/call-statuses/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder call statuses
  reorderCallStatuses: (callStatuses: Array<{ id: number; order: number }>) => apiRequest('/call-statuses/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ callStatuses }),
  }),
};

// Company Types API functions
export const companyTypesApi = {
  // Get all company types
  getCompanyTypes: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/company-types${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a company type
  createCompanyType: (companyType: any) => apiRequest('/company-types', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(companyType),
  }),

  // Update a company type
  updateCompanyType: (id: number, companyType: any) => apiRequest(`/company-types/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(companyType),
  }),

  // Delete a company type
  deleteCompanyType: (id: number) => apiRequest(`/company-types/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder company types
  reorderCompanyTypes: (companyTypes: Array<{ id: number; order: number }>) => apiRequest('/company-types/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ companyTypes }),
  }),
};

// Employees API functions
export const employeesApi = {
  // Get all employees
  getEmployees: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/employees${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create an employee
  createEmployee: (employee: any) => apiRequest('/employees', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(employee),
  }),

  // Update an employee
  updateEmployee: (id: number, employee: any) => apiRequest(`/employees/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(employee),
  }),

  // Delete an employee
  deleteEmployee: (id: number) => apiRequest(`/employees/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder employees
  reorderEmployees: (employees: Array<{ id: number; order: number }>) => apiRequest('/employees/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ employees }),
  }),
};

// Industries API functions
export const industriesApi = {
  // Get all industries
  getIndustries: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/industries${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create an industry
  createIndustry: (industry: any) => apiRequest('/industries', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(industry),
  }),

  // Update an industry
  updateIndustry: (id: number, industry: any) => apiRequest(`/industries/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(industry),
  }),

  // Delete an industry
  deleteIndustry: (id: number) => apiRequest(`/industries/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder industries
  reorderIndustries: (industries: Array<{ id: number; order: number }>) => apiRequest('/industries/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ industries }),
  }),
};

// Deal Types API functions
export const dealTypesApi = {
  // Get all deal types
  getDealTypes: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/deal-types${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a deal type
  createDealType: (dealType: any) => apiRequest('/deal-types', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(dealType),
  }),

  // Update a deal type
  updateDealType: (id: number, dealType: any) => apiRequest(`/deal-types/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(dealType),
  }),

  // Delete a deal type
  deleteDealType: (id: number) => apiRequest(`/deal-types/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Reorder deal types
  reorderDealTypes: (dealTypes: Array<{ id: number; order: number }>) => apiRequest('/deal-types/reorder', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ dealTypes }),
  }),
};

// Entity Activities and Comments API functions
// Entity Data API functions (for form submissions)
export const entityDataApi = {
  // Create entity data
  createEntityData: (entityData: { entityType: string; templateId?: number; data: any; customEntityName?: string }) => apiRequest('/entities/data', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(entityData),
  }),

  // Update entity data
  updateEntityData: (id: number, data: any) => apiRequest(`/entities/data/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ data }),
  }),

  // Get entity data by ID
  getEntityData: (id: number) => apiRequest(`/entities/data/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Get all entity data by type
  getEntityDataByType: (entityType: string, params?: { companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    const query = searchParams.toString();
    return apiRequest(`/entities/data/type/${entityType}${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Delete entity data
  deleteEntityData: (id: number) => apiRequest(`/entities/data/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Custom Entity Pages API
export const customEntityPageApi = {
  // Get all custom entity pages
  getCustomEntityPages: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    return apiRequest(`/custom-entity-pages${params.toString() ? `?${params.toString()}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },
  
  // Get custom entity page by slug
  getCustomEntityPageBySlug: (slug: string, companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    return apiRequest(`/custom-entity-pages/${slug}${params.toString() ? `?${params.toString()}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },
};

export const entityApi = {
  // Get activities for an entity
  getActivities: (entityType: string, entityId: number) => 
    apiRequest(`/entities/${entityType.toLowerCase()}/${entityId}/activities`, {
      headers: getAuthHeaders(),
    }),

  // Create activity for an entity
  createActivity: (entityType: string, entityId: number, activity: { type: string; message: string }) =>
    apiRequest(`/entities/${entityType.toLowerCase()}/${entityId}/activities`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(activity),
    }),

  // Get comments for an entity
  getComments: (entityType: string, entityId: number) =>
    apiRequest(`/entities/${entityType.toLowerCase()}/${entityId}/comments`, {
      headers: getAuthHeaders(),
    }),

  // Create comment for an entity
  createComment: (entityType: string, entityId: number, text: string) =>
    apiRequest(`/entities/${entityType.toLowerCase()}/${entityId}/comments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text }),
    }),

  // Delete comment
  deleteComment: (entityType: string, entityId: number, commentId: number) =>
    apiRequest(`/entities/${entityType.toLowerCase()}/${entityId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),
};

export const settingsApi = {
  // Get user settings
  getUserSettings: (userId: number) => apiRequest(`/settings/${userId}`, {
    headers: getAuthHeaders(),
  }),

  // Get the current (authenticated) user's settings — matches the backend's
  // `GET /settings` (CurrentUser-scoped, backend/src/modules/user-settings).
  getCurrentSettings: () => apiRequest(`/settings`, {
    headers: getAuthHeaders(),
  }),

  // Update the current (authenticated) user's settings — matches the backend's
  // `PATCH /settings`, a generic upsert of whatever keys are passed (e.g.
  // `tablePreferences`). Used by the Workspace store for cross-device persistence.
  updateCurrentSettings: (data: Record<string, any>) => apiRequest(`/settings`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Update profile settings
  updateProfile: (userId: number, data: {
    username?: string;
    email?: string;
    bio?: string;
    urls?: string[];
    avatar?: string;
    skills?: string[];
  }) => apiRequest(`/settings/${userId}/profile`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Update account settings
  updateAccount: (userId: number, data: {
    name?: string;
    dob?: string | Date;
    language?: string;
  }) => apiRequest(`/settings/${userId}/account`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Update billing settings
  updateBilling: (userId: number, data: {
    billingPlan?: string;
    nextPaymentDate?: string | Date;
    paymentMethods?: any;
  }) => apiRequest(`/settings/${userId}/billing`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Get billing transactions
  getBillingTransactions: (userId: number) => apiRequest(`/settings/${userId}/billing/transactions`),

  // Update appearance settings
  updateAppearance: (userId: number, data: {
    theme?: string;
    font?: string;
  }) => apiRequest(`/settings/${userId}/appearance`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Update notification settings
  updateNotifications: (userId: number, data: {
    type?: string;
    mobile?: boolean;
    communication_emails?: boolean;
    social_emails?: boolean;
    marketing_emails?: boolean;
    security_emails?: boolean;
  }) => apiRequest(`/settings/${userId}/notifications`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Update display settings
  updateDisplay: (userId: number, data: {
    items?: string[];
  }) => apiRequest(`/settings/${userId}/display`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Update table preferences (column visibility, etc.)
  updateTablePreferences: (userId: number, tableName: string, preferences: Record<string, boolean>) => apiRequest(`/settings/${userId}/table-preferences`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tableName, preferences }),
  }),
};

// Upload API functions
export const uploadApi = {
  // Upload a single file
  uploadSingle: async (file: File, userId?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    if (userId) {
      formData.append('userId', userId.toString());
    }

    const url = `${API_BASE_URL}/upload/single`;
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        // Don't set Content-Type for FormData - browser will set it with boundary
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `Upload failed: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        if (errorData.details) {
          errorMessage += ` - ${errorData.details}`;
        }
      } catch {
        // If response is not JSON, use status text
      }
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      throw error;
    }

    return response.json();
  },
};

// Feed API functions
export const feedApi = {
  // Get all feed posts
  getFeedPosts: (companyId?: number, branchId?: number, userId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (userId) params.append('userId', userId.toString());
    const query = params.toString();
    return apiRequest(`/feed${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single feed post
  getFeedPost: (id: number) => apiRequest(`/feed/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a feed post
  createFeedPost: (post: { content: string; image?: string; userId: number; companyId?: number; branchId?: number }) => 
    apiRequest('/feed', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(post),
    }),

  // Update a feed post
  updateFeedPost: (id: number, post: { content?: string; image?: string }) => 
    apiRequest(`/feed/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(post),
    }),

  // Delete a feed post
  deleteFeedPost: (id: number) => apiRequest(`/feed/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Like/unlike a feed post
  likeFeedPost: (postId: number, userId: number) => 
    apiRequest(`/feed/${postId}/like`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    }),

  // Add a comment to a feed post
  addFeedComment: (postId: number, comment: { text: string; userId: number }) => 
    apiRequest(`/feed/${postId}/comments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(comment),
    }),

  // Delete a comment
  deleteFeedComment: (commentId: number) => 
    apiRequest(`/feed/comments/${commentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),
};

// Notifications API functions
export const notificationsApi = {
  // Get all notifications for a user
  getNotifications: (userId: number, isRead?: boolean) => {
    const params = new URLSearchParams();
    params.append('userId', userId.toString());
    if (isRead !== undefined) params.append('isRead', isRead.toString());
    return apiRequest(`/notifications?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get unread notification count
  getUnreadCount: (userId: number) => {
    const params = new URLSearchParams();
    params.append('userId', userId.toString());
    return apiRequest(`/notifications/unread-count?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
  },

  // Mark notification as read
  markAsRead: (notificationId: number) => 
    apiRequest(`/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    }),

  // Mark all notifications as read
  markAllAsRead: (userId: number) => 
    apiRequest('/notifications/mark-all-read', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    }),

  // Delete a notification
  deleteNotification: (notificationId: number) => 
    apiRequest(`/notifications/${notificationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),
};

// Collabs API functions
export const collabsApi = {
  // Get all collabs
  getCollabs: (companyId?: number, branchId?: number, userId?: number, status?: string) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (userId) params.append('userId', userId.toString());
    if (status) params.append('status', status);
    const query = params.toString();
    return apiRequest(`/collabs${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single collab
  getCollab: (id: number) => apiRequest(`/collabs/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a collab
  createCollab: (collab: { name: string; description?: string; createdById: number; companyId?: number; branchId?: number; status?: string }) => 
    apiRequest('/collabs', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(collab),
    }),

  // Update a collab
  updateCollab: (id: number, collab: { name?: string; description?: string; status?: string }) => 
    apiRequest(`/collabs/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(collab),
    }),

  // Delete a collab
  deleteCollab: (id: number) => apiRequest(`/collabs/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Add a member to a collab
  addCollabMember: (collabId: number, member: { userId?: number; email: string; name?: string; role?: string; isExternal?: boolean }) => 
    apiRequest(`/collabs/${collabId}/members`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(member),
    }),

  // Update a collab member
  updateCollabMember: (memberId: number, member: { role?: string }) => 
    apiRequest(`/collabs/members/${memberId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(member),
    }),

  // Remove a collab member
  removeCollabMember: (memberId: number) => 
    apiRequest(`/collabs/members/${memberId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),

  // Send an invitation
  sendInvitation: (collabId: number, invitation: { email: string; name?: string; role?: string; invitedById: number }) => 
    apiRequest(`/collabs/${collabId}/invitations`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(invitation),
    }),

  // Accept an invitation
  acceptInvitation: (token: string) => 
    apiRequest('/collabs/invitations/accept', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ token }),
    }),

  // Reject an invitation
  rejectInvitation: (token: string) => 
    apiRequest('/collabs/invitations/reject', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ token }),
    }),

  // Cancel an invitation
  cancelInvitation: (invitationId: number) => 
    apiRequest(`/collabs/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),

  // Resend an invitation
  resendInvitation: (invitationId: number) => 
    apiRequest(`/collabs/invitations/${invitationId}/resend`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }),
};

// Work Groups API functions
export const workGroupsApi = {
  // Get all work groups
  getWorkGroups: (companyId?: number, branchId?: number, userId?: number, status?: string) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (userId) params.append('userId', userId.toString());
    if (status) params.append('status', status);
    const query = params.toString();
    return apiRequest(`/work-groups${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single work group
  getWorkGroup: (id: number) => apiRequest(`/work-groups/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a work group
  createWorkGroup: (workGroup: { name: string; description?: string; createdById: number; companyId?: number; branchId?: number; status?: string }) => 
    apiRequest('/work-groups', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(workGroup),
    }),

  // Update a work group
  updateWorkGroup: (id: number, workGroup: { name?: string; description?: string; status?: string }) => 
    apiRequest(`/work-groups/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(workGroup),
    }),

  // Delete a work group
  deleteWorkGroup: (id: number) => apiRequest(`/work-groups/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Get available users to add
  getAvailableUsers: (workGroupId: number, companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    const query = params.toString();
    return apiRequest(`/work-groups/${workGroupId}/available-users${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Add a member to a work group
  addWorkGroupMember: (workGroupId: number, member: { userId: number; role?: string }) => 
    apiRequest(`/work-groups/${workGroupId}/members`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(member),
    }),

  // Update a work group member
  updateWorkGroupMember: (memberId: number, member: { role?: string }) => 
    apiRequest(`/work-groups/members/${memberId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(member),
    }),

  // Remove a work group member
  removeWorkGroupMember: (memberId: number) => 
    apiRequest(`/work-groups/members/${memberId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),
};

// Documents API functions
export const documentsApi = {
  // Get all documents
  getDocuments: (type?: string, companyId?: number, branchId?: number, userId?: number) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    if (userId) params.append('userId', userId.toString());
    const query = params.toString();
    return apiRequest(`/documents${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single document
  getDocument: (id: string) =>
    apiRequest(`/documents/${id}`, {
      headers: getAuthHeaders(),
    }),

  // Create a Word document
  createWordDocument: (data: { name?: string; userId?: number; companyId?: number; branchId?: number }) =>
    apiRequest('/documents/word', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Create an Excel document
  createExcelDocument: (data: { name?: string; userId?: number; companyId?: number; branchId?: number }) =>
    apiRequest('/documents/excel', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Create a PowerPoint document
  createPowerPointDocument: (data: { name?: string; userId?: number; companyId?: number; branchId?: number }) =>
    apiRequest('/documents/powerpoint', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Create a Board document
  createBoardDocument: (data: { name?: string; userId?: number; companyId?: number; branchId?: number; initialContent?: any }) =>
    apiRequest('/documents/board', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Update a document
  updateDocument: (id: string, data: { name?: string; isShared?: boolean; isPublished?: boolean; content?: string }) =>
    apiRequest(`/documents/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Delete a document
  deleteDocument: (id: string) =>
    apiRequest(`/documents/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),

  // Download a document
  downloadDocument: (id: string) => {
    return `${API_BASE_URL}/documents/${id}/download`;
  },
};

// Calendar Events API functions
export const calendarEventsApi = {
  // Get all calendar events (optionally filtered by userId, startDate, endDate)
  getCalendarEvents: (userId?: number, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId.toString());
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    return apiRequest(`/calendar-events${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single calendar event
  getCalendarEvent: (id: string) => apiRequest(`/calendar-events/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a calendar event
  createCalendarEvent: (event: {
    title: string;
    description?: string;
    start: string | Date;
    end: string | Date;
    allDay?: boolean;
    color?: string;
    location?: string;
    userId?: number;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/calendar-events', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(event),
  }),

  // Update a calendar event
  updateCalendarEvent: (id: string, event: {
    title?: string;
    description?: string;
    start?: string | Date;
    end?: string | Date;
    allDay?: boolean;
    color?: string;
    location?: string;
    userId?: number;
    companyId?: number;
    branchId?: number;
  }) => apiRequest(`/calendar-events/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(event),
  }),

  // Delete a calendar event
  deleteCalendarEvent: (id: string) => apiRequest(`/calendar-events/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Get upcoming events for notifications
  getUpcomingEvents: (userId?: number, minutes?: number) => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId.toString());
    if (minutes) params.append('minutes', minutes.toString());
    const query = params.toString();
    return apiRequest(`/calendar-events/upcoming${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Check for upcoming events and create notifications
  checkAndCreateNotifications: () => apiRequest('/calendar-events/check-notifications', {
    method: 'POST',
    headers: getAuthHeaders(),
  }),
};

// Fitness Activities API functions
export const fitnessApi = {
  // Get all fitness activities
  getFitnessActivities: (params?: { userId?: number; companyId?: number; branchId?: number; startDate?: string; endDate?: string; type?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.type) searchParams.append('type', params.type);
    if (params?.status) searchParams.append('status', params.status);
    const query = searchParams.toString();
    return apiRequest(`/fitness${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single fitness activity
  getFitnessActivity: (id: number) => apiRequest(`/fitness/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a fitness activity
  createFitnessActivity: (activity: {
    title: string;
    description?: string;
    type: string;
    status?: string;
    startTime: string | Date;
    endTime?: string | Date;
    duration?: number;
    distance?: number;
    calories?: number;
    heartRate?: number;
    notes?: string;
    userId: number;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/fitness', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(activity),
  }),

  // Update a fitness activity
  updateFitnessActivity: (id: number, activity: {
    title?: string;
    description?: string;
    type?: string;
    status?: string;
    startTime?: string | Date;
    endTime?: string | Date;
    duration?: number;
    distance?: number;
    calories?: number;
    heartRate?: number;
    notes?: string;
  }) => apiRequest(`/fitness/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(activity),
  }),

  // Delete a fitness activity
  deleteFitnessActivity: (id: number) => apiRequest(`/fitness/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Get today's workouts for a user
  getTodayWorkouts: (userId: number) => apiRequest(`/fitness/today?userId=${userId}`, {
    headers: getAuthHeaders(),
  }),
};

// Nutrition API functions
export const nutritionApi = {
  // Get all nutrition entries
  getNutritionEntries: (params?: { userId?: number; companyId?: number; branchId?: number; startDate?: string; endDate?: string; date?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.date) searchParams.append('date', params.date);
    const query = searchParams.toString();
    return apiRequest(`/nutrition${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get today's nutrition for a user
  getTodayNutrition: (userId: number) => apiRequest(`/nutrition/today?userId=${userId}`, {
    headers: getAuthHeaders(),
  }),

  // Get a single nutrition entry
  getNutritionEntry: (id: number) => apiRequest(`/nutrition/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create or update nutrition entry
  upsertNutritionEntry: (entry: {
    userId: number;
    date: string | Date;
    calories: number;
    carbs: number;
    protein: number;
    fats: number;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/nutrition', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(entry),
  }),

  // Update nutrition entry
  updateNutritionEntry: (id: number, entry: {
    calories?: number;
    carbs?: number;
    protein?: number;
    fats?: number;
  }) => apiRequest(`/nutrition/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(entry),
  }),

  // Delete nutrition entry
  deleteNutritionEntry: (id: number) => apiRequest(`/nutrition/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Sleep API functions
export const sleepApi = {
  // Get all sleep records
  getSleepRecords: (params?: { userId?: number; companyId?: number; branchId?: number; startDate?: string; endDate?: string; date?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.date) searchParams.append('date', params.date);
    const query = searchParams.toString();
    return apiRequest(`/sleep${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get today's sleep for a user
  getTodaySleep: (userId: number) => apiRequest(`/sleep/today?userId=${userId}`, {
    headers: getAuthHeaders(),
  }),

  // Get a single sleep record
  getSleepRecord: (id: number) => apiRequest(`/sleep/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create or update sleep record
  upsertSleepRecord: (record: {
    userId: number;
    date: string | Date;
    sleepHours: number;
    sleepMinutes?: number;
    quality: number;
    bedTime?: string | Date;
    wakeTime?: string | Date;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/sleep', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(record),
  }),

  // Update sleep record
  updateSleepRecord: (id: number, record: {
    sleepHours?: number;
    sleepMinutes?: number;
    quality?: number;
    bedTime?: string | Date;
    wakeTime?: string | Date;
  }) => apiRequest(`/sleep/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(record),
  }),

  // Delete sleep record
  deleteSleepRecord: (id: number) => apiRequest(`/sleep/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// E-commerce APIs
export const productApi = {
  // Get all products
  getProducts: (params?: { status?: string; category?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.category) searchParams.append('category', params.category);
    if (params?.search) searchParams.append('search', params.search);
    const query = searchParams.toString();
    return apiRequest(`/products${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get product by ID
  getProductById: (id: number) => apiRequest(`/products/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Get best selling products
  getBestSellingProducts: (limit?: number) => {
    const searchParams = new URLSearchParams();
    if (limit) searchParams.append('limit', limit.toString());
    const query = searchParams.toString();
    return apiRequest(`/products/bestselling${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create product
  createProduct: (product: {
    name: string;
    description?: string;
    image?: string;
    sku?: string;
    price: number;
    cost?: number;
    quantity?: number;
    category?: string;
    brand?: string;
    status?: string;
    chargeTax?: boolean;
    taxPercentage?: number;
    discountType?: string;
    discountValue?: number;
    discountedPrice?: number;
    companyId?: number;
    branchId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (product.companyId) searchParams.append('companyId', product.companyId.toString());
    if (product.branchId) searchParams.append('branchId', product.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...productData } = product;
    return apiRequest(`/products${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(productData),
    });
  },

  // Update product
  updateProduct: (id: number, product: {
    name?: string;
    description?: string;
    image?: string;
    sku?: string;
    price?: number;
    cost?: number;
    quantity?: number;
    category?: string;
    brand?: string;
    status?: string;
  }) => apiRequest(`/products/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(product),
  }),

  // Delete product
  deleteProduct: (id: number) => apiRequest(`/products/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

export const productCategoryApi = {
  // Get all product categories
  getProductCategories: (params?: { companyId?: number; branchId?: number; isActive?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.isActive !== undefined) searchParams.append('isActive', params.isActive.toString());
    const query = searchParams.toString();
    return apiRequest(`/product-categories${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get product category by ID
  getProductCategoryById: (id: number) => apiRequest(`/product-categories/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create product category
  createProductCategory: (category: {
    name: string;
    description?: string;
    isActive?: boolean;
    companyId?: number;
    branchId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (category.companyId) searchParams.append('companyId', category.companyId.toString());
    if (category.branchId) searchParams.append('branchId', category.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...categoryData } = category;
    return apiRequest(`/product-categories${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(categoryData),
    });
  },

  // Update product category
  updateProductCategory: (id: number, category: {
    name?: string;
    description?: string;
    isActive?: boolean;
  }) => apiRequest(`/product-categories/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(category),
  }),

  // Delete product category
  deleteProductCategory: (id: number) => apiRequest(`/product-categories/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

export const productSubCategoryApi = {
  // Get all product subcategories
  getProductSubCategories: (params?: { companyId?: number; branchId?: number; categoryId?: number; isActive?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.categoryId) searchParams.append('categoryId', params.categoryId.toString());
    if (params?.isActive !== undefined) searchParams.append('isActive', params.isActive.toString());
    const query = searchParams.toString();
    return apiRequest(`/product-subcategories${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get product subcategory by ID
  getProductSubCategoryById: (id: number) => apiRequest(`/product-subcategories/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create product subcategory
  createProductSubCategory: (subCategory: {
    name: string;
    description?: string;
    categoryId: number;
    isActive?: boolean;
  }) => apiRequest('/product-subcategories', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(subCategory),
  }),

  // Update product subcategory
  updateProductSubCategory: (id: number, subCategory: {
    name?: string;
    description?: string;
    categoryId?: number;
    isActive?: boolean;
  }) => apiRequest(`/product-subcategories/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(subCategory),
  }),

  // Delete product subcategory
  deleteProductSubCategory: (id: number) => apiRequest(`/product-subcategories/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

export const orderApi = {
  // Get all orders
  getOrders: (params?: { status?: string; type?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.type) searchParams.append('type', params.type);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const query = searchParams.toString();
    return apiRequest(`/orders${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get recent orders
  getRecentOrders: (limit?: number) => {
    const searchParams = new URLSearchParams();
    if (limit) searchParams.append('limit', limit.toString());
    const query = searchParams.toString();
    return apiRequest(`/orders/recent${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get order by ID
  getOrderById: (id: number) => apiRequest(`/orders/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Get order statistics
  getOrderStats: (params?: { startDate?: string; endDate?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    const query = searchParams.toString();
    return apiRequest(`/orders/stats${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create order
  createOrder: (order: {
    orderNumber?: string;
    customerId: number;
    status?: string;
    type?: string;
    subtotal: number;
    tax?: number;
    discount?: number;
    shippingCost?: number;
    totalAmount: number;
    currency?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    shippingAddress?: string;
    notes?: string;
    items: Array<{
      productId: number;
      quantity: number;
      price: number;
      discount?: number;
      subtotal: number;
    }>;
    companyId?: number;
    branchId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (order.companyId) searchParams.append('companyId', order.companyId.toString());
    if (order.branchId) searchParams.append('branchId', order.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...orderData } = order;
    return apiRequest(`/orders${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(orderData),
    });
  },

  // Update order
  updateOrder: (id: number, order: {
    status?: string;
    type?: string;
    subtotal?: number;
    tax?: number;
    discount?: number;
    shippingCost?: number;
    totalAmount?: number;
    paymentMethod?: string;
    paymentStatus?: string;
    shippingAddress?: string;
    notes?: string;
    shippedDate?: string | Date;
    deliveredDate?: string | Date;
  }) => apiRequest(`/orders/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(order),
  }),

  // Delete order
  deleteOrder: (id: number) => apiRequest(`/orders/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Create order return
  createOrderReturn: (orderId: number, returnData: {
    returnReason: string;
    returnReasonNote?: string;
    items: Array<{
      orderItemId: number;
      quantity: number;
      reason?: string;
      reasonNote?: string;
      condition?: string;
    }>;
    refundMethod?: string;
    notes?: string;
  }) => apiRequest(`/orders/${orderId}/return`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(returnData),
  }),

  // Process order return (approve/reject)
  processOrderReturn: (returnId: number, data: {
    approve?: boolean;
    reject?: boolean;
    refundStatus?: string;
    refundReference?: string;
  }) => apiRequest(`/orders/returns/${returnId}/process`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Get all order returns
  getOrderReturns: (params?: { status?: string; orderId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.orderId) searchParams.append('orderId', params.orderId.toString());
    const query = searchParams.toString();
    return apiRequest(`/orders/returns${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get order return by ID
  getOrderReturnById: (id: number) => apiRequest(`/orders/returns/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Update order return
  updateOrderReturn: (id: number, data: {
    status?: string;
    refundStatus?: string;
    refundReference?: string;
    notes?: string;
  }) => apiRequest(`/orders/returns/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),
};

// Table API functions
export const tableApi = {
  // Get all table categories
  getTableCategories: (params?: { companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    const query = searchParams.toString();
    return apiRequest(`/tables/categories${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get table category by ID
  getTableCategoryById: (id: number) => apiRequest(`/tables/categories/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create table category
  createTableCategory: (category: { name: string; companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (category.companyId) searchParams.append('companyId', category.companyId.toString());
    if (category.branchId) searchParams.append('branchId', category.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...categoryData } = category;
    return apiRequest(`/tables/categories${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(categoryData),
    });
  },

  // Update table category
  updateTableCategory: (id: number, category: { name?: string }) => apiRequest(`/tables/categories/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(category),
  }),

  // Delete table category
  deleteTableCategory: (id: number) => apiRequest(`/tables/categories/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),

  // Get all tables
  getTables: (params?: { companyId?: number; branchId?: number; categoryId?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.categoryId) searchParams.append('categoryId', params.categoryId.toString());
    if (params?.status) searchParams.append('status', params.status);
    const query = searchParams.toString();
    return apiRequest(`/tables${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get table by ID
  getTableById: (id: number) => apiRequest(`/tables/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create table
  createTable: (table: { name: string; status?: string; categoryId: number; companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (table.companyId) searchParams.append('companyId', table.companyId.toString());
    if (table.branchId) searchParams.append('branchId', table.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...tableData } = table;
    return apiRequest(`/tables${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(tableData),
    });
  },

  // Update table
  updateTable: (id: number, table: { name?: string; status?: string; categoryId?: number }) => apiRequest(`/tables/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(table),
  }),

  // Delete table
  deleteTable: (id: number) => apiRequest(`/tables/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Every customerApi method below hits FinanceController (nexuscore-backend/src/modules/finance),
// which is the only Customer CRUD that actually exists — there is no standalone /customers
// route. Was previously pointed at the nonexistent bare /customers path (always "Cannot GET"),
// left over from before this CRUD moved under /finance. companyId/branchId query params are
// harmlessly ignored server-side: FinanceController scopes every one of these by the
// authenticated user's own companyId/branchId (@CurrentUser()), not by client-supplied params —
// the correct, tenant-safe behavior, so they're kept here only for callers that still pass them.
export const customerApi = {
  // Get all customers
  getCustomers: (params?: { companyId?: number; branchId?: number; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.search) searchParams.append('search', params.search);
    const query = searchParams.toString();
    return apiRequest(`/finance/customers${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get new customers
  getNewCustomers: (days?: number) => {
    const searchParams = new URLSearchParams();
    if (days) searchParams.append('days', days.toString());
    const query = searchParams.toString();
    return apiRequest(`/customers/new${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get customer by ID
  getCustomerById: (id: number) => apiRequest(`/finance/customers/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create customer
  createCustomer: (customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    companyId?: number;
    branchId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (customer.companyId) searchParams.append('companyId', customer.companyId.toString());
    if (customer.branchId) searchParams.append('branchId', customer.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...customerData } = customer;
    return apiRequest(`/finance/customers${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(customerData),
    });
  },

  // Update customer — PATCH, matching FinanceController's @Patch('customers/:id') (was
  // previously sent as PUT, which that route never accepted either).
  updateCustomer: (id: number, customer: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  }) => apiRequest(`/finance/customers/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(customer),
  }),

  // Delete customer
  deleteCustomer: (id: number) => apiRequest(`/finance/customers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Customer Payment API functions
export const customerPaymentApi = {
  // Get all customer payments
  getCustomerPayments: (params?: { 
    companyId?: number; 
    branchId?: number; 
    status?: string; 
    customerId?: number; 
    orderId?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.status) searchParams.append('status', params.status);
    if (params?.customerId) searchParams.append('customerId', params.customerId.toString());
    if (params?.orderId) searchParams.append('orderId', params.orderId.toString());
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    const query = searchParams.toString();
    return apiRequest(`/customer-payments${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get customer payment by ID
  getCustomerPaymentById: (id: number) => apiRequest(`/customer-payments/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create customer payment
  createCustomerPayment: (payment: {
    customerId: number;
    orderId?: number;
    amount: number;
    paymentMethod?: string;
    status?: string;
    paymentDate?: string;
    reference?: string;
    notes?: string;
  }, params?: { companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    const query = searchParams.toString();
    return apiRequest(`/customer-payments${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payment),
    });
  },

  // Update customer payment
  updateCustomerPayment: (id: number, payment: {
    amount?: number;
    paymentMethod?: string;
    status?: string;
    paymentDate?: string;
    reference?: string;
    notes?: string;
  }) => apiRequest(`/customer-payments/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payment),
  }),

  // Delete customer payment
  deleteCustomerPayment: (id: number) => apiRequest(`/customer-payments/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Supplier Payment API functions
export const supplierPaymentApi = {
  // Get all supplier payments
  getSupplierPayments: (params?: { 
    companyId?: number; 
    branchId?: number; 
    status?: string; 
    supplierId?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.status) searchParams.append('status', params.status);
    if (params?.supplierId) searchParams.append('supplierId', params.supplierId.toString());
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    const query = searchParams.toString();
    return apiRequest(`/supplier-payments${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get supplier payment by ID
  getSupplierPaymentById: (id: number) => apiRequest(`/supplier-payments/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create supplier payment
  createSupplierPayment: (payment: {
    supplierId: number;
    amount: number;
    paymentMethod?: string;
    status?: string;
    paymentDate?: string;
    reference?: string;
    notes?: string;
  }, params?: { companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    const query = searchParams.toString();
    return apiRequest(`/supplier-payments${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payment),
    });
  },

  // Update supplier payment
  updateSupplierPayment: (id: number, payment: {
    amount?: number;
    paymentMethod?: string;
    status?: string;
    paymentDate?: string;
    reference?: string;
    notes?: string;
  }) => apiRequest(`/supplier-payments/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payment),
  }),

  // Delete supplier payment
  deleteSupplierPayment: (id: number) => apiRequest(`/supplier-payments/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// File Manager APIs
export const fileApi = {
  // Get all files
  getFiles: (params?: { companyId?: number; branchId?: number; userId?: number; folderId?: number | null; type?: string; starred?: boolean; search?: string; startDate?: string; endDate?: string; deviceType?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.folderId !== undefined) searchParams.append('folderId', params.folderId === null ? 'null' : params.folderId.toString());
    if (params?.type) searchParams.append('type', params.type);
    if (params?.starred !== undefined) searchParams.append('starred', params.starred.toString());
    if (params?.search) searchParams.append('search', params.search);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.deviceType) searchParams.append('deviceType', params.deviceType);
    const query = searchParams.toString();
    return apiRequest(`/files${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get recent files
  getRecentFiles: (params?: { companyId?: number; branchId?: number; userId?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const query = searchParams.toString();
    return apiRequest(`/files/recent${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get file by ID
  getFileById: (id: number) => apiRequest(`/files/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Get file statistics
  getFileStats: (params?: { companyId?: number; branchId?: number; userId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    const query = searchParams.toString();
    return apiRequest(`/files/stats${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create file
  createFile: (file: {
    name: string;
    originalName?: string;
    type?: string;
    mimeType?: string;
    size: number;
    url?: string;
    thumbnailUrl?: string;
    folderId?: number | null;
    starred?: boolean;
    userId?: number;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/files', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(file),
  }),

  // Update file
  updateFile: (id: number, file: {
    name?: string;
    folderId?: number | null;
    starred?: boolean;
  }) => apiRequest(`/files/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(file),
  }),

  // Delete file
  deleteFile: (id: number) => apiRequest(`/files/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

export const folderApi = {
  // Get all folders
  getFolders: (params?: { companyId?: number; branchId?: number; userId?: number; parentFolderId?: number | null; starred?: boolean; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.parentFolderId !== undefined) searchParams.append('parentFolderId', params.parentFolderId === null ? 'null' : params.parentFolderId.toString());
    if (params?.starred !== undefined) searchParams.append('starred', params.starred.toString());
    if (params?.search) searchParams.append('search', params.search);
    const query = searchParams.toString();
    return apiRequest(`/folders${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get folder by ID
  getFolderById: (id: number) => apiRequest(`/folders/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create folder
  createFolder: (folder: {
    name: string;
    parentFolderId?: number | null;
    starred?: boolean;
    userId?: number;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/folders', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(folder),
  }),

  // Update folder
  updateFolder: (id: number, folder: {
    name?: string;
    parentFolderId?: number | null;
    starred?: boolean;
  }) => apiRequest(`/folders/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(folder),
  }),

  // Delete folder
  deleteFolder: (id: number) => apiRequest(`/folders/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Project APIs
export const projectApi = {
  // Get all projects
  getProjects: (params?: { userId?: number; companyId?: number; branchId?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId.toString());
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.status) searchParams.append('status', params.status);
    const query = searchParams.toString();
    return apiRequest(`/projects${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get project by ID
  getProject: (id: number) => apiRequest(`/projects/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Get project statistics
  getProjectStats: (params?: { companyId?: number; branchId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    const query = searchParams.toString();
    return apiRequest(`/projects/stats${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get recent projects
  getRecentProjects: (params?: { companyId?: number; branchId?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const query = searchParams.toString();
    return apiRequest(`/projects/recent${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create project
  createProject: (project: {
    title: string;
    subtitle?: string;
    description?: string;
    status?: string;
    progress?: number;
    startDate?: string;
    endDate?: string;
    deadline?: string;
    budget?: number;
    spent?: number;
    clientName?: string;
    clientAvatar?: string;
    progressColor?: string;
    badgeColor?: string;
    managerId?: number;
    companyId?: number;
    branchId?: number;
    memberIds?: number[];
  }) => apiRequest('/projects', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(project),
  }),

  // Update project
  updateProject: (id: number, project: {
    title?: string;
    subtitle?: string;
    description?: string;
    status?: string;
    progress?: number;
    startDate?: string;
    endDate?: string;
    deadline?: string;
    budget?: number;
    spent?: number;
    clientName?: string;
    clientAvatar?: string;
    progressColor?: string;
    badgeColor?: string;
    managerId?: number;
    memberIds?: number[];
  }) => apiRequest(`/projects/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(project),
  }),

  // Delete project
  deleteProject: (id: number) => apiRequest(`/projects/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Reminder API functions
export const reminderApi = {
  getReminders: () => apiRequest('/reminders', {
    headers: getAuthHeaders(),
  }),
  getReminder: (id: number) => apiRequest(`/reminders/${id}`, {
    headers: getAuthHeaders(),
  }),
  createReminder: (reminder: {
    note: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    category?: string;
    dueDate?: string;
    isCompleted?: boolean;
  }) => apiRequest('/reminders', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(reminder),
  }),
  updateReminder: (id: number, reminder: {
    note?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    category?: string;
    dueDate?: string;
    isCompleted?: boolean;
  }) => apiRequest(`/reminders/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(reminder),
  }),
  deleteReminder: (id: number) => apiRequest(`/reminders/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Subscription API functions
export const subscriptionApi = {
  // Get company plan
  getCompanyPlan: (companyId: number) => apiRequest(`/subscriptions/company/${companyId}`, {
    headers: getAuthHeaders(),
  }),

  // Update company plan
  updateCompanyPlan: (companyId: number, data: { plan: string; billingCycle?: string }) => 
    apiRequest(`/subscriptions/company/${companyId}/plan`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Activate subscription
  activateSubscription: (companyId: number) => 
    apiRequest(`/subscriptions/company/${companyId}/activate`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }),
};

// Menu Items API
export const menuItemsApi = {
  // Get all menu items
  getMenuItems: (companyId?: number, branchId?: number) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId.toString());
    if (branchId) params.append('branchId', branchId.toString());
    return apiRequest(`/menu-items?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
  },

  // Create a menu item
  createMenuItem: (data: any) => 
    apiRequest('/menu-items', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Update a menu item
  updateMenuItem: (id: number, data: any) => 
    apiRequest(`/menu-items/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Delete a menu item
  deleteMenuItem: (id: number) => 
    apiRequest(`/menu-items/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),

  // Reorder menu items
  reorderMenuItems: (items: Array<{ id: number; order: number; title?: string; href?: string; icon?: string; group?: string; parentId?: number }>, companyId?: number, branchId?: number) => 
    apiRequest('/menu-items/reorder', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items, companyId, branchId }),
    }),
};

// Chat API functions
export const chatApi = {
  // Get all chats for a user
  getChats: () => {
    return apiRequest(`/chats`, {
      headers: getAuthHeaders(),
    });
  },

  // Get a single chat by ID
  getChatById: (id: number) => 
    apiRequest(`/chats/${id}`, {
      headers: getAuthHeaders(),
    }),

  // Create a new chat
  createChat: (data: {
    userId: number;
    participantIds: number[];
    type?: 'DIRECT' | 'GROUP';
    name?: string;
    companyId?: number;
    branchId?: number;
  }) => apiRequest('/chats', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Update a chat (e.g., archive/unarchive)
  updateChat: (id: number, data: { isArchived?: boolean }) => 
    apiRequest(`/chats/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Add users to a group chat
  addUsersToGroup: (chatId: number, data: { userIds: number[]; shareHistory?: boolean }) =>
    apiRequest(`/chats/${chatId}/add-users`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),
};

// Chat Message API functions
export const chatMessageApi = {
  // Get messages for a chat
  getMessages: (chatId: number, params?: { limit?: number; cursor?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.cursor) searchParams.append('cursor', params.cursor.toString());
    const query = searchParams.toString();
    return apiRequest(`/chat-messages/chat/${chatId}/messages${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Send a message
  sendMessage: (chatId: number, data: {
    content?: string;
    type?: 'text' | 'image' | 'video' | 'file' | 'audio' | 'sound';
    data?: any;
  }) => apiRequest(`/chat-messages/chat/${chatId}/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Mark messages as read
  markMessagesAsRead: (chatId: number) => 
    apiRequest(`/chat-messages/chat/${chatId}/messages/read`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    }),

  // Update a message
  updateMessage: (messageId: number, data: { content?: string }) =>
    apiRequest(`/chat-messages/${messageId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),

  // Delete a message
  deleteMessage: (messageId: number) =>
    apiRequest(`/chat-messages/${messageId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),

  // Star/Unstar a message
  starMessage: (messageId: number, starred: boolean) =>
    apiRequest(`/chat-messages/${messageId}/star`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ starred }),
    }),

  // Forward a message
  forwardMessage: (messageId: number, targetChatId: number) =>
    apiRequest(`/chat-messages/${messageId}/forward`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ targetChatId }),
    }),
};

// Chat Access API functions
export const chatAccessApi = {
  // Get all chat access permissions for current user
  getChatAccess: () => apiRequest('/chat-access', {
    headers: getAuthHeaders(),
  }),

  // Get all users that can chat with current user
  getUsersWithChatAccess: () => apiRequest('/chat-access/users', {
    headers: getAuthHeaders(),
  }),

  // Get all available users for chat access management
  getAvailableUsers: () => apiRequest('/chat-access/available', {
    headers: getAuthHeaders(),
  }),

  // Grant chat access to a user
  grantChatAccess: (targetUserId: number) => apiRequest('/chat-access/grant', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ targetUserId }),
  }),

  // Revoke chat access from a user
  revokeChatAccess: (targetUserId: number) => apiRequest('/chat-access/revoke', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ targetUserId }),
  }),

  // Grant chat access to multiple users
  bulkGrantChatAccess: (targetUserIds: number[]) => apiRequest('/chat-access/bulk-grant', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ targetUserIds }),
  }),

  // Revoke chat access from multiple users
  bulkRevokeChatAccess: (targetUserIds: number[]) => apiRequest('/chat-access/bulk-revoke', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ targetUserIds }),
  }),

  // Check if current user can chat with target user
  checkChatAccess: (targetUserId: number) => apiRequest(`/chat-access/check/${targetUserId}`, {
    headers: getAuthHeaders(),
  }),

  // Admin: Get all users with their chat access relationships
  getAllUsersWithChatAccess: () => apiRequest('/chat-access/admin/all-users', {
    headers: getAuthHeaders(),
  }),

  // Admin: Grant chat access between two users
  adminGrantChatAccess: (userId: number, targetUserId: number) => apiRequest('/chat-access/admin/grant', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ userId, targetUserId }),
  }),

  // Admin: Revoke chat access between two users
  adminRevokeChatAccess: (userId: number, targetUserId: number) => apiRequest('/chat-access/admin/revoke', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ userId, targetUserId }),
  }),
};

// Call API functions for WebRTC
export const callApi = {
  // Start a call (1-to-1 or group)
  startCall: (data: {
    participantIds: number[];
    type?: 'direct' | 'group';
    chatId?: number;
    workGroupId?: number;
    isVideoCall?: boolean;
  }) => apiRequest('/calls/start', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  }),

  // Join an existing call
  joinCall: (callId: string) => 
    apiRequest(`/calls/join/${callId}`, {
      headers: getAuthHeaders(),
    }),

  // Get call info
  getCallInfo: (callId: string) => 
    apiRequest(`/calls/${callId}`, {
      headers: getAuthHeaders(),
    }),
};

// Tasks API functions (using EntityData with entityType TASK)
export const tasksApi = {
  // Get all tasks
  getTasks: () => apiRequest('/tasks', {
    headers: getAuthHeaders(),
  }),

  // Get a single task by ID
  getTaskById: (id: string) => apiRequest(`/tasks/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create a new task
  createTask: (task: { title: string; status?: string; label?: string; priority?: string }) =>
    apiRequest('/tasks', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(task),
    }),

  // Update a task
  updateTask: (id: string, task: { title?: string; status?: string; label?: string; priority?: string }) =>
    apiRequest(`/tasks/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(task),
    }),

  // Delete a task
  deleteTask: (id: string) => apiRequest(`/tasks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// Report Template API functions
export const reportTemplateApi = {
  // Get all report templates
  getReportTemplates: (params?: { companyId?: number; branchId?: number; entityType?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.entityType) searchParams.append('entityType', params.entityType);
    const query = searchParams.toString();
    return apiRequest(`/report-templates${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get report template by ID
  getReportTemplateById: (id: number) => apiRequest(`/report-templates/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create report template
  createReportTemplate: (template: {
    name: string;
    description?: string;
    entityType: string;
    columns: Array<{ field: string; label: string; visible: boolean; order: number }>;
    filters?: any;
    sorting?: any;
    companyId?: number;
    branchId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (template.companyId) searchParams.append('companyId', template.companyId.toString());
    if (template.branchId) searchParams.append('branchId', template.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...templateData } = template;
    return apiRequest(`/report-templates${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(templateData),
    });
  },

  // Update report template
  updateReportTemplate: (id: number, template: {
    name?: string;
    description?: string;
    entityType?: string;
    columns?: Array<{ field: string; label: string; visible: boolean; order: number }>;
    filters?: any;
    sorting?: any;
  }) => apiRequest(`/report-templates/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(template),
  }),

  // Delete report template
  deleteReportTemplate: (id: number) => apiRequest(`/report-templates/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

// PDF Report API functions
export const pdfReportApi = {
  // Get all PDF reports
  getPdfReports: (params?: { companyId?: number; branchId?: number; entityType?: string; isActive?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.companyId) searchParams.append('companyId', params.companyId.toString());
    if (params?.branchId) searchParams.append('branchId', params.branchId.toString());
    if (params?.entityType) searchParams.append('entityType', params.entityType);
    if (params?.isActive !== undefined) searchParams.append('isActive', params.isActive.toString());
    const query = searchParams.toString();
    return apiRequest(`/pdf-reports${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders(),
    });
  },

  // Get PDF report by ID
  getPdfReportById: (id: number) => apiRequest(`/pdf-reports/${id}`, {
    headers: getAuthHeaders(),
  }),

  // Create PDF report
  createPdfReport: (report: {
    name: string;
    description?: string;
    entityType?: string;
    layout: any;
    pageSettings: any;
    isActive?: boolean;
    companyId?: number;
    branchId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (report.companyId) searchParams.append('companyId', report.companyId.toString());
    if (report.branchId) searchParams.append('branchId', report.branchId.toString());
    const query = searchParams.toString();
    const { companyId, branchId, ...reportData } = report;
    return apiRequest(`/pdf-reports${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(reportData),
    });
  },

  // Update PDF report
  updatePdfReport: (id: number, report: {
    name?: string;
    description?: string;
    entityType?: string;
    layout?: any;
    pageSettings?: any;
    isActive?: boolean;
  }) => apiRequest(`/pdf-reports/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(report),
  }),

  // Delete PDF report
  deletePdfReport: (id: number) => apiRequest(`/pdf-reports/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }),
};

export type DealDashboardVisibility = "PRIVATE" | "COMPANY" | "ROLES" | "USERS";

export const dealDashboardsApi = {
  list: () =>
    apiRequest(`/deal-dashboards`, {
      headers: getAuthHeaders(),
    }),

  get: (id: number) =>
    apiRequest(`/deal-dashboards/${id}`, {
      headers: getAuthHeaders(),
    }),

  create: (payload: {
    name: string;
    description?: string;
    filter: any;
    layout?: any;
    widgets?: any;
    visibility?: DealDashboardVisibility;
    sharedRoleIds?: number[];
    sharedUserIds?: number[];
  }) =>
    apiRequest(`/deal-dashboards`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }),

  update: (
    id: number,
    payload: Partial<{
      name: string;
      description?: string;
      filter: any;
      layout: any;
      widgets: any;
      visibility: DealDashboardVisibility;
      sharedRoleIds: number[];
      sharedUserIds: number[];
    }>
  ) =>
    apiRequest(`/deal-dashboards/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }),

  remove: (id: number) =>
    apiRequest(`/deal-dashboards/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    }),

  updatePrefs: (
    id: number,
    prefs: Partial<{
      order: number;
      isPinned: boolean;
      isCollapsed: boolean;
    }>
  ) =>
    apiRequest(`/deal-dashboards/${id}/prefs`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(prefs),
    }),

  reorder: (orderedIds: number[]) =>
    apiRequest(`/deal-dashboards/reorder`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ orderedIds }),
    }),
};

export const entitySchemaApi = {
  getSchema: (entityName: string) =>
    apiRequest(`/entities/schema/${encodeURIComponent(entityName)}`, { headers: getAuthHeaders() }),
  addCustomField: (data: {
    entity: string;
    name: string;
    label?: string;
    type: string;
    required?: boolean;
    options?: string[];
    companyId?: string;
    branchId?: string;
  }) =>
    apiRequest(`/entities/custom-fields`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),
  updateCustomField: (id: string, data: any) =>
    apiRequest(`/entities/custom-fields/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),
  deleteCustomField: (id: string) =>
    apiRequest(`/entities/custom-fields/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),
};

export const bpmApi = {
  taskQueue: {
    list: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiRequest(`/bpm/tasks${q}`, { headers: getAuthHeaders() });
    },
  },
  processes: {
    list: () => apiRequest(`/bpm/processes`, { headers: getAuthHeaders() }),
  },
  requestTypes: {
    list: (companyId?: string, branchId?: string) => {
      const p = new URLSearchParams();
      if (companyId) p.append('companyId', companyId);
      if (branchId) p.append('branchId', branchId);
      const q = p.toString() ? '?' + p.toString() : '';
      return apiRequest(`/bpm/request-types${q}`, { headers: getAuthHeaders() });
    },
    create: (data: any) =>
      apiRequest(`/bpm/request-types`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiRequest(`/bpm/request-types/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      apiRequest(`/bpm/request-types/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }),
  },
};