import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,     setUser]     = useState(null);
  const [token,    setToken]    = useState(() => localStorage.getItem('fc_token'));
  const [loading,  setLoading]  = useState(true);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setUser(r.data.user))
      .catch(() => { localStorage.removeItem('fc_token'); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  // Fetch accessible accounts whenever the user changes
  useEffect(() => {
    if (!user || !token) { setAccounts([]); return; }
    axios.get('/api/auth/accounts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setAccounts(r.data))
      .catch(() => setAccounts([]));
  }, [user?.accountId, token]);

  async function login(email, password) {
    const res = await axios.post('/api/auth/login', { email, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('fc_token', t);
    setToken(t);
    setUser(u);
    return u;
  }

  async function switchAccount(accountId) {
    const res = await axios.post(
      '/api/auth/switch',
      { account_id: accountId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { token: t, user: u } = res.data;
    localStorage.setItem('fc_token', t);
    setToken(t);
    setUser(prev => ({ ...prev, ...u }));
    // Full reload so all page data re-fetches under the new accountId
    window.location.href = '/dashboard';
  }

  function logout() {
    localStorage.removeItem('fc_token');
    setToken(null);
    setUser(null);
    setAccounts([]);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, accounts, login, logout, switchAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
