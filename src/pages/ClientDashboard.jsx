export default function ClientDashboard() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f8f8f6]">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <h1 className="text-lg font-bold text-[#1a1a1a]">📊 Performance Dashboard</h1>
        <p className="text-[11px] text-gray-400">Live Google Ads client data via Cyfe</p>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <iframe
          src="https://app.cyfe.com/dashboards/1075694/69f07ae59e5f4100111545584163"
          className="w-full h-full border-none rounded-lg"
          title="CYL Performance Dashboard"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
