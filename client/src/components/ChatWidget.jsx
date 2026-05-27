import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const SUGGESTED = [
  'How much does FieldCore cost?',
  'What is the no-show clock?',
  'FieldCore vs Jobber — which is better?',
  'How do I get 3 months free?',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m the FieldCore assistant. Ask me anything about features, pricing, or how FieldCore works for your business.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send(text) {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput('');
    const next = [...messages, { role: 'user', content: userMsg }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await axios.post('/api/chat', {
        messages: next.filter(m => m.role === 'user' || m.role === 'assistant'),
      }, { timeout: 20000 });
      const reply = res.data?.reply;
      if (reply) {
        setMessages(m => [...m, { role: 'assistant', content: reply }]);
      } else {
        setMessages(m => [...m, { role: 'assistant', content: 'FieldCore starts at $49/mo for solo operators — no per-user fees, no setup fees, 14-day free trial. What would you like to know about features or pricing?' }]);
      }
    } catch (err) {
      const status = err?.response?.status;
      const fallback = status === 429
        ? 'You\'ve sent a lot of messages! Please wait a moment and try again.'
        : 'FieldCore starts at $49/mo — no per-user fees, 14-day free trial. Ask me anything about features, pricing, or how it compares to Jobber or Housecall Pro.';
      setMessages(m => [...m, { role: 'assistant', content: fallback }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 52, height: 52, borderRadius: '50%',
          background: '#1C2333', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,.3)',
          transition: 'transform .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="#D6B58A" strokeWidth="2" width="20" height="20"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="#D6B58A" strokeWidth="2" width="20" height="20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 9998,
          width: 340, maxHeight: 520,
          background: 'white', borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,.18)',
          border: '1px solid #E6E6E6',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {/* Header */}
          <div style={{ background: '#1C2333', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4EC87A', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'white' }}>FieldCore Assistant</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Usually replies instantly</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%',
                  padding: '9px 13px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? '#1C2333' : '#F8F7F5',
                  color: m.role === 'user' ? 'white' : '#1C2333',
                  fontSize: 13, lineHeight: 1.55,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#F8F7F5', borderRadius: '14px 14px 14px 4px', padding: '10px 14px', display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#8A90A2', animation: `bounce .9s ${i * .15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            {/* Suggested prompts — only show before user sends anything */}
            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {SUGGESTED.map(s => (
                  <button key={s} onClick={() => send(s)} style={{ padding: '6px 11px', background: 'none', border: '1.5px solid #E6E6E6', borderRadius: 20, fontSize: 12, color: '#1C2333', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #E6E6E6', display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask anything…"
              style={{
                flex: 1, padding: '9px 12px', border: '1.5px solid #E6E6E6',
                borderRadius: 8, fontSize: 13, outline: 'none',
                fontFamily: 'inherit', color: '#1C2333',
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                padding: '0 14px', background: '#1C2333', color: '#D6B58A',
                border: 'none', borderRadius: 8, cursor: input.trim() ? 'pointer' : 'default',
                opacity: input.trim() ? 1 : 0.4, fontSize: 16,
              }}
            >→</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%,80%,100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}
