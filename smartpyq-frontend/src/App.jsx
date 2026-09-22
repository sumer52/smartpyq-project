import React, { Suspense, lazy } from 'react';
import { Outlet, RouterProvider, Navigate, useLocation, createBrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import FuturisticHeader from './components/FuturisticHeader';
import Footer from './components/Footer';
import ChatWidget from './components/ChatWidget';
import ScrollToTop from './components/ScrollToTop';
import SessionExpiredBanner from './components/SessionExpiredBanner';
import OfflineBanner from './components/OfflineBanner';
import MaintenanceBanner from './components/MaintenanceBanner';

const HomePage = lazy(() => import('./pages/HomePage'));
const PYQPage = lazy(() => import('./pages/PYQPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const AIPage = lazy(() => import('./pages/AIPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const ReportIssuePage = lazy(() => import('./pages/ReportIssuePage'));
const RepeatedQuestionsPage = lazy(() => import('./pages/RepeatedQuestionsPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const AnalysisHistoryPage = lazy(() => import('./pages/AnalysisHistoryPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const CookiePolicyPage = lazy(() => import('./pages/CookiePolicyPage'));
const ErrorPage = lazy(() => import('./pages/ErrorPage'));
const AccessibilityStatementPage = lazy(() => import('./pages/AccessibilityStatementPage'));
const AcceptableUsePage = lazy(() => import('./pages/AcceptableUsePage'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminAnswersPage = lazy(() => import('./pages/admin/AdminAnswersPage'));
const MySubmissionsPage = lazy(() => import('./pages/MySubmissionsPage'));

// Loading component with skeleton
const SpinLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
      <p className="text-muted-500">Loading...</p>
    </div>
  </div>
);

const SkipLink = () => (
  <a href="#main-content" className="skip-link">
    Skip to main content
  </a>
);

// Admin area guard: REQUIRES authentication AND an admin role. Students and
// guests are bounced to /admin/login. Backend authorization is the real
// enforcement layer — this is UX, not security.
const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const location = useLocation();
  if (isLoading) return <SpinLoader />;
  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }
  return children;
};

// Route element helper: optional auth guard + per-route Suspense around the
// lazy page. Route changes animate via the native View Transition API
// (navigations tagged with `viewTransition`); no per-page motion wrappers.
function pageElement(Guard, Page) {
  const content = (
    <Suspense fallback={<SpinLoader />}>
      <Page />
    </Suspense>
  );
  return Guard ? <Guard>{content}</Guard> : content;
}

const REDIRECTS_TO_HOME = ['/login', '/register', '/signup', '/forgot-password', '/dashboard', '/profile'];

const router = createBrowserRouter([
  {
    // Pathless layout: persistent chrome renders once, <Outlet /> swaps pages.
    element: <AppLayout />,
    children: [
      { path: '/', element: pageElement(null, HomePage) },
      // Student auth removed — the platform is fully public.
      // Old auth URLs redirect instead of showing login screens.
      ...REDIRECTS_TO_HOME.map((p) => ({ path: p, element: <Navigate to="/" replace /> })),

      { path: '/pyq', element: pageElement(null, PYQPage) },
      { path: '/repeated-questions', element: pageElement(null, RepeatedQuestionsPage) },
      { path: '/analyze', element: pageElement(null, AnalysisPage) },
      { path: '/practice', element: pageElement(null, PracticePage) },
      { path: '/search', element: pageElement(null, SearchPage) },
      { path: '/analysis-history', element: pageElement(null, AnalysisHistoryPage) },
      // Upload: admin-only content management. Non-admins are
      // routed to the admin login ("Upload PDF -> Admin Login").
      { path: '/upload', element: pageElement(AdminRoute, UploadPage) },
      { path: '/ai', element: pageElement(null, AIPage) },
      { path: '/contact', element: pageElement(null, ContactPage) },
      { path: '/faq', element: pageElement(null, FAQPage) },
      { path: '/privacy', element: pageElement(null, PrivacyPage) },
      { path: '/terms', element: pageElement(null, TermsPage) },
      { path: '/report-issue', element: pageElement(null, ReportIssuePage) },
      { path: '/cookies', element: pageElement(null, CookiePolicyPage) },
      { path: '/error/:code', element: pageElement(null, ErrorPage) },
      { path: '/accessibility', element: pageElement(null, AccessibilityStatementPage) },
      { path: '/acceptable-use', element: pageElement(null, AcceptableUsePage) },
      // Admin area — separate UI, backend-enforced authorization
      { path: '/admin/login', element: pageElement(null, AdminLoginPage) },
      { path: '/admin', element: pageElement(AdminRoute, AdminDashboardPage) },
      { path: '/admin/answers', element: pageElement(AdminRoute, AdminAnswersPage) },
      // Public: community uploads need no account; the page
      // tracks anonymous contributions via a stored token.
      { path: '/my-papers', element: pageElement(null, MySubmissionsPage) },
      { path: '*', element: pageElement(null, NotFoundPage) },
    ],
  },
]);

function AppLayout() {
  return (
    <AuthProvider>
      <div className="App min-h-screen" style={{position:"relative",zIndex:10}}>
        <SkipLink />
        <FuturisticHeader />
        <ScrollToTop />
        <SessionExpiredBanner />
        <OfflineBanner />
        <MaintenanceBanner />

        <main id="main-content" className="flex-1 relative" style={{zIndex:10, paddingTop: "70px"}}>
          <Outlet />
        </main>

        {/* Footer */}
        <Footer />

        {/* Chat Widget */}
        <ChatWidget />

        {/* Live Region for Screen Readers */}
        <div
          id="live-region"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        ></div>
      </div>
    </AuthProvider>
  );
}

function App() {
  return <RouterProvider router={router} />;
}

export default App;
