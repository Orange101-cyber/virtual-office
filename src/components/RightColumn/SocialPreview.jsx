import { useMemo } from 'react';

export default function SocialPreview({ title, metaDescription, url }) {
  const domain = useMemo(() => {
    if (!url) return 'example.com';
    try { return new URL(url).hostname; } catch { return url; }
  }, [url]);

  const ogTitle = title?.substring(0, 70) || 'Page Title';
  const ogDesc = metaDescription?.substring(0, 200) || 'Page description will appear here.';

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        Social Preview Cards
      </div>
      <div className="p-3.5 space-y-3">
        {/* Facebook / LinkedIn */}
        <div>
          <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Facebook / LinkedIn</div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 h-28 flex items-center justify-center text-gray-300 text-2xl">
              OG Image
            </div>
            <div className="p-2.5 bg-[#f0f2f5]">
              <div className="text-[9px] text-gray-400 uppercase">{domain}</div>
              <div className="text-[13px] font-semibold text-[#1d2129] leading-tight mt-0.5">
                {ogTitle}
              </div>
              <div className="text-[11px] text-gray-500 leading-snug mt-0.5 line-clamp-2">
                {ogDesc}
              </div>
            </div>
          </div>
        </div>

        {/* Twitter/X */}
        <div>
          <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Twitter / X</div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-100 h-24 flex items-center justify-center text-gray-300 text-2xl">
              Card Image
            </div>
            <div className="p-2.5">
              <div className="text-[13px] font-bold text-[#0f1419] leading-tight">
                {ogTitle}
              </div>
              <div className="text-[11px] text-[#536471] leading-snug mt-0.5 line-clamp-2">
                {ogDesc}
              </div>
              <div className="text-[11px] text-[#536471] mt-1 flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                {domain}
              </div>
            </div>
          </div>
        </div>

        {/* OG Tag checklist */}
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Required OG Tags</div>
          <div className="space-y-1 text-[10px]">
            <div className={title ? 'text-green-600' : 'text-red-500'}>
              {title ? '✓' : '✗'} og:title
            </div>
            <div className={metaDescription ? 'text-green-600' : 'text-red-500'}>
              {metaDescription ? '✓' : '✗'} og:description
            </div>
            <div className={url ? 'text-green-600' : 'text-red-500'}>
              {url ? '✓' : '✗'} og:url
            </div>
            <div className="text-orange-500">
              ? og:image — check manually
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
