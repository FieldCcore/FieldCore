import axios from 'axios';

// When frontend is deployed separately from the backend (e.g. Vercel + Railway),
// set VITE_API_URL to the backend origin (e.g. https://fieldcore-production.up.railway.app).
// Relative /api paths are used when both are on the same origin.
const BACKEND = import.meta.env.VITE_API_URL || '';

// Set on the global axios instance so AuthContext's raw axios('/api/...') calls
// resolve to the correct origin when deployed cross-domain.
if (BACKEND) axios.defaults.baseURL = BACKEND;

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

const api = axios.create({ baseURL: `${BACKEND}/api` });

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
