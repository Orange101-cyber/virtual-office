import { Link } from 'react-router-dom';

const TOOLS = [
  {
    name: 'Virtual Office',
    description: 'Team games hub with live leaderboards. Compete, earn points, and win the monthly prize.',
    path: '/virtual-office-games',
    icon: '🎮',
  },
  {
    name: 'Client Dashboard',
    description: 'Performance reporting and analytics for CYL clients.',
    path: '/client-dashboard',
    icon: '📊',
  },
  {
    name: 'SEO Tools',
    description: 'The complete SEO workflow — keyword research, content planning, briefs, article writing, and audits.',
    path: '/seo-tools',
    icon: '🛠️',
  },
];

export default function Dashboard() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">CYL Virtual Office</h1>
          <p className="text-sm text-gray-400">Internal tools for the CYL team. Pick a tool to get started.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => (
            <Link key={tool.name} to={tool.path} className="no-underline">
              <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-[#F5C518] hover:shadow-md cursor-pointer transition-all h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl">{tool.icon}</div>
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
