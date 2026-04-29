import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAdmin() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCurrentUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }

    const { data } = await supabase.from('app_users')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (data) {
      setCurrentUser({ ...data, email: session.user.email });
    } else {
      // User exists in auth but not in app_users — they're a regular member
      setCurrentUser({ user_id: session.user.id, email: session.user.email, role: 'member', name: session.user.email.split('@')[0] });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCurrentUser(); }, [loadCurrentUser]);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin' || isSuperAdmin;

  return { currentUser, loading, isSuperAdmin, isAdmin, refresh: loadCurrentUser };
}
