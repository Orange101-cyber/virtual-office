import { useMemo, useState } from 'react';

function detectFAQs(content) {
  if (!content) return [];

  const faqs = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect questions (ends with ? or starts with common question patterns)
    if (line.endsWith('?') || /^(what|how|why|when|where|who|is|are|can|do|does|will|should)/i.test(line)) {
      if (line.endsWith('?')) {
        // Next non-empty line(s) are the answer
        let answer = '';
        for (let j = i + 1; j < lines.length && j < i + 5; j++) {
          if (lines[j].endsWith('?') || lines[j].length < 10) break;
          answer += (answer ? ' ' : '') + lines[j];
        }
        if (answer.length > 20) {
          faqs.push({ question: line, answer });
        }
      }
    }
  }

  return faqs;
}

export default function SchemaGenerator({ content, title, url }) {
  const [copied, setCopied] = useState(false);
  const [customFaqs, setCustomFaqs] = useState('');

  const detectedFaqs = useMemo(() => detectFAQs(content), [content]);

  // Parse custom FAQs (Q: ... A: ... format)
  const parsedCustom = useMemo(() => {
    if (!customFaqs.trim()) return [];
    const pairs = [];
    const parts = customFaqs.split(/\n/).filter(l => l.trim());
    let currentQ = '';
    for (const line of parts) {
      if (line.match(/^Q:/i)) {
        if (currentQ) pairs.push({ question: currentQ, answer: '' });
        currentQ = line.replace(/^Q:\s*/i, '').trim();
      } else if (line.match(/^A:/i) && currentQ) {
        pairs.push({ question: currentQ, answer: line.replace(/^A:\s*/i, '').trim() });
        currentQ = '';
      }
    }
    return pairs.filter(p => p.question && p.answer);
  }, [customFaqs]);

  const allFaqs = [...detectedFaqs, ...parsedCustom];

  // Generate Article schema
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title || '',
    url: url || '',
    author: { '@type': 'Person', name: 'Luke O\'Kelly' },
    publisher: { '@type': 'Organization', name: 'Campaigns You Love' },
  };

  // Generate FAQ schema
  const faqSchema = allFaqs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allFaqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  } : null;

  const fullSchema = faqSchema
    ? JSON.stringify([articleSchema, faqSchema], null, 2)
    : JSON.stringify(articleSchema, null, 2);

  const scriptTag = `<script type="application/ld+json">\n${fullSchema}\n</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Schema Markup Generator
      </div>
      <div className="p-3.5">
        {/* Detected FAQs */}
        {detectedFaqs.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-green-600 mb-1">
              ✓ {detectedFaqs.length} FAQ(s) auto-detected
            </div>
            {detectedFaqs.map((faq, i) => (
              <div key={i} className="text-[10px] text-gray-500 mb-0.5 truncate" title={faq.question}>
                Q: {faq.question}
              </div>
            ))}
          </div>
        )}

        {/* Custom FAQs */}
        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
          Add custom FAQs (Q: / A: format)
        </label>
        <textarea
          value={customFaqs}
          onChange={(e) => setCustomFaqs(e.target.value)}
          rows={3}
          placeholder={"Q: What is real estate west end?\nA: Real estate west end refers to..."}
          className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] bg-[#f8f8f6] resize-y focus:outline-none focus:border-[#F5C518] mb-2"
        />

        {/* Schema preview */}
        <div className="bg-[#1a1a1a] rounded p-2 mb-2 max-h-32 overflow-y-auto">
          <pre className="text-[9px] text-green-400 whitespace-pre-wrap font-mono leading-relaxed">
            {scriptTag}
          </pre>
        </div>

        <button
          onClick={handleCopy}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-[#e6b800] w-full"
        >
          {copied ? '✓ Copied!' : 'Copy Schema to Clipboard'}
        </button>
      </div>
    </div>
  );
}
