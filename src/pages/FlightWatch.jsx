import { useState, useEffect, useRef, useCallback } from 'react';

// Balmoral Flight Watch — Cameron's personal flight/wind dashboard.
// Gated behind a 4-digit PIN. This is a low-stakes hobby dashboard on a static
// host (GitHub Pages), so the PIN check is client-side — it keeps casual eyes
// out, it is not meant to protect sensitive data.
const PIN = '1954';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

export default function FlightWatch() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem('flightWatchUnlocked') === 'true'
  );

  const handleUnlock = useCallback(() => {
    sessionStorage.setItem('flightWatchUnlocked', 'true');
    setUnlocked(true);
  }, []);

  const handleLock = useCallback(() => {
    sessionStorage.removeItem('flightWatchUnlocked');
    setUnlocked(false);
  }, []);

  if (!unlocked) return <PinGate onUnlock={handleUnlock} />;

  return (
    <div className="relative w-full h-full bg-[#F4F0E8]">
      <iframe
        title="Balmoral Flight Watch"
        src={`${import.meta.env.BASE_URL}flight-watch/dashboard.html`}
        className="w-full h-full border-0 block"
        allow="autoplay"
      />
      {/* Lock button — clears the session and re-prompts for the PIN */}
      <button
        onClick={handleLock}
        title="Lock Flight Watch"
        className="absolute bottom-3 left-3 z-[9999] bg-[#1A2230]/85 text-[#F4F0E8] border-none rounded-full w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-[#1A2230] shadow-lg text-sm"
      >
        🔒
      </button>
    </div>
  );
}

function PinGate({ onUnlock }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputs = useRef([]);

  const isLocked = lockedUntil > now;
  const secondsLeft = Math.ceil((lockedUntil - now) / 1000);

  // Tick while locked so the countdown updates
  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isLocked]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const reset = useCallback(() => {
    setDigits(['', '', '', '']);
    inputs.current[0]?.focus();
  }, []);

  const submit = useCallback((code) => {
    if (code === PIN) {
      onUnlock();
      return;
    }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    if (nextAttempts >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_MS);
      setNow(Date.now());
      setAttempts(0);
      setError(`Too many attempts — locked for 60s`);
    } else {
      setError('Incorrect');
    }
    reset();
  }, [attempts, onUnlock, reset]);

  const handleChange = (i, val) => {
    if (isLocked) return;
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    setError('');
    if (digit && i < 3) {
      inputs.current[i + 1]?.focus();
    }
    // Auto-submit when all four are filled
    if (digit && i === 3) {
      const code = next.join('');
      if (code.length === 4) setTimeout(() => submit(code), 80);
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: '#F4F0E8', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: '44px',
          color: '#1A2230',
          letterSpacing: '-0.01em',
        }}
      >
        Enter PIN
      </div>
      <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px', marginBottom: '28px' }}>
        Balmoral · Flight Watch
      </div>

      <div
        className={shake ? 'fw-shake' : ''}
        style={{ display: 'flex', gap: '14px' }}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            disabled={isLocked}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            style={{
              width: '58px',
              height: '72px',
              textAlign: 'center',
              fontSize: '32px',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#1A2230',
              background: '#fff',
              border: '2px solid rgba(26,34,48,0.12)',
              borderRadius: '12px',
              outline: 'none',
              caretColor: '#3E6B6B',
              opacity: isLocked ? 0.5 : 1,
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3E6B6B')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(26,34,48,0.12)')}
          />
        ))}
      </div>

      <div style={{ height: '22px', marginTop: '16px' }}>
        {isLocked ? (
          <span style={{ color: '#B5503C', fontSize: '13px', fontWeight: 500 }}>
            Locked — try again in {secondsLeft}s
          </span>
        ) : error ? (
          <span style={{ color: '#B5503C', fontSize: '13px', fontWeight: 500 }}>{error}</span>
        ) : null}
      </div>

      <button
        onClick={() => alert('To reset the PIN, update it in the FlightWatch.jsx source (PIN constant) and redeploy.')}
        style={{
          marginTop: '20px',
          background: 'transparent',
          border: 'none',
          color: '#6b7280',
          fontSize: '12px',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Forgot?
      </button>

      <style>{`
        @keyframes fwShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .fw-shake { animation: fwShake 0.5s ease; }
      `}</style>
    </div>
  );
}
