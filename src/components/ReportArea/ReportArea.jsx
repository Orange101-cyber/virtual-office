import { useState } from 'react';
import ArticleInputs from './ArticleInputs';
import ScoreBar from './ScoreBar';
import Checklist from './Checklist';
import IssuesTab from './IssuesTab';
import AIFindings from './AIFindings';
import CategoryProgress from '../RightColumn/CategoryProgress';
import Cannibalization from '../RightColumn/Cannibalization';
import GSCLog from '../RightColumn/GSCLog';

export default function ReportArea({
  fields,
  onFieldChange,
  checklistState,
  onToggle,
  aiFindings,
  gscData,
  onGscChange,
  onAnalyze,
  analyzing,
  statusText,
  breadcrumb,
  saved,
}) {
  const [activeTab, setActiveTab] = useState('checklist');

  const tabs = [
    { id: 'checklist', label: 'Checklist' },
    { id: 'issues', label: 'Issues' },
    { id: 'aifindings', label: 'AI Notes' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-10">
      <ArticleInputs
        fields={fields}
        onFieldChange={onFieldChange}
        onAnalyze={onAnalyze}
        analyzing={analyzing}
        statusText={statusText}
        breadcrumb={breadcrumb}
        saved={saved}
      />

      <ScoreBar checklistState={checklistState} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-4 items-start">
        {/* Left column */}
        <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-[10px] font-bold cursor-pointer uppercase tracking-wider -mb-px ${
                  activeTab === tab.id
                    ? 'text-[#1a1a1a] border-b-2 border-[#F5C518]'
                    : 'text-gray-400 border-b-2 border-transparent'
                }`}
              >
                {tab.label}
              </div>
            ))}
          </div>

          {activeTab === 'checklist' && (
            <Checklist checklistState={checklistState} onToggle={onToggle} />
          )}
          {activeTab === 'issues' && (
            <IssuesTab checklistState={checklistState} />
          )}
          {activeTab === 'aifindings' && (
            <AIFindings findings={aiFindings} />
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3.5">
          <CategoryProgress checklistState={checklistState} />
          <Cannibalization
            focusKeyphrase={fields.focus_keyphrase}
            secondaryKeywords={fields.secondary_keywords}
            pastKeywords={fields.past_keywords}
            onPastKeywordsChange={(v) => onFieldChange('past_keywords', v)}
          />
          <GSCLog gscData={gscData} onGscChange={onGscChange} />
        </div>
      </div>
    </div>
  );
}
