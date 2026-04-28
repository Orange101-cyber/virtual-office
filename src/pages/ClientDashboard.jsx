export default function ClientDashboard() {
  return (
    <div className="h-full flex items-center justify-center bg-[#f8f8f6]">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">📊</div>
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-2">Performance Dashboard</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Live Google Ads data for all CYL clients. Opens your Cyfe dashboard in a new tab.
        </p>
        <a
          href="https://app.cyfe.com/dashboards/1075694/69f07ae59e5f4100111545584163"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#F5C518] text-[#1a1a1a] no-underline rounded-xl px-8 py-3.5 text-sm font-bold hover:bg-[#e6b800] transition-colors"
        >
          Open Dashboard ↗
        </a>
        <p className="text-[10px] text-gray-400 mt-4">app.cyfe.com · opens in a new tab</p>
      </div>
    </div>
  );
}
