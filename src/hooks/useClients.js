import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');
    if (error) {
      console.error('Error fetching clients:', error);
    } else {
      setClients(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Active clients (not archived) — treat undefined/null/false as active
  const activeClients = clients.filter(c => c.archived !== true);
  // Archived clients
  const archivedClients = clients.filter(c => c.archived === true);

  const addClient = async (name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await supabase
      .from('clients')
      .insert({ name, slug })
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data;
  };

  const deleteClient = async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  const archiveClient = async (id) => {
    const { error } = await supabase
      .from('clients')
      .update({ archived: true })
      .eq('id', id);
    if (error) throw error;
    setClients((prev) => prev.map(c => c.id === id ? { ...c, archived: true } : c));
  };

  const restoreClient = async (id) => {
    const { error } = await supabase
      .from('clients')
      .update({ archived: false })
      .eq('id', id);
    if (error) throw error;
    setClients((prev) => prev.map(c => c.id === id ? { ...c, archived: false } : c));
  };

  return {
    clients: activeClients,  // default: only active (all pages use this)
    allClients: clients,     // includes archived
    activeClients,
    archivedClients,
    loading,
    fetchClients,
    addClient,
    deleteClient,
    archiveClient,
    restoreClient,
  };
}
