import { useState, useEffect, useCallback } from 'react';

const FALLBACK_WORDS = ['BRAVE','CRANE','PLUMB','STOVE','GRIND','SHOCK','FLINT','CHARM','QUEST','TRICK','BLOOM','DINGO','KOALA','BEACH','PRAWN','FLAME','DRIFT','SCALE','WHEAT','MOUNT'];
const KEYBOARD = [['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L'],['ENTER','Z','X','C','V','B','N','M','DEL']];

export default function WordleGame({ onComplete }) {
  const [answer, setAnswer] = useState('');
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState('');
  const [finished, setFinished] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    // Use a deterministic daily word
    const today = new Date();
    const dayIndex = Math.floor(today.getTime() / 86400000) % FALLBACK_WORDS.length;
    setAnswer(FALLBACK_WORDS[dayIndex]);
  }, []);

  const getLetterStates = useCallback(() => {
    const states = {};
    guesses.forEach(guess => {
      for (let i = 0; i < 5; i++) {
        const letter = guess[i];
        if (letter === answer[i]) states[letter] = 'correct';
        else if (answer.includes(letter) && states[letter] !== 'correct') states[letter] = 'present';
        else if (!states[letter]) states[letter] = 'absent';
      }
    });
    return states;
  }, [guesses, answer]);

  const handleKey = useCallback((key) => {
    if (finished || !answer) return;
    if (key === 'DEL') { setCurrent(c => c.slice(0, -1)); return; }
    if (key === 'ENTER') {
      if (current.length !== 5) { setShake(true); setTimeout(() => setShake(false), 500); return; }
      const newGuesses = [...guesses, current];
      setGuesses(newGuesses);
      setCurrent('');
      if (current === answer) {
        setFinished(true);
        const pts = [50, 40, 30, 20, 10, 5][newGuesses.length - 1] || 5;
        setTimeout(() => onComplete(newGuesses.length, pts, { won: true, guessCount: newGuesses.length }), 500);
      } else if (newGuesses.length >= 6) {
        setFinished(true);
        setTimeout(() => onComplete(0, 0, { won: false, answer }), 500);
      }
      return;
    }
    if (current.length < 5 && key.match(/^[A-Z]$/)) setCurrent(c => c + key);
  }, [current, guesses, answer, finished, onComplete]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Backspace') handleKey('DEL');
      else if (e.key === 'Enter') handleKey('ENTER');
      else if (e.key.match(/^[a-zA-Z]$/)) handleKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  const getCellColor = (guess, i) => {
    if (!guess) return 'border-[#2A2A2A] bg-[#1A1A1A]';
    const letter = guess[i];
    if (letter === answer[i]) return 'border-[#4ADE80] bg-[#4ADE80]/20';
    if (answer.includes(letter)) return 'border-[#F5C518] bg-[#F5C518]/20';
    return 'border-[#444440] bg-[#2A2A2A]';
  };

  const letterStates = getLetterStates();

  return (
    <div className="max-w-sm mx-auto py-6">
      {/* Grid */}
      <div className="space-y-1.5 mb-6">
        {Array.from({ length: 6 }, (_, row) => {
          const guess = guesses[row];
          const isCurrentRow = row === guesses.length && !finished;
          return (
            <div key={row} className={`flex gap-1.5 justify-center ${isCurrentRow && shake ? 'animate-shake' : ''}`}>
              {Array.from({ length: 5 }, (_, col) => {
                const letter = guess ? guess[col] : isCurrentRow ? current[col] : '';
                return (
                  <div key={col} className={`w-14 h-14 border-2 rounded-lg flex items-center justify-center font-syne font-bold text-xl text-[#F0EDE6] transition-colors ${getCellColor(guess, col)}`}>
                    {letter || ''}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Keyboard */}
      <div className="space-y-1">
        {KEYBOARD.map((row, ri) => (
          <div key={ri} className="flex gap-1 justify-center">
            {row.map(key => {
              const state = letterStates[key];
              let bg = 'bg-[#2A2A2A] hover:bg-[#444440]';
              if (state === 'correct') bg = 'bg-[#4ADE80]/30';
              else if (state === 'present') bg = 'bg-[#F5C518]/30';
              else if (state === 'absent') bg = 'bg-[#1A1A1A]';
              return (
                <button key={key} onClick={() => handleKey(key)}
                  className={`${bg} text-[#F0EDE6] font-dm text-sm font-semibold rounded-md border-none cursor-pointer transition-colors ${
                    key.length > 1 ? 'px-3 py-3' : 'w-9 py-3'
                  }`}>
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {finished && !guesses.includes(answer) && (
        <div className="text-center mt-4 text-[#F87171] text-sm font-dm">
          The word was: <span className="font-bold text-[#F0EDE6]">{answer}</span>
        </div>
      )}

      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} } .animate-shake{animation:shake 0.3s ease-in-out}`}</style>
    </div>
  );
}
