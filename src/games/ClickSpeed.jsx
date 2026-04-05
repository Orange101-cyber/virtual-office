import { useState, useEffect, useRef } from 'react';

export default function ClickSpeed({ onComplete }) {
  const [clicks, setClicks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (started && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(t => t - 0.1), 100);
    } else if (timeLeft <= 0 && started) {
      setFinished(true);
      onComplete(clicks, clicks);
    }
    return () => clearTimeout(timerRef.current);
  }, [started, timeLeft]);

  const handleClick = () => {
    if (finished) return;
    if (!started) setStarted(true);
    setClicks(c => c + 1);
  };

  const pct = (timeLeft / 10) * 100;
  const circumference = 2 * Math.PI * 80;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="text-[#888882] text-sm font-dm mb-8">
        {!started ? 'Click the button to start!' : `${Math.max(0, timeLeft).toFixed(1)}s remaining`}
      </div>

      <div className="relative mb-8">
        <svg width="200" height="200" className="absolute -top-2 -left-2">
          <circle cx="100" cy="100" r="80" fill="none" stroke="#2A2A2A" strokeWidth="4" />
          <circle cx="100" cy="100" r="80" fill="none" stroke="#F5C518" strokeWidth="4"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 100 100)"
            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
          />
        </svg>
        <button
          onClick={handleClick}
          disabled={finished}
          className="w-48 h-48 rounded-full bg-[#F5C518] text-[#0E0E0E] font-syne font-bold text-5xl border-none cursor-pointer hover:bg-[#C49E10] active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed relative z-10"
        >
          {clicks}
        </button>
      </div>

      <div className="text-[#F0EDE6] font-syne text-2xl">
        {clicks} click{clicks !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
