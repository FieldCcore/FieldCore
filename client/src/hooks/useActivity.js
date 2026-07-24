import { useState, useEffect } from 'react';
import api from '../api';

export default function useActivity() {
  const [activity, setActivity] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.get('/analytics/activity')
      .then(r => setActivity(Array.isArray(r.data) ? r.data : []))
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, []);

  return { activity, loading };
}
