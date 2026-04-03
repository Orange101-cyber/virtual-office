import { useMemo } from 'react';

export default function SerpPreview({ title, metaDescription, url }) {
  const displayUrl = useMemo(() => {
    if (!url) return 'example.com';
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
      return u.hostname + (path.length ? ' › ' + path.join(' › ') : '');
    } catch {
      return url;
    }
  }, [url]);

  const truncTitle = title?.length > 60 ? title.substring(0, 57) + '...' : title;
  const truncMeta = metaDescription?.length > 160 ? metaDescription.substring(0, 157) + '...' : metaDescription;

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
        SERP Preview
      </div>
      <div className="p-3.5">
        <div className="text-[10px] text-gray-400 mb-2">How this page appears in Google results</div>

        {/* Google-style preview */}
        <div className="border border-gray-100 rounded-lg p-3 bg-white">
          <div className="text-[12px] text-[#1a0dab] font-medium leading-snug mb-0.5 cursor-pointer hover:underline">
            {truncTitle || 'Page Title Goes Here'}
          </div>
          <div className="text-[11px] text-[#006621] mb-1 truncate">
            {displayUrl}
          </div>
          <div className="text-[11px] text-[#545454] leading-relaxed">
            {truncMeta || 'Meta description will appear here. Write a compelling 140-160 character description.'}
          </div>
        </div>

        {/* Character counts */}
        <div className="flex gap-4 mt-2 text-[10px]">
          <span className={title?.length > 60 ? 'text-red-500 font-semibold' : title?.length > 50 ? 'text-orange-500' : 'text-green-600'}>
            Title: {title?.length || 0}/60
          </span>
          <span className={
            metaDescription?.length > 160 ? 'text-red-500 font-semibold' :
            metaDescription?.length >= 140 ? 'text-green-600' :
            'text-orange-500'
          }>
            Meta: {metaDescription?.length || 0}/160
          </span>
        </div>
      </div>
    </div>
  );
}
