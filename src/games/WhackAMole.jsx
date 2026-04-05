import { useState, useEffect, useRef, useCallback } from 'react';

export default function WhackAMole({ onComplete }) {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [moles, setMoles] = useState(Array(16).fill(false));
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hitCell, setHitCell] = useState(null);
  const timerRef = useRef(null);
  const moleTimerRef = useRef(null);
  const speedRef = useRef(800);

  const spawnMole = useCallback(() => {
    if (finished) return;
    const idx = Math.floor(Math.random() * 16);
    setMoles(prev => { const n = [...prev]; n[idx] = true; return n; });
    setTimeout(() => {
      setMoles(prev => { const n = [...prev]; n[idx] = false; return n; });
    }, speedRef.current);
  }, [finished]);

  useEffect(() => {
    if (!started || finished) return;
    const interval = setInterval(spawnMole, speedRef.current + 200);
    return () => clearInterval(interval);
  }, [started, finished, spawnMole]);

  useEffect(() => {
    if (!started || finished) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0.1) { setFinished(true); return 0; }
        return t - 0.1;
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [started, finished]);

  useEffect(() => {
    if (finished) {
      const pts = Math.max(0, score);
      onComplete(pts, pts);
    }
  }, [finished]);

  const handleWhack = (idx) => {
    if (!started) setStarted(true);
    if (finished) return;
    if (moles[idx]) {
      const newCombo = combo + 1;
      const newMult = newCombo >= 10 ? 2 : newCombo >= 5 ? 1.5 : 1;
      setCombo(newCombo);
      setMultiplier(newMult);
      setScore(s => s + Math.round(1 * newMult));
      setMoles(prev => { const n = [...prev]; n[idx] = false; return n; });
      setHitCell(idx);
      setTimeout(() => setHitCell(null), 200);
      // Speed up every 10 hits
      if ((score + 1) % 10 === 0) speedRef.current = Math.max(400, speedRef.current - 50);
    } else {
      setScore(s => s - 1);
      setCombo(0);
      setMultiplier(1);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6">
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="text-[#F0EDE6] font-syne font-bold text-xl">{score}</div>
        <div className="text-[#888882] text-sm font-dm">
          {!started ? 'Click a mole to start!' : `${Math.max(0, timeLeft).toFixed(1)}s`}
        </div>
        {multiplier > 1 && (
          <div className="text-[#F5C518] font-syne font-bold text-sm">{multiplier}x combo!</div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {moles.map((hasMole, i) => (
          <button
            key={i}
            onClick={() => handleWhack(i)}
            className={`aspect-square rounded-xl border-2 text-2xl flex items-center justify-center transition-all cursor-pointer ${
              hitCell === i ? 'bg-[#F5C518]/20 border-[#F5C518] scale-90' :
              hasMole ? 'bg-[#2A2A2A] border-[#F5C518] scale-105' :
              'bg-[#1A1A1A] border-[#2A2A2A] hover:border-[#444440]'
            }`}
          >
            {hasMole ? '🐹' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
