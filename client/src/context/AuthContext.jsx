import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const TOKEN_KEY   = 'fc_token';
const REFRESH_KEY = 'fc_refresh';

// Refresh the access token using the stored refresh token
async function doRefresh() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) throw new Error('No refresh token');
  const res = await axios.post('/api/auth/refresh', { refreshToken });
  localStorage.setItem(TOKEN_KEY, res.data.token);
  return res.data.token;
}

// Axios interceptor: on 401 try one token refresh then retry
axios.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && original.url !== '/api/auth/refresh') {
      original._retry = true;
      try {
        const newToken = await doRefresh();
        original.headers['Authorization'] = `Bearer ${newToken}`;
        return axios(original);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(null);
  const [token,           setToken]           = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading,         setLoading]         = useState(true);
  const [accounts,        setAccounts]        = useState([]);
  const [switching,       setSwitching]       = useState(false);
  const [switchError,     setSwitchError]     = useState(null);
  const refreshTimer = useRef(null);

  // Schedule silent token refresh 1 minute before expiry (access token = 15min)
  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      try {
        const newToken = await doRefresh();
        setToken(newToken);
        scheduleRefresh();
      } catch {
        // Refresh failed — user will be prompted on next API call
      }
    }, 14 * 60 * 1000); // refresh at 14 minutes
  }

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setUser(r.data.user); scheduleRefresh(); })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));

    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch accessible accounts whenever the user changes
  useEffect(() => {
    if (!user || !token) { setAccounts([]); return; }
    axios.get('/api/auth/accounts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setAccounts(r.data))
      .catch(() => setAccounts([]));
  }, [user?.accountId, token]);

  async function login(email, password) {
    const res = await axios.post('/api/auth/login', { email, password });
    const { token: t, refreshToken, user: u } = res.data;
    localStorage.setItem(TOKEN_KEY,   t);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    setToken(t);
    setUser(u);
    scheduleRefresh();
    return u;
  }

  async function switchAccount(accountId) {
    setSwitching(true);
    setSwitchError(null);
    try {
      const res = await axios.post(
        '/api/auth/switch',
        { account_id: accountId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { token: t, refreshToken, user: u } = res.data;
      localStorage.setItem(TOKEN_KEY, t);
      if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
      setToken(t);
      setUser(prev => ({ ...prev, ...u }));
      window.location.href = '/dashboard';
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to switch account. Please try again.';
      setSwitchError(msg);
      setSwitching(false);
    }
  }

  async function logout() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    try {
      await axios.post('/api/auth/logout',
        { refreshToken },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    setToken(null);
    setUser(null);
    setAccounts([]);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, accounts, switching, switchError, login, logout, switchAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
