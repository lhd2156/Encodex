'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import EncodexFooter from '@/components/shared/EncodexFooter';

/* ─── Animated Security Visual ─── */
function SecurityVisual() {
  return (
    <div className="sec-anim" style={{ width: 340, height: 340, position: 'relative', margin: '0 auto' }}>
      <style>{`
        @keyframes orbit1{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes orbit2{from{transform:rotate(360deg)}to{transform:rotate(0deg)}}
        @keyframes nodeGlow{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.3)}}
        @keyframes shieldFloat{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        @keyframes lockPulse{0%,100%{r:4;opacity:.8}50%{r:6;opacity:1}}
        @keyframes dashFlow{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
        .orbit-ring{animation:orbit1 12s linear infinite;transform-origin:170px 170px}
        .orbit-ring-r{animation:orbit2 16s linear infinite;transform-origin:170px 170px}
        .node{animation:nodeGlow 2.5s ease-in-out infinite}
        .node-d1{animation-delay:.5s}.node-d2{animation-delay:1s}.node-d3{animation-delay:1.5s}.node-d4{animation-delay:2s}
        .shield-center{animation:shieldFloat 4s ease-in-out infinite}
        .dash-path{stroke-dasharray:8 6;animation:dashFlow 3s linear infinite}
      `}</style>
      <svg viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
        {/* Outer dashed orbit */}
        <circle cx="170" cy="170" r="155" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 6" />

        {/* Middle dashed orbit — rotating */}
        <g className="orbit-ring">
          <circle cx="170" cy="170" r="120" stroke="rgba(255,255,255,0.08)" strokeWidth="1" className="dash-path" fill="none" />
          {/* Node on orbit */}
          <circle cx="290" cy="170" r="4" fill="#f97316" className="node node-d1" />
          <circle cx="170" cy="50" r="3" fill="#3b82f6" className="node node-d2" />
        </g>

        {/* Inner orbit — counter-rotating */}
        <g className="orbit-ring-r">
          <circle cx="170" cy="170" r="85" stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" />
          <circle cx="85" cy="170" r="3" fill="#8b5cf6" className="node node-d3" />
          <circle cx="170" cy="255" r="3.5" fill="#f97316" className="node node-d4" />
        </g>

        {/* Center shield */}
        <g className="shield-center" style={{ transformOrigin: '170px 170px' }}>
          {/* Shield shape */}
          <path d="M170 118 L215 140 L215 185 C215 210 195 230 170 240 C145 230 125 210 125 185 L125 140 Z"
            fill="rgba(30,41,59,0.9)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <path d="M170 128 L207 147 L207 183 C207 204 190 221 170 230 C150 221 133 204 133 183 L133 147 Z"
            fill="rgba(15,23,42,0.95)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          {/* Lock icon — centered in shield */}
          <rect x="158" y="168" width="24" height="18" rx="3" fill="#f97316" opacity="0.9" />
          <rect x="163" y="154" width="14" height="16" rx="7" fill="none" stroke="#f97316" strokeWidth="2.5" opacity="0.9" />
          <circle cx="170" cy="177" r="2.5" fill="#0f1729" />
        </g>

        {/* Data particles flowing along paths */}
        <circle r="2" fill="#f97316" opacity="0.6">
          <animateMotion dur="4s" repeatCount="indefinite" path="M170,15 A155,155 0 0,1 325,170" />
        </circle>
        <circle r="1.5" fill="#3b82f6" opacity="0.5">
          <animateMotion dur="5s" repeatCount="indefinite" path="M325,170 A155,155 0 0,1 170,325" />
        </circle>
        <circle r="2" fill="#8b5cf6" opacity="0.4">
          <animateMotion dur="6s" repeatCount="indefinite" path="M170,325 A155,155 0 0,1 15,170" />
        </circle>
      </svg>
    </div>
  );
}

