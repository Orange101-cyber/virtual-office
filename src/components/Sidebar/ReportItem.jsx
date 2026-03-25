export default function ReportItem({ name, isActive, onOpen, onDelete }) {
  return (
    <div
      onClick={onOpen}
      className={`flex items-center py-1 pr-3.5 cursor-pointer gap-1.5 ${
        isActive
          ? 'bg-[#2d2d1f] border-l-2 border-[#F5C518] pl-[38px]'
          : 'pl-10 hover:bg-[#252525]'
      }`}
    >
      <span
        className={`text-[11px] flex-1 whitespace-nowrap overflow-hidden text-ellipsis ${
          isActive ? 'text-[#F5C518]' : 'text-[#999]'
        }`}
        title={name}
      >
        {name}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="bg-transparent border-none text-[#444] cursor-pointer text-[11px] p-0 shrink-0 hover:text-red-500"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}
