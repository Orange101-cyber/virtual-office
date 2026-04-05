import { Link } from 'react-router-dom';

const TOOLS = [
  {
    name: 'Virtual Office',
    description: 'Team games hub with live leaderboards. Compete, earn points, and win the monthly prize.',
    path: '/virtual-office-games',
    icon: '🎮',
    status: 'live',
    external: false,
  },
  {
    name: 'SEO Blog Checker',
    description: 'Run AI-powered SEO audits on blog posts. 55-item checklist across 10 categories with automated analysis.',
    path: '/seo-checker',
    icon: '🔍',
    status: 'live',
    external: false,
  },
  {
    name: 'Client Dashboard',
    description: 'Performance reporting and analytics for CYL clients.',
    path: '/client-dashboard',
    icon: '📊',
    status: 'live',
    external: false,
  },
  {
    name: 'Content Planner',
    description: 'Per-client content plans with Kanban board. Track every piece from Planned through to Complete.',
    path: '/content-planner',
    icon: '📅',
    status: 'live',
    external: false,
  },
  {
    name: 'Brief Generator',
    description: 'AI-powered content briefs from a keyword and title. Generates H2 structure, FAQs, internal links and SEO checklist.',
    path: '/brief-generator',
    icon: '📝',
    status: 'live',
    external: false,
  },
  {
    name: 'Keyword Research',
    description: 'AI first-pass keyword brainstorm per client niche. Get 10-15 keyword ideas with intent, titles and quick wins.',
    path: '/keyword-research',
    icon: '🔑',
    status: 'live',
    external: false,
  },
  {
    name: 'Article Writer',
    description: 'AI writes full articles from your briefs, matched to each client\'s writing style from past content.',
    path: '/article-writer',
    icon: '✍️',
    status: 'live',
    external: false,
  },
];

const BASE = '/virtual-office';

export default function Dashboard() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">CYL Virtual Office</h1>
          <p className="text-sm text-gray-400">Internal tools for the CYL team. Pick a tool to get started.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => {
            const Card = (
              <div
                key={tool.name}
                className={`bg-white border border-gray-200 rounded-lg p-5 transition-all ${
                  tool.path
                    ? 'hover:border-[#F5C518] hover:shadow-md cursor-pointer'
                    : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl">{tool.icon}</div>
                  <span className="text-[9px] font-bold uppercase bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                    Live
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">{tool.name}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{tool.description}</p>
              </div>
            );

            if (tool.external) {
              return (
                <a key={tool.name} href={`${BASE}${tool.path}`} className="no-underline">
                  {Card}
                </a>
              );
            }

            return (
              <Link key={tool.name} to={tool.path} className="no-underline">
                {Card}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
