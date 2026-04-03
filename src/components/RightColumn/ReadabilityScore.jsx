import { useMemo } from 'react';

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function analyzeReadability(text) {
  if (!text || text.length < 50) return null;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const words = text.split(/\s+/).filter(w => w.match(/[a-zA-Z]/));
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const numSentences = Math.max(sentences.length, 1);
  const numWords = Math.max(words.length, 1);

  // Flesch Reading Ease
  const flesch = 206.835 - (1.015 * (numWords / numSentences)) - (84.6 * (totalSyllables / numWords));
  const fleschClamped = Math.max(0, Math.min(100, Math.round(flesch)));

  // Flesch-Kincaid Grade Level
  const grade = (0.39 * (numWords / numSentences)) + (11.8 * (totalSyllables / numWords)) - 15.59;
  const gradeClamped = Math.max(1, Math.min(20, Math.round(grade * 10) / 10));

  // Average sentence length
  const avgSentenceLen = Math.round(numWords / numSentences);

  // Long sentences (>25 words)
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 25).length;

  return { flesch: fleschClamped, grade: gradeClamped, avgSentenceLen, longSentences, numSentences };
}

function getFleschLabel(score) {
  if (score >= 80) return { label: 'Very Easy', color: '#27ae60' };
  if (score >= 60) return { label: 'Easy / Standard', color: '#27ae60' };
  if (score >= 40) return { label: 'Moderate', color: '#e67e22' };
  if (score >= 20) return { label: 'Difficult', color: '#e74c3c' };
  return { label: 'Very Difficult', color: '#e74c3c' };
}

export default function ReadabilityScore({ content }) {
  const stats = useMemo(() => analyzeReadability(content), [content]);

  if (!stats) {
    return (
      <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
        <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
          Readability
        </div>
        <div className="p-3.5 text-[11px] text-gray-400">
          Add article content to see readability analysis.
        </div>
      </div>
    );
  }

  const { label, color } = getFleschLabel(stats.flesch);

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Readability
      </div>
      <div className="p-3.5">
        {/* Flesch score */}
        <div className="flex items-center gap-3 mb-3">
          <div className="text-[28px] font-bold leading-none" style={{ color }}>
            {stats.flesch}
          </div>
          <div>
            <div className="text-[11px] font-semibold" style={{ color }}>{label}</div>
            <div className="text-[10px] text-gray-400">Flesch Reading Ease</div>
          </div>
        </div>

        {/* Score bar */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all" style={{ width: `${stats.flesch}%`, backgroundColor: color }} />
        </div>

        {/* Details */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Grade Level</span>
            <span className="font-semibold">{stats.grade}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Avg Sentence Length</span>
            <span className={`font-semibold ${stats.avgSentenceLen > 25 ? 'text-red-500' : ''}`}>
              {stats.avgSentenceLen} words
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Long Sentences (&gt;25 words)</span>
            <span className={`font-semibold ${stats.longSentences > 3 ? 'text-orange-500' : 'text-green-600'}`}>
              {stats.longSentences}/{stats.numSentences}
            </span>
          </div>
        </div>

        {/* Tip */}
        <div className="mt-2.5 p-2 bg-[#f8f8f6] rounded text-[10px] text-gray-500 leading-relaxed">
          Aim for 60-80 (easy to read). Blog content for general audiences should be grade 7-9.
        </div>
      </div>
    </div>
  );
}
