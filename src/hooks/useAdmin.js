import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAdmin() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCurrentUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }

      const { data, error } = await supabase.from('app_users')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error('useAdmin query error:', error);
        setCurrentUser({ user_id: session.user.id, email: session.user.email, role: 'member', name: session.user.email?.split('@')[0] || 'User' });
      } else if (data) {
        setCurrentUser({ ...data, email: data.email || session.user.email });
      } else {
        setCurrentUser({ user_id: session.user.id, email: session.user.email, role: 'member', name: session.user.email?.split('@')[0] || 'User' });
      }
    } catch (err) {
      console.error('useAdmin error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCurrentUser(); }, [loadCurrentUser]);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin' || isSuperAdmin;

  return { currentUser, loading, isSuperAdmin, isAdmin, refresh: loadCurrentUser };
}
