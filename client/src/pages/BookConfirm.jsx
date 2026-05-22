import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

export default function BookConfirm() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('job');
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) { setLoading(false); return; }
    axios.get(`/api/booking/confirm/${jobId}`)
      .then(r => setJob(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Bricolage Grotesque', sans-serif",
      padding: 24,
    }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1C2333', marginBottom: 8 }}>
          Booking Confirmed
        </h1>
        {loading ? (
          <p style={{ color: '#64748b' }}>Loading details…</p>
        ) : job ? (
          <>
            <p style={{ color: '#475569', fontSize: 16, marginBottom: 24 }}>
              Your deposit payment was received. You're all set for your <strong>{job.service_type}</strong> appointment.
            </p>
            {job.scheduled_at && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Scheduled</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1C2333' }}>
                  {new Date(job.scheduled_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                  {' · '}
                  {new Date(job.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            )}
            <p style={{ color: '#64748b', fontSize: 13 }}>
              We'll send you a reminder before your appointment. Please save this confirmation.
            </p>
          </>
        ) : (
          <p style={{ color: '#475569', fontSize: 16 }}>
            Your deposit payment was received. We'll be in touch to confirm your appointment details.
          </p>
        )}
      </div>
    </div>
  );
}
