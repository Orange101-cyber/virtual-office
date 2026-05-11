import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRecovery, setIsRecovery] = useState(false);

  // Handle auth errors and recovery tokens from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDesc = params.get('error_description');
      const type = params.get('type');
      const accessToken = params.get('access_token');

      if (errorDesc) {
        setError(errorDesc.replace(/\+/g, ' '));
      }
      if (type === 'recovery' && accessToken) {
        setIsRecovery(true);
      }
      window.history.replaceState(null, '', window.location.pathname);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setLoading(false);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
    } else {
      window.location.href = window.location.origin + window.location.pathname;
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 w-[360px] max-w-[90vw] shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-[#F5C518] text-[#1a1a1a] font-bold text-sm tracking-wider px-3 py-1.5 rounded uppercase">
            CYL
          </div>
          <div>
            <div className="text-base font-semibold">Virtual Office</div>
            <div className="text-xs text-gray-400">
              {isRecovery ? 'Set your new password' : 'Sign in to continue'}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded p-2.5 mb-4">
            {error}
          </div>
        )}

        {isRecovery ? (
          <form onSubmit={handleUpdatePassword}>
            <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded p-2.5 mb-4">
              Your admin has sent you a password reset. Set your new password below.
            </div>
            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters" required autoFocus
                className="w-full border border-gray-200 rounded-[5px] px-3 py-2 text-sm bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@cylglobal.com" required
                className="w-full border border-gray-200 rounded-[5px] px-3 py-2 text-sm bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white" />
            </div>
            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full border border-gray-200 rounded-[5px] px-3 py-2 text-sm bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
