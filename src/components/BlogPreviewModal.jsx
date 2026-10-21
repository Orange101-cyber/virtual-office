import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import * as imageGen from '../lib/imageGen';
import toast from 'react-hot-toast';

// Visual blog-layout preview for a generated article: parses the article into a
// title + intro + sections, then generates a hero and per-section images (fal.ai)
// so the team can see how the finished blog would look with graphics.

const STYLE = 'clean modern editorial photography, bright natural light, professional, high detail, no text, no watermark, no words';

function parseArticle(text = '', fallbackTitle = '') {
  // Each block keeps its lines so bullet / numbered lists survive.
  const blocks = [];
  let cur = [];
  for (const ln of text.split(/\n/)) {
    if (ln.trim() === '') { if (cur.length) { blocks.push(cur); cur = []; } }
    else cur.push(ln.trim());
  }
  if (cur.length) blocks.push(cur);
  const joined = (b) => b.join(' ').trim();

  let title = fallbackTitle || '';
  let start = 0;
  if (blocks[0] && /^#\s/.test(joined(blocks[0]))) { title = joined(blocks[0]).replace(/^#+\s*/, ''); start = 1; }
  else if (blocks[0] && joined(blocks[0]).length <= 90) { title = title || joined(blocks[0]); start = 1; }

  const isListLine = (l) => /^(•|-|\*|\d{1,2}[.)])\s+/.test(l);
  const isHeading = (b) => b.length === 1 && !isListLine(b[0]) && !/^(Q|A):/i.test(b[0])
    && (/^#{1,3}\s/.test(b[0]) || (b[0].length <= 70 && !/[.!?:,]$/.test(b[0]) && b[0].split(' ').length <= 11 && !/^[a-z]/.test(b[0])));

  const intro = [];
  const sections = [];
  let currentSection = null;
  for (let i = start; i < blocks.length; i++) {
    const b = blocks[i];
    if (isHeading(b)) { currentSection = { heading: b[0].replace(/^#+\s*/, ''), body: [] }; sections.push(currentSection); }
    else if (currentSection) currentSection.body.push(b);
    else intro.push(b);
  }
  return { title: title || 'Untitled Article', intro, sections };
}

// Minimal inline markdown → JSX (bold only).
function Inline({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
    ? <strong key={i} className="text-[#1a1a1a]">{p.slice(2, -2)}</strong>
    : <span key={i}>{p}</span>);
}

// A paragraph, or a bulleted / numbered list when its lines are list items.
function Block({ lines }) {
  const bullet = /^(•|-|\*)\s+/, numbered = /^\d{1,2}[.)]\s+/;
  const items = lines.filter(l => bullet.test(l) || numbered.test(l));
  if (items.length >= 2 && items.length >= lines.length - 1) {
    const lead = lines.length > items.length ? lines[0] : null;
    const ordered = items.every(l => numbered.test(l));
    const List = ordered ? 'ol' : 'ul';
    return <>
      {lead && <p className="text-[15px] text-gray-700 leading-[1.75] mb-2"><Inline text={lead} /></p>}
      <List className={`${ordered ? 'list-decimal' : 'list-disc'} pl-6 mb-4 space-y-1 text-[15px] text-gray-700 leading-[1.6]`}>
        {items.map((l, i) => <li key={i}><Inline text={l.replace(bullet, '').replace(numbered, '')} /></li>)}
      </List>
    </>;
  }
  return <p className="text-[15px] text-gray-700 leading-[1.75] mb-4"><Inline text={lines.join(' ')} /></p>;
}

export default function BlogPreviewModal({ open, onClose, article, title, client }) {
  const parsed = useMemo(() => parseArticle(article || '', title || ''), [article, title]);
  const [hero, setHero] = useState('');
  const [secImgs, setSecImgs] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [refs, setRefs] = useState([]);

  useEffect(() => {
    if (!open) { setHero(''); setSecImgs({}); setProgress(''); return; }
    if (client) supabase.from('client_blog_reference').select('file_name, url').eq('client_name', client)
      .then(({ data }) => setRefs(data || []));
  }, [open, client]);

  if (!open) return null;

  const heroPrompt = `Wide hero banner image for a blog article titled "${parsed.title}"${client ? ` for ${client}` : ''}. ${STYLE}`;
  const secPrompt = (h) => `Editorial photo illustrating "${h}", part of an article about ${parsed.title}. ${STYLE}`;

  const generate = async () => {
    if (!imageGen.isConfigured()) return toast.error('Fal.ai key not configured (VITE_FAL_API_KEY)');
    setBusy(true);
    try {
      setProgress('Creating hero image…');
      const h = await imageGen.generateImage(heroPrompt, { width: 1216, height: 832 });
      setHero(h.url);
      const secs = parsed.sections.slice(0, 4);
      for (let i = 0; i < secs.length; i++) {
        setProgress(`Section image ${i + 1} of ${secs.length}…`);
        const img = await imageGen.generateImage(secPrompt(secs[i].heading), { width: 1024, height: 768 });
        setSecImgs(prev => ({ ...prev, [i]: img.url }));
      }
      toast.success('Blog layout ready');
    } catch (e) { toast.error('Image gen failed: ' + e.message); }
    setBusy(false); setProgress('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="px-5 py-2.5 border-b border-gray-200 flex items-center gap-3 shrink-0 bg-[#fafafa]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#8b5cf6]">Blog Layout Preview</div>
          {refs.length > 0 && (
            <a href={refs[0].url} target="_blank" rel="noreferrer" className="text-[10px] text-gray-400 hover:text-[#F5C518] no-underline">
              📄 Style ref: {refs[0].file_name}
            </a>
          )}
          <button onClick={generate} disabled={busy}
            className="ml-auto bg-[#8b5cf6] text-white border-none rounded px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:bg-[#7c3aed] disabled:opacity-40">
            {busy ? (progress || 'Generating…') : hero ? '↻ Regenerate images' : '✨ Generate images'}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1a1a1a] bg-transparent border-none text-xl cursor-pointer leading-none">×</button>
        </div>

        {/* The mock blog page */}
        <div className="overflow-y-auto">
          <article className="max-w-2xl mx-auto px-6 py-8">
            {/* Hero */}
            <div className="rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-purple-100 to-gray-100 aspect-[16/10] flex items-center justify-center relative">
              {hero ? <img src={hero} alt="" className="w-full h-full object-cover" />
                : <div className="text-[11px] text-gray-400">{busy ? progress : 'Hero image will appear here'}</div>}
            </div>

            {client && <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8b5cf6] mb-2">{client} · Blog</div>}
            <h1 className="text-[30px] font-bold text-[#1a1a1a] leading-tight mb-4">{parsed.title}</h1>

            {parsed.intro.map((b, i) => <Block key={i} lines={b} />)}

            {parsed.sections.map((s, i) => (
              <section key={i} className="mt-8">
                <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-3">{s.heading}</h2>
                {i < 4 && (
                  <div className="rounded-lg overflow-hidden mb-4 bg-gray-100 aspect-[16/9] flex items-center justify-center">
                    {secImgs[i] ? <img src={secImgs[i]} alt="" className="w-full h-full object-cover" />
                      : <div className="text-[10px] text-gray-300">{busy ? 'generating…' : 'image'}</div>}
                  </div>
                )}
                {s.body.map((b, j) => <Block key={j} lines={b} />)}
              </section>
            ))}

            {parsed.sections.length === 0 && parsed.intro.length === 0 && (
              <div className="text-[12px] text-gray-400 text-center py-10">Generate an article first, then preview it here.</div>
            )}
          </article>
          <div className="text-center text-[10px] text-gray-400 pb-6">Visual mockup · images are AI-generated placeholders to show layout</div>
        </div>
      </div>
    </div>
  );
}
