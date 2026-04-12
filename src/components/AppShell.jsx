import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SEO_TOOLS = [
  { path: '/keyword-research', label: 'Keyword Research', icon: '🔑' },
  { path: '/brief-generator', label: 'Brief Generator', icon: '📝' },
  { path: '/content-planner', label: 'Content Planner', icon: '📅' },
  { path: '/article-writer', label: 'Article Writer', icon: '✍️' },
  { path: '/seo-checker', label: 'SEO Checker', icon: '🔍' },
];

const ADS_TOOLS = [
  { path: '/ad-inspiration', label: 'Ad Inspiration', icon: '✨' },
  { path: '/ad-copy-library', label: 'Copy Library', icon: '📋' },
  { path: '/ad-creative-brief', label: 'Creative Brief', icon: '🎨' },
  { path: '/brand-voice', label: 'Brand Voice', icon: '🎤' },
];

const SEO_PATHS = SEO_TOOLS.map(t => t.path);
const ADS_PATHS = ADS_TOOLS.map(t => t.path);

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/virtual-office-games', label: 'Virtual Office' },
  { path: '/clients', label: 'Clients' },
  { path: '/client-dashboard', label: 'Performance' },
  { path: '/seo-tools', label: 'SEO Tools', dropdown: 'seo' },
  { path: '/ads-hub', label: 'Ads Hub', dropdown: 'ads' },
];

export default function AppShell({ children }) {
  const location = useLocation();
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setOpenDropdown(null); }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isInSeoSection = SEO_PATHS.some(p => location.pathname.startsWith(p)) || location.pathname === '/seo-tools';
  const isInAdsSection = ADS_PATHS.some(p => location.pathname.startsWith(p)) || location.pathname === '/ads-hub';

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
        <nav className="flex items-center gap-1 ml-4 overflow-x-visible">
          {NAV_ITEMS.map((item) => {
            if (item.dropdown) {
              const tools = item.dropdown === 'seo' ? SEO_TOOLS : ADS_TOOLS;
              const isActive = item.dropdown === 'seo' ? isInSeoSection : isInAdsSection;
              const isOpen = openDropdown === item.dropdown;
              return (
                <div key={item.path} ref={isOpen ? dropdownRef : undefined} className="relative">
                  <button
                    onClick={() => setOpenDropdown(o => o === item.dropdown ? null : item.dropdown)}
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
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            const className = `px-2.5 py-1 rounded text-xs no-underline transition-colors whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-white/10 text-[#F5C518] font-semibold'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`;

            return (
              <Link key={item.path} to={item.path} className={className}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
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
