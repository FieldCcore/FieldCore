import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--navy)',
        fontFamily: "'Bricolage Grotesque', sans-serif",
        color: 'rgba(255,255,255,.4)', fontSize: 14,
      }}>
        Loading…
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}
