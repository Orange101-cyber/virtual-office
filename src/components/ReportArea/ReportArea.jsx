import { useState } from 'react';
import ArticleInputs from './ArticleInputs';
import ScoreBar from './ScoreBar';
import Checklist from './Checklist';
import IssuesTab from './IssuesTab';
import AIFindings from './AIFindings';
import ExportPdf from './ExportPdf';
import CategoryProgress from '../RightColumn/CategoryProgress';
import Cannibalization from '../RightColumn/Cannibalization';
import GSCLog from '../RightColumn/GSCLog';
import SerpPreview from '../RightColumn/SerpPreview';
import ReadabilityScore from '../RightColumn/ReadabilityScore';
import ContentStats from '../RightColumn/ContentStats';
import KeywordDensity from '../RightColumn/KeywordDensity';
import CompetitorComparison from '../RightColumn/CompetitorComparison';
import InternalLinks from '../RightColumn/InternalLinks';
import ScoreHistory from '../RightColumn/ScoreHistory';
import SchemaGenerator from '../RightColumn/SchemaGenerator';
import SocialPreview from '../RightColumn/SocialPreview';
import ImageAudit from '../RightColumn/ImageAudit';

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
  reportId,
  clientId,
  clients,
  onManageKeywords,
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

      {/* Score bar + Export button */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <ScoreBar checklistState={checklistState} />
        </div>
        <div className="pt-1">
          <ExportPdf
            fields={fields}
            checklistState={checklistState}
            aiFindings={aiFindings}
            gscData={gscData}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-4 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-4">
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

          {/* Bottom left: Competitor Comparison + Internal Links side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CompetitorComparison content={fields.article_content} title={fields.article_title} />
            <InternalLinks
              content={fields.article_content}
              focusKeyphrase={fields.focus_keyphrase}
              secondaryKeywords={fields.secondary_keywords}
              articleUrl={fields.url}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3.5">
          <SerpPreview
            title={fields.article_title}
            metaDescription={fields.meta_description}
            url={fields.url}
          />
          <ScoreHistory checklistState={checklistState} reportId={reportId} />
          <CategoryProgress checklistState={checklistState} />
          <ReadabilityScore content={fields.article_content} />
          <ContentStats content={fields.article_content} />
          <KeywordDensity
            content={fields.article_content}
            focusKeyphrase={fields.focus_keyphrase}
            secondaryKeywords={fields.secondary_keywords}
          />
          <ImageAudit content={fields.article_content} focusKeyphrase={fields.focus_keyphrase} />
          <SchemaGenerator
            content={fields.article_content}
            title={fields.article_title}
            url={fields.url}
          />
          <SocialPreview
            title={fields.article_title}
            metaDescription={fields.meta_description}
            url={fields.url}
          />
          <Cannibalization
            focusKeyphrase={fields.focus_keyphrase}
            secondaryKeywords={fields.secondary_keywords}
            clientId={clientId}
            onManageKeywords={onManageKeywords}
          />
          <GSCLog gscData={gscData} onGscChange={onGscChange} />
        </div>
      </div>
    </div>
  );
}
