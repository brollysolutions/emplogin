/* ══════════════════════════════════════════════════════════════
   Brolly Attendance Portal — Policies, Terms & Conditions
   --------------------------------------------------------------
   Reachable from anywhere in the app via the URL hash:
     #/terms   #/privacy   #/acceptable-use
   App (login.jsx) watches the hash and renders <LegalPage /> above
   every other view, so the documents are readable while signed out
   AND while signed in.

   NOTE FOR MAINTAINERS: the document text lives in ./policy-content.js.
   It is written to match what the system actually does; anything an
   operator may want to change per-deployment (company name, contact,
   office start, leave allotment, retention period) is in the POLICY
   constant at the top of that file. Have the final wording reviewed by
   counsel before it is treated as a binding employment document.
-------------------------------------------------------------- */
import { useEffect } from "react";
import logo from "../assets/brolly_logo_new.jpeg";
import { POLICY, DOCS, ORDER, HASH_FOR } from "./policy-content.js";

/* -- Page ----------------------------------------------------- */
export default function LegalPage({ doc = "terms", onClose }) {
  const key = DOCS[doc] ? doc : "terms";
  const active = DOCS[key];

  useEffect(() => { window.scrollTo(0, 0); }, [key]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-3">
          <img src={logo} alt="Brolly" className="w-9 h-9 object-contain shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black tracking-tight truncate">{POLICY.company}</div>
            <div className="text-[9px] sm:text-[10px] font-black text-gold uppercase tracking-[0.2em]">
              {POLICY.product} {POLICY.version}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border-2 border-slate-100 bg-slate-50 hover:bg-white hover:border-gold px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 transition-all"
          >
            Back
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-5 sm:px-8 pb-3 flex gap-2 overflow-x-auto">
          {ORDER.map((k) => (
            <a
              key={k}
              href={HASH_FOR[k]}
              className={
                "shrink-0 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all " +
                (k === key
                  ? "bg-gradient-to-r from-gold to-amber-600 text-white shadow-lg shadow-gold/20"
                  : "bg-slate-100 text-slate-500 hover:text-slate-900")
              }
            >
              {DOCS[k].label}
            </a>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">{active.title}</h1>
        <p className="text-slate-600 font-semibold leading-relaxed max-w-2xl">{active.summary}</p>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          <span>Effective {POLICY.effectiveDate}</span>
          <span>Last updated {POLICY.lastUpdated}</span>
        </div>

        <div className="mt-10 space-y-9">
          {active.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-base sm:text-lg font-black tracking-tight mb-3">{s.h}</h2>

              {(s.p || []).map((para, i) => (
                <p key={i} className="text-[14px] sm:text-[15px] leading-[1.75] text-slate-700 mb-3">
                  {para}
                </p>
              ))}

              {s.list && (
                <ul className="mt-1 space-y-2">
                  {s.list.map((li, i) => (
                    <li key={i} className="flex gap-3 text-[14px] sm:text-[15px] leading-[1.7] text-slate-700">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
              )}

              {s.note && (
                <div className="mt-4 rounded-2xl border-l-4 border-gold bg-amber-50/60 px-5 py-4 text-[14px] leading-[1.7] text-slate-700 font-semibold">
                  {s.note}
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Cross-links */}
        <div className="mt-14 border-t border-slate-200 pt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Also read</span>
          {ORDER.filter((k) => k !== key).map((k) => (
            <a key={k} href={HASH_FOR[k]} className="text-[12px] font-black text-gold hover:text-amber-600 transition-colors">
              {DOCS[k].label}
            </a>
          ))}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-slate-400 font-semibold">
          These documents describe the {POLICY.product} only and sit alongside your employment contract and applicable law;
          where they conflict, the contract and the law prevail. Questions go to {POLICY.contactEmail}.
        </p>
      </div>
    </div>
  );
}

