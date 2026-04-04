import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import SEOChecker from './pages/SEOChecker';
import ClientDashboard from './pages/ClientDashboard';
import ContentPlanner from './pages/ContentPlanner';
import BriefGenerator from './pages/BriefGenerator';
import KeywordResearch from './pages/KeywordResearch';
import ArticleWriter from './pages/ArticleWriter';
import Login from './pages/Login';
import { Toaster } from 'react-hot-toast';
import './index.css';

function AuthRoute({ session, children }) {
  return session ? <AppShell>{children}</AppShell> : <Navigate to="/login" replace />;
}

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

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-white text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter basename="/virtual-office">
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<AuthRoute session={session}><Dashboard /></AuthRoute>} />
        <Route path="/client-dashboard" element={<AuthRoute session={session}><ClientDashboard /></AuthRoute>} />
        <Route path="/seo-checker" element={<AuthRoute session={session}><SEOChecker /></AuthRoute>} />
        <Route path="/content-planner" element={<AuthRoute session={session}><ContentPlanner /></AuthRoute>} />
        <Route path="/brief-generator" element={<AuthRoute session={session}><BriefGenerator /></AuthRoute>} />
        <Route path="/keyword-research" element={<AuthRoute session={session}><KeywordResearch /></AuthRoute>} />
        <Route path="/article-writer" element={<AuthRoute session={session}><ArticleWriter /></AuthRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <Toaster position="bottom-right" toastOptions={{ duration: 3000, style: { fontSize: '13px' } }} />
  </StrictMode>
);