/* ─── Animated Upload Visual ─── */
function UploadVisual() {
  return (
    <div style={{ width: 380, height: 360, position: 'relative', margin: '0 auto' }}>
      <style>{`
        @keyframes fileRise1{0%{transform:translateY(0);opacity:0}8%{opacity:1}75%{opacity:1}100%{transform:translateY(-200px);opacity:0}}
        @keyframes fileRise2{0%{transform:translateY(0);opacity:0}8%{opacity:1}75%{opacity:1}100%{transform:translateY(-200px);opacity:0}}
        @keyframes fileRise3{0%{transform:translateY(0);opacity:0}8%{opacity:1}75%{opacity:1}100%{transform:translateY(-200px);opacity:0}}
        @keyframes vaultGlow{0%,100%{opacity:.5;filter:drop-shadow(0 0 4px rgba(249,115,22,0))}50%{opacity:.8;filter:drop-shadow(0 0 8px rgba(249,115,22,0.15))}}
        @keyframes particleUp{0%{opacity:0;transform:translateY(0)}50%{opacity:.5}100%{opacity:0;transform:translateY(-140px)}}
        .fr1{animation:fileRise1 4s ease-in-out infinite}
        .fr2{animation:fileRise2 4s ease-in-out 1.3s infinite}
        .fr3{animation:fileRise3 4s ease-in-out 2.6s infinite}
        .vg{animation:vaultGlow 3s ease-in-out infinite}
        .pu{animation:particleUp 2.8s ease-out infinite}
        .pu1{animation-delay:.3s}.pu2{animation-delay:.7s}.pu3{animation-delay:1.1s}.pu4{animation-delay:1.5s}.pu5{animation-delay:1.9s}.pu6{animation-delay:2.3s}
      `}</style>
      <svg viewBox="0 0 380 360" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>

        {/* Vault at top — rounded rectangle shape */}
        <g className="vg" style={{ transformOrigin: '190px 55px' }}>
          <rect x="140" y="30" width="100" height="50" rx="12" fill="rgba(15,23,42,0.95)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <rect x="148" y="38" width="84" height="34" rx="8" fill="rgba(30,41,59,0.6)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          {/* Vault lock */}
          <rect x="181" y="48" width="18" height="14" rx="3" fill="#f97316" opacity="0.85" />
          <rect x="185" y="40" width="10" height="10" rx="5" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.85" />
          <circle cx="190" cy="55" r="2" fill="#0f1729" />
          {/* Vault opening indicator — small arrow pointing down */}
          <path d="M185 70 L190 76 L195 70" stroke="rgba(249,115,22,0.4)" strokeWidth="1.5" fill="none" />
        </g>

        {/* Guide lines — subtle dashed */}
        <line x1="190" y1="82" x2="190" y2="310" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4 10" />

        {/* ── PDF Document (center) ── */}
        <g className="fr1" style={{ transformOrigin: '190px 300px' }}>
          {/* Doc shape with corner fold */}
          <rect x="163" y="278" width="54" height="42" rx="3" fill="rgba(30,41,59,0.95)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <path d="M205 278 L217 278 L217 290 Z" fill="rgba(20,30,48,1)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
          <path d="M205 278 L205 290 L217 290" fill="rgba(40,55,80,0.8)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          {/* Text lines */}
          <rect x="170" y="286" width="28" height="2" rx="1" fill="rgba(255,255,255,0.15)" />
          <rect x="170" y="291" width="22" height="2" rx="1" fill="rgba(255,255,255,0.1)" />
          <rect x="170" y="296" width="26" height="2" rx="1" fill="rgba(255,255,255,0.07)" />
          <rect x="170" y="301" width="18" height="2" rx="1" fill="rgba(255,255,255,0.05)" />
          {/* PDF badge */}
          <rect x="170" y="308" width="18" height="8" rx="2" fill="rgba(239,68,68,0.8)" />
          <text x="179" y="314.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="sans-serif">PDF</text>
          {/* Lock badge */}
          <circle cx="207" cy="313" r="6" fill="rgba(249,115,22,0.15)" />
          <rect x="204" y="311" width="6" height="5" rx="1" fill="#f97316" opacity="0.7" />
          <rect x="205" y="308" width="4" height="4" rx="2" fill="none" stroke="#f97316" strokeWidth="0.8" opacity="0.7" />
        </g>

        {/* ── Image file (left) ── */}
        <g className="fr2" style={{ transformOrigin: '120px 295px' }}>
          {/* Image shape */}
          <rect x="93" y="273" width="54" height="42" rx="3" fill="rgba(30,41,59,0.95)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          {/* Mountain/landscape icon */}
          <rect x="100" y="280" width="40" height="24" rx="2" fill="rgba(20,30,50,0.8)" />
          <path d="M100 300 L112 288 L120 294 L130 284 L140 300 Z" fill="rgba(59,130,246,0.2)" />
          <circle cx="132" cy="286" r="3" fill="rgba(251,191,36,0.4)" />
          {/* JPG badge */}
          <rect x="100" y="308" width="18" height="8" rx="2" fill="rgba(59,130,246,0.8)" />
          <text x="109" y="314.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="sans-serif">JPG</text>
          {/* Lock badge */}
          <circle cx="137" cy="308" r="6" fill="rgba(59,130,246,0.15)" />
          <rect x="134" y="306" width="6" height="5" rx="1" fill="#3b82f6" opacity="0.7" />
          <rect x="135" y="303" width="4" height="4" rx="2" fill="none" stroke="#3b82f6" strokeWidth="0.8" opacity="0.7" />
        </g>

        {/* ── Folder (right) ── */}
        <g className="fr3" style={{ transformOrigin: '260px 300px' }}>
          {/* Folder tab at top */}
          <path d="M236 280 L236 276 Q236 274 238 274 L252 274 Q254 274 255 276 L258 280 Z" fill="rgba(16,185,129,0.5)" />
          {/* Folder body */}
          <rect x="233" y="280" width="54" height="36" rx="3" fill="rgba(30,41,59,0.95)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          {/* Files inside folder peek */}
          <rect x="240" y="286" width="34" height="3" rx="1" fill="rgba(255,255,255,0.08)" />
          <rect x="240" y="292" width="28" height="3" rx="1" fill="rgba(255,255,255,0.06)" />
          <rect x="240" y="298" width="32" height="3" rx="1" fill="rgba(255,255,255,0.04)" />
          {/* Folder label */}
          <text x="260" y="313" textAnchor="middle" fill="rgba(16,185,129,0.6)" fontSize="5.5" fontWeight="600" fontFamily="sans-serif">3 files</text>
          {/* Lock badge */}
          <circle cx="279" cy="308" r="6" fill="rgba(16,185,129,0.15)" />
          <rect x="276" y="306" width="6" height="5" rx="1" fill="#10b981" opacity="0.7" />
          <rect x="277" y="303" width="4" height="4" rx="2" fill="none" stroke="#10b981" strokeWidth="0.8" opacity="0.7" />
        </g>

        {/* Rising particles */}
        <circle cx="175" cy="260" r="1.5" fill="#f97316" className="pu" />
        <circle cx="200" cy="250" r="1" fill="#3b82f6" className="pu pu1" />
        <circle cx="155" cy="245" r="1.2" fill="#10b981" className="pu pu2" />
        <circle cx="215" cy="268" r="1" fill="#f97316" className="pu pu3" />
        <circle cx="190" cy="275" r="1.5" fill="#8b5cf6" className="pu pu4" />
        <circle cx="165" cy="255" r="0.8" fill="#3b82f6" className="pu pu5" />
        <circle cx="210" cy="240" r="1" fill="#10b981" className="pu pu6" />
      </svg>
    </div>
  );
}

