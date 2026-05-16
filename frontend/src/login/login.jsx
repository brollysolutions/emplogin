import { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
import logo from "../assets/brolly_logo.png";

/* ── Design tokens ─────────────────────────────────────────── */
const T = {
  ink: "#0b1f35",
  ink2: "#2c4a6e",
  muted: "#6b82a0",
  faint: "#a8bcd4",
  border: "#dce8f4",
  surface: "#f5f8fc",
  white: "#ffffff",
  accent: "#1560bd",
  accent2: "#0ea5e9",
  green: "#0d9e6e",
  greenBg: "#e8fdf5",
  red: "#d93b3b",
  redBg: "#fef0f0",
  amber: "#b45309",
  amberBg: "#fffbeb",
  purple: "#6d28d9",
  purpleBg: "#f3f0ff",
  orange: "#f97316",
  orangeBg: "#fff7ed",
};

/* ── Helpers ───────────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2, "0"); }
function fmtDate(d) {
  if (!d) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = pad(d.getDate());
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`; // Matches Python's %d %b %Y
}
function fmtTime(d) {
  if (!d) return "—";
  let h = d.getHours();
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m}:${s} ${ampm}`;
}

function calcHrs(a, b) {
  if (!a || !b) return null;
  const s = Math.floor((b - a) / 1000);
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total: s / 3600 };
}
function hmsStr(o) {
  if (!o) return "—";
  return `${pad(o.h)}:${pad(o.m)}:${pad(o.s)}`;
}
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function secondsToHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s, total: totalSeconds / 3600 };
}

// Helper to parse "HH:MM:SS" string to seconds
function parseHMS(str) {
  if (!str || str === "—") return 0;
  const parts = str.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map(Number);
  return h * 3600 + m * 60 + s;
}

// Helper to format seconds to "HH:MM:SS"
function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

let masterAudioCtx = null;
let lastNotifTime = 0;

const playNotifySound = () => {
  const now = Date.now();
  if (now - lastNotifTime < 1000) return; 
  lastNotifTime = now;

  try {
    if (!masterAudioCtx) {
      masterAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = masterAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    
    const playTone = (freq, time, duration, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type; 
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3, time + 0.01); 
      gain.gain.linearRampToValueAtTime(0, time + duration);
      osc.start(time);
      osc.stop(time + duration);
    };
    // Teams-Style Professional Arpeggio (Ascending Chime)
    const t = ctx.currentTime;
    playTone(440, t, 0.1, 'sine');       // A4
    playTone(554, t + 0.06, 0.1, 'sine'); // C#5
    playTone(659, t + 0.12, 0.1, 'sine'); // E5
    playTone(880, t + 0.18, 0.3, 'sine'); // A5
    console.log("🔊 Professional Chime Played");
  } catch (e) { console.error("Audio error:", e); }
};

const FALLBACK_CREDS = [
  { id: "EMP001", name: "Arjun Sharma", username: "arjun.sharma", password: "pass123", dept: "Engineering", role: "Software Engineer" },
];

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxNHIX32g4_K2FlxAJO6g0XpEdUW7ennEEnwH-0XK_SoecTAzZ66hcRIhGh2HxCYsGj/exec";
// Use relative path in production to work behind the /login/ proxy
const API_BASE = window.location.hostname === "localhost"
  ? "http://localhost:8003/api/v1/"
  : "/test_login/api/v1/";
const BACKEND_URL = API_BASE + "attendance/";
const TASKS_URL = API_BASE + "tasks/";
const LEAVES_URL = API_BASE + "leaves/";
const PROFILES_URL = API_BASE + "profiles/";
const PROFILE_URL = (id) => API_BASE + `profile/${id}/`;
const MESSAGES_URL = API_BASE + "messages/";
const MESSAGES_READ_URL = API_BASE + "messages/read/";
const GROUPS_URL = API_BASE + "groups/";
const HEARTBEAT_URL = API_BASE + "heartbeat/";
const CHAT_SUMMARIES_URL = API_BASE + "chat-summaries/";
const HEALTH_CHECK_URL = API_BASE + "health/";


/* ── Avatar ────────────────────────────────────────────────── */
function Avatar({ name, size = 40, accent = T.accent }) {
  const ini = initials(name);
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const bg = `hsl(${hue},55%,92%)`;
  const fg = `hsl(${hue},60%,32%)`;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.36, color: fg, flexShrink: 0, letterSpacing: 0.5
    }}>
      {ini}
    </div>
  );
}

