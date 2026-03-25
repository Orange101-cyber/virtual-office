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

  return { clients, loading, fetchClients, addClient, deleteClient };
}
