import { Link } from 'react-router-dom';

const TOOLS = [
  {
    name: 'Keyword Research',
    description: 'AI first-pass keyword brainstorm per client niche. Get 10-15 keyword ideas with intent, titles and quick wins.',
    path: '/keyword-research',
    icon: '🔑',
    order: 1,
  },
  {
    name: 'Brief Generator',
    description: 'AI-powered content briefs matching the CYL template. Generates SEO title, keywords, meta, H2 structure, FAQs, social posts, and checklist.',
    path: '/brief-generator',
    icon: '📝',
    order: 2,
  },
  {
    name: 'Content Planner',
    description: 'Per-client quarterly content tracking with Kanban board, cannibalization checks, and review export.',
    path: '/content-planner',
    icon: '📅',
    order: 3,
  },
  {
    name: 'Article Writer',
    description: 'AI writes full articles from your briefs, matched to each client\'s writing style from past SEO Checker articles.',
    path: '/article-writer',
    icon: '✍️',
    order: 4,
  },
  {
    name: 'SEO Blog Checker',
    description: 'Run AI-powered SEO audits on blog posts. 55-item checklist, keyword density, schema generator, export report.',
    path: '/seo-checker',
    icon: '🔍',
    order: 5,
  },
];

export default function SEOTools() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Link to="/" className="text-xs text-gray-400 hover:text-[#F5C518] no-underline">← Dashboard</Link>
          </div>
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">SEO Tools</h1>
          <p className="text-sm text-gray-400">The full SEO workflow — research, plan, brief, write, and audit.</p>
        </div>

        {/* Workflow overview */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recommended Workflow</div>
          <div className="flex items-center gap-2 flex-wrap">
            {TOOLS.map((t, i) => (
              <div key={t.name} className="flex items-center gap-2">
                <Link to={t.path} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f8f8f6] rounded-lg hover:bg-[#F5C518]/10 no-underline transition-colors">
                  <span className="text-sm">{t.icon}</span>
                  <span className="text-[11px] font-semibold text-[#1a1a1a]">{t.name}</span>
                </Link>
                {i < TOOLS.length - 1 && <span className="text-gray-300 text-xs">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Tool cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TOOLS.map((tool) => (
            <Link key={tool.name} to={tool.path} className="no-underline">
              <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-[#F5C518] hover:shadow-md cursor-pointer transition-all h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl">{tool.icon}</div>
                    <div className="text-[10px] font-bold text-gray-300 bg-[#f8f8f6] px-1.5 py-0.5 rounded">
                      Step {tool.order}
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                    Live
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">{tool.name}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{tool.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
