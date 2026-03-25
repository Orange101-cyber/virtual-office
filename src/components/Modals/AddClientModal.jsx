import { useState } from 'react';

export default function AddClientModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onAdd(name.trim());
      setName('');
      onClose();
    } catch (err) {
      alert('Error adding client: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[7px] p-6 w-[360px] max-w-[95vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold mb-3.5">Add New Client</h3>
        <div className="mb-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
            Client Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Luke O'Kelly"
            autoFocus
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
            onClick={handleAdd}
            disabled={loading || !name.trim()}
            className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-4 py-2 text-xs font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40"
          >
            {loading ? 'Adding...' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  );
}
