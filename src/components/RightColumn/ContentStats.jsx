import { useMemo } from 'react';

function analyzeContent(text) {
  if (!text) return null;

  const words = text.split(/\s+/).filter(w => w.match(/[a-zA-Z]/));
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

  // Heading detection (lines that look like headings)
  const lines = text.split('\n').map(l => l.trim());
  const h1s = lines.filter(l => l.match(/^#\s/) || (l.length > 10 && l.length < 100 && !l.endsWith('.'))).length;
  // Count lines that look like H2s (## or short standalone lines)
  const headingLines = lines.filter(l =>
    l.match(/^#{1,3}\s/) ||
    (l.length > 5 && l.length < 80 && !l.endsWith('.') && !l.endsWith(',') && !l.includes('http'))
  );

  // CTA detection
  const ctaCount = (text.match(/\[CTA|Book.*Appraisal|Book.*Call|Contact.*Us|Get.*Started|Learn.*More/gi) || []).length;

  // Link detection
  const linkCount = (text.match(/https?:\/\/[^\s)]+/g) || []).length;

  // Image references
  const imageCount = (text.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)/gi) || []).length +
    (text.match(/\[image|!\[/gi) || []).length;

  const avgParaLen = paragraphs.length ? Math.round(words.length / paragraphs.length) : 0;
  const readTime = Math.max(1, Math.round(words.length / 238));

  return {
    wordCount: words.length,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    headings: headingLines.length,
    avgParaLen,
    readTime,
    ctaCount,
    linkCount,
    imageCount,
  };
}

function StatRow({ label, value, target, unit = '' }) {
  const isGood = target ? value >= target.min && value <= (target.max || Infinity) : true;
  const isBad = target && (value < target.min || (target.max && value > target.max));

  return (
    <div className="flex justify-between text-[11px] py-1 border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${isBad ? 'text-red-500' : isGood ? '' : 'text-orange-500'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}{unit}
      </span>
    </div>
  );
}

export default function ContentStats({ content }) {
  const stats = useMemo(() => analyzeContent(content), [content]);

  if (!stats) {
    return (
      <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
        <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
          Content Stats
        </div>
        <div className="p-3.5 text-[11px] text-gray-400">
          Add article content to see stats.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between">
        <span>Content Stats</span>
        <span className="font-normal normal-case tracking-normal opacity-60">{stats.readTime} min read</span>
      </div>
      <div className="p-3.5">
        <StatRow label="Word Count" value={stats.wordCount} target={{ min: 1000 }} />
        <StatRow label="Paragraphs" value={stats.paragraphs} />
        <StatRow label="Sentences" value={stats.sentences} />
        <StatRow label="Headings (H2/H3)" value={stats.headings} target={{ min: 3 }} />
        <StatRow label="Avg Paragraph Length" value={stats.avgParaLen} unit=" words" target={{ min: 20, max: 80 }} />
        <StatRow label="Links Found" value={stats.linkCount} target={{ min: 2 }} />
        <StatRow label="CTAs Detected" value={stats.ctaCount} target={{ min: 1 }} />
        <StatRow label="Image References" value={stats.imageCount} />
      </div>
    </div>
  );
}
