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
import VirtualOffice from './pages/VirtualOffice';
import SEOTools from './pages/SEOTools';
import AdsHub from './pages/AdsHub';
import ClientsIndex from './pages/ClientsIndex';
import ClientHub from './pages/ClientHub';
import AdInspiration from './pages/AdInspiration';
import AdCopyLibrary from './pages/AdCopyLibrary';
import AdCreativeBrief from './pages/AdCreativeBrief';
import BrandVoice from './pages/BrandVoice';
import VideoLibrary from './pages/VideoLibrary';
import OpsBoard from './pages/OpsBoard';
import AdRemix from './pages/AdRemix';
import ClientBucketList from './pages/ClientBucketList';
import ClientMap from './pages/ClientMap';
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
        <Route path="/virtual-office-games" element={<AuthRoute session={session}><VirtualOffice /></AuthRoute>} />
        <Route path="/seo-tools" element={<AuthRoute session={session}><SEOTools /></AuthRoute>} />
        <Route path="/ads-hub" element={<AuthRoute session={session}><AdsHub /></AuthRoute>} />
        <Route path="/clients" element={<AuthRoute session={session}><ClientsIndex /></AuthRoute>} />
        <Route path="/client/:clientName" element={<AuthRoute session={session}><ClientHub /></AuthRoute>} />
        <Route path="/ad-inspiration" element={<AuthRoute session={session}><AdInspiration /></AuthRoute>} />
        <Route path="/ad-copy-library" element={<AuthRoute session={session}><AdCopyLibrary /></AuthRoute>} />
        <Route path="/ad-creative-brief" element={<AuthRoute session={session}><AdCreativeBrief /></AuthRoute>} />
        <Route path="/brand-voice" element={<AuthRoute session={session}><BrandVoice /></AuthRoute>} />
        <Route path="/video-library" element={<AuthRoute session={session}><VideoLibrary /></AuthRoute>} />
        <Route path="/ops-board" element={<AuthRoute session={session}><OpsBoard /></AuthRoute>} />
        <Route path="/ad-remix" element={<AuthRoute session={session}><AdRemix /></AuthRoute>} />
        <Route path="/client-bucket-list" element={<AuthRoute session={session}><ClientBucketList /></AuthRoute>} />
        <Route path="/client-map" element={<AuthRoute session={session}><ClientMap /></AuthRoute>} />
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
