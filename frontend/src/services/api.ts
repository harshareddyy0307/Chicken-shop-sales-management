import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to handle 401 unauthenticated
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (credentials: { phone?: string; pin?: string; username?: string; password?: string }) =>
    api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPin: (phone: string) => api.post('/auth/forgot-pin', { phone }),
  resetPin: (userId: number, newPin: string) => api.post(`/auth/users/${userId}/reset-pin`, { newPin }),
  getUsers: () => api.get('/auth/users'),
  createUser: (data: any) => api.post('/auth/users', data),
  updateUser: (id: number, data: any) => api.put(`/auth/users/${id}`, data),
  toggleUserStatus: (id: number, isActive: boolean) => api.patch(`/auth/users/${id}/status`, { isActive }),
  deleteUser: (id: number, reason?: string) => api.delete(`/auth/users/${id}`, { data: { reason } }),
};

export const dashboardApi = {
  getDashboard: (params?: string | { date?: string; startDate?: string; endDate?: string; period?: string }) => {
    const p = typeof params === 'string' ? { date: params } : params;
    return api.get('/dashboard', { params: p });
  },
};

export const distributorApi = {
  getAll: (params?: any) => api.get('/distributors', { params }),
  getOne: (id: number, params?: any) => api.get(`/distributors/${id}`, { params }),
  create: (data: any) => api.post('/distributors', data),
  update: (id: number, data: any) => api.put(`/distributors/${id}`, data),
  deleteDistributor: (id: number, data?: { reason?: string }) => api.delete(`/distributors/${id}`, { data }),
  getSupplies: (params?: any) => api.get('/distributors/supplies/all', { params }),
  createSupply: (data: any) => api.post('/distributors/supplies', data),
  updateSupply: (id: number, data: any) => api.put(`/distributors/supplies/${id}`, data),
  deleteSupply: (id: number, data: { reason: string }) => api.delete(`/distributors/supplies/${id}`, { data }),
  getPayments: (params?: any) => api.get('/distributors/payments/all', { params }),
  createPayment: (data: any) => api.post('/distributors/payments', data),
  deletePayment: (id: number, data: { reason: string }) => api.delete(`/distributors/payments/${id}`, { data }),
  uploadScreenshot: (formData: FormData) =>
    api.post('/distributors/upload-screenshot', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const kathaApi = {
  getCustomers: (params?: any) => api.get('/customers/customers', { params }),
  getCustomer: (id: number, params?: any) => api.get(`/customers/customers/${id}`, { params }),
  createCustomer: (data: any) => api.post('/customers/customers', data),
  updateCustomer: (id: number, data: any) => api.put(`/customers/customers/${id}`, data),
  deleteCustomer: (id: number, data?: { reason?: string }) => api.delete(`/customers/customers/${id}`, { data }),
  getBills: (params?: any) => api.get('/customers/bills/all', { params }),
  createBill: (data: any) => api.post('/customers/bills', data),
  updateBill: (id: number, data: any) => api.put(`/customers/bills/${id}`, data),
  deleteBill: (id: number, data?: { reason?: string }) => api.delete(`/customers/bills/${id}`, { data }),
  getPayments: (params?: any) => api.get('/customers/payments/all', { params }),
  createPayment: (data: any) => api.post('/customers/payments', data),
  deletePayment: (id: number, data: { reason: string }) => api.delete(`/customers/payments/${id}`, { data }),
};

export const salesApi = {
  getAll: (params?: any) => api.get('/sales', { params }),
  create: (data: any) => api.post('/sales', data),
  delete: (id: number, data: { reason: string }) => api.delete(`/sales/${id}`, { data }),
};

export const stockApi = {
  getStatus: (params?: string | { date?: string; startDate?: string; endDate?: string }) => {
    const p = typeof params === 'string' ? { date: params } : params;
    return api.get('/stock/status', { params: p });
  },
  getLedger: (params?: any) => api.get('/stock/ledger', { params }),
  adjust: (data: any) => api.post('/stock/adjust', data),
  getTransfers: (params?: any) => api.get('/stock/transfers', { params }),
  getDestinationShops: () => api.get('/stock/destination-shops'),
  createTransfer: (data: any) => api.post('/stock/transfers', data),
  updateTransfer: (id: number, data: any) => api.put(`/stock/transfers/${id}`, data),
  cancelTransfer: (id: number, data: { reason: string }) => api.delete(`/stock/transfers/${id}`, { data }),
};

export const closingApi = {
  getPrefill: (date: string) => api.get(`/closing/prefill?date=${date}`),
  save: (data: any) => api.post('/closing/save', data),
  reopen: (id: number, data: { reason: string }) => api.post(`/closing/${id}/reopen`, data),
  getHistory: (params?: any) => api.get('/closing/history', { params }),
  getCalendarStatus: (monthOrParams: string | { startDate?: string; endDate?: string; month?: string }) => {
    if (typeof monthOrParams === 'string') {
      return api.get(`/closing/calendar-status?month=${monthOrParams}`);
    }
    return api.get('/closing/calendar-status', { params: monthOrParams });
  },
  downloadDailyPdf: async (date: string) => {
    const response = await api.get('/closing/daily-pdf', {
      params: { date },
      responseType: 'blob',
    });
    let filename = `Daily_Closing_Report_${date}.pdf`;
    const disposition = response.headers['content-disposition'];
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return { success: true, filename };
  },
};

export const expensesApi = {
  getAll: (params?: any) => api.get('/expenses', { params }),
  create: (data: any) => api.post('/expenses', data),
  update: (id: number, data: any) => api.put(`/expenses/${id}`, data),
  delete: (id: number, data: { reason: string }) => api.delete(`/expenses/${id}`, { data }),
  getMonthlyAnalysis: (params?: any) => api.get('/expenses/monthly-analysis', { params }),
  getCategories: () => api.get('/expenses/categories/all'),
  createCategory: (data: { name: string }) => api.post('/expenses/categories', data),
  uploadReceipt: (formData: FormData) =>
    api.post('/expenses/upload-receipt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const reportsApi = {
  getDaily: (date: string) => api.get(`/reports/daily?date=${date}`),
  getMonthly: (params: { year: number; month: number }) => api.get('/reports/monthly', { params }),
  getMonthlyPdfPreview: (params: { year: number; month: number }) =>
    api.get('/reports/monthly-pdf-preview', { params }),
  downloadMonthlyPdf: async (year: number, month: number) => {
    const response = await api.get('/reports/monthly-pdf', {
      params: { year, month },
      responseType: 'blob',
    });
    let filename = `Chicken_Shop_Closing_Report_${year}_${month}.pdf`;
    const disposition = response.headers['content-disposition'];
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return { success: true, filename };
  },
  downloadDailyPdf: async (date: string) => {
    const response = await api.get('/reports/daily-pdf', {
      params: { date },
      responseType: 'blob',
    });
    let filename = `Daily_Closing_Report_${date}.pdf`;
    const disposition = response.headers['content-disposition'];
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return { success: true, filename };
  },
};

export const auditApi = {
  getAll: (params?: any) => api.get('/audit-logs', { params }),
  getOne: (id: number) => api.get(`/audit-logs/${id}`),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
};
