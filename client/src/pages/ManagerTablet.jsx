import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map, Video, ClipboardList, Users, CreditCard, Bell, Plus, AlertTriangle, Lock, CheckCircle, Check, X, Search } from 'lucide-react';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_API_URL || '';
const mtApi = axios.create({ baseURL: `${BACKEND}/api` });
mtApi.interceptors.request.use(cfg => {
  const t = localStorage.getItem('mt_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const C = {
  n:'#1C2333',n2:'#242E43',n3:'#2D3748',n4:'#364156',
  sl:'#5F667A',st:'#8A90A2',
  sd:'#D6B58A',sd2:'#C09A6A',slt:'#F5EDE0',
  cr:'#EDEBE7',lg:'#E6E6E6',wh:'#FFFFFF',of:'#F8F7F5',
  gn:'#1E6B3C',gl:'#E4F4EC',gn2:'#4EC87A',
  rd:'#B52A2A',rl:'#FDEAEA',rd2:'#E05555',
  am:'#B86200',al:'#FEF3E2',am2:'#F5A623',
  bl:'#1A5EA8',bll:'#EBF3FD',
};

const TAMPA_SPREAD = [
  [27.9506,-82.4572],[27.9220,-82.4750],[27.9650,-82.5010],
  [27.9730,-82.4320],[27.9400,-82.4600],[27.9800,-82.4900],
];

function initials(name){ return String(name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?'; }
function fmtTime(iso){ if(!iso)return'—'; const d=new Date(iso); let h=d.getHours(),m=d.getMinutes(),am=h>=12?'PM':'AM'; h=h%12||12; return`${h}:${String(m).padStart(2,'0')} ${am}`; }
function fmtMoney(v){ if(v==null)return'—'; return`$${parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`; }
function statusMeta(s){ switch(s){ case'in_progress':return{label:'Active',bg:C.gl,color:C.gn}; case'complete':return{label:'Done',bg:C.gl,color:C.gn}; case'scheduled':return{label:'Scheduled',bg:C.cr,color:C.sl}; case'cancelled':return{label:'Cancelled',bg:C.rl,color:C.rd}; case'noshow':return{label:'No-Show',bg:C.rl,color:C.rd}; default:return{label:s,bg:C.cr,color:C.sl}; } }
function today(){ return new Date().toISOString().split('T')[0]; }

// ── Dispatch map with real data
function DispatchMap({ jobs, techs, onTechClick, onGoToCam }) {
  const mapRef = useRef(null);
  const mapInst = useRef(null);
  const [popup, setPopup] = useState(null);
  const [dims, setDims] = useState({w:0,h:0});

  useEffect(() => {
    if (mapInst.current || !mapRef.current) return;
    const L = window.L; if (!L) return;
    const map = L.map(mapRef.current, { center:[27.9506,-82.4572], zoom:12, zoomControl:false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OpenStreetMap', maxZoom:19 }).addTo(map);

    // Job location dots from check-in GPS
    jobs.filter(j=>j.checkin_lat&&j.checkin_lng).forEach((j,i)=>{
      const sm=statusMeta(j.status);
      const icon=L.divIcon({ className:'', html:`<div style="width:12px;height:12px;border-radius:50%;background:${sm.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>`, iconSize:[12,12], iconAnchor:[6,6] });
      L.marker([j.checkin_lat,j.checkin_lng],{icon}).addTo(map).bindTooltip(j.client_name||'Job',{ permanent:true, direction:'bottom', offset:[0,4], className:'mt-tip' });
    });

    // Tech markers
    techs.forEach((tech,i)=>{
      const activeJob=jobs.find(j=>j.tech_id===tech.id&&['in_progress','scheduled'].includes(j.status));
      const pos=(activeJob?.checkin_lat&&activeJob?.checkin_lng)?[activeJob.checkin_lat,activeJob.checkin_lng]:TAMPA_SPREAD[i%TAMPA_SPREAD.length];
      const nsJob=jobs.find(j=>j.tech_id===tech.id&&j.status==='noshow');
      const border=nsJob?C.rd2:activeJob?.status==='in_progress'?C.gn2:activeJob?.status==='scheduled'?C.sd:C.st;
      const pulse=nsJob?`<div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid ${border};opacity:0;animation:mt-van-pulse 2s ease-out infinite;pointer-events:none;"></div>`:'';
      const ini=initials(tech.name);
      const icon=L.divIcon({ className:'', html:`<div style="position:relative;width:36px;height:36px;">${pulse}<div style="position:absolute;inset:0;border-radius:50%;background:#1C2333;border:2.5px solid ${border};box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${border};">${ini}</div></div>`, iconSize:[36,36], iconAnchor:[18,18] });
      L.marker(pos,{icon}).addTo(map).on('click',function(e){
        L.DomEvent.stopPropagation(e);
        const pt=map.latLngToContainerPoint(e.latlng);
        const rect=mapRef.current.getBoundingClientRect();
        setDims({w:rect.width,h:rect.height});
        setPopup({tech,job:activeJob||nsJob,x:pt.x,y:pt.y});
        onTechClick(tech.id);
      });
    });

    map.on('click',()=>setPopup(null));
    mapInst.current=map;
    setTimeout(()=>map.invalidateSize(),50);
    return ()=>{ if(mapInst.current){mapInst.current.remove();mapInst.current=null;} };
  }, [jobs,techs]);

  return (
    <div style={{position:'relative',flex:1,overflow:'hidden'}}>
      <div ref={mapRef} style={{width:'100%',height:'100%'}}/>
      <div style={{position:'absolute',top:14,left:14,zIndex:500,pointerEvents:'none'}}>
        <div style={{background:C.n,border:`1px solid ${C.sd}`,borderRadius:8,padding:'7px 12px',fontSize:11,fontWeight:600,color:C.sd,display:'flex',alignItems:'center',gap:6}}><div style={{width:7,height:7,borderRadius:'50%',background:C.rd2,animation:'mt-pulse 1.4s infinite',flexShrink:0}}/>Live</div>
      </div>
      <div style={{position:'absolute',bottom:14,left:14,zIndex:500,background:C.n,border:'1px solid rgba(255,255,255,.1)',borderRadius:8,padding:'10px 12px',display:'flex',flexDirection:'column',gap:6,pointerEvents:'none'}}>
        {[[C.gn2,'Active at job'],[C.sd,'Scheduled'],[C.rd2,'No-show active'],[C.st,'Standby']].map(([col,lbl])=>(
          <div key={lbl} style={{display:'flex',alignItems:'center',gap:7,fontSize:10.5,color:'rgba(255,255,255,.5)'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:col,flexShrink:0}}/>{lbl}
          </div>
        ))}
      </div>
      {popup&&(()=>{
        let px=popup.x,py=popup.y;
        if(px+230>dims.w)px=px-240; if(py+200>dims.h)py=py-210; if(px<10)px=10; if(py<10)py=10;
        return(
          <div onClick={e=>e.stopPropagation()} style={{position:'absolute',left:px,top:py,background:C.n,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,padding:14,width:220,zIndex:1000,boxShadow:'0 16px 48px rgba(0,0,0,.5)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,paddingBottom:10,borderBottom:'1px solid rgba(255,255,255,.07)'}}>
              <div style={{width:32,height:32,borderRadius:'50%',background:C.n3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:C.sd,flexShrink:0}}>{initials(popup.tech.name)}</div>
              <div><div style={{fontSize:13,fontWeight:700,color:C.wh}}>{popup.tech.name}</div><div style={{fontSize:10,color:'rgba(255,255,255,.35)'}}>{popup.job?popup.job.service_type:'No active job'}</div></div>
            </div>
            <div style={{fontSize:11.5,color:'rgba(255,255,255,.5)',marginBottom:10}}>{popup.job?`${popup.job.client_name} · ${fmtTime(popup.job.scheduled_at)}`:'Available'}</div>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>setPopup(null)} style={{flex:1,padding:7,borderRadius:6,border:'none',fontSize:10.5,fontWeight:700,cursor:'pointer',background:C.sd,color:C.n,fontFamily:'inherit'}}>Dispatch</button>
              <button onClick={()=>{setPopup(null);onGoToCam();}} style={{flex:1,padding:7,borderRadius:6,border:'none',fontSize:10.5,fontWeight:700,cursor:'pointer',background:'rgba(74,105,164,.2)',color:'#8BAED4',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}><Video size={11}/>Cameras</button>
              <button onClick={()=>setPopup(null)} style={{padding:'7px 10px',borderRadius:6,border:'none',fontSize:10.5,fontWeight:700,cursor:'pointer',background:'rgba(255,255,255,.06)',color:'rgba(255,255,255,.5)',fontFamily:'inherit',display:'flex',alignItems:'center'}}><X size={11}/></button>
            </div>
          </div>
        );
      })()}
      <style>{`.mt-tip{background:#1C2333!important;border:1px solid rgba(255,255,255,.15)!important;color:#D6B58A!important;font-family:'DM Mono',monospace!important;font-size:9px!important;font-weight:700!important;letter-spacing:.08em!important;padding:3px 7px!important;border-radius:4px!important;box-shadow:0 2px 8px rgba(0,0,0,.4)!important;white-space:nowrap!important;}.mt-tip::before{border-bottom-color:rgba(255,255,255,.15)!important;}@keyframes mt-van-pulse{0%{transform:scale(1);opacity:0.6;}100%{transform:scale(1.8);opacity:0;}}`}</style>
    </div>
  );
}

// ── Jobs panel
function JobsPanel() {
  const [jobs,setJobs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('All');

  useEffect(()=>{
    mtApi.get('/jobs').then(r=>setJobs(r.data)).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const filtered=jobs.filter(j=>{
    const q=search.toLowerCase();
    const mQ=!q||(j.client_name||'').toLowerCase().includes(q)||(j.service_type||'').toLowerCase().includes(q)||(j.tech_name||'').toLowerCase().includes(q);
    const mS=statusFilter==='All'||j.status===statusFilter;
    return mQ&&mS;
  });

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.of,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',background:C.wh,borderBottom:`1px solid ${C.lg}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search jobs, clients, techs..." style={{flex:1,padding:'9px 14px',border:`1.5px solid ${C.lg}`,borderRadius:7,fontSize:13,fontFamily:'inherit',color:C.n,outline:'none',background:C.of}}/>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{padding:'9px 14px',border:`1.5px solid ${C.lg}`,borderRadius:7,fontSize:12,fontFamily:'inherit',color:C.sl,outline:'none',background:C.of,cursor:'pointer'}}>
          <option value="All">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">Active</option>
          <option value="complete">Done</option>
          <option value="noshow">No-Show</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'1.8fr 1.2fr 1fr 1fr 1fr 90px',padding:'10px 16px',background:C.wh,borderBottom:`1px solid ${C.lg}`,position:'sticky',top:0,zIndex:5}}>
          {['Client','Service','Tech','Time','Amount','Status'].map(h=>(
            <div key={h} style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:C.st}}>{h}</div>
          ))}
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.st}}>Loading…</div>}
        {!loading&&filtered.length===0&&<div style={{padding:32,textAlign:'center',color:C.st}}>No jobs found.</div>}
        {filtered.map((j,i)=>{
          const sm=statusMeta(j.status);
          return(
            <div key={j.id} style={{display:'grid',gridTemplateColumns:'1.8fr 1.2fr 1fr 1fr 1fr 90px',padding:'13px 16px',borderBottom:`1px solid ${C.lg}`,alignItems:'center',background:i%2===0?C.wh:C.of}}>
              <div style={{fontSize:12.5,fontWeight:600,color:C.n}}>{j.client_name||'—'}</div>
              <div style={{fontSize:12.5,color:C.sl}}>{j.service_type||'—'}</div>
              <div style={{fontSize:12.5,color:C.sl}}>{j.tech_name||'Unassigned'}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:C.sl}}>{fmtTime(j.scheduled_at)}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11.5,color:C.sd}}>{fmtMoney(j.amount)}</div>
              <div><span style={{fontSize:9.5,fontWeight:700,padding:'3px 9px',borderRadius:99,background:sm.bg,color:sm.color}}>{sm.label}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Clients panel
function ClientsPanel() {
  const [clients,setClients]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');

  useEffect(()=>{
    mtApi.get('/clients').then(r=>setClients(r.data)).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const tierColors={'vip':'#1E6B3C','at-risk':'#B52A2A','standard':'#B86200','new':'#5F667A'};
  const filtered=clients.filter(c=>!search||(c.name||'').toLowerCase().includes(search.toLowerCase())||(c.phone||'').includes(search)||(c.email||'').toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.of,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',background:C.wh,borderBottom:`1px solid ${C.lg}`,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients..." style={{flex:1,padding:'9px 14px',border:`1.5px solid ${C.lg}`,borderRadius:7,fontSize:13,fontFamily:'inherit',color:C.n,outline:'none',background:C.of}}/>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12,alignContent:'start'}}>
        {loading&&<div style={{gridColumn:'1/-1',padding:32,textAlign:'center',color:C.st}}>Loading…</div>}
        {!loading&&filtered.length===0&&<div style={{gridColumn:'1/-1',padding:32,textAlign:'center',color:C.st}}>No clients found.</div>}
        {filtered.map(c=>(
          <div key={c.id} style={{background:C.wh,border:`1px solid ${C.lg}`,borderRadius:10,padding:14,cursor:'pointer',transition:'all .18s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.sd;e.currentTarget.style.transform='translateY(-2px)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.lg;e.currentTarget.style.transform='none';}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:38,height:38,borderRadius:'50%',background:tierColors[c.tier]||C.sl,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:C.wh,flexShrink:0}}>{initials(c.name)}</div>
              <div>
                <div style={{fontSize:13.5,fontWeight:700,color:C.n}}>{c.name}</div>
                <div style={{fontSize:10,color:C.st,textTransform:'capitalize'}}>{c.tier||'Standard'}{c.stripe_payment_method_id?' · Card on file':''}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
              {[['LTV',fmtMoney(c.ltv),C.sd],['Phone',c.phone||'—',C.n],['Email',c.email||'—',C.n],['Balance','$0',C.gn]].map(([lbl,val,vc])=>(
                <div key={lbl} style={{background:C.of,borderRadius:6,padding:'7px 9px'}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:'.1em',textTransform:'uppercase',color:C.st,marginBottom:3}}>{lbl}</div>
                  <div style={{fontSize:11,fontWeight:700,color:vc,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deposits panel
function DepositsPanel() {
  const [deposits,setDeposits]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    mtApi.get('/deposits').then(r=>setDeposits(r.data)).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const total=deposits.reduce((s,d)=>s+parseFloat(d.amount||0),0);
  const collected=deposits.filter(d=>d.status==='collected').reduce((s,d)=>s+parseFloat(d.amount||0),0);
  const pending=deposits.filter(d=>d.status==='pending').reduce((s,d)=>s+parseFloat(d.amount||0),0);
  const expiring=deposits.filter(d=>d.status==='pending'&&d.expires_at&&new Date(d.expires_at)<new Date(Date.now()+24*60*60*1000)).length;

  const depStatusMeta=(s)=>{switch(s){case'collected':return{label:'Retained',bg:C.gl,color:C.gn};case'pending':return{label:'Pending',bg:C.al,color:C.am};case'refunded':return{label:'Refunded',bg:C.bll,color:C.bl};case'applied':return{label:'Applied',bg:C.cr,color:C.sl};default:return{label:s,bg:C.cr,color:C.sl};}};

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.of,overflow:'hidden'}}>
      <div style={{padding:'14px 16px',background:C.wh,borderBottom:`1px solid ${C.lg}`,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,flexShrink:0}}>
        {[['Total Held',fmtMoney(total),C.sd],['Retained',fmtMoney(collected),C.gn],['Pending',fmtMoney(pending),C.am],['Expiring Soon',String(expiring),C.rd]].map(([l,v,vc])=>(
          <div key={l} style={{background:C.of,borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:8.5,letterSpacing:'.1em',textTransform:'uppercase',color:C.st,marginBottom:4}}>{l}</div>
            <div style={{fontSize:18,fontWeight:700,color:vc}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.st}}>Loading…</div>}
        {!loading&&deposits.length===0&&<div style={{padding:32,textAlign:'center',color:C.st}}>No deposits yet.</div>}
        {deposits.map(d=>{
          const sm=depStatusMeta(d.status);
          return(
            <div key={d.id} style={{background:C.wh,border:`1px solid ${C.lg}`,borderRadius:10,padding:13,marginBottom:8,display:'flex',alignItems:'center',gap:12,cursor:'pointer',transition:'all .18s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.sd}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.lg}>
              <div style={{width:36,height:36,borderRadius:'50%',background:C.n3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:C.sd,flexShrink:0}}>{initials(d.client_name)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:C.n}}>{d.client_name} · {d.service_type}</div>
                <div style={{fontSize:11.5,color:C.sl}}>{d.expires_at?`Expires ${new Date(d.expires_at).toLocaleDateString()}`:'No expiry set'}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:C.sd}}>{fmtMoney(d.amount)}</div>
                <span style={{fontSize:9.5,fontWeight:700,padding:'3px 9px',borderRadius:99,marginTop:4,display:'inline-block',background:sm.bg,color:sm.color}}>{sm.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cameras panel (Scale+ demo)
function CamerasPanel() {
  function CamSvg({type}){
    if(type==='front')return(<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}><rect width="240" height="120" fill="#0d1117"/><rect x="20" y="60" width="200" height="40" rx="4" fill="#1a2035"/><rect x="60" y="30" width="120" height="45" rx="6" fill="#1e2840"/><rect x="80" y="35" width="80" height="35" rx="4" fill="#252f45"/><line x1="0" y1="80" x2="240" y2="80" stroke="#D6B58A" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.3"/><text x="120" y="110" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">FRONT CAM · LIVE</text><circle cx="220" cy="10" r="5" fill="#4EC87A"><animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite"/></circle></svg>);
    if(type==='rear')return(<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}><rect width="240" height="120" fill="#0d1117"/><rect x="10" y="50" width="220" height="50" rx="4" fill="#1a2035"/><rect x="70" y="20" width="100" height="55" rx="6" fill="#1e2840"/><line x1="0" y1="75" x2="240" y2="75" stroke="#D6B58A" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.3"/><text x="120" y="110" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">REAR CAM · LIVE</text><circle cx="220" cy="10" r="5" fill="#4EC87A"><animate attributeName="opacity" values="1;0.2;1" dur="2.3s" repeatCount="indefinite"/></circle></svg>);
    return(<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}><rect width="240" height="120" fill="#0a0f1a"/><rect x="30" y="20" width="80" height="60" rx="8" fill="#1a2035"/><rect x="130" y="20" width="80" height="60" rx="8" fill="#1a2035"/><circle cx="70" cy="50" r="15" fill="#1e2840"/><circle cx="170" cy="50" r="15" fill="#1e2840"/><text x="120" y="110" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">INNER CAB · LIVE</text><circle cx="220" cy="10" r="5" fill="#4EC87A"><animate attributeName="opacity" values="1;0.2;1" dur="1.8s" repeatCount="indefinite"/></circle></svg>);
  }
  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.n,overflow:'hidden'}}>
      <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,.08)',display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
        <div><div style={{fontSize:14,fontWeight:700,color:C.wh,display:'flex',alignItems:'center',gap:8}}><Video size={14}/>Live Camera Feeds</div><div style={{fontSize:12,color:'rgba(255,255,255,.35)'}}>Front · Rear · Inner Cab · All vehicles</div></div>
        <div style={{marginLeft:'auto',fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',background:'rgba(214,181,138,.15)',color:C.sd,padding:'4px 12px',borderRadius:99}}>Scale+ Feature</div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
        <div style={{background:'rgba(255,255,255,.03)',border:'1px dashed rgba(255,255,255,.1)',borderRadius:12,padding:48,textAlign:'center'}}>
          <div style={{marginBottom:16,color:C.st,display:'flex',justifyContent:'center'}}><Lock size={32}/></div>
          <div style={{fontSize:15,fontWeight:700,color:C.wh,marginBottom:6}}>Unlock Camera Feeds on Scale+</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,.35)',lineHeight:1.65,marginBottom:18}}>Live dashcam feeds require the Scale plan ($199/mo) with Geotab or Samsara hardware installed in your vehicles.</div>
          <button style={{background:C.sd,color:C.n,border:'none',padding:'10px 24px',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer'}}>Upgrade to Scale →</button>
        </div>
      </div>
    </div>
  );
}

// ── Notices panel (placeholder — requires Twilio SMS reply backend)
function NoticesPanel() {
  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:C.of,padding:48,textAlign:'center'}}>
      <div style={{marginBottom:16,color:C.st,display:'flex',justifyContent:'center'}}><Bell size={32}/></div>
      <div style={{fontSize:16,fontWeight:700,color:C.n,marginBottom:8}}>Pre-Charge Notices</div>
      <div style={{fontSize:13,color:C.sl,maxWidth:380,lineHeight:1.65}}>When Twilio SMS is connected, client replies to charge notices will appear here — confirmations, reschedule requests, card change replies, and cancellations.</div>
    </div>
  );
}

// ── Book Job panel
function BookPanel({ onBooked }) {
  const [clients,setClients]=useState([]);
  const [techs,setTechs]=useState([]);
  const [services,setServices]=useState([]);
  const [search,setSearch]=useState('');
  const [selectedClient,setSelectedClient]=useState(null);
  const [form,setForm]=useState({first:'',last:'',phone:'',email:'',service:'',tech_id:'',date:'',time:'',amount:'',notes:''});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);
  const [err,setErr]=useState('');

  useEffect(()=>{
    mtApi.get('/clients').then(r=>setClients(r.data)).catch(()=>{});
    mtApi.get('/users').then(r=>setTechs(r.data.filter(u=>['tech','manager','owner'].includes(u.role)))).catch(()=>{});
    mtApi.get('/booking-settings').then(r=>{
      const s=r.data?.services;
      if(Array.isArray(s)&&s.length)setServices(s.map(sv=>typeof sv==='string'?sv:sv.name||sv));
    }).catch(()=>{});
  },[]);

  const filteredClients=search.length>1?clients.filter(c=>(c.name||'').toLowerCase().includes(search.toLowerCase())||(c.phone||'').includes(search)):[];

  function selectClient(c){
    const [first,...rest]=c.name.split(' ');
    setForm(f=>({...f,first,last:rest.join(' '),phone:c.phone||'',email:c.email||''}));
    setSelectedClient(c);
    setSearch('');
  }

  async function submit(e){
    e.preventDefault();
    setErr('');
    if(!form.service||!form.date||!form.time){setErr('Service, date and time are required.');return;}
    setSaving(true);
    try{
      let clientId=selectedClient?.id;
      if(!clientId){
        const name=`${form.first} ${form.last}`.trim();
        if(!name){setErr('Client name is required.');setSaving(false);return;}
        const r=await mtApi.post('/clients',{name,phone:form.phone,email:form.email});
        clientId=r.data.id;
      }
      const scheduled_at=new Date(`${form.date}T${form.time}`).toISOString();
      await mtApi.post('/jobs',{client_id:clientId,tech_id:form.tech_id||undefined,service_type:form.service,scheduled_at,amount:form.amount?parseFloat(form.amount):undefined,notes:form.notes});
      setDone(true);
      if(onBooked)onBooked();
    }catch(e2){setErr(e2.response?.data?.error||'Failed to book job.');}
    finally{setSaving(false);}
  }

  const inputStyle={width:'100%',padding:'10px 12px',border:`1.5px solid ${C.lg}`,borderRadius:7,fontSize:13,fontFamily:'inherit',color:C.n,outline:'none',background:C.of,boxSizing:'border-box'};
  const labelStyle={display:'block',fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:C.st,marginBottom:5,fontFamily:"'DM Mono',monospace"};
  const BF=({label,children})=><div style={{marginBottom:12}}><label style={labelStyle}>{label}</label>{children}</div>;
  const Row=({children})=><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{children}</div>;
  const Section=({title,children})=><div style={{background:C.wh,border:`1px solid ${C.lg}`,borderRadius:12,padding:20,marginBottom:14}}><div style={{fontSize:12,fontWeight:700,color:C.n,letterSpacing:'.04em',textTransform:'uppercase',fontFamily:"'DM Mono',monospace",marginBottom:14,display:'flex',alignItems:'center',gap:8}}><span style={{display:'block',width:3,height:14,background:C.sd,borderRadius:99,flexShrink:0}}/>{title}</div>{children}</div>;

  if(done)return(
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:C.of,padding:48,textAlign:'center'}}>
      <div style={{marginBottom:16,color:C.gn,display:'flex',justifyContent:'center'}}><CheckCircle size={52} strokeWidth={1.5}/></div>
      <div style={{fontSize:18,fontWeight:700,color:C.n,marginBottom:8}}>Job Booked</div>
      <div style={{fontSize:13,color:C.sl,marginBottom:24}}>Confirmation SMS sent if phone number was provided.</div>
      <button onClick={()=>{setDone(false);setForm({first:'',last:'',phone:'',email:'',service:'',tech_id:'',date:'',time:'',amount:'',notes:''});setSelectedClient(null);}} style={{padding:'10px 28px',background:C.sd,color:C.n,border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Book Another Job</button>
    </div>
  );

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.of,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto',padding:20,maxWidth:680,margin:'0 auto',width:'100%'}}>
        <Section title="Client">
          <BF label="Search existing client">
            <div style={{position:'relative'}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type name or phone..." style={inputStyle}/>
              {filteredClients.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:C.wh,border:`1px solid ${C.lg}`,borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,.1)',zIndex:50,maxHeight:200,overflowY:'auto'}}>
                  {filteredClients.map(c=><div key={c.id} onClick={()=>selectClient(c)} style={{padding:'10px 14px',fontSize:13,cursor:'pointer',borderBottom:`1px solid ${C.lg}`,color:C.n}} onMouseEnter={e=>e.currentTarget.style.background=C.of} onMouseLeave={e=>e.currentTarget.style.background=C.wh}>{c.name}{c.phone?` · ${c.phone}`:''}</div>)}
                </div>
              )}
            </div>
          </BF>
          <Row>
            <BF label="First Name"><input value={form.first} onChange={e=>setForm(f=>({...f,first:e.target.value}))} placeholder="First name" style={inputStyle}/></BF>
            <BF label="Last Name"><input value={form.last} onChange={e=>setForm(f=>({...f,last:e.target.value}))} placeholder="Last name" style={inputStyle}/></BF>
          </Row>
          <Row>
            <BF label="Phone"><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="(555) 000-0000" style={inputStyle}/></BF>
            <BF label="Email"><input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="client@email.com" style={inputStyle}/></BF>
          </Row>
        </Section>
        <Section title="Service & Schedule">
          <Row>
            <BF label="Service Type">
              <select value={form.service} onChange={e=>setForm(f=>({...f,service:e.target.value}))} style={inputStyle}>
                <option value="">Select service…</option>
                {services.length>0?services.map(s=><option key={s} value={s}>{s}</option>):<option value="General Service">General Service</option>}
              </select>
            </BF>
            <BF label="Assign Tech">
              <select value={form.tech_id} onChange={e=>setForm(f=>({...f,tech_id:e.target.value}))} style={inputStyle}>
                <option value="">Unassigned</option>
                {techs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </BF>
          </Row>
          <Row>
            <BF label="Date"><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inputStyle}/></BF>
            <BF label="Time"><input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} style={inputStyle}/></BF>
          </Row>
        </Section>
        <Section title="Payment">
          <BF label="Job Amount ($)"><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={inputStyle}/></BF>
        </Section>
        <Section title="Notes">
          <BF label="Job Notes"><textarea rows="3" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Gate code, vehicle details, special instructions..." style={{...inputStyle,resize:'vertical'}}/></BF>
        </Section>
        {err&&<div style={{background:C.rl,color:C.rd,borderRadius:7,padding:'10px 14px',fontSize:13,marginBottom:12}}>{err}</div>}
        <button onClick={submit} disabled={saving} style={{width:'100%',padding:13,background:C.sd,color:C.n,border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:20,opacity:saving?.6:1}}>
          {saving?'Booking…':'Book Job + Send Confirmation →'}
        </button>
      </div>
    </div>
  );
}

// ── Main component
export default function ManagerTablet() {
  const [token,setToken]=useState(()=>localStorage.getItem('mt_token')||localStorage.getItem('fc_token'));
  const [user,setUser]=useState(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [loginErr,setLoginErr]=useState('');
  const [activeTab,setActiveTab]=useState('dispatch');
  const [time,setTime]=useState('');
  const [jobs,setJobs]=useState([]);
  const [techs,setTechs]=useState([]);
  const [selectedTechId,setSelectedTechId]=useState(null);

  useEffect(()=>{
    if(!document.querySelector('link[data-mt-font]')){
      const l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500&display=swap';l.setAttribute('data-mt-font','1');document.head.appendChild(l);
    }
  },[]);

  useEffect(()=>{
    const tick=()=>{const now=new Date();let h=now.getHours(),m=now.getMinutes(),am=h>=12?'PM':'AM';h=h%12||12;setTime(`${h}:${String(m).padStart(2,'0')} ${am}`);};
    tick();const id=setInterval(tick,10000);return()=>clearInterval(id);
  },[]);

  // Load user from token
  useEffect(()=>{
    if(!token)return;
    mtApi.defaults.headers.common['Authorization']=`Bearer ${token}`;
    mtApi.get('/auth/me').then(r=>setUser(r.data.user)).catch(()=>{setToken(null);localStorage.removeItem('mt_token');});
  },[token]);

  // Load dispatch data
  useEffect(()=>{
    if(!token||activeTab!=='dispatch')return;
    const t=today();
    mtApi.get(`/jobs?date=${t}`).then(r=>setJobs(r.data)).catch(()=>{});
    mtApi.get('/users').then(r=>setTechs(r.data.filter(u=>['tech','manager','owner'].includes(u.role)))).catch(()=>{});
  },[token,activeTab]);

  async function doLogin(e){
    e?.preventDefault();setLoginErr('');
    try{
      const r=await mtApi.post('/auth/login',{email:email.trim(),password});
      const{token:t,user:u}=r.data;
      localStorage.setItem('mt_token',t);
      mtApi.defaults.headers.common['Authorization']=`Bearer ${t}`;
      setToken(t);setUser(u);
    }catch(err){setLoginErr(err.response?.data?.error||'Invalid email or password');}
  }

  const nsJobs=jobs.filter(j=>j.status==='noshow');
  const nsJob=nsJobs[0];

  const TABS=[
    {id:'dispatch',Icon:Map,         label:'Dispatch', badge:nsJobs.length>0?String(nsJobs.length):null},
    {id:'dashcam', Icon:Video,       label:'Cameras',  badge:'Scale+',badgeAmber:true},
    {id:'jobs',    Icon:ClipboardList,label:'Jobs'},
    {id:'clients', Icon:Users,       label:'Clients'},
    {id:'deposits',Icon:CreditCard,  label:'Deposits'},
    {id:'notices', Icon:Bell,        label:'Notices'},
    {id:'book',    Icon:Plus,        label:'Book Job'},
  ];

  if(!token||!user){
    return(
      <div style={{position:'fixed',inset:0,zIndex:1000,background:C.n,display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:"'Geist',sans-serif"}}>
        <div style={{width:400,maxWidth:'100%'}}>
          <div style={{fontSize:13,fontWeight:800,letterSpacing:'.16em',textTransform:'uppercase',color:C.wh,marginBottom:32}}>FIELDCORE<sup style={{color:C.sd,fontSize:9}}>™</sup></div>
          <h2 style={{fontFamily:"'Instrument Serif',serif",fontSize:36,color:C.wh,marginBottom:6,fontWeight:400}}>Manager <em style={{color:C.sd}}>View</em></h2>
          <p style={{fontSize:13,color:'rgba(255,255,255,.35)',marginBottom:28,lineHeight:1.6}}>Dispatch · Jobs · Clients · Deposits · Book Jobs</p>
          {loginErr&&<div style={{background:C.rl,color:C.rd,borderRadius:6,padding:'10px 14px',fontSize:13,marginBottom:12}}>{loginErr}</div>}
          <form onSubmit={doLogin}>
            <div style={{marginBottom:12}}>
              <label style={{display:'block',fontSize:9.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(255,255,255,.3)',marginBottom:6,fontFamily:"'Geist Mono',sans-serif"}}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'12px 14px',background:'rgba(255,255,255,.07)',border:'1.5px solid rgba(255,255,255,.1)',borderRadius:7,color:C.wh,fontSize:14,fontFamily:"'Geist',sans-serif",outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{display:'block',fontSize:9.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(255,255,255,.3)',marginBottom:6,fontFamily:"'Geist Mono',sans-serif"}}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'12px 14px',background:'rgba(255,255,255,.07)',border:'1.5px solid rgba(255,255,255,.1)',borderRadius:7,color:C.wh,fontSize:14,fontFamily:"'Geist',sans-serif",outline:'none',boxSizing:'border-box'}}/>
            </div>
            <button type="submit" style={{width:'100%',padding:13,background:C.sd,color:C.n,border:'none',borderRadius:7,fontSize:14,fontWeight:700,fontFamily:"'Geist',sans-serif",cursor:'pointer',marginTop:4}}>Sign in →</button>
          </form>
        </div>
      </div>
    );
  }

  return(
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:"'Geist',sans-serif",background:C.of,color:C.n}}>
      {/* TOPBAR */}
      <div style={{background:C.n,height:52,display:'flex',alignItems:'center',padding:'0 18px',gap:14,flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.06)'}}>
        <span style={{fontSize:13,fontWeight:800,letterSpacing:'.14em',textTransform:'uppercase',color:C.wh,flexShrink:0}}>FIELDCORE<sup style={{color:C.sd,fontSize:8}}>™</sup></span>
        <span style={{fontFamily:"'Geist Mono',monospace",fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:'rgba(255,255,255,.25)',background:'rgba(255,255,255,.06)',padding:'3px 9px',borderRadius:99}}>Manager</span>
        <div style={{display:'flex',alignItems:'center',gap:10,marginLeft:'auto'}}>
          <span style={{fontFamily:"'Geist Mono',monospace",fontSize:11,color:'rgba(255,255,255,.3)',background:'rgba(255,255,255,.05)',padding:'4px 10px',borderRadius:6}}>{time}</span>
          <span style={{fontSize:12,fontWeight:600,color:C.wh}}>{user?.name||'Manager'}</span>
          <div style={{width:32,height:32,background:C.sd,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:C.n,cursor:'pointer'}} onClick={()=>{localStorage.removeItem('mt_token');setToken(null);setUser(null);}}>{initials(user?.name)}</div>
        </div>
      </div>

      {/* TABBAR */}
      <div style={{background:C.n2,display:'flex',alignItems:'center',padding:'0 18px',gap:4,flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.06)',overflowX:'auto'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:'12px 16px',fontSize:12,fontWeight:600,color:activeTab===t.id?C.sd:'rgba(255,255,255,.35)',cursor:'pointer',background:'none',border:'none',borderBottom:activeTab===t.id?`2px solid ${C.sd}`:'2px solid transparent',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',flexShrink:0,fontFamily:'inherit',transition:'all .18s'}}>
            <t.Icon size={13}/>{t.label}
            {t.badge&&<span style={{background:t.badgeAmber?C.am2:C.rd2,color:t.badgeAmber?C.n:C.wh,fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:99,fontFamily:"'DM Mono',monospace"}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* PANELS */}
      <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
        {activeTab==='dispatch'&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 340px',overflow:'hidden'}}>
              <DispatchMap jobs={jobs} techs={techs} onTechClick={setSelectedTechId} onGoToCam={()=>setActiveTab('dashcam')}/>
              {/* Sidebar */}
              <div style={{background:C.wh,borderLeft:`1px solid ${C.lg}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.lg}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.n}}>Today's Techs</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.st,background:C.cr,padding:'2px 8px',borderRadius:99}}>{techs.length} techs</span>
                </div>
                <div style={{flex:1,overflowY:'auto',padding:10}}>
                  {nsJob&&(
                    <div style={{background:C.rl,border:'1px solid rgba(181,42,42,.2)',borderRadius:8,padding:'10px 12px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:8,height:8,background:C.rd2,borderRadius:'50%',flexShrink:0,animation:'mt-pulse 1.4s infinite'}}/>
                      <div style={{fontSize:11.5,color:C.rd,fontWeight:600,flex:1}}>{nsJob.tech_name||'Tech'} · No-show active</div>
                    </div>
                  )}
                  {techs.length===0&&<div style={{padding:24,textAlign:'center',fontSize:12,color:C.st}}>No techs scheduled today.</div>}
                  {techs.map(tech=>{
                    const activeJob=jobs.find(j=>j.tech_id===tech.id&&['in_progress','scheduled'].includes(j.status));
                    const nsJobTech=jobs.find(j=>j.tech_id===tech.id&&j.status==='noshow');
                    const curJob=activeJob||nsJobTech;
                    const sm=nsJobTech?{label:'No-Show',bg:C.rl,color:C.rd}:activeJob?.status==='in_progress'?{label:'Active',bg:C.gl,color:C.gn}:{label:'Standby',bg:C.al,color:C.am};
                    return(
                      <div key={tech.id} onClick={()=>setSelectedTechId(tech.id)}
                        style={{background:selectedTechId===tech.id?C.slt:C.of,border:`1px solid ${selectedTechId===tech.id?C.sd:C.lg}`,borderRadius:10,padding:12,marginBottom:8,cursor:'pointer',transition:'all .18s'}}>
                        <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:8}}>
                          <div style={{width:34,height:34,borderRadius:'50%',background:C.n3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:C.sd,flexShrink:0}}>{initials(tech.name)}</div>
                          <div>
                            <div style={{fontSize:13,fontWeight:700,color:C.n}}>{tech.name}</div>
                            <div style={{fontSize:10.5,color:C.st,textTransform:'capitalize'}}>{tech.role}</div>
                          </div>
                          <span style={{marginLeft:'auto',fontSize:9.5,fontWeight:700,padding:'3px 9px',borderRadius:99,background:sm.bg,color:sm.color}}>{sm.label}</span>
                        </div>
                        <div style={{background:C.wh,borderRadius:7,padding:'9px 10px',fontSize:11.5,color:C.sl}}>
                          {curJob?`${curJob.client_name} · ${curJob.service_type} · ${fmtTime(curJob.scheduled_at)}`:'No jobs scheduled'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {nsJob&&(
                  <div style={{background:C.rl,borderTop:`2px solid ${C.rd}`,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                    <div style={{flex:1,fontSize:13,fontWeight:600,color:C.rd,display:'flex',alignItems:'center',gap:6}}><AlertTriangle size={14}/>{nsJob.client_name} · {nsJob.service_type}</div>
                    <button onClick={()=>mtApi.patch(`/jobs/${nsJob.id}/status`,{status:'complete'}).then(()=>setJobs(j=>j.map(x=>x.id===nsJob.id?{...x,status:'complete'}:x)))} style={{padding:'9px 18px',borderRadius:7,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:C.gl,color:C.gn,display:'flex',alignItems:'center',gap:5}}><Check size={12} strokeWidth={2.5}/>Arrived</button>
                    <button onClick={()=>mtApi.patch(`/jobs/${nsJob.id}/noshow`).then(()=>setJobs(j=>j.map(x=>x.id===nsJob.id?{...x,status:'noshow'}:x)))} style={{padding:'9px 18px',borderRadius:7,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:C.rl,color:C.rd}}>Declare</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab==='dashcam'&&<CamerasPanel/>}
        {activeTab==='jobs'&&<JobsPanel/>}
        {activeTab==='clients'&&<ClientsPanel/>}
        {activeTab==='deposits'&&<DepositsPanel/>}
        {activeTab==='notices'&&<NoticesPanel/>}
        {activeTab==='book'&&<BookPanel onBooked={()=>{const t=today();mtApi.get(`/jobs?date=${t}`).then(r=>setJobs(r.data));}}/>}
      </div>
      <style>{`@keyframes mt-pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}
