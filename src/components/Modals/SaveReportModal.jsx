import { useState, useEffect } from 'react';
import { MONTHS } from '../../data/checklist';

export default function SaveReportModal({
  open,
  onClose,
  onSave,
  clients,
  defaultClientId,
  defaultMonthIndex,
  defaultName,
}) {
  const [clientId, setClientId] = useState('');
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (open) {
      setClientId(defaultClientId || clients[0]?.id || '');
      setMonthIndex(defaultMonthIndex ?? new Date().getMonth());
      setName(defaultName || '');
    }
  }, [open, defaultClientId, defaultMonthIndex, defaultName, clients]);

  const handleSave = async () => {
    if (!clientId || !name.trim()) return;
    setSaving(true);
    try {
      await onSave({ clientId, year, monthIndex, name: name.trim() });
      onClose();
    } catch (err) {
      alert('Error saving report: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[7px] p-6 w-[360px] max-w-[95vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold mb-3.5">Save Report</h3>

        {/* Client select */}
        <div className="mb-2.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Client
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-xs bg-[#f8f8f6]"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Month grid */}
        <div className="mb-2.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Month
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MONTHS.map((m, i) => (
              <div
                key={i}
                onClick={() => setMonthIndex(i)}
                className={`border rounded px-1.5 py-1.5 text-[11px] text-center cursor-pointer ${
                  i === monthIndex
                    ? 'bg-[#F5C518] text-[#1a1a1a] border-[#F5C518] font-bold'
                    : 'border-gray-200 text-gray-500 bg-[#f8f8f6] hover:border-[#F5C518] hover:text-[#1a1a1a]'
                }`}
              >
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* Report name */}
        <div className="mb-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Report Name (article title)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="e.g. Real Estate West End: 6 Facts..."
            className="w-full border border-gray-200 rounded-[5px] px-2 py-1.5 text-xs bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white"
          />
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <button
            onClick={onClose}
            className="bg-transparent border border-gray-200 text-gray-500 rounded-[5px] px-3.5 py-2 text-xs cursor-pointer hover:bg-[#f8f8f6]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !clientId || !name.trim()}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-4 py-2 text-xs font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
