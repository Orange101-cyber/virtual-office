import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
import VideoTimesheet from './pages/VideoTimesheet';
import ShootPlanner from './pages/ShootPlanner';
import EditWorkflow from './pages/EditWorkflow';
import AdminDashboard from './pages/AdminDashboard';
import OpsBoard from './pages/OpsBoard';
import AdRemix from './pages/AdRemix';
import ClientBucketList from './pages/ClientBucketList';
import ClientMap from './pages/ClientMap';
import ClientAdDashboard from './pages/ClientAdDashboard';
import SEOChat from './pages/SEOChat';
import SEOPerformance from './pages/SEOPerformance';
import SiteHealth from './pages/SiteHealth';
import AIVisibility from './pages/AIVisibility';
import Login from './pages/Login';
import { Toaster } from 'react-hot-toast';
import './index.css';

function AuthLayout({ session }) {
  if (!session) return <Navigate to="/login" replace />;
  return <AppShell><Outlet /></AppShell>;
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
        <Route element={<AuthLayout session={session} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/client-dashboard" element={<ClientDashboard />} />
          <Route path="/seo-checker" element={<SEOChecker />} />
          <Route path="/seo-performance" element={<SEOPerformance />} />
          <Route path="/content-planner" element={<ContentPlanner />} />
          <Route path="/brief-generator" element={<BriefGenerator />} />
          <Route path="/keyword-research" element={<KeywordResearch />} />
          <Route path="/article-writer" element={<ArticleWriter />} />
          <Route path="/virtual-office-games" element={<VirtualOffice />} />
          <Route path="/seo-tools" element={<SEOTools />} />
          <Route path="/ads-hub" element={<AdsHub />} />
          <Route path="/clients" element={<ClientsIndex />} />
          <Route path="/client/:clientName" element={<ClientHub />} />
          <Route path="/ad-inspiration" element={<AdInspiration />} />
          <Route path="/ad-copy-library" element={<AdCopyLibrary />} />
          <Route path="/ad-creative-brief" element={<AdCreativeBrief />} />
          <Route path="/brand-voice" element={<BrandVoice />} />
          <Route path="/video-library" element={<VideoLibrary />} />
          <Route path="/video-timesheet" element={<VideoTimesheet />} />
          <Route path="/shoot-planner" element={<ShootPlanner />} />
          <Route path="/edit-workflow" element={<EditWorkflow />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/ops-board" element={<OpsBoard />} />
          <Route path="/ad-remix" element={<AdRemix />} />
          <Route path="/client-bucket-list" element={<ClientBucketList />} />
          <Route path="/client-map" element={<ClientMap />} />
          <Route path="/client-ad-dashboard" element={<ClientAdDashboard />} />
          <Route path="/seo-chat" element={<SEOChat />} />
          <Route path="/site-health" element={<SiteHealth />} />
          <Route path="/ai-visibility" element={<AIVisibility />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
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
