/* eslint-disable react-refresh/only-export-components -- entry file; routes are lazy-loaded */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import AppShell from './components/AppShell';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const SEOChecker = lazy(() => import('./pages/SEOChecker'));
const ClientDashboard = lazy(() => import('./pages/ClientDashboard'));
const ContentPlanner = lazy(() => import('./pages/ContentPlanner'));
const BriefGenerator = lazy(() => import('./pages/BriefGenerator'));
const KeywordResearch = lazy(() => import('./pages/KeywordResearch'));
const ArticleWriter = lazy(() => import('./pages/ArticleWriter'));
const VirtualOffice = lazy(() => import('./pages/VirtualOffice'));
const SEOTools = lazy(() => import('./pages/SEOTools'));
const AdsHub = lazy(() => import('./pages/AdsHub'));
const ClientsIndex = lazy(() => import('./pages/ClientsIndex'));
const ClientHub = lazy(() => import('./pages/ClientHub'));
const AdInspiration = lazy(() => import('./pages/AdInspiration'));
const AdCopyLibrary = lazy(() => import('./pages/AdCopyLibrary'));
const AdCreativeBrief = lazy(() => import('./pages/AdCreativeBrief'));
const BrandVoice = lazy(() => import('./pages/BrandVoice'));
const VideoLibrary = lazy(() => import('./pages/VideoLibrary'));
const VideoTimesheet = lazy(() => import('./pages/VideoTimesheet'));
const ShootPlanner = lazy(() => import('./pages/ShootPlanner'));
const EditWorkflow = lazy(() => import('./pages/EditWorkflow'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const OpsBoard = lazy(() => import('./pages/OpsBoard'));
const AdRemix = lazy(() => import('./pages/AdRemix'));
const ClientBucketList = lazy(() => import('./pages/ClientBucketList'));
const ClientMap = lazy(() => import('./pages/ClientMap'));
const ClientAdDashboard = lazy(() => import('./pages/ClientAdDashboard'));
const SEOChat = lazy(() => import('./pages/SEOChat'));
const SEOPerformance = lazy(() => import('./pages/SEOPerformance'));
const SiteHealth = lazy(() => import('./pages/SiteHealth'));
const AIVisibility = lazy(() => import('./pages/AIVisibility'));
const RankTracker = lazy(() => import('./pages/RankTracker'));
const SiteAuditor = lazy(() => import('./pages/SiteAuditor'));
const GscReporting = lazy(() => import('./pages/GscReporting'));
const CRM = lazy(() => import('./pages/CRM'));
const KeywordExport = lazy(() => import('./pages/KeywordExport'));
import Login from './pages/Login';
import { Toaster } from 'react-hot-toast';
import './index.css';

function AuthLayout({ session }) {
  if (!session) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Suspense fallback={<div className="p-6 text-[12px] text-gray-400">Loading…</div>}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
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
          <Route path="/dashboard" element={<AnalyticsDashboard />} />
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
          <Route path="/crm" element={<CRM />} />
          <Route path="/keyword-export" element={<KeywordExport />} />
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
          <Route path="/rank-tracker" element={<RankTracker />} />
          <Route path="/site-auditor" element={<SiteAuditor />} />
          <Route path="/gsc-reporting" element={<GscReporting />} />
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
