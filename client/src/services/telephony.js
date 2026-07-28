import api from '../api';

export async function getConnectionStatus() {
  const r = await api.get('/phone/status');
  return r.data; // { configured, number, label, has_operator_phone }
}

export async function startOutboundCall({ to_number, client_id }) {
  try {
    const r = await api.post('/phone/calls/outbound', {
      to_number: to_number || undefined,
      client_id: client_id || undefined,
    });
    return r.data; // { call_sid, log }
  } catch (err) {
    const data  = err?.response?.data;
    const error = new Error(data?.error || 'Call could not be placed');
    error.code   = data?.code;
    error.status = err?.response?.status;
    throw error;
  }
}
