import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CHECKS } from '../data/checklist';

const defaultChecklist = () => {
  const state = {};
  CHECKS.flatMap((c) => c.items).forEach((item) => {
    state[item.id] = false;
  });
  return state;
};

const defaultGsc = () => ({
  w1_imp: '', w1_clk: '', w1_pos: '',
  w4_imp: '', w4_clk: '', w4_pos: '',
  queries: '',
});

const defaultFields = () => ({
  name: '',
  url: '',
  focus_keyphrase: '',
  secondary_keywords: '',
  article_title: '',
  meta_description: '',
  article_content: '',
  past_keywords: '',
});

export function useReport() {
  const [report, setReport] = useState(null);
  const [fields, setFields] = useState(defaultFields());
  const [checklistState, setChecklistState] = useState(defaultChecklist());
  const [aiFindings, setAiFindings] = useState({});
  const [gscData, setGscData] = useState(defaultGsc());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const newReport = useCallback(() => {
    setReport(null);
    setFields(defaultFields());
    setChecklistState(defaultChecklist());
    setAiFindings({});
    setGscData(defaultGsc());
    setDirty(false);
  }, []);

  const loadReport = useCallback(async (reportId) => {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single();
    if (error) throw error;

    setReport(data);
    setFields({
      name: data.name || '',
      url: data.url || '',
      focus_keyphrase: data.focus_keyphrase || '',
      secondary_keywords: data.secondary_keywords || '',
      article_title: data.article_title || '',
      meta_description: data.meta_description || '',
      article_content: data.article_content || '',
      past_keywords: data.past_keywords || '',
    });
    setChecklistState({ ...defaultChecklist(), ...(data.checklist_state || {}) });
    setAiFindings(data.ai_findings || {});
    setGscData({ ...defaultGsc(), ...(data.gsc_data || {}) });
    setDirty(false);
    return data;
  }, []);

  const saveReport = async ({ clientId, year, monthIndex, name }) => {
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        name: name || fields.name || 'Untitled',
        year,
        month_index: monthIndex,
        url: fields.url,
        focus_keyphrase: fields.focus_keyphrase,
        secondary_keywords: fields.secondary_keywords,
        article_title: fields.article_title,
        meta_description: fields.meta_description,
        article_content: fields.article_content,
        past_keywords: fields.past_keywords,
        checklist_state: checklistState,
        ai_findings: aiFindings,
        gsc_data: gscData,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (report?.id) {
        const { data, error } = await supabase
          .from('reports')
          .update(payload)
          .eq('id', report.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from('reports')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      setReport(result);
      setDirty(false);
      return result;
    } finally {
      setSaving(false);
    }
  };

  const deleteReport = async (reportId) => {
    const { error } = await supabase.from('reports').delete().eq('id', reportId);
    if (error) throw error;
    if (report?.id === reportId) newReport();
  };

  const updateField = (key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const toggleCheck = (id) => {
    setChecklistState((prev) => ({ ...prev, [id]: !prev[id] }));
    setDirty(true);
  };

  const setAutoChecks = (checks) => {
    setChecklistState((prev) => ({ ...prev, ...checks }));
    setDirty(true);
  };

  const updateGsc = (key, value) => {
    setGscData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  return {
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
    setDirty,
  };
}
