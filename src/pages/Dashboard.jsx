import { Link } from 'react-router-dom';

const TOOLS = [
  {
    name: 'Virtual Office',
    description: 'The CYL pixel-art virtual office. Hang out, collaborate, and vibe with the team.',
    path: '/office/',
    icon: '🏢',
    status: 'live',
    external: true,
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
    path: null,
    icon: '📊',
    status: 'coming',
    external: false,
  },
  {
    name: 'Content Calendar',
    description: 'Plan and schedule blog posts, social content, and campaigns across all clients.',
    path: null,
    icon: '📅',
    status: 'coming',
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
                  {tool.status === 'live' ? (
                    <span className="text-[9px] font-bold uppercase bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                      Live
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                      Coming Soon
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">{tool.name}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{tool.description}</p>
              </div>
            );

            if (!tool.path) {
              return <div key={tool.name}>{Card}</div>;
            }

            // External links (static pages like the office) use <a>, React routes use <Link>
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
