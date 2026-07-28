import api from '../api';

export async function getConnectionStatus() {
  const r = await api.get('/phone/status');
  return r.data;
}

export async function startOutboundCall({ to_number, client_id, operator_number }) {
  try {
    const r = await api.post('/phone/calls/outbound', {
      to_number:       to_number  || undefined,
      client_id:       client_id  || undefined,
      operator_number,
    });
    return r.data;
  } catch (err) {
    const data = err?.response?.data;
    const error = new Error(data?.error || 'Call could not be placed');
    error.code   = data?.code;
    error.status = err?.response?.status;
    throw error;
  }
}
