import { useState, useRef } from 'react';

const EMOJI_SETS = [
  ['🐶','🐱','🐸','🦊','🐼','🐨','🦁','🐯'],
  ['🍎','🍕','🌮','🍔','🍣','🧁','🍩','🥑'],
  ['🚗','🚀','✈️','🚲','🛵','⛵','🚁','🏎️'],
  ['⚽','🏀','🎾','🏈','🎱','🏐','🏓','🥊'],
  ['🌸','🌻','🌹','🌺','🍀','🌵','🌴','🎋'],
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MemoryMatch({ onComplete }) {
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [finished, setFinished] = useState(false);
  const lockRef = useRef(false);
  const flipTimerRef = useRef(null);

  useEffect(() => {
    const dayIdx = Math.floor(Date.now() / 86400000) % EMOJI_SETS.length;
    const emojis = EMOJI_SETS[dayIdx];
    setCards(shuffle([...emojis, ...emojis].map((emoji, i) => ({ id: i, emoji }))));
  }, []);

  const handleFlip = (idx) => {
    if (lockRef.current || flipped.includes(idx) || matched.has(cards[idx].emoji) || finished) return;
    if (!startTime) setStartTime(Date.now());

    const newFlipped = [...flipped, idx];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      lockRef.current = true;

      if (cards[newFlipped[0]].emoji === cards[newFlipped[1]].emoji) {
        const newMatched = new Set(matched);
        newMatched.add(cards[newFlipped[0]].emoji);
        setMatched(newMatched);
        setFlipped([]);
        lockRef.current = false;

        if (newMatched.size === 8) {
          const totalMoves = moves + 1;
          const pts = totalMoves <= 15 ? 100 : totalMoves <= 25 ? 60 : 30;
          setFinished(true);
          onComplete(totalMoves, pts, { moves: totalMoves, time: Math.round((Date.now() - startTime) / 1000) });
        }
      } else {
        const t = setTimeout(() => { if (!finished) { setFlipped([]); lockRef.current = false; } }, 800);
        flipTimerRef.current = t;
      }
    }
  };

  return (
    <div className="max-w-sm mx-auto py-6">
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="text-[#888882] text-sm font-dm">Moves: <span className="text-[#F0EDE6] font-bold">{moves}</span></div>
        <div className="text-[#888882] text-sm font-dm">Pairs: <span className="text-[#F0EDE6] font-bold">{matched.size}/8</span></div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((card, i) => {
          const isFlipped = flipped.includes(i) || matched.has(card.emoji);
          return (
            <button key={i} onClick={() => handleFlip(i)}
              className={`aspect-square rounded-xl border-2 text-2xl flex items-center justify-center transition-all cursor-pointer ${
                isFlipped
                  ? matched.has(card.emoji) ? 'bg-[#4ADE80]/10 border-[#4ADE80] scale-95' : 'bg-[#F5C518]/10 border-[#F5C518]'
                  : 'bg-[#1A1A1A] border-[#2A2A2A] hover:border-[#444440]'
              }`}>
              {isFlipped ? card.emoji : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
