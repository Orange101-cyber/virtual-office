import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'reset' | 'update_password'
  const [resetSent, setResetSent] = useState(false);

  // Handle auth errors and password recovery from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDesc = params.get('error_description');
      const type = params.get('type');

      if (errorDesc) {
        setError(errorDesc.replace(/\+/g, ' '));
        window.history.replaceState(null, '', window.location.pathname);
      }
      if (type === 'recovery') {
        setMode('update_password');
      }
    }

    // Listen for password recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update_password');
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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email) { setError('Enter your email first'); return; }
    setLoading(true);
    setError('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (resetError) setError(resetError.message);
    else setResetSent(true);
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
      setError('');
      setMode('login');
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
              {mode === 'login' && 'Sign in to continue'}
              {mode === 'reset' && 'Reset your password'}
              {mode === 'update_password' && 'Set your new password'}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded p-2.5 mb-4">
            {error}
          </div>
        )}

        {/* Password recovery form */}
        {mode === 'update_password' && (
          <form onSubmit={handleUpdatePassword}>
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded p-2.5 mb-4">
              Set your new password below.
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
        )}

        {/* Forgot password form */}
        {mode === 'reset' && (
          <form onSubmit={handleForgotPassword}>
            {resetSent ? (
              <div className="text-center py-4">
                <div className="text-2xl mb-2">📧</div>
                <div className="text-sm font-semibold text-[#1a1a1a] mb-1">Check your email</div>
                <div className="text-xs text-gray-400 mb-4">We've sent a password reset link to <b>{email}</b></div>
                <button type="button" onClick={() => { setMode('login'); setResetSent(false); setError(''); }}
                  className="text-xs text-[#F5C518] font-semibold bg-transparent border-none cursor-pointer hover:underline">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@cylglobal.com" required autoFocus
                    className="w-full border border-gray-200 rounded-[5px] px-3 py-2 text-sm bg-[#f8f8f6] focus:outline-none focus:border-[#F5C518] focus:bg-white" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 mb-3">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button type="button" onClick={() => { setMode('login'); setError(''); }}
                  className="w-full text-xs text-gray-400 bg-transparent border-none cursor-pointer hover:text-[#F5C518]">
                  Back to sign in
                </button>
              </>
            )}
          </form>
        )}

        {/* Normal login form */}
        {mode === 'login' && (
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
              className="w-full bg-[#F5C518] text-[#1a1a1a] border-none rounded-[5px] px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-[#e6b800] disabled:opacity-40 mb-3">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button type="button" onClick={() => { setMode('reset'); setError(''); }}
              className="w-full text-xs text-gray-400 bg-transparent border-none cursor-pointer hover:text-[#F5C518]">
              Forgot password?
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
