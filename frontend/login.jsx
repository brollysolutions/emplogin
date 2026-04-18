import { useState, useEffect, useRef } from "react";
import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

/* ── Design tokens ─────────────────────────────────────────── */
const T = {
  ink:      "#0b1f35",
  ink2:     "#2c4a6e",
  muted:    "#6b82a0",
  faint:    "#a8bcd4",
  border:   "#dce8f4",
  surface:  "#f5f8fc",
  white:    "#ffffff",
  accent:   "#1560bd",
  accent2:  "#0ea5e9",
  green:    "#0d9e6e",
  greenBg:  "#e8fdf5",
  red:      "#d93b3b",
  redBg:    "#fef0f0",
  amber:    "#b45309",
  amberBg:  "#fffbeb",
  purple:   "#6d28d9",
  purpleBg: "#f3f0ff",
};

/* ── Helpers ───────────────────────────────────────────────── */
const pad = n => String(n).padStart(2,"0");
const fmtTime  = d => d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true});
const fmtDate  = d => d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
const fmtShort = d => d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"});

function calcHrs(a,b){
  if(!a||!b) return null;
  const s=Math.floor((b-a)/1000);
  return {h:Math.floor(s/3600),m:Math.floor((s%3600)/60),s:s%60,total:s/3600};
}
function hmsStr(o){
  if(!o) return "—";
  return `${pad(o.h)}:${pad(o.m)}:${pad(o.s)}`;
}
function initials(name){
  return name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
}

const FALLBACK_CREDS = [
  {id:"EMP001",name:"Arjun Sharma",  username:"arjun.sharma", password:"pass123",dept:"Engineering",role:"Software Engineer"},
];

// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxNHIX32g4_K2FlxAJO6g0XpEdUW7ennEEnwH-0XK_SoecTAzZ66hcRIhGh2HxCYsGj/exec";

/* ── Avatar ────────────────────────────────────────────────── */
function Avatar({name, size=40, accent=T.accent}){
  const ini = initials(name);
  const hue = name.split("").reduce((a,c)=>a+c.charCodeAt(0),0)%360;
  const bg  = `hsl(${hue},55%,92%)`;
  const fg  = `hsl(${hue},60%,32%)`;
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:bg,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontWeight:700,fontSize:size*0.36,color:fg,flexShrink:0,letterSpacing:0.5}}>
      {ini}
    </div>
  );
}

/* ── Icon components ───────────────────────────────────────── */
const Icon = ({d,size=16,color="currentColor",stroke=2})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);
const icons = {
  user:     "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  lock:     "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
  clock:    "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2",
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  logout:   "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  check:    "M20 6L9 17l-5-5",
  upload:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  save:     "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  chart:    "M18 20V10M12 20V4M6 20v-6",
  workstatus:    "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  eye:      "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff:   "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
  refresh:  "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  info:     "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 16v-4M12 8h.01",
};

