import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_API_URL || '';

function fmt$(n) { return `$${parseFloat(n || 0).toFixed(2)}`; }
function fmtDt(d) { return d ? new Date(d).toLocaleDateString('en-US',{dateStyle:'long'}) : '—'; }

export default function SignEstimate() {
  const { token } = useParams();
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [signed, setSigned]     = useState(false);
  const [signing, setSigning]   = useState(false);
  const [agreed, setAgreed]     = useState(false);

  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const lastPos   = useRef({ x:0, y:0 });
  const [hasSig, setHasSig] = useState(false);

  useEffect(() => {
    axios.get(`${BACKEND}/api/estimates/sign/${token}`)
      .then(r => { setEstimate(r.data); if (r.data.already_signed) setSigned(true); })
      .catch(err => setError(err.response?.data?.error || 'Estimate not found or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e) {
    drawing.current = true;
    const canvas = canvasRef.current;
    lastPos.current = getPos(e, canvas);
    e.preventDefault();
  }

  function draw(e) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1C2333';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSig(true);
    e.preventDefault();
  }

  function endDraw() { drawing.current = false; }

  function clearSig() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  async function submit() {
    if (!hasSig) return alert('Please draw your signature.');
    if (!agreed) return alert('Please agree to the terms to sign.');
    const canvas = canvasRef.current;
    const sigData = canvas.toDataURL('image/png');
    setSigning(true);
    try {
      await axios.post(`${BACKEND}/api/estimates/sign/${token}`, { signature_data: sigData });
      setSigned(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit signature.');
    } finally {
      setSigning(false);
    }
  }

  const center = { display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#f4f4f0',padding:20 };

  if (loading) return <div style={center}><div style={{ color:'#6b7280',fontFamily:'DM Mono,monospace',fontSize:13 }}>Loading…</div></div>;

  if (error) return (
    <div style={center}>
      <div style={{ background:'white',borderRadius:16,padding:'40px 36px',maxWidth:400,textAlign:'center',boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ fontSize:18,fontWeight:700,color:'#1C2333',marginBottom:8 }}>Link Expired or Invalid</div>
        <div style={{ fontSize:14,color:'#5F667A' }}>{error}</div>
      </div>
    </div>
  );

  if (signed) return (
    <div style={center}>
      <div style={{ background:'white',borderRadius:16,padding:'40px 36px',maxWidth:460,textAlign:'center',boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ width:56,height:56,background:'#f0fdf4',border:'2px solid #bbf7d0',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:24,color:'#16a34a' }}>✓</div>
        <div style={{ fontSize:20,fontWeight:700,color:'#1C2333',marginBottom:8 }}>Estimate Signed</div>
        <div style={{ fontSize:14,color:'#6b7280',lineHeight:1.6 }}>
          {estimate?.client_name ? `Thank you, ${estimate.client_name}.` : 'Thank you.'} Your signature has been recorded.<br />
          You will receive a confirmation from {estimate?.business_name || 'the business'}.
        </div>
      </div>
    </div>
  );

  if (!estimate) return null;

  const tax      = parseFloat(estimate.tax_amount || 0);
  const total    = parseFloat(estimate.amount || 0);
  const subtotal = total - tax;
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  return (
    <div style={center}>
      <div style={{ width:'100%',maxWidth:540 }}>
        {/* Header */}
        <div style={{ background:'#1C2333',borderRadius:'12px 12px 0 0',padding:'20px 28px' }}>
          <div style={{ color:'#D6B58A',fontSize:15,fontWeight:800,letterSpacing:'.05em' }}>FIELDCORE™</div>
          <div style={{ color:'rgba(255,255,255,.45)',fontSize:12,marginTop:3 }}>{estimate.business_name}</div>
        </div>

        <div style={{ background:'white',border:'1px solid #e5e0d8',borderTop:'none',borderRadius:'0 0 12px 12px',padding:28 }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:20,fontWeight:700,color:'#1C2333',marginBottom:2 }}>{estimate.title}</div>
            <div style={{ fontSize:13,color:'#6b7280' }}>For: {estimate.client_name}</div>
            {estimate.valid_until && (
              <div style={{ fontSize:12,color:'#9ca3af',marginTop:2 }}>Valid until {fmtDt(estimate.valid_until)}</div>
            )}
          </div>

          {/* Line items */}
          <div style={{ background:'#f9f7f3',border:'1px solid #e5e0d8',borderRadius:8,padding:'14px 16px',marginBottom:16 }}>
            {lineItems.map((item, i) => (
              <div key={i} style={{ display:'flex',justifyContent:'space-between',fontSize:14,color:'#1C2333',marginBottom:8 }}>
                <span>{item.description}</span>
                <span style={{ fontWeight:600 }}>{fmt$(item.amount)}</span>
              </div>
            ))}
            {tax > 0 && (
              <>
                <div style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#6b7280',borderTop:'1px solid #e5e0d8',paddingTop:8,marginBottom:4 }}>
                  <span>Subtotal</span><span>{fmt$(subtotal)}</span>
                </div>
                <div style={{ display:'flex',justifyContent:'space-between',fontSize:13,color:'#6b7280',marginBottom:8 }}>
                  <span>Tax</span><span>{fmt$(tax)}</span>
                </div>
              </>
            )}
            <div style={{ display:'flex',justifyContent:'space-between',borderTop:'1px solid #e5e0d8',paddingTop:8,fontWeight:700,fontSize:16,color:'#1C2333' }}>
              <span>Total</span><span>{fmt$(total)}</span>
            </div>
          </div>

          {estimate.notes && (
            <div style={{ fontSize:13,color:'#5F667A',marginBottom:16,lineHeight:1.6 }}>
              <strong>Notes:</strong> {estimate.notes}
            </div>
          )}

          {/* Signature pad */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
              <label style={{ fontSize:13,fontWeight:600,color:'#1C2333' }}>Your Signature</label>
              {hasSig && (
                <button onClick={clearSig} style={{ fontSize:12,color:'#94a3b8',background:'none',border:'none',cursor:'pointer' }}>Clear</button>
              )}
            </div>
            <canvas
              ref={canvasRef}
              width={490}
              height={120}
              style={{ border:'2px solid #e5e0d8',borderRadius:8,width:'100%',height:120,touchAction:'none',background:'#fdfcfb',cursor:'crosshair' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasSig && (
              <div style={{ textAlign:'center',marginTop:-80,pointerEvents:'none',color:'#c4c4c4',fontSize:13,fontStyle:'italic' }}>
                Sign here
              </div>
            )}
            {!hasSig && <div style={{ marginTop:68 }} />}
          </div>

          {/* Agreement checkbox */}
          <label style={{ display:'flex',alignItems:'flex-start',gap:10,fontSize:13,color:'#5F667A',marginBottom:20,cursor:'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop:2,flexShrink:0 }} />
            <span>
              I agree to the terms of this estimate. By signing, I authorize {estimate.business_name} to proceed with the services described above for the stated amount.
            </span>
          </label>

          <button
            onClick={submit}
            disabled={signing || !hasSig || !agreed}
            style={{ width:'100%',padding:'14px 0',background:'#1C2333',color:'#D6B58A',border:'none',borderRadius:8,fontSize:15,fontWeight:700,cursor:(!hasSig||!agreed||signing)?'not-allowed':'pointer',opacity:(!hasSig||!agreed||signing)?0.6:1 }}
          >
            {signing ? 'Submitting…' : 'Sign Estimate →'}
          </button>

          <div style={{ marginTop:12,textAlign:'center',fontSize:11,color:'#9ca3af' }}>
            By signing, you confirm this is your digital signature · Powered by FieldCore
          </div>
        </div>
      </div>
    </div>
  );
}
