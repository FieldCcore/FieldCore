import axios from 'axios';

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
      // Use replaceState so the browser doesn't reload the page —
      // React Router picks up the path change on next render
      window.history.replaceState(null, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    // Coerce non-string error/warning fields — prevents React #31 when these
    // are placed directly as JSX children (e.g. Vercel/proxy error shapes like
    // { error: { code, message } } where the nested object is truthy and
    // bypasses the `|| 'fallback'` guards used throughout the app).
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
);

export default api;
