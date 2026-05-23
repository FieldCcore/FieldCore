import axios from 'axios';

// Normalize non-string error/warning fields on ANY axios response — prevents
// React #31 when proxy errors like { error: { code, message } } bypass the
// `|| 'fallback'` guards used throughout the app. Applied to the global
// axios instance so auth pages (Login, ForgotPassword, etc.) are also covered.
function normalizeErrorFields(err) {
  if (err.response?.data) {
    const d = err.response.data;
    if (d.error && typeof d.error !== 'string') {
      d.error = d.error?.message || JSON.stringify(d.error);
    }
    if (d.warning && typeof d.warning !== 'string') {
      d.warning = d.warning?.message || JSON.stringify(d.warning);
    }
  }
  return Promise.reject(err);
}

axios.interceptors.response.use(res => res, normalizeErrorFields);

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('fc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('fc_token');
      window.history.replaceState(null, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    return normalizeErrorFields(err);
  }
);

export default api;
