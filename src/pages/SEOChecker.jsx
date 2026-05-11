import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar/Sidebar';
import ReportArea from '../components/ReportArea/ReportArea';
import SEODashboard from '../components/SEODashboard';
import AddClientModal from '../components/Modals/AddClientModal';
import SaveReportModal from '../components/Modals/SaveReportModal';
import KeywordBankModal from '../components/Modals/KeywordBankModal';
import { useClients } from '../hooks/useClients';
import { useReport } from '../hooks/useReport';
import { useAnalysis } from '../hooks/useAnalysis';
import { MONTHS } from '../data/checklist';

export default function SEOChecker() {
  const { clients, addClient, deleteClient } = useClients();
  const {
    report,
    fields,
    checklistState,
    aiFindings,
    setAiFindings,
    gscData,
    dirty,
    saving,
    newReport,
    loadReport,
    saveReport,
    deleteReport,
    updateField,
    toggleCheck,
    setAutoChecks,
    updateGsc,
  } = useReport();
  const { analyze, analyzing, statusText } = useAnalysis();

  const [showAddClient, setShowAddClient] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showKeywordBank, setShowKeywordBank] = useState(null);
  const [prefillSave, setPrefillSave] = useState(null);
  const [hasReport, setHasReport] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-load report from URL param ?report=ID
  useEffect(() => {
    const reportId = searchParams.get('report');
    if (reportId) {
      loadReport(reportId).then(() => setHasReport(true)).catch(() => {});
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewReport = () => {
    if (dirty && hasReport) {
      if (!confirm('You have unsaved changes. Start a new report anyway?')) return;
    }
    newReport();
    setHasReport(true);
  };

  const handleAddReportToMonth = (clientId, year, monthIndex) => {
    if (dirty && hasReport) {
      if (!confirm('You have unsaved changes. Start a new report anyway?')) return;
    }
    newReport();
    setHasReport(true);
    // Auto-open save modal pre-filled with the chosen client/month/year
    setTimeout(() => {
      setShowSaveModal(true);
    }, 100);
    // Store the pre-fill values
    setPrefillSave({ clientId, year, monthIndex });
  };

  const handleOpenReport = useCallback(async (reportId) => {
    try {
      await loadReport(reportId);
      setHasReport(true);
    } catch (err) {
      alert('Could not load report: ' + err.message);
    }
  }, [loadReport]);

  const handleDeleteReport = useCallback(async (reportId) => {
    if (!confirm('Delete this report?')) return;
    try {
      await deleteReport(reportId);
      if (report?.id === reportId) setHasReport(false);
    } catch (err) {
      alert('Error deleting report: ' + err.message);
    }
  }, [deleteReport, report]);

  const handleDeleteClient = useCallback(async (clientId) => {
    if (!confirm('Delete this client and ALL their saved reports?')) return;
    try {
      await deleteClient(clientId);
      if (report?.client_id === clientId) {
        newReport();
        setHasReport(false);
      }
    } catch (err) {
      alert('Error deleting client: ' + err.message);
    }
  }, [deleteClient, report, newReport]);

  const handleSave = async (params) => {
    await saveReport(params);
  };

  const handleAnalyze = async () => {
    try {
      const result = await analyze({
        content: fields.article_content,
        focusKw: fields.focus_keyphrase,
        secKws: fields.secondary_keywords,
        url: fields.url,
        title: fields.article_title,
        meta: fields.meta_description,
      });

      if (result.checks) {
        const boolChecks = {};
        Object.entries(result.checks).forEach(([id, val]) => {
          boolChecks[id] = !!val;
        });
        setAutoChecks(boolChecks);
      }

      setAiFindings({
        h1_found: result.h1_found,
        word_count: result.word_count,
        internal_links: result.internal_links,
        notes: result.notes,
        wins: result.wins,
        fixes: result.fixes,
      });
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Build breadcrumb
  const client = clients.find((c) => c.id === report?.client_id);
  const breadcrumb = report
    ? `<b>${client?.name || ''}</b> › ${MONTHS[report.month_index]} ${report.year} › ${report.name}`
    : hasReport
      ? 'New report — not yet saved'
      : '';

  return (
    <div className="flex h-full overflow-hidden">
      {/* SEO Checker tool bar */}
      <div className="flex flex-col h-full w-full">
        <div className="bg-[#1a1a1a] text-white px-4 h-9 flex items-center gap-3 shrink-0 border-t border-[#333]">
          <div className="text-xs font-semibold text-white/70">SEO Checker</div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="text-[11px] text-white/50">
              {client ? (
                <span>
                  <span className="text-[#F5C518] font-semibold">{client.name}</span>
                  {report && ` — ${MONTHS[report.month_index]}`}
                </span>
              ) : hasReport ? (
                <span>Unsaved report</span>
              ) : (
                <span>No report open</span>
              )}
            </div>
            <button
              onClick={() => setShowSaveModal(true)}
              disabled={!hasReport}
              className="bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-3.5 py-1 text-[11px] font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Report
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            clients={clients}
            currentReportId={report?.id}
            onOpenReport={handleOpenReport}
            onDeleteReport={handleDeleteReport}
            onAddClient={() => setShowAddClient(true)}
            onDeleteClient={handleDeleteClient}
            onNewReport={handleNewReport}
            onManageKeywords={(id) => setShowKeywordBank(id)}
            onAddReport={handleAddReportToMonth}
            hasReport={hasReport}
          />

          {hasReport ? (
            <ReportArea
              fields={fields}
              onFieldChange={updateField}
              checklistState={checklistState}
              onToggle={toggleCheck}
              aiFindings={aiFindings}
              gscData={gscData}
              onGscChange={updateGsc}
              onAnalyze={handleAnalyze}
              analyzing={analyzing}
              statusText={statusText}
              breadcrumb={breadcrumb}
              saved={!!report && !dirty}
              reportId={report?.id}
              clientId={report?.client_id}
              clients={clients}
              onManageKeywords={(id) => setShowKeywordBank(id)}
              onBackToDashboard={() => { if (!dirty || confirm('You have unsaved changes. Go back anyway?')) { newReport(); setHasReport(false); } }}
            />
          ) : (
            <SEODashboard
              clients={clients}
              onAddClient={() => setShowAddClient(true)}
            />
          )}
        </div>
      </div>

      <AddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        onAdd={addClient}
      />

      <SaveReportModal
        open={showSaveModal}
        onClose={() => { setShowSaveModal(false); setPrefillSave(null); }}
        onSave={handleSave}
        clients={clients}
        defaultClientId={prefillSave?.clientId || report?.client_id}
        defaultMonthIndex={prefillSave?.monthIndex ?? report?.month_index}
        defaultName={report?.name || fields.article_title}
      />

      <KeywordBankModal
        open={!!showKeywordBank}
        onClose={() => setShowKeywordBank(null)}
        clientId={showKeywordBank}
        clients={clients}
      />
    </div>
  );
}
