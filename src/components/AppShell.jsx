import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAdmin } from '../hooks/useAdmin';

const SEO_TOOLS = [
  { path: '/seo-tools', label: 'SEO Dashboard', icon: '📊' },
  { path: '/seo-chat', label: 'SEO Assistant', icon: '🤖' },
  { path: '/keyword-research', label: 'Keyword Research', icon: '🔑' },
  { path: '/brief-generator', label: 'Brief Generator', icon: '📝' },
  { path: '/content-planner', label: 'Content Planner', icon: '📅' },
  { path: '/article-writer', label: 'Article Writer', icon: '✍️' },
  { path: '/seo-checker', label: 'SEO Checker', icon: '🔍' },
  { path: '/seo-performance', label: 'SEO Performance', icon: '📈' },
  { path: '/rank-tracker', label: 'Rank Tracker', icon: '📊' },
  { path: '/site-auditor', label: 'Site Auditor', icon: '🩺' },
  { path: '/ai-visibility', label: 'AI Visibility', icon: '🤖' },
  { path: '/client-bucket-list', label: 'Client Bucket List', icon: '📋' },
  { path: '/site-health', label: 'Site Health', icon: '🏥' },
];

const ADS_TOOLS = [
  { path: '/client-ad-dashboard', label: 'Client Ad Dashboard', icon: '📊' },
  { path: '/ad-inspiration', label: 'Ad Inspiration', icon: '✨' },
  { path: '/ad-remix', label: 'Ad Remix', icon: '🎨' },
  { path: '/ad-copy-library', label: 'Copy Library', icon: '📋' },
  { path: '/ad-creative-brief', label: 'Creative Brief', icon: '📝' },
];

const VIDEO_TOOLS = [
  { path: '/video-library', label: 'Video Library', icon: '🎬' },
  { path: '/shoot-planner', label: 'Shoot Planner', icon: '📋' },
  { path: '/edit-workflow', label: 'Edit Workflow', icon: '🎞️' },
  { path: '/video-timesheet', label: 'Timesheet', icon: '⏱️' },
];

const CLIENT_TOOLS = [
  { path: '/clients', label: 'All Clients', icon: '👥' },
  { path: '/brand-voice', label: 'Brand Voice', icon: '🎤' },
  { path: '/client-map', label: 'Client Map', icon: '🗺️' },
];

const SEO_PATHS = SEO_TOOLS.map(t => t.path);
const ADS_PATHS = ADS_TOOLS.map(t => t.path);
const CLIENT_PATHS = CLIENT_TOOLS.map(t => t.path);
const VIDEO_PATHS = VIDEO_TOOLS.map(t => t.path);

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/virtual-office-games', label: 'Virtual Office' },
  { path: '/clients', label: 'Clients', dropdown: 'clients' },
  { path: '/client-dashboard', label: 'Performance' },
  { path: '/seo-tools', label: 'SEO Tools', dropdown: 'seo' },
  { path: '/ads-hub', label: 'Ads Hub', dropdown: 'ads' },
  { path: '/video-hub', label: 'Video Hub', dropdown: 'video' },
];

export default function AppShell({ children }) {
  const location = useLocation();
  const [openDropdown, setOpenDropdown] = useState(null);
  const navRef = useRef(null);
  const { isAdmin, currentUser } = useAdmin();

  // Flight Watch is Cameron's personal dashboard, hosted on its own Netlify
  // site (it needs a backend the static Virtual Office can't provide). The tab
  // just links out to it, and only Cameron sees it.
  // NOTE: if you name the Netlify site something other than "cyl-flight-watch",
  // update this URL to match.
  const FLIGHT_WATCH_URL = 'https://cyl-flight-watch.netlify.app';
  const isCameron = currentUser?.email === 'cameron@cylglobal.com';
  const navItems = isCameron
    ? [...NAV_ITEMS, { path: FLIGHT_WATCH_URL, label: '☾ Flight Watch', external: true }]
    : NAV_ITEMS;

  // Close dropdown when clicking outside the nav entirely.
  // Using mousedown so the close fires before navigation on Links.
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  // Close dropdown after navigating to a new page
  useEffect(() => { setOpenDropdown(null); }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isInSeoSection = SEO_PATHS.some(p => location.pathname.startsWith(p)) || location.pathname === '/seo-tools';
  const isInAdsSection = ADS_PATHS.some(p => location.pathname.startsWith(p)) || location.pathname === '/ads-hub';
  const isInClientsSection = CLIENT_PATHS.some(p => location.pathname.startsWith(p)) || location.pathname.startsWith('/client/');
  const isInVideoSection = VIDEO_PATHS.some(p => location.pathname.startsWith(p)) || location.pathname === '/video-hub';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f8f6] text-[#1a1a1a] text-[13px] leading-relaxed">
      {/* Global top bar */}
      <div className="bg-[#1a1a1a] text-white px-4 h-11 flex items-center gap-3 shrink-0 z-10">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <div className="bg-[#F5C518] text-[#1a1a1a] font-bold text-[11px] tracking-wider px-2.5 py-1 rounded-sm uppercase">
            CYL
          </div>
          <div className="text-sm font-semibold text-white">Virtual Office</div>
        </Link>

        {/* Nav links */}
        <nav ref={navRef} className="flex items-center gap-1 ml-4 overflow-x-visible">
          {navItems.map((item) => {
            if (item.dropdown) {
              const toolsMap = { seo: SEO_TOOLS, ads: ADS_TOOLS, clients: CLIENT_TOOLS, video: VIDEO_TOOLS };
              const activeMap = { seo: isInSeoSection, ads: isInAdsSection, clients: isInClientsSection, video: isInVideoSection };
              const tools = toolsMap[item.dropdown] || [];
              const isActive = activeMap[item.dropdown] || false;
              const isOpen = openDropdown === item.dropdown;
              return (
                <div key={item.path} className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDropdown(o => o === item.dropdown ? null : item.dropdown);
                    }}
                    className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer bg-transparent border-none ${
                      isActive
                        ? 'bg-white/10 text-[#F5C518] font-semibold'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                    <span className={`text-[8px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                  </button>

                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl min-w-[180px] py-1 z-50">
                      {tools.map(tool => {
                        const isToolActive = location.pathname.startsWith(tool.path);
                        return (
                          <Link
                            key={tool.path}
                            to={tool.path}
                            onClick={() => setOpenDropdown(null)}
                            className={`flex items-center gap-2 px-3 py-2 text-xs no-underline transition-colors ${
                              isToolActive
                                ? 'bg-white/10 text-[#F5C518] font-semibold'
                                : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span className="text-sm">{tool.icon}</span>
                            {tool.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive =
              item.external
                ? false
                : item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            const className = `px-2.5 py-1 rounded text-xs no-underline transition-colors whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-white/10 text-[#F5C518] font-semibold'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`;

            // External links (e.g. Flight Watch on Netlify) open in a new tab
            if (item.external) {
              return (
                <a key={item.path} href={item.path} target="_blank" rel="noopener noreferrer" className={className}>
                  {item.label}
                </a>
              );
            }

            return (
              <Link key={item.path} to={item.path} className={className}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link to="/admin"
            className={`text-xs no-underline px-2 py-1 rounded ${
              location.pathname === '/admin'
                ? 'bg-white/10 text-[#F5C518] font-semibold'
                : 'text-white/40 hover:text-white/70'
            }`}>
            🔐 Admin
          </Link>
          <button
            onClick={handleLogout}
            className="text-white/40 hover:text-white/70 text-xs border border-white/20 rounded px-2 py-1 cursor-pointer bg-transparent"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
