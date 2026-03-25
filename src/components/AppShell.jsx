import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/seo-checker', label: 'SEO Checker' },
];

export default function AppShell({ children }) {
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

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
        <nav className="flex items-center gap-1 ml-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`px-2.5 py-1 rounded text-xs no-underline transition-colors ${
                  isActive
                    ? 'bg-white/10 text-[#F5C518] font-semibold'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
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
