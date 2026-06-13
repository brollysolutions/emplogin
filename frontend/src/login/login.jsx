import { useState, useEffect, useRef, useMemo } from "react";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GlowCard } from "@/components/ui/spotlight-card";
import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
import logo from '../assets/brolly_logo_new.jpeg';

/* -- Design tokens ------------------------------------------- */
const T = {
  ink: "#000000",
  ink2: "#000000",
  muted: "#1a1a1a",
  faint: "#dddddd",
  border: "#cccccc",
  surface: "#ffffff",
  white: "#ffffff",
  glass: "#ffffff",
  accent: "#b58a0d",
  accent2: "#F9E2AF",
  green: "#10b981",
  greenBg: "rgba(16, 185, 129, 0.1)",
  red: "#ef4444",
  redBg: "rgba(239, 68, 68, 0.1)",
  amber: "#f59e0b",
  amberBg: "rgba(245, 158, 11, 0.1)",
  purple: "#6366f1",
  purpleBg: "rgba(99, 102, 241, 0.1)",
  orange: "#f97316",
  orangeBg: "rgba(249, 115, 22, 0.1)",
  gold: "#b58a0d",
  goldBg: "rgba(212, 175, 55, 0.1)",
};

/* -- Helpers ------------------------------------------------- */
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

// Converts HTML date input "YYYY-MM-DD" → "DD MMM YYYY" (matches fmtDate format)
function formatInputDate(val) {
  if (!val) return "";
  const d = new Date(val + "T00:00:00"); // Force local time, not UTC
  return fmtDate(d);
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
  return new Promise((resolve) => {
    try {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        resolve(file);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              if (!width || !height) {
                resolve(file);
                return;
              }
              
              if (width > height) {
                if (width > maxWidth) {
                  height = Math.round((height * maxWidth) / width);
                  width = maxWidth;
                }
              } else {
                if (height > maxHeight) {
                  width = Math.round((width * maxHeight) / height);
                  height = maxHeight;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              canvas.toBlob((blob) => {
                try {
                  if (!blob) {
                    resolve(file);
                    return;
                  }
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                  });
                  resolve(compressedFile);
                } catch (err) {
                  console.error("Error creating compressed File object:", err);
                  resolve(file); // Fallback to original file
                }
              }, 'image/jpeg', quality);
            } catch (err) {
              console.error("Error compressing image on load:", err);
              resolve(file);
            }
          };
          img.onerror = (err) => {
            console.error("Error loading image object:", err);
            resolve(file);
          };
          img.src = e.target.result;
        } catch (err) {
          console.error("Error reading reader data:", err);
          resolve(file);
        }
      };
      reader.onerror = (err) => {
        console.error("FileReader error:", err);
        resolve(file);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Global compression error:", err);
      resolve(file); // Fallback to original file
    }
  });
};

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
const API_BASE = import.meta.env.VITE_API_URL || "/login/api/v1/";
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
const HOLIDAYS_URL = API_BASE + "holidays/";


/* ── Avatar ────────────────────────────────────────────────── */
function Avatar({ name, src, size = 40, accent = T.accent }) {
  const [imgFailed, setImgFailed] = useState(false);
  const ini = initials(name);
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const bg = `hsl(${hue},55%,92%)`;
  const fg = `hsl(${hue},60%,32%)`;

  if (src && !imgFailed) {
    return (
      <img 
        src={src} 
        alt={name} 
        onError={() => setImgFailed(true)}
        style={{
          width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
          border: `1.5px solid rgba(0,0,0,0.05)`
        }} 
      />
    );
  }

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

/* ── Premium Form Helper Components ────────────────────────── */
function PremiumInput({ label, icon, placeholder, value, onChange, type = "text", maxLength }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {icon}
        {label}
      </label>
      <div style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        borderRadius: 14,
        background: focused ? "white" : T.surface,
        border: `1.5px solid ${focused ? T.accent : T.border}`,
        boxShadow: focused ? `0 0 0 4px ${T.accent}15, 0 4px 15px rgba(21,96,189,0.05)` : "none",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        padding: "2px 4px"
      }}>
        <input 
          type={type}
          placeholder={placeholder} 
          value={value} 
          onChange={onChange}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            padding: "11px 12px",
            fontSize: "13.5px",
            fontWeight: 700,
            color: T.ink,
            fontFamily: "inherit"
          }}
        />
      </div>
    </div>
  );
}

function PremiumFileUpload({ id, label, fileName, isUploaded, onFileSelect, viewUrl }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 14,
      background: "white",
      padding: 24,
      borderRadius: 24,
      border: `1.5px solid ${T.border}`,
      boxShadow: "0 8px 30px rgba(11,31,53,0.02)",
      flex: 1,
      transition: "transform 0.2s, box-shadow 0.2s"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: T.ink, letterSpacing: -0.2 }}>{label}</span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "4px 10px",
          borderRadius: 8,
          background: isUploaded ? T.greenBg : T.redBg,
          color: isUploaded ? T.green : T.red,
          letterSpacing: 0.2,
          textTransform: "uppercase"
        }}>
          {isUploaded ? "Saved ✓" : "Required ⚠️"}
        </span>
      </div>

      <div style={{
        border: `2px dashed ${hovered ? T.accent : T.border}`,
        borderRadius: 18,
        background: T.surface,
        padding: "24px 16px",
        textAlign: "center",
        cursor: "pointer",
        position: "relative",
        transition: "all 0.2s ease",
        transform: hovered ? "scale(1.01)" : "scale(1)"
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      >
        <input 
          type="file" 
          id={id} 
          accept="image/*" 
          hidden 
          onChange={onFileSelect} 
        />
        <label htmlFor={id} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 16px rgba(11,31,53,0.06)",
            fontSize: 18
          }}>
            📤
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>
              {fileName ? fileName : "Upload Document"}
            </div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, marginTop: 4, letterSpacing: 0.3 }}>
              JPEG, PNG or JPG supported
            </div>
          </div>
        </label>
      </div>

      {viewUrl && (
        <button 
          onClick={() => window.open(viewUrl, '_blank')}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "none",
            background: T.accent + "12",
            color: T.accent,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
          }}
          onMouseOver={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "white"; }}
          onMouseOut={e => { e.currentTarget.style.background = T.accent + "12"; e.currentTarget.style.color = T.accent; }}
        >
          👁️ Preview Verified Card
        </button>
      )}
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
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
};

/* ══════════════════════════════════════════════════════════════
   LOGIN PAGE  Premium Animated Redesign
-------------------------------------------------------------- */
const LOGIN_STYLES = `
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
  @keyframes sloganSlideUp {
    0% { opacity: 0; transform: translateY(20px); filter: blur(4px); }
    100% { opacity: 1; transform: translateY(0); filter: blur(0); }
  }

  .status-badge-hover {
    transition: transform 0.2s ease, filter 0.2s ease;
  }
  .status-badge-hover:hover {
    transform: scale(1.05);
    filter: brightness(0.95);
  }
  .dropdown-item-hover:hover {
    background: #f5f8fc;
    color: #1560bd !important;
  }

  .login-inp {
    width:100%; padding:13px 16px; border-radius: 12px;
    border:2px solid #e2ebf6; font-size:14px; font-family:ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; letter-spacing: 0.01em;
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
    background: white; color: #000000; padding: 16px 24px;
    border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    display: flex; alignItems: center; gap: 12px;
    animation: fadeInUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
    border: 1px solid rgba(0,0,0,0.08);
  }

  .login-btn {
    width:100%; padding:14px; border-radius: 12px; border:none;
    background: linear-gradient(135deg, #1560bd 0%, #0ea5e9 100%);
    color:white; font-weight: 700; font-size:15px; font-family:ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; letter-spacing: 0.01em;
    cursor:pointer; letter-spacing:1px; position:relative; overflow:hidden;
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
    cursor:pointer; font-weight: 700; font-family:ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; letter-spacing: 0.01em;
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
    .login-card { padding: 32px 24px !important; border-radius: 16px !important; width: 100% !important; max-width: 400px !important; }
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
    .fixed.top-8.left-8 { top: 1rem !important; left: 1rem !important; }
    .w-14.h-14 { width: 3rem !important; height: 3rem !important; }
    .text-3xl { font-size: 1.5rem !important; }
  }
`;

