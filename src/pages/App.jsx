import { useState, useCallback } from 'react';
import TopBar from '../components/TopBar/TopBar';
import Sidebar from '../components/Sidebar/Sidebar';
import ReportArea from '../components/ReportArea/ReportArea';
import EmptyState from '../components/EmptyState';
import AddClientModal from '../components/Modals/AddClientModal';
import SaveReportModal from '../components/Modals/SaveReportModal';
import { useClients } from '../hooks/useClients';
import { useReport } from '../hooks/useReport';
import { useAnalysis } from '../hooks/useAnalysis';
import { MONTHS } from '../data/checklist';
import { supabase } from '../lib/supabase';

export default function App() {
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
  const [hasReport, setHasReport] = useState(false);

  const handleNewReport = () => {
    if (dirty && hasReport) {
      if (!confirm('You have unsaved changes. Start a new report anyway?')) return;
    }
    newReport();
    setHasReport(true);
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

      // Apply auto checks
      if (result.checks) {
        const boolChecks = {};
        Object.entries(result.checks).forEach(([id, val]) => {
          boolChecks[id] = !!val;
        });
        setAutoChecks(boolChecks);
      }

      // Store findings
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Build breadcrumb
  const client = clients.find((c) => c.id === report?.client_id);
  const breadcrumb = report
    ? `<b>${client?.name || ''}</b> › ${MONTHS[report.month_index]} ${report.year} › ${report.name}`
    : hasReport
      ? 'New report — not yet saved'
      : '';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f8f6] text-[#1a1a1a] text-[13px] leading-relaxed">
      <TopBar
        clientName={client?.name || (hasReport ? 'Unsaved report' : null)}
        monthLabel={report ? MONTHS[report.month_index] : null}
        onSave={() => setShowSaveModal(true)}
        canSave={hasReport}
        onLogout={handleLogout}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          clients={clients}
          currentReportId={report?.id}
          onOpenReport={handleOpenReport}
          onDeleteReport={handleDeleteReport}
          onAddClient={() => setShowAddClient(true)}
          onDeleteClient={handleDeleteClient}
          onNewReport={handleNewReport}
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
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <EmptyState onAddClient={() => setShowAddClient(true)} />
          </div>
        )}
      </div>

      <AddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        onAdd={addClient}
      />

      <SaveReportModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSave}
        clients={clients}
        defaultClientId={report?.client_id}
        defaultMonthIndex={report?.month_index}
        defaultName={report?.name || fields.article_title}
      />
    </div>
  );
}
