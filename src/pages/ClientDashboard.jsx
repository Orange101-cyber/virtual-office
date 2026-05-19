export default function ClientDashboard() {
  return (
    <div className="h-full flex items-center justify-center bg-[#f8f8f6]">
      <div className="text-center max-w-lg">
        <div className="text-5xl mb-4">📊</div>
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-2">Performance Dashboards</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Live ad performance data for all CYL clients. Opens in a new tab.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="https://app.cyfe.com/dashboards/1075694/69f07ae59e5f4100111545584163"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#F5C518] text-[#1a1a1a] no-underline rounded-xl px-6 py-3.5 text-sm font-bold hover:bg-[#e6b800] transition-colors"
          >
            Google Ads ↗
          </a>
          <a
            href="https://app.cyfe.com/dashboards/1080650/6a02c9d11460b100317517707970"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#1877F2] text-white no-underline rounded-xl px-6 py-3.5 text-sm font-bold hover:bg-[#1565C0] transition-colors"
          >
            META Ads ↗
          </a>
        </div>
        <p className="text-[10px] text-gray-400 mt-4">app.cyfe.com · opens in new tabs</p>
      </div>
    </div>
  );
}