function LoginPage({ onLogin, error, isSyncing, onForgot }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (error) {
      setLoading(false);
    }
  }, [error]);

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!u || !p) return;
    setLoading(true);
    onLogin(u, p);
  };

  return (
    <div className="relative z-10 w-full min-h-screen flex items-center justify-center px-4 py-8 mx-auto">
      {/* Branding - Top Left (Desktop) / Top Center (Mobile) */}
      <div className="fixed top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2 sm:gap-4 z-50 animate-in fade-in slide-in-from-left-4 duration-700">
        <div className="w-10 h-10 sm:w-14 sm:h-14 flex items-center justify-center overflow-hidden">
          <img src={logo} alt="Brolly Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <h2 className="text-sm sm:text-2xl font-black text-slate-900 leading-none tracking-tight" style={{ textShadow: '0.5px 0 0 currentColor' }}>Brolly Software Solutions</h2>
          <p className="text-[8px] sm:text-[12px] font-black text-gold tracking-[0.2em] mt-1 sm:mt-1.5 uppercase">Attendance System</p>
        </div>
      </div>

      <div className="w-full relative max-w-5xl overflow-hidden flex flex-col md:flex-row shadow-2xl rounded-3xl z-10 bg-white/10 backdrop-blur-sm border border-white/20">
        {/* Left Panel - Visual Branding */}
        <div className="bg-black text-white p-8 md:p-12 md:w-1/2 relative flex flex-col justify-center overflow-hidden min-h-[300px]">
          {/* Abstract Effects from FullScreenSignup */}
          <div className="w-full h-full z-2 absolute inset-0 bg-gradient-to-t from-transparent to-black opacity-50"></div>
          <div className="flex absolute inset-0 z-2 overflow-hidden backdrop-blur-3xl opacity-20 pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-full w-[4rem] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            ))}
          </div>
          <div className="w-[15rem] h-[15rem] bg-gold/20 absolute z-1 rounded-full -bottom-20 -left-20 blur-3xl animate-pulse"></div>

          <div className="relative z-10 space-y-6">
            <h1 className="text-xl md:text-3xl font-bold leading-[1.1] tracking-tighter" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', textShadow: '0.5px 0 0 currentColor' }}>
              Brolly Software Solutions <br/>
              <span className="text-gold" style={{ textShadow: '0.5px 0 0 #D4AF37' }}>Attendance Portal.</span>
            </h1>
            <p className="text-slate-300 text-sm md:text-base max-w-md font-bold italic" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', textShadow: "0.3px 0 0 currentColor" }}>
              Empowering your team with seamless time tracking and management.
            </p>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="p-8 md:p-12 md:w-1/2 flex flex-col bg-white z-10 text-slate-900 justify-center">
          <div className="mb-8">
            <h2 className="text-4xl font-black mb-3 tracking-tight text-slate-900">
              Welcome back
            </h2>
            <p className="text-slate-500 font-black">
              Sign in to your Brolly employee account
            </p>
          </div>

          <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
            {error && (
              <div className="p-4 rounded-xl text-sm flex gap-3 bg-red-50 text-red-700 border border-red-100 animate-in fade-in slide-in-from-top-2 duration-300"> 
                <Icon d={icons.info} size={18} className="shrink-0 mt-0.5" />
                <span className="font-black">{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">
                Username
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-gold transition-colors">
                  <Icon d={icons.user} size={18} />
                </div>
                <input
                  type="text"
                  id="username"
                  placeholder="Enter your username"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-black focus:bg-white focus:border-gold focus:outline-none transition-all placeholder:text-slate-300"
                  value={u}
                  onChange={(e) => setU(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label htmlFor="password" className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Password
                </label>
                <button 
                  type="button"
                  onClick={onForgot}
                  className="text-xs font-black text-gold hover:text-amber-600 transition-colors uppercase tracking-widest"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-gold transition-colors">
                  <Icon d={icons.lock} size={18} />
                </div>
                <input
                  type={show ? "text" : "password"}
                  id="password"
                  placeholder=""
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 pl-12 pr-12 text-sm font-black focus:bg-white focus:border-gold focus:outline-none transition-all placeholder:text-slate-300"
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-gold transition-colors p-1"
                >
                  <Icon d={show ? icons.eyeOff : icons.eye} size={18} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isSyncing}
              className="mt-4 w-full bg-gradient-to-r from-gold to-amber-600 hover:from-amber-600 hover:to-gold text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-gold/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-3 text-base uppercase tracking-widest"
            >
              {loading ? (
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <Icon d="M5 12h14M12 5l7 7-7 7" size={18} />
                </>
              )}
            </button>

            <p className="text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">
              Brolly Attendance Portal v2.0
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

/* -- Stat Card ------------------------------------------- */
function StatCard({ label, value, sub, icon, color, bg, isLive, index = 0 }) {
  const finalBg = label.toLowerCase().includes('active') || label.toLowerCase().includes('total') ? T.goldBg : bg;
  const finalColor = label.toLowerCase().includes('active') || label.toLowerCase().includes('total') ? T.gold : color;

  return (
    <GlowCard 
      glowColor="gold" 
      customSize={true} 
      className="stat-card-wrapper"
      style={{ animation: `slideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) ${index * 0.1}s backwards` }}
    >
      <div className="stat-card" style={{
        background: "transparent",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%"
      }}>
        {isLive && (
          <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <div className="pulse-soft" style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, boxShadow: `0 0 12px ${T.green}40` }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: T.green, textTransform: "uppercase", letterSpacing: "1px", fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em' }}>Live</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.5, color: T.ink, textTransform: "uppercase", fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em' }}>{label}</span>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: finalBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 10px ${finalColor}10`
          }}>
            <Icon d={icon} size={16} color={finalColor} />
          </div>
        </div>
        <div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 600, color: T.ink, marginBottom: 2, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px", fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em' }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: T.ink, fontWeight: 700, opacity: 0.7 }}>{sub}</div>}
        </div>
      </div>
    </GlowCard>
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
    "Active": { bg: "rgba(16, 185, 129, 0.08)", color: "#065f46", dot: "#10b981", pulse: true },
    "Leave": { bg: "rgba(99, 102, 241, 0.08)", color: "#312e81", dot: "#6366f1" },
    "Viewed": { bg: "rgba(79, 70, 229, 0.08)", color: "#1e1b4b", dot: "#4f46e5" },
    "Completed": { bg: "rgba(16, 185, 129, 0.08)", color: "#065f46", dot: "#10b981" },
    "Assigned": { bg: "rgba(249, 115, 22, 0.08)", color: "#9a3412", dot: "#f97316" },
    "Approved": { bg: "rgba(16, 185, 129, 0.08)", color: "#065f46", dot: "#10b981" },
    "Rejected": { bg: "rgba(239, 68, 68, 0.08)", color: "#991b1b", dot: "#ef4444" },
    "Pending": { bg: "rgba(245, 158, 11, 0.08)", color: "#92400e", dot: "#f59e0b" },
    "On Break": { bg: "rgba(239, 68, 68, 0.08)", color: "#d93b3b", dot: "#d93b3b", pulse: true },
    "Offline": { bg: "rgba(100, 116, 139, 0.08)", color: "#475569", dot: "#94a3b8" },
    "Work From Home": { bg: "rgba(14, 165, 233, 0.08)", color: "#0369a1", dot: "#0ea5e9" },
    "WFH": { bg: "#e0f2fe", color: "#0369a1", dot: "#0ea5e9" },
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

/* ── Confetti Blaster Canvas component for clock-in pop ───── */
function ConfettiBlaster({ active, onComplete }) {
  const canvasRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    class ConfettiParticle {
      constructor(side) {
        this.x = side === "left" ? 0 : canvas.width;
        this.y = canvas.height * 0.9; // Pop from bottom corners
        
        const angle = side === "left" 
          ? (Math.PI / 4) + Math.random() * (Math.PI / 6) // up-right
          : (3 * Math.PI / 4) - Math.random() * (Math.PI / 6); // up-left
          
        const speed = 18 + Math.random() * 22; // Good powerful blaster speed
        
        this.vx = Math.cos(angle) * speed;
        this.vy = -Math.sin(angle) * speed;
        
        this.gravity = 0.35 + Math.random() * 0.25;
        this.drag = 0.985;
        
        const colors = [
          "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", 
          "#ec4899", "#06b6d4", "#f97316", "#a855f7", "#14b8a6"
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        
        this.size = 8 + Math.random() * 10;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = -0.15 + Math.random() * 0.3;
        
        this.opacity = 1.0;
        this.fadeOutStart = 50 + Math.random() * 30;
        this.life = 0;
      }

      update() {
        this.vx *= this.drag;
        this.vy *= this.drag;
        this.vy += this.gravity;
        
        this.x += this.vx;
        this.y += this.vy;
        
        this.rotation += this.rotationSpeed;
        this.life++;
        
        if (this.life > this.fadeOutStart) {
          this.opacity -= 0.025;
        }
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2);
        ctx.restore();
      }
    }

    const particles = [];
    const particleCount = 70; // 70 particles per side
    
    for (let i = 0; i < particleCount; i++) {
      particles.push(new ConfettiParticle("left"));
      particles.push(new ConfettiParticle("right"));
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let activeParticles = 0;
      
      particles.forEach(p => {
        if (p.opacity > 0 && p.y < canvas.height + 50 && p.x > -50 && p.x < canvas.width + 50) {
          p.update();
          p.draw();
          activeParticles++;
        }
      });

      if (activeParticles > 0) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onCompleteRef.current?.();
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 99999,
        width: "100%",
        height: "100%"
      }}
    />
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
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  // New States for cumulative tracking
  const [totalWorkSeconds, setTotalWorkSeconds] = useState(savedSession?.totalWorkSeconds || 0);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(savedSession?.totalBreakSeconds || 0);
  const [sessionStartTime, setSessionStartTime] = useState(savedSession?.sessionStartTime ? new Date(savedSession.sessionStartTime) : null);
  const [breakStartTime, setBreakStartTime] = useState(savedSession?.breakStartTime ? new Date(savedSession.breakStartTime) : null);
  const [breakLogs, setBreakLogs] = useState(savedSession?.breakLogs || []);

  const [loginTime, setLT] = useState(savedSession?.loginTime ? new Date(savedSession.loginTime) : null);
  const [logoutTime, setLOT] = useState(savedSession?.logoutTime ? new Date(savedSession.logoutTime) : null);
  const [status, setStatus] = useState(savedSession?.status || "idle"); // idle, working, break, loggedOut

  const [taskInput, setTask] = useState(savedSession?.taskInput || "");
  const [taskScreenshot, setTaskScreenshot] = useState(null);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [showStartWorkingModal, setShowStartWorkingModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [activeTab, setTab] = useState("today");
  const [triggerConfetti, setTriggerConfetti] = useState(false);
  const [alwaysActive, setAlwaysActive] = useState(() => localStorage.getItem("wt_always_active") !== "false");
  const newHolidaysCount = useMemo(() => {
    try {
      const seen = JSON.parse(localStorage.getItem(`wt_seen_holidays_${employee?.id}`) || "[]");
      return holidays.filter(h => !seen.includes(h.id)).length;
    } catch { return 0; }
  }, [holidays, employee?.id]);
  // _showToast: uses the prop version if available (from App), else updates local toast state
  const _showToast = showToast || ((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); });
  const [history, setHistory] = useState([]);
  const currentMonthRecsCount = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const currentMonthName = months[now.getMonth()];
    const currentYearStr = String(now.getFullYear());
    const matchStr = `${currentMonthName} ${currentYearStr}`;

    return history.filter(r => {
      if (!r.date) return false;
      const cleanStr = String(r.date).trim();
      if (cleanStr.endsWith(matchStr)) return true;
      try {
        const d = new Date(r.date);
        if (!isNaN(d.getTime())) {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
      } catch (e) {}
      return false;
    }).length;
  }, [history]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const latestStateRef = useRef({});
  useEffect(() => {
    latestStateRef.current = {
      employee,
      status,
      loginTime,
      logoutTime,
      sessionStartTime,
      breakStartTime,
      totalWorkSeconds,
      totalBreakSeconds,
      breakLogs,
      taskInput
    };
  });

  const lastLocalStatusChangeTimeRef = useRef(0);

  // Leave Management State
  const [profile, setProfile] = useState({ total_leaves: 16 });
  const [profileContact, setProfileContact] = useState("");
  const [profileDob, setProfileDob] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileJoiningDate, setProfileJoiningDate] = useState("");
  const [profileAadharNum, setProfileAadharNum] = useState("");
  const [profilePanNum, setProfilePanNum] = useState("");
  const [newPhotoFile, setNewPhotoFile] = useState(null);
  const [newAadharFile, setNewAadharFile] = useState(null);
  const [newPanFile, setNewPanFile] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const hasInitializedProfile = useRef(false);

  useEffect(() => {
    if (profile && !hasInitializedProfile.current && profile.employee_id) {
      setProfileContact(profile.contact || "");
      setProfileDob(profile.dob || "");
      setProfileLocation(profile.location || "");
      setProfileJoiningDate(profile.joining_date || "");
      setProfileAadharNum(profile.aadhar_number || "");
      setProfilePanNum(profile.pan_number || "");
      hasInitializedProfile.current = true;
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const fd = new FormData();
    fd.append('contact', profileContact);
    fd.append('dob', profileDob);
    fd.append('location', profileLocation);
    fd.append('joining_date', profileJoiningDate);
    fd.append('aadhar_number', profileAadharNum);
    fd.append('pan_number', profilePanNum);
    
    if (newPhotoFile) fd.append('photo', newPhotoFile);
    if (newAadharFile) fd.append('aadhar_card', newAadharFile);
    if (newPanFile) fd.append('pan_card', newPanFile);
    
    try {
      const resp = await fetch(PROFILE_URL(employee.id), {
        method: "PATCH",
        body: fd
      });
      if (resp.ok) {
        const updated = await resp.json();
        hasInitializedProfile.current = false;
        setProfile(updated);
        setNewPhotoFile(null);
        setNewAadharFile(null);
        setNewPanFile(null);
        _showToast("Profile updated successfully!", "success");
      } else {
        const err = await resp.json();
        alert("Failed to save profile: " + JSON.stringify(err));
      }
    } catch (e) {
      console.error(e);
      _showToast("Error updating profile.", "error");
    }
    setSavingProfile(false);
  };

  const [myLeaves, setMyLeaves] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [leaveData, setLeaveData] = useState({ start: "", end: "", reason: "" });
  const [requestType, setRequestType] = useState("Leave");
  const [editingLeave, setEditingLeave] = useState(null);

  const handleEditLeave = (leave) => {
    setEditingLeave(leave);
    setLeaveData({
      start: leave.start_date,
      end: leave.end_date,
      reason: leave.reason
    });
    setRequestType(leave.leave_type);
    setTab("leaves"); // Switch to leaves tab to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  // Polling for status sync across devices
  useEffect(() => {
    let pollInterval;

    const checkTodayStatus = async (isInitial = false) => {
      // Prevent race conditions: ignore polling updates for 10 seconds after clicking a status button
      if (!isInitial && Date.now() - lastLocalStatusChangeTimeRef.current < 10000) {
        return;
      }
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
            breakLogs: r.break_logs,
            offlineLogs: r.offline_logs,
            break_logs_parsed: (() => { try { return r.break_logs ? JSON.parse(r.break_logs) : []; } catch { return []; } })(),
            offline_logs_parsed: (() => { try { return r.offline_logs ? JSON.parse(r.offline_logs) : []; } catch { return []; } })(),
            extraHours: r.extrahours,
            tasks: r.tasks,
            status: r.status,
            last_status_change: r.last_status_change
          })));

          const today = fmtDate(new Date());
          const todayRec = myHistory.find(r => r.date === today);

          if (todayRec) {
            // Sync tasks: pull from server only on initial load to prevent background overwrites while typing/editing
            if (isInitial) {
              const serverTasks = todayRec.tasks || "";
              if (serverTasks !== "—" && serverTasks !== taskInput) {
                if (serverTasks.length > (taskInput || "").length) {
                  setTask(serverTasks);
                }
              }
            }

            const nowTime = new Date().getTime();
            const lastActive = todayRec.last_active ? new Date(todayRec.last_active).getTime() : 0;
            const isStale = lastActive > 0 && (nowTime - lastActive) > 3600000; // 1 hour threshold (previously 10m)

            if (isStale && (todayRec.status === "Active" || todayRec.status === "On Break")) {
              console.log("Gap detected! Resuming from stale session. Correcting hours to exclude offline gap...");
              const workBase = parseHMS(todayRec.hours);
              const breakBase = parseHMS(todayRec.break_time);
              const lastChange = todayRec.last_status_change ? new Date(todayRec.last_status_change).getTime() : lastActive;
              const elapsed = Math.max(0, Math.floor((lastActive - lastChange) / 1000));

              const correctedWork = todayRec.status === "Active" ? workBase + elapsed : workBase;
              const correctedBreak = todayRec.status === "On Break" ? breakBase + elapsed : breakBase;
              const newStatus = todayRec.status === "Active" ? "working" : "break";
              
              // Synchronously update UI state so user doesn't see "Start Working" and click it
              setTotalWorkSeconds(correctedWork);
              setTotalBreakSeconds(correctedBreak);
              setStatus(newStatus);
              setLT(new Date(today + " " + todayRec.logint));
              
              if (newStatus === "working") {
                setSessionStartTime(new Date());
              } else {
                setBreakStartTime(new Date());
              }

              triggerAutoSync(
                new Date(today + " " + todayRec.logint),
                null,
                newStatus,
                new Date(), // startTimeOverride: reset to now
                correctedWork,
                correctedBreak
              );
              return;
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
                try {
                  setBreakLogs(todayRec.break_logs ? JSON.parse(todayRec.break_logs) : []);
                } catch { setBreakLogs([]); }
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
      } finally {
        if (isInitial) setInitialSyncDone(true);
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
          playNotifySound();
          _showToast(`Your leave request was ${unnotified.status}!`, unnotified.status === "Approved" ? "success" : "error");
          // Mark as notified
          fetch(`${LEAVES_URL}${unnotified.id}/notify/`, { method: "PATCH" });
        }
      }
    } catch (e) { console.warn("Leaves fetch failed", e); }
  };

  const fetchHolidays = async (showNotification = false) => {
    try {
      const resp = await fetch(HOLIDAYS_URL);
      if (resp.ok) {
        const data = await resp.json();
        setHolidays(data);

        if (showNotification) {
          const seen = JSON.parse(localStorage.getItem(`wt_seen_holidays_${employee?.id}`) || "[]");
          const unseen = data.filter(h => !seen.includes(h.id));
          if (unseen.length > 0) {
            playNotifySound?.();
            const latest = unseen[unseen.length - 1];
            _showToast(`New Holiday Declared: ${latest.name}! 🎉`, "success");
          }
        }
      }
    } catch (e) { console.warn("Holidays fetch failed", e); }
  };

  useEffect(() => {
    fetchProfile();
    fetchLeaves();
    fetchHolidays(false);
    const t = setInterval(() => { fetchProfile(); fetchLeaves(); fetchHolidays(true); }, 30000);
    return () => clearInterval(t);
  }, [employee.id]);

  useEffect(() => {
    if (activeTab === "holidays" && holidays.length > 0) {
      const seenIds = holidays.map(h => h.id);
      localStorage.setItem(`wt_seen_holidays_${employee.id}`, JSON.stringify(seenIds));
    }
  }, [activeTab, holidays, employee.id]);

  const handleLeaveRequest = async () => {
    if (!leaveData.start || !leaveData.end || !leaveData.reason) {
      _showToast("Please fill all fields", "amber");
      return;
    }
    
    const isEditing = !!editingLeave;
    const url = isEditing ? `${LEAVES_URL}${editingLeave.id}/` : LEAVES_URL;
    const method = isEditing ? "PATCH" : "POST";

    try {
      const resp = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee.id,
          employee_name: employee.name,
          start_date: leaveData.start,
          end_date: leaveData.end,
          reason: leaveData.reason,
          leave_type: requestType === "Leave" ? "Casual Leave" : "Work From Home"
        })
      });
      if (resp.ok) {
        _showToast(isEditing ? "Request updated!" : (requestType === "Leave" ? "Leave request submitted!" : "Work From Home request submitted!"), "success");
        setLeaveData({ start: "", end: "", reason: "" });
        setEditingLeave(null);
        fetchLeaves();
      } else {
        const errorData = await resp.json().catch(() => ({}));
        _showToast(errorData.error || "Submission failed", "error");
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteLeave = async (leaveId) => {
    if (!confirm("Are you sure you want to cancel this pending request?")) return;
    try {
      const resp = await fetch(`${LEAVES_URL}${leaveId}/`, { method: "DELETE" });
      if (resp.ok) {
        _showToast("Request cancelled", "success");
        fetchLeaves();
      } else {
        _showToast("Failed to delete request", "error");
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
  const fileRef = useRef(null);

  // Periodic Auto-Refresh: Reload the site every hour (3,600,000 ms) to keep everything fresh
  // Session is maintained via localStorage (wt_session)
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log("Hourly auto-refresh triggered.");
      window.location.reload();
    }, 3600000);
    return () => clearInterval(refreshInterval);
  }, []);

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
      breakLogs,
      loginTime: loginTime?.toISOString() || null,
      logoutTime: logoutTime?.toISOString() || null,
      status,
      taskInput,
      employeeId: employee.id
    }));
  }, [totalWorkSeconds, totalBreakSeconds, sessionStartTime, breakStartTime, loginTime, logoutTime, status, taskInput]);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Midnight rollover check: if active session belongs to a previous day, auto-reset at midnight
  useEffect(() => {
    if (!loginTime) return;

    const todayStr = fmtDate(now);
    const loginStr = fmtDate(loginTime);

    if (todayStr !== loginStr) {
      console.log("Midnight rollover detected! Resetting dashboard...");
      
      const endOfPrevDay = new Date(loginTime);
      endOfPrevDay.setHours(23, 59, 59, 999);

      if (status === "working" || status === "break") {
        console.log("Auto-saving previous day's active session...");
        let finalWork = totalWorkSeconds;
        let finalBreak = totalBreakSeconds;

        if (status === "working" && sessionStartTime) {
          const timeToMidnight = Math.max(0, Math.floor((endOfPrevDay - sessionStartTime) / 1000));
          finalWork += timeToMidnight;
        } else if (status === "break" && breakStartTime) {
          const timeToMidnight = Math.max(0, Math.floor((endOfPrevDay - breakStartTime) / 1000));
          finalBreak += timeToMidnight;
        }

        const hrs = secondsToHMS(finalWork);
        const brk = secondsToHMS(finalBreak);
        
        const WORK_GOAL = 8;
        const HALF_DAY_THRESHOLD = 4.5;
        let dayStatus = "Half Day";
        if (hrs.total >= WORK_GOAL) dayStatus = "Full Day";
        else if (hrs.total >= HALF_DAY_THRESHOLD) dayStatus = "Incomplete Workday(IWD)";

        const syncPayload = {
          date: loginStr,
          id: employee.id,
          name: employee.name,
          dept: employee.dept,
          loginT: fmtTime(loginTime),
          logoutT: "11:59:59 PM",
          hours: hmsStr(hrs),
          breakTime: hmsStr(brk),
          extraHours: hrs.total > 8 ? hmsStr(secondsToHMS(Math.floor((hrs.total - 8) * 3600))) : "—",
          tasks: taskInput || "—",
          status: dayStatus,
          lastStatusChange: endOfPrevDay.toISOString()
        };

        // 1. Sync to local backend
        fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(syncPayload)
        }).catch(e => console.warn("Rollover sync failed", e));

        // 2. Sync to Google Sheets if configured
        if (SCRIPT_URL && !SCRIPT_URL.includes("YOUR_SCRIPT_URL_HERE")) {
          fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(syncPayload)
          }).catch(e => console.warn("Sheets rollover sync failed", e));
        }
      }

      // 3. Clear local states and reset session to idle (common for all states)
      setTotalWorkSeconds(0);
      setTotalBreakSeconds(0);
      setSessionStartTime(null);
      setBreakStartTime(null);
      setLT(null);
      setLOT(null);
      setStatus("idle");
      setTask("");
      setBreakLogs([]);
      localStorage.removeItem("wt_session");
      _showToast("Rollover: Dashboard reset for the new day", "info");
    }
  }, [now, loginTime, status, totalWorkSeconds, totalBreakSeconds, sessionStartTime, breakStartTime, taskInput, employee]);


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
    lastLocalStatusChangeTimeRef.current = Date.now();
    const t = new Date();
    if (!loginTime) setLT(t);
    setSessionStartTime(t);
    setStatus("working");
    _showToast("Session started", "success");
    setTriggerConfetti(true);
    triggerAutoSync(loginTime || t, null, "working", t, undefined, undefined, undefined, taskInput);
  };

  const handleBreak = () => {
    lastLocalStatusChangeTimeRef.current = Date.now();
    const t = new Date();
    if (status === "working" && sessionStartTime) {
      const addedWork = Math.floor((t - sessionStartTime) / 1000);
      const newTotalWork = totalWorkSeconds + addedWork;
      setTotalWorkSeconds(newTotalWork);
      setSessionStartTime(null);
      setBreakStartTime(t);
      setStatus("break");
      _showToast("Break started", "amber");
      triggerAutoSync(loginTime, null, "break", t, newTotalWork, undefined, breakLogs, taskInput);
    } else if (status === "break" && breakStartTime) {
      const addedBreak = Math.floor((t - breakStartTime) / 1000);
      const newTotalBreak = totalBreakSeconds + addedBreak;
      
      const newLog = {
        in: fmtTime(breakStartTime),
        out: fmtTime(t),
        duration: hmsStr(secondsToHMS(addedBreak))
      };
      const newBreakLogs = [...breakLogs, newLog];
      
      setTotalBreakSeconds(newTotalBreak);
      setBreakLogs(newBreakLogs);
      setBreakStartTime(null);
      setSessionStartTime(t);
      setStatus("working");
      _showToast("Work resumed", "success");
      triggerAutoSync(loginTime, null, "working", t, totalWorkSeconds, newTotalBreak, newBreakLogs, taskInput);
    }
  };

  const triggerAutoSync = (lt, lot, curStatus, startTimeOverride, workOverride, breakOverride, logsOverride, tasksOverride) => {
    const state = latestStateRef.current;
    
    // Resolve effective values with safe fallbacks to prevent stale closures
    const effectiveLt = lt || state.loginTime;
    const effectiveLot = lot || state.logoutTime;
    const effectiveStatus = curStatus !== undefined ? curStatus : state.status;
    const effectiveEmployee = state.employee || employee;

    const syncTime = new Date();
    const sTime = startTimeOverride || (effectiveStatus === "working" ? state.sessionStartTime : (effectiveStatus === "break" ? state.breakStartTime : null));

    const tWork = workOverride !== undefined ? workOverride : (
      effectiveStatus === "working" && sTime
        ? state.totalWorkSeconds + Math.floor((syncTime - sTime) / 1000)
        : state.totalWorkSeconds
    );

    const tBreak = breakOverride !== undefined ? breakOverride : (
      effectiveStatus === "break" && sTime
        ? state.totalBreakSeconds + Math.floor((syncTime - sTime) / 1000)
        : state.totalBreakSeconds
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
      date: fmtDate(effectiveLt),
      id: effectiveEmployee.id,
      name: effectiveEmployee.name,
      dept: effectiveEmployee.dept,
      loginT: fmtTime(effectiveLt),
      logoutT: (effectiveLot && effectiveStatus !== "working" && effectiveStatus !== "break") ? fmtTime(effectiveLot) : "—",
      hours: hmsStr(hrs),
      breakTime: hmsStr(brk),
      extraHours: hrs.total > 8 ? hmsStr(secondsToHMS(Math.floor((hrs.total - 8) * 3600))) : "—",
      tasks: tasksOverride !== undefined ? tasksOverride : (state.taskInput || "—"),
      breakLogs: JSON.stringify(logsOverride || state.breakLogs || []),
      status: effectiveStatus === "working" ? "Active" : effectiveStatus === "break" ? "On Break" : dayStatus,
      lastStatusChange: (effectiveStatus === "working" || effectiveStatus === "break") ? syncTime.toISOString() : (sTime ? sTime.toISOString() : null)
    };

    // Fast sync to local backend
    fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(resp => {
      if (resp.ok) {
        // Update local state to match what was synced
        if (effectiveStatus === "working") {
          setTotalWorkSeconds(tWork);
          setSessionStartTime(syncTime);
        } else if (effectiveStatus === "break") {
          setTotalBreakSeconds(tBreak);
          setBreakStartTime(syncTime);
        }
      }
    }).catch(e => console.warn("Auto-sync failed", e));
  };
  const handleLogout = () => {
    lastLocalStatusChangeTimeRef.current = Date.now();
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
    triggerAutoSync(loginTime, t, "loggedOut", null, finalWork, finalBreak, undefined, taskInput);
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

  // ── Silent Audio Keep-Alive to Prevent Browser Throttling ──
  const startSilentAudio = () => {
    try {
      if (window.silentAudioCtx) {
        if (window.silentAudioCtx.state === "suspended") {
          window.silentAudioCtx.resume().catch(e => console.warn("Failed to resume silent audio:", e));
        }
        return;
      }
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      window.silentAudioCtx = ctx;

      // Create oscillator and gain node for silence
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // extremely quiet / near-silent frequency
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      window.silentAudioOsc = osc;
      console.log("Silent audio started to prevent background throttling.");

      // Handle autoplay policy suspension by attaching interaction listeners
      if (ctx.state === "suspended") {
        const resumeOnInteraction = () => {
          if (ctx.state === "suspended") {
            ctx.resume().then(() => {
              console.log("Silent audio resumed after user interaction.");
              removeListeners();
            }).catch(e => console.warn("Interaction resume failed:", e));
          } else {
            removeListeners();
          }
        };

        const removeListeners = () => {
          document.removeEventListener("click", resumeOnInteraction);
          document.removeEventListener("keydown", resumeOnInteraction);
          document.removeEventListener("touchstart", resumeOnInteraction);
          document.removeEventListener("mousedown", resumeOnInteraction);
        };

        document.addEventListener("click", resumeOnInteraction);
        document.addEventListener("keydown", resumeOnInteraction);
        document.addEventListener("touchstart", resumeOnInteraction);
        document.addEventListener("mousedown", resumeOnInteraction);
      }
    } catch (e) {
      console.warn("Failed to start silent audio:", e);
    }
  };

  const stopSilentAudio = () => {
    try {
      if (window.silentAudioOsc) {
        try {
          window.silentAudioOsc.stop();
        } catch (e) {}
        window.silentAudioOsc = null;
      }
      if (window.silentAudioCtx) {
        window.silentAudioCtx.close().catch(e => {});
        window.silentAudioCtx = null;
      }
      console.log("Silent audio stopped.");
    } catch (e) {
      console.warn("Failed to stop silent audio:", e);
    }
  };

  // ── Triple-Tier Persistence System to Prevent Background Throttling ──
  const wakeLockRef = useRef(null);
  const webLockRef = useRef(null);
  const lastHeartbeatTimeRef = useRef(Date.now());

  const startWebLock = async () => {
    if ('locks' in navigator) {
      try {
        navigator.locks.request('brolly_keep_alive', { ifAvailable: true }, async (lock) => {
          if (lock) {
            console.log("Tier 4: Web Lock Active");
            // Keep the lock held until stopWebLock is called
            await new Promise((resolve) => {
              webLockRef.current = resolve;
            });
            console.log("Tier 4: Web Lock Released");
          } else {
            console.warn("Web Lock already held by another tab.");
          }
        });
      } catch (e) {
        console.warn("Web Lock request failed:", e);
      }
    }
  };

  const stopWebLock = () => {
    if (webLockRef.current) {
      webLockRef.current();
      webLockRef.current = null;
    }
  };

  const startPersistence = async () => {
    if (!alwaysActive) return;

    // Tier 1: Screen Wake Lock
    if ('wakeLock' in navigator) {
      try {
        if (!wakeLockRef.current) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log("Tier 1: Wake Lock Active");
        }
      } catch (err) {
        console.warn("Wake Lock failed:", err);
      }
    }

    // Tier 2: Invisible Silent Audio Loop (WAV) to prevent tab freezing/sleep
    if (!document.getElementById('keep-alive-audio')) {
      const audio = document.createElement('audio');
      audio.id = 'keep-alive-audio';
      audio.loop = true;
      audio.volume = 0.001; // virtually silent but not muted (so browser doesn't throttle)
      audio.style.position = 'fixed';
      audio.style.opacity = '0.001';
      audio.style.pointerEvents = 'none';
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      document.body.appendChild(audio);

      const playAudio = () => {
        audio.play()
          .then(() => console.log("Tier 2: Silent WAV Audio Loop Active"))
          .catch(e => console.warn("Silent WAV Audio play failed:", e));
      };

      playAudio();

      // Setup interaction listener to resume audio if autoplay is blocked
      const resumeAudio = () => {
        audio.play().then(() => {
          console.log("Silent WAV Audio resumed after user interaction");
          document.removeEventListener('click', resumeAudio);
          document.removeEventListener('keydown', resumeAudio);
          document.removeEventListener('mousedown', resumeAudio);
          document.removeEventListener('touchstart', resumeAudio);
        }).catch(e => console.warn("Failed to resume WAV audio on user interaction:", e));
      };
      document.addEventListener('click', resumeAudio);
      document.addEventListener('keydown', resumeAudio);
      document.addEventListener('mousedown', resumeAudio);
      document.addEventListener('touchstart', resumeAudio);
    }

    // Ensure Silent Audio Oscillator is running (Tier 3)
    startSilentAudio();

    // Start Web Lock (Tier 4)
    startWebLock();
  };

  const stopPersistence = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    const audio = document.getElementById('keep-alive-audio');
    if (audio) {
      audio.remove();
    }
    const video = document.getElementById('keep-alive-video');
    if (video) {
      video.remove();
    }
    stopSilentAudio();
    stopWebLock();
  };

  // Re-request Wake Lock when tab becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (status === "working" || status === "break")) {
        startPersistence();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [status, alwaysActive]);

  // Tier 3: Staleness Alert Monitor
  useEffect(() => {
    if (status !== "working" && status !== "break") return;

    const checkStaleness = () => {
      const elapsed = Date.now() - lastHeartbeatTimeRef.current;
      // If no heartbeat for 45 minutes, alert the user
      if (elapsed > 2700000) { 
        // 1. Audio Alert (Ping)
        if (window.silentAudioCtx) {
          const osc = window.silentAudioCtx.createOscillator();
          const g = window.silentAudioCtx.createGain();
          osc.connect(g); g.connect(window.silentAudioCtx.destination);
          g.gain.setValueAtTime(0.1, window.silentAudioCtx.currentTime);
          osc.frequency.setValueAtTime(880, window.silentAudioCtx.currentTime);
          osc.start(); osc.stop(window.silentAudioCtx.currentTime + 0.5);
        }
        
        // 2. Browser Notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Attendance Alert", {
            body: "Your session hasn't synced in a while. Please click back into the Brolly tab to ensure your hours are recorded.",
            icon: "/favicon.ico"
          });
        } else if ("Notification" in window && Notification.permission !== "denied") {
          Notification.requestPermission();
        }
      }
    };

    const interval = setInterval(checkStaleness, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [status]);

  // Toggle persistence based on status
  useEffect(() => {
    if (alwaysActive && (status === "working" || status === "break")) {
      startPersistence();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } else {
      stopPersistence();
    }
    return () => stopPersistence();
  }, [status, alwaysActive]);

  const runHeartbeat = async () => {
    const state = latestStateRef.current;
    if (!state.employee?.id || (state.status !== "working" && state.status !== "break")) return;
    try {
      const res = await fetch(HEARTBEAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: state.employee.id,
          date: new Date().toLocaleDateString('en-CA')
        })
      });
      if (res.ok) {
        lastHeartbeatTimeRef.current = Date.now();
      }
    } catch (e) { console.warn("Heartbeat failed", e); }
  };

  // ── Tab-close / Page-hide instant sync ──
  // Uses navigator.sendBeacon so the request survives even when the tab is being closed.
  // Also syncs on visibilitychange (tab switch / minimise) so admin always sees fresh hours.
  useEffect(() => {
    if (!loginTime || (status !== "working" && status !== "break")) return;

    const buildBeaconPayload = () => {
      const now = new Date();
      const sTime = status === "working" ? sessionStartTime : breakStartTime;
      const tWork = status === "working" && sTime
        ? totalWorkSeconds + Math.floor((now - sTime) / 1000)
        : totalWorkSeconds;
      const tBreak = status === "break" && sTime
        ? totalBreakSeconds + Math.floor((now - sTime) / 1000)
        : totalBreakSeconds;

      const hrs = secondsToHMS(tWork);
      const brk = secondsToHMS(tBreak);
      const WORK_GOAL = 8;
      const HALF_DAY_THRESHOLD = 4.5;
      let dayStatus = "Half Day";
      if (hrs.total >= WORK_GOAL) dayStatus = "Full Day";
      else if (hrs.total >= HALF_DAY_THRESHOLD) dayStatus = "Incomplete Workday(IWD)";

      return JSON.stringify({
        date: fmtDate(loginTime),
        id: employee.id,
        name: employee.name,
        dept: employee.dept,
        loginT: fmtTime(loginTime),
        logoutT: "—",
        hours: hmsStr(hrs),
        breakTime: hmsStr(brk),
        extraHours: "—",
        tasks: taskInput || "—",
        breakLogs: JSON.stringify(breakLogs),
        status: status === "working" ? "Active" : "On Break",
        lastStatusChange: now.toISOString()
      });
    };

    const onPageHide = () => {
      if (!loginTime || (status !== "working" && status !== "break")) return;
      try {
        const blob = new Blob([buildBeaconPayload()], { type: "application/json" });
        navigator.sendBeacon(BACKEND_URL, blob);
      } catch (e) { console.warn("Beacon sync failed", e); }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        onPageHide();
      } else if (document.visibilityState === "visible") {
        // Immediate recovery heartbeat when tab becomes visible again
        runHeartbeat();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loginTime, status, totalWorkSeconds, totalBreakSeconds, sessionStartTime, breakStartTime, taskInput, breakLogs, employee]);

  // ── Heartbeat & Periodic Sync ──
  // Heartbeat only keeps last_active fresh for admin visibility.
  // It NEVER forces a re-login — session is always restored from DB on page load.
  // Uses a Web Worker to manage timers to prevent background tab throttling.
  useEffect(() => {
    if (!employee?.id || (status !== "working" && status !== "break")) return;

    const runBackgroundSync = () => {
      const state = latestStateRef.current;
      const currentStatus = state.status || status;
      if (currentStatus === "working" || currentStatus === "break") {
        triggerAutoSync(state.loginTime || loginTime, state.logoutTime || logoutTime, currentStatus);
      }
    };

    let worker;
    let fallbackHeartbeatIv;
    let fallbackSyncIv;

    try {
      const workerCode = `
        let heartbeatTimer = null;
        let syncTimer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (syncTimer) clearInterval(syncTimer);
            
            heartbeatTimer = setInterval(() => {
              self.postMessage('heartbeat');
            }, 30000);
            
            syncTimer = setInterval(() => {
              self.postMessage('sync');
            }, 300000);
          } else if (e.data === 'stop') {
            if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
            if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      
      worker.onmessage = (e) => {
        if (e.data === 'heartbeat') {
          runHeartbeat();
        } else if (e.data === 'sync') {
          runBackgroundSync();
        }
      };
      
      runHeartbeat(); // Run immediately on mount or status change
      worker.postMessage('start');
    } catch (err) {
      console.warn("Failed to initialize heartbeat Web Worker, falling back to standard setInterval", err);
      runHeartbeat();
      fallbackHeartbeatIv = setInterval(runHeartbeat, 30000);
      fallbackSyncIv = setInterval(runBackgroundSync, 300000);
    }

    return () => {
      if (worker) {
        worker.postMessage('stop');
        worker.terminate();
      }
      if (fallbackHeartbeatIv) clearInterval(fallbackHeartbeatIv);
      if (fallbackSyncIv) clearInterval(fallbackSyncIv);
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
  const [mobileChatView, setMobileChatView] = useState('list');

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
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(at 0% 0%, rgba(212, 175, 55, 0.04) 0, transparent 40%), radial-gradient(at 50% 0%, rgba(99, 102, 241, 0.03) 0, transparent 40%), radial-gradient(at 100% 0%, rgba(16, 185, 129, 0.04) 0, transparent 40%), radial-gradient(at 50% 100%, rgba(212, 175, 55, 0.02) 0, transparent 50%), #f8fafc",
      position: "relative",
      overflow: "hidden",
      fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em',
      color: T.ink,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        body, button, input, select, textarea, span, div, p, h1, h2, h3, h4, h5, h6, a, label {
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }

        body { margin: 0; padding: 0; }
        .h-font { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }

        @keyframes gradientFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .premium-card {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 20px;
          box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.03);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          animation: slideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
        }

        .premium-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 45px -15px rgba(0, 0, 0, 0.08);
          border-color: rgba(212, 175, 55, 0.35);
        }

        .tab {
          flex: 1;
          text-align: center;
          padding: 8px 16px;
          border-radius: 10px;
          border: 1px solid transparent;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          background: #f8fafc;
          color: ${T.muted};
        }

        .tab.active {
          background: #ffffff;
          color: ${T.accent};
          border: 1px solid ${T.border};
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
          transform: scale(1.05);
        }

        .tab:hover:not(.active) {
          background: #ffffff;
          color: ${T.ink};
          border: 1px solid ${T.border};
        }

        .act-btn {
          padding: 10px 20px;
          border-radius: 12px;
          border: none;
          font-weight: 700;
          font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.3);
        }

        .act-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.4);
        }

        .act-btn:active { transform: translateY(0) scale(0.98); }

        .task-area {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid ${T.border};
          font-size: 14px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
          color: ${T.ink};
          background: rgba(255, 255, 255, 0.03);
          transition: all 0.3s;
          min-height: 130px;
          box-sizing: border-box;
        }

        .task-area:focus {
          background: rgba(255, 255, 255, 0.05);
          border-color: ${T.accent}60;
          box-shadow: 0 0 0 4px ${T.accent}20;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulseSoft {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
        }

        .pulse-soft { animation: pulseSoft 2s infinite; }

        .chat-grid .chat-back-btn {
          display: none !important;
        }

        @media (max-width: 768px) {
          .stat-grid { grid-template-columns: 1fr 1fr !important; }
          .main-grid { grid-template-columns: 1fr !important; }
          .greeting-text { font-size: 18px !important; }

          /* Mobile Topbar Adjustments */
          .top-bar {
            display: grid !important;
            grid-template-areas: 
              "logo user"
              "center center" !important;
            grid-template-columns: 1fr auto !important;
            height: auto !important;
            padding: 12px 16px !important;
            gap: 12px !important;
          }
          .top-bar-logo {
            grid-area: logo !important;
            gap: 8px !important;
          }
          .top-bar-logo img {
            width: 32px !important;
            height: 32px !important;
          }
          .top-bar-logo .top-bar-title {
            font-size: 13px !important;
          }
          .top-bar-logo .top-bar-title div {
            font-size: 13px !important;
          }
          .top-bar-logo .top-bar-title div:last-child {
            font-size: 8px !important;
          }
          .top-bar-center {
            grid-area: center !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            gap: 10px !important;
          }
          .top-bar-status, .always-active-toggle {
            flex: 1 !important;
            justify-content: center !important;
            text-align: center !important;
            padding: 8px 10px !important;
            font-size: 11px !important;
            box-sizing: border-box !important;
          }
          .top-bar-user {
            grid-area: user !important;
            gap: 8px !important;
          }
          .top-bar-user .name-label {
            display: none !important;
          }
          .top-bar-user .top-bar-divider {
            display: none !important;
          }

          /* Greeting & Navigation Layout Adjustments */
          .greeting-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
            margin-bottom: 24px !important;
          }
          .time-display {
            width: 100% !important;
            box-sizing: border-box !important;
            text-align: left !important;
            padding: 12px 20px !important;
          }
          .time-display div {
            font-size: 24px !important;
          }
          .tabs-container {
            flex-wrap: wrap !important;
            width: 100% !important;
            justify-content: center !important;
            gap: 8px !important;
          }
          .tab {
            flex: 1 1 calc(50% - 8px) !important;
            text-align: center !important;
            padding: 10px 12px !important;
            font-size: 12px !important;
          }

          /* Horizontal Scrollable Type Switcher for Leave requests */
          .type-switcher {
            display: flex !important;
            overflow-x: auto !important;
            white-space: nowrap !important;
            scrollbar-width: none !important;
            gap: 8px !important;
          }
          .type-switcher::-webkit-scrollbar {
            display: none !important;
          }
          .type-switcher button {
            flex: 0 0 auto !important;
            min-width: 130px !important;
          }

          /* Mobile Grid Stacking for Main Views */
          .leaves-grid, .profile-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }

          /* Support Chat Responsive Layout */
          .chat-grid {
            grid-template-columns: 1fr !important;
            height: 75vh !important;
            gap: 0 !important;
          }
          .chat-grid.mobile-view-chat .chat-sidebar {
            display: none !important;
          }
          .chat-grid.mobile-view-list .chat-window-wrapper {
            display: none !important;
          }
          .chat-grid .chat-back-btn {
            display: flex !important;
          }

          /* Profile Details Mobile Adjustments */
          .profile-header-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
          }
          .profile-header-row button {
            width: 100% !important;
            justify-content: center !important;
          }
          .profile-inner-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          padding: "16px 24px", borderRadius: 16, fontSize: 14, fontWeight: 700,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em',
          display: "flex", alignItems: "center", gap: 12, animation: "slideUp 0.4s ease",
          background: toast.type === "success" ? T.green : toast.type === "error" ? T.red : toast.type === "amber" ? T.amber : T.accent,
          color: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.1)"
        }}>
          <Icon d={toast.type === "success" ? icons.check : icons.info} size={18} color="white" />
          {toast.msg}
        </div>
      )}

      {/* ── Start Working Confirmation Modal ── */}
      {showStartWorkingModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1050,
          background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px",
          animation: "fadeIn 0.3s ease"
        }} onClick={() => setShowStartWorkingModal(false)}>
          <div style={{
            background: "white", borderRadius: 32, width: "100%", maxWidth: 440,
            boxShadow: "0 30px 70px rgba(0,0,0,0.2)", animation: "slideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
            overflow: "hidden", border: `1px solid ${T.border}`, margin: "auto"
          }} onClick={e => e.stopPropagation()}>
            <div style={{ background: "#1e1b4b", padding: "28px 32px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="h-font" style={{ fontSize: 20, fontWeight: 700 }}>Start Working Session</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Attendance Tracker</div>
              </div>
              <button onClick={() => setShowStartWorkingModal(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", cursor: "pointer", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon d="M18 6L6 18M6 6l12 12" size={20} color="white" />
              </button>
            </div>
            <div style={{ padding: "32px", textAlign: "center" }}>
              <div style={{ fontSize: "52px", marginBottom: "18px", animation: "pulseSoft 2s infinite" }}>🚀</div>
              <h3 className="h-font" style={{ margin: "0 0 10px 0", fontSize: "18px", color: "#1e1b4b", fontWeight: 700 }}>Ready to Clock In?</h3>
              <p style={{ margin: 0, fontSize: "14px", color: "#6366f1", lineHeight: "1.5", fontWeight: 700 }}>
                Clicking confirm will start tracking your active hours for today. Please make sure you are ready to begin your work session.
              </p>

              <div style={{ display: "flex", gap: "12px", marginTop: "28px" }}>
                <button 
                  onClick={() => setShowStartWorkingModal(false)}
                  style={{
                    flex: 1, padding: "14px", borderRadius: "18px", border: `1px solid ${T.border}`,
                    background: "rgba(0,0,0,0.02)", color: T.ink, fontWeight: 700, cursor: "pointer",
                    fontSize: "14px", transition: "all 0.2s"
                  }}
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    handleLogin();
                    setShowStartWorkingModal(false);
                  }}
                  style={{
                    flex: 1, padding: "14px", borderRadius: "18px", border: "none",
                    background: `linear-gradient(135deg, ${T.green} 0%, #059669 100%)`, color: "white",
                    fontWeight: 700, cursor: "pointer", fontSize: "14px",
                    boxShadow: "0 8px 20px rgba(16, 185, 129, 0.25)", transition: "all 0.2s"
                  }}
                >
                  Yes, Start Working
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assigned Tasks Modal (Employee View) ── */}
      {showTasksModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1050,
          background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px",
          animation: "fadeIn 0.3s ease", overflowY: "auto"
        }} onClick={() => setShowTasksModal(false)}>
          <div style={{
            background: "white", borderRadius: 32, width: "100%", maxWidth: 540,
            boxShadow: "0 30px 70px rgba(0,0,0,0.2)", animation: "slideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
            overflow: "hidden", border: `1px solid ${T.border}`, margin: "auto"
          }} onClick={e => e.stopPropagation()}>
            <div style={{ background: T.ink, padding: "28px 32px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="h-font" style={{ fontSize: 22, fontWeight: 700 }}>Assigned Tasks</div>
                <div style={{ fontSize: 13, color: T.faint, marginTop: 4 }}>Work prioritized by your administrator</div>
              </div>
              <button onClick={() => setShowTasksModal(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", cursor: "pointer", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon d="M18 6L6 18M6 6l12 12" size={20} color="white" />
              </button>
            </div>
            <div style={{ padding: 32, maxHeight: 450, overflowY: "auto" }}>
              {assignedTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: T.muted }}>
                   <div style={{ fontSize: 40, marginBottom: 16 }}>?</div>
                   <div className="h-font" style={{ fontWeight: 700, fontSize: 18 }}>You're all caught up!</div>
                   <div style={{ fontSize: 14, marginTop: 4 }}>No pending tasks assigned to you.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {assignedTasks.map(t => (
                    <div key={t.id} style={{
                      padding: 20, borderRadius: 24, border: `1px solid ${T.border}`,
                      background: t.status === "Assigned" ? `${T.accent}05` : "white",
                      transition: "all 0.3s"
                    }} onMouseEnter={() => t.status === "Assigned" && markTaskViewed(t.id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <div className="h-font" style={{ fontWeight: 700, color: T.ink, fontSize: 16 }}>{t.title}</div>
                        <Badge status={t.status} />
                      </div>
                      <p style={{ fontSize: 14, color: T.ink2, margin: "0 0 20px", lineHeight: 1.6 }}>{t.description}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${T.border}`, paddingTop: 16 }}> 
                        <div style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>Assigned {new Date(t.assigned_at).toLocaleDateString()}</div>
                        {t.status !== "Completed" && (
                          <button onClick={() => markTaskCompleted(t.id)} style={{
                            padding: "10px 20px", borderRadius: 12, border: "none", background: T.green, color: "white",
                            fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 12px ${T.green}30`
                          }}>Complete Task</button>
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
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px",
          overflowY: "auto"
        }} onClick={() => setSelectedRecord(null)}>
          <div style={{
            background: "white", borderRadius: 32, width: "100%", maxWidth: 540,
            boxShadow: "0 30px 70px rgba(0,0,0,0.2)", animation: "slideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
            overflow: "hidden", border: `1px solid ${T.border}`, margin: "auto"
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              background: T.ink, padding: "28px 32px", color: "white",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div>
                <div style={{ fontSize: 11, color: T.faint, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>RECORD ANALYSIS</div>
                <div className="h-font" style={{ fontSize: 22, fontWeight: 700 }}>{selectedRecord.date}</div>
              </div>
              <button onClick={() => setSelectedRecord(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", cursor: "pointer", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon d="M18 6L6 18M6 6l12 12" size={24} color="white" />
              </button>
            </div>

            <div style={{ padding: 32 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
                <div style={{ background: T.surface, padding: 16, borderRadius: 16 }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>CLOCK IN</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.green }}>{selectedRecord.loginT || "—"}</div>
                </div>
                <div style={{ background: T.surface, padding: 16, borderRadius: 16 }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>CLOCK OUT</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.red }}>{selectedRecord.logoutT || "—"}</div>
                </div>
                <div style={{ background: T.surface, padding: 16, borderRadius: 16 }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>WORKING HOURS</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{selectedRecord.hours || "—"}</div>
                </div>
                <div style={{ background: T.surface, padding: 16, borderRadius: 16 }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>BREAK DURATION</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.amber }}>{selectedRecord.breakTime || "—"}</div>
                </div>
              </div>

              <div style={{ borderTop: `1.5px solid ${T.border}`, paddingTop: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: T.purpleBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon d={icons.tasks} size={18} color={T.purple} />
                  </div>
                  <div className="h-font" style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>Tasks Performed</div>
                </div>
                <div style={{
                  background: T.surface, padding: 20, borderRadius: 20,
                  fontSize: 14, color: T.ink2, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  border: `1px solid ${T.border}`, minHeight: 120, maxHeight: 200, overflowY: "auto"
                }}>
                  {selectedRecord.tasks || "No tasks recorded for this day."}
                </div>
              </div>
            </div>

            <div style={{ padding: "0 32px 32px" }}>
              <button onClick={() => setSelectedRecord(null)} style={{
                width: "100%", padding: 16, borderRadius: 16, border: "none",
                background: T.ink, color: "white", fontWeight: 700, cursor: "pointer",
                fontSize: 15, transition: "all 0.2s"
              }} onMouseOver={e => e.currentTarget.style.opacity = 0.9} onMouseOut={e => e.currentTarget.style.opacity = 1}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Topbar -- */}
      <div className="top-bar" style={{
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid rgba(181, 138, 13, 0.4)`,
        padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70,
        position: "sticky", top: 0, zIndex: 1000,
        boxShadow: "0 4px 30px rgba(0,0,0,0.03)"
      }}>
        <div className="top-bar-logo" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, background: "white",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
          }}>
            <img src={logo} alt="Brolly Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div className="top-bar-title">
            <div className="h-font" style={{ fontWeight: 700, fontSize: 16, color: T.ink, textShadow: "0.4px 0 0 currentColor", letterSpacing: "-0.3px", textShadow: "0.5px 0 0 currentColor" }}>Brolly Software Solutions</div>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: 1, fontWeight: 700 }}>ATTENDANCE PORTAL</div>
          </div>
        </div>

        <div className="top-bar-center" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="top-bar-status" style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
            borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`
          }}>
            <div className="pulse-soft" style={{
              width: 8, height: 8, borderRadius: "50%",
              background: status === "working" ? T.green : status === "break" ? T.amber : T.faint,
            }} />
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>
              {status === "working" ? "Working" : status === "break" ? "On Break" : "Paused"}
            </span>
          </div>

          <label 
            className="always-active-toggle"
            title="Keeps the tab active in the background to prevent the browser from sleeping and freezing your session hours."
            style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "8px 14px", borderRadius: 14, 
              background: alwaysActive ? "rgba(16, 185, 129, 0.08)" : T.surface,
              border: `1px solid ${alwaysActive ? "rgba(16, 185, 129, 0.2)" : T.border}`,
              fontSize: 12, fontWeight: 700, color: alwaysActive ? T.green : T.muted,
              transition: "all 0.2s"
            }}
          >
            <input 
              type="checkbox" 
              checked={alwaysActive} 
              onChange={(e) => {
                const checked = e.target.checked;
                setAlwaysActive(checked);
                localStorage.setItem("wt_always_active", String(checked));
                if (checked) {
                  if (status === "working" || status === "break") startPersistence();
                } else {
                  stopPersistence();
                }
              }} 
              style={{
                cursor: "pointer", accentColor: T.green, width: 14, height: 14, margin: 0
              }} 
            />
            <span>Always Active Tab</span>
          </label>
        </div>

        <div className="top-bar-user" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowTasksModal(true)} style={{
            position: "relative", width: 42, height: 42, borderRadius: 12, border: `1px solid ${T.border}`,
            background: "white", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s"
          }} onMouseOver={e => e.currentTarget.style.borderColor = T.accent}>
            <Icon d={icons.tasks} size={20} color={T.muted} />
            {assignedTasks.filter(t => t.status === "Assigned").length > 0 && (
              <span style={{
                position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                background: T.red, color: "white", fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid white",
                boxShadow: "0 4px 10px rgba(239, 68, 68, 0.3)"
              }}>
                {assignedTasks.filter(t => t.status === "Assigned").length}
              </span>
            )}
          </button>

          <div className="top-bar-divider" style={{ height: 32, width: 1, background: T.border, margin: "0 4px" }} />

          <Avatar name={employee.name} src={profile.photo} size={38} />
          <div className="name-label" style={{ marginRight: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{employee.name}</div>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>{employee.role}</div>
          </div>

          <button onClick={onSignOut} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 12, border: "none",
            background: T.surface, color: T.muted, cursor: "pointer", fontSize: 12, fontWeight: 700,
            transition: "all 0.2s"
          }} onMouseOver={e => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}>
            <Icon d={icons.logout} size={15} />
            Exit
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="dashboard-content" style={{ width: "100%", maxWidth: "96%", margin: "0 auto", padding: "20px 24px", boxSizing: "border-box" }}>

        {/* Greeting row */}
        <div className="greeting-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 className="h-font" style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#1e1b4b", letterSpacing: "-0.5px", textShadow: "0.5px 0 0 currentColor" }}>
              {greeting}, {employee.name.split(" ")[0]} 👋
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: "#6366f1", fontWeight: 700 }}>
              {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="time-display" style={{ background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 16px", textAlign: "right", boxShadow: "0 1px 15px rgba(0, 0, 0, 0.05)" }}>
            <div className="h-font" style={{
              fontSize: 24, fontWeight: 700, color: T.ink,
              fontVariantNumeric: "tabular-nums", letterSpacing: 1
            }}>
              {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 2, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
              IST  {now.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {(status !== "idle") && (
          <div className="premium-card" style={{ padding: "12px 20px", borderRadius: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="h-font" style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Daily Performance Goal</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {extraStr && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: T.amber,
                    background: T.amberBg, padding: "4px 10px", borderRadius: 20,
                    border: `1px solid ${T.amber}20`
                  }}>
                    ? +{extraStr} OVERTIME
                  </span>
                )}
                <span className="h-font" style={{ fontSize: 16, fontWeight: 700, color: pct >= 100 ? T.green : T.accent }}>{pct}%</span>
              </div>
            </div>
            <div style={{ height: 8, background: "rgba(0,0,0,0.05)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, borderRadius: 99,
                background: `linear-gradient(90deg, ${T.gold} 0%, ${T.accent} 100%)`,
                transition: "width 1s cubic-bezier(0.34, 1.56, 0.64, 1)"
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: T.muted, fontWeight: 700 }}>
              <span>
                {hmsStr(liveHrs)} clocked today
                {28800 - currentTotalWorkSeconds > 0 ? (
                  <span style={{ color: T.accent2, marginLeft: 6 }}>
                    (left {hmsStr(secondsToHMS(Math.max(0, 28800 - currentTotalWorkSeconds)))})
                  </span>
                ) : (
                  <span style={{ color: T.green, marginLeft: 6 }}>
                    (Goal achieved! 🎉)
                  </span>
                )}
              </span>
              <span>Goal: 8h 00m</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs-container" style={{
          display: "flex", gap: 4, background: "rgba(0, 0, 0, 0.05)", borderRadius: 12,
          padding: 4, marginBottom: 16, width: "100%", boxSizing: "border-box"
        }}>
          {[
            { k: "today", label: "My Workspace" }, 
            { k: "history", label: "Logs & History" }, 
            { k: "leaves", label: "Requests" }, 
            { k: "profile", label: "Profile Details" }, 
            { k: "holidays", label: "Holidays", badge: newHolidaysCount },
            { k: "messages", label: "Support Chat", badge: unreadCount }
          ].map(t => (
            <button key={t.k} className={`tab${activeTab === t.k ? " active" : ""}`}
              onClick={() => setTab(t.k)} style={{ position: "relative" }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{
                  position: "absolute", top: -8, right: -4, background: T.red, color: "white",
                  fontSize: 10, padding: "2px 8px", borderRadius: 12, border: "2px solid white",
                  fontWeight: 700, boxShadow: "0 4px 10px rgba(239, 68, 68, 0.3)" 
                }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Stat cards */}
        {activeTab !== "messages" && activeTab !== "profile" && (
          <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
            <StatCard index={0} label="Active Work" value={hmsStr(liveHrs)}
              sub={`${pct}% of daily goal`}
              icon={icons.clock} color={T.green} bg={T.greenBg} isLive={status === "working"} />
            <StatCard index={1} label="Total Breaks" value={hmsStr(liveBreakHrs)}
              sub="Time spent on pause"
              icon={icons.refresh} color={T.amber} bg={T.amberBg} isLive={status === "break"} />
            <StatCard index={2} label="Current State" value={status === "working" ? "Working" : status === "break" ? "On Break" : "Offline"}
              sub={loginTime ? `Login at ${fmtTime(loginTime).split(' ')[0]}` : "Awaiting clock-in"}
              icon={icons.user} color={T.accent} bg={T.greenBg} />
            <StatCard index={3} label="Extra Time" value={extraStr || "—"}
              sub="Beyond 8h goal"
              icon={icons.chart} color={T.purple} bg={T.purpleBg} />
            <StatCard index={4} label="Month Records" value={String(currentMonthRecsCount)}
              sub="This month"
              icon={icons.calendar} color={T.orange} bg={T.orangeBg} />
            <StatCard index={5} label="Total Records" value={String(history.length)}
              sub="All time"
              icon={icons.calendar} color={T.purple} bg={T.purpleBg} />
          </div>
        )}

        {activeTab === "today" && (
          <div className="main-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Control Panel */}
            <div className="premium-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: `${T.accent}10`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 4px 10px ${T.accent}08`
                }}>
                  <Icon d={icons.clock} size={20} color={T.accent} />
                </div>
                <div>
                  <div className="h-font" style={{ fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: "-0.3px" }}>Session Control</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>Manage your work-life balance</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {!initialSyncDone ? (
                  <div style={{ flex: 1, padding: "10px", display: "flex", justifyContent: "center", alignItems: "center", background: T.surface, borderRadius: "12px", border: `1px solid ${T.border}` }}>
                    <span className="pulse-soft" style={{
                      width: 12, height: 12, border: `2px solid ${T.border}`,
                      borderTopColor: T.accent, borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.8s linear infinite"
                    }} />
                    <span style={{ marginLeft: 8, fontSize: 12, color: T.muted, fontWeight: 700, letterSpacing: 0.5 }}>SYNCHRONIZING...</span>
                  </div>
                ) : (status === "idle" || status === "loggedOut") ? (
                  <button className="act-btn" onClick={() => setShowStartWorkingModal(true)}
                    style={{ flex: 1, background: `linear-gradient(135deg, ${T.green} 0%, #059669 100%)`, color: "white", justifyContent: "center" }}>
                    <Icon d={icons.check} size={16} color="white" />
                    Start Working
                  </button>
                ) : (
                  <>
                    {status === "working" ? (
                      <button className="act-btn" onClick={handleBreak}
                        style={{ flex: 1, background: `linear-gradient(135deg, ${T.amber} 0%, #d97706 100%)`, color: "white", justifyContent: "center" }}>
                        <Icon d={icons.refresh} size={16} color="white" />
                        Take Break
                      </button>
                    ) : (
                      <button className="act-btn" onClick={handleBreak}
                        style={{ flex: 1, background: `linear-gradient(135deg, ${T.green} 0%, #059669 100%)`, color: "white", justifyContent: "center" }}>
                        <Icon d={icons.check} size={16} color="white" />
                        Resume Work
                      </button>
                    )}
                    <button className="act-btn" onClick={handleLogout}
                      style={{ flex: 1, background: "#f1f5f9", color: T.red, justifyContent: "center", boxShadow: "none", border: `1px solid ${T.red}20` }}>
                      <Icon d={icons.logout} size={16} color={T.red} />
                      Pause Session
                    </button>
                  </>
                )}
              </div>

              {/* Status timeline */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Today's Arrival", time: loginTime ? fmtTime(loginTime) : null, done: !!loginTime, color: T.accent, icon: "🌅" },
                  { label: "Net Work Hours", time: hmsStr(liveHrs), done: liveHrs.total > 0, color: T.green, icon: "💻" },
                  { label: "Total Recess", time: hmsStr(liveBreakHrs), done: liveBreakHrs.total > 0, color: T.amber, icon: "☕" },
                ].map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 12,
                    background: s.done ? `${s.color}06` : T.surface,
                    border: `1px solid ${s.done ? s.color + "20" : T.border}`,
                    transition: "all 0.3s"
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                      background: s.done ? s.color : "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: s.done ? `0 4px 10px ${s.color}30` : "none",
                      fontSize: 14
                    }}>
                      {s.done ? <Icon d={icons.check} size={14} color="white" stroke={3} /> : s.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.label}</div>
                      <div className="h-font" style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{s.time || "— —"}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Background Tab Guard info panel */}
              {alwaysActive && (status === "working" || status === "break") && (
                <div style={{
                  marginTop: 14, padding: "10px 14px", borderRadius: 12,
                  background: "rgba(99, 102, 241, 0.04)", border: `1px solid rgba(99, 102, 241, 0.15)`,
                  fontSize: 11, lineHeight: 1.4, color: T.muted
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 700, color: T.purple }}>
                    <span>💡 Background Tab Guard Active</span>
                  </div>
                  <span>
                    To ensure the browser never pauses this tab, we've enabled active Web Locks and silent media play. For absolute certainty, keep this tab open and do not close your browser.
                  </span>
                </div>
              )}
            </div>

            {/* Tasks + Save */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Task entry */}
              <div className="premium-card" style={{ padding: "20px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: `${T.purple}10`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 4px 10px ${T.purple}08`
                  }}>
                    <Icon d={icons.tasks} size={20} color={T.purple} />
                  </div>
                  <div>
                    <div className="h-font" style={{ fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: "-0.3px" }}>Activity Logging</div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>Document your daily achievements</div>
                  </div>
                </div>
                <textarea className="task-area" value={taskInput}
                  onChange={e => setTask(e.target.value)}
                  onBlur={() => {
                    if (loginTime) {
                      console.log("Auto-saving tasks on blur...");
                      triggerAutoSync(loginTime, logoutTime, status, undefined, undefined, undefined, undefined, taskInput);
                    }
                  }}
                  placeholder="• Example: Completed API integration&#10;• Example: Resolved UI bugs in dashboard&#10;• Example: Attended weekly sync" />
                
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <label style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10,
                      background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer", 
                      fontSize: 13, color: T.ink2, fontWeight: 700, transition: "all 0.2s"
                    }} onMouseOver={e => e.currentTarget.style.background = "white"}>
                      <Icon d={icons.camera} size={16} color={T.accent} />
                      {taskScreenshot ? "Change Proof" : "Attach Proof"}
                      <input type="file" hidden accept="image/*" onChange={e => {
                        if (e.target.files?.[0]) {
                          compressImage(e.target.files[0]).then(setTaskScreenshot);
                        }
                      }} />
                    </label>
                    {taskScreenshot && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: T.green, fontWeight: 700, animation: "fadeIn 0.3s" }}>    
                        <Icon d={icons.check} size={14} />
                        Image Attached
                        <button onClick={() => setTaskScreenshot(null)} style={{ background: T.redBg, border: "none", color: T.red, cursor: "pointer", width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sync to Cloud */}
              <div className="premium-card" style={{ padding: "16px 20px" }}>
                <button onClick={handleSave}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12, border: "none",
                    background: `linear-gradient(135deg, ${T.gold} 0%, ${T.accent} 100%)`, 
                    color: "white", cursor: "pointer", fontSize: 14,
                    fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: `0 6px 15px ${T.accent}30`, transition: "all 0.3s"
                  }} onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseOut={e => e.currentTarget.style.transform = "none"}>
                  <Icon d={icons.refresh} size={16} color="white" />
                  Final Sync to Database
                </button>
                <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: T.muted, fontWeight: 700, opacity: 0.8 }}>
                  Last sync today: {history.find(r => r.date === fmtDate(now))?.logoutT || "Not yet synced"}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* History tab */}
        {activeTab === "history" && (
          <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{
              padding: "20px 24px", borderBottom: `2px solid ${T.gold}`,
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
                <div style={{ fontSize: 14, fontWeight: 700, color: T.muted, marginBottom: 4 }}>No records yet</div>
                <div style={{ fontSize: 12, color: T.faint }}>
                  Load the Excel file and save your attendance to see records here.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.surface }}>
                      {["Date", "Clock In", "Clock Out", "Hours", "Break Time", "Over Time", "Status", "Tasks", ""].map(h => (
                        <th key={h} style={{
                          padding: "11px 16px", textAlign: "left",
                          fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.5,
                          borderBottom: `2px solid ${T.gold}`, textTransform: "uppercase"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((r, i) => (
                      <tr key={i} className="hist-row"
                        style={{ borderBottom: `2px solid ${T.gold}`, transition: "background 0.1s" }}>
                        <td style={{ padding: "12px 16px", color: T.ink, fontWeight: 700 }}>{r.date}</td>
                        <td style={{ padding: "12px 16px", color: T.green, fontWeight: 700 }}>{r.loginT}</td>
                        <td style={{ padding: "12px 16px", color: T.red, fontWeight: 700 }}>{r.logoutT}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{r.hours}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: T.amber, fontVariantNumeric: "tabular-nums" }}>{r.breakTime || r.break_time || ""}</td>
                        <td style={{
                          padding: "12px 16px", fontWeight: 700,
                          color: r.extraHours && r.extraHours !== "" ? T.amber : T.faint,
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
          <div className="leaves-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div className="premium-card" style={{ padding: 32, alignSelf: "start" }}>
              
              {/* Type Switcher Selector */}
              <div className="type-switcher" style={{
                display: "flex", background: "rgba(0, 0, 0, 0.05)", padding: 6, borderRadius: 16, marginBottom: 28
              }}>
                <button 
                  onClick={() => setRequestType("Leave")} 
                  style={{
                    flex: 1, padding: "12px 20px", border: "none", borderRadius: 12, cursor: "pointer",
                    fontSize: 14, fontWeight: 700, transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    background: requestType === "Leave" ? "white" : "none",
                    color: requestType === "Leave" ? T.accent : T.muted,
                    boxShadow: requestType === "Leave" ? "0 4px 15px rgba(0,0,0,0.05)" : "none",
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em'
                  }}
                >
                  🌴 Casual Leave
                </button>
                <button 
                  onClick={() => setRequestType("Work From Home")} 
                  style={{
                    flex: 1, padding: "12px 20px", border: "none", borderRadius: 12, cursor: "pointer",
                    fontSize: 14, fontWeight: 700, transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    background: requestType === "Work From Home" ? "white" : "none",
                    color: requestType === "Work From Home" ? T.accent : T.muted,
                    boxShadow: requestType === "Work From Home" ? "0 4px 15px rgba(0,0,0,0.05)" : "none",
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em'
                  }}
                >
                  🏠 Work From Home
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
                <div style={{
                  width: 54, height: 54, borderRadius: 16, background: `${T.purple}10`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 8px 20px ${T.purple}08`
                }}>
                  <Icon d={requestType === "Leave" ? icons.calendar : icons.home} size={24} color={T.purple} />
                </div>
                <div>
                  <div className="h-font" style={{ fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: "-0.3px" }}>
                    {editingLeave ? `Edit ${requestType} Request` : `New ${requestType} Request`}
                  </div>
                  {requestType === "Leave" ? (
                    <div style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>Balance: <b style={{ color: T.purple }}>{profile.total_leaves}</b> days available</div>
                  ) : (
                    <div style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>Submit for management review</div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>START DATE</label>
                  <input className="adm-inp" type="date" style={{ width: "100%", boxSizing: "border-box" }}
                    value={leaveData.start} onChange={e => setLeaveData({ ...leaveData, start: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>END DATE</label>
                  <input className="adm-inp" type="date" style={{ width: "100%", boxSizing: "border-box" }}
                    value={leaveData.end} onChange={e => setLeaveData({ ...leaveData, end: e.target.value })} />
                </div>
              </div>

              {(leaveData.start && leaveData.end) && (
                <div style={{
                  marginBottom: 24, padding: "16px 20px", borderRadius: 18,
                  background: `${T.accent}05`, border: `1.5px solid ${T.accent}15`,
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>Requested Duration</div>
                  <div className="h-font" style={{ fontSize: 18, fontWeight: 700, color: T.accent }}>
                    {(() => {
                      if (!leaveData.start || !leaveData.end) return "";
                      const s = new Date(leaveData.start);
                      const e = new Date(leaveData.end);
                      if (e < s) return "Invalid range";
                      let diff = 0;
                      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
                        if (d.getDay() !== 0) diff++;
                      }
                      return `${diff} Business Day${diff !== 1 ? 's' : ''}`;
                    })()}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 32 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>
                  JUSTIFICATION / REASON
                </label>
                <textarea className="task-area" style={{ minHeight: 140 }} 
                  placeholder={requestType === "Leave" ? "Provide a clear reason for your absence..." : "Briefly explain the reason for your remote work request..."}
                  value={leaveData.reason} onChange={e => setLeaveData({ ...leaveData, reason: e.target.value })} />
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                {editingLeave && (
                  <button className="act-btn" onClick={() => { setEditingLeave(null); setLeaveData({ start: "", end: "", reason: "" }); }}
                    style={{ flex: 1, background: "#f1f5f9", color: T.ink, justifyContent: "center", border: `1.5px solid ${T.border}`, boxShadow: "none" }}>
                    Cancel Edit
                  </button>
                )}
                <button className="act-btn" onClick={handleLeaveRequest}
                  style={{
                    flex: 2, background: `linear-gradient(135deg, ${T.gold} 0%, ${T.accent} 100%)`,
                    color: "white", justifyContent: "center", boxShadow: `0 12px 25px ${T.accent}30`
                  }}>
                  <Icon d={icons.check} size={18} color="white" />
                  {editingLeave ? "Update Request" : "Submit Request"}
                </button>
              </div>
            </div>

            <div className="premium-card" style={{ padding: 32, overflow: "hidden" }}>
              <div className="h-font" style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 28, letterSpacing: "-0.5px" }}>Request Timeline</div>    
              <div style={{ overflowY: "auto", maxHeight: 580, paddingRight: 8 }}>
                {myLeaves.length === 0 ? (
                  <div style={{ textAlign: "center", color: T.muted, padding: "100px 0" }}>
                    <div className="pulse-soft" style={{ fontSize: 48, marginBottom: 20 }}>📋</div>
                    <div className="h-font" style={{ fontWeight: 700, fontSize: 18, color: T.ink }}>No requests found</div>
                    <div style={{ fontSize: 14, marginTop: 6, opacity: 0.7 }}>Your submitted requests will appear here.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                   {[...myLeaves].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()).map(l => (
                      <div key={l.id} style={{                        padding: "24px", borderRadius: 24,
                        background: "rgba(255, 255, 255, 0.4)",
                        border: `1.5px solid ${T.border}`,
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                      }} onMouseOver={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.background = "white"; e.currentTarget.style.boxShadow = "0 15px 35px -5px rgba(0,0,0,0.05)"; }} onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.4)"; e.currentTarget.style.boxShadow = "none"; }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
                          <div className="h-font" style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{new Date(l.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} - {new Date(l.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <Badge status={l.leave_type === "Work From Home" ? "Work From Home" : "Leave"} />
                            <Badge status={l.status} />
                          </div>
                        </div>
                        <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.6, fontWeight: 700, marginBottom: (l.admin_comment || l.status === "Pending") ? 20 : 0 }}>{l.reason}</div>

                        {l.admin_comment && (
                          <div style={{
                            marginTop: 16, fontSize: 13, color: T.accent, background: "white",
                            padding: "16px 20px", borderRadius: 18, borderLeft: `5px solid ${T.accent}`,
                            boxShadow: "0 8px 20px rgba(0,0,0,0.03)", fontWeight: 700
                          }}>
                            <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>OFFICIAL RESPONSE</div>  
                            {l.admin_comment}
                          </div>
                        )}
                        {l.status === "Pending" && (
                          <div style={{ display: "flex", gap: 10, borderTop: `1.5px solid ${T.border}`, paddingTop: 16, marginTop: 4 }}>
                            <button onClick={() => handleEditLeave(l)} style={{
                              flex: 1, padding: "10px", borderRadius: 12, border: `1.5px solid ${T.accent}30`,
                              background: `${T.accent}08`, color: T.accent, fontSize: 12, fontWeight: 700,
                              cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                            }} onMouseOver={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "white"; }}>
                              ✏️ Edit Details
                            </button>
                            <button onClick={() => handleDeleteLeave(l.id)} style={{
                              flex: 1, padding: "10px", borderRadius: 12, border: `1.5px solid ${T.red}30`,
                              background: `${T.red}08`, color: T.red, fontSize: 12, fontWeight: 700,
                              cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                            }} onMouseOver={e => { e.currentTarget.style.background = T.red; e.currentTarget.style.color = "white"; }}>
                              🗑️ Cancel
                            </button>
                          </div>
                        )}
                        <div style={{ marginTop: 16, fontSize: 10, color: T.muted, textAlign: "right", fontWeight: 700, opacity: 0.6 }}>Submitted on {new Date(l.applied_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="profile-grid" style={{ animation: "fadeIn 0.3s ease", display: "grid", gridTemplateColumns: "1fr 2fr", gap: 28 }}>
            {/* Left Column: Photo & Main Info */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div className="premium-card" style={{ padding: 36, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative", overflow: "hidden" }}>
                {/* Visual Accent Top Bar */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: `linear-gradient(90deg, ${T.accent} 0%, ${T.purple} 100%)` }} />

                <div style={{ position: "relative", marginBottom: 24 }}>
                  <Avatar name={employee.name} src={newPhotoFile ? URL.createObjectURL(newPhotoFile) : profile.photo} size={130} />
                  <label htmlFor="profile-photo-upload" style={{
                    position: "absolute", bottom: 2, right: 2, width: 38, height: 38, borderRadius: "50%",
                    background: T.accent, border: "3px solid white", display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", boxShadow: "0 6px 16px rgba(21,96,189,0.3)", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                  }} 
                  title="Upload New Photo"
                  onMouseOver={e => e.currentTarget.style.transform = "scale(1.1)"}
                  onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                  >
                    <Icon d={icons.camera || "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"} size={16} color="white" />
                  </label>
                  <input type="file" id="profile-photo-upload" accept="image/*" hidden onChange={e => {
                    if (e.target.files?.[0]) {
                      compressImage(e.target.files[0]).then(setNewPhotoFile);
                    }
                  }} />
                </div>

                <div style={{ fontWeight: 700, fontSize: 22, color: T.ink, letterSpacing: "-0.5px", marginBottom: 6 }}>{employee.name}</div>
                <div style={{ fontSize: 13, color: T.muted, fontWeight: 700, marginBottom: 24, letterSpacing: 0.2 }}>{employee.role}  <span style={{ color: T.accent }}>{employee.dept}</span></div>

                <div style={{ width: "100%", background: T.surface, padding: 18, borderRadius: 20, display: "flex", justifyContent: "space-around", border: `1.5px solid ${T.border}` }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.accent }}>{employee.id}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>ID CARD</div>      
                  </div>
                  <div style={{ borderRight: `1.5px solid ${T.border}` }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.purple }}>{profile.total_leaves ?? 16}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Leaves Left</div>  
                  </div>
                </div>
              </div>

              {/* Tips / Security banner */}
              <div className="premium-card" style={{ padding: 26, background: "linear-gradient(135deg, #0b1f35 0%, #1e3a5f 100%)", color: "white", position: "relative", overflow: "hidden" }}>
                {/* Soft backdrop radial shine */}
                <div style={{ position: "absolute", top: "-50%", right: "-30%", width: 200, height: 200, borderRadius: "50%", background: "rgba(21,96,189,0.25)", filter: "blur(40px)" }} />

                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🔒</span> Security & Verification
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.75)", margin: 0, fontWeight: 700 }}>
                  Please ensure your Aadhar Card and PAN Card details match your official documents. Updates will be locked for verification once saved.
                </p>
              </div>
            </div>

            {/* Right Column: Personal Info & Identification */}
            <div className="premium-card" style={{ padding: 36, display: "flex", flexDirection: "column", gap: 30 }}>
              <div className="profile-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1.5px solid ${T.border}`, paddingBottom: 20 }}> 
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: "-0.5px" }}>Personal & Official Profile</h3>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: T.muted, fontWeight: 700 }}>Update your official details and identity cards</p>
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{
                    padding: "12px 28px", borderRadius: 14, border: "none", background: T.accent,
                    color: "white", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                    boxShadow: `0 8px 24px ${T.accent}35`, display: "flex", alignItems: "center", gap: 8,
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                  }}
                  onMouseOver={e => { e.currentTarget.style.transform = "translateY(-1.5px)"; e.currentTarget.style.boxShadow = `0 12px 28px ${T.accent}45`; }}
                  onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `0 8px 24px ${T.accent}35`; }}
                >
                  {savingProfile ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      ⏳ Saving...
                    </span>
                  ) : (
                    <>
                      <Icon d={icons.save} size={15} color="white" />
                      Save Profile
                    </>
                  )}
                </button>
              </div>

              <div className="profile-inner-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <PremiumInput 
                  label="Contact Number" 
                  icon={<span>📞</span>} 
                  placeholder="e.g. +91 83747 05188" 
                  value={profileContact} 
                  onChange={e => setProfileContact(e.target.value)} 
                />
                <PremiumInput 
                  label="Date of Birth" 
                  icon={<span>📅</span>} 
                  placeholder="YYYY-MM-DD" 
                  value={profileDob} 
                  onChange={e => setProfileDob(e.target.value)} 
                />
              </div>

              <div className="profile-inner-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24 }}>
                <PremiumInput 
                  label="Location / Address" 
                  icon={<span>📍</span>} 
                  placeholder="e.g. Hyderabad, Telangana, India" 
                  value={profileLocation} 
                  onChange={e => setProfileLocation(e.target.value)} 
                />
                <PremiumInput 
                  label="Joining Date" 
                  icon={<span>📅</span>} 
                  placeholder="YYYY-MM-DD" 
                  value={profileJoiningDate} 
                  onChange={e => setProfileJoiningDate(e.target.value)} 
                />
              </div>

              <div style={{ borderTop: `1.5px solid ${T.border}`, paddingTop: 28 }}>
                <h4 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🆔</span> Official Identity Verification
                </h4>

                <div className="profile-inner-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
                  {/* Aadhar Block */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <PremiumInput 
                      label="Aadhar Card Number" 
                      icon={<span>🪪</span>} 
                      placeholder="12-digit Aadhar Number" 
                      value={profileAadharNum} 
                      maxLength={14}
                      onChange={e => setProfileAadharNum(e.target.value)} 
                    />
                    <PremiumFileUpload 
                      id="aadhar-upload" 
                      label="Aadhar Verification File"
                      fileName={newAadharFile ? newAadharFile.name : null}
                      isUploaded={!!profile.aadhar_card}
                      onFileSelect={e => {
                        if (e.target.files?.[0]) {
                          compressImage(e.target.files[0]).then(setNewAadharFile);
                        }
                      }}
                      viewUrl={profile.aadhar_card}
                    />
                  </div>

                  {/* PAN Block */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <PremiumInput 
                      label="PAN Card Number" 
                      icon={<span>💳</span>} 
                      placeholder="10-character PAN Number" 
                      value={profilePanNum} 
                      maxLength={10}
                      onChange={e => setProfilePanNum(e.target.value.toUpperCase())} 
                    />
                    <PremiumFileUpload 
                      id="pan-upload" 
                      label="PAN Verification File"
                      fileName={newPanFile ? newPanFile.name : null}
                      isUploaded={!!profile.pan_card}
                      onFileSelect={e => {
                        if (e.target.files?.[0]) {
                          compressImage(e.target.files[0]).then(setNewPanFile);
                        }
                      }}
                      viewUrl={profile.pan_card}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "messages" && (
          <div className={`chat-grid mobile-view-${mobileChatView}`} style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, height: "75vh" }}>
            <div className="chat-sidebar" style={{ background: "white", borderRadius: 20, border: `1px solid ${T.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", padding: "10px 12px" }}>Direct Message</div>
              <button onClick={() => { setActiveChat({ type: 'admin', id: 'admin', name: 'Admin Chat' }); setMobileChatView('chat'); }} style={{
                padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                background: activeChat.type === 'admin' ? T.surface : "none", color: activeChat.type === 'admin' ? T.accent : T.ink,
                fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 10
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
                  <button key={g.id} onClick={() => { setActiveChat({ type: 'group', id: gId, name: g.name }); setMobileChatView('chat'); }} style={{
                    padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                    background: activeChat.id === gId ? T.surface : "none", color: activeChat.id === gId ? T.accent : T.ink,
                    fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 10, position: "relative"
                  }}>
                    <Icon d={icons.tasks} size={16} />
                    {g.name}
                    {unread > 0 && (
                      <span style={{ position: "absolute", top: 12, right: 12, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 700 }}>{unread}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="chat-window-wrapper premium-card" style={{ padding: 0, overflow: "hidden" }}>
              <ChatPanel
                currentUser={{ id: employee.id, name: employee.name }}
                targetUser={activeChat.type === 'admin' ? { id: 'admin', name: 'Admin' } : null}
                groupId={activeChat.type === 'group' ? activeChat.id : null}
                onBack={() => setMobileChatView('list')}
              />
            </div>
          </div>
        )}

        {activeTab === "holidays" && (
          <div className="premium-card" style={{ padding: "32px 36px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, borderBottom: `2px solid ${T.gold}`, paddingBottom: 16 }}>
              <div>
                <h2 className="h-font" style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.ink }}>Holidays List</h2>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Official calendar holidays declared by your company</div>
              </div>
              <div style={{ fontSize: 32 }}>📅</div>
            </div>
            
            {holidays.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: T.muted }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>?</div>
                <div className="h-font" style={{ fontWeight: 700, fontSize: 18 }}>No holidays declared yet</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>Enjoy your workspace and check back later!</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {holidays.map((h, idx) => {
                  const hDate = new Date(h.date);
                  const isUpcoming = hDate >= new Date().setHours(0,0,0,0);
                  return (
                    <div key={h.id} style={{
                      display: "flex", gap: 20, alignItems: "center", padding: "20px 24px",
                      borderRadius: 20, background: isUpcoming ? "rgba(99, 102, 241, 0.03)" : "rgba(0,0,0,0.01)",
                      border: `1px solid ${isUpcoming ? T.border : "rgba(0,0,0,0.05)"}`,
                      transition: "all 0.3s ease", position: "relative", overflow: "hidden"
                    }}>
                      {isUpcoming && (
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: T.accent }} />
                      )}
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        minWidth: 70, height: 70, borderRadius: 16, background: isUpcoming ? T.accent : "rgba(0,0,0,0.05)",
                        color: isUpcoming ? "white" : T.muted, textAlign: "center", fontWeight: 700
                      }}>
                        <div style={{ fontSize: 12, textTransform: "uppercase", opacity: 0.8 }}>
                          {hDate.toLocaleDateString("en-IN", { month: "short" })}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>
                          {hDate.getDate()}
                        </div>
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <h4 className="h-font" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.ink }}>{h.name}</h4>
                          {isUpcoming && (
                            <span style={{ fontSize: 10, background: T.greenBg, color: T.green, padding: "2px 8px", borderRadius: 10, fontWeight: 700, textTransform: "uppercase" }}>Upcoming</span>
                          )}
                        </div>
                        <p style={{ margin: "6px 0 0 0", fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                          {h.description || "No description provided."}
                        </p>
                      </div>

                      <div style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>
                        {hDate.toLocaleDateString("en-IN", { weekday: "long" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


        {/* Employee profile footer */}
        <div className="profile-footer" style={{
          marginTop: 20, background: T.white, borderRadius: 16, padding: "16px 24px",
          border: `1px solid ${T.border}`, display: "flex", alignItems: "center",
          gap: 16, justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={employee.name} src={profile.photo} size={44} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{employee.name}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{employee.role}  {employee.dept}</div>
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
      <ConfettiBlaster active={triggerConfetti} onComplete={() => setTriggerConfetti(false)} />
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
      display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px",
      animation: "fadeIn 0.3s ease", overflowY: "auto"
    }} onClick={onClose}>
      <div style={{
        background: "white", borderRadius: 28, width: "100%", maxWidth: 480,
        boxShadow: "0 25px 60px -12px rgba(0,0,0,0.25)", animation: "popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)", margin: "auto"
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
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>Assign Task</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>{employee.name}  {employee.id}</div>
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
                background: T.surface, fontSize: 14, fontWeight: 700, outline: "none", transition: "all 0.2s",
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
                background: T.surface, fontSize: 14, fontWeight: 700, outline: "none", transition: "all 0.2s",
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
        {onBack && <button onClick={onBack} className="chat-back-btn" style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", alignItems: "center" }}><Icon d={icons.chevronLeft} size={18} /></button>}
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
            <button onClick={() => setFile(null)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontWeight: 700 }}></button>      
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
  const [weeklyExpandedEmp, setWeeklyExpandedEmp] = useState(null); // ID of expanded employee in weekly report
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
  const [analysisEmpId, setAnalysisEmpId] = useState("");
  const [analysisSearch, setAnalysisSearch] = useState("");

  useEffect(() => {
    localStorage.setItem("wt_tab_adm", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!analysisEmpId && allEmployees.length > 0) {
      setAnalysisEmpId(allEmployees[0].id);
    }
  }, [allEmployees, analysisEmpId]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [assignTaskTo, setAssignTaskTo] = useState(null);
  const [taskFeed, setTaskFeed] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayDesc, setNewHolidayDesc] = useState("");
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [adminComment, setAdminComment] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [selectedEmployeeProfile, setSelectedEmployeeProfile] = useState(null); // { employee: e, profile: p }
  const [editingAdminProfile, setEditingAdminProfile] = useState(false);
  const [adminProfileContact, setAdminProfileContact] = useState("");
  const [adminProfileDob, setAdminProfileDob] = useState("");
  const [adminProfileLocation, setAdminProfileLocation] = useState("");
  const [adminProfileJoiningDate, setAdminProfileJoiningDate] = useState("");
  const [adminProfileAadharNum, setAdminProfileAadharNum] = useState("");
  const [adminProfilePanNum, setAdminProfilePanNum] = useState("");
  const [adminProfileLeaves, setAdminProfileLeaves] = useState(16);
  const [adminNewPhotoFile, setAdminNewPhotoFile] = useState(null);
  const [adminNewAadharFile, setAdminNewAadharFile] = useState(null);
  const [adminNewPanFile, setAdminNewPanFile] = useState(null);
  const [savingAdminProfile, setSavingAdminProfile] = useState(false);

  useEffect(() => {
    if (selectedEmployeeProfile) {
      const p = selectedEmployeeProfile.profile;
      setAdminProfileContact(p?.contact || "");
      setAdminProfileDob(p?.dob || "");
      setAdminProfileLocation(p?.location || "");
      setAdminProfileJoiningDate(p?.joining_date || "");
      setAdminProfileAadharNum(p?.aadhar_number || "");
      setAdminProfilePanNum(p?.pan_number || "");
      setAdminProfileLeaves(p?.total_leaves ?? 16);
      setEditingAdminProfile(false);
      setAdminNewPhotoFile(null);
      setAdminNewAadharFile(null);
      setAdminNewPanFile(null);
    }
  }, [selectedEmployeeProfile]);

  const handleSaveAdminProfile = async () => {
    if (!selectedEmployeeProfile) return;
    setSavingAdminProfile(true);
    const empId = selectedEmployeeProfile.employee.id;
    
    const fd = new FormData();
    fd.append('contact', adminProfileContact);
    fd.append('dob', adminProfileDob);
    fd.append('location', adminProfileLocation);
    fd.append('joining_date', adminProfileJoiningDate);
    fd.append('aadhar_number', adminProfileAadharNum);
    fd.append('pan_number', adminProfilePanNum);
    fd.append('total_leaves', adminProfileLeaves);
    
    if (adminNewPhotoFile) fd.append('photo', adminNewPhotoFile);
    if (adminNewAadharFile) fd.append('aadhar_card', adminNewAadharFile);
    if (adminNewPanFile) fd.append('pan_card', adminNewPanFile);
    
    try {
      const resp = await fetch(PROFILE_URL(empId), {
        method: "PATCH",
        body: fd
      });
      if (resp.ok) {
        const updated = await resp.json();
        
        // Update local profiles list state
        setProfiles(prev => prev.map(p => String(p.employee_id).toLowerCase() === String(empId).toLowerCase() ? updated : p));
        
        // Update selectedEmployeeProfile
        setSelectedEmployeeProfile({
          employee: selectedEmployeeProfile.employee,
          profile: updated
        });
        
        setEditingAdminProfile(false);
        setAdminNewPhotoFile(null);
        setAdminNewAadharFile(null);
        setAdminNewPanFile(null);
        showToast("Employee profile updated successfully!", "success");
      } else {
        const err = await resp.json();
        alert("Failed to save profile: " + JSON.stringify(err));
      }
    } catch (e) {
      console.error(e);
      showToast("Error updating profile.", "error");
    }
    setSavingAdminProfile(false);
  };
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

  const fetchHolidays = async () => {
    try {
      const resp = await fetch(HOLIDAYS_URL);
      if (resp.ok) {
        const data = await resp.json();
        setHolidays(data);
      }
    } catch (e) { console.warn("Failed to fetch holidays:", e); }
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!newHolidayName || !newHolidayDate) {
      showToast?.("Please enter Holiday Name and Date", "amber");
      return;
    }
    setSavingHoliday(true);
    try {
      const resp = await fetch(HOLIDAYS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newHolidayName,
          date: newHolidayDate,
          description: newHolidayDesc
        })
      });
      if (resp.ok) {
        showToast?.("Holiday declared successfully!", "success");
        setNewHolidayName("");
        setNewHolidayDate("");
        setNewHolidayDesc("");
        fetchHolidays();
      } else {
        const err = await resp.json().catch(() => ({}));
        showToast?.(err.date?.[0] || err.error || "Failed to declare holiday", "error");
      }
    } catch (err) {
      console.error(err);
      showToast?.("Server error. Could not declare holiday.", "error");
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id) => {
    if (!confirm("Are you sure you want to delete this holiday?")) return;
    try {
      const resp = await fetch(`${HOLIDAYS_URL}${id}/`, { method: "DELETE" });
      if (resp.ok) {
        showToast?.("Holiday deleted", "success");
        fetchHolidays();
      } else {
        showToast?.("Failed to delete holiday", "error");
      }
    } catch (err) {
      console.error(err);
      showToast?.("Network error", "error");
    }
  };

  const handleStatusChange = async (record, newStatus) => {
    try {
      const payload = {
        id: record.id || record.employeeid,
        name: record.name || record.employeename,
        dept: record.dept || record.department,
        date: record.date,
        status: newStatus,
        lastStatusChange: new Date().toISOString()
      };

      const resp = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        showToast(`Status updated to ${newStatus}`, "success");
        fetchAttendance();
      } else {
        showToast("Failed to update status", "error");
      }
    } catch (e) {
      console.error("Failed to update status", e);
      showToast("Error updating status", "error");
    }
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
    fetchHolidays();
    const t = setInterval(() => { fetchAttendance(); fetchHolidays(); }, 10000); // auto-refresh every 10s
    return () => clearInterval(t);
  }, []);

  // Derive stats with live calculation
  const departments = Array.from(new Set(allEmployees.map(e => e.dept).filter(Boolean)));
  const today = fmtDate(new Date());

  // Pre-process records to include live data
  const processedRecords = records.map(r => {
    // 1. Check Heartbeat Staleness (If last_active is older than 1 hour, they are offline)
    const lastActive = r.last_active ? new Date(r.last_active).getTime() : 0;
    const isHeartbeatStale = (now - lastActive) > 3600000; // 1 hour threshold (previously 5m)

    const hasWfh = leaveRequests.some(l => {
      if (l.status !== "Approved" || l.leave_type !== "Work From Home") return false;
      const lId = String(l.employee_id).toLowerCase().trim();
      const eId = String(r.id || r.employeeid).toLowerCase().trim();
      if (lId !== eId) return false;

      const checkDate = new Date(r.date);
      if (isNaN(checkDate)) return false;
      checkDate.setHours(0, 0, 0, 0);

      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      return checkDate >= start && checkDate <= end;
    });
    
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
        live_status: hasWfh ? "Work From Home" : liveStatus,
        status: hasWfh ? "Work From Home" : r.status,
        is_live: !isHeartbeatStale,
        break_logs_parsed: (() => { try { return r.break_logs ? JSON.parse(r.break_logs) : []; } catch { return []; } })(),
        offline_logs_parsed: (() => { try { return r.offline_logs ? JSON.parse(r.offline_logs) : []; } catch { return []; } })()
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
      live_status: hasWfh ? "Work From Home" : r.status,
      status: hasWfh ? "Work From Home" : r.status,
      is_live: false,
      break_logs_parsed: (() => { try { return r.break_logs ? JSON.parse(r.break_logs) : []; } catch { return []; } })(),
      offline_logs_parsed: (() => { try { return r.offline_logs ? JSON.parse(r.offline_logs) : []; } catch { return []; } })()
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
        
        let logs = [];
        
        if (r.date === today) {
           const liveRec = processedRecords.find(pr => pr.id === emp.id || pr.employeeid === emp.id);
           if (liveRec) {
              work = parseHMS(liveRec.live_hours);
              brk = parseHMS(liveRec.live_break_time);
              logs = liveRec.break_logs_parsed || [];
           }
        } else {
           const processedRec = processedRecords.find(pr => (pr.id === r.id || pr.employeeid === r.id) && pr.date === r.date);
           logs = processedRec ? processedRec.break_logs_parsed : [];
        }
        
        // Calculate status dynamically based on work hours to prevent "Active" or stale values
        const hrs = work / 3600;
        let dayStatus = "Half Day";
        if (r.status === "Work From Home" || r.status === "Leave") {
          dayStatus = r.status;
        } else if (hrs >= 8) {
          dayStatus = "Full Day";
        } else if (hrs >= 4.5) {
          dayStatus = "Incomplete Workday(IWD)";
        } else {
          dayStatus = "Half Day";
        }

        // Use the latest record for each date in the week
        if (!dateMap[r.date] || parseHMS(r.hours || r.workinghours) > dateMap[r.date].work) {
          dateMap[r.date] = { work, brk, hasLog: r.logint && r.logint !== "—", status: dayStatus, task: r.tasks || r.workstatus, breakLogs: logs };
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

      // Build daily breakdown array sorted by date
      const dailyBreakdown = Object.entries(dateMap)
        .sort(([a], [b]) => new Date(a) - new Date(b))
        .map(([date, v]) => ({ date, ...v }));

      return {
        id: emp.id,
        name: emp.name,
        dept: emp.dept,
        totalWork: formatHMS(totalWorkSecs),
        totalBreak: formatHMS(totalBreakSecs),
        daysPresent,
        avgWork: formatHMS(daysPresent > 0 ? Math.floor(totalWorkSecs / daysPresent) : 0),
        tasks: weeklyTasks.join(" | "),
        dailyBreakdown
      };
    });
  }, [processedRecords, records, allEmployees, today]);


  const todayRecs = processedRecords.filter(r => r.date === today);
  const registeredCount = allEmployees.length;
  const fullDayToday = todayRecs.filter(r => r.live_status === "Full Day" || r.status === "Full Day").length;
  const iwdToday = todayRecs.filter(r => r.live_status === "Incomplete Workday(IWD)" || r.status === "Incomplete Workday(IWD)").length;
  const halfDayToday = todayRecs.filter(r => r.live_status === "Half Day" || r.status === "Half Day").length;

  const currentMonthRecsCount = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const currentMonthName = months[now.getMonth()];
    const currentYearStr = String(now.getFullYear());
    const matchStr = `${currentMonthName} ${currentYearStr}`;

    return records.filter(r => {
      if (!r.date) return false;
      const cleanStr = String(r.date).trim();
      if (cleanStr.endsWith(matchStr)) return true;
      try {
        const d = new Date(r.date);
        if (!isNaN(d.getTime())) {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
      } catch (e) {}
      return false;
    }).length;
  }, [records]);

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

    if (filterStatus === "Work From Home") {
      let checkDate = new Date();
      if (filterDate) {
        checkDate = new Date(filterDate);
        if (isNaN(checkDate)) checkDate = new Date();
      }
      checkDate.setHours(0, 0, 0, 0);

      return allEmployees
        .filter(emp => {
          const hasWfh = leaveRequests.some(l => {
            if (l.status !== "Approved" || l.leave_type !== "Work From Home") return false;
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
          return hasWfh && matchSearch;
        })
        .map(emp => {
          const realRec = processedRecords.find(r => (r.id === emp.id || r.employeeid === emp.id) && r.date === targetDate);
          if (realRec) {
            return {
              ...realRec,
              status: "Work From Home",
              live_status: "Work From Home"
            };
          }
          return {
            id: emp.id,
            name: emp.name,
            dept: emp.dept,
            date: targetDate,
            logint: "—",
            logoutt: "—",
            hours: "—",
            break_time: "00:00:00",
            tasks: "Work From Home",
            status: "Work From Home"
          };
        });
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
      const md = (r.date || "") === targetDate;
      
      // Use live_status for filtering if it's today
      const currentStatus = (r.date === today && r.status === "Active") ? r.live_status : r.status;
      const mst = filterStatus === "all" || currentStatus === filterStatus || r.status === filterStatus;
      
      const mdt = filterDept === "all" || (r.dept || r.department) === filterDept;
      return ms && md && mst && mdt;
    });

    return [...base].sort((a, b) => {
      if (!sortConfig) return new Date(b.date).getTime() - new Date(a.date).getTime();
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
    color: T.muted, letterSpacing: 0.5, borderBottom: `2px solid ${T.gold}`, textTransform: "uppercase", whiteSpace: "nowrap"
  };
  const cellStyle = { padding: "11px 14px", fontSize: 13, color: T.ink, borderBottom: `1px solid ${T.border}` };

  const reqColStyle = { ...colStyle, fontSize: 13 };
  const reqCellStyle = { ...cellStyle, fontSize: 15 };



  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(at 0% 0%, rgba(212, 175, 55, 0.04) 0, transparent 40%), radial-gradient(at 50% 0%, rgba(99, 102, 241, 0.03) 0, transparent 40%), radial-gradient(at 100% 0%, rgba(16, 185, 129, 0.04) 0, transparent 40%), radial-gradient(at 50% 100%, rgba(212, 175, 55, 0.02) 0, transparent 50%), #f8fafc",
      position: "relative",
      overflow: "hidden",
      fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em',
      color: T.ink,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        body, button, input, select, textarea, span, div, p, h1, h2, h3, h4, h5, h6, a, label {
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }

        body { margin: 0; padding: 0; }
        .h-font { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }

        @keyframes gradientFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .adm-tab {
          flex: 1;
          text-align: center;
          padding: 10px 24px;
          border-radius: 12px;
          border: 1px solid transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          background: transparent;
          color: ${T.muted};
        }
        
        .adm-tab.active {
          background: white;
          color: ${T.accent};
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
          transform: scale(1.05);
        }
        
        .adm-tab:hover:not(.active) {
          color: ${T.ink};
          background: rgba(255, 255, 255, 0.4);
        }

        .adm-row { transition: all 0.3s ease; }
        .adm-row:hover { 
          background: rgba(255, 255, 255, 0.6) !important; 
          transform: translateX(4px);
          box-shadow: -4px 0 0 ${T.accent};
        }

        .adm-inp {
          padding: 12px 18px;
          border-radius: 16px;
          border: 1px solid ${T.border};
          font-size: 14px;
          outline: none;
          color: ${T.ink};
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(10px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
        }

        .adm-inp:focus {
          border-color: ${T.accent}40;
          background: white;
          box-shadow: 0 0 0 4px ${T.accent}10;
        }

        .premium-card {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 28px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.03);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          animation: slideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
        }

        .premium-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 45px -15px rgba(0, 0, 0, 0.08);
          border-color: rgba(212, 175, 55, 0.35);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 992px) {
          .adm-topbar { height: auto !important; padding: 12px 20px !important; flex-wrap: wrap; gap: 12px; }
          .adm-topbar-actions { width: 100%; justify-content: center !important; }
        }
        @media (max-width: 768px) {
          .adm-stat-grid { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
          .adm-filter-bar { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
          .adm-filter-bar > * { width: 100% !important; max-width: none !important; min-width: 0 !important; }
          .adm-tab-container { padding: 4px !important; overflow-x: auto; white-space: nowrap; width: 100%; box-sizing: border-box; }
          .adm-tab { padding: 8px 16px !important; font-size: 12px !important; border-radius: 10px !important; }
          .adm-main-content { padding: 16px 12px !important; }
          .adm-topbar > div:first-child { width: 100%; justify-content: center; }
          .chat-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .chat-sidebar { height: 260px !important; }
        }
        @media (max-width: 480px) {
          .adm-stat-grid { grid-template-columns: 1fr !important; }
          .adm-btn-text { display: none !important; }
        }
      `}</style>

      {/* Topbar */}
      <div className="adm-topbar" style={{
        background: "rgba(2, 6, 23, 0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "0 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 70, boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        position: "sticky", top: 0, zIndex: 1000, borderBottom: `1px solid rgba(212, 175, 55, 0.4)`
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="https://brollysolutions.in" style={{
            textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 14, background: "rgba(255,255,255,0.08)",
            color: "white", fontWeight: 700, fontSize: 13, border: "1px solid rgba(255,255,255,0.15)",
            transition: "all 0.2s", marginRight: 12, fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em'
          }} onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
            onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}>
            <Icon d={icons.chevronLeft} size={14} color="white" />
            Home
          </a>
          <div style={{
            width: 42, height: 42, borderRadius: 12, background: "white",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
          }}>
            <img src={logo} alt="Brolly Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div>
            <div className="h-font" style={{ fontWeight: 700, fontSize: 18, color: "white", letterSpacing: "-0.3px", textShadow: "0.5px 0 0 currentColor" }}>Brolly
Software Solutions</div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: 1, fontWeight: 700 }}>ADMIN PORTAL</div>
          </div>
        </div>

        <div className="adm-topbar-actions" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {lastSync && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 700, background: "rgba(255,255,255,0.05)", padding: "6px 14px", borderRadius: 12, fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em' }}>
              SYNC: {lastSync.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <button onClick={fetchAttendance}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              borderRadius: 14, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)",
              color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700,
              transition: "all 0.25s", fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em'
            }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"} onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}>
            <Icon d={icons.refresh} size={16} color="white" />
            <span className="adm-btn-text">Refresh</span>
          </button>
          <button onClick={exportExcel}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              borderRadius: 14, border: "none", background: T.accent,
              color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700,
              transition: "all 0.2s", boxShadow: `0 8px 20px ${T.accent}40`, fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', letterSpacing: '0.01em'
            }} onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseOut={e => e.currentTarget.style.transform = "none"}>
            <Icon d={icons.save} size={16} color="white" />
            <span className="adm-btn-text">Export</span>
          </button>
          <button onClick={() => setTab("employees")} style={{
            position: "relative", width: 44, height: 44, borderRadius: 14, 
            background: activeTab === 'employees' ? T.purple : "rgba(255,255,255,0.08)", 
            color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${activeTab === 'employees' ? T.purple : "rgba(255,255,255,0.15)"}`,
            transition: "all 0.2s"
          }} title="View Messages">
            <Icon d={icons.message} size={20} color="white" />
            {(Object.values(unreadMap).reduce((a, b) => a + b, 0) + Object.values(groupUnreadMapAdmin).reduce((a, b) => a + b, 0)) > 0 && (
              <span style={{
                position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: "50%",
                background: T.red, color: "white", fontSize: 10, fontWeight: 700,
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
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(11,31,53,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px",
          overflowY: "auto"
        }} onClick={() => setSelectedRecord(null)}>
          <div style={{
            background: "white", borderRadius: 24, width: "100%", maxWidth: 550,
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease",
            overflow: "hidden", margin: "auto"
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              background: T.ink, padding: "24px 30px", color: "white",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={selectedRecord.name || selectedRecord.employeename} size={44} />
                <div>
                  <div style={{ fontSize: 13, color: T.faint, fontWeight: 700, letterSpacing: 0.5 }}>{selectedRecord.id || selectedRecord.employeeid}</div>        
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedRecord.name || selectedRecord.employeename}</div>
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{selectedRecord.logint || selectedRecord.intime || ""} → {selectedRecord.logoutt || selectedRecord.outtime || ""}</div>
                </div>
                <div style={{ paddingLeft: 10 }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>Hours (Work / Break)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{selectedRecord.live_hours || ""} / {selectedRecord.live_break_time || ""}</div>  
                  {selectedRecord.break_logs_parsed && selectedRecord.break_logs_parsed.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.muted }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>Break Logs:</div>
                      {selectedRecord.break_logs_parsed.map((log, lIdx) => (
                        <div key={lIdx}> {log.in} - {log.out} ({log.duration})</div>
                      ))}
                    </div>
                  )}
                  {selectedRecord.offline_logs_parsed && selectedRecord.offline_logs_parsed.length > 0 && (
                    <div style={{ marginTop: 12, fontSize: 11, color: T.red }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>Offline Gaps:</div>
                      {selectedRecord.offline_logs_parsed.map((log, lIdx) => (
                        <div key={lIdx}> {log.start} - {log.end} ({log.duration})</div>
                      ))}
                    </div>
                  )}
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
                        <span style={{ fontWeight: 700, color: T.ink }}>{t.title}</span>
                        <Badge status={t.status} />
                      </div>
                      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{t.description}</div>
                      {t.completed_at && <div style={{ marginTop: 6, fontSize: 10, color: T.green, fontWeight: 700 }}>? Done at {new Date(t.completed_at).toLocaleTimeString()}</div>}
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

      {/* ── Employee Profile Details Modal (Admin) ── */}
      {selectedEmployeeProfile && (() => {
        const emp = selectedEmployeeProfile.employee;
        const prof = selectedEmployeeProfile.profile;
        const photoUrl = adminNewPhotoFile ? URL.createObjectURL(adminNewPhotoFile) : prof?.photo;
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(11,31,53,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px",
            overflowY: "auto"
          }} onClick={() => setSelectedEmployeeProfile(null)}>
            <div style={{
              background: "white", borderRadius: 24, width: "100%", maxWidth: 680,
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease",
              overflow: "hidden", margin: "auto"
            }} onClick={e => e.stopPropagation()}>              
              {/* Modal Header */}
              <div style={{
                background: "linear-gradient(135deg, #0b1f35 0%, #1e3a5f 100%)", padding: "24px 30px", color: "white",
                display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative"
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${T.accent} 0%, ${T.purple} 100%)` }} />
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Avatar name={emp.name} src={photoUrl} size={50} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>{emp.name}</div>
                    <div style={{ fontSize: 12, color: T.faint, fontWeight: 700 }}>{emp.id}  <span style={{ color: T.accent2 }}>{emp.role}</span></div>
                  </div>
                </div>
                <button onClick={() => setSelectedEmployeeProfile(null)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", opacity: 0.8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon d="M18 6L6 18M6 6l12 12" size={22} color="white" />
                </button>
              </div>

              {/* Modal Content */}
              <div style={{ padding: 30, maxHeight: "70vh", overflowY: "auto" }}>
                {editingAdminProfile ? (
                  /* Edit View */
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "flex", gap: 20, alignItems: "center", background: T.surface, padding: 20, borderRadius: 20, border: `1.5px solid ${T.border}` }}>
                      <div style={{ position: "relative" }}>
                        <Avatar name={emp.name} src={photoUrl} size={70} />
                        <label htmlFor="admin-photo-upload" style={{
                          position: "absolute", bottom: -2, right: -2, width: 28, height: 28, borderRadius: "50%",
                          background: T.accent, border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.1)"
                        }}>
                          <Icon d={icons.camera || "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"} size={12} color="white" />
                        </label>
                        <input type="file" id="admin-photo-upload" accept="image/*" hidden onChange={e => {
                          if (e.target.files?.[0]) {
                            compressImage(e.target.files[0]).then(setAdminNewPhotoFile);
                          }
                        }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Profile Photo</div>
                        <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 2 }}>Upload a clear passport-size photo of the employee.</div>     
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      <PremiumInput 
                        label="Contact Number" 
                        icon={<span>📞</span>} 
                        value={adminProfileContact} 
                        onChange={e => setAdminProfileContact(e.target.value)} 
                      />
                      <PremiumInput 
                        label="Date of Birth" 
                        icon={<span>📅</span>} 
                        placeholder="YYYY-MM-DD" 
                        value={adminProfileDob} 
                        onChange={e => setAdminProfileDob(e.target.value)} 
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 20 }}>
                      <PremiumInput 
                        label="Location / City" 
                        icon={<span>📍</span>} 
                        value={adminProfileLocation} 
                        onChange={e => setAdminProfileLocation(e.target.value)} 
                      />
                      <PremiumInput 
                        label="Joining Date" 
                        icon={<span>📅</span>} 
                        placeholder="YYYY-MM-DD" 
                        value={adminProfileJoiningDate} 
                        onChange={e => setAdminProfileJoiningDate(e.target.value)} 
                      />
                      <PremiumInput 
                        label="Leave Balance" 
                        icon={<span>💜</span>} 
                        type="number"
                        value={adminProfileLeaves} 
                        onChange={e => setAdminProfileLeaves(parseInt(e.target.value) || 0)} 
                      />
                    </div>

                    <div style={{ borderTop: `1.5px solid ${T.border}`, paddingTop: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 16 }}>Identity Verification Documents</div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        {/* Aadhar */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <PremiumInput 
                            label="Aadhar Number" 
                            icon={<span>🪪</span>} 
                            value={adminProfileAadharNum} 
                            maxLength={14}
                            onChange={e => setAdminProfileAadharNum(e.target.value)} 
                          />
                          <PremiumFileUpload 
                            id="admin-aadhar-file"
                            label="Aadhar Card File"
                            fileName={adminNewAadharFile ? adminNewAadharFile.name : null}
                            isUploaded={!!prof?.aadhar_card}
                            onFileSelect={e => {
                              if (e.target.files?.[0]) {
                                compressImage(e.target.files[0]).then(setAdminNewAadharFile);
                              }
                            }}
                            viewUrl={prof?.aadhar_card}
                          />
                        </div>

                        {/* PAN */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <PremiumInput 
                            label="PAN Number" 
                            icon={<span>💳</span>} 
                            value={adminProfilePanNum} 
                            maxLength={10}
                            onChange={e => setAdminProfilePanNum(e.target.value.toUpperCase())} 
                          />
                          <PremiumFileUpload 
                            id="admin-pan-file"
                            label="PAN Card File"
                            fileName={adminNewPanFile ? adminNewPanFile.name : null}
                            isUploaded={!!prof?.pan_card}
                            onFileSelect={e => {
                              if (e.target.files?.[0]) {
                                compressImage(e.target.files[0]).then(setAdminNewPanFile);
                              }
                            }}
                            viewUrl={prof?.pan_card}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Read View */
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
                      <div style={{ background: T.surface, padding: "16px 20px", borderRadius: 16, border: `1.5px solid ${T.border}`, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>📞 Contact</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{prof?.contact || "—"}</div>
                      </div>
                      <div style={{ background: T.surface, padding: "16px 20px", borderRadius: 16, border: `1.5px solid ${T.border}`, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>📅 Date of Birth</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{prof?.dob || "—"}</div>
                      </div>
                      <div style={{ background: T.surface, padding: "16px 20px", borderRadius: 16, border: `1.5px solid ${T.border}`, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>📍 Location</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{prof?.location || "—"}</div>
                      </div>
                      <div style={{ background: T.surface, padding: "16px 20px", borderRadius: 16, border: `1.5px solid ${T.border}`, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>📅 Joining Date</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{prof?.joining_date || "—"}</div>
                      </div>
                    </div>

                    <div style={{ background: T.surface, padding: "20px 24px", borderRadius: 20, border: `1.5px solid ${T.border}`, display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Leaves Balance</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: T.purple }}>{prof?.total_leaves ?? 16} Leaves</div>
                      </div>
                      <div style={{ borderRight: `1.5px solid ${T.border}`, height: 40 }} />
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Role & Dept</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{emp.role}  <span style={{ color: T.accent }}>{emp.dept}</span></div>        
                      </div>
                    </div>

                    <div style={{ borderTop: `1.5px solid ${T.border}`, paddingTop: 24 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>??</span> Official Identity Verification
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                        {/* Aadhar Card Details */}
                        <div style={{ border: `1.5px solid ${T.border}`, borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14, background: "white" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.5 }}>AADHAR CARD</span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                              background: prof?.aadhar_card ? T.greenBg : T.redBg,
                              color: prof?.aadhar_card ? T.green : T.red,
                              textTransform: "uppercase"
                            }}>
                              {prof?.aadhar_card ? "SAVED ✓" : "MISSING ⚠️"}
                            </span>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: T.muted, marginBottom: 4, fontWeight: 700 }}>Aadhar Number</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{prof?.aadhar_number || ""}</div>
                          </div>
                          {prof?.aadhar_card && (
                            <div style={{ cursor: "pointer", border: `1.5px solid ${T.border}`, borderRadius: 12, overflow: "hidden", height: 110, transition: "all 0.25s" }} 
                              onClick={() => window.open(prof.aadhar_card, '_blank')}
                              onMouseOver={e => e.currentTarget.style.transform = "scale(1.02)"}
                              onMouseOut={e => e.currentTarget.style.transform = "none"}>
                              <img src={prof.aadhar_card} alt="aadhar card preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>
                          )}
                        </div>

                        {/* PAN Card Details */}
                        <div style={{ border: `1.5px solid ${T.border}`, borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14, background: "white" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.5 }}>PAN CARD</span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                              background: prof?.pan_card ? T.greenBg : T.redBg,
                              color: prof?.pan_card ? T.green : T.red,
                              textTransform: "uppercase"
                            }}>
                              {prof?.pan_card ? "SAVED ✓" : "MISSING ⚠️"}
                            </span>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: T.muted, marginBottom: 4, fontWeight: 700 }}>PAN Number</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{prof?.pan_number || ""}</div>
                          </div>
                          {prof?.pan_card && (
                            <div style={{ cursor: "pointer", border: `1.5px solid ${T.border}`, borderRadius: 12, overflow: "hidden", height: 110, transition: "all 0.25s" }} 
                              onClick={() => window.open(prof.pan_card, '_blank')}
                              onMouseOver={e => e.currentTarget.style.transform = "scale(1.02)"}
                              onMouseOut={e => e.currentTarget.style.transform = "none"}>
                              <img src={prof.pan_card} alt="pan card preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: "0 30px 30px", display: "flex", gap: 12 }}>
                {editingAdminProfile ? (
                  <>
                    <button 
                      onClick={() => setEditingAdminProfile(false)} 
                      style={{
                        flex: 1, padding: 14, borderRadius: 14, border: `1.5px solid ${T.border}`,
                        background: "white", color: T.ink, fontWeight: 700, cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      onMouseOver={e => e.currentTarget.style.background = T.surface}
                      onMouseOut={e => e.currentTarget.style.background = "white"}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveAdminProfile} 
                      disabled={savingAdminProfile}
                      style={{
                        flex: 1, padding: 14, borderRadius: 14, border: "none",
                        background: T.accent, color: "white", fontWeight: 700, cursor: "pointer",
                        boxShadow: `0 6px 20px ${T.accent}30`, transition: "all 0.2s"
                      }}
                      onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
                      onMouseOut={e => e.currentTarget.style.transform = "none"}
                    >
                      {savingAdminProfile ? "Saving..." : "Save Details"}
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => setSelectedEmployeeProfile(null)} 
                      style={{
                        flex: 1, padding: 14, borderRadius: 14, border: `1.5px solid ${T.border}`,
                        background: "white", color: T.ink, fontWeight: 700, cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      onMouseOver={e => e.currentTarget.style.background = T.surface}
                      onMouseOut={e => e.currentTarget.style.background = "white"}
                    >
                      Close Portal
                    </button>
                    <button 
                      onClick={() => setEditingAdminProfile(true)} 
                      style={{
                        flex: 1, padding: 14, borderRadius: 14, border: "none",
                        background: T.purple, color: "white", fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        boxShadow: `0 6px 20px ${T.purple}30`, transition: "all 0.2s"
                      }}
                      onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
                      onMouseOut={e => e.currentTarget.style.transform = "none"}
                    >
                      ✏️ Edit Profile Info
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        );
      })()}
      
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
          display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px",
          overflowY: "auto"
        }} onClick={() => setChatWith(null)}>
          <div style={{
            width: "100%", maxWidth: 450, height: "80vh",
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease",
            margin: "auto"
          }} onClick={e => e.stopPropagation()}>            <ChatPanel
              currentUser={{ id: "admin", name: "Admin" }}
              targetUser={chatWith}
              onBack={() => setChatWith(null)}
              subStatus={(() => {
                const latestRec = records.filter(r => r.id === chatWith.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                const lastActive = latestRec?.last_active ? new Date(latestRec.last_active) : null;
                const isOnline = lastActive && (new Date() - lastActive < 300000);
                return isOnline ? "Online Now" : (lastActive ? `Last seen: ${lastActive.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : "Offline");
                })()}
                />
                </div>
                </div>
                )}

                <div style={{ maxWidth: "96%", margin: "0 auto", padding: "28px 24px" }}>
        {/* Stat cards */}
        <div className="adm-stat-grid stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
          <StatCard index={0} label="Total Employees" value={String(registeredCount)} sub="Registered" icon={icons.user} color={T.gold} bg={T.goldBg} />
          <StatCard index={1} label="Today Present" value={String(todayRecs.length)} sub={today} icon={icons.check} color={T.green} bg="rgba(16, 185, 129, 0.1)" isLive={true} />
          <StatCard index={2} label="Full Day Today" value={String(fullDayToday)} sub="= 8 hours" icon={icons.clock} color={T.green} bg="rgba(16, 185, 129, 0.1)" />
          <StatCard index={3} label="IWD Today" value={String(iwdToday)} sub="4.5 - 8 hrs" icon={icons.chart} color={T.orange} bg="rgba(249, 115, 22, 0.1)" />     
          <StatCard index={4} label="Half Day Today" value={String(halfDayToday)} sub="< 4.5 hours" icon={icons.clock} color={T.amber} bg="rgba(245, 158, 11, 0.1)" />
        </div>

        {/* Tabs */}
        <div className="adm-tab-container" style={{
          display: "flex", gap: 4, background: "#e4eaf3", borderRadius: 10,
          padding: 4, marginBottom: 20, width: "100%", boxSizing: "border-box"
        }}>
          {[
            { k: "attendance", label: "Attendance Records" },
            { k: "weekly", label: "Weekly Report" },
            { k: "analysis", label: "Analysis" },
            { k: "tasks", label: "Live Task Feed" },
            { k: "leaves", label: "Requests" },
            { k: "groups", label: "Manage Groups", badge: Object.values(groupUnreadMapAdmin).reduce((a, b) => a + b, 0) },
            { k: "employees", label: "Employee List", badge: Object.values(unreadMap).reduce((a, b) => a + b, 0) },
            { k: "holidays", label: "Holidays" },
          ].map(t => (
            <button key={t.k} className={`adm-tab${activeTab === t.k ? " active" : ""}`}
              onClick={() => setTab(t.k)} style={{ position: "relative" }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ position: "absolute", top: -6, right: -6, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 700 }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filters row */}
        {activeTab !== "analysis" && (
          <div className="adm-filter-bar" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
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
                  <option value="Offline">Offline</option>
                  <option value="Work From Home">Work From Home</option>
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
        )}

        {/* Analysis Overview tab */}
        {activeTab === "analysis" && (() => {
          const maxDays = Math.max(...allEmployees.map(e => processedRecords.filter(r => r.id === e.id || r.employeeid === e.id).length), 5);
          
          const filteredEmployees = allEmployees.filter(emp => 
            !analysisSearch || 
            emp.name.toLowerCase().includes(analysisSearch.toLowerCase()) || 
            emp.id.toLowerCase().includes(analysisSearch.toLowerCase()) ||
            emp.id === analysisEmpId
          );
          
          const teamAttendance = allEmployees.length > 0 ? Math.round(allEmployees.reduce((acc, e) => {
            const days = processedRecords.filter(r => r.id === e.id || r.employeeid === e.id).length;
            return acc + (days / Math.max(1, maxDays)) * 100;
          }, 0) / allEmployees.length) : 0;
          
          const teamAvgHours = processedRecords.length > 0 ? (processedRecords.reduce((acc, r) => acc + (r.live_hours_secs || 0), 0) / processedRecords.length / 3600).toFixed(1) : "0.0";
          
          const teamAvgBreak = processedRecords.length > 0 ? (processedRecords.reduce((acc, r) => {
            const t = r.live_break_time || "00:00:00";
            const [h, m, s] = t.split(":").map(Number);
            return acc + (h * 3600 + m * 60 + s);
          }, 0) / processedRecords.length / 3600).toFixed(1) : "0.0";
          
          const teamTaskComp = taskFeed.length > 0 ? Math.round((taskFeed.filter(t => t.status === "Completed").length / taskFeed.length) * 100) : 100;

          const selectedEmp = allEmployees.find(e => e.id === analysisEmpId) || allEmployees[0];
          
          let empStats = null;
          if (selectedEmp) {
            const empRecords = processedRecords.filter(r => r.id === selectedEmp.id || r.employeeid === selectedEmp.id);
            const daysPresent = empRecords.length;
            const totalWorkSecs = empRecords.reduce((acc, r) => acc + (r.live_hours_secs || 0), 0);
            const avgWorkSecs = daysPresent > 0 ? totalWorkSecs / daysPresent : 0;
            const avgWorkHours = (avgWorkSecs / 3600).toFixed(1);
            
            const totalBreakSecs = empRecords.reduce((acc, r) => {
              const t = r.live_break_time || "00:00:00";
              const [h, m, s] = t.split(":").map(Number);
              return acc + (h * 3600 + m * 60 + s);
            }, 0);
            const avgBreakHours = daysPresent > 0 ? (totalBreakSecs / daysPresent / 3600).toFixed(1) : "0.0";
            
            const parseTime = (s) => {
              if (!s || s === "—") return null;
              const parts = s.split(" ");
              if (parts.length < 2) return null;
              const [time, ampm] = parts;
              let [h, m] = time.split(":").map(Number);
              if (ampm.toLowerCase() === "pm" && h < 12) h += 12;
              if (ampm.toLowerCase() === "am" && h === 12) h = 0;
              return h * 3600 + m * 60;
            };

            const onTimeDays = empRecords.filter(r => {
              const s = parseTime(r.logint || r.intime);
              return s !== null && s <= 36000; // 10:00 AM
            }).length;
            const punctualityRate = maxDays > 0 ? Math.round((onTimeDays / maxDays) * 100) : 0;
            
            const empTasks = taskFeed.filter(t => t.employee_id === selectedEmp.id);
            const completedTasks = empTasks.filter(t => t.status === "Completed").length;
            const taskCompRate = empTasks.length > 0 ? Math.round((completedTasks / empTasks.length) * 100) : 100;
            const taskCompScoreForPerformance = empTasks.length > 0 ? Math.round((completedTasks / empTasks.length) * 100) : 0;
            
            const attScore = Math.min(100, Math.round((daysPresent / Math.max(1, maxDays)) * 100));
            const hrsScore = Math.min(100, Math.round((avgWorkSecs / 28800) * 100));
            
            const finalScore = daysPresent > 0 ? Math.round(0.3 * attScore + 0.3 * hrsScore + 0.2 * punctualityRate + 0.2 * taskCompScoreForPerformance) : 0;
            
            let grade = "C";
            let gradeText = "Needs Attention";
            let color = T.red;
            if (finalScore >= 90) { grade = "A+"; gradeText = "Outstanding"; color = T.green; }
            else if (finalScore >= 80) { grade = "A"; gradeText = "Excellent"; color = T.green; }
            else if (finalScore >= 70) { grade = "B"; gradeText = "Good"; color = T.amber; }
            else if (finalScore >= 50) { grade = "C+"; gradeText = "Satisfactory"; color = T.amber; }

            let insight = "";
            if (finalScore >= 90) {
              insight = "Outstanding performance. Demonstrates high consistency in work hours and task execution.";
            } else if (finalScore >= 70) {
              insight = "Solid performance. Punctual and reliable, with opportunities to optimize task delivery speed.";
            } else {
              insight = "Requires review. Attendance consistency or daily work hours fall below target levels.";
            }

            empStats = {
              daysPresent,
              avgWorkHours,
              avgBreakHours,
              punctualityRate,
              taskCompRate,
              finalScore,
              grade,
              gradeText,
              color,
              insight,
              assignedTasksCount: empTasks.length,
              completedTasksCount: completedTasks,
              onTimeDaysCount: onTimeDays
            };
          }

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              
              {/* Section 1: Team Analysis Overview */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16 }}>
                <div className="premium-card" style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Team Attendance Rate</div>
                  <div className="h-font" style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 8 }}>{teamAttendance}%</div>
                  <div style={{ fontSize: 11, color: T.green, fontWeight: 700, marginTop: 4 }}>Based on historical records</div>
                </div>
                <div className="premium-card" style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Avg Daily Work Hours</div>
                  <div className="h-font" style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 8 }}>{teamAvgHours} hrs</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 4 }}>Target: 8.0 hrs/day</div>
                </div>
                <div className="premium-card" style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Avg Break Duration</div>
                  <div className="h-font" style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 8 }}>{teamAvgBreak} hrs</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 4 }}>Time spent on pause</div>
                </div>
                <div className="premium-card" style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Task Completion Rate</div>
                  <div className="h-font" style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 8 }}>{teamTaskComp}%</div>
                  <div style={{ fontSize: 11, color: T.green, fontWeight: 700, marginTop: 4 }}>Across all assigned tasks</div>
                </div>
                <div className="premium-card" style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Total Records</div>
                  <div className="h-font" style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 8 }}>{records.length}</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 4 }}>All time</div>
                </div>
                <div className="premium-card" style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Monthly Records</div>
                  <div className="h-font" style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 8 }}>{currentMonthRecsCount}</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 4 }}>Current month</div>
                </div>
              </div>

              {/* Section 2: Individual Employee Performance Analysis */}
              <div className="premium-card" style={{ padding: "24px 28px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h2 className="h-font" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.ink }}>Individual Performance Scorecard</h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: 12, color: T.muted }}>Analyze dynamic performance score and key operational metrics</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>Select Employee:</span>
                    <div style={{ position: "relative", display: "flex", gap: 8 }}>
                      <input 
                        type="text" 
                        className="adm-inp" 
                        placeholder="Search employee..." 
                        value={analysisSearch} 
                        onChange={e => {
                          const val = e.target.value;
                          setAnalysisSearch(val);
                          if (val) {
                            const match = allEmployees.find(emp => 
                              emp.name?.toLowerCase().includes(val.toLowerCase()) || 
                              emp.id?.toLowerCase().includes(val.toLowerCase())
                            );
                            if (match) {
                              setAnalysisEmpId(match.id);
                            }
                          }
                        }} 
                        style={{ padding: "8px 12px", borderRadius: 10, width: 150 }}
                      />
                      <select 
                        className="adm-inp" 
                        value={analysisEmpId} 
                        onChange={e => {
                          setAnalysisEmpId(e.target.value);
                          setAnalysisSearch("");
                        }}
                        style={{ minWidth: 200, padding: "8px 12px", borderRadius: 10 }}
                      >
                        {filteredEmployees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {selectedEmp && empStats ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr", gap: 32 }}>
                    
                    {/* Left Panel: Profile and Score Ring */}
                    <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                      <Avatar name={selectedEmp.name} src={profiles.find(p => String(p.employee_id).toLowerCase() === String(selectedEmp.id).toLowerCase())?.photo} size={80} />
                      <h3 className="h-font" style={{ margin: "14px 0 2px", fontSize: 18, fontWeight: 700, color: T.ink }}>{selectedEmp.name}</h3>
                      <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, textTransform: "uppercase" }}>{selectedEmp.role} | {selectedEmp.dept}</div>

                      {/* Performance Score Circular Ring */}
                      <div style={{ position: "relative", width: 120, height: 120, margin: "20px 0 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="100%" height="100%" viewBox="0 0 36 36">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="#f1f5f9"
                            strokeWidth="3.5"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke={empStats.color}
                            strokeDasharray={`${empStats.finalScore}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                          />
                        </svg>
                        <div style={{ position: "absolute", textAlign: "center" }}>
                          <div className="h-font" style={{ fontSize: 28, fontWeight: 800, color: T.ink }}>{empStats.finalScore}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>SCORE</div>
                        </div>
                      </div>

                      <div style={{ background: `${empStats.color}10`, color: empStats.color, padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span>Grade: {empStats.grade}</span>
                        <span>•</span>
                        <span>{empStats.gradeText}</span>
                      </div>
                    </div>

                    {/* Right Panel: Detailed Metrics */}
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <h4 className="h-font" style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: T.ink, textTransform: "uppercase", letterSpacing: 0.5 }}>Metrics Breakdown</h4>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div style={{ background: T.surface, padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>Days Present</div>
                            <div className="h-font" style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginTop: 2 }}>{empStats.daysPresent} days</div>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>Out of {maxDays} team workdays</div>
                          </div>
                          
                          <div style={{ background: T.surface, padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>Avg Work Hours</div>
                            <div className="h-font" style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginTop: 2 }}>{empStats.avgWorkHours} hrs/day</div>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>Active logged time</div>
                          </div>

                          <div style={{ background: T.surface, padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>Punctuality Rate</div>
                            <div className="h-font" style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginTop: 2 }}>{empStats.punctualityRate}%</div>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{empStats.onTimeDaysCount} of {maxDays} days before 10:00 AM</div>
                          </div>

                          <div style={{ background: T.surface, padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>Task Completion</div>
                            <div className="h-font" style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginTop: 2 }}>{empStats.taskCompRate}%</div>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{empStats.completedTasksCount} done of {empStats.assignedTasksCount} assigned</div>
                          </div>
                        </div>
                      </div>

                      {/* Insight box */}
                      <div style={{ background: "rgba(99, 102, 241, 0.04)", border: `1px solid rgba(99, 102, 241, 0.15)`, padding: "12px 14px", borderRadius: 10, marginTop: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.purple, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Performance Insight</div>
                        <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.4 }}>{empStats.insight}</div>
                      </div>

                    </div>

                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px", color: T.muted }}>No employee data available for analysis.</div>
                )}

              </div>

            </div>
          );
        })()}

        {/* Weekly Report Table */}
        {activeTab === "weekly" && (
          <div className="premium-card">
            <div style={{ padding: "18px 24px", borderBottom: `2px solid ${T.gold}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>    
              <div style={{ fontWeight: 700, color: T.ink }}>Performance Summary Report</div>
              <div style={{ fontSize: 11, color: T.muted, background: T.surface, padding: "4px 10px", borderRadius: 8 }}>Range: {fmtDate(new Date(weeklyFrom))}  {fmtDate(new Date(weeklyTo))}</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {["Employee", "Dept", "Days Present", "Total Work", "Total Break", "Avg Hours/Day", "Activity Log", "Actions"].map(h => (
                      <th key={h} style={{ padding: "14px 24px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeklyReportData.filter(emp => !search || emp.name.toLowerCase().includes(search.toLowerCase()) || emp.id.toLowerCase().includes(search.toLowerCase())).map(r => {
                    const isExpanded = weeklyExpandedEmp === r.id;
                    return (
                      <>
                        <tr key={r.id} style={{ borderBottom: isExpanded ? "none" : `1px solid ${T.border}`, transition: "background 0.2s", cursor: "pointer" }}
                          className="adm-row"
                          onClick={() => setWeeklyExpandedEmp(isExpanded ? null : r.id)}
                        >
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
                          <td style={{ padding: "16px 24px", textAlign: "center" }}>
                            <button
                              onClick={e => { e.stopPropagation(); setWeeklyExpandedEmp(isExpanded ? null : r.id); }}
                              style={{
                                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                                background: isExpanded ? T.accent : T.surface,
                                color: isExpanded ? "white" : T.accent,
                                fontWeight: 700, fontSize: 11, transition: "all 0.2s"
                              }}
                            >
                              {isExpanded ? "? Hide" : "? Daily"}
                            </button>
                          </td>
                        </tr>

                        {/* Day-wise Breakdown Row */}
                        {isExpanded && (
                          <tr key={r.id + "_detail"} style={{ borderBottom: `2px solid ${T.accent}30` }}>
                            <td colSpan="8" style={{ padding: "0 24px 20px 24px", background: `${T.accent}06` }}>
                              <div style={{ paddingTop: 14 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                  📅 Day-wise Report for {r.name}
                                </div>
                                <div style={{ overflowX: "auto" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: 12, overflow: "hidden", boxShadow: `0 2px 8px ${T.accent}15` }}>
                                    <thead>
                                      <tr style={{ background: `${T.accent}15` }}>
                                        {["Date", "Work Hours", "Break Time", "Status", "Tasks / Notes"].map(h => (
                                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(r.dailyBreakdown || []).length === 0 ? (
                                        <tr><td colSpan="5" style={{ padding: 20, textAlign: "center", color: T.muted, fontSize: 12 }}>No daily records found for this range.</td></tr>
                                      ) : (
                                        r.dailyBreakdown.map((day, i) => (
                                          <tr key={day.date} style={{ borderTop: `1px solid ${T.border}`, background: i % 2 === 0 ? "white" : T.surface }}>        
                                            <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: T.ink }}>{day.date}</td>
                                            <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: T.green }}>{formatHMS(day.work)}</td>
                                            <td style={{ padding: "10px 16px", fontSize: 13, color: T.red }}>
                                              <div style={{ fontWeight: 700 }}>{formatHMS(day.brk)}</div>
                                              {day.breakLogs && day.breakLogs.length > 0 && (
                                                <div style={{ marginTop: 4, fontSize: 10, color: T.muted }}>
                                                  {day.breakLogs.map((log, lIdx) => (
                                                    <div key={lIdx} style={{ whiteSpace: "nowrap" }}>
                                                      • {log.in} - {log.out} ({log.duration})
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </td>
                                            <td style={{ padding: "10px 16px" }}>
                                              <Badge status={day.hasLog ? day.status : "Absent"} />
                                            </td>
                                            <td style={{ padding: "10px 16px", fontSize: 12, color: T.ink2, maxWidth: 280, whiteSpace: "pre-wrap" }}>
                                              {day.task || <span style={{ color: T.faint, fontStyle: "italic" }}>No notes</span>}
                                            </td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  {weeklyReportData.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ padding: "40px", textAlign: "center", color: T.muted }}>No data available for the selected range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attendance Records Table */}
        {activeTab === "attendance" && (
          <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
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
                          <Avatar name={r.name || r.employeename || "?"} src={profiles.find(p => String(p.employee_id).toLowerCase() === String(r.id || r.employeeid).toLowerCase())?.photo} size={32} />
                          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ color: T.accent, fontSize: 13 }}>{r.name || r.employeename}</span>
                            <span style={{ fontSize: 10, color: T.muted }}>Assign Task +</span>
                          </div>
                        </div>
                      </td>
                      <td style={cellStyle}>{r.dept || r.department}</td>
                      <td style={{ ...cellStyle, color: T.green }}>{r.logint || r.intime}</td>
                      <td style={{ ...cellStyle, color: T.red }}>{r.logoutt || r.outtime}</td>
                      <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums" }}>
                        {r.live_hours}
                      </td>
                      <td style={{ ...cellStyle, color: T.amber, fontVariantNumeric: "tabular-nums" }}>
                        {r.live_break_time}
                      </td>
                      <td style={{ ...cellStyle, color: r.live_overtime && r.live_overtime !== "" ? T.amber : T.faint, fontVariantNumeric: "tabular-nums" }}>
                        {r.live_overtime}
                      </td>
                      <td style={cellStyle}>
                        <Badge status={r.live_status || r.status || "Incomplete"} />
                      </td>
                      <td style={{ ...cellStyle, color: T.ink2, maxWidth: 220, fontSize: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {/* Manual Logs */}
                          {(r.tasks || r.workstatus) && (
                            <div style={{ padding: "4px 8px", background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 11, maxHeight: 60, overflowY: "auto" }} title={r.tasks || r.workstatus}>
                              <span style={{ fontSize: 9, color: T.muted, display: "block", textTransform: "uppercase" }}>Manual Log:</span>
                              {r.tasks || r.workstatus}
                            </div>
                          )}


                          {/* Assigned Tasks from Task Feed */}
                          {taskFeed.filter(t => (t.employee_id === (r.id || r.employeeid)) &&
                            fmtDate(new Date(t.assigned_at)) === r.date).map(t => (
                              <div key={t.id} style={{ padding: "4px 8px", background: "white", borderRadius: 6, border: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: T.accent }}>{t.title}</span>
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
                            background: "white", color: T.ink2, fontSize: 12,
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
        )}

        {/* Live Task Feed */}
        {activeTab === "tasks" && (
          <div className="premium-card">
            <div style={{ padding: "24px 28px", borderBottom: `2px solid ${T.gold}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>    
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>Individual Tasks Tracking</div>
                <div style={{ fontSize: 12, color: T.muted }}>Real-time activity from your team</div>
              </div>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>                <thead>
                  <tr style={{ background: T.surface }}>
                    {["Assigned At", "Employee", "Task Title", "Status", "Tracking"].map(h => (
                      <th key={h} style={colStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                 {[...taskFeed].sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()).map((t, i) => (
                   <tr key={i} className="adm-row">                      <td style={cellStyle}>{new Date(t.assigned_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={allEmployees.find(e => e.id === t.employee_id)?.name || "?"} src={profiles.find(p => String(p.employee_id).toLowerCase() === String(t.employee_id).toLowerCase())?.photo} size={28} />
                          <div style={{ fontWeight: 700 }}>{allEmployees.find(e => e.id === t.employee_id)?.name || t.employee_id}</div>
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
                            <span style={{ fontWeight: 700 }}>{t.viewed_at ? new Date(t.viewed_at).toLocaleTimeString() : ""}</span>
                          </div>
                          <div style={{ fontSize: 10, display: "flex", gap: 6 }}>
                            <span style={{ color: T.muted }}>Done:</span>
                            <span style={{ fontWeight: 700, color: T.green }}>{t.completed_at ? new Date(t.completed_at).toLocaleTimeString() : ""}</span>        
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
            <div style={{ padding: 24, borderBottom: `2px solid ${T.gold}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: T.ink }}>Employee Requests</div>
                <div style={{ fontSize: 12, color: T.muted }}>Manage and approve employee requests (Leave & Work From Home)</div>
              </div>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {["Applied On", "Employee", "Type", "Duration", "Reason", "Status", "Actions"].map(h => (
                      <th key={h} style={reqColStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.length === 0 ? (
                    <tr key="no-requests"><td colSpan="7" style={{ padding: 40, textAlign: "center", color: T.muted }}>No requests found</td></tr>
                  ) : (
                    [...leaveRequests].sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()).map((l, i) => (
                      <tr key={l.id || i} className="adm-row"><td style={reqCellStyle}>{new Date(l.applied_at).toLocaleDateString()}</td><td style={reqCellStyle}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={l.employee_name} src={profiles.find(p => String(p.employee_id).toLowerCase() === String(l.employee_id).toLowerCase())?.photo} size={28} /><div><div style={{ fontWeight: 700, fontSize: 15 }}>{l.employee_name}</div><div style={{ fontSize: 11, color: T.muted }}>{l.employee_id}{l.leave_type !== "Work From Home" && (<span> · <span style={{ color: (profiles.find(p => String(p.employee_id).toLowerCase() === String(l.employee_id).toLowerCase())?.total_leaves <= 0) ? T.red : T.purple, fontWeight: 700 }}>{profiles.find(p => String(p.employee_id).toLowerCase() === String(l.employee_id).toLowerCase())?.total_leaves ?? "—"} left</span></span>)}</div></div></div></td><td style={reqCellStyle}><Badge status={l.leave_type === "Work From Home" ? "Work From Home" : "Leave"} /></td><td style={reqCellStyle}><div style={{ fontWeight: 700, fontSize: 15 }}>{l.start_date}</div><div style={{ fontSize: 11, color: T.muted }}>to {l.end_date}</div></td><td style={{ ...reqCellStyle, maxWidth: 250, whiteSpace: "normal", fontSize: 14, lineHeight: 1.4 }}>{l.reason}</td><td style={reqCellStyle}><Badge status={l.status} /></td><td style={reqCellStyle}>{l.status === "Pending" ? (<div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}><input className="adm-inp" placeholder="Add comment..." style={{ fontSize: 13, padding: "6px 10px" }} value={adminComment} onChange={e => setAdminComment(e.target.value)} /><div style={{ display: "flex", gap: 6 }}><button onClick={() => handleApproveLeave(l.id, "Approved")} style={{ flex: 1, padding: "8px", background: T.green, color: "white", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = 0.8} onMouseOut={e => e.currentTarget.style.opacity = 1}>Approve</button><button onClick={() => handleApproveLeave(l.id, "Rejected")} style={{ flex: 1, padding: "8px", background: T.red, color: "white", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = 0.8} onMouseOut={e => e.currentTarget.style.opacity = 1}>Reject</button></div></div>) : (<div style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>{l.admin_comment || "No comment"}</div>)}</td></tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === "groups" && (
          <div className="chat-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
            {/* Left: Group List */}
            <div className="chat-sidebar" style={{ background: T.white, borderRadius: 20, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: 20, borderBottom: `2px solid ${T.gold}`, background: T.surface }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 14 }}>Organization Groups</div>
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
                        <span style={{ position: "absolute", top: 12, right: 12, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 700 }}>{unread}</span>
                      )}
                    </div>
                   );
                 })}
            </div>

            {/* Right: Group Detail */}
            {selGroup ? (
              <div className="chat-sidebar" style={{ background: "white", borderRadius: 20, border: `1px solid ${T.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700 }}>{selGroup.name}</h2>
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
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Manage Members</div>
                    <input className="adm-inp" placeholder="Search employees to add..." 
                      value={groupSearch} onChange={e => setGroupSearch(e.target.value)}
                      style={{ width: "100%", marginBottom: 16, boxSizing: "border-box" }} />
                    
                    <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 12, padding: 8 }}>
                      {allEmployees.filter(e => !groupSearch || e.name.toLowerCase().includes(groupSearch.toLowerCase()) || e.id.toLowerCase().includes(groupSearch.toLowerCase())).map(e => {
                        const isMember = selGroup.member_usernames?.includes(e.id);
                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: isMember ? T.surface : "none" }}>
                            <div
                              style={{ fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "color 0.2s" }}
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
                <div style={{ fontWeight: 700, fontSize: 16 }}>Employee Directory</div>
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
                 const isOnline = lastActive && !isNaN(lastActive.getTime()) && (new Date() - lastActive < 300000);
                 const unread = unreadMap[String(e.id).toLowerCase()] || 0;
                 return (
                 <div key={e.id} className="premium-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, transition: "transform 0.2s", borderTop: isOnline ? `4px solid ${T.green}` : "none" }}>                <div style={{ display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
                  onClick={() => setSelectedEmployeeProfile({ employee: e, profile: profiles.find(p => String(p.employee_id).toLowerCase() === String(e.id).toLowerCase()) || { employee_id: e.id, total_leaves: 16 } })}
                  title="Click to view details">
                  <div style={{ position: "relative" }}>
                    <Avatar name={e.name} src={profiles.find(p => String(p.employee_id).toLowerCase() === String(e.id).toLowerCase())?.photo} size={56} />
                    <div style={{ position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: isOnline ? T.green : T.faint, border: "3px solid white" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: T.ink, fontSize: 16 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 700 }}>{isOnline ? "Online Now" : (lastActive && !isNaN(lastActive.getTime()) ? `Last seen: ${lastActive.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : "Offline")}</div>
                    <div style={{ fontSize: 10, color: T.faint, fontWeight: 700 }}>{e.role}  {e.id}</div>
                  </div>
                  <div
                    onClick={async () => {
                      const currentVal = profiles.find(p => String(p.employee_id).toLowerCase() === String(e.id).toLowerCase())?.total_leaves ?? 16;
                      const newStr = prompt(`Update leaves balance for ${e.name} (Current: ${currentVal}):`, currentVal);
                      if (newStr === null) return;
                      const newVal = parseInt(newStr, 10);
                      if (isNaN(newVal)) {
                        alert("Please enter a valid number of leaves.");
                        return;
                      }
                      
                      try {
                        const resp = await fetch(PROFILE_URL(e.id), {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ total_leaves: newVal })
                        });
                        if (resp.ok) {
                          showToast(`Updated leaves for ${e.name} to ${newVal}!`, "success");
                          fetchAttendance(); // Reload profiles and attendance
                        } else {
                          const err = await resp.json();
                          alert("Failed to update profile: " + (err.error || JSON.stringify(err)));
                        }
                      } catch (err) {
                        alert("Network error: " + err.message);
                      }
                    }}
                    style={{ textAlign: "right", cursor: "pointer", transition: "all 0.2s" }}
                    title="Click to edit leaves balance"
                    onMouseOver={el => el.currentTarget.style.opacity = "0.8"}
                    onMouseOut={el => el.currentTarget.style.opacity = "1"}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.purple, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>    
                      {profiles.find(p => String(p.employee_id).toLowerCase() === String(e.id).toLowerCase())?.total_leaves ?? 16}
                      <span style={{ fontSize: 10, opacity: 0.6 }}>📄</span>
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
                      <span style={{ position: "absolute", top: -6, right: -6, background: T.red, color: "white", fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "2px solid white", fontWeight: 700 }}>{unread}</span>
                    )}
                  </button>
                </div>
              </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "holidays" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24, animation: "slideUp 0.4s ease" }}>
            {/* Create Holiday Card */}
            <div className="premium-card" style={{ padding: "28px 32px", height: "fit-content" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ fontSize: 24 }}>📢</div>
                <h3 className="h-font" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.ink }}>Declare Holiday</h3>
              </div>

              <form onSubmit={handleAddHoliday} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: "uppercase" }}>Holiday Name</label>
                  <input
                    className="adm-inp"
                    style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box" }}
                    placeholder="e.g. Independence Day" 
                    value={newHolidayName}
                    onChange={e => setNewHolidayName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: "uppercase" }}>Date</label>     
                  <input
                    type="date"
                    className="adm-inp"
                    style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box" }}
                    value={newHolidayDate}
                    onChange={e => setNewHolidayDate(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: "uppercase" }}>Description (Optional)</label>
                  <textarea
                    className="adm-inp"
                    style={{ width: "100%", padding: "10px 14px", height: 100, resize: "none", boxSizing: "border-box" }}
                    placeholder="Brief holiday details..." 
                    value={newHolidayDesc}
                    onChange={e => setNewHolidayDesc(e.target.value)}
                  />
                </div>
                
                <button 
                  type="submit" 
                  disabled={savingHoliday}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 16, border: "none",
                    background: `linear-gradient(135deg, ${T.gold} 0%, ${T.accent} 100%)`, 
                    color: "white", cursor: "pointer", fontSize: 14, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    boxShadow: `0 8px 20px ${T.accent}20`, transition: "all 0.2s"
                  }}
                >
                  {savingHoliday ? "Declaring..." : "Declare Holiday"}
                </button>
              </form>
            </div>
            
            {/* Holiday List Card */}
            <div className="premium-card" style={{ padding: "28px 32px" }}>
              <h3 className="h-font" style={{ margin: "0 0 20px 0", fontSize: 18, fontWeight: 700, color: T.ink }}>Declared Holidays</h3>
              
              {holidays.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: T.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>?</div>
                  <div className="h-font" style={{ fontWeight: 700, fontSize: 16 }}>No holidays declared yet</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Declare a holiday using the form on the left.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {holidays.map(h => {
                    const hDate = new Date(h.date);
                    return (
                      <div key={h.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "16px 20px", borderRadius: 16, background: "rgba(0,0,0,0.01)",
                        border: `1px solid ${T.border}`, transition: "all 0.2s"
                      }}>
                        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                          <div style={{
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            width: 50, height: 50, borderRadius: 12, background: T.surface,
                            color: T.accent, fontWeight: 700, textAlign: "center"
                          }}>
                            <div style={{ fontSize: 10, textTransform: "uppercase" }}>{hDate.toLocaleDateString("en-IN", { month: "short" })}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 1 }}>{hDate.getDate()}</div>
                          </div>
                          <div>
                            <div className="h-font" style={{ fontWeight: 700, color: T.ink, fontSize: 15 }}>{h.name}</div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{h.description || "No description"}</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>{hDate.toLocaleDateString("en-IN", { weekday: "long", year: "numeric" })}</div>
                          <button
                            onClick={() => handleDeleteHoliday(h.id)}
                            style={{
                              background: T.redBg, border: "none", color: T.red, cursor: "pointer",
                              width: 32, height: 32, borderRadius: "50%", display: "flex",
                              alignItems: "center", justifyContent: "center", transition: "all 0.2s"
                            }}
                            onMouseOver={btn => btn.currentTarget.style.background = T.red}
                            onMouseOut={btn => btn.currentTarget.style.background = T.redBg}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
    <div className="flex items-center justify-center p-4 min-h-screen">
      <Card className="w-full max-w-md shadow-2xl bg-white/90 backdrop-blur-sm border-none">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon d={icons.lock} size={24} color={T.accent} />
            </div>
          </div>
          <CardTitle className="text-2xl font-black text-center">Reset Password</CardTitle>
          <CardDescription className="text-center">
            Enter your email or username to receive a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {msg && (
            <div className={`p-3 rounded-md text-sm flex gap-3 ${
              msg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              <Icon d={msg.type === "success" ? icons.check : icons.info} size={16} className="mt-0.5" />
              <span>{msg.text}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email or Username</Label>
            <div className="relative">
              <div className="absolute left-3 top-3 text-muted-foreground">
                <Icon d={icons.user} size={16} />
              </div>
              <Input
                id="email"
                placeholder="your.username or email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button 
            className="w-full font-black h-11" 
            onClick={submit} 
            disabled={loading || !!(msg && msg.type === "success")}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-muted-foreground hover:text-primary" 
            onClick={onBack}
          >
            ? Back to Sign In
          </Button>
        </CardFooter>
      </Card>
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
  const [showP, setShowP] = useState(false);
  const [showP2, setShowP2] = useState(false);

  const strength = p.length === 0 ? 0 : p.length < 6 ? 1 : p.length < 10 ? 2 : 3;
  const strengthLabel = ["", "Weak", "Good", "Strong"];
  const strengthColor = ["", "bg-red-500", "bg-amber-500", "bg-green-500"];
  const strengthTextColor = ["", "text-red-500", "text-amber-500", "text-green-500"];

  const submit = async () => {
    if (p !== p2) { setError("Passwords do not match"); return; }
    if (p.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    const ok = await onReset(token, p);
    setLoading(false);
    if (ok) { setSuccess(true); }
    else { setError("Failed to reset. The link may have expired. Please request a new one."); }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center p-4 min-h-screen">
        <Card className="w-full max-w-md shadow-2xl bg-white/90 backdrop-blur-sm border-none text-center p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center border-4 border-green-50">
              <Icon d={icons.check} size={32} color={T.green} stroke={3} />
            </div>
          </div>
          <CardTitle className="text-2xl font-black mb-2">Password Updated!</CardTitle>
          <CardDescription className="mb-8">
            Your password has been reset successfully. you can now sign in with your new password.
          </CardDescription>
          <Button 
            className="w-full font-black h-11" 
            onClick={() => window.location.href = window.location.origin + window.location.pathname}
          >
            Go to Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4 min-h-screen">
      <Card className="w-full max-w-md shadow-2xl bg-white/90 backdrop-blur-sm border-none">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon d={icons.lock} size={24} color={T.accent} />
            </div>
          </div>
          <CardTitle className="text-2xl font-black text-center">New Password</CardTitle>
          <CardDescription className="text-center">
            Choose a strong password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-md text-sm flex gap-3 bg-red-50 text-red-700 border border-red-200">
              <Icon d={icons.info} size={16} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <div className="absolute left-3 top-3 text-muted-foreground">
                <Icon d={icons.lock} size={16} />
              </div>
              <Input
                id="password"
                type={showP ? "text" : "password"}
                placeholder="Enter new password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                className="pl-10 pr-10"
              />
              <button 
                type="button"
                className="absolute right-3 top-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setShowP(!showP)}
              >
                <Icon d={showP ? icons.eyeOff : icons.eye} size={16} />
              </button>
            </div>
            {p.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <div className="flex gap-1 h-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={`flex-1 rounded-full transition-colors ${strength >= i ? strengthColor[strength] : "bg-slate-200"}`} />
                  ))}
                </div>
                <p className={`text-[10px] font-black uppercase tracking-wider ${strengthTextColor[strength]}`}>
                  {strengthLabel[strength]} Security
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <div className="relative">
              <div className="absolute left-3 top-3 text-muted-foreground">
                <Icon d={icons.lock} size={16} />
              </div>
              <Input
                id="confirm-password"
                type={showP2 ? "text" : "password"}
                placeholder="Repeat your new password"
                value={p2}
                onChange={(e) => setP2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className={`pl-10 pr-10 ${p2.length > 0 && (p === p2 ? "border-green-500 focus-visible:ring-green-500" : "border-red-500 focus-visible:ring-red-500")}`}
              />
              <button 
                type="button"
                className="absolute right-3 top-3 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setShowP2(!showP2)}
              >
                <Icon d={showP2 ? icons.eyeOff : icons.eye} size={16} />
              </button>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            className="w-full font-black h-11" 
            onClick={submit} 
            disabled={loading}
          >
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </CardFooter>
      </Card>
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
      if (saved.role === "admin") {
        // Admin credentials are hardcoded — no backend validation needed
        setIsAdmin(true);
      } else if (saved.role === "employee" && saved.data) {
        // For employees, verify the backend server_start_time.
        // If the server was restarted, the time will differ → force re-login.
        fetch(HEALTH_CHECK_URL)
          .then(r => r.json())
          .then(data => {
            const currentStart = data.server_start_time;
            if (currentStart) localStorage.setItem("wt_server_start", currentStart);
            // Restore session regardless of server start time to prevent unexpected signouts
            setEmployee(saved.data);
          })
          .catch(() => {
            // If health check fails (e.g. network error), restore the session
            // so the employee is not locked out during brief connectivity issues.
            setEmployee(saved.data);
          });
      }
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
        // Silently ignore network errors for background version checks
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
            <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>Message Alert</div>
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
            <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>Message Alert</div>
            <div style={{ fontSize: 12, color: T.ink2, opacity: 0.9 }}>{toast.msg}</div>
          </div>
        </div>
      )}
    </>
  );

  const authColors = ["#FF9B00"];

  if (view === "forgot") return <BackgroundPaths colors={authColors} title="Brolly Portal"><ForgotPasswordPage onBack={() => setView("login")} onSendLink={sendResetLink} /></BackgroundPaths>;
  if (view === "reset") return <BackgroundPaths colors={authColors} title="Brolly Portal"><ResetPasswordPage token={resetToken} onReset={resetPassword} /></BackgroundPaths>;

  return (
    <BackgroundPaths colors={authColors} title="Brolly Portal">
      <LoginPage
        onLogin={handleLogin}
        error={error}
        isSyncing={isSyncing}
        onForgot={() => setView("forgot")}
      />
    </BackgroundPaths>
  );
}
