import { useState, useEffect, useRef, useCallback } from 'react';

const PARAGRAPHS = [
  "The quick brown fox jumps over the lazy dog near the sunny creek bed in the Australian outback.",
  "Every great marketing campaign starts with understanding the target audience and their core needs.",
  "Brisbane summers bring warm afternoons and thunderstorms that roll across the city skyline.",
  "Content is king but distribution is queen and she wears the pants in this relationship.",
  "A well-crafted landing page converts visitors into leads faster than any cold outreach strategy.",
  "The barista at the corner cafe knows every regular's coffee order by heart every single morning.",
  "Search engine optimisation requires patience and consistent effort over many months to see results.",
  "Sydney Harbour sparkles under the midday sun as ferries cross between Circular Quay and Manly.",
  "Data-driven decisions always outperform gut feelings when scaling a digital marketing agency.",
  "The team gathered around the whiteboard to brainstorm ideas for the next quarterly content plan.",
  "Social media algorithms change constantly which means marketers must adapt their strategies quickly.",
  "Melbourne laneways hide the best coffee shops restaurants and street art in the entire country.",
  "Email marketing still delivers the highest return on investment of any digital marketing channel.",
  "Koalas sleep up to twenty two hours a day making them one of the sleepiest animals on earth.",
  "A strong brand identity helps businesses stand out in crowded markets and build customer loyalty.",
];

export default function TypingSpeed({ onComplete }) {
  const [paragraph] = useState(() => PARAGRAPHS[Math.floor(Math.random() * PARAGRAPHS.length)]);
  const [typed, setTyped] = useState('');
  const [startTime, setStartTime] = useState(null);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleInput = useCallback((e) => {
    const val = e.target.value;
    if (!startTime) setStartTime(Date.now());
    setTyped(val);

    if (val.length >= paragraph.length) {
      const elapsed = (Date.now() - (startTime || Date.now())) / 60000;
      let errors = 0;
      for (let i = 0; i < paragraph.length; i++) {
        if (val[i] !== paragraph[i]) errors++;
      }
      const accuracy = Math.round(((paragraph.length - errors) / paragraph.length) * 100);
      const rawWpm = Math.round((paragraph.length / 5) / Math.max(elapsed, 0.1));
      const wpm = Math.max(1, rawWpm - (errors * 2));
      setFinished(true);
      onComplete(wpm, wpm, { accuracy, errors, rawWpm });
    }
  }, [paragraph, startTime, onComplete]);

  const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-6">
        <div className="text-[#888882] text-sm font-dm mb-1">Type the text below as fast as you can</div>
        {startTime && !finished && <div className="text-[#F5C518] font-syne text-lg">{elapsed}s</div>}
      </div>

      <div className="bg-[#1A1A1A] rounded-xl p-6 mb-4 border border-[#2A2A2A]">
        <div className="text-lg leading-relaxed font-dm select-none">
          {paragraph.split('').map((char, i) => {
            let color = '#444440';
            if (i < typed.length) {
              color = typed[i] === char ? '#4ADE80' : '#F87171';
            }
            return <span key={i} style={{ color }}>{char}</span>;
          })}
        </div>
      </div>

      <textarea
        ref={inputRef}
        value={typed}
        onChange={handleInput}
        disabled={finished}
        rows={3}
        placeholder="Start typing here..."
        className="w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-xl p-4 text-[#F0EDE6] font-dm text-base focus:outline-none focus:border-[#F5C518] resize-none"
      />
    </div>
  );
}
