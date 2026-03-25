export default function AIFindings({ findings }) {
  if (!findings || (!findings.notes && !findings.wins?.length && !findings.fixes?.length)) {
    return (
      <div className="p-3.5 text-gray-400 text-sm">
        Run an analysis to see AI notes.
      </div>
    );
  }

  return (
    <div className="p-3.5 text-xs leading-relaxed">
      {/* Meta info */}
      {(findings.h1_found || findings.word_count !== undefined || findings.internal_links !== undefined) && (
        <table className="w-full text-[11px] mb-2.5">
          <tbody>
            {findings.h1_found && (
              <tr>
                <td className="text-gray-400 pr-2 whitespace-nowrap w-24 py-0.5 align-top">H1 found</td>
                <td className="py-0.5">{findings.h1_found}</td>
              </tr>
            )}
            {findings.word_count !== undefined && (
              <tr>
                <td className="text-gray-400 pr-2 whitespace-nowrap w-24 py-0.5 align-top">Word count</td>
                <td className="py-0.5">
                  {findings.word_count} words {findings.word_count >= 1000 ? '✓' : '▲ needs 1,000+'}
                </td>
              </tr>
            )}
            {findings.internal_links !== undefined && (
              <tr>
                <td className="text-gray-400 pr-2 whitespace-nowrap w-24 py-0.5 align-top">Internal links</td>
                <td className="py-0.5">
                  {findings.internal_links} {findings.internal_links >= 2 ? '✓' : '▲ needs 2+'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {findings.notes && (
        <div className="p-2.5 bg-[#f8f8f6] rounded-[5px] border-l-[3px] border-[#F5C518] text-[11px] mb-2.5 leading-relaxed">
          {findings.notes}
        </div>
      )}

      {findings.wins?.length > 0 && (
        <div className="mb-2.5">
          <h4 className="text-[11px] font-bold text-green-600 mb-1">✓ What&apos;s working</h4>
          <ul className="pl-3.5">
            {findings.wins.map((w, i) => (
              <li key={i} className="text-green-600 text-[11px] mb-0.5">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {findings.fixes?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-red-500 mb-1">▲ Top fixes needed</h4>
          <ul className="pl-3.5">
            {findings.fixes.map((f, i) => (
              <li key={i} className="text-red-500 text-[11px] mb-0.5">{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
