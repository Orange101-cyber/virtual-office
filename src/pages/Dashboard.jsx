import { Link } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const SCHEDULE_MONTHS = { quarterly: 3, half_yearly: 6, yearly: 12, '2_years': 24 };

function isOverdue(p) {
  let interval = SCHEDULE_MONTHS[p.refresh_schedule];
  if (!interval && (p.page_category === 'blog' || p.page_category === 'landing')) interval = 12;
  if (!interval) return false;
  const baseStr = (p.is_refreshed && p.date_refreshed) ? p.date_refreshed : (p.date_published || p.updated_at);
  if (!baseStr) return false;
  const due = new Date(baseStr);
  due.setMonth(due.getMonth() + interval);
  return due < new Date();
}

const TOOLS = [
  {
    name: 'Virtual Office',
    description: 'Team games hub with live leaderboards. Compete, earn points, and win the monthly prize.',
    path: '/virtual-office-games',
    icon: '🎮',
  },
  {
    name: 'Clients',
    description: 'Per-client hub with all content, ads, briefs, and activity in one place. The single source of truth per client.',
    path: '/clients',
    icon: '👥',
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
  {
    name: 'Ads Hub',
    description: 'Ad copy inspiration, creative briefs, copy library, and brand voice management for all clients.',
    path: '/ads-hub',
    icon: '📣',
  },
];

export default function Dashboard() {
  const [overduePages, setOverduePages] = useState([]);

  useEffect(() => {
    supabase.from('client_pages').select('id, client_name, page_category, url, focus_keyword, refresh_schedule, date_published, date_refreshed, is_refreshed, updated_at')
      .then(({ data }) => {
        if (!data) return;
        setOverduePages(data.filter(isOverdue));
      })
      .catch(() => {});
  }, []);

  const byClient = useMemo(() => {
    const grouped = {};
    overduePages.forEach(p => {
      if (!grouped[p.client_name]) grouped[p.client_name] = 0;
      grouped[p.client_name]++;
    });
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [overduePages]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">CYL Virtual Office</h1>
          <p className="text-sm text-gray-400">Internal tools for the CYL team. Pick a tool to get started.</p>
        </div>

        {overduePages.length > 0 && (
          <Link to="/client-bucket-list" className="no-underline block mb-6">
            <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="text-3xl">⚠</div>
                <div className="flex-1">
                  <div className="text-[10px] font-bold uppercase text-red-600 tracking-wider">Refresh Overdue</div>
                  <div className="text-sm font-bold text-[#1a1a1a]">
                    {overduePages.length} page{overduePages.length === 1 ? '' : 's'} due for refresh across {byClient.length} client{byClient.length === 1 ? '' : 's'}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    {byClient.slice(0, 4).map(([name, count]) => `${name} (${count})`).join(' · ')}
                    {byClient.length > 4 ? ` + ${byClient.length - 4} more` : ''}
                  </div>
                </div>
                <div className="text-[11px] font-bold text-red-600 uppercase">Review →</div>
              </div>
            </div>
          </Link>
        )}

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
