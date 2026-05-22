import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '../api';

const CARD_STYLE = {
  style: {
    base: {
      fontSize: '14px',
      color: '#1e293b',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      '::placeholder': { color: '#94a3b8' },
    },
    invalid: { color: '#ef4444' },
  },
};

export default function CardSetupForm({ clientId, onSaved }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    setError('');

    try {
      // Get SetupIntent client secret from backend
      const { data } = await api.post('/payments/setup-intent', { client_id: clientId });

      const result = await stripe.confirmCardSetup(data.client_secret, {
        payment_method: { card: elements.getElement(CardElement) },
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      // Save confirmed PaymentMethod to our DB
      await api.post('/payments/save-card', {
        client_id:         clientId,
        payment_method_id: result.setupIntent.payment_method,
      });

      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-setup-form">
      {error && <p className="form-error">{error}</p>}
      <div className="card-element-wrap">
        <CardElement options={CARD_STYLE} />
      </div>
      <button type="submit" className="btn-primary" disabled={!stripe || saving}>
        {saving ? 'Saving...' : 'Save Card'}
      </button>
    </form>
  );
}
