export default function EmptyState({ onAddClient }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400 gap-3">
      <div className="text-4xl opacity-30">📄</div>
      <h2 className="text-base font-semibold text-gray-500">No report open</h2>
      <p className="text-sm max-w-xs leading-relaxed">
        Add a client in the sidebar, then click <strong>+ New Report</strong> to start a fresh SEO checklist.
      </p>
      <button
        onClick={onAddClient}
        className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-md px-5 py-2 text-sm font-bold cursor-pointer hover:bg-[#e6b800] mt-1"
      >
        Add your first client
      </button>
    </div>
  );
}
