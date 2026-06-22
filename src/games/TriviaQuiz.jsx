import { useState, useEffect, useRef } from 'react';

const CATEGORIES = ['Digital Marketing', 'General Knowledge', 'Australian Culture', 'Tech & AI', 'Random'];

export default function TriviaQuiz({ onComplete }) {
  const [category, setCategory] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [loading, setLoading] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState([]);
  const timerRef = useRef(null);

  const generateQuestions = async (cat) => {
    setLoading(true);
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) { alert('API key not set'); return; }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'x-api-key': apiKey,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8', max_tokens: 1500,
          system: 'You are a trivia question generator. Return ONLY valid JSON, no markdown fences.',
          messages: [{ role: 'user', content: `Generate 10 trivia questions for the category: ${cat}.\nReturn a JSON array where each object has:\n- "question": string\n- "options": array of exactly 4 strings\n- "correct_index": number between 0 and 3\n- "explanation": string (one sentence max)` }],
        }),
      });
      const msg = await res.json();
      let raw = msg.content[0].text;
      raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      setQuestions(JSON.parse(raw));
    } catch (err) {
      alert('Error loading questions: ' + err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!questions.length || finished || showAnswer) return;
    setTimeLeft(15);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0.1) { handleAnswer(-1); return 0; }
        return t - 0.1;
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [currentQ, questions.length, finished, showAnswer]);

  const handleAnswer = (idx) => {
    clearInterval(timerRef.current);
    setSelected(idx);
    setShowAnswer(true);
    const q = questions[currentQ];
    const correct = idx === q.correct_index;
    if (correct) setScore(s => s + 10);
    setAnswers(prev => [...prev, { question: q.question, correct, selected: idx, correctIdx: q.correct_index, explanation: q.explanation }]);

    setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        const finalScore = score + (correct ? 10 : 0);
        const perfect = answers.filter(a => a.correct).length + (correct ? 1 : 0) === questions.length;
        const pts = finalScore + (perfect ? 20 : 0);
        setFinished(true);
        onComplete(finalScore, pts, { perfect, answers: [...answers, { correct }] });
      } else {
        setCurrentQ(c => c + 1);
        setSelected(null);
        setShowAnswer(false);
      }
    }, 1500);
  };

  if (!category) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <div className="text-[#F0EDE6] font-syne text-xl font-bold mb-6">Choose a Category</div>
        <div className="grid grid-cols-1 gap-3">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => { setCategory(cat); generateQuestions(cat); }}
              className="bg-[#1A1A1A] border border-[#2A2A2A] text-[#F0EDE6] font-dm text-sm py-4 rounded-xl cursor-pointer hover:border-[#F5C518] transition-colors">
              {cat}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#2A2A2A] border-t-[#F5C518] rounded-full animate-spin mb-4" />
        <div className="text-[#888882] font-dm text-sm">Generating {category} questions...</div>
      </div>
    );
  }

  if (!questions.length) return null;
  const q = questions[currentQ];

  return (
    <div className="max-w-lg mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <div className="text-[#888882] text-sm font-dm">Q{currentQ + 1}/{questions.length}</div>
        <div className="text-[#F0EDE6] font-syne font-bold">Score: {score}</div>
        <div className="w-20 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
          <div className="h-full bg-[#F5C518] rounded-full transition-all" style={{ width: `${(timeLeft / 15) * 100}%` }} />
        </div>
      </div>

      <div className="bg-[#1A1A1A] rounded-xl p-6 border border-[#2A2A2A] mb-4">
        <div className="text-[#F0EDE6] font-dm text-base leading-relaxed">{q.question}</div>
      </div>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          let cls = 'border-[#2A2A2A] hover:border-[#F5C518]';
          if (showAnswer) {
            if (i === q.correct_index) cls = 'border-[#4ADE80] bg-[#4ADE80]/10';
            else if (i === selected) cls = 'border-[#F87171] bg-[#F87171]/10';
            else cls = 'border-[#2A2A2A] opacity-50';
          }
          return (
            <button key={i} onClick={() => !showAnswer && handleAnswer(i)} disabled={showAnswer}
              className={`w-full text-left bg-[#1A1A1A] border-2 ${cls} text-[#F0EDE6] font-dm text-sm py-3 px-4 rounded-xl cursor-pointer transition-all`}>
              <span className="text-[#888882] mr-2">{String.fromCharCode(65 + i)}.</span> {opt}
            </button>
          );
        })}
      </div>

      {showAnswer && q.explanation && (
        <div className="mt-3 text-[#888882] text-sm font-dm bg-[#1A1A1A] rounded-lg p-3 border border-[#2A2A2A]">
          {q.explanation}
        </div>
      )}
    </div>
  );
}
