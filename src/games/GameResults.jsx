import { useState, useEffect } from 'react';

export default function GameResults({ score, pointsEarned, personalBest, newBest, position, isLeader, onPlayAgain, onBack }) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const target = score;
    const duration = 400;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(14,14,14,0.85)' }}>
      <div className="w-full max-w-lg bg-[#1A1A1A] rounded-t-2xl p-8 animate-slide-up border-t border-[#F5C518]/30">
        <div className="text-center mb-6">
          <div className="text-[#888882] text-sm font-dm mb-2">Game Complete</div>
          <div className="text-[72px] font-syne font-bold text-[#F0EDE6] leading-none">
            {displayScore}
          </div>
          {pointsEarned > 0 && (
            <div className="text-[#F5C518] text-lg font-syne font-bold mt-2">+{pointsEarned} pts</div>
          )}
          {pointsEarned === 0 && (
            <div className="text-[#888882] text-sm mt-2">Points cap reached for today</div>
          )}
        </div>

        <div className="space-y-2 mb-6">
          {newBest && (
            <div className="bg-[#F5C518]/10 border border-[#F5C518]/30 rounded-lg px-4 py-2 text-center">
              <span className="text-[#F5C518] font-syne font-bold text-sm">New Personal Best!</span>
            </div>
          )}
          {!newBest && personalBest && (
            <div className="text-center text-[#888882] text-sm">
              Personal best: <span className="text-[#F0EDE6] font-semibold">{personalBest}</span>
              {score < personalBest && <span className="text-[#888882]"> (yours: {score})</span>}
            </div>
          )}
          {position && (
            <div className="text-center text-[#888882] text-sm">
              Leaderboard position: <span className="text-[#F0EDE6] font-bold">#{position}</span>
              {isLeader && <span className="text-[#F5C518] ml-1">You're leading the board!</span>}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onPlayAgain}
            className="flex-1 bg-[#F5C518] text-[#0E0E0E] font-syne font-bold text-sm py-3 rounded-lg hover:bg-[#C49E10] transition-colors cursor-pointer border-none"
          >
            Play Again
          </button>
          <button
            onClick={onBack}
            className="flex-1 bg-transparent border border-[#2A2A2A] text-[#F0EDE6] font-dm text-sm py-3 rounded-lg hover:border-[#F5C518] transition-colors cursor-pointer"
          >
            Back to Office
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  );
}
