import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import App from './pages/App';
import Login from './pages/Login';
import './index.css';

function Root() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => setSession(s)
    );

    return () => subscription.unsubscribe();
  }, []);

  // Loading state
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-white text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={session ? <App /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