export default function StartPage() {
  const router = useRouter();

  useEffect(() => {

    // Bidirectional — re-triggers on scroll up
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('vis');
        else e.target.classList.remove('vis');
      }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    setTimeout(() => document.querySelectorAll('[data-a]').forEach((el) => obs.observe(el)), 80);
    return () => { obs.disconnect(); };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900" style={{ overflowX: 'hidden' }}>
      <style>{`
        [data-a]{opacity:0;transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
        [data-a].vis{opacity:1}
        [data-a="u"]{transform:translateY(36px)}[data-a="u"].vis{transform:translateY(0)}
        [data-a="l"]{transform:translateX(-36px)}[data-a="l"].vis{transform:translateX(0)}
        [data-a="r"]{transform:translateX(36px)}[data-a="r"].vis{transform:translateX(0)}
        [data-a="s"]{transform:scale(.9)}[data-a="s"].vis{transform:scale(1)}
        [data-a="f"].vis{}
        .d1{transition-delay:80ms!important}.d2{transition-delay:160ms!important}
        .d3{transition-delay:240ms!important}.d4{transition-delay:340ms!important}
        .d5{transition-delay:440ms!important}
        @keyframes bar-fill{from{width:0}to{width:var(--w)}}
        .bar.vis{animation:bar-fill 1.2s cubic-bezier(.16,1,.3,1) .2s forwards}
        .fc{transition:background .4s,transform .4s cubic-bezier(.16,1,.3,1)}
        .fc:hover{background:rgba(255,255,255,.02)!important;transform:translateY(-2px)}
      `}</style>

      {/* ── NAV — matches /login header exactly ── */}
      <header className="flex-shrink-0 flex justify-between items-center px-3 sm:px-6 md:px-8 lg:px-12 py-3 md:py-4 lg:py-5">
        <div
          onClick={() => router.push('/start')}
          className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 cursor-pointer"
        >
          <div className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-orange-500 flex items-center justify-center">
            <Image
              src="/encodex-logo-lock.svg"
              alt="Encodex"
              width={24}
              height={24}
              className="w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7"
            />
          </div>
          <span className="text-base sm:text-xl md:text-2xl lg:text-[28px] font-semibold tracking-wide text-white">
            Encodex
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push('/login')}
            className="px-2.5 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 md:py-2.5 rounded-lg bg-transparent hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs sm:text-sm md:text-base font-medium transition-colors cursor-pointer border-none"
          >
            Log in
          </button>
          <button
            onClick={() => router.push('/register')}
            className="px-2.5 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 md:py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm md:text-base font-semibold transition-colors cursor-pointer border-none"
          >
            Get started
          </button>
        </div>
      </header>

      {/* ═══════ HERO ═══════ */}
      <section className="relative pt-16 sm:pt-24 md:pt-32 pb-20 sm:pb-28 md:pb-32 min-h-[85vh] flex flex-col justify-center items-center">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(37, 99, 235, 0.07) 0%, transparent 70%)' }} />

        <div className="max-w-2xl mx-auto px-6 text-center relative z-10">
          <p data-a="u" className="text-xs font-medium text-orange-500 tracking-[0.15em] uppercase mb-7">
            End-to-end encrypted storage
          </p>
          <h1 data-a="u" className="d1 text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.06] tracking-tight mb-7">
            Your files.<br />Your keys.<br />
            <span className="text-neutral-500">Your control.</span>
          </h1>
          <p data-a="u" className="d2 text-lg text-neutral-400 leading-relaxed max-w-md mx-auto mb-10">
            Encodex encrypts every file on your device before upload.
            We never see your data — only you hold the keys.
          </p>
          <div data-a="u" className="d3 flex items-center justify-center gap-4">
            <button onClick={() => router.push('/register')}
              className="px-8 py-3.5 bg-orange-500 hover:bg-orange-400 text-white text-base font-semibold rounded-lg transition-all cursor-pointer border-none hover:shadow-lg hover:shadow-orange-500/20 hover:-translate-y-0.5">
              Start for free
            </button>
            <button onClick={() => router.push('/login')}
              className="px-6 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-base font-medium rounded-lg transition-all cursor-pointer border border-neutral-700 hover:border-neutral-600">
              Log in
            </button>
          </div>
        </div>

        <div data-a="u" className="d5 mt-20 flex items-center justify-center gap-10">
          {['AES-256-GCM', 'Zero-knowledge', 'PBKDF2'].map(t => (
            <span key={t} className="text-[11px] text-neutral-600 font-medium tracking-widest uppercase">{t}</span>
          ))}
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div data-a="u" className="max-w-lg mb-14">
            <p className="text-xs font-medium text-orange-500 tracking-[0.12em] uppercase mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight tracking-tight">
              Built for privacy.<br />Designed for simplicity.
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-px rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {[
              { title: 'End-to-end encryption', desc: 'Every file is encrypted on your device before upload using AES-256-GCM. Your encryption keys never leave your browser.', accent: '#f97316' },
              { title: 'Secure sharing', desc: 'Share files through encrypted links with expiration dates. Control exactly who can access your data and for how long.', accent: '#3b82f6' },
              { title: 'Zero-knowledge vault', desc: 'We derive keys from your password locally. Even with full server access, your files remain completely unreadable to us.', accent: '#8b5cf6' },
              { title: 'Access anywhere', desc: 'Your encrypted vault is available from any browser on any device. Upload, organize, preview, and manage your files.', accent: '#10b981' },
            ].map((f, i) => (
              <div key={f.title} data-a="u" className={`fc d${i + 1} bg-neutral-900/80 cursor-default`}
                style={{ padding: 'clamp(1.5rem, 3.5vw, 2.5rem)' }}>
                <div className="w-2 h-2 rounded-full mb-5" style={{ background: f.accent, opacity: 0.7 }} />
                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ SECURITY — animated shield ═══════ */}
      <section id="security" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-px mb-20" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p data-a="l" className="text-xs font-medium text-orange-500 tracking-[0.12em] uppercase mb-3">Security</p>
              <h2 data-a="l" className="d1 text-3xl sm:text-4xl font-bold text-white leading-tight tracking-tight mb-6">
                Encryption that<br />never sleeps
              </h2>
              <p data-a="l" className="d2 text-base text-neutral-400 leading-relaxed mb-8">
                Your password never leaves your device. We derive encryption keys locally using PBKDF2, then wrap per-file keys with your master key. If our servers were compromised, attackers would find only ciphertext.
              </p>

              <div data-a="l" className="d3 flex flex-col gap-5">
                {[
                  { label: 'AES-256-GCM encryption', w: '100%' },
                  { label: 'PBKDF2 key derivation', w: '85%' },
                  { label: 'Per-file random keys', w: '92%' },
                ].map(s => (
                  <div key={s.label}>
                    <span className="text-xs text-neutral-500 block mb-1.5">{s.label}</span>
                    <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <div data-a="f" className="bar d4 h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                        style={{ width: 0, ['--w' as string]: s.w }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Animated security visual */}
            <div data-a="r" className="d2">
              <SecurityVisual />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS — animated upload ═══════ */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-px mb-20" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Animated upload visual */}
            <div data-a="l" className="d1">
              <UploadVisual />
            </div>

            <div>
              <p data-a="r" className="text-xs font-medium text-orange-500 tracking-[0.12em] uppercase mb-3">How it works</p>
              <h2 data-a="r" className="d1 text-3xl sm:text-4xl font-bold text-white leading-tight tracking-tight mb-10">
                Three steps to<br />total privacy
              </h2>

              {[
                { num: '01', title: 'Create your vault', desc: 'Sign up and set a strong password. Encodex derives your encryption keys locally — we never see your password.' },
                { num: '02', title: 'Upload & encrypt', desc: 'Drag and drop files into your vault. Each file is encrypted with a unique key before it ever leaves your browser.' },
                { num: '03', title: 'Share securely', desc: 'Generate expiring share links. Recipients get access without compromising your master encryption.' },
              ].map((step, i) => (
                <div key={step.num} data-a="r" className={`d${i + 2} grid gap-4 py-5 border-b border-neutral-800`}
                  style={{ gridTemplateColumns: '40px 1fr' }}>
                  <span className="text-xl font-bold text-orange-500/30">{step.num}</span>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1.5">{step.title}</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-px mb-16" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }} />
        </div>
        <div data-a="u" className="max-w-lg mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight tracking-tight mb-4">
            Ready to take control?
          </h2>
          <p className="text-base text-neutral-400 leading-relaxed mb-8">
            Join Encodex and experience truly private cloud storage. No credit card required.
          </p>
          <button onClick={() => router.push('/register')}
            className="px-8 py-3.5 bg-orange-500 hover:bg-orange-400 text-white text-base font-semibold rounded-lg transition-all cursor-pointer border-none hover:shadow-lg hover:shadow-orange-500/20 hover:-translate-y-0.5">
            Sign up free →
          </button>
        </div>
      </section>

      <EncodexFooter />
    </div>
  );
}
