import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import ClientForm from '../components/ClientForm';

export default function ClientList() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/clients')
      .then(r => setClients(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  function handleCreated(client) {
    setClients(prev => [client, ...prev]);
    setShowForm(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Clients</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add Client</button>
      </div>

      <input
        className="search-input"
        placeholder="Search by name, email, or phone..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Client</h2>
              <button className="btn-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <ClientForm onSave={handleCreated} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="muted">{search ? 'No clients match your search.' : 'No clients yet. Add your first one!'}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Tier</th>
              <th>LTV</th>
              <th>Card on File</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="clickable-row" onClick={() => navigate(`/clients/${c.id}`)}>
                <td><strong>{c.name}</strong></td>
                <td>{c.phone || '—'}</td>
                <td>{c.email || '—'}</td>
                <td><span className={`badge badge-${c.tier}`}>{c.tier}</span></td>
                <td>${parseFloat(c.ltv || 0).toFixed(2)}</td>
                <td>{c.card_on_file ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
