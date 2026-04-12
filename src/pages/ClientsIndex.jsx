import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';

export default function ClientsIndex() {
  const { clients: dbClients } = useClients();
  const [clientStats, setClientStats] = useState({});

  useEffect(() => {
    if (!dbClients.length) return;
    dbClients.forEach(async (client) => {
      // Count reports
      const { count: reportCount } = await supabase.from('reports')
        .select('id', { count: 'exact' }).eq('client_id', client.id);
      // Count plans
      const { count: planCount } = await supabase.from('content_plans')
        .select('id', { count: 'exact' }).eq('client_name', client.name);
      // Count ad copy
      const { count: adCopyCount } = await supabase.from('ad_copy')
        .select('id', { count: 'exact' }).eq('client_name', client.name);
      // Check if profile exists
      const { data: profile } = await supabase.from('client_brand_voice')
        .select('tone, business_description').eq('client_name', client.name).single();

      setClientStats(prev => ({
        ...prev,
        [client.name]: {
          articles: reportCount || 0,
          plans: planCount || 0,
          adCopy: adCopyCount || 0,
          hasProfile: !!(profile?.tone || profile?.business_description),
        },
      }));
    });
  }, [dbClients]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <Link to="/" className="text-xs text-gray-400 hover:text-[#F5C518] no-underline">← Dashboard</Link>
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1 mt-2">Clients</h1>
          <p className="text-sm text-gray-400">Click a client to view their full activity, content, and ad creatives.</p>
        </div>

        {dbClients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2 opacity-30">👥</div>
            <p className="text-sm">No clients yet. Add one in the SEO Checker.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dbClients.map(client => {
              const stats = clientStats[client.name] || {};
              return (
                <Link key={client.id} to={`/client/${encodeURIComponent(client.name)}`} className="no-underline">
                  <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#F5C518] hover:shadow-md cursor-pointer transition-all h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-2xl">👤</div>
                      {stats.hasProfile ? (
                        <span className="text-[9px] font-bold uppercase bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Profile ✓</span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">Setup needed</span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#1a1a1a] mb-3">{client.name}</h3>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                      <div>
                        <div className="text-[9px] text-gray-400 uppercase">Articles</div>
                        <div className="text-sm font-bold text-[#1a1a1a]">{stats.articles || 0}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-400 uppercase">Plans</div>
                        <div className="text-sm font-bold text-[#1a1a1a]">{stats.plans || 0}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-400 uppercase">Ad Copy</div>
                        <div className="text-sm font-bold text-[#1a1a1a]">{stats.adCopy || 0}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
