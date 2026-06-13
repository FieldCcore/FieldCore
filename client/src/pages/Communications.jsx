import React from 'react';
import PhonePage from './Phone';
import Messages from './Messages';

export default function Communications() {
  return (
    <div>
      <PhonePage />

      <div style={{ borderTop: '2px solid #E5E0D8', margin: '40px 0 0' }} />

      <div style={{ paddingTop: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1C2333' }}>SMS Messages</div>
          <p style={{ margin: '4px 0 0', color: 'var(--steel)', fontSize: 14 }}>Text message conversations with clients</p>
        </div>
        <Messages />
      </div>
    </div>
  );
}