/* ══════════════════════════════════════════════════════════════
   LOGIN PAGE
══════════════════════════════════════════════════════════════ */
function LoginPage({onLogin, error, isSyncing}){
  const [u,setU]=useState("");
  const [p,setP]=useState("");
  const [show,setShow]=useState(false);
  const [shake,setShake]=useState(false);

  useEffect(()=>{
    if(error){setShake(true);setTimeout(()=>setShake(false),500);}
  },[error]);

  const submit=()=>onLogin(u,p);

  const isOffline = error && error.toLowerCase().includes("offline");
  const isAuthError = error && !isOffline;

  /* ── Sidebar illustration dots ── */
  const dots=Array.from({length:30},(_,i)=>({
    cx:10+Math.sin(i*0.7)*80+100, cy:20+i*22,
    r:2+Math.sin(i*1.3)*1.5, op:0.08+Math.sin(i*0.5)*0.07
  }));

  return (
    <div style={{minHeight:"100vh",display:"flex",fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#f0f4fa"}}>

      {/* ── Left panel ── */}
      <div style={{flex:"0 0 420px",background:T.ink,display:"flex",flexDirection:"column",
        justifyContent:"space-between",padding:"48px 40px",position:"relative",overflow:"hidden"}}>

        {/* decorative circles */}
        <div style={{position:"absolute",top:-80,left:-80,width:280,height:280,
          borderRadius:"50%",background:"rgba(21,96,189,0.18)"}}/>
        <div style={{position:"absolute",bottom:-60,right:-60,width:220,height:220,
          borderRadius:"50%",background:"rgba(14,165,233,0.12)"}}/>
        <div style={{position:"absolute",top:"40%",right:-40,width:160,height:160,
          borderRadius:"50%",background:"rgba(21,96,189,0.1)"}}/>

        {/* Logo */}
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:56}}>
            <div style={{width:44,height:44,borderRadius:12,background:T.accent,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Icon d={icons.workstatus} size={22} color="white" stroke={2}/>
            </div>
            <div>
              <div style={{color:"white",fontWeight:700,fontSize:16,letterSpacing:0.3}}>Brolly LogIn Page</div>
              <div style={{color:T.faint,fontSize:11,letterSpacing:0.5}}>ATTENDANCE SYSTEM</div>
            </div>
          </div>

          <h1 style={{color:"white",fontSize:32,fontWeight:700,lineHeight:1.25,margin:"0 0 16px"}}>
            Track time.<br/>Manage work.<br/>Stay ahead.
          </h1>
          <p style={{color:T.faint,fontSize:14,lineHeight:1.7,margin:0}}>
            A complete employee attendance and task management platform — login, track hours, and export to Excel seamlessly.
          </p>
        </div>

        {/* Feature pills */}
        <div style={{position:"relative",zIndex:1}}>
          {[
            {icon:icons.clock,   text:"Real-time clock-in / clock-out"},
            {icon:icons.chart,   text:"Auto working hours calculation"},
            {icon:icons.save,    text:"One-click Excel export"},
            {icon:icons.workstatus,   text:"Daily task logging"},
          ].map((f,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <div style={{width:32,height:32,borderRadius:8,background:"rgba(21,96,189,0.35)",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Icon d={f.icon} size={15} color={T.accent2}/>
              </div>
              <span style={{color:"rgba(255,255,255,0.75)",fontSize:13}}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{position:"relative",zIndex:1,color:T.faint,fontSize:11}}>
          © 2025 Brolly LogIn Page. All rights reserved.
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"40px 24px"}}>
        <div style={{
          width:"100%",maxWidth:400,
          background:T.white,borderRadius:20,
          border:`1px solid ${T.border}`,
          padding:"40px 36px",
          animation:shake?"shake 0.4s ease":"none"
        }}>
          <style>{`
            @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
            .inp{width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid #dce8f4;font-size:14px;
              outline:none;box-sizing:border-box;color:${T.ink};background:white;transition:border 0.2s;}
            .inp:focus{border-color:${T.accent};}
            .inp::placeholder{color:${T.faint};}
            .btn-primary{width:100%;padding:13px;border-radius:10px;border:none;
              background:${T.accent};color:white;font-weight:700;font-size:15px;
              cursor:pointer;letter-spacing:0.3px;transition:background 0.15s,transform 0.1s;}
            .btn-primary:hover{background:#1255a8;}
            .btn-primary:active{transform:scale(0.98);}
            .btn-ghost{background:none;border:1.5px solid ${T.border};border-radius:10px;
              padding:9px 16px;font-size:13px;color:${T.ink2};cursor:pointer;
              display:flex;align-items:center;gap:8px;transition:border 0.2s,background 0.15s;}
            .btn-ghost:hover{background:${T.surface};border-color:${T.accent};}
          `}</style>

          <div style={{marginBottom:32}}>
            <div style={{width:48,height:48,borderRadius:13,background:T.surface,
              border:`1.5px solid ${T.border}`,display:"flex",alignItems:"center",
              justifyContent:"center",marginBottom:20}}>
              <Icon d={icons.user} size={22} color={T.accent}/>
            </div>
            <h2 style={{margin:"0 0 6px",fontSize:22,fontWeight:700,color:T.ink}}>Sign in</h2>
            <p style={{margin:0,fontSize:13,color:T.muted}}>Enter your credentials to access the portal</p>
          </div>

          {/* Username */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink2,marginBottom:7,letterSpacing:0.4}}>
              USERNAME
            </label>
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)"}}>
                <Icon d={icons.user} size={15} color={T.faint}/>
              </div>
              <input className="inp" placeholder="your.username" value={u}
                onChange={e=>setU(e.target.value)}
                style={{paddingLeft:38, borderColor: error?"#f09595":""}} />
            </div>
          </div>

          {/* Password */}
          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink2,marginBottom:7,letterSpacing:0.4}}>
              PASSWORD
            </label>
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)"}}>
                <Icon d={icons.lock} size={15} color={T.faint}/>
              </div>
              <input className="inp" type={show?"text":"password"} placeholder="••••••••" value={p}
                onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
                style={{paddingLeft:38,paddingRight:42, borderColor: error?"#f09595":""}} />
              <button onClick={()=>setShow(v=>!v)}
                style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                  background:"none",border:"none",cursor:"pointer",padding:0,color:T.faint}}>
                <Icon d={show?icons.eyeOff:icons.eye} size={16} color={T.faint}/>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",
              borderRadius:10,background:T.redBg,border:`1px solid #fca5a5`,
              marginBottom:18,fontSize:13,color:T.red}}>
              <Icon d={icons.info} size={15} color={T.red}/>
              {error}
            </div>
          )}

          <button className="btn-primary" onClick={submit}>Sign in to Brolly LogIn Page</button>

          <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}}>
            <div style={{flex:1,height:1,background:T.border}}/>
            <span style={{fontSize:12,color:T.faint}}>or</span>
            <div style={{flex:1,height:1,background:T.border}}/>
          </div>

          {isSyncing ? (
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,
              fontSize:12,color:T.accent,justifyContent:"center"}}>
              <div style={{width:12,height:12,border:`2px solid ${T.accent}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
              Connecting to Cloud Sheet...
            </div>
          ) : isOffline ? (
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,
              fontSize:12,color:T.amber,justifyContent:"center"}}>
              <Icon d={icons.info} size={13} color={T.amber}/>
              Offline Mode: Using local fallback
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,
              fontSize:12,color:T.green,justifyContent:"center"}}>
              <Icon d={icons.check} size={13} color={T.green}/>
              Online: Data synced from Sheet
            </div>
          )}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

          <p style={{textAlign:"center",marginTop:20,fontSize:11,color:T.faint,lineHeight:1.6}}>
            Contact your administrator to reset credentials or add new accounts to the Excel file.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STAT CARD
══════════════════════════════════════════════════════════════ */
function StatCard({label,value,sub,icon,color,bg}){
  return (
    <div style={{background:T.white,borderRadius:16,padding:"20px 22px",
      border:`1px solid ${T.border}`,flex:1,minWidth:0}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:0.6,color:T.muted,textTransform:"uppercase"}}>{label}</span>
        <div style={{width:34,height:34,borderRadius:9,background:bg,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Icon d={icon} size={16} color={color}/>
        </div>
      </div>
      <div style={{fontSize:22,fontWeight:700,color:T.ink,marginBottom:3,fontVariantNumeric:"tabular-nums"}}>{value}</div>
      {sub && <div style={{fontSize:12,color:T.muted}}>{sub}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STATUS BADGE
══════════════════════════════════════════════════════════════ */
function Badge({status}){
  const map={
    "Full Day":  {bg:"#e8fdf5",color:T.green,  dot:"#0d9e6e"},
    "Half Day":  {bg:T.amberBg,color:T.amber,  dot:"#b45309"},
    "Incomplete":{bg:"#fef0f0",color:T.red,    dot:"#d93b3b"},
  };
  const s=map[status]||map["Incomplete"];
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,
      padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
      background:s.bg,color:s.color}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:s.dot,flexShrink:0}}/>
      {status}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════════ */
function Dashboard({employee, onSignOut}){
  const [now,setNow]         = useState(new Date());
  const [loginTime,setLT]    = useState(null);
  const [logoutTime,setLOT]  = useState(null);
  const [status,setStatus]   = useState("idle");
  const [taskInput,setTask]  = useState("");
  const [toast,setToast]     = useState(null);
  const [history,setHistory] = useState([]);
  const [xlWb,setXlWb]       = useState(null);
  const [xlName,setXlName]   = useState(null);
  const [activeTab,setTab]   = useState("today");
  const fileRef = useRef(null);

  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);

  const showToast=(msg,type="success")=>{
    setToast({msg,type});
    setTimeout(()=>setToast(null),3500);
  };

  const liveHrs = calcHrs(loginTime, status==="loggedIn"?now:logoutTime);

  const handleLogin=()=>{
    setLT(new Date());
    setStatus("loggedIn");
    showToast("Clock-in recorded successfully","success");
  };
  const handleLogout=()=>{
    if(!loginTime)return;
    setLOT(new Date());
    setStatus("loggedOut");
    showToast("Clock-out recorded. Don't forget to save!","info");
  };

  const handleLoadXl=(e)=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const wb=XLSX.read(ev.target.result,{type:"binary"});
      setXlWb(wb); setXlName(file.name);
      const ws=wb.Sheets["Attendance"];
      if(ws){
        const rows=XLSX.utils.sheet_to_json(ws,{header:1});
        const emp=rows.slice(1).filter(r=>r[1]===employee.id);
        setHistory(emp.map(r=>({date:r[0],loginT:r[4],logoutT:r[5],hours:r[6],workstatus:r[7],status:r[8]})));
      }
      showToast(`Loaded: ${file.name}`,"success");
    };
    reader.readAsBinaryString(file);
  };

  const handleSave=async ()=>{
    if(!loginTime){showToast("Please clock in first","error");return;}
    if(status!=="loggedOut"){showToast("Please clock out before saving","error");return;}
    
    showToast("Syncing to Google Sheets...","info");
    const lt=logoutTime||new Date();
    const hrs=calcHrs(loginTime,lt);
    const dayStatus=hrs&&hrs.total>=8?"Full Day":"Half Day";

    const payload = {
      date: fmtDate(loginTime),
      id: employee.id,
      name: employee.name,
      dept: employee.dept,
      loginT: fmtTime(loginTime),
      logoutT: fmtTime(lt),
      hours: hmsStr(hrs),
      workstatus: taskInput||"—",
      status: dayStatus
    };

    try {
      if (SCRIPT_URL && !SCRIPT_URL.includes("YOUR_SCRIPT_URL_HERE")) {
        // Use text/plain to avoid CORS preflight (OPTIONS request) which Apps Script doesn't handle
        const response = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });
        
        // Even with redirects, fetch will return ok if it eventually gets a 200
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setHistory(prev=>[...prev,{date:payload.date,loginT:payload.loginT,logoutT:payload.logoutT,hours:payload.hours,workstatus:payload.workstatus,status:dayStatus}]);
      showToast("Attendance synced to Cloud!","success");
    } catch (err) {
      console.error("Cloud sync failed:", err);
      showToast("Cloud sync failed. Check internet or Script URL.","error");
      
      // Fallback: Try to download Excel if cloud fails and user context exists
      try {
        const wb=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Date","ID","Name","Dept","In","Out","Hrs","workstatus","Status"],[payload.date,payload.id,payload.name,payload.dept,payload.loginT,payload.logoutT,payload.hours,payload.workstatus,payload.status]]),"Attendance");
        XLSX.writeFile(wb,"Attendance_Backup.xlsx");
      } catch (e) {
        console.error("Fallback export failed:", e);
      }
    }
  };

  /* ── Progress bar for hours ── */
  const hoursGoal=8;
  const hrsFloat=liveHrs?Math.min(liveHrs.total,hoursGoal):0;
  const pct=Math.round((hrsFloat/hoursGoal)*100);

  const greetHour=now.getHours();
  const greeting=greetHour<12?"Good morning":greetHour<17?"Good afternoon":"Good evening";

  return (
    <div style={{minHeight:"100vh",background:"#eef3f9",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`
        .tab{padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;
          font-weight:600;transition:all 0.15s;background:none;color:${T.muted};}
        .tab.active{background:${T.white};color:${T.ink};box-shadow:0 1px 4px rgba(0,0,0,0.07);}
        .tab:hover:not(.active){color:${T.ink2};}
        .act-btn{padding:12px 24px;border-radius:11px;border:none;font-weight:700;
          font-size:14px;cursor:pointer;display:flex;align-items:center;gap:8px;
          transition:all 0.15s;}
        .act-btn:active{transform:scale(0.97);}
        .act-btn:disabled{opacity:0.45;cursor:not-allowed;transform:none;}
        .task-area{width:100%;padding:12px 14px;border-radius:11px;border:1.5px solid ${T.border};
          font-size:13px;resize:vertical;outline:none;font-family:inherit;color:${T.ink};
          background:white;transition:border 0.2s;min-height:90px;box-sizing:border-box;}
        .task-area:focus{border-color:${T.accent};}
        .task-area::placeholder{color:${T.faint};}
        .hist-row:hover{background:${T.surface};}
        @keyframes slideIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{position:"fixed",top:20,right:20,zIndex:999,
          padding:"12px 20px",borderRadius:12,fontSize:13,fontWeight:600,
          display:"flex",alignItems:"center",gap:10,animation:"slideIn 0.25s ease",
          background: toast.type==="success"?T.green:toast.type==="error"?T.red:T.accent,
          color:"white",boxShadow:"0 4px 20px rgba(0,0,0,0.15)"}}>
          <Icon d={toast.type==="success"?icons.check:icons.info} size={15} color="white"/>
          {toast.msg}
        </div>
      )}

      {/* ── Topbar ── */}
      <div style={{background:T.white,borderBottom:`1px solid ${T.border}`,
        padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:9,background:T.accent,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon d={icons.workstatus} size={18} color="white"/>
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:T.ink,letterSpacing:0.2}}>Brolly LogIn Page</div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:0.5}}>ATTENDANCE SYSTEM</div>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
          borderRadius:10,background:T.surface,border:`1px solid ${T.border}`}}>
          <div style={{width:6,height:6,borderRadius:"50%",
            background:status==="loggedIn"?T.green:T.faint,
            animation:status==="loggedIn"?"pulse 2s infinite":"none"}}/>
          <span style={{fontSize:12,color:T.muted}}>
            {status==="loggedIn"?"Active":status==="loggedOut"?"Session Ended":"Not Clocked In"}
          </span>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Avatar name={employee.name} size={34}/>
          <div style={{marginRight:4}}>
            <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{employee.name}</div>
            <div style={{fontSize:11,color:T.muted}}>{employee.role}</div>
          </div>
          <button onClick={onSignOut} style={{display:"flex",alignItems:"center",gap:6,
            padding:"7px 14px",borderRadius:9,border:`1.5px solid ${T.border}`,
            background:"none",color:T.muted,cursor:"pointer",fontSize:12,fontWeight:600,
            transition:"all 0.15s"}}>
            <Icon d={icons.logout} size={14} color={T.muted}/>
            Sign out
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{maxWidth:1080,margin:"0 auto",padding:"28px 24px"}}>

        {/* Greeting row */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div>
            <h1 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:T.ink}}>
              {greeting}, {employee.name.split(" ")[0]} 👋
            </h1>
            <p style={{margin:0,fontSize:13,color:T.muted}}>
              {now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
            </p>
          </div>

          {/* Live clock */}
          <div style={{background:T.ink,borderRadius:14,padding:"14px 22px",textAlign:"right"}}>
            <div style={{fontSize:26,fontWeight:700,color:"white",
              fontVariantNumeric:"tabular-nums",letterSpacing:1}}>
              {now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
            </div>
            <div style={{fontSize:11,color:T.faint,marginTop:2}}>
              IST · {now.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{display:"flex",gap:14,marginBottom:22}}>
          <StatCard label="Login Time"   value={loginTime?fmtTime(loginTime):"—"}
            sub={loginTime?fmtDate(loginTime):"Not clocked in yet"}
            icon={icons.clock} color={T.green} bg={T.greenBg}/>
          <StatCard label="Logout Time"  value={logoutTime?fmtTime(logoutTime):"—"}
            sub={logoutTime?"Session complete":"In progress"}
            icon={icons.logout} color={T.red} bg={T.redBg}/>
          <StatCard label="Hours Worked" value={hmsStr(liveHrs)}
            sub={`${pct}% of daily goal (8h)`}
            icon={icons.chart} color={T.accent} bg="#e8f0fc"/>
          <StatCard label="Total Records" value={String(history.length)}
            sub="in attendance log"
            icon={icons.calendar} color={T.purple} bg={T.purpleBg}/>
        </div>

        {/* Progress bar */}
        {status!=="idle" && (
          <div style={{background:T.white,borderRadius:14,padding:"16px 20px",
            border:`1px solid ${T.border}`,marginBottom:22}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:13,fontWeight:600,color:T.ink}}>Daily progress</span>
              <span style={{fontSize:13,fontWeight:700,color:pct>=100?T.green:T.accent}}>{pct}%</span>
            </div>
            <div style={{height:8,background:T.surface,borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,borderRadius:99,
                background: pct>=100?T.green:T.accent,transition:"width 1s linear"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,color:T.muted}}>
              <span>{hmsStr(liveHrs)} elapsed</span>
              <span>Goal: 8:00:00</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",gap:4,background:"#e4eaf3",borderRadius:10,
          padding:4,marginBottom:20,width:"fit-content"}}>
          {[{k:"today",label:"Today's Session"},{k:"history",label:"Attendance History"}].map(t=>(
            <button key={t.k} className={`tab${activeTab===t.k?" active":""}`}
              onClick={()=>setTab(t.k)}>{t.label}</button>
          ))}
        </div>

        {activeTab==="today" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>

            {/* Clock-in / out */}
            <div style={{background:T.white,borderRadius:16,padding:"24px",
              border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
                <div style={{width:38,height:38,borderRadius:10,background:"#e8f0fc",
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Icon d={icons.clock} size={18} color={T.accent}/>
                </div>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:T.ink}}>Attendance</div>
                  <div style={{fontSize:12,color:T.muted}}>Record your working hours</div>
                </div>
              </div>

              <div style={{display:"flex",gap:10,marginBottom:20}}>
                <button className="act-btn" disabled={status!=="idle"} onClick={handleLogin}
                  style={{flex:1,background:status==="idle"?T.green:"#e0e0e0",
                    color:status==="idle"?"white":"#aaa",justifyContent:"center"}}>
                  <Icon d={icons.check} size={16} color={status==="idle"?"white":"#aaa"}/>
                  Clock In
                </button>
                <button className="act-btn" disabled={status!=="loggedIn"} onClick={handleLogout}
                  style={{flex:1,background:status==="loggedIn"?T.red:"#e0e0e0",
                    color:status==="loggedIn"?"white":"#aaa",justifyContent:"center"}}>
                  <Icon d={icons.logout} size={16} color={status==="loggedIn"?"white":"#aaa"}/>
                  Clock Out
                </button>
              </div>

              {/* Status timeline */}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[
                  {label:"Clocked in",  time:loginTime?fmtTime(loginTime):null,  done:!!loginTime,  color:T.green},
                  {label:"Clocked out", time:logoutTime?fmtTime(logoutTime):null, done:!!logoutTime, color:T.red},
                  {label:"Hours logged",time:hmsStr(liveHrs)==="—"?null:hmsStr(liveHrs), done:!!logoutTime,color:T.accent},
                ].map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,
                    padding:"10px 14px",borderRadius:10,
                    background:s.done?`${s.color}10`:T.surface,
                    border:`1px solid ${s.done?s.color+"30":T.border}`}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                      background:s.done?s.color:T.border,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {s.done
                        ? <Icon d={icons.check} size={13} color="white" stroke={2.5}/>
                        : <span style={{width:8,height:8,borderRadius:"50%",background:T.faint}}/>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600,color:s.done?s.color:T.muted}}>{s.label}</div>
                      {s.time && <div style={{fontSize:13,fontWeight:700,color:T.ink,marginTop:1}}>{s.time}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* workstatus + Save */}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>

              {/* Task entry */}
              <div style={{background:T.white,borderRadius:16,padding:"24px",
                border:`1px solid ${T.border}`,flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <div style={{width:38,height:38,borderRadius:10,background:T.purpleBg,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Icon d={icons.workstatus} size={18} color={T.purple}/>
                  </div>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:T.ink}}>workstatus Done Today</div>
                    <div style={{fontSize:12,color:T.muted}}>Will be saved to Excel</div>
                  </div>
                </div>
                <textarea className="task-area" value={taskInput}
                  onChange={e=>setTask(e.target.value)}
                  placeholder="• Completed feature X&#10;• Reviewed PR #42&#10;• Attended standup meeting&#10;• Fixed bug in auth module"/>
                <div style={{marginTop:8,fontSize:11,color:T.faint,display:"flex",alignItems:"center",gap:4}}>
                  <Icon d={icons.info} size={12} color={T.faint}/>
                  Use bullet points to list individual workstatus
                </div>
              </div>

              {/* Excel save */}
              <div style={{background:T.white,borderRadius:16,padding:"20px 24px",
                border:`1px solid ${T.border}`}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:14}}>Save to Excel</div>

                  <button onClick={handleSave}
                    style={{flex:1,padding:"10px 14px",borderRadius:10,border:"none",
                      background:T.accent,color:"white",cursor:"pointer",fontSize:13,
                      fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:7, width: "100%"}}>
                    <Icon d={icons.refresh} size={14} color="white"/>
                    Sync to Cloud
                  </button>
                </div>

                <div style={{marginTop:10,padding:"10px 12px",borderRadius:9,
                  background:T.surface,border:`1px solid ${T.border}`,fontSize:12,color:T.muted,
                  display:"flex",gap:8,alignItems:"flex-start"}}>
                  <Icon d={icons.info} size={13} color={T.faint}/>
                  <span>Attendance is automatically sent to the <b style={{color:T.ink2}}>Google Sheet</b> when you click Sync.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History tab */}
        {activeTab==="history" && (
          <div style={{background:T.white,borderRadius:16,border:`1px solid ${T.border}`,overflow:"hidden"}}>
            <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:T.ink}}>Attendance History</div>
                <div style={{fontSize:12,color:T.muted}}>{history.length} records for {employee.name}</div>
              </div>
              {history.length===0 && (
                <div style={{fontSize:12,color:T.muted,display:"flex",alignItems:"center",gap:6}}>
                  <Icon d={icons.info} size={13} color={T.faint}/>
                  Load the Excel file to view history
                </div>
              )}
            </div>

            {history.length===0 ? (
              <div style={{padding:"60px 24px",textAlign:"center"}}>
                <div style={{width:56,height:56,borderRadius:14,background:T.surface,
                  border:`1px solid ${T.border}`,display:"flex",alignItems:"center",
                  justifyContent:"center",margin:"0 auto 14px"}}>
                  <Icon d={icons.calendar} size={24} color={T.faint}/>
                </div>
                <div style={{fontSize:14,fontWeight:600,color:T.muted,marginBottom:4}}>No records yet</div>
                <div style={{fontSize:12,color:T.faint}}>
                  Load the Excel file and save your attendance to see records here.
                </div>
              </div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:T.surface}}>
                      {["Date","Clock In","Clock Out","Hours","Status","workstatus"].map(h=>(
                        <th key={h} style={{padding:"11px 16px",textAlign:"left",
                          fontSize:11,fontWeight:700,color:T.muted,letterSpacing:0.5,
                          borderBottom:`1px solid ${T.border}`,textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((r,i)=>(
                      <tr key={i} className="hist-row"
                        style={{borderBottom:`1px solid ${T.border}`,transition:"background 0.1s"}}>
                        <td style={{padding:"12px 16px",color:T.ink,fontWeight:600}}>{r.date}</td>
                        <td style={{padding:"12px 16px",color:T.green,fontWeight:600}}>{r.loginT}</td>
                        <td style={{padding:"12px 16px",color:T.red,fontWeight:600}}>{r.logoutT}</td>
                        <td style={{padding:"12px 16px",fontWeight:700,color:T.ink,fontVariantNumeric:"tabular-nums"}}>{r.hours}</td>
                        <td style={{padding:"12px 16px"}}><Badge status={r.status||"Incomplete"}/></td>
                        <td style={{padding:"12px 16px",color:T.muted,maxWidth:200,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                          title={r.workstatus}>{r.workstatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Employee profile footer */}
        <div style={{marginTop:20,background:T.white,borderRadius:16,padding:"16px 24px",
          border:`1px solid ${T.border}`,display:"flex",alignItems:"center",
          gap:16,justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <Avatar name={employee.name} size={44}/>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:T.ink}}>{employee.name}</div>
              <div style={{fontSize:12,color:T.muted}}>{employee.role} · {employee.dept}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:24}}>
            {[
              {label:"Employee ID",value:employee.id},
              {label:"Department", value:employee.dept},
              {label:"Today's Status",value:status==="idle"?"Pending":status==="loggedIn"?"Active":"Complete"},
            ].map(f=>(
              <div key={f.label} style={{textAlign:"center"}}>
                <div style={{fontSize:11,color:T.muted,marginBottom:2,letterSpacing:0.4}}>{f.label.toUpperCase()}</div>
                <div style={{fontWeight:700,fontSize:13,color:T.ink}}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════ */
export default function App(){
  const [employee,setEmployee]=useState(null);
  const [error,setError]=useState("");
  const [creds,setCreds]=useState(FALLBACK_CREDS);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!SCRIPT_URL || SCRIPT_URL.includes("YOUR_SCRIPT_URL_HERE")) {
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    fetch(SCRIPT_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log("SUCCESS: Cloud credentials loaded (raw):", data);
        if (Array.isArray(data) && data.length > 0) {
          // Normalize all keys to lowercase so sheet header casing doesn't matter
          // e.g. "UserName" → "username", "Id" → "id", "Password" → "password"
          const normalized = data.map(row => {
            const obj = {};
            Object.keys(row).forEach(k => { obj[k.toLowerCase()] = row[k]; });
            return obj;
          });
          console.log("Normalized credentials:", normalized);
          setCreds(normalized);
          setError(""); // Clear any previous offline error
        }
        setIsSyncing(false);
      })
      .catch(err => {
        console.error("ERROR: Cloud fetch failed:", err);
        setError("Offline Mode: Could not reach Google Sheet.");
        setIsSyncing(false);
      });
  }, []);

  const handleLogin=(u,p)=>{
    const userInp = String(u).trim().toLowerCase();
    const passInp = String(p).trim();

    const found = creds.find(c => {
      const dbUser = String(c.username || "").trim().toLowerCase();
      const dbPass = String(c.password || "").trim();
      return dbUser === userInp && dbPass === passInp;
    });

    if(found){
      setEmployee(found);
      setError("");
    } else {
      setError("Invalid username or password. Please try again.");
    }
  };

  if(employee) return <Dashboard employee={employee} onSignOut={()=>{setEmployee(null);setError("");}}/>;

  return (
    <LoginPage onLogin={handleLogin} error={error} isSyncing={isSyncing} />
  );
}
