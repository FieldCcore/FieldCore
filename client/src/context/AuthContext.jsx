import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const TOKEN_KEY   = 'fc_token';
const REFRESH_KEY = 'fc_refresh';

// Decode JWT payload without verification — used client-side so accountId is
// always read from the token itself rather than depending on /me returning correct data.
function decodeJwtPayload(token) {
  try {
    const [, b64] = token.split('.');
    return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

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
    // Decode the JWT so we always know which account is active, independent of
    // what /me returns (guards against a stale backend returning the home account).
    const jwtPayload = decodeJwtPayload(token);
    axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const me = r.data.user;
        setUser({
          ...me,
          accountId:  jwtPayload?.accountId ?? me.accountId,
          account_id: jwtPayload?.accountId ?? me.account_id,
        });
        scheduleRefresh();
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));

    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch accessible accounts whenever the active account or token changes.
  // Also corrects accountName in case /me returned stale home-account data.
  useEffect(() => {
    if (!user || !token) { setAccounts([]); return; }
    axios.get('/api/auth/accounts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        setAccounts(r.data);
        const active = r.data.find(a => a.id === user.accountId);
        if (active && active.name !== user.accountName) {
          setUser(prev => ({ ...prev, accountName: active.name }));
        }
      })
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
      throw err;
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