/* ── Icon components ───────────────────────────────────────── */
const Icon = ({ d, size = 16, color = "currentColor", stroke = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const icons = {
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
  clock: "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2",
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  check: "M20 6L9 17l-5-5",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  chart: "M18 20V10M12 20V4M6 20v-6",
  tasks: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  info: "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 16v-4M12 8h.01",
  chevronLeft: "M15 18l-6-6 6-6",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

/* ══════════════════════════════════════════════════════════════
   LOGIN PAGE – Premium Animated Redesign
══════════════════════════════════════════════════════════════ */
const LOGIN_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes fadeInUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
  @keyframes fadeInLeft { from { opacity:0; transform:translateX(-30px) } to { opacity:1; transform:translateX(0) } }
  @keyframes float1 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-22px) rotate(6deg)} }
  @keyframes float2 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(18px) rotate(-8deg)} }
  @keyframes float3 { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-14px) scale(1.06)} }
  @keyframes pulse-ring { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(1.6);opacity:0} }
  @keyframes gradientBG { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes shimmer { 0%{left:-100%} 100%{left:200%} }
  @keyframes pillSlide { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
  @keyframes glowPulse { 0%,100%{box-shadow:0 0 0 0 rgba(21,96,189,0.3)} 50%{box-shadow:0 0 0 8px rgba(21,96,189,0)} }
  @keyframes logoSpin { 0%{transform:rotateY(0deg)} 100%{transform:rotateY(360deg)} }
  @keyframes pulse { 0% { transform: scale(0.95); opacity: 0.8; } 50% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.8; } }
  @keyframes popIn { 0% { opacity: 0; transform: scale(0.8) translateY(20px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes dotPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }

  .login-inp {
    width:100%; padding:13px 16px; border-radius:12px;
    border:2px solid #e2ebf6; font-size:14px; font-family:'Inter',sans-serif;
    outline:none; box-sizing:border-box; color:#0b1f35; background:#fafcff;
    transition:all 0.25s cubic-bezier(0.4,0,0.2,1);
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .login-inp:focus {
    border-color:#1560bd;
    background:white;
    box-shadow: 0 0 0 4px rgba(21,96,189,0.1), 0 1px 8px rgba(21,96,189,0.15);
    transform: translateY(-1px);
  }
  .login-inp::placeholder { color:#a8bcd4; }
  .login-inp.error { border-color:#f87171; background:#fff8f8; }
  .login-inp.error:focus { box-shadow: 0 0 0 4px rgba(248,113,113,0.15); }
  
  .notif-toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: #0b1f35; color: white; padding: 16px 24px;
    border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    display: flex; alignItems: center; gap: 12px;
    animation: fadeInUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
    border: 1px solid rgba(255,255,255,0.1);
  }

  .login-btn {
    width:100%; padding:14px; border-radius:12px; border:none;
    background: linear-gradient(135deg, #1560bd 0%, #0ea5e9 100%);
    color:white; font-weight:700; font-size:15px; font-family:'Inter',sans-serif;
    cursor:pointer; letter-spacing:0.3px; position:relative; overflow:hidden;
    transition: transform 0.15s, box-shadow 0.2s;
    box-shadow: 0 4px 15px rgba(21,96,189,0.4);
  }
  .login-btn::after {
    content:''; position:absolute; top:0; left:-100%;
    width:60%; height:100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
    animation: shimmer 2.5s infinite;
  }
  .login-btn:hover { transform:translateY(-2px); box-shadow:0 8px 25px rgba(21,96,189,0.5); }
  .login-btn:active { transform:scale(0.98) translateY(0); }

  .forgot-btn {
    background:none; border:none; color:#1560bd; font-size:13px;
    cursor:pointer; font-weight:600; font-family:'Inter',sans-serif;
    padding:2px 0; position:relative;
    transition: color 0.2s;
  }
  .forgot-btn::after {
    content:''; position:absolute; bottom:-1px; left:0; width:0; height:1.5px;
    background:#1560bd; transition:width 0.25s ease;
  }
  .forgot-btn:hover::after { width:100%; }
  .forgot-btn:hover { color:#0d48a8; }

  .feature-pill {
    display:flex; align-items:center; gap:12px; margin-bottom:14px;
    animation: pillSlide 0.5s ease both;
  }
  .feature-pill:nth-child(1){animation-delay:0.1s}
  .feature-pill:nth-child(2){animation-delay:0.2s}
  .feature-pill:nth-child(3){animation-delay:0.3s}
  .feature-pill:nth-child(4){animation-delay:0.4s}

  .eye-btn {
    position:absolute; right:14px; top:50%; transform:translateY(-50%);
    background:none; border:none; cursor:pointer; padding:4px;
    color:#a8bcd4; border-radius:6px;
    transition: color 0.2s, background 0.2s;
  }
  .eye-btn:hover { color:#1560bd; background:rgba(21,96,189,0.08); }

  @media (max-width: 900px) {
    .login-left-panel { display: none !important; }
    .login-right-panel { padding: 24px 16px !important; }
    .login-card { padding: 32px 24px !important; border-radius: 20px !important; }
    .login-title { font-size: 22px !important; }
  }

  @media (max-width: 768px) {
    .dashboard-content { padding: 20px 16px !important; }
    .greeting-row { flex-direction: column; align-items: flex-start !important; gap: 16px; }
    .time-display { width: 100%; text-align: left !important; padding: 12px 20px !important; }
    .stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .main-grid { grid-template-columns: 1fr !important; }
    .profile-footer { flex-direction: column; align-items: flex-start !important; gap: 20px !important; }
    .profile-footer-stats { width: 100%; display: grid !important; grid-template-columns: 1fr 1fr; gap: 16px !important; text-align: left !important; }
    .profile-footer-stats > div { text-align: left !important; }
    
    .adm-topbar { flex-direction: column; height: auto !important; padding: 16px !important; gap: 16px; }
    .adm-topbar-actions { flex-wrap: wrap; justify-content: flex-start !important; gap: 8px !important; width: 100%; }
    .adm-btn-text { display: none; } /* Hide button text on very small screens if needed */
    .stat-value { font-size: 18px !important; }
  }

  @media (max-width: 480px) {
    .stat-grid { grid-template-columns: 1fr !important; }
    .profile-footer-stats { grid-template-columns: 1fr !important; }
  }
`;

function LoginPage({ onLogin, error, isSyncing, onForgot }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uFocus, setUFocus] = useState(false);
  const [pFocus, setPFocus] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      setLoading(false);
      setTimeout(() => setShake(false), 500);
    }
  }, [error]);

  const submit = async () => {
    if (!u || !p) return;
    setLoading(true);
    onLogin(u, p);
  };

  const orbs = [
    { w: 280, h: 280, top: -80, left: -80, bg: "rgba(21,96,189,0.2)", anim: "float1 8s ease-in-out infinite" },
    { w: 220, h: 220, bottom: -60, right: -60, bg: "rgba(14,165,233,0.15)", anim: "float2 10s ease-in-out infinite" },
    { w: 160, h: 160, top: "38%", right: -40, bg: "rgba(21,96,189,0.12)", anim: "float3 7s ease-in-out infinite" },
    { w: 100, h: 100, top: "20%", left: "55%", bg: "rgba(109,40,217,0.08)", anim: "float1 12s ease-in-out infinite 2s" },
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      background: "linear-gradient(135deg, #f0f4fa 0%, #e8f0fe 100%)"
    }}>
      <style>{LOGIN_STYLES}</style>

      {/* ── Left Panel ── */}
      <div className="login-left-panel" style={{
        flex: "0 0 440px",
        background: "linear-gradient(160deg, #0b1f35 0%, #0d2b4e 50%, #0f3460 100%)",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "52px 44px", position: "relative", overflow: "hidden"
      }}>

        {/* Animated Orbs */}
        {orbs.map((o, i) => (
          <div key={i} style={{
            position: "absolute", borderRadius: "50%", background: o.bg,
            width: o.w, height: o.h,
            top: o.top, bottom: o.bottom, left: o.left, right: o.right,
            animation: o.anim
          }} />
        ))}

        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 1, animation: "fadeInLeft 0.7s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 60 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 14, background: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
            }}>
              <img src={logo} alt="Brolly Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 16, letterSpacing: 0.2 }}>Brolly Software Solutions</div>
              <div style={{ color: "rgba(168,188,212,0.8)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>ATTENDANCE MANAGEMENT</div>
            </div>
          </div>

          <h1 style={{
            color: "white", fontSize: 34, fontWeight: 800, lineHeight: 1.2,
            margin: "0 0 18px", letterSpacing: -0.5
          }}>
            Track time.<br />
            <span style={{ color: "#38bdf8" }}>Manage work.</span><br />
            Stay ahead.
          </h1>
          <p style={{ color: "rgba(168,188,212,0.85)", fontSize: 13.5, lineHeight: 1.75, margin: 0 }}>
            A complete employee attendance and task management platform — login, track hours, and export to Excel seamlessly.
          </p>
        </div>

        {/* Feature Pills */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {[
            { icon: icons.clock, text: "Real-time clock-in / clock-out", color: "#38bdf8" },
            { icon: icons.chart, text: "Auto working hours calculation", color: "#34d399" },
            { icon: icons.save, text: "One-click Excel export", color: "#a78bfa" },
            { icon: icons.tasks, text: "Daily task logging", color: "#fb923c" },
          ].map((f, i) => (
            <div key={i} className="feature-pill">
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${f.color}20`, border: `1px solid ${f.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>
                <Icon d={f.icon} size={16} color={f.color} />
              </div>
              <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 13.5, fontWeight: 500 }}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{ position: "relative", zIndex: 1, color: "rgba(168,188,212,0.5)", fontSize: 11, letterSpacing: 0.3 }}>
          © 2026 Brolly Software Solutions. All rights reserved.
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="login-right-panel" style={{
        flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "40px 24px"
      }}>
        <div style={{
          width: "100%", maxWidth: 420,
          animation: shake ? "shake 0.42s ease" : "fadeInUp 0.6s cubic-bezier(0.4,0,0.2,1) both"
        }}>

          {/* Card */}
          <div className="login-card" style={{
            background: "white", borderRadius: 24,
            border: "1px solid rgba(220,232,244,0.8)",
            padding: "44px 40px",
            boxShadow: "0 20px 60px rgba(11,31,53,0.1), 0 4px 20px rgba(11,31,53,0.06)"
          }}>

            {/* Header */}
            <div style={{ marginBottom: 36 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: "linear-gradient(135deg, #e8f0fe, #dbeafe)",
                border: "2px solid #bfdbfe",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 22, position: "relative"
              }}>
                <Icon d={icons.user} size={24} color="#1560bd" />
                {/* Pulse ring */}
                <div style={{
                  position: "absolute", inset: -4, borderRadius: 20,
                  border: "2px solid rgba(21,96,189,0.3)",
                  animation: "pulse-ring 2s ease-out infinite"
                }} />
              </div>
              <h2 className="login-title" style={{
                margin: "0 0 8px", fontSize: 26, fontWeight: 800,
                color: "#0b1f35", letterSpacing: -0.5
              }}>
                Welcome back 👋
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "#6b82a0", lineHeight: 1.5 }}>
                Sign in using your <strong style={{ color: "#1560bd" }}>username or email</strong> to access the portal
              </p>
            </div>

            {/* Username / Email Input */}
            <div style={{ marginBottom: 18, animation: "fadeInUp 0.5s ease 0.1s both" }}>
              <label style={{
                display: "block", fontSize: 11.5, fontWeight: 700,
                color: uFocus ? "#1560bd" : "#2c4a6e",
                marginBottom: 8, letterSpacing: 0.8, textTransform: "uppercase",
                transition: "color 0.2s"
              }}>
                Username or Email
              </label>
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                  transition: "color 0.2s"
                }}>
                  <Icon d={icons.user} size={16} color={uFocus ? "#1560bd" : "#a8bcd4"} />
                </div>
                <input
                  className={`login-inp${error ? " error" : ""}`}
                  placeholder="your.username or email@company.com"
                  value={u}
                  onChange={e => setU(e.target.value)}
                  onFocus={() => setUFocus(true)}
                  onBlur={() => setUFocus(false)}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  style={{ paddingLeft: 44 }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div style={{ marginBottom: 12, animation: "fadeInUp 0.5s ease 0.15s both" }}>
              <label style={{
                display: "block", fontSize: 11.5, fontWeight: 700,
                color: pFocus ? "#1560bd" : "#2c4a6e",
                marginBottom: 8, letterSpacing: 0.8, textTransform: "uppercase",
                transition: "color 0.2s"
              }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)"
                }}>
                  <Icon d={icons.lock} size={16} color={pFocus ? "#1560bd" : "#a8bcd4"} />
                </div>
                <input
                  className={`login-inp${error ? " error" : ""}`}
                  type={show ? "text" : "password"}
                  placeholder="Enter your password"
                  value={p}
                  onChange={e => setP(e.target.value)}
                  onFocus={() => setPFocus(true)}
                  onBlur={() => setPFocus(false)}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  style={{ paddingLeft: 44, paddingRight: 48 }}
                />
                <button className="eye-btn" onClick={() => setShow(v => !v)}>
                  <Icon d={show ? icons.eyeOff : icons.eye} size={16} color="currentColor" />
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            <div style={{ textAlign: "right", marginBottom: 22, animation: "fadeInUp 0.5s ease 0.2s both" }}>
              <button className="forgot-btn" onClick={onForgot}>Forgot Password?</button>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                borderRadius: 12, background: "#fff1f1",
                border: "1.5px solid #fca5a5",
                marginBottom: 20, fontSize: 13, color: "#d93b3b",
                animation: "fadeInUp 0.3s ease both"
              }}>
                <Icon d={icons.info} size={16} color="#d93b3b" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <div style={{ animation: "fadeInUp 0.5s ease 0.25s both" }}>
              <button className="login-btn" onClick={submit} disabled={loading}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <span style={{
                      width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.4)",
                      borderTopColor: "white", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.8s linear infinite"
                    }} />
                    Signing in...
                  </span>
                ) : "Sign in to Brolly Portal"}
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 14px" }}>
              <div style={{ flex: 1, height: 1, background: "#e2ebf6" }} />
              <span style={{ fontSize: 11, color: "#a8bcd4", fontWeight: 500 }}>STATUS</span>
              <div style={{ flex: 1, height: 1, background: "#e2ebf6" }} />
            </div>

            {/* Sync Status */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px 16px", borderRadius: 10,
              background: isSyncing ? "#eff6ff" : "#f0fdf4",
              border: `1px solid ${isSyncing ? "#bfdbfe" : "#bbf7d0"}`
            }}>
              {isSyncing ? (
                <>
                  <span style={{
                    width: 10, height: 10, border: "2px solid #93c5fd",
                    borderTopColor: "#1560bd", borderRadius: "50%",
                    display: "inline-block", animation: "spin 0.9s linear infinite"
                  }} />
                  <span style={{ fontSize: 12, color: "#1560bd", fontWeight: 600 }}>Syncing with Google Sheets...</span>
                </>
              ) : (
                <>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#22c55e",
                    animation: "glowPulse 2s ease infinite"
                  }} />
                  <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>Cloud connection active</span>
                </>
              )}
            </div>
          </div>

          {/* Below card hint */}
          <p style={{
            textAlign: "center", marginTop: 20, fontSize: 12, color: "#6b82a0", lineHeight: 1.6
          }}>
            Having issues? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STAT CARD
══════════════════════════════════════════════════════════════ */
function StatCard({ label, value, sub, icon, color, bg, isLive }) {
  return (
    <div className="stat-card" style={{ background: T.white, padding: "18px 20px", borderRadius: 20, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12, position: "relative", overflow: "hidden", transition: "all 0.3s ease" }}>
      {isLive && (
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "pulse 1.5s infinite", boxShadow: `0 0 8px ${T.green}` }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: T.green, textTransform: "uppercase", letterSpacing: "0.5px" }}>Live</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: T.muted, textTransform: "uppercase" }}>{label}</span>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: bg,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Icon d={icon} size={16} color={color} />
        </div>
      </div>
      <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.muted }}>{sub}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STATUS BADGE
══════════════════════════════════════════════════════════════ */
function Badge({ status }) {
  const map = {
    "Full Day": { bg: "#ecfdf5", color: "#065f46", dot: "#10b981" },
    "Half Day": { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
    "Incomplete Workday(IWD)": { bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
    "Incomplete": { bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
    "Active": { bg: "#f0fdf4", color: "#166534", dot: "#22c55e", pulse: true },
    "Leave": { bg: "#f9fafb", color: "#374151", dot: "#9ca3af" },
    "Viewed": { bg: "#eef2ff", color: "#3730a3", dot: "#6366f1" },
    "Completed": { bg: "#f0fdf4", color: "#166534", dot: "#22c55e" },
    "Assigned": { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
    "Approved": { bg: "#f0fdf4", color: "#166534", dot: "#22c55e" },
    "Rejected": { bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
    "Pending": { bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
    "On Break": { bg: "#fff1f1", color: "#d93b3b", dot: "#d93b3b", pulse: true },
    "Offline": { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" },
  };
  const s = map[status] || map["Incomplete"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.dot}20`,
      whiteSpace: "nowrap"
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0,
        animation: s.pulse ? "pulse 2s infinite" : "none"
      }} />
      {status}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════════ */
function Dashboard({ employee, onSignOut, showToast }) {
  const savedSession = (() => {
    try {
      const session = JSON.parse(localStorage.getItem("wt_session") || "null");
      if (session && session.loginTime) {
        const sessionDate = new Date(session.loginTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const todayDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        if (sessionDate !== todayDate) {
          localStorage.removeItem("wt_session");
          return null;
        }
      }
      return session;
    } catch { return null; }
  })();

  const [now, setNow] = useState(new Date());

  // New States for cumulative tracking
  const [totalWorkSeconds, setTotalWorkSeconds] = useState(savedSession?.totalWorkSeconds || 0);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(savedSession?.totalBreakSeconds || 0);
  const [sessionStartTime, setSessionStartTime] = useState(savedSession?.sessionStartTime ? new Date(savedSession.sessionStartTime) : null);
  const [breakStartTime, setBreakStartTime] = useState(savedSession?.breakStartTime ? new Date(savedSession.breakStartTime) : null);

  const [loginTime, setLT] = useState(savedSession?.loginTime ? new Date(savedSession.loginTime) : null);
  const [logoutTime, setLOT] = useState(savedSession?.logoutTime ? new Date(savedSession.logoutTime) : null);
  const [status, setStatus] = useState(savedSession?.status || "idle"); // idle, working, break, loggedOut

  const [taskInput, setTask] = useState(savedSession?.taskInput || "");
  const [taskScreenshot, setTaskScreenshot] = useState(null);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [toast, setToast] = useState(null);
  // _showToast: uses the prop version if available (from App), else updates local toast state
  const _showToast = showToast || ((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); });
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Leave Management State
  const [profile, setProfile] = useState({ total_leaves: 16 });
  const [myLeaves, setMyLeaves] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [leaveData, setLeaveData] = useState({ start: "", end: "", reason: "" });


  // Polling for status sync across devices
  useEffect(() => {
    let pollInterval;

    const checkTodayStatus = async (isInitial = false) => {
      try {
        const resp = await fetch(BACKEND_URL);
        if (resp.ok) {
          const data = await resp.json();
          const myHistory = data.filter(r => (r.id === employee.id || r.employeeid === employee.id));

          // Update local history list
          setHistory(myHistory.map(r => ({
            date: r.date,
            loginT: r.logint,
            logoutT: r.logoutt,
            hours: r.hours,
            breakTime: r.break_time,
            extraHours: r.extrahours,
            tasks: r.tasks,
            status: r.status,
            last_status_change: r.last_status_change
          })));

          const today = fmtDate(new Date());
          const todayRec = myHistory.find(r => r.date === today);

          if (todayRec) {
            const nowTime = new Date().getTime();
            const lastActive = todayRec.last_active ? new Date(todayRec.last_active).getTime() : 0;
            const isStale = lastActive > 0 && (nowTime - lastActive) > 90000; // 90 seconds threshold (3 heartbeats)

            // GAP DETECTION: If status is Active/Break but heartbeat is stale, 
            // it means the user closed the browser and just came back.
            // We must "pause" the timer at lastActive and resume at nowTime.
            if (isStale && (todayRec.status === "Active" || todayRec.status === "On Break")) {
              console.log("Gap detected! Resuming from stale session. Correcting hours to exclude offline gap...");
              const workBase = parseHMS(todayRec.hours);
              const breakBase = parseHMS(todayRec.break_time);
              const lastChange = todayRec.last_status_change ? new Date(todayRec.last_status_change).getTime() : lastActive;
              const elapsed = Math.max(0, Math.floor((lastActive - lastChange) / 1000));

              const correctedWork = todayRec.status === "Active" ? workBase + elapsed : workBase;
              const correctedBreak = todayRec.status === "On Break" ? breakBase + elapsed : breakBase;

              triggerAutoSync(
                new Date(today + " " + todayRec.logint),
                null,
                todayRec.status === "Active" ? "working" : "break",
                new Date(), // startTimeOverride: reset to now
                correctedWork,
                correctedBreak
              );
              return; // Let the next poll handle the refreshed state
            }

            const serverStatusMap = { "Active": "working", "On Break": "break" };
            const mappedStatus = serverStatusMap[todayRec.status] || (todayRec.logoutt && todayRec.logoutt !== "—" ? "loggedOut" : "idle");

            // Sync logic: If server status is different OR if we don't have a session start time yet
            const serverLastChange = todayRec.last_status_change ? new Date(todayRec.last_status_change).getTime() : 0;
            const localLastChange = (status === "working" ? sessionStartTime : (status === "break" ? breakStartTime : null))?.getTime() || 0;

            if (isInitial || status !== mappedStatus || (serverLastChange && serverLastChange !== localLastChange)) {
              // Only overwrite if different to avoid jitter
              if (status !== mappedStatus || Math.abs(serverLastChange - localLastChange) > 2000) {
                console.log(`Syncing with server: Status=${mappedStatus}, LastChange=${todayRec.last_status_change}`);
                setTotalWorkSeconds(parseHMS(todayRec.hours));
                setTotalBreakSeconds(parseHMS(todayRec.break_time));
                setLT(new Date(today + " " + todayRec.logint));

                if (todayRec.status === "Active") {
                  setStatus("working");
                  setSessionStartTime(todayRec.last_status_change ? new Date(todayRec.last_status_change) : new Date());
                } else if (todayRec.status === "On Break") {
                  setStatus("break");
                  setBreakStartTime(todayRec.last_status_change ? new Date(todayRec.last_status_change) : new Date());
                } else if (todayRec.logoutt && todayRec.logoutt !== "—") {
                  setLOT(new Date(today + " " + todayRec.logoutt));
                  setStatus("loggedOut");
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("Status sync failed", e);
      }
    };

    checkTodayStatus(true);
    pollInterval = setInterval(() => checkTodayStatus(false), 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [employee.id, status]); // Re-run if status changes locally to ensure we stay synced

  // Fetch assigned tasks
  const fetchAssignedTasks = async () => {
    try {
      const resp = await fetch(`${TASKS_URL}?employee_id=${employee.id}`);
      if (resp.ok) {
        const data = await resp.json();
        setAssignedTasks(data);
      }
    } catch (e) {
      console.error("Task fetch failed", e);
    }
  };

  useEffect(() => {
    fetchAssignedTasks();
    const t = setInterval(fetchAssignedTasks, 15000); // Check for new tasks every 15s
    return () => clearInterval(t);
  }, [employee.id]);

  const fetchProfile = async () => {
    try {
      const resp = await fetch(PROFILE_URL(employee.id));
      if (resp.ok) setProfile(await resp.json());
    } catch (e) { console.warn("Profile fetch failed", e); }
  };

  const fetchLeaves = async () => {
    try {
      const resp = await fetch(`${LEAVES_URL}?employee_id=${employee.id}`);
      if (resp.ok) {
        const data = await resp.json();
        setMyLeaves(data);

        // Handle notifications for approved/rejected leaves
        const unnotified = data.find(l => !l.is_notified && l.status !== "Pending");
        if (unnotified) {
          _showToast(`Your leave request was ${unnotified.status}!`, unnotified.status === "Approved" ? "success" : "error");
          // Mark as notified
          fetch(`${LEAVES_URL}${unnotified.id}/notify/`, { method: "PATCH" });
        }
      }
    } catch (e) { console.warn("Leaves fetch failed", e); }
  };

  useEffect(() => {
    fetchProfile();
    fetchLeaves();
    const t = setInterval(() => { fetchProfile(); fetchLeaves(); }, 30000);
    return () => clearInterval(t);
  }, [employee.id]);

  const handleLeaveRequest = async () => {
    if (!leaveData.start || !leaveData.end || !leaveData.reason) {
      _showToast("Please fill all fields", "amber");
      return;
    }
    try {
      const resp = await fetch(LEAVES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee.id,
          employee_name: employee.name,
          start_date: leaveData.start,
          end_date: leaveData.end,
          reason: leaveData.reason
        })
      });
      if (resp.ok) {
        _showToast("Leave request submitted!", "success");
        setLeaveData({ start: "", end: "", reason: "" });
        setShowLeaveForm(false);
        fetchLeaves();
      } else {
        _showToast("Submission failed", "error");
      }
    } catch (e) { console.error(e); }
  };

  const markTaskViewed = async (taskId) => {
    try {
      await fetch(`${TASKS_URL}${taskId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Viewed" })
      });
      fetchAssignedTasks();
    } catch (e) { console.error(e); }
  };

  const markTaskCompleted = async (taskId) => {
    try {
      await fetch(`${TASKS_URL}${taskId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" })
      });
      fetchAssignedTasks();
      _showToast("Task marked as completed!", "success");
    } catch (e) { console.error(e); }
  };

  const [xlWb, setXlWb] = useState(null);
  const [xlName, setXlName] = useState(null);
  const [activeTab, setTab] = useState("today");
  const fileRef = useRef(null);

  // Persist session
  useEffect(() => {
    if (status === "idle" && !loginTime) {
      localStorage.removeItem("wt_session");
      return;
    }
    localStorage.setItem("wt_session", JSON.stringify({
      totalWorkSeconds,
      totalBreakSeconds,
      sessionStartTime: sessionStartTime?.toISOString() || null,
      breakStartTime: breakStartTime?.toISOString() || null,
      loginTime: loginTime?.toISOString() || null,
      logoutTime: logoutTime?.toISOString() || null,
      status,
      taskInput,
      employeeId: employee.id
    }));
  }, [totalWorkSeconds, totalBreakSeconds, sessionStartTime, breakStartTime, loginTime, logoutTime, status, taskInput]);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);


  // Live work calculation
  const currentTotalWorkSeconds = status === "working" && sessionStartTime
    ? totalWorkSeconds + Math.floor((now - sessionStartTime) / 1000)
    : totalWorkSeconds;

  const currentTotalBreakSeconds = status === "break" && breakStartTime
    ? totalBreakSeconds + Math.floor((now - breakStartTime) / 1000)
    : totalBreakSeconds;

  const liveHrs = secondsToHMS(currentTotalWorkSeconds);
  const liveBreakHrs = secondsToHMS(currentTotalBreakSeconds);

  const handleLogin = () => {
    const t = new Date();
    if (!loginTime) setLT(t);
    setSessionStartTime(t);
    setStatus("working");
    _showToast("Session started", "success");
    triggerAutoSync(loginTime || t, null, "working", t);
  };

  const handleBreak = () => {
    const t = new Date();
    if (status === "working" && sessionStartTime) {
      const addedWork = Math.floor((t - sessionStartTime) / 1000);
      const newTotalWork = totalWorkSeconds + addedWork;
      setTotalWorkSeconds(newTotalWork);
      setSessionStartTime(null);
      setBreakStartTime(t);
      setStatus("break");
      _showToast("Break started", "amber");
      triggerAutoSync(loginTime, null, "break", t, newTotalWork);
    } else if (status === "break" && breakStartTime) {
      const addedBreak = Math.floor((t - breakStartTime) / 1000);
      const newTotalBreak = totalBreakSeconds + addedBreak;
      setTotalBreakSeconds(newTotalBreak);
      setBreakStartTime(null);
      setSessionStartTime(t);
      setStatus("working");
      _showToast("Work resumed", "success");
      triggerAutoSync(loginTime, null, "working", t, totalWorkSeconds, newTotalBreak);
    }
  };

  const triggerAutoSync = (lt, lot, curStatus, startTimeOverride, workOverride, breakOverride) => {
    const syncTime = new Date();
    const sTime = startTimeOverride || (curStatus === "working" ? sessionStartTime : (curStatus === "break" ? breakStartTime : null));

    const tWork = workOverride !== undefined ? workOverride : (
      curStatus === "working" && sTime
        ? totalWorkSeconds + Math.floor((syncTime - sTime) / 1000)
        : totalWorkSeconds
    );

    const tBreak = breakOverride !== undefined ? breakOverride : (
      curStatus === "break" && sTime
        ? totalBreakSeconds + Math.floor((syncTime - sTime) / 1000)
        : totalBreakSeconds
    );

    const hrs = secondsToHMS(tWork);
    const brk = secondsToHMS(tBreak);
    const WORK_GOAL = 8;
    const HALF_DAY_THRESHOLD = 4.5;
    let dayStatus = "Half Day";
    if (hrs.total >= WORK_GOAL) {
      dayStatus = "Full Day";
    } else if (hrs.total >= HALF_DAY_THRESHOLD) {
      dayStatus = "Incomplete Workday(IWD)";
    }

    const payload = {
      date: fmtDate(lt),
      id: employee.id,
      name: employee.name,
      dept: employee.dept,
      loginT: fmtTime(lt),
      logoutT: lot ? fmtTime(lot) : "—",
      hours: hmsStr(hrs),
      breakTime: hmsStr(brk),
      extraHours: "—",
      tasks: taskInput || "—",
      status: curStatus === "working" ? "Active" : curStatus === "break" ? "On Break" : dayStatus,
      lastStatusChange: (curStatus === "working" || curStatus === "break") ? syncTime.toISOString() : (sTime ? sTime.toISOString() : null)
    };

    // Fast sync to local backend
    fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(resp => {
      if (resp.ok) {
        // Update local state to match what was synced
        if (curStatus === "working") {
          setTotalWorkSeconds(tWork);
          setSessionStartTime(syncTime);
        } else if (curStatus === "break") {
          setTotalBreakSeconds(tBreak);
          setBreakStartTime(syncTime);
        }
      }
    }).catch(e => console.warn("Auto-sync failed", e));
  };
  const handleLogout = () => {
    if (status !== "working" && status !== "break") return;
    const t = new Date();

    let finalWork = totalWorkSeconds;
    let finalBreak = totalBreakSeconds;

    if (status === "working" && sessionStartTime) {
      finalWork += Math.floor((t - sessionStartTime) / 1000);
    } else if (status === "break" && breakStartTime) {
      finalBreak += Math.floor((t - breakStartTime) / 1000);
    }

    setTotalWorkSeconds(finalWork);
    setTotalBreakSeconds(finalBreak);
    setSessionStartTime(null);
    setBreakStartTime(null);
    setLOT(t);
    setStatus("loggedOut");
    _showToast("Session paused. Click Sync to save!", "info");
    triggerAutoSync(loginTime, t, "loggedOut", null, finalWork, finalBreak);
  };

  const handleLoadXl = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "binary" });
      setXlWb(wb); setXlName(file.name);
      const ws = wb.Sheets["Attendance"];
      if (ws) {
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const emp = rows.slice(1).filter(r => r[1] === employee.id);
        setHistory(emp.map(r => ({
          date: r[0],
          loginT: r[4],
          logoutT: r[5],
          hours: r[6],
          breakTime: r[7],
          extraHours: r[8],
          tasks: r[9],
          status: r[10]
        })));
      }
      _showToast(`Loaded: ${file.name}`, "success");
    };
    reader.readAsBinaryString(file);
  };

  const eightHourSyncedRef = useRef(false);
  useEffect(() => {
    if (liveHrs.total >= 8 && !eightHourSyncedRef.current) {
      eightHourSyncedRef.current = true;
      triggerAutoSync(loginTime, logoutTime, status);
    }
    // Reset if it's a new day or hours drop
    if (liveHrs.total < 8) eightHourSyncedRef.current = false;
  }, [liveHrs.total, status]);

  // ── Heartbeat & Periodic Sync (Fixes "wrong working hours" mismatch) ──
  useEffect(() => {
    if (!employee?.id || (status !== "working" && status !== "break")) return;

    const runHeartbeat = async () => {
      try {
        // 1. Update 'last_active' timestamp on server (Every 1 min)
        fetch(HEARTBEAT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            employee_id: employee.id, 
            date: fmtDate(loginTime || new Date()) 
          })
        });
      } catch (e) { console.warn("Heartbeat failed", e); }
    };

    const runBackgroundSync = () => {
      // 2. Sync actual hours to server (Every 5 mins)
      // This ensures Admin Dashboard shows real-time progress
      if (status === "working" || status === "break") {
        console.log("Performing background hours sync...");
        triggerAutoSync(loginTime, logoutTime, status);
      }
    };

    const heartbeatIv = setInterval(runHeartbeat, 30000); // 30 seconds
    runHeartbeat(); // Run immediately on mount or status change
    const syncIv = setInterval(runBackgroundSync, 300000); // 5 mins
    
    return () => {
      clearInterval(heartbeatIv);
      clearInterval(syncIv);
    };
  }, [employee?.id, status, loginTime, logoutTime]);

  const handleSave = async () => {
    if (!loginTime) { _showToast("Please clock in first", "error"); return; }

    _showToast("Syncing to Cloud...", "info");
    const syncTime = new Date();
    const lt = logoutTime || syncTime;

    // Use current live values for the sync
    const tWork = status === "working" && sessionStartTime
      ? totalWorkSeconds + Math.floor((syncTime - sessionStartTime) / 1000)
      : totalWorkSeconds;
    
    const tBreak = status === "break" && breakStartTime
      ? totalBreakSeconds + Math.floor((syncTime - breakStartTime) / 1000)
      : totalBreakSeconds;

    const hrs = secondsToHMS(tWork);
    const brk = secondsToHMS(tBreak);

    const WORK_GOAL = 8;
    const HALF_DAY_THRESHOLD = 4.5;
    let dayStatus = "Half Day";
    if (hrs.total >= WORK_GOAL) {
      dayStatus = "Full Day";
    } else if (hrs.total >= HALF_DAY_THRESHOLD) {
      dayStatus = "Incomplete Workday(IWD)";
    }

    const formData = new FormData();
    formData.append('date', fmtDate(loginTime));
    formData.append('id', employee.id);
    formData.append('name', employee.name);
    formData.append('dept', employee.dept);
    formData.append('loginT', fmtTime(loginTime));
    formData.append('logoutT', fmtTime(lt));
    formData.append('hours', hmsStr(hrs));
    formData.append('breakTime', hmsStr(brk));
    formData.append('extraHours', hrs.total > 8 ? hmsStr(secondsToHMS(Math.floor((hrs.total - 8) * 3600))) : "—");
    formData.append('tasks', taskInput || "—");
    formData.append('status', status === "working" ? "Active" : status === "break" ? "On Break" : dayStatus);
    formData.append('lastStatusChange', (status === "working" || status === "break") ? syncTime.toISOString() : (sessionStartTime || breakStartTime || loginTime).toISOString());
    if (taskScreenshot) formData.append('screenshot', taskScreenshot);

    try {
      const resp = await fetch(BACKEND_URL, {
        method: "POST",
        body: formData
      });

      if (resp.ok) {
        // Update local state to match synced values
        if (status === "working") {
          setTotalWorkSeconds(tWork);
          setSessionStartTime(syncTime);
        } else if (status === "break") {
          setTotalBreakSeconds(tBreak);
          setBreakStartTime(syncTime);
        }
      }

      const syncPayload = {
        date: fmtDate(loginTime), id: employee.id, name: employee.name, dept: employee.dept,
        loginT: fmtTime(loginTime), logoutT: fmtTime(lt), hours: hmsStr(hrs),
        breakTime: hmsStr(brk), tasks: taskInput || "—", status: dayStatus
      };

      if (SCRIPT_URL && !SCRIPT_URL.includes("YOUR_SCRIPT_URL_HERE")) {
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(syncPayload)
        });
      }
      setTaskScreenshot(null);

      setHistory(prev => {
        const idx = prev.findIndex(r => r.date === syncPayload.date);
        const newRec = {
          date: syncPayload.date,
          loginT: syncPayload.loginT,
          logoutT: syncPayload.logoutT,
          hours: syncPayload.hours,
          breakTime: syncPayload.breakTime,
          extraHours: hrs.total > 8 ? hmsStr(secondsToHMS(Math.floor((hrs.total - 8) * 3600))) : "—",
          tasks: syncPayload.tasks,
          status: dayStatus
        };
        if (idx >= 0) {
          const upd = [...prev];
          upd[idx] = newRec;
          return upd;
        }
        return [...prev, newRec];
      });
      _showToast("Attendance synced to Cloud!", "success");
    } catch (err) {
      console.error("Sync failed:", err);
      _showToast("Sync failed. Check connection.", "error");
    }
  };

  const pct = Math.round((Math.min(liveHrs.total, 8) / 8) * 100);
  const extraStr = liveHrs.total > 8 ? hmsStr(secondsToHMS(Math.floor((liveHrs.total - 8) * 3600))) : null;

  const greetHour = now.getHours();
  const greeting = greetHour < 12 ? "Good morning" : greetHour < 17 ? "Good afternoon" : "Good evening";

  const [groups, setGroups] = useState([]);
  const [activeChat, setActiveChat] = useState({ type: 'admin', id: 'admin', name: 'Admin Chat' });

  const [unreadCount, setUnreadCount] = useState(0);
  const [groupUnreadMap, setGroupUnreadMap] = useState({});
  const lastMsgsCountRef = useRef(0);
  const isFirstUnreadCheck = useRef(true);
  const activeTabRef = useRef(activeTab);
  const activeChatRef = useRef(activeChat);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  useEffect(() => {
    if (!employee?.id) return;
    const checkMessages = async () => {
      try {
        const r = await fetch(MESSAGES_URL + `?user1=${employee.id}`);
        if (r.ok) {
          const msgs = await r.json();
          
          // Direct unread count (for the badge)
          const directUnread = msgs.filter(m => !m.is_read && m.receiver_id === employee.id).length;
          
          // Group unread logic (approximate using localStorage)
          const lastRead = JSON.parse(localStorage.getItem(`wt_read_${employee.id}`) || "{}");
          const gMap = {};
          msgs.forEach(m => {
            if (m.group_id && m.id > (lastRead[m.group_id] || 0) && m.sender_id !== employee.id) {
              gMap[m.group_id] = (gMap[m.group_id] || 0) + 1;
            }
          });
          setGroupUnreadMap(gMap);
          
          const groupUnreadTotal = Object.values(gMap).reduce((a, b) => a + b, 0);
          const totalUnread = directUnread + groupUnreadTotal;

          // Sound and Toast for ANY new message from others
          if (!isFirstUnreadCheck.current && msgs.length > lastMsgsCountRef.current) {
             const last = msgs[msgs.length - 1];
             if (last && last.sender_id !== employee.id) {
               const isViewingChat = activeTabRef.current === 'messages' && activeChatRef.current.id === (last.group_id || 'admin');
               if (!document.hasFocus() || !isViewingChat) {
                  (_showToast || playNotifySound)();
                  if (!isViewingChat) {
                    const sender = last.sender_id === 'admin' ? 'Admin' : last.sender_username || last.sender_id;
                    _showToast?.(`New message from ${sender}`, "info");
                  }
               }
             }
          }
          
          isFirstUnreadCheck.current = false;
          lastMsgsCountRef.current = msgs.length;
          setUnreadCount(totalUnread);
        }
      } catch(e) {}
    };
    const iv = setInterval(checkMessages, 5000);
    checkMessages();
    return () => clearInterval(iv);
  }, [employee.id, unreadCount]);


  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const r = await fetch(GROUPS_URL);
        if (r.ok) {
          const all = await r.json();
          setGroups(all.filter(g => g.member_usernames?.includes(employee.id)));
        }
      } catch(e) {}
    };
    fetchGroups();
  }, [employee.id]);

  return (
    <div style={{ minHeight: "100vh", background: "#eef3f9", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
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
        .pulse-active{animation: pulse 2s infinite;}

        @media (max-width: 768px) {
          .stat-grid { grid-template-columns: 1fr 1fr !important; }
          .main-grid { grid-template-columns: 1fr !important; }
          .top-bar { padding: 8px 12px !important; height: auto !important; flex-wrap: wrap !important; gap: 8px !important; }
          .top-bar-title { display: none !important; }
          .top-bar-user { order: 2; width: 100%; justify-content: space-between !important; border-top: 1px solid ${T.border}; padding-top: 8px !important; margin-top: 4px; }
          .top-bar-status { order: 3; width: 100%; justify-content: center !important; }
          .dashboard-content { padding: 12px 10px !important; }
          .greeting-row { flex-direction: column; align-items: stretch !important; gap: 12px; }
          .greeting-text { font-size: 18px !important; }
          .time-display { width: 100% !important; text-align: center !important; padding: 10px !important; }
          .time-text { font-size: 20px !important; }
          .profile-footer { flex-direction: column !important; align-items: flex-start !important; gap: 20px; }
          .profile-footer-stats { width: 100%; justify-content: space-between !important; }
          .name-label { display: none !important; }
        }
        @media (max-width: 480px) {
          .stat-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 999,
          padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 10, animation: "slideIn 0.25s ease",
          background: toast.type === "success" ? T.green : toast.type === "error" ? T.red : toast.type === "amber" ? T.amber : T.accent,
          color: "white", boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
        }}>
          <Icon d={toast.type === "success" ? icons.check : icons.info} size={15} color="white" />
          {toast.msg}
        </div>
      )}

      {/* ── Assigned Tasks Modal (Employee View) ── */}
      {showTasksModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1050,
          background: "rgba(11,31,53,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }} onClick={() => setShowTasksModal(false)}>
          <div style={{
            background: "white", borderRadius: 24, width: "100%", maxWidth: 500,
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease",
            overflow: "hidden"
          }} onClick={e => e.stopPropagation()}>
            <div style={{ background: T.ink, padding: "20px 24px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Your Assigned Tasks</div>
              <button onClick={() => setShowTasksModal(false)} style={{ background: "none", border: "none", color: "white", cursor: "pointer" }}>
                <Icon d="M18 6L6 18M6 6l12 12" size={20} color="white" />
              </button>
            </div>
            <div style={{ padding: 24, maxHeight: 400, overflowY: "auto" }}>
              {assignedTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: T.muted }}>No tasks assigned to you.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {assignedTasks.map(t => (
                    <div key={t.id} style={{
                      padding: 16, borderRadius: 16, border: `1px solid ${T.border}`,
                      background: t.status === "Assigned" ? "#fff9f0" : "white"
                    }} onMouseEnter={() => t.status === "Assigned" && markTaskViewed(t.id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, color: T.ink }}>{t.title}</div>
                        <Badge status={t.status} />
                      </div>
                      <p style={{ fontSize: 13, color: T.ink2, margin: "0 0 12px", lineHeight: 1.5 }}>{t.description}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 11, color: T.muted }}>Assigned {new Date(t.assigned_at).toLocaleDateString()}</div>
                        {t.status !== "Completed" && (
                          <button onClick={() => markTaskCompleted(t.id)} style={{
                            padding: "6px 12px", borderRadius: 8, border: "none", background: T.green, color: "white",
                            fontSize: 12, fontWeight: 700, cursor: "pointer"
                          }}>Mark as Complete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Details Modal ── */}
      {selectedRecord && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(11,31,53,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }} onClick={() => setSelectedRecord(null)}>
          <div style={{
            background: "white", borderRadius: 24, width: "100%", maxWidth: 500,
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease",
            overflow: "hidden"
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              background: T.ink, padding: "24px 30px", color: "white",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div>
                <div style={{ fontSize: 12, color: T.faint, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>RECORD DETAILS</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedRecord.date}</div>
              </div>
              <button onClick={() => setSelectedRecord(null)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", opacity: 0.7 }}>
                <Icon d="M18 6L6 18M6 6l12 12" size={24} color="white" />
              </button>
            </div>

            <div style={{ padding: 30 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 30 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 5 }}>CLOCK IN</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.green }}>{selectedRecord.loginT || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 5 }}>CLOCK OUT</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.red }}>{selectedRecord.logoutT || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 5 }}>WORKING HOURS</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{selectedRecord.hours || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 5 }}>BREAK DURATION</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.amber }}>{selectedRecord.breakTime || "—"}</div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: T.purpleBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon d={icons.tasks} size={16} color={T.purple} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Tasks Performed</div>
                </div>
                <div style={{
                  background: T.surface, padding: 20, borderRadius: 14,
                  fontSize: 14, color: T.ink2, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  border: `1px solid ${T.border}`, minHeight: 120
                }}>
                  {selectedRecord.tasks || "No tasks recorded for this day."}
                </div>
              </div>
            </div>

            <div style={{ padding: "0 30px 30px" }}>
              <button onClick={() => setSelectedRecord(null)} style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none",
                background: T.ink, color: "white", fontWeight: 700, cursor: "pointer"
              }}>
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Topbar ── */}
      <div className="top-bar" style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60,
        position: "sticky", top: 0, zIndex: 1000, boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
          }}>
            <img src={logo} alt="Brolly Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div className="top-bar-title">
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, letterSpacing: 0.2 }}>Brolly Software Solutions</div>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: 0.5 }}>ATTENDANCE SYSTEM</div>
          </div>
        </div>

        <div className="top-bar-status" style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
          borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: status === "working" ? T.green : status === "break" ? T.amber : T.faint,
            animation: (status === "working" || status === "break") ? "pulse 2s infinite" : "none"
          }} />
          <span style={{ fontSize: 11, color: T.muted }}>
            {status === "working" ? "Working" : status === "break" ? "On Break" : status === "loggedOut" ? "Session Ended" : "Not Clocked In"}
          </span>
        </div>

        <div className="top-bar-user" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Task Notification */}
          <button onClick={() => setShowTasksModal(true)} style={{
            position: "relative", width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${T.border}`,
            background: "none", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Icon d={icons.tasks} size={18} color={T.muted} />
            {assignedTasks.filter(t => t.status === "Assigned").length > 0 && (
              <span style={{
                position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%",
                background: T.red, color: "white", fontSize: 10, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid white"
              }}>
                {assignedTasks.filter(t => t.status === "Assigned").length}
              </span>
            )}
          </button>

          <Avatar name={employee.name} size={32} />
          <div className="name-label" style={{ marginRight: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{employee.name}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{employee.role}</div>
          </div>
          <button onClick={onSignOut} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${T.border}`,
            background: "none", color: T.muted, cursor: "pointer", fontSize: 12, fontWeight: 600,
            transition: "all 0.15s"
          }}>
            <Icon d={icons.logout} size={14} color={T.muted} />
            Sign out
          </button>
          
          <button onClick={() => setTab("messages")} style={{
            position: "relative", width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${activeTab === 'messages' ? T.accent : T.border}`,
            background: activeTab === 'messages' ? T.accent : "none", color: activeTab === 'messages' ? "white" : T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Icon d={icons.message} size={18} color={activeTab === 'messages' ? "white" : T.muted} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%",
                background: T.red, color: "white", fontSize: 10, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid white"
              }}>
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="dashboard-content" style={{ width: "100%", maxWidth: 1080, margin: "0 auto", padding: "28px 24px", boxSizing: "border-box" }}>

        {/* Greeting row */}
        <div className="greeting-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: T.ink }}>
              {greeting}, {employee.name.split(" ")[0]} 👋
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
              {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="time-display" style={{ background: T.ink, borderRadius: 14, padding: "14px 22px", textAlign: "right" }}>
            <div className="time-text" style={{
              fontSize: 26, fontWeight: 700, color: "white",
              fontVariantNumeric: "tabular-nums", letterSpacing: 1
            }}>
              {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>
              IST · {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {(status !== "idle") && (
          <div style={{
            background: T.white, borderRadius: 14, padding: "16px 20px",
            border: `1px solid ${T.border}`, marginBottom: 22
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Daily progress</span>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {extraStr && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: T.amber,
                    background: T.amberBg, padding: "2px 10px", borderRadius: 20
                  }}>
                    +{extraStr} overtime
                  </span>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: pct >= 100 ? T.green : T.accent }}>{pct}%</span>
              </div>
            </div>
            <div style={{ height: 10, background: T.surface, borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, borderRadius: 99,
                background: pct >= 100 ? T.green : T.accent, transition: "width 0.5s ease"
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: T.muted }}>
              <span>{hmsStr(liveHrs)} worked</span>
              <span>Goal: 8:00:00</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 4, background: "#e4eaf3", borderRadius: 10,
          padding: 4, marginBottom: 20, width: "fit-content"
        }}>
          {[{ k: "today", label: "Today's Session" }, { k: "history", label: "Attendance History" }, { k: "leaves", label: "Leave Requests" }, { k: "messages", label: "Admin Chat", badge: unreadCount }].map(t => (
            <button key={t.k} className={`tab${activeTab === t.k ? " active" : ""}`}
              onClick={() => setTab(t.k)} style={{ position: "relative" }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ position: "absolute", top: -6, right: -6, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 800 }}>{t.badge}</span>
              )}
            </button>
          ))}

        </div>

        {/* Stat cards */}
        {activeTab !== "messages" && (
          <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 22 }}>
            <StatCard label="Work Time" value={hmsStr(liveHrs)}
              sub={`${pct}% of daily goal (8h)`}
              icon={icons.clock} color={T.green} bg={T.greenBg} />
            <StatCard label="Break Time" value={hmsStr(liveBreakHrs)}
              sub="Total break duration today"
              icon={icons.refresh} color={T.amber} bg={T.amberBg} />
            <StatCard label="Login Status" value={status === "working" ? "Working" : status === "break" ? "Gap / Break" : "Paused"}
              sub={loginTime ? `Started at ${fmtTime(loginTime)}` : "Not started"}
              icon={icons.user} color={T.accent} bg="#e8f0fc" />
            <StatCard label="Overtime" value={extraStr || "—"}
              sub={extraStr ? "Completed 8h goal" : "No overtime yet"}
              icon={icons.refresh} color={T.purple} bg={T.purpleBg} />
            <StatCard label="Log Count" value={String(history.length)}
              sub="Daily entries sync"
              icon={icons.calendar} color={T.purple} bg={T.purpleBg} />
          </div>
        )}

        {activeTab === "today" && (
          <div className="main-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

            {/* Control Panel */}
            <div style={{
              background: T.white, borderRadius: 16, padding: "24px",
              border: `1px solid ${T.border}`
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, background: "#e8f0fc",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Icon d={icons.clock} size={18} color={T.accent} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Active Tracking</div>
                  <div style={{ fontSize: 12, color: T.muted }}>Manage sessions and breaks</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {(status === "idle" || status === "loggedOut") ? (
                  <button className="act-btn" onClick={handleLogin}
                    style={{ flex: 1, background: T.green, color: "white", justifyContent: "center" }}>
                    <Icon d={icons.check} size={16} color="white" />
                    Start Working
                  </button>
                ) : (
                  <>
                    {status === "working" ? (
                      <button className="act-btn" onClick={handleBreak}
                        style={{ flex: 1, background: T.amber, color: "white", justifyContent: "center" }}>
                        <Icon d={icons.refresh} size={16} color="white" />
                        Take Break
                      </button>
                    ) : (
                      <button className="act-btn" onClick={handleBreak}
                        style={{ flex: 1, background: T.green, color: "white", justifyContent: "center" }}>
                        <Icon d={icons.check} size={16} color="white" />
                        Resume Work
                      </button>
                    )}
                    <button className="act-btn" onClick={handleLogout}
                      style={{ flex: 1, background: T.red, color: "white", justifyContent: "center" }}>
                      <Icon d={icons.logout} size={16} color="white" />
                      Pause Work
                    </button>
                  </>
                )}
              </div>

              {/* Status timeline */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Today's First Login", time: loginTime ? fmtTime(loginTime) : null, done: !!loginTime, color: T.accent },
                  { label: "Active Work Duration", time: hmsStr(liveHrs), done: liveHrs.total > 0, color: T.green },
                  { label: "Total Break Time", time: hmsStr(liveBreakHrs), done: liveBreakHrs.total > 0, color: T.amber },
                ].map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10,
                    background: s.done ? `${s.color}10` : T.surface,
                    border: `1px solid ${s.done ? s.color + "30" : T.border}`
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      background: s.done ? s.color : T.border,
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      {s.done
                        ? <Icon d={icons.check} size={13} color="white" stroke={2.5} />
                        : <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.faint }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: s.done ? s.color : T.muted }}>{s.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 1 }}>{s.time || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks + Save */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Task entry */}
              <div style={{
                background: T.white, borderRadius: 16, padding: "24px",
                border: `1px solid ${T.border}`, flex: 1
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, background: T.purpleBg,
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <Icon d={icons.tasks} size={18} color={T.purple} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Tasks Done Today</div>
                    <div style={{ fontSize: 12, color: T.muted }}>Will be saved to Excel</div>
                  </div>
                </div>
                <textarea className="task-area" value={taskInput}
                  onChange={e => setTask(e.target.value)}
                  placeholder="• Completed feature X&#10;• Reviewed PR #42&#10;• Attended standup meeting&#10;• Fixed bug in auth module" />
                
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Task Screenshot (Optional)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10,
                      background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer", fontSize: 13, color: T.ink2
                    }}>
                      <Icon d={icons.camera} size={16} />
                      {taskScreenshot ? "Change Screenshot" : "Upload Screenshot"}
                      <input type="file" hidden accept="image/*" onChange={e => setTaskScreenshot(e.target.files[0])} />
                    </label>
                    {taskScreenshot && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.green, fontWeight: 600 }}>
                        <Icon d={icons.check} size={14} />
                        {taskScreenshot.name}
                        <button onClick={() => setTaskScreenshot(null)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", marginLeft: 4 }}>×</button>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: T.faint, display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon d={icons.info} size={12} color={T.faint} />
                  Use bullet points to list individual tasks
                </div>
              </div>

              {/* Sync to Cloud */}
              <div style={{
                background: T.white, borderRadius: 16, padding: "20px 24px",
                border: `1px solid ${T.border}`
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 14 }}>Sync Attendance</div>

                <button onClick={handleSave}
                  style={{
                    width: "100%", padding: "11px 14px", borderRadius: 10, border: "none",
                    background: T.accent, color: "white", cursor: "pointer", fontSize: 13,
                    fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7
                  }}>
                  <Icon d={icons.refresh} size={14} color="white" />
                  Sync to Cloud
                </button>

                <div style={{
                  marginTop: 10, padding: "10px 12px", borderRadius: 9,
                  background: T.surface, border: `1px solid ${T.border}`, fontSize: 12, color: T.muted,
                  display: "flex", gap: 8, alignItems: "flex-start"
                }}>
                  <Icon d={icons.info} size={13} color={T.faint} />
                  <span>Clock in &amp; out, then click <b style={{ color: T.ink2 }}>Sync to Cloud</b>. Attendance saves directly to your Google Sheet.</span>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* History tab */}
        {activeTab === "history" && (
          <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Attendance History</div>
                <div style={{ fontSize: 12, color: T.muted }}>{history.length} records for {employee.name}</div>
              </div>
              {history.length === 0 && (
                <div style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon d={icons.info} size={13} color={T.faint} />
                  Load the Excel file to view history
                </div>
              )}
            </div>

            {history.length === 0 ? (
              <div style={{ padding: "60px 24px", textAlign: "center" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14, background: T.surface,
                  border: `1px solid ${T.border}`, display: "flex", alignItems: "center",
                  justifyContent: "center", margin: "0 auto 14px"
                }}>
                  <Icon d={icons.calendar} size={24} color={T.faint} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.muted, marginBottom: 4 }}>No records yet</div>
                <div style={{ fontSize: 12, color: T.faint }}>
                  Load the Excel file and save your attendance to see records here.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.surface }}>
                      {["Date", "Clock In", "Clock Out", "Hours", "Break Time", "Over Time", "Status", "Tasks", ""].map(h => (
                        <th key={h} style={{
                          padding: "11px 16px", textAlign: "left",
                          fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.5,
                          borderBottom: `1px solid ${T.border}`, textTransform: "uppercase"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((r, i) => (
                      <tr key={i} className="hist-row"
                        style={{ borderBottom: `1px solid ${T.border}`, transition: "background 0.1s" }}>
                        <td style={{ padding: "12px 16px", color: T.ink, fontWeight: 600 }}>{r.date}</td>
                        <td style={{ padding: "12px 16px", color: T.green, fontWeight: 600 }}>{r.loginT}</td>
                        <td style={{ padding: "12px 16px", color: T.red, fontWeight: 600 }}>{r.logoutT}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{r.hours}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: T.amber, fontVariantNumeric: "tabular-nums" }}>{r.breakTime || r.break_time || "—"}</td>
                        <td style={{
                          padding: "12px 16px", fontWeight: 700,
                          color: r.extraHours && r.extraHours !== "—" ? T.amber : T.faint,
                          fontVariantNumeric: "tabular-nums"
                        }}>
                          {r.extraHours || "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}><Badge status={r.status || "Incomplete"} /></td>
                        <td style={{
                          padding: "12px 16px", color: T.muted, maxWidth: 180,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}
                          title={r.tasks}>{r.tasks}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <button
                            onClick={() => setSelectedRecord(r)}
                            style={{
                              padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`,
                              background: "white", color: T.ink2, fontSize: 11, fontWeight: 700,
                              cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6
                            }}
                            onMouseOver={e => e.currentTarget.style.background = T.surface}
                            onMouseOut={e => e.currentTarget.style.background = "white"}
                          >
                            <Icon d={icons.eye} size={13} color={T.accent} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "leaves" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, padding: 24, alignSelf: "start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: T.purpleBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon d={icons.calendar} size={20} color={T.purple} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>Request Leave</div>
                  <div style={{ fontSize: 13, color: T.muted }}>You have <b style={{ color: T.purple }}>{profile.total_leaves}</b> leaves remaining</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: 0.5 }}>START DATE</label>
                  <input className="adm-inp" type="date" style={{ width: "100%", boxSizing: "border-box" }}
                    value={leaveData.start} onChange={e => setLeaveData({ ...leaveData, start: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: 0.5 }}>END DATE</label>
                  <input className="adm-inp" type="date" style={{ width: "100%", boxSizing: "border-box" }}
                    value={leaveData.end} onChange={e => setLeaveData({ ...leaveData, end: e.target.value })} />
                </div>
              </div>

              {(leaveData.start && leaveData.end) && (
                <div style={{
                  marginBottom: 16, padding: "10px 14px", borderRadius: 10,
                  background: T.purpleBg, border: `1px solid ${T.purple}30`,
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.purple }}>Requested Duration</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.purple }}>
                    {(() => {
                      const s = new Date(leaveData.start);
                      const e = new Date(leaveData.end);
                      const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
                      return diff > 0 ? `${diff} Day${diff > 1 ? 's' : ''}` : "Invalid range";
                    })()}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: 0.5 }}>REASON FOR LEAVE</label>
                <textarea className="task-area" style={{ minHeight: 120 }} placeholder="Please provide a brief reason for your leave request..."
                  value={leaveData.reason} onChange={e => setLeaveData({ ...leaveData, reason: e.target.value })} />
              </div>

              <button className="act-btn" onClick={handleLeaveRequest}
                style={{ width: "100%", background: T.accent, color: "white", justifyContent: "center", padding: "14px", borderRadius: 12 }}>
                <Icon d={icons.check} size={16} color="white" />
                Submit Leave Application
              </button>
            </div>

            <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, padding: 24, overflow: "hidden" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 20 }}>My Leave History</div>
              <div style={{ overflowY: "auto", maxHeight: 500, paddingRight: 6 }}>
                {myLeaves.length === 0 ? (
                  <div style={{ textAlign: "center", color: T.muted, padding: "60px 0" }}>
                    <div style={{ opacity: 0.3, marginBottom: 12 }}><Icon d={icons.calendar} size={48} /></div>
                    No leave requests found
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[...myLeaves].reverse().map(l => (
                      <div key={l.id} style={{ padding: 18, borderRadius: 16, background: T.surface, border: `1px solid ${T.border}`, transition: "transform 0.15s" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{new Date(l.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} - {new Date(l.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          <Badge status={l.status} />
                        </div>
                        <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.5, marginBottom: l.admin_comment ? 12 : 0 }}>{l.reason}</div>
                        {l.admin_comment && (
                          <div style={{ marginTop: 12, fontSize: 12, color: T.accent, background: "white", padding: "10px 14px", borderRadius: 10, borderLeft: `4px solid ${T.accent}`, boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                            <div style={{ fontWeight: 800, fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Admin Feedback</div>
                            {l.admin_comment}
                          </div>
                        )}
                        <div style={{ marginTop: 10, fontSize: 10, color: T.muted, textAlign: "right" }}>Applied on {new Date(l.applied_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "messages" && (
          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, height: "75vh" }}>
            <div style={{ background: "white", borderRadius: 20, border: `1px solid ${T.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", padding: "10px 12px" }}>Direct Message</div>
              <button onClick={() => setActiveChat({ type: 'admin', id: 'admin', name: 'Admin Chat' })} style={{
                padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                background: activeChat.type === 'admin' ? T.surface : "none", color: activeChat.type === 'admin' ? T.accent : T.ink,
                fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 10
              }}>
                <Icon d={icons.user} size={16} />
                Admin Chat
              </button>
              
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", padding: "10px 12px", marginTop: 10 }}>Team Channels</div>
              {groups.length === 0 && <div style={{ fontSize: 12, color: T.faint, padding: "0 12px" }}>No groups yet</div>}
              {groups.map(g => {
                const gId = `group_${g.id}`;
                const unread = groupUnreadMap[gId] || 0;
                return (
                  <button key={g.id} onClick={() => setActiveChat({ type: 'group', id: gId, name: g.name })} style={{
                    padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                    background: activeChat.id === gId ? T.surface : "none", color: activeChat.id === gId ? T.accent : T.ink,
                    fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 10, position: "relative"
                  }}>
                    <Icon d={icons.tasks} size={16} />
                    {g.name}
                    {unread > 0 && (
                      <span style={{ position: "absolute", top: 12, right: 12, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 800 }}>{unread}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="premium-card" style={{ padding: 0, overflow: "hidden" }}>
              <ChatPanel
                currentUser={{ id: employee.id, name: employee.name }}
                targetUser={activeChat.type === 'admin' ? { id: 'admin', name: 'Admin' } : null}
                groupId={activeChat.type === 'group' ? activeChat.id : null}
                onBack={null}
              />
            </div>
          </div>
        )}


        {/* Employee profile footer */}
        <div className="profile-footer" style={{
          marginTop: 20, background: T.white, borderRadius: 16, padding: "16px 24px",
          border: `1px solid ${T.border}`, display: "flex", alignItems: "center",
          gap: 16, justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={employee.name} size={44} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{employee.name}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{employee.role} · {employee.dept}</div>
            </div>
          </div>
          <div className="profile-footer-stats" style={{ display: "flex", gap: 24 }}>
            {[
              { label: "Employee ID", value: employee.id },
              { label: "Department", value: employee.dept },
              { label: "Today's Status", value: status === "idle" ? "Pending" : status === "loggedIn" ? "Active" : "Complete" },
            ].map(f => (
              <div key={f.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 2, letterSpacing: 0.4 }}>{f.label.toUpperCase()}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ASSIGN TASK MODAL
══════════════════════════════════════════════════════════════ */
function AssignTaskModal({ employee, onClose, onAssigned }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title || !desc) return;
    setLoading(true);
    try {
      const resp = await fetch(TASKS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee.id,
          title,
          description: desc,
          status: "Assigned"
        })
      });
      if (resp.ok) {
        onAssigned();
        onClose();
      } else {
        alert("Failed to assign task");
      }
    } catch (e) {
      console.error(e);
      alert("Error connecting to server");
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2100,
      background: "rgba(11, 31, 53, 0.4)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "fadeIn 0.3s ease"
    }} onClick={onClose}>
      <div style={{
        background: "white", borderRadius: 28, width: "100%", maxWidth: 480,
        boxShadow: "0 25px 60px -12px rgba(0,0,0,0.25)", animation: "popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)"
      }} onClick={e => e.stopPropagation()}>

        {/* Header with Gradient */}
        <div style={{
          background: `linear-gradient(135deg, ${T.ink} 0%, #1e3a5f 100%)`,
          padding: "32px 32px", color: "white", position: "relative"
        }}>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon d={icons.tasks} size={22} color="white" />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Assign Task</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{employee.name} · {employee.id}</div>
              </div>
            </div>
          </div>
          {/* Decorative Circle */}
          <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
        </div>

        <div style={{ padding: "32px" }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink2, marginBottom: 8, marginLeft: 2 }}>Task Title</label>
            <input className="premium-inp"
              placeholder="e.g., Finalize Monthly Report"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 14, border: `1.5px solid ${T.border}`,
                background: T.surface, fontSize: 14, fontWeight: 500, outline: "none", transition: "all 0.2s",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink2, marginBottom: 8, marginLeft: 2 }}>Task Details</label>
            <textarea className="premium-area"
              placeholder="Provide clear instructions for the employee..."
              value={desc}
              onChange={e => setDesc(e.target.value)}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 14, border: `1.5px solid ${T.border}`,
                background: T.surface, fontSize: 14, fontWeight: 500, outline: "none", transition: "all 0.2s",
                minHeight: 120, resize: "none", lineHeight: 1.6, boxSizing: "border-box"
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: "14px", borderRadius: 14, border: `1.5px solid ${T.border}`,
              background: "white", color: T.ink2, fontWeight: 700, cursor: "pointer",
              transition: "all 0.2s", fontSize: 15
            }} className="p-btn-sec">Cancel</button>
            <button onClick={submit} disabled={loading} style={{
              flex: 1, padding: "14px", borderRadius: 14, border: "none",
              background: loading ? T.faint : T.accent,
              color: "white", fontWeight: 700, cursor: "pointer",
              transition: "all 0.2s", fontSize: 15,
              boxShadow: `0 8px 20px ${T.accent}30`
            }} className="p-btn-pri">
              {loading ? "Assigning..." : "Send Task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Chat Panel ────────────────────────────────────────────── */
function ChatPanel({ currentUser, targetUser, onBack, groupId = null, subStatus = null, groupName = null, onUserClick = null }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef();
  const fileInputRef = useRef();
  const prevCountRef = useRef(0);
  
  const fetchMsgs = async () => {
    try {
      const url = groupId 
        ? `${MESSAGES_URL}?group_id=${groupId}`
        : `${MESSAGES_URL}?user1=${currentUser.id}&user2=${targetUser.id}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setMsgs(data);
        if (targetUser) {
          // Mark messages received from targetUser as read
          fetch(MESSAGES_READ_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender_id: targetUser.id, receiver_id: currentUser.id })
          });
        }
        if (groupId && data.length > 0) {
          // Track last seen message for group notifications
          const lastId = data[data.length - 1].id;
          const storageKey = currentUser.id === 'admin' ? "wt_read_admin" : `wt_read_${currentUser.id}`;
          const lastRead = JSON.parse(localStorage.getItem(storageKey) || "{}");
          lastRead[groupId] = lastId;
          localStorage.setItem(storageKey, JSON.stringify(lastRead));
        }
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    prevCountRef.current = 0; // Reset count when switching chats to prevent false notification sounds
    fetchMsgs();
    const t = setInterval(fetchMsgs, 5000);
    return () => clearInterval(t);
  }, [targetUser?.id, groupId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    
    // Play sound if new message arrived from others
    if (msgs.length > prevCountRef.current && prevCountRef.current > 0) {
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.sender_id !== currentUser.id) {
        // Only play if window is NOT focused
        if (!document.hasFocus()) {
          (window._triggerNotif || playNotifySound)();
        }
      }
    }
    prevCountRef.current = msgs.length;
  }, [msgs]);

  const send = async () => {
    if (!input.trim() && !file) return;
    if (!currentUser?.id) {
      alert("Session error: User ID missing. Please refresh the page.");
      return;
    }

    const formData = new FormData();
    formData.append('sender_id', currentUser.id);
    formData.append('content', input.trim() || " ");
    
    if (groupId) {
      formData.append('group_id', groupId);
    } else if (targetUser?.id) {
      formData.append('receiver_id', targetUser.id);
    } else {
      alert("Error: No recipient or group selected.");
      return;
    }

    if (file) formData.append('image', file);

    setSending(true);
    try {
      const resp = await fetch(MESSAGES_URL, {
        method: "POST",
        body: formData
      });
      if (resp.ok) { 
        setInput(""); 
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchMsgs(); 
      } else {
        const errData = await resp.json();
        console.error("Send error response:", errData);
        alert("Failed to send: " + (errData.detail || JSON.stringify(errData)));
      }
    } catch (e) { 
      console.error("Network error during send:", e);
      alert("Network error: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const handlePaste = (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const file = new File([blob], `pasted_img_${Date.now()}.png`, { type: blob.type });
          setFile(file);
          // Optional: focus input after paste
        }
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.white, borderRadius: 20, overflow: "hidden", border: `1px solid ${T.border}` }}>
      <div style={{ padding: "16px 20px", background: T.ink, color: "white", display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", alignItems: "center" }}><Icon d={icons.chevronLeft} size={18} /></button>}
        {targetUser && <Avatar name={targetUser.name} size={32} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{targetUser ? targetUser.name : (groupName || groupId?.replace('group_', 'Team: ') || 'Group Chat')}</div>
          <div style={{ fontSize: 10, color: T.faint }}>{subStatus || (targetUser ? (targetUser.id === "admin" ? "System Administrator" : "Employee") : "Group Conversation")}</div>
        </div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, background: "#f8fafc" }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: "center", color: T.muted, padding: "40px 0", fontSize: 13 }}>
            No messages yet. Start the conversation!
          </div>
        )}
        {msgs.map(m => {
          const isMe = m.sender_id === currentUser.id;
          return (
            <div key={m.id} style={{
              alignSelf: isMe ? "flex-end" : "flex-start",
              maxWidth: "85%", padding: "8px 12px", borderRadius: 16,
              borderTopRightRadius: isMe ? 4 : 16,
              borderTopLeftRadius: isMe ? 16 : 4,
              background: isMe ? "#dcf8c6" : "white",
              color: T.ink,
              boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
              border: isMe ? "none" : `1px solid ${T.border}`,
              fontSize: 13, lineHeight: 1.5, position: "relative",
              display: "flex", flexDirection: "column"
            }}>
              {groupId && !isMe && (
                <div 
                  style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 3, cursor: onUserClick ? "pointer" : "default" }}
                  onClick={() => onUserClick && onUserClick(m.sender_id, m.sender_username)}
                >
                  {m.sender_username || m.sender_id}
                </div>
              )}
              {m.image && (
                <div style={{ marginBottom: 4, borderRadius: 12, overflow: "hidden", background: "#00000008" }}>
                  <img src={m.image} alt="attachment" style={{ 
                    maxHeight: 300, maxWidth: "100%", width: "auto", display: "block", 
                    borderRadius: 8, cursor: "pointer", objectFit: "contain" 
                  }} onClick={() => window.open(m.image, '_blank')} />
                </div>
              )}
              {m.content && m.content !== " " && <div style={{ padding: "2px 0" }}>{m.content}</div>}
              <div style={{ fontSize: 9, opacity: 0.5, marginTop: 2, textAlign: "right", fontStyle: "italic", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {isMe && (
                  <div style={{ display: "flex" }}>
                    <Icon d={icons.check} size={11} color={m.is_read ? "#34b7f1" : "currentColor"} />
                    <Icon d={icons.check} size={11} color={m.is_read ? "#34b7f1" : "currentColor"} style={{ marginLeft: -7 }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10, background: "white" }}>
        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>
            <Icon d={icons.camera} size={14} color={T.accent} />
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</span>
            <button onClick={() => setFile(null)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontWeight: 700 }}>×</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={e => setFile(e.target.files[0])} />
          <button onClick={() => fileInputRef.current.click()} style={{
            width: 44, height: 44, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.muted
          }}>
            <Icon d={icons.camera} size={20} />
          </button>
          <input className="adm-inp" style={{ flex: 1, padding: "10px 14px", borderRadius: 10 }}
            placeholder="Type a message or paste an image..." value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            onPaste={handlePaste}
          />
          <button onClick={send} disabled={sending} style={{
            width: 44, height: 44, borderRadius: 10, background: sending ? T.muted : T.accent, color: "white",
            border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: sending ? "not-allowed" : "pointer"
          }}>
            {sending ? (
              <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            ) : (
              <Icon d={icons.check} size={18} color="white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════════════════════════ */
function AdminDashboard({ onSignOut, allEmployees = [], showToast }) {
  // State for live timer
  const [now, setNow] = useState(Date.now());

  // Update 'now' every second for live timer
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [weeklyFrom, setWeeklyFrom] = useState(() => {
    const d = getStartOfWeek(new Date());
    return d.toISOString().split('T')[0];
  });
  const [weeklyTo, setWeeklyTo] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [activeTab, setTab] = useState(() => localStorage.getItem("wt_tab_adm") || "attendance");

  useEffect(() => {
    localStorage.setItem("wt_tab_adm", activeTab);
  }, [activeTab]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [assignTaskTo, setAssignTaskTo] = useState(null);
  const [taskFeed, setTaskFeed] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [adminComment, setAdminComment] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: "date", dir: "desc" });
  const [chatWith, setChatWith] = useState(() => {
    const saved = localStorage.getItem("wt_chat_with");
    try { return saved ? JSON.parse(saved) : null; } catch(e) { return null; }
  });

  useEffect(() => {
    if (chatWith) localStorage.setItem("wt_chat_with", JSON.stringify(chatWith));
    else localStorage.removeItem("wt_chat_with");
  }, [chatWith]);
  const [groups, setGroups] = useState([]);
  const [selGroup, setSelGroup] = useState(null);
  const [unreadMap, setUnreadMap] = useState({}); // { employee_id: count }
  const [groupSearch, setGroupSearch] = useState("");
  const [groupMessages, setGroupMessages] = useState([]);
  const [chatSummaries, setChatSummaries] = useState({}); // { employee_id: { last_message, timestamp, is_read } }

  const isFirstUnreadAdmin = useRef(true);
  const [groupUnreadMapAdmin, setGroupUnreadMapAdmin] = useState({});
  const lastMsgsCountAdminRef = useRef(0);
  const lastUnreadAdminRef = useRef(0);
  
  const activeTabAdmRef = useRef(activeTab);
  const chatWithRef = useRef(chatWith);
  const selGroupRef = useRef(selGroup);

  useEffect(() => { activeTabAdmRef.current = activeTab; }, [activeTab]);
  useEffect(() => { chatWithRef.current = chatWith; }, [chatWith]);
  useEffect(() => { selGroupRef.current = selGroup; }, [selGroup]);

  useEffect(() => {
    const fetchAllUnread = async () => {
      try {
        const resp = await fetch(MESSAGES_URL + "?user1=admin");
        if (resp.ok) {
          const allMsgs = await resp.json();
          const map = {};
          let totalDirectUnread = 0;
          allMsgs.forEach(m => {
            if (!m.is_read && m.receiver_id === "admin") {
              const sid = String(m.sender_id).toLowerCase();
              map[sid] = (map[sid] || 0) + 1;
              totalDirectUnread++;
            }
          });
          
          // Group unread logic (approximate using localStorage)
          const lastRead = JSON.parse(localStorage.getItem("wt_read_admin") || "{}");
          const gMap = {};
          allMsgs.forEach(m => {
            if (m.group_id && m.id > (lastRead[m.group_id] || 0) && m.sender_id !== 'admin') {
              gMap[m.group_id] = (gMap[m.group_id] || 0) + 1;
            }
          });
          setGroupUnreadMapAdmin(gMap);
          
          const groupUnreadTotal = Object.values(gMap).reduce((a, b) => a + b, 0);
          const totalUnread = totalDirectUnread + groupUnreadTotal;

          // Sound and Toast for ANY new message from others
          if (!isFirstUnreadAdmin.current && allMsgs.length > lastMsgsCountAdminRef.current) {
            const last = allMsgs[allMsgs.length - 1];
            if (last && last.sender_id !== 'admin') {
              const isViewingMsgs = activeTabAdmRef.current === 'employees'; // or 'groups'
              const isViewingThisGroup = activeTabAdmRef.current === 'groups' && selGroupRef.current && `group_${selGroupRef.current.id}` === last.group_id;
              if (!document.hasFocus() || (!isViewingMsgs && !chatWithRef.current && !isViewingThisGroup)) {
                (showToast || playNotifySound)();
                if (!isViewingMsgs && !chatWithRef.current && !isViewingThisGroup) {
                  showToast?.(`New message from ${last.sender_username || last.sender_id}`, "info");
                }
              }
            }
          }
          
          isFirstUnreadAdmin.current = false;
          lastMsgsCountAdminRef.current = allMsgs.length;
          lastUnreadAdminRef.current = totalUnread;
          setUnreadMap(map);
        }
        
        // Fetch summaries for WhatsApp-style sorting
        const sResp = await fetch(CHAT_SUMMARIES_URL);
        if (sResp.ok) setChatSummaries(await sResp.json());
      } catch (e) {}
    };
    const iv = setInterval(fetchAllUnread, 5000);
    fetchAllUnread();
    return () => clearInterval(iv);
  }, []);



  const fetchAttendance = async () => {
    setLoading(true);
    let data = [];

    // 1. Try fetching from local database first
    try {
      const resp = await fetch(BACKEND_URL);
      if (resp.ok) {
        data = await resp.json();
        console.log("Fetched from local database");
      }
    } catch (e) {
      console.warn("Local database fetch failed, trying cloud sheet...", e);
    }

    // 2. Try fetching from Google Sheet if local is empty or failed
    if (data.length === 0) {
      try {
        const resp = await fetch(`${SCRIPT_URL}?action=attendance`);
        if (resp.ok) data = await resp.json();
      } catch (e) { console.error("Cloud fetch failed", e); }
    }

    if (Array.isArray(data)) {
      // Normalize keys to lowercase for easier mapping
      const norm = data.map(row => {
        const o = {};
        Object.keys(row).forEach(k => {
          const cleanK = k.toLowerCase().replace(/ /g, "");
          o[cleanK] = String(row[k]).trim();
        });
        return o;
      });
      setRecords(norm);
    }
    setLastSync(new Date());
    setLoading(false);

    // Fetch Task Feed
    try {
      const tResp = await fetch(TASKS_URL);
      if (tResp.ok) {
        const tData = await tResp.json();
        setTaskFeed(tData);
      }
    } catch (e) {
      console.error("Failed to fetch task feed", e);
    }

    // Fetch Leave Requests
    try {
      const lResp = await fetch(LEAVES_URL);
      if (lResp.ok) setLeaveRequests(await lResp.json());
    } catch (e) {
      console.error("Failed to fetch leaves", e);
    }

    // Fetch Profiles
    try {
      const pResp = await fetch(PROFILES_URL);
      if (pResp.ok) setProfiles(await pResp.json());
    } catch (e) {
      console.error("Failed to fetch profiles", e);
    }

    // Fetch Groups
    try {
      const gResp = await fetch(GROUPS_URL);
      if (gResp.ok) {
        const gData = await gResp.json();
        setGroups(gData);
        if (selGroup) {
          const updated = gData.find(g => g.id === selGroup.id);
          if (updated) setSelGroup(updated);
        }
      }
    } catch (e) { console.error("Failed to fetch groups", e); }
  };

  const fetchGroupMessages = async () => {
    if (!selGroup) return;
    try {
      const resp = await fetch(MESSAGES_URL + `?group_id=group_${selGroup.id}`);
      if (resp.ok) setGroupMessages(await resp.json());
    } catch (e) {}
  };

  useEffect(() => {
    fetchGroupMessages();
    const iv = setInterval(fetchGroupMessages, 5000);
    return () => clearInterval(iv);
  }, [selGroup]);

  const handleApproveLeave = async (leaveId, status) => {
    try {
      const resp = await fetch(`${LEAVES_URL}${leaveId}/approve/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_comment: adminComment })
      });
      if (resp.ok) {
        setAdminComment("");
        fetchAttendance();
        alert(`Leave request ${status.toLowerCase()} successfully`);
      } else {
        const errorData = await resp.json();
        alert(`Failed: ${errorData.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Network error while updating leave status");
    }
  };


  useEffect(() => {
    fetchAttendance();
    const t = setInterval(fetchAttendance, 10000); // auto-refresh every 10s
    return () => clearInterval(t);
  }, []);

  // Derive stats with live calculation
  const departments = Array.from(new Set(allEmployees.map(e => e.dept).filter(Boolean)));
  const today = fmtDate(new Date());

  // Pre-process records to include live data
  const processedRecords = records.map(r => {
    // 1. Check Heartbeat Staleness (If last_active is older than 90 seconds, they are offline)
    const lastActive = r.last_active ? new Date(r.last_active).getTime() : 0;
    const isHeartbeatStale = (now - lastActive) > 90000; // 90 seconds threshold (3 heartbeats)
    
    if (r.date === today && (r.status === "Active" || r.status === "On Break") && r.last_status_change) {
      const workBase = parseHMS(r.hours || r.workinghours);
      const breakBase = parseHMS(r.break_time || r.breaktime || "00:00:00");
      const lastChange = new Date(r.last_status_change).getTime();
      
      // If signal is fresh, count up to 'now'
      // If signal is stale, count only up to 'lastActive'
      const endTime = (!isHeartbeatStale) ? now : Math.max(lastActive, lastChange);
      const elapsed = Math.floor((endTime - lastChange) / 1000);
      
      const liveWorkSecs = r.status === "Active" ? workBase + (elapsed > 0 ? elapsed : 0) : workBase;
      const liveBreakSecs = r.status === "On Break" ? breakBase + (elapsed > 0 ? elapsed : 0) : breakBase;
      
      const liveHoursStr = formatHMS(liveWorkSecs);
      const liveBreakStr = formatHMS(liveBreakSecs);
      const liveOvertimeSecs = liveWorkSecs > 28800 ? liveWorkSecs - 28800 : 0;
      const liveOvertimeStr = liveOvertimeSecs > 0 ? formatHMS(liveOvertimeSecs) : "—";
      
      // Determine status
      let liveStatus = isHeartbeatStale ? "Offline" : r.status;
      
      return { 
        ...r, 
        live_hours: liveHoursStr, 
        live_hours_secs: liveWorkSecs,
        live_break_time: liveBreakStr,
        live_overtime: liveOvertimeStr,
        live_status: liveStatus,
        is_live: !isHeartbeatStale
      };
    }
    
    // For non-active or past records, use stored values
    const hSecs = parseHMS(r.hours || r.workinghours);
    return { 
      ...r, 
      live_hours: r.hours || r.workinghours || "—", 
      live_hours_secs: hSecs,
      live_break_time: r.break_time || r.breaktime || "—",
      live_overtime: r.extrahours || r.extra_hours || "—",
      live_status: r.status,
      is_live: false
    };
  });

  // Weekly aggregation logic
  const weeklyReportData = useMemo(() => {
    const start = new Date(weeklyFrom);
    const end = new Date(weeklyTo);
    
    const weekDates = [];
    let curr = new Date(start);
    // Limit to prevent infinite loop or massive arrays
    let count = 0;
    while (curr <= end && count < 31) {
      weekDates.push(fmtDate(new Date(curr)));
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    return allEmployees.map(emp => {
      // Get all records for this employee in the current week
      const empRecs = records.filter(r => (r.id === emp.id || r.employeeid === emp.id) && weekDates.includes(r.date));
      
      let totalWorkSecs = 0;
      let totalBreakSecs = 0;
      let daysPresent = 0;
      let weeklyTasks = [];

      // Map to keep track of processed daily values (for live data support)
      const dateMap = {};
      empRecs.forEach(r => {
        // If it's today, we might have live data in processedRecords
        let work = parseHMS(r.hours || r.workinghours);
        let brk = parseHMS(r.break_time || r.breaktime);
        
        if (r.date === today) {
           const liveRec = processedRecords.find(pr => pr.id === emp.id || pr.employeeid === emp.id);
           if (liveRec) {
              work = parseHMS(liveRec.live_hours);
              brk = parseHMS(liveRec.live_break_time);
           }
        }
        
        // Use the latest record for each date in the week
        if (!dateMap[r.date] || parseHMS(r.hours || r.workinghours) > dateMap[r.date].work) {
          dateMap[r.date] = { work, brk, hasLog: r.logint && r.logint !== "—", task: r.tasks || r.workstatus };
        }
      });

      Object.values(dateMap).forEach(v => {
        totalWorkSecs += v.work;
        totalBreakSecs += v.brk;
        if (v.hasLog) daysPresent++;
        if (v.task && v.task !== "—" && v.task !== "Not Signed In" && v.task !== "On Approved Leave") {
          weeklyTasks.push(v.task);
        }
      });

      return {
        id: emp.id,
        name: emp.name,
        dept: emp.dept,
        totalWork: formatHMS(totalWorkSecs),
        totalBreak: formatHMS(totalBreakSecs),
        daysPresent,
        avgWork: formatHMS(daysPresent > 0 ? Math.floor(totalWorkSecs / daysPresent) : 0),
        tasks: weeklyTasks.join(" | ")
      };
    });
  }, [processedRecords, records, allEmployees, today]);


  const todayRecs = processedRecords.filter(r => r.date === today);
  const registeredCount = allEmployees.length;
  const fullDayToday = todayRecs.filter(r => r.live_status === "Full Day" || r.status === "Full Day").length;
  const iwdToday = todayRecs.filter(r => r.live_status === "Incomplete Workday(IWD)" || r.status === "Incomplete Workday(IWD)").length;
  const halfDayToday = todayRecs.filter(r => r.live_status === "Half Day" || r.status === "Half Day").length;

  // Filtered records
  const filtered = (() => {
    const q = search.toLowerCase();
    const targetDate = filterDate ? formatInputDate(filterDate) : today;

    if (filterStatus === "Leave" || filterStatus === "leaves") {
      // Use targetDate (calculated from filterDate or today) for checking leave status
      // Parse targetDate string "29 Apr 2026" back to a Date object if needed
      // But targetDate is a string from records or today string.
      // It's safer to just parse the filterDate input if it exists.

      let checkDate = new Date();
      if (filterDate) {
        // Expecting DD MMM YYYY or YYYY-MM-DD
        checkDate = new Date(filterDate);
        if (isNaN(checkDate)) checkDate = new Date(); // fallback
      }
      checkDate.setHours(0, 0, 0, 0);

      return allEmployees
        .filter(emp => {
          const onLeave = leaveRequests.some(l => {
            if (l.status !== "Approved") return false;
            const lId = String(l.employee_id).toLowerCase().trim();
            const eId = String(emp.id).toLowerCase().trim();
            if (lId !== eId) return false;

            const start = new Date(l.start_date);

            const end = new Date(l.end_date);
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);

            return checkDate >= start && checkDate <= end;
          });

          const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.id.toLowerCase().includes(q);
          return onLeave && matchSearch;
        })


        .map(emp => ({
          id: emp.id,
          name: emp.name,
          dept: emp.dept,
          date: targetDate,
          logint: "—",
          logoutt: "—",
          hours: "—",
          break_time: "00:00:00",
          tasks: "On Approved Leave",
          status: "Leave"
        }));
    }

    if (filterStatus === "messages") {
      return allEmployees
        .filter(emp => {
          const hasUnread = unreadMap[emp.id] > 0;
          const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.id.toLowerCase().includes(q);
          return hasUnread && matchSearch;
        })
        .map(emp => ({ ...emp, status: "Message" })); // Placeholder for filtering logic consistency
    }

    if (filterStatus === "notlogin") {
      return allEmployees
        .filter(emp => {
          const hasRec = records.some(r => {
            const eid = r.id || r.employeeid;
            return eid === emp.id && r.date === targetDate;
          });
          const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.id.toLowerCase().includes(q);
          return !hasRec && matchSearch;
        })
        .map(emp => ({
          id: emp.id,
          name: emp.name,
          dept: emp.dept,
          date: targetDate,
          logint: "—",
          logoutt: "—",
          hours: "—",
          break_time: "00:00:00",
          tasks: "Not Signed In",
          status: "Incomplete"
        }));
    }

    const base = processedRecords.filter(r => {
      const ms = !q || (r.name || r.employeename || "").toLowerCase().includes(q)
        || (r.id || r.employeeid || "").toLowerCase().includes(q)
        || (r.dept || r.department || "").toLowerCase().includes(q);
      const md = !filterDate || (r.date || "") === targetDate;
      
      // Use live_status for filtering if it's today
      const currentStatus = (r.date === today && r.status === "Active") ? r.live_status : r.status;
      const mst = filterStatus === "all" || currentStatus === filterStatus || r.status === filterStatus;
      
      const mdt = filterDept === "all" || (r.dept || r.department) === filterDept;
      return ms && md && mst && mdt;
    });

    return [...base].sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, dir } = sortConfig;
      
      if (key === "hours") {
        return dir === "asc" ? a.live_hours_secs - b.live_hours_secs : b.live_hours_secs - a.live_hours_secs;
      }
      
      let valA = a[key] || "";
      let valB = b[key] || "";

      if (key === "date") {
        valA = new Date(valA); valB = new Date(valB);
      } else if (key === "logint" || key === "logoutt") {
        // Convert "01:00:00 pm" to comparable value
        const parseTime = (s) => {
          if (!s || s === "—") return 0;
          const parts = s.split(" ");
          if (parts.length < 2) return 0;
          const [time, ampm] = parts;
          let [h, m, s_] = time.split(":").map(Number);
          if (ampm.toLowerCase() === "pm" && h < 12) h += 12;
          if (ampm.toLowerCase() === "am" && h === 12) h = 0;
          return h * 3600 + m * 60 + s_;
        };

        valA = parseTime(valA); valB = parseTime(valB);
      } else if (key === "extrahours") {
        const parseDur = (s) => {
          if (!s || s === "—") return 0;
          const parts = s.split(":").map(Number);
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          return parseFloat(s) || 0;
        };
        valA = parseDur(a.live_overtime); valB = parseDur(b.live_overtime);
      }

      if (dir === "asc") return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });



  })();

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filtered.length ? filtered : records);
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, "Brolly_Software_Solutions_Attendance_Report.xlsx");
  };

  const colStyle = {
    padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
    color: T.muted, letterSpacing: 0.5, borderBottom: `1px solid ${T.border}`, textTransform: "uppercase", whiteSpace: "nowrap"
  };
  const cellStyle = { padding: "11px 14px", fontSize: 13, color: T.ink, borderBottom: `1px solid ${T.border}` };



  return (
    <div style={{ minHeight: "100vh", background: "#eef3f9", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        .adm-tab{padding:10px 22px;border-radius:12px;border:none;cursor:pointer;font-size:13px;
          font-weight:700;transition:all 0.25s cubic-bezier(0.4, 0, 0.2, 1);background:none;color:${T.muted};}
        .adm-tab.active{background:${T.white};color:${T.accent};box-shadow:0 10px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.08);}
        .adm-tab:hover:not(.active){color:${T.ink};background:rgba(255,255,255,0.5);}
        .adm-row{transition:all 0.2s;}
        .adm-row:hover{background:${T.surface};transform:translateY(-1px);}
        .adm-inp{padding:11px 16px;border-radius:12px;border:1.5px solid ${T.border};
          font-size:13px;outline:none;color:${T.ink};background:white;transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:0 1px 2px rgba(0,0,0,0.05);}
        .adm-inp:focus{border-color:${T.accent};box-shadow:0 0 0 4px ${T.accent}15;background:white;}
        .premium-card{background:white;border-radius:24px;border:1px solid ${T.border};
          box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);overflow:hidden;}
        @keyframes popIn{0%{opacity:0;transform:scale(0.95) translateY(10px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(239,68,68,0.7)}70%{transform:scale(1.1);box-shadow:0 0 0 10px rgba(239,68,68,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(239,68,68,0)}}
      `}</style>

      {/* Topbar */}
      <div className="adm-topbar" style={{
        background: T.ink, padding: "0 28px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 60, boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        position: "sticky", top: 0, zIndex: 1000
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="https://brollysolutions.in" style={{
            textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 10, background: "rgba(255,255,255,0.08)",
            color: "white", fontWeight: 700, fontSize: 12, border: "1.5px solid rgba(255,255,255,0.15)",
            transition: "all 0.2s", marginRight: 12
          }} onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
            onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}>
            <Icon d={icons.chevronLeft} size={13} color="white" />
            Go Back
          </a>
          <div style={{
            width: 36, height: 36, borderRadius: 9, background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
          }}>
            <img src={logo} alt="Brolly Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "white", letterSpacing: 0.2 }}>Brolly Admin</div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: 0.5 }}>ATTENDANCE CONTROL PANEL</div>
          </div>
        </div>

        <div className="adm-topbar-actions" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {lastSync && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 500, background: "rgba(255,255,255,0.05)", padding: "4px 10px", borderRadius: 8 }}>
              Sync: {lastSync.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <button onClick={fetchAttendance}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
              borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)",
              color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700,
              transition: "all 0.25s"
            }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"} onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}>
            <Icon d={icons.refresh} size={14} color="white" />
            <span className="adm-btn-text">Refresh</span>
          </button>
          <button onClick={exportExcel}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
              borderRadius: 12, border: "none", background: T.accent,
              color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700,
              transition: "all 0.2s", boxShadow: `0 4px 12px ${T.accent}40`
            }} onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"} onMouseOut={e => e.currentTarget.style.transform = "none"}>
            <Icon d={icons.save} size={14} color="white" />
            <span className="adm-btn-text">Export</span>
          </button>
          <button onClick={() => setTab("employees")} style={{
            position: "relative", width: 38, height: 38, borderRadius: 10, 
            background: activeTab === 'employees' ? T.purple : "rgba(255,255,255,0.08)", 
            color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            border: `1.5px solid ${activeTab === 'employees' ? T.purple : "rgba(255,255,255,0.15)"}`,
            transition: "all 0.2s"
          }} title="View Messages">
            <Icon d={icons.message} size={18} color="white" />
            {(Object.values(unreadMap).reduce((a, b) => a + b, 0) + Object.values(groupUnreadMapAdmin).reduce((a, b) => a + b, 0)) > 0 && (
              <span style={{
                position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%",
                background: T.red, color: "white", fontSize: 10, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0b1f35",
                animation: "pulse 2s infinite"
              }}>
                {Object.values(unreadMap).reduce((a, b) => a + b, 0) + Object.values(groupUnreadMapAdmin).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>

          <button onClick={onSignOut}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
              borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.15)", background: "none",
              color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700,
              transition: "all 0.25s"
            }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseOut={e => e.currentTarget.style.background = "none"}>
            <Icon d={icons.logout} size={14} color="white" />
            <span className="adm-btn-text">Sign out</span>
          </button>
        </div>
      </div>

      {/* ── Details Modal ── */}
      {selectedRecord && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(11,31,53,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }} onClick={() => setSelectedRecord(null)}>
          <div style={{
            background: "white", borderRadius: 24, width: "100%", maxWidth: 550,
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease",
            overflow: "hidden"
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              background: T.ink, padding: "24px 30px", color: "white",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={selectedRecord.name || selectedRecord.employeename} size={44} />
                <div>
                  <div style={{ fontSize: 13, color: T.faint, fontWeight: 600, letterSpacing: 0.5 }}>{selectedRecord.id || selectedRecord.employeeid}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedRecord.name || selectedRecord.employeename}</div>
                </div>
              </div>
              <button onClick={() => setSelectedRecord(null)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", opacity: 0.7 }}>
                <Icon d="M18 6L6 18M6 6l12 12" size={24} color="white" />
              </button>
            </div>

            <div style={{ padding: 30 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon d={icons.calendar} size={16} color={T.accent} />
                Activity for {selectedRecord.date}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, background: T.surface, padding: 18, borderRadius: 14 }}>
                <div style={{ borderRight: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>Work Session</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{selectedRecord.logint || selectedRecord.intime || "—"} → {selectedRecord.logoutt || selectedRecord.outtime || "—"}</div>
                </div>
                <div style={{ paddingLeft: 10 }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>Hours (Work / Break)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{selectedRecord.live_hours || "—"} / {selectedRecord.live_break_time || "—"}</div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: T.purpleBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon d={icons.tasks} size={15} color={T.purple} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Task Report</div>
                  <div style={{ marginLeft: "auto" }}><Badge status={selectedRecord.live_status || selectedRecord.status} /></div>
                </div>
                <div style={{
                  background: T.surface, padding: 18, borderRadius: 14,
                  fontSize: 13.5, color: T.ink2, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  border: `1px solid ${T.border}`, maxHeight: 150, overflowY: "auto", marginBottom: 20
                }}>
                  <b style={{ fontSize: 10, color: T.muted, display: "block", textTransform: "uppercase", marginBottom: 4 }}>Daily Log:</b>
                  {selectedRecord.tasks || selectedRecord.workstatus || "No log notes provided."}
                </div>

                {selectedRecord.screenshot && (
                  <div style={{ marginBottom: 20 }}>
                    <b style={{ fontSize: 10, color: T.muted, display: "block", textTransform: "uppercase", marginBottom: 8 }}>Task Screenshot:</b>
                    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}`, cursor: "pointer" }} onClick={() => window.open(selectedRecord.screenshot, '_blank')}>
                      <img src={selectedRecord.screenshot} alt="task screenshot" style={{ width: "100%", display: "block" }} />
                    </div>
                  </div>
                )}

                {/* Assigned Tasks in Modal */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <b style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Assigned Tasks:</b>
                  {taskFeed.filter(t => (t.employee_id === (selectedRecord.id || selectedRecord.employeeid)) && fmtDate(new Date(t.assigned_at)) === selectedRecord.date).map(t => (
                    <div key={t.id} style={{ padding: 14, background: "white", borderRadius: 12, border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 800, color: T.ink }}>{t.title}</span>
                        <Badge status={t.status} />
                      </div>
                      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{t.description}</div>
                      {t.completed_at && <div style={{ marginTop: 6, fontSize: 10, color: T.green, fontWeight: 700 }}>✓ Done at {new Date(t.completed_at).toLocaleTimeString()}</div>}
                    </div>
                  ))}
                  {taskFeed.filter(t => (t.employee_id === (selectedRecord.id || selectedRecord.employeeid)) && fmtDate(new Date(t.assigned_at)) === selectedRecord.date).length === 0 && (
                    <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No tasks assigned for this day.</div>
                  )}
                </div>
              </div>

            </div>

            <div style={{ padding: "0 30px 30px", display: "flex", gap: 12 }}>
              <button onClick={() => setSelectedRecord(null)} style={{
                flex: 1, padding: 14, borderRadius: 12, border: `1.5px solid ${T.border}`,
                background: "white", color: T.ink, fontWeight: 700, cursor: "pointer"
              }}>
                Close
              </button>
              <button onClick={() => {
                const text = `Attendance: ${selectedRecord.name || selectedRecord.employeename}\nDate: ${selectedRecord.date}\nHours: ${selectedRecord.live_hours}\nTasks: ${selectedRecord.tasks || selectedRecord.workstatus || "—"}`;
                navigator.clipboard.writeText(text);
                alert("Report copied to clipboard!");
              }} style={{
                flex: 1, padding: 14, borderRadius: 12, border: "none",
                background: T.accent, color: "white", fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8
              }}>
                <Icon d={icons.save} size={15} color="white" />
                Copy Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Task Modal */}
      {assignTaskTo && (
        <AssignTaskModal
          employee={assignTaskTo}
          onClose={() => setAssignTaskTo(null)}
          onAssigned={fetchAttendance}
        />
      )}
      {/* Chat Modal */}
      {chatWith && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1001,
          background: "rgba(11,31,53,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }} onClick={() => setChatWith(null)}>
          <div style={{
            width: "100%", maxWidth: 450, height: "80vh",
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease",
          }} onClick={e => e.stopPropagation()}>
            <ChatPanel
              currentUser={{ id: "admin", name: "Admin" }}
              targetUser={chatWith}
              onBack={() => setChatWith(null)}
              subStatus={(() => {
                const latestRec = records.filter(r => r.id === chatWith.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                const lastActive = latestRec?.last_active ? new Date(latestRec.last_active) : null;
                const isOnline = lastActive && (new Date() - lastActive < 120000);
                return isOnline ? "Online Now" : (lastActive ? `Last seen: ${lastActive.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : "Offline");
              })()}
            />
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* Stat cards */}
        <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 24 }}>
          <StatCard label="Total Employees" value={String(registeredCount)} sub="Registered" icon={icons.user} color={T.accent} bg="#e8f0fc" />
          <StatCard label="Today Present" value={String(todayRecs.length)} sub={today} icon={icons.check} color={T.green} bg={T.greenBg} isLive={true} />
          <StatCard label="Full Day Today" value={String(fullDayToday)} sub="≥ 8 hours" icon={icons.clock} color={T.green} bg={T.greenBg} />
          <StatCard label="IWD Today" value={String(iwdToday)} sub="4.5 - 8 hrs" icon={icons.chart} color={T.orange} bg={T.orangeBg} />
          <StatCard label="Half Day Today" value={String(halfDayToday)} sub="< 4.5 hours" icon={icons.clock} color={T.amber} bg={T.amberBg} />
          <StatCard label="Total Records" value={String(records.length)} sub="All time" icon={icons.calendar} color={T.purple} bg={T.purpleBg} />
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 4, background: "#e4eaf3", borderRadius: 10,
          padding: 4, marginBottom: 20, width: "fit-content"
        }}>
          {[
            { k: "attendance", label: "Attendance Records" },
            { k: "weekly", label: "Weekly Report" },
            { k: "tasks", label: "Live Task Feed" },
            { k: "leaves", label: "Leave Requests" },
            { k: "groups", label: "Manage Groups", badge: Object.values(groupUnreadMapAdmin).reduce((a, b) => a + b, 0) },
            { k: "employees", label: "Employee List", badge: Object.values(unreadMap).reduce((a, b) => a + b, 0) },
          ].map(t => (
            <button key={t.k} className={`adm-tab${activeTab === t.k ? " active" : ""}`}
              onClick={() => setTab(t.k)} style={{ position: "relative" }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ position: "absolute", top: -6, right: -6, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 800 }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
              <Icon d={icons.eye} size={14} color={T.faint} />
            </div>
            <input className="adm-inp" placeholder="Search by name or ID..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: 32, boxSizing: "border-box" }} />
          </div>
          {activeTab === "weekly" ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>From:</div>
              <input className="adm-inp" type="date" value={weeklyFrom} onChange={e => setWeeklyFrom(e.target.value)} style={{ minWidth: 140 }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>To:</div>
              <input className="adm-inp" type="date" value={weeklyTo} onChange={e => setWeeklyTo(e.target.value)} style={{ minWidth: 140 }} />
            </>
          ) : (
            <>
              <input
                className="adm-inp"
                type="date"
                placeholder="Filter date..."
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                style={{ minWidth: 150 }}
              />
              <select className="adm-inp" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="Active">Active Today</option>
                <option value="On Break">On Break</option>
                <option value="notlogin">Not Logged In</option>
                <option value="leaves">On Leave</option>
                <option value="Full Day">Full Day</option>
                <option value="Incomplete Workday(IWD)">Incomplete Workday(IWD)</option>
                <option value="Half Day">Half Day</option>
                <option value="messages">Unread Messages</option>
              </select>
            </>
          )}

          <select className="adm-inp" value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ minWidth: 150 }}>
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {activeTab !== "weekly" && (
            <div style={{ fontSize: 12, color: T.muted, marginLeft: 4 }}>
              {loading ? "Syncing..." : `${filtered.length} records`}
            </div>
          )}
        </div>

        {/* Weekly Report Table */}
        {activeTab === "weekly" && (
          <div className="premium-card">
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, color: T.ink }}>Performance Summary Report</div>
              <div style={{ fontSize: 11, color: T.muted, background: T.surface, padding: "4px 10px", borderRadius: 8 }}>Range: {fmtDate(new Date(weeklyFrom))} — {fmtDate(new Date(weeklyTo))}</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {["Employee", "Dept", "Days Present", "Total Work", "Total Break", "Avg Hours/Day", "Activity Log"].map(h => (
                      <th key={h} style={{ padding: "14px 24px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeklyReportData.filter(emp => !search || emp.name.toLowerCase().includes(search.toLowerCase()) || emp.id.toLowerCase().includes(search.toLowerCase())).map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}`, transition: "background 0.2s" }} className="adm-row">
                      <td style={{ padding: "16px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Avatar name={r.name} size={32} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: T.muted }}>{r.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "16px 24px", fontSize: 13, color: T.ink2 }}>{r.dept}</td>
                      <td style={{ padding: "16px 24px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.daysPresent} days</div>
                      </td>
                      <td style={{ padding: "16px 24px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.green }}>{r.totalWork}</div>
                      </td>
                      <td style={{ padding: "16px 24px", fontSize: 13, color: T.red }}>{r.totalBreak}</td>
                      <td style={{ padding: "16px 24px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>{r.avgWork}</div>
                      </td>
                      <td style={{ padding: "16px 24px" }}>
                        <div style={{ 
                          fontSize: 11, color: T.ink2, maxWidth: 250, 
                          maxHeight: 60, overflowY: "auto", whiteSpace: "pre-wrap",
                          lineHeight: 1.4, padding: "4px 8px", background: T.surface, borderRadius: 8
                        }}>
                          {r.tasks || "No activity logged."}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {weeklyReportData.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ padding: "40px", textAlign: "center", color: T.muted }}>No data available for the current week.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attendance Records Table */}
        {activeTab === "attendance" && (
          <div className="premium-card">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {[
                      { h: "Date", w: 100, k: "date" },
                      { h: "ID", w: 80, k: "id" },
                      { h: "Employee", w: 200, k: "name" },
                      { h: "Dept", w: 120, k: "dept" },
                      { h: "In", w: 80, k: "logint" },
                      { h: "Out", w: 80, k: "logoutt" },
                      { h: "Work Hrs", w: 100, k: "hours" },
                      { h: "Break Time", w: 80, k: "break_time" },
                      { h: "Over Time", w: 100, k: "extrahours" },
                      { h: "Status", w: 120, k: "status" },
                      { h: "Tasks", w: 220 },
                      { h: "Actions", w: 100, align: "right" }
                    ].map(col => (
                      <th key={col.h}
                        onClick={() => col.k && setSortConfig({ key: col.k, dir: sortConfig.key === col.k && sortConfig.dir === "asc" ? "desc" : "asc" })}
                        style={{ ...colStyle, width: col.w, textAlign: col.align || "left", cursor: col.k ? "pointer" : "default" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {col.h}
                          {col.k && sortConfig.key === col.k && (
                            <span style={{ fontSize: 10 }}>{sortConfig.dir === "asc" ? "↑" : "↓"}</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={i} className="adm-row">

                      <td style={cellStyle}>{r.date}</td>
                      <td style={cellStyle}>{r.id || r.employeeid}</td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                          onClick={() => setAssignTaskTo({ id: r.id || r.employeeid, name: r.name || r.employeename })}>
                          <Avatar name={r.name || r.employeename || "?"} size={32} />
                          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ fontWeight: 700, color: T.accent, fontSize: 13 }}>{r.name || r.employeename}</span>
                            <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>Assign Task +</span>
                          </div>
                        </div>
                      </td>
                      <td style={cellStyle}>{r.dept || r.department}</td>
                      <td style={{ ...cellStyle, color: T.green, fontWeight: 600 }}>{r.logint || r.intime}</td>
                      <td style={{ ...cellStyle, color: T.red, fontWeight: 600 }}>{r.logoutt || r.outtime}</td>
                      <td style={{ ...cellStyle, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {r.live_hours}
                      </td>
                      <td style={{ ...cellStyle, color: T.amber, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {r.live_break_time}
                      </td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: r.live_overtime && r.live_overtime !== "—" ? T.amber : T.faint, fontVariantNumeric: "tabular-nums" }}>
                        {r.live_overtime}
                      </td>
                      <td style={cellStyle}>
                        <Badge status={r.live_status || "Incomplete"} />
                      </td>
                      <td style={{ ...cellStyle, color: T.ink2, maxWidth: 220, fontSize: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {/* Manual Logs */}
                          {(r.tasks || r.workstatus) && (
                            <div style={{ padding: "4px 8px", background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 11, maxHeight: 60, overflowY: "auto" }} title={r.tasks || r.workstatus}>
                              <b style={{ fontSize: 9, color: T.muted, display: "block", textTransform: "uppercase" }}>Manual Log:</b>
                              {r.tasks || r.workstatus}
                            </div>
                          )}


                          {/* Assigned Tasks from Task Feed */}
                          {taskFeed.filter(t => (t.employee_id === (r.id || r.employeeid)) &&
                            fmtDate(new Date(t.assigned_at)) === r.date).map(t => (
                              <div key={t.id} style={{ padding: "4px 8px", background: "white", borderRadius: 6, border: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 600, fontSize: 11, color: T.accent }}>{t.title}</span>
                                <Badge status={t.status} />
                              </div>
                            ))}

                          {!(r.tasks || r.workstatus) && taskFeed.filter(t => (t.employee_id === (r.id || r.employeeid)) && fmtDate(new Date(t.assigned_at)) === r.date).length === 0 && (
                            <span style={{ color: T.faint }}>—</span>
                          )}
                        </div>
                      </td>

                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <button
                          onClick={() => setSelectedRecord(r)}
                          style={{
                            padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${T.border}`,
                            background: "white", color: T.ink2, fontSize: 12, fontWeight: 700,
                            cursor: "pointer", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 6
                          }}
                        >
                          <Icon d={icons.eye} size={13} color={T.accent} />
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Live Task Feed */}
        {activeTab === "tasks" && (
          <div className="premium-card">
            <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>Individual Tasks Tracking</div>
                <div style={{ fontSize: 12, color: T.muted }}>Real-time activity from your team</div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {["Assigned At", "Employee", "Task Title", "Status", "Tracking"].map(h => (
                      <th key={h} style={colStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...taskFeed].reverse().map((t, i) => (
                    <tr key={i} className="adm-row">
                      <td style={cellStyle}>{new Date(t.assigned_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={allEmployees.find(e => e.id === t.employee_id)?.name || "?"} size={28} />
                          <div style={{ fontWeight: 600 }}>{allEmployees.find(e => e.id === t.employee_id)?.name || t.employee_id}</div>
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontWeight: 700, color: T.ink }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: T.muted, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</div>
                      </td>
                      <td style={cellStyle}><Badge status={t.status} /></td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 10, display: "flex", gap: 6 }}>
                            <span style={{ color: T.muted }}>Viewed:</span>
                            <span style={{ fontWeight: 600 }}>{t.viewed_at ? new Date(t.viewed_at).toLocaleTimeString() : "—"}</span>
                          </div>
                          <div style={{ fontSize: 10, display: "flex", gap: 6 }}>
                            <span style={{ color: T.muted }}>Done:</span>
                            <span style={{ fontWeight: 600, color: T.green }}>{t.completed_at ? new Date(t.completed_at).toLocaleTimeString() : "—"}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Leave Requests Tab */}
        {activeTab === "leaves" && (
          <div className="premium-card">
            <div style={{ padding: 24, borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: T.ink }}>Employee Leave Requests</div>
                <div style={{ fontSize: 12, color: T.muted }}>Manage and approve employee leave applications</div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {["Applied On", "Employee", "Duration", "Reason", "Status", "Actions"].map(h => (
                      <th key={h} style={colStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: 40, textAlign: "center", color: T.muted }}>No leave requests found</td></tr>
                  ) : (
                    [...leaveRequests].reverse().map((l, i) => (
                      <tr key={i} className="adm-row">
                        <td style={cellStyle}>{new Date(l.applied_at).toLocaleDateString()}</td>
                        <td style={cellStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar name={l.employee_name} size={28} />
                            <div>
                              <div style={{ fontWeight: 700 }}>{l.employee_name}</div>
                              <div style={{ fontSize: 10, color: T.muted }}>
                                {l.employee_id} · <span style={{
                                  color: (profiles.find(p => String(p.employee_id).toLowerCase() === String(l.employee_id).toLowerCase())?.total_leaves <= 0) ? T.red : T.purple,
                                  fontWeight: 800
                                }}>
                                  {profiles.find(p => String(p.employee_id).toLowerCase() === String(l.employee_id).toLowerCase())?.total_leaves ?? "—"} left
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 700 }}>{l.start_date}</div>
                          <div style={{ fontSize: 10, color: T.muted }}>to {l.end_date}</div>
                        </td>
                        <td style={{ ...cellStyle, maxWidth: 250, whiteSpace: "normal", fontSize: 12, lineHeight: 1.4 }}>{l.reason}</td>
                        <td style={cellStyle}><Badge status={l.status} /></td>
                        <td style={cellStyle}>
                          {l.status === "Pending" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
                              <input className="adm-inp" placeholder="Add comment..." style={{ fontSize: 11, padding: "6px 10px" }}
                                value={adminComment} onChange={e => setAdminComment(e.target.value)} />
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => handleApproveLeave(l.id, "Approved")} style={{ flex: 1, padding: "8px", background: T.green, color: "white", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = 0.8} onMouseOut={e => e.currentTarget.style.opacity = 1}>Approve</button>
                                <button onClick={() => handleApproveLeave(l.id, "Rejected")} style={{ flex: 1, padding: "8px", background: T.red, color: "white", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = 0.8} onMouseOut={e => e.currentTarget.style.opacity = 1}>Reject</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: T.muted }}>
                              <div>Reviewed on {new Date(l.reviewed_at).toLocaleDateString()}</div>
                              {l.admin_comment && <div style={{ marginTop: 4, color: T.ink, fontStyle: "italic" }}>"{l.admin_comment}"</div>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === "groups" && (
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
            {/* Left: Group List */}
            <div style={{ background: T.white, borderRadius: 20, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 14 }}>Organization Groups</div>
                <button onClick={() => {
                  const name = prompt("Enter new group name:");
                  if (name) fetch(GROUPS_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, description: "New group" })
                  }).then(fetchAttendance);
                }} style={{ width: "100%", padding: 10, background: T.accent, color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                  + Create New Group
                </button>
              </div>
              <div style={{ padding: 10 }}>
                {groups.length === 0 && <div style={{ padding: 20, textAlign: "center", color: T.faint, fontSize: 12 }}>No groups created.</div>}
                 {groups.map(g => {
                   const gId = `group_${g.id}`;
                   const unread = groupUnreadMapAdmin[gId] || 0;
                   return (
                    <div key={g.id} onClick={() => setSelGroup(g)} style={{
                      padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                      background: selGroup?.id === g.id ? T.purpleBg : "none",
                      border: selGroup?.id === g.id ? `1px solid ${T.purple}30` : "none",
                      marginBottom: 4, position: "relative"
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: selGroup?.id === g.id ? T.purple : T.ink }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>{g.member_usernames?.length || 0} Members</div>
                      {unread > 0 && (
                        <span style={{ position: "absolute", top: 12, right: 12, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 800 }}>{unread}</span>
                      )}
                    </div>
                   );
                 })}
              </div>
            </div>

            {/* Right: Group Detail */}
            {selGroup ? (
              <div style={{ background: T.white, borderRadius: 20, border: `1px solid ${T.border}`, padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800 }}>{selGroup.name}</h2>
                    <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>{selGroup.description}</p>
                  </div>
                  <button onClick={() => {
                    if (confirm(`Delete group "${selGroup.name}"?`)) {
                      fetch(`${GROUPS_URL}${selGroup.id}/`, { method: "DELETE" }).then(() => { setSelGroup(null); fetchAttendance(); });
                    }
                  }} style={{ padding: "8px 14px", background: "none", color: T.red, border: `1.5px solid ${T.red}30`, borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete Group</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  {/* Left: Members & Search */}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Manage Members</div>
                    <input className="adm-inp" placeholder="Search employees to add..." 
                      value={groupSearch} onChange={e => setGroupSearch(e.target.value)}
                      style={{ width: "100%", marginBottom: 16, boxSizing: "border-box" }} />
                    
                    <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 12, padding: 8 }}>
                      {allEmployees.filter(e => !groupSearch || e.name.toLowerCase().includes(groupSearch.toLowerCase()) || e.id.toLowerCase().includes(groupSearch.toLowerCase())).map(e => {
                        const isMember = selGroup.member_usernames?.includes(e.id);
                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: isMember ? T.surface : "none" }}>
                            <div 
                              style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "color 0.2s" }}
                              onClick={() => setChatWith({ id: e.id, name: e.name })}
                              onMouseEnter={(ev) => ev.currentTarget.style.color = T.accent}
                              onMouseLeave={(ev) => ev.currentTarget.style.color = T.ink}
                            >
                              {e.name} <span style={{ fontSize: 10, opacity: 0.6 }}>({e.id})</span>
                            </div>
                            <button onClick={async () => {
                              try {
                                const resp = await fetch(`${GROUPS_URL}${selGroup.id}/membership/`, {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: isMember ? "remove" : "add", employee_id: e.id })
                                });
                                if (resp.ok) {
                                  fetchAttendance();
                                } else {
                                  const err = await resp.json();
                                  alert(`Error: ${err.error || "Failed"}`);
                                }
                              } catch(err) { alert("Network error"); }
                            }} style={{ 
                              color: isMember ? T.red : T.accent, 
                              background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 
                            }}>
                              {isMember ? "Remove" : "+ Add"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Group Chat */}
                  <div style={{ height: 450 }}>
                    <ChatPanel
                      currentUser={{ id: "admin", name: "Admin" }}
                      targetUser={null}
                      groupId={`group_${selGroup.id}`}
                      groupName={selGroup.name}
                      onUserClick={(id, name) => setChatWith({ id, name: name || id })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: T.white, borderRadius: 20, border: `1px solid ${T.border}`, color: T.faint }}>
                Select a group to manage members
              </div>
            )}
          </div>
        )}



        {/* Employee List Tab */}
        {activeTab === "employees" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.white, padding: "16px 24px", borderRadius: 16, border: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Employee Directory</div>
                <div style={{ fontSize: 12, color: T.muted }}>{allEmployees.length} registered employees</div>
              </div>
              <button onClick={async () => {
                if (confirm("Sync all employee accounts from the master sheet?")) {
                  const resp = await fetch(SYNC_USERS_URL, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ users: allEmployees })
                  });
                  if (resp.ok) {
                    alert("Sync successful!");
                    fetchAttendance();
                  }
                }
              }} style={{ padding: "10px 20px", background: T.surface, color: T.accent, border: `1.5px solid ${T.accent}40`, borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                🔄 Sync All Accounts
              </button>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {allEmployees
              .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase()))
              .sort((a, b) => {
                // Priority 1: Unread messages
                const unreadA = unreadMap[a.id] || 0;
                const unreadB = unreadMap[b.id] || 0;
                if (unreadB !== unreadA) return unreadB - unreadA;
                
                // Priority 2: Latest message timestamp (WhatsApp style)
                const timeA = chatSummaries[a.id]?.timestamp ? new Date(chatSummaries[a.id].timestamp).getTime() : 0;
                const timeB = chatSummaries[b.id]?.timestamp ? new Date(chatSummaries[b.id].timestamp).getTime() : 0;
                if (timeB !== timeA) return timeB - timeA;
                
                // Priority 3: Online status
                const activeA = records.find(r => r.id === a.id)?.last_active ? new Date(records.find(r => r.id === a.id).last_active).getTime() : 0;
                const activeB = records.find(r => r.id === b.id)?.last_active ? new Date(records.find(r => r.id === b.id).last_active).getTime() : 0;
                return activeB - activeA;
              })
              .map(e => {
                const latestRec = [...records].filter(r => r.id === e.id).sort((a,b) => {
                   const timeA = a.last_active ? new Date(a.last_active).getTime() : 0;
                   const timeB = b.last_active ? new Date(b.last_active).getTime() : 0;
                   return timeB - timeA;
                })[0];
                 const lastActiveRaw = latestRec?.last_active;
                 const lastActive = lastActiveRaw ? new Date(lastActiveRaw) : null;
                 const isOnline = lastActive && !isNaN(lastActive.getTime()) && (new Date() - lastActive < 120000); 
                 const unread = unreadMap[String(e.id).toLowerCase()] || 0;
                return (
              <div key={e.id} className="premium-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, transition: "transform 0.2s", borderTop: isOnline ? `4px solid ${T.green}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ position: "relative" }}>
                    <Avatar name={e.name} size={56} />
                    <div style={{ position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: isOnline ? T.green : T.faint, border: "3px solid white" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: T.ink, fontSize: 16 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{isOnline ? "Online Now" : (lastActive && !isNaN(lastActive.getTime()) ? `Last seen: ${lastActive.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : "Offline")}</div>
                    <div style={{ fontSize: 10, color: T.faint, fontWeight: 600 }}>{e.role} · {e.id}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: T.purple }}>
                      {profiles.find(p => String(p.employee_id).toLowerCase() === String(e.id).toLowerCase())?.total_leaves ?? 16}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Leaves Left</div>
                  </div>
                </div>


                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20, display: "flex", gap: 10 }}>
                  <button onClick={() => setAssignTaskTo(e)} style={{
                    flex: 1, padding: "12px", borderRadius: 14, border: "none",
                    background: T.surface, color: T.ink, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s"
                  }} onMouseOver={btn => { btn.currentTarget.style.background = T.accent; btn.currentTarget.style.color = "white"; }}
                    onMouseOut={btn => { btn.currentTarget.style.background = T.surface; btn.currentTarget.style.color = T.ink; }}>
                    <Icon d={icons.tasks} size={16} />
                    Assign Task
                  </button>
                  <button onClick={() => setChatWith(e)} style={{
                    flex: 1, padding: "12px", borderRadius: 14, border: "none",
                    background: T.purpleBg, color: T.purple, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s",
                    position: "relative"
                  }} onMouseOver={btn => { btn.currentTarget.style.background = T.purple; btn.currentTarget.style.color = "white"; }}
                    onMouseOut={btn => { btn.currentTarget.style.background = T.purpleBg; btn.currentTarget.style.color = T.purple; }}>
                    <Icon d={icons.message} size={16} />
                    Chat
                    {unread > 0 && (
                      <span style={{ position: "absolute", top: -6, right: -6, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 800 }}>{unread}</span>
                    )}
                  </button>
                </div>
              </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FORGOT PASSWORD PAGE – Premium Design
══════════════════════════════════════════════════════════════ */
function ForgotPasswordPage({ onBack, onSendLink }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [focused, setFocused] = useState(false);

  const submit = async () => {
    if (!email) return;
    setLoading(true);
    const result = await onSendLink(email);
    setLoading(false);
    if (result.success) {
      setMsg({ text: "Reset link sent! Check your inbox (and spam folder).", type: "success" });
    } else {
      setMsg({ text: result.error || "Failed to send link. Please try again later.", type: "error" });
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
      background: "linear-gradient(135deg, #f0f4fa 0%, #e8f0fe 100%)"
    }}>
      <style>{LOGIN_STYLES}</style>

      {/* Left decorative panel */}
      <div style={{
        flex: "0 0 440px",
        background: "linear-gradient(160deg, #0b1f35 0%, #0d2b4e 50%, #0f3460 100%)",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "52px 44px", position: "relative", overflow: "hidden"
      }}>
        {/* Animated orbs */}
        {[
          { w: 280, h: 280, top: -80, left: -80, bg: "rgba(21,96,189,0.2)", anim: "float1 8s ease-in-out infinite" },
          { w: 200, h: 200, bottom: -50, right: -50, bg: "rgba(14,165,233,0.15)", anim: "float2 10s ease-in-out infinite" },
          { w: 140, h: 140, top: "40%", right: -30, bg: "rgba(109,40,217,0.1)", anim: "float3 7s ease-in-out infinite" },
        ].map((o, i) => (
          <div key={i} style={{
            position: "absolute", borderRadius: "50%", background: o.bg,
            width: o.w, height: o.h, top: o.top, bottom: o.bottom, left: o.left, right: o.right,
            animation: o.anim
          }} />
        ))}
        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div style={{ position: "relative", zIndex: 1, animation: "fadeInLeft 0.7s ease both" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 56 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 14, background: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
            }}>
              <img src={logo} alt="Brolly Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 16 }}>Brolly Software Solutions</div>
              <div style={{ color: "rgba(168,188,212,0.8)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>ATTENDANCE MANAGEMENT</div>
            </div>
          </div>

          {/* Icon + heading */}
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: "rgba(21,96,189,0.25)", border: "1.5px solid rgba(21,96,189,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28
          }}>
            <Icon d={icons.lock} size={28} color="#38bdf8" />
          </div>

          <h2 style={{ color: "white", fontSize: 30, fontWeight: 800, lineHeight: 1.2, margin: "0 0 16px", letterSpacing: -0.5 }}>
            Forgot your<br /><span style={{ color: "#38bdf8" }}>password?</span>
          </h2>
          <p style={{ color: "rgba(168,188,212,0.85)", fontSize: 14, lineHeight: 1.75, margin: 0 }}>
            No worries! Enter your registered email or username and we'll send you a secure reset link instantly.
          </p>

          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { icon: icons.check, text: "Secure token-based reset link" },
              { icon: icons.clock, text: "Link expires in 1 hour" },
              { icon: icons.lock, text: "Password encrypted on save" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, animation: `pillSlide 0.4s ease ${i * 0.1 + 0.1}s both` }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>
                  <Icon d={f.icon} size={14} color="#38bdf8" />
                </div>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13.5, fontWeight: 500 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420, animation: "fadeInUp 0.6s cubic-bezier(0.4,0,0.2,1) both" }}>

          <div style={{
            background: "white", borderRadius: 24,
            border: "1px solid rgba(220,232,244,0.8)",
            padding: "44px 40px",
            boxShadow: "0 20px 60px rgba(11,31,53,0.1), 0 4px 20px rgba(11,31,53,0.06)"
          }}>

            {/* Header */}
            <div style={{ marginBottom: 32 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
                border: "2px solid #bfdbfe",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 22, position: "relative"
              }}>
                <Icon d={icons.lock} size={24} color="#1560bd" />
                <div style={{
                  position: "absolute", inset: -4, borderRadius: 20,
                  border: "2px solid rgba(21,96,189,0.25)",
                  animation: "pulse-ring 2s ease-out infinite"
                }} />
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#0b1f35", letterSpacing: -0.5 }}>
                Reset Password 🔑
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "#6b82a0", lineHeight: 1.6 }}>
                Enter your <strong style={{ color: "#1560bd" }}>email or username</strong> and we'll send a reset link to your inbox.
              </p>
            </div>

            {/* Success / Error message */}
            {msg && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "14px 16px", borderRadius: 12, marginBottom: 24,
                background: msg.type === "success" ? "#f0fdf4" : "#fff1f1",
                border: `1.5px solid ${msg.type === "success" ? "#86efac" : "#fca5a5"}`,
                animation: "fadeInUp 0.3s ease both"
              }}>
                <Icon d={msg.type === "success" ? icons.check : icons.info} size={16}
                  color={msg.type === "success" ? "#16a34a" : "#d93b3b"} />
                <span style={{ fontSize: 13.5, color: msg.type === "success" ? "#15803d" : "#d93b3b", lineHeight: 1.5, fontWeight: 500 }}>
                  {msg.text}
                </span>
              </div>
            )}

            {/* Input */}
            <div style={{ marginBottom: 24, animation: "fadeInUp 0.5s ease 0.1s both" }}>
              <label style={{
                display: "block", fontSize: 11.5, fontWeight: 700,
                color: focused ? "#1560bd" : "#2c4a6e",
                marginBottom: 8, letterSpacing: 0.8, textTransform: "uppercase",
                transition: "color 0.2s"
              }}>Email or Username</label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
                  <Icon d={icons.user} size={16} color={focused ? "#1560bd" : "#a8bcd4"} />
                </div>
                <input
                  className="login-inp"
                  type="text"
                  placeholder="your.username or email@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  style={{ paddingLeft: 44 }}
                />
              </div>
            </div>

            {/* Send Button */}
            <div style={{ animation: "fadeInUp 0.5s ease 0.15s both" }}>
              <button className="login-btn" onClick={submit} disabled={loading || !!msg?.type === "success"}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <span style={{
                      width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.4)",
                      borderTopColor: "white", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.8s linear infinite"
                    }} />
                    Sending Reset Link...
                  </span>
                ) : "Send Reset Link"}
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 0" }}>
              <div style={{ flex: 1, height: 1, background: "#e2ebf6" }} />
              <span style={{ fontSize: 11, color: "#a8bcd4", fontWeight: 500 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#e2ebf6" }} />
            </div>

            {/* Back button */}
            <button onClick={onBack} style={{
              width: "100%", background: "none",
              border: "2px solid #e2ebf6", borderRadius: 12,
              color: "#6b82a0", fontSize: 14, marginTop: 16,
              cursor: "pointer", fontWeight: 600, padding: "11px",
              fontFamily: "'Inter',sans-serif",
              transition: "all 0.2s"
            }}
              onMouseOver={e => { e.target.style.borderColor = "#1560bd"; e.target.style.color = "#1560bd"; }}
              onMouseOut={e => { e.target.style.borderColor = "#e2ebf6"; e.target.style.color = "#6b82a0"; }}
            >
              ← Back to Sign In
            </button>
          </div>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#6b82a0" }}>
            Didn't get the email? Check your spam folder.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   RESET PASSWORD PAGE – Premium Design
══════════════════════════════════════════════════════════════ */
function ResetPasswordPage({ token, onReset }) {
  const [p, setP] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pFocus, setPFocus] = useState(false);
  const [p2Focus, setP2Focus] = useState(false);
  const [showP, setShowP] = useState(false);
  const [showP2, setShowP2] = useState(false);

  const strength = p.length === 0 ? 0 : p.length < 6 ? 1 : p.length < 10 ? 2 : 3;
  const strengthLabel = ["", "Weak", "Good", "Strong"];
  const strengthColor = ["", "#f87171", "#fb923c", "#22c55e"];

  const submit = async () => {
    if (p !== p2) { setError("Passwords do not match"); return; }
    if (p.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    const ok = await onReset(token, p);
    setLoading(false);
    if (ok) { setSuccess(true); }
    else { setError("Failed to reset. The link may have expired. Please request a new one."); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
      background: "linear-gradient(135deg, #f0f4fa 0%, #e8f0fe 100%)"
    }}>
      <style>{LOGIN_STYLES}</style>

      {/* Left decorative panel */}
      <div style={{
        flex: "0 0 440px",
        background: "linear-gradient(160deg, #0b1f35 0%, #0d2b4e 50%, #0f3460 100%)",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "52px 44px", position: "relative", overflow: "hidden"
      }}>
        {[
          { w: 280, h: 280, top: -80, left: -80, bg: "rgba(21,96,189,0.2)", anim: "float1 8s ease-in-out infinite" },
          { w: 200, h: 200, bottom: -50, right: -50, bg: "rgba(14,165,233,0.15)", anim: "float2 10s ease-in-out infinite" },
          { w: 140, h: 140, top: "40%", right: -30, bg: "rgba(34,197,94,0.08)", anim: "float3 7s ease-in-out infinite" },
        ].map((o, i) => (
          <div key={i} style={{
            position: "absolute", borderRadius: "50%", background: o.bg,
            width: o.w, height: o.h, top: o.top, bottom: o.bottom, left: o.left, right: o.right,
            animation: o.anim
          }} />
        ))}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div style={{ position: "relative", zIndex: 1, animation: "fadeInLeft 0.7s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 56 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 14, background: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
            }}>
              <img src={logo} alt="Brolly Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 16 }}>Brolly Software Solutions</div>
              <div style={{ color: "rgba(168,188,212,0.8)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>ATTENDANCE MANAGEMENT</div>
            </div>
          </div>

          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: "rgba(34,197,94,0.2)", border: "1.5px solid rgba(34,197,94,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28
          }}>
            <Icon d={icons.check} size={30} color="#4ade80" />
          </div>

          <h2 style={{ color: "white", fontSize: 30, fontWeight: 800, lineHeight: 1.2, margin: "0 0 16px", letterSpacing: -0.5 }}>
            Set your<br /><span style={{ color: "#4ade80" }}>new password</span>
          </h2>
          <p style={{ color: "rgba(168,188,212,0.85)", fontSize: 14, lineHeight: 1.75, margin: 0 }}>
            Choose a strong password that you haven't used before to keep your account secure.
          </p>

          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { icon: icons.check, text: "Minimum 6 characters required" },
              { icon: icons.lock, text: "Password is encrypted on save" },
              { icon: icons.save, text: "Sheet is updated automatically" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, animation: `pillSlide 0.4s ease ${i * 0.1 + 0.1}s both` }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>
                  <Icon d={f.icon} size={14} color="#4ade80" />
                </div>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13.5, fontWeight: 500 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420, animation: "fadeInUp 0.6s cubic-bezier(0.4,0,0.2,1) both" }}>

          <div style={{
            background: "white", borderRadius: 24,
            border: "1px solid rgba(220,232,244,0.8)",
            padding: "44px 40px",
            boxShadow: "0 20px 60px rgba(11,31,53,0.1), 0 4px 20px rgba(11,31,53,0.06)"
          }}>

            {success ? (
              /* Success state */
              <div style={{ textAlign: "center", animation: "fadeInUp 0.5s ease both" }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
                  border: "3px solid #86efac",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 24px"
                }}>
                  <Icon d={icons.check} size={34} color="#16a34a" stroke={2.5} />
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0b1f35", margin: "0 0 10px" }}>Password Updated!</h2>
                <p style={{ fontSize: 14, color: "#6b82a0", lineHeight: 1.6, marginBottom: 32 }}>
                  Your password has been reset successfully and your Excel sheet has been updated. You can now sign in with your new password.
                </p>
                <button className="login-btn" onClick={() => window.location.href = window.location.origin + window.location.pathname}>
                  Go to Sign In
                </button>
              </div>
            ) : (
              /* Form state */
              <>
                <div style={{ marginBottom: 32 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
                    border: "2px solid #86efac",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 22, position: "relative"
                  }}>
                    <Icon d={icons.lock} size={24} color="#16a34a" />
                    <div style={{
                      position: "absolute", inset: -4, borderRadius: 20,
                      border: "2px solid rgba(22,163,74,0.2)",
                      animation: "pulse-ring 2s ease-out infinite"
                    }} />
                  </div>
                  <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#0b1f35", letterSpacing: -0.5 }}>
                    New Password 🔒
                  </h2>
                  <p style={{ margin: 0, fontSize: 14, color: "#6b82a0", lineHeight: 1.5 }}>
                    Choose a <strong style={{ color: "#16a34a" }}>strong password</strong> for your account.
                  </p>
                </div>

                {error && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                    borderRadius: 12, background: "#fff1f1", border: "1.5px solid #fca5a5",
                    marginBottom: 20, fontSize: 13, color: "#d93b3b", animation: "fadeInUp 0.3s ease both"
                  }}>
                    <Icon d={icons.info} size={16} color="#d93b3b" />
                    <span>{error}</span>
                  </div>
                )}

                {/* New Password */}
                <div style={{ marginBottom: 16, animation: "fadeInUp 0.5s ease 0.1s both" }}>
                  <label style={{
                    display: "block", fontSize: 11.5, fontWeight: 700,
                    color: pFocus ? "#16a34a" : "#2c4a6e",
                    marginBottom: 8, letterSpacing: 0.8, textTransform: "uppercase", transition: "color 0.2s"
                  }}>New Password</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
                      <Icon d={icons.lock} size={16} color={pFocus ? "#16a34a" : "#a8bcd4"} />
                    </div>
                    <input className="login-inp" type={showP ? "text" : "password"}
                      placeholder="Enter new password"
                      value={p} onChange={e => setP(e.target.value)}
                      onFocus={() => setPFocus(true)} onBlur={() => setPFocus(false)}
                      style={{
                        paddingLeft: 44, paddingRight: 48,
                        borderColor: p.length > 0 ? strengthColor[strength] : undefined
                      }}
                    />
                    <button className="eye-btn" onClick={() => setShowP(v => !v)}>
                      <Icon d={showP ? icons.eyeOff : icons.eye} size={16} color="currentColor" />
                    </button>
                  </div>
                  {/* Strength bar */}
                  {p.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        {[1, 2, 3].map(i => (
                          <div key={i} style={{
                            flex: 1, height: 3, borderRadius: 99,
                            background: strength >= i ? strengthColor[strength] : "#e2ebf6",
                            transition: "background 0.3s"
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor[strength] }}>
                        {strengthLabel[strength]} password
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div style={{ marginBottom: 28, animation: "fadeInUp 0.5s ease 0.15s both" }}>
                  <label style={{
                    display: "block", fontSize: 11.5, fontWeight: 700,
                    color: p2Focus ? "#16a34a" : "#2c4a6e",
                    marginBottom: 8, letterSpacing: 0.8, textTransform: "uppercase", transition: "color 0.2s"
                  }}>Confirm Password</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
                      <Icon d={icons.lock} size={16} color={p2Focus ? "#16a34a" : "#a8bcd4"} />
                    </div>
                    <input className="login-inp" type={showP2 ? "text" : "password"}
                      placeholder="Repeat your new password"
                      value={p2} onChange={e => setP2(e.target.value)}
                      onFocus={() => setP2Focus(true)} onBlur={() => setP2Focus(false)}
                      onKeyDown={e => e.key === "Enter" && submit()}
                      style={{
                        paddingLeft: 44, paddingRight: 48,
                        borderColor: p2.length > 0 ? (p === p2 ? "#22c55e" : "#f87171") : undefined
                      }}
                    />
                    <button className="eye-btn" onClick={() => setShowP2(v => !v)}>
                      <Icon d={showP2 ? icons.eyeOff : icons.eye} size={16} color="currentColor" />
                    </button>
                  </div>
                  {p2.length > 0 && p !== p2 && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#f87171", fontWeight: 500 }}>
                      Passwords don't match
                    </p>
                  )}
                </div>

                {/* Update Button */}
                <div style={{ animation: "fadeInUp 0.5s ease 0.2s both" }}>
                  <button
                    className="login-btn"
                    onClick={submit}
                    disabled={loading}
                    style={{
                      background: loading ? "#94a3b8" :
                        "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                      boxShadow: "0 4px 15px rgba(22,163,74,0.4)"
                    }}
                  >
                    {loading ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <span style={{
                          width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.4)",
                          borderTopColor: "white", borderRadius: "50%",
                          display: "inline-block", animation: "spin 0.8s linear infinite"
                        }} />
                        Updating Password...
                      </span>
                    ) : "Update Password"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════ */
export default function App() {
  const [view, setView] = useState("login"); // login, dashboard, admin, forgot, reset
  const [resetToken, setResetToken] = useState(null);

  // ── Admin credentials ──
  const ADMIN_USER = "brolly@admin";
  const ADMIN_PASS = "Brolly@pass";

  // ── Restore state ──
  const [employee, setEmployee] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [creds, setCreds] = useState(FALLBACK_CREDS);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("wt_user") || "null");
    if (saved) {
      if (saved.role === "admin") setIsAdmin(true);
      else setEmployee(saved.data);
    }

    // Handle reset password URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || window.location.pathname.split("/reset-password/")[1];
    if (token) {
      setResetToken(token);
      setView("reset");
    }

    // Global Audio Priming
    const prime = () => {
      if (!masterAudioCtx) {
        masterAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      masterAudioCtx.resume().then(() => {
        playNotifySound(); // Success chime
        console.log("Audio System Unlocked");
      });
      window.removeEventListener('click', prime);
    };
    window.addEventListener('click', prime);
    return () => window.removeEventListener('click', prime);
  }, []);

  useEffect(() => {
    if (!SCRIPT_URL || SCRIPT_URL.includes("YOUR_SCRIPT_URL_HERE")) return;
    setIsSyncing(true);
    fetch(SCRIPT_URL)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const normalized = data.map(row => {
            const obj = {};
            Object.keys(row).forEach(k => { obj[k.toLowerCase()] = String(row[k]).trim(); });
            return obj;
          });
          setCreds(normalized);
        }
        setIsSyncing(false);
      })
      .catch(err => {
        console.error("Cloud sync failed:", err);
        setIsSyncing(false);
      });
  }, []);

  const handleLogin = (u, p) => {
    const userInp = u.trim().toLowerCase();
    const passInp = p.trim();

    if (userInp === ADMIN_USER && passInp === ADMIN_PASS) {
      setIsAdmin(true);
      setEmployee(null);
      setError("");
      localStorage.setItem("wt_user", JSON.stringify({ role: "admin" }));
      return;
    }

    // Support login by Username OR Email
    const found = creds.find(c => {
      const usernameMatch = (c.username || c.UserName || "").trim().toLowerCase() === userInp;
      const emailMatch = (c.email || c.Email || "").trim().toLowerCase() === userInp;
      const passwordMatch = (c.password || c.Password || "").trim() === passInp;
      return (usernameMatch || emailMatch) && passwordMatch;
    });
    if (found) {
      setEmployee(found);
      setIsAdmin(false);
      setError("");
      localStorage.setItem("wt_user", JSON.stringify({ role: "employee", data: found }));
    } else {
      setError("Invalid username or password.");
    }
  };

  const handleSignOut = () => {
    setEmployee(null); setIsAdmin(false); setError("");
    localStorage.removeItem("wt_user");
    localStorage.removeItem("wt_session");
  };

  const sendResetLink = async (email) => {
    try {
      const resp = await fetch(API_BASE + "forgot-password/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (resp.ok) return { success: true };
      const data = await resp.json();
      return { success: false, error: data.error || "Server error" };
    } catch (e) {
      return { success: false, error: "Network error. Please check your connection." };
    }
  };

  const resetPassword = async (token, password) => {
    try {
      const resp = await fetch(API_BASE + "reset-password/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      if (resp.ok) {
        alert("Password updated! Please log in with your new password.");
        window.location.href = window.location.origin + window.location.pathname; // Clean URL
        return true;
      }
      return false;
    } catch (e) { return false; }
  };

  const [toast, setToast] = useState({ show: false, msg: "", type: "info" });
  const showToast = (msg, type = "info") => {
    playNotifySound();
    setToast({ show: true, msg, type });
    setTimeout(() => setToast(v => ({ ...v, show: false })), 5000);
  };

  // Bind globally so internal dashboard functions can call it
  window.showToast = showToast;

  // ── Version Check (Auto-Refresh on Deploy) ──
  const currentVersion = useRef(null);
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const resp = await fetch(HEALTH_CHECK_URL);
        if (resp.ok) {
          const data = await resp.json();
          const newVersion = data.version;
          if (currentVersion.current && currentVersion.current !== newVersion) {
            console.log(`New version detected: ${newVersion}. Refreshing...`);
            // If we are on the login page, just refresh immediately
            if (view === "login") {
              window.location.reload();
            } else {
              // On dashboard, show a polite notification before refreshing
              showToast("System update detected. Refreshing to apply new features...", "info");
              setTimeout(() => {
                window.location.reload();
              }, 4000);
            }
          }
          currentVersion.current = newVersion;
        }
      } catch (e) {
        console.warn("Version check failed:", e);
      }
    };

    // Initial check
    checkVersion();
    
    // Check every 2 minutes for updates
    const interval = setInterval(checkVersion, 120000);
    return () => clearInterval(interval);
  }, [view]);

  if (isAdmin) return (
    <>
      <style>{LOGIN_STYLES}</style>
      <AdminDashboard onSignOut={handleSignOut} allEmployees={creds} showToast={showToast} />
      {toast.show && (
        <div className="notif-toast" style={{ animation: "popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}>
          <div style={{ background: toast.type === 'error' ? T.red : T.accent, width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
            <Icon d={icons.message} size={20} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>Notification</div>
            <div style={{ fontSize: 12, color: T.ink2, opacity: 0.9 }}>{toast.msg}</div>
          </div>
        </div>
      )}
    </>
  );
  
  if (employee) return (
    <>
      <style>{LOGIN_STYLES}</style>
      <Dashboard employee={employee} onSignOut={handleSignOut} showToast={showToast} />
      {toast.show && (
        <div className="notif-toast" style={{ animation: "popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}>
          <div style={{ background: toast.type === 'error' ? T.red : T.accent, width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
            <Icon d={icons.message} size={20} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>Message Alert</div>
            <div style={{ fontSize: 12, color: T.ink2, opacity: 0.9 }}>{toast.msg}</div>
          </div>
        </div>
      )}
    </>
  );

  if (view === "forgot") return <ForgotPasswordPage onBack={() => setView("login")} onSendLink={sendResetLink} />;
  if (view === "reset") return <ResetPasswordPage token={resetToken} onReset={resetPassword} />;

  return (
    <LoginPage
      onLogin={handleLogin}
      error={error}
      isSyncing={isSyncing}
      onForgot={() => setView("forgot")}
    />
  );
}
