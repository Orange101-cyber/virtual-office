import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients } from '../hooks/useClients';
import toast from 'react-hot-toast';

export default function ClientsIndex() {
  const { activeClients, archivedClients, archiveClient, restoreClient } = useClients();
  const [clientStats, setClientStats] = useState({});
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const all = [...activeClients, ...archivedClients];
    if (!all.length) return;
    let cancelled = false;

    const loadStats = async () => {
      // Batch: load all counts in parallel (one query per table, not per client)
      const [reportsRes, plansRes, adCopyRes, profilesRes] = await Promise.all([
        supabase.from('reports').select('client_id'),
        supabase.from('content_plans').select('client_name'),
        supabase.from('ad_copy').select('client_name'),
        supabase.from('client_brand_voice').select('client_name, tone, business_description'),
      ]);
      if (cancelled) return;

      const stats = {};
      all.forEach(client => {
        const articles = (reportsRes.data || []).filter(r => r.client_id === client.id).length;
        const plans = (plansRes.data || []).filter(r => r.client_name === client.name).length;
        const adCopy = (adCopyRes.data || []).filter(r => r.client_name === client.name).length;
        const profile = (profilesRes.data || []).find(r => r.client_name === client.name);
        stats[client.name] = {
          articles,
          plans,
          adCopy,
          hasProfile: !!(profile?.tone || profile?.business_description),
        };
      });
      setClientStats(stats);
    };

    loadStats().catch(console.error);
    return () => { cancelled = true; };
  }, [activeClients, archivedClients]);

  const handleArchive = async (e, client) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Archive "${client.name}"? They'll be moved to the archived section.`)) return;
    try {
      await archiveClient(client.id);
      toast.success(`${client.name} archived`);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleRestore = async (client) => {
    try {
      await restoreClient(client.id);
      toast.success(`${client.name} restored`);
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <Link to="/" className="text-xs text-gray-400 hover:text-[#F5C518] no-underline">← Dashboard</Link>
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1 mt-2">Clients</h1>
          <p className="text-sm text-gray-400">Click a client to view their full activity, content, and ad creatives.</p>
        </div>

        {/* Active clients */}
        {activeClients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2 opacity-30">👥</div>
            <p className="text-sm">No clients yet. Add one in the SEO Checker.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeClients.map(client => (
              <ClientCard
                key={client.id}
                client={client}
                stats={clientStats[client.name] || {}}
                onArchive={(e) => handleArchive(e, client)}
              />
            ))}
          </div>
        )}

        {/* Archived section */}
        {archivedClients.length > 0 && (
          <div className="mt-10">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 bg-transparent border-none cursor-pointer text-gray-400 hover:text-gray-600 mb-4 p-0"
            >
              <span className={`text-[10px] transition-transform ${showArchived ? 'rotate-90' : ''}`}>▶</span>
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Archived Clients ({archivedClients.length})
              </span>
            </button>

            {showArchived && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedClients.map(client => {
                  const stats = clientStats[client.name] || {};
                  return (
                    <div key={client.id} className="bg-gray-50 border border-gray-200 rounded-xl p-5 opacity-70">
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-2xl opacity-40">👤</div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Archived</span>
                          <button
                            onClick={() => handleRestore(client)}
                            className="text-[9px] font-bold uppercase bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full cursor-pointer hover:bg-blue-100"
                          >
                            Restore
                          </button>
                        </div>
                      </div>
                      <h3 className="text-base font-bold text-gray-500 mb-3">{client.name}</h3>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-200">
                        <div>
                          <div className="text-[9px] text-gray-400 uppercase">Articles</div>
                          <div className="text-sm font-bold text-gray-400">{stats.articles || 0}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 uppercase">Plans</div>
                          <div className="text-sm font-bold text-gray-400">{stats.plans || 0}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 uppercase">Ad Copy</div>
                          <div className="text-sm font-bold text-gray-400">{stats.adCopy || 0}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientCard({ client, stats, onArchive }) {
  return (
    <Link to={`/client/${encodeURIComponent(client.name)}`} className="no-underline">
      <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#F5C518] hover:shadow-md cursor-pointer transition-all h-full group">
        <div className="flex items-start justify-between mb-3">
          <div className="text-2xl">👤</div>
          <div className="flex items-center gap-1.5">
            {stats.hasProfile ? (
              <span className="text-[9px] font-bold uppercase bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Profile ✓</span>
            ) : (
              <span className="text-[9px] font-bold uppercase bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">Setup needed</span>
            )}
            <button
              onClick={onArchive}
              className="text-[9px] font-bold uppercase text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Archive this client"
            >
              📥 Archive
            </button>
          </div>
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
}
