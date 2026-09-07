import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { IntroVideoProvider, useIntroVideo } from './contexts/IntroVideoContext';

import FuturisticHeader from './components/FuturisticHeader';
import VideoBackground from './components/VideoBackground';
import Footer from './components/Footer';
import ChatWidget from './components/ChatWidget';
import ScrollToTop from './components/ScrollToTop';
import IntroVideo from './components/IntroVideo';
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
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const RepeatedQuestionsPage = lazy(() => import('./pages/RepeatedQuestionsPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const AnalysisHistoryPage = lazy(() => import('./pages/AnalysisHistoryPage'));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const CookiePolicyPage = lazy(() => import('./pages/CookiePolicyPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ErrorPage = lazy(() => import('./pages/ErrorPage'));
const AccessibilityStatementPage = lazy(() => import('./pages/AccessibilityStatementPage'));
const AcceptableUsePage = lazy(() => import('./pages/AcceptableUsePage'));

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


const AppContent = function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const { triggerIntro } = useIntroVideo();

  // Gate the Home page for guests only. The intro is exclusive to the /
  // route — any other page opens immediately without the intro.
  useEffect(() => {
    if (!isLoading && location.pathname === '/' && !isAuthenticated) {
      triggerIntro(null);
    }
  }, [isLoading, isAuthenticated, location.pathname]);

  return (
    <div className="App min-h-screen" style={{position:"relative",zIndex:10}}>
      <SkipLink />
      
      
      <VideoBackground />
      
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
      
      {/* Intro Video Overlay - triggered by Home click for guests */}
      <IntroVideo />
      
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
                <Route 
                  path="/login" 
                  element={
                    <PublicRoute>
                      <motion.div
                        initial="initial"
                        animate="in"
                        exit="out"
                        variants={pageVariants}
                        transition={pageTransition}
                      >
                        <LoginPage />
                      </motion.div>
                    </PublicRoute>
                  } 
                />
                
                <Route 
                   path="/dashboard" 
                   element={
                     <ProtectedRoute>
                       <motion.div
                         initial="initial"
                         animate="in"
                         exit="out"
                         variants={pageVariants}
                         transition={pageTransition}
                       >
                         <DashboardPage />
                       </motion.div>
                     </ProtectedRoute>
                   } 
                 />
                 <Route 
                   path="/profile" 
                   element={
                     <ProtectedRoute>
                       <motion.div
                         initial="initial"
                         animate="in"
                         exit="out"
                         variants={pageVariants}
                         transition={pageTransition}
                       >
                         <ProfilePage />
                       </motion.div>
                     </ProtectedRoute>
                   } 
                 />

                <Route 
                  path="/pyq" 
                  element={
                    <ProtectedRoute>
                      <motion.div
                        initial="initial"
                        animate="in"
                        exit="out"
                        variants={pageVariants}
                        transition={pageTransition}
                      >
                        <PYQPage />
                      </motion.div>
                    </ProtectedRoute>
                   }
                 />
                 <Route 
                   path="/repeated-questions" 
                   element={
                     <ProtectedRoute>
                       <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                         <RepeatedQuestionsPage />
                       </motion.div>
                     </ProtectedRoute>
                   }
                 />
                 <Route 
                   path="/analyze"
                   element={
                     <ProtectedRoute>
                       <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                         <AnalysisPage />
                       </motion.div>
                     </ProtectedRoute>
                   }
                 />
                 <Route 
                   path="/practice"
                   element={
                     <ProtectedRoute>
                       <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                         <PracticePage />
                       </motion.div>
                     </ProtectedRoute>
                   }
                 />
                 <Route 
                   path="/search"
                   element={
                     <ProtectedRoute>
                       <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                         <SearchPage />
                       </motion.div>
                     </ProtectedRoute>
                   }
                 />
                 <Route 
                   path="/analysis-history"
                   element={
                     <ProtectedRoute>
                       <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                         <AnalysisHistoryPage />
                       </motion.div>
                     </ProtectedRoute>
                   }
                 />
                 <Route 
                   path="/bookmarks" 
                   element={
                     <ProtectedRoute>
                       <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                         <BookmarksPage />
                       </motion.div>
                     </ProtectedRoute>
                   }
                 />
                <Route 
                  path="/upload" 
                  element={
                    <ProtectedRoute>
                      <motion.div
                        initial="initial"
                        animate="in"
                        exit="out"
                        variants={pageVariants}
                        transition={pageTransition}
                      >
                        <UploadPage />
                      </motion.div>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/ai" 
                  element={
                    <ProtectedRoute>
                      <motion.div
                        initial="initial"
                        animate="in"
                        exit="out"
                        variants={pageVariants}
                        transition={pageTransition}
                      >
                        <AIPage />
                      </motion.div>
                    </ProtectedRoute>
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
                <Route 
                  path="/forgot-password" 
                  element={
                    <PublicRoute>
                      <motion.div
                        initial="initial"
                        animate="in"
                        exit="out"
                        variants={pageVariants}
                        transition={pageTransition}
                      >
                        <ForgotPasswordPage />
                      </motion.div>
                    </PublicRoute>
                  } 
                />
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
                <Route 
                  path="/register" 
                  element={
                    <PublicRoute>
                      <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                        <RegisterPage />
                      </motion.div>
                    </PublicRoute>
                  } 
                />
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
                {/* 404 Catch-all */}
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
      <IntroVideoProvider>
        <AppContent />
      </IntroVideoProvider>
    </AuthProvider>
  );
}

export default App;