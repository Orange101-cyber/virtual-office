import { useState } from 'react';
import * as dfs from '../../lib/dataForSeo';
import toast from 'react-hot-toast';

export default function LiveSeoStats({ url, focusKeyphrase }) {
  const [ranking, setRanking] = useState(null);
  const [backlinks, setBacklinks] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    if (!url || !focusKeyphrase) {
      toast.error('URL and Focus Keyphrase are required');
      return;
    }
    if (!dfs.isConfigured()) {
      toast.error('DataForSEO not configured');
      return;
    }
    setLoading(true);
    try {
      let domain = '';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

      const [rank, bl] = await Promise.all([
        domain ? dfs.checkDomainRanking(focusKeyphrase, domain).catch(() => null) : null,
        dfs.getBacklinksSummary(url).catch(() => null),
      ]);

      setRanking(rank);
      setBacklinks(bl);
      toast.success('Live stats loaded');
    } catch (err) {
      toast.error('DataForSEO error: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center">
        <span>Live SEO Stats</span>
        <button
          onClick={handleFetch}
          disabled={loading || !url || !focusKeyphrase}
          className="bg-[#F5C518] text-[#1a1a1a] border-none rounded px-2 py-0.5 text-[9px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40"
        >
          {loading ? 'Fetching...' : 'Fetch'}
        </button>
      </div>
      <div className="p-3.5">
        {!url || !focusKeyphrase ? (
          <div className="text-[11px] text-gray-400">Add a URL and focus keyphrase to fetch live SEO stats.</div>
        ) : !ranking && !backlinks && !loading ? (
          <div className="text-[11px] text-gray-400">
            Click Fetch to pull real Google ranking and backlink data from DataForSEO.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Google Ranking */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Google Ranking</div>
              {ranking ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-600">Position for "{focusKeyphrase}"</span>
                    <span className="font-bold text-xl text-green-600">#{ranking.rank}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 truncate" title={ranking.title}>{ranking.title}</div>
                </div>
              ) : ranking === null && loading === false && backlinks ? (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-[11px] text-orange-600">
                  Not ranking in top 10 yet
                </div>
              ) : (
                <div className="text-[10px] text-gray-400">Not yet fetched</div>
              )}
            </div>

            {/* Backlinks */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Backlinks</div>
              {backlinks ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#f8f8f6] rounded-lg p-2.5">
                    <div className="text-[9px] text-gray-400 uppercase">Total</div>
                    <div className="text-lg font-bold text-[#1a1a1a]">{backlinks.backlinks?.toLocaleString() || 0}</div>
                  </div>
                  <div className="bg-[#f8f8f6] rounded-lg p-2.5">
                    <div className="text-[9px] text-gray-400 uppercase">Ref. Domains</div>
                    <div className="text-lg font-bold text-[#1a1a1a]">{backlinks.referring_domains?.toLocaleString() || 0}</div>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-gray-400">Not yet fetched</div>
              )}
              {backlinks?.first_seen && (
                <div className="text-[9px] text-gray-400 mt-1">
                  First seen: {new Date(backlinks.first_seen).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
