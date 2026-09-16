import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import FuturisticHeader from './components/FuturisticHeader';
import Footer from './components/Footer';
import ChatWidget from './components/ChatWidget';
import ScrollToTop from './components/ScrollToTop';
import SessionExpiredBanner from './components/SessionExpiredBanner';
import OfflineBanner from './components/OfflineBanner';
import MaintenanceBanner from './components/MaintenanceBanner';
import ScrollProgress from './components/ui/ScrollProgress';

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
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'));
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

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 },
};

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.3,
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <SpinLoader />;
  return isAuthenticated ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <SpinLoader />;
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

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


const AppContent = function AppContent() {

  return (
    <div className="App min-h-screen" style={{position:"relative",zIndex:10}}>
      <SkipLink />
      <ScrollProgress />
      
      
      {/* Ambient background orbs - wrapped in overflow:hidden to prevent mobile horizontal scroll */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="ambient-orb ambient-orb--purple" style={{width:'600px',height:'600px',top:'-200px',right:'-200px'}} />
        <div className="ambient-orb ambient-orb--blue" style={{width:'500px',height:'500px',bottom:'-150px',left:'-150px'}} />
        <div className="ambient-orb ambient-orb--pink" style={{width:'400px',height:'400px',top:'40%',left:'30%'}} />
      </div>
      <FuturisticHeader />
      <ScrollToTop />
      <SessionExpiredBanner />
      <OfflineBanner />
      <MaintenanceBanner />
      
      
      <main id="main-content" className="flex-1 relative" style={{zIndex:10, paddingTop: "70px"}}>
      {/* Main Content */}
        <AnimatePresence mode="wait">
          <Suspense fallback={<SpinLoader />}>
            <Routes>
                <Route 
                  path="/" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <HomePage />
                    </motion.div>
                  } 
                />
                {/* Student auth removed — the platform is fully public.
                    Old auth URLs redirect instead of showing login screens. */}
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/register" element={<Navigate to="/" replace />} />
                <Route path="/signup" element={<Navigate to="/" replace />} />
                <Route path="/forgot-password" element={<Navigate to="/" replace />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/profile" element={<Navigate to="/" replace />} />

                <Route 
                  path="/pyq" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <PYQPage />
                    </motion.div>
                  }
                 />
                 <Route 
                   path="/repeated-questions" 
                   element={
                     <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                       <RepeatedQuestionsPage />
                     </motion.div>
                   }
                 />
                 <Route 
                   path="/analyze"
                   element={
                     <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                       <AnalysisPage />
                     </motion.div>
                   }
                 />                 <Route 
                   path="/practice" 
                   element={
                     <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                       <PracticePage />
                     </motion.div>
                   }
                 />                 <Route 
                   path="/search" 
                   element={
                     <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                       <SearchPage />
                     </motion.div>
                   }
                 />
                 <Route 
                   path="/analysis-history"
                   element={
                     <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                       <AnalysisHistoryPage />
                     </motion.div>
                   }
                 />
                 <Route 
                   path="/bookmarks" 
                   element={
                     <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                       <BookmarksPage />
                     </motion.div>
                   }
                 />
                {/* Upload: admin-only content management. Non-admins are
                    routed to the admin login ("Upload PDF -> Admin Login"). */}
                <Route 
                  path="/upload" 
                  element={
                    <AdminRoute>
                      <motion.div
                        initial="initial"
                        animate="in"
                        exit="out"
                        variants={pageVariants}
                        transition={pageTransition}
                      >
                        <UploadPage />
                      </motion.div>
                    </AdminRoute>
                  } 
                />
                <Route 
                  path="/ai" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <AIPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/contact" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <ContactPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/faq" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <FAQPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/privacy" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <PrivacyPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/terms" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <TermsPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/report-issue" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <ReportIssuePage />
                    </motion.div>
                  } 
                />
                {/* forgot-password removed — redirects above */}
                <Route 
                  path="/cookies" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <CookiePolicyPage />
                    </motion.div>
                  } 
                />
                {/* register removed — redirects above */}
                <Route 
                  path="/error/:code" 
                  element={
                    <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                      <ErrorPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/accessibility" 
                  element={
                    <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                      <AccessibilityStatementPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/acceptable-use" 
                  element={
                    <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                      <AcceptableUsePage />
                    </motion.div>
                  } 
                />
                {/* Admin area — separate UI, backend-enforced authorization */}
                <Route 
                  path="/admin/login" 
                  element={
                    <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                      <AdminLoginPage />
                    </motion.div>
                  } 
                />
                <Route 
                  path="/admin" 
                  element={
                    <AdminRoute>
                      <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                        <AdminDashboardPage />
                      </motion.div>
                    </AdminRoute>
                  } 
                />
                <Route 
                  path="/admin/answers" 
                  element={
                    <AdminRoute>
                      <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                        <AdminAnswersPage />
                      </motion.div>
                    </AdminRoute>
                  } 
                />
                <Route 
                  path="/my-papers" 
                  element={
                    <ProtectedRoute>
                      <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                        <MySubmissionsPage />
                      </motion.div>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="*" 
                  element={
                    <motion.div
                      initial="initial"
                      animate="in"
                      exit="out"
                      variants={pageVariants}
                      transition={pageTransition}
                    >
                      <NotFoundPage />
                    </motion.div>
                  } 
                />
              </Routes>
            </Suspense>
          </AnimatePresence>
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
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;