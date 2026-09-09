import { useState, useEffect, useCallback, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HomeIcon, BookOpenIcon, CloudArrowUpIcon, ChatBubbleLeftRightIcon, UserIcon, ArrowRightOnRectangleIcon, Cog6ToothIcon, FireIcon, MagnifyingGlassIcon, AcademicCapIcon, HeartIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useIntroVideo } from '../contexts/IntroVideoContext';const FuturisticHeader = memo(() => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [entered, setEntered] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout, isDemoUser } = useAuth();
  const { triggerIntro } = useIntroVideo();
  
  const handleHomeClick = useCallback(
    (e) => {
      e.preventDefault();
      if (!isAuthenticated) {
        triggerIntro(() => navigate('/'));
      } else {
        navigate('/');
      }
    },
    [isAuthenticated, triggerIntro, navigate]
  );
  
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(t);
  }, []);
  
  useEffect(() => {
    setShowUserMenu(false);
    setShowMobileMenu(false);
  }, [location.pathname, location.search]);
  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate('/login');
  };

  const navItems = [
        { name: 'Home', href: '/', icon: HomeIcon },
        { name: 'PYQ', href: isAuthenticated ? '/pyq' : '/login', icon: BookOpenIcon },
        { name: 'Upload', href: isAuthenticated ? '/upload' : '/login', icon: CloudArrowUpIcon },
        { name: 'AI', href: isAuthenticated ? '/ai' : '/login', icon: ChatBubbleLeftRightIcon },
        { name: 'Analyze', href: isAuthenticated ? '/analyze' : '/login', icon: FireIcon },
        { name: 'Search', href: isAuthenticated ? '/search' : '/login', icon: MagnifyingGlassIcon },
        { name: 'Practice', href: isAuthenticated ? '/practice' : '/login', icon: AcademicCapIcon },
        { name: 'Bookmarks', href: isAuthenticated ? '/bookmarks' : '/login', icon: HeartIcon },
      ];

  // Only highlight the item whose href exactly matches the current path
  // When not authenticated, multiple items share '/login' href - only highlight the first one (PYQ)
  const isActive = (item, index) => {
    if (location.pathname !== item.href) return false;
    if (!isAuthenticated && item.href === '/login') {
      return index === 1; // Only PYQ (index 1) shows active on login page
    }
    return true;
  };

  return (
    <header className={'fh ' + (entered ? 'fh--entered' : '')} role='banner'>
      <div className='fh__pill'>
        <Link to='/' onClick={handleHomeClick} className='fh__logo' aria-label='SmartPYQ Home'>
          <img src='/logo.png' alt='SmartPYQ' className='fh__logo-img' />
        </Link>

        <nav className='fh__nav' role='navigation' aria-label='Main navigation'>
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const active = isActive(item, index);
            return (
              <Link key={item.name} to={item.href}
                onClick={item.name === 'Home' ? handleHomeClick : undefined}
                className={'fh__nav-item' + (active ? ' fh__nav-item--active' : '')}
                aria-current={active ? 'page' : undefined}>
                <Icon className='fh__nav-icon' />
                <span className='fh__nav-label'>{item.name}</span>
                {active && <motion.div className='fh__nav-indicator' layoutId='fh-indicator'
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }} />}
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button className='fh__hamburger' onClick={() => setShowMobileMenu(!showMobileMenu)} aria-label='Menu' aria-expanded={showMobileMenu}>
          <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
            {showMobileMenu
              ? <path d='M18 6L6 18M6 6l12 12' />
              : <path d='M4 6h16M4 12h16M4 18h16' />
            }
          </svg>
        </button>

        <div className='fh__right'>
          {isAuthenticated ? (
            <div className='relative'>
              <button onClick={() => setShowUserMenu(!showUserMenu)} className='fh__avatar-btn' aria-label='User menu' aria-expanded={showUserMenu}>
                <div className='fh__avatar'>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
              </button>
              <AnimatePresence>
                {showUserMenu && (
                  <motion.div className='fh__dropdown' initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }}>
                    <div className='fh__dd-head'>
                      <p className='fh__dd-name'>{user?.name}</p>
                      <p className='fh__dd-course'>{user?.course || 'Student'}</p>
                    </div>
                    <Link to='/dashboard' className='fh__dd-item' onClick={() => setShowUserMenu(false)}><UserIcon className='h-4 w-4' /> Dashboard</Link>
                    <Link to='/profile' className='fh__dd-item' onClick={() => setShowUserMenu(false)}><Cog6ToothIcon className='h-4 w-4' /> Settings</Link>
                    <hr className='border-white/[0.06] my-1' />
                    <button onClick={handleLogout} className='fh__dd-item text-red-400 hover:bg-red-500/10'><ArrowRightOnRectangleIcon className='h-4 w-4' /> Logout</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link to='/login' className='fh__login'>LOGIN</Link>
          )}
        </div>
      </div>
      {/* Mobile menu dropdown — animated open/close.
          Parent-only framer animation (children stagger via CSS); a
          parent/child variant chain can freeze mid-flight if rAF is
          throttled, leaving the menu stuck invisible. */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div
            className='fh__mobile-menu'
            onClick={(e) => { if (e.target.closest('a')) setShowMobileMenu(false); }}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const active = isActive(item, index);
              return (
                <a key={item.name} href={item.href}
                  onClick={item.name === 'Home' ? handleHomeClick : undefined}
                  className={'fh__mobile-item fh__mobile-item--in' + (active ? ' fh__mobile-item--active' : '')}
                  style={{ animationDelay: index * 0.03 + 's' }}
                >
                  <Icon className='fh__mobile-icon' />
                  <span>{item.name}</span>
                </a>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      {showUserMenu && <div className='fixed inset-0 z-40' onClick={() => setShowUserMenu(false)} />}
    </header>
  );
});

// Demo-mode badge. Rendered OUTSIDE <header> on purpose: the header has a
// transform (entrance animation), which makes it the containing block for
// position:fixed descendants — a fixed badge inside it gets positioned
// relative to the header and overlaps the nav links. From here it anchors to
// the real viewport, bottom-center, where it collides with nothing.
const DemoModeBadge = () => {
  const { isAuthenticated, isDemoUser } = useAuth();
  if (!(isAuthenticated && isDemoUser)) return null;
  return (
    <div className="demo-mode-badge" role="status">
      <span aria-hidden="true">🎯</span>
      Demo Mode — Full Access
    </div>
  );
};

const HeaderWithDemoBadge = (props) => (
  <>
    <FuturisticHeader {...props} />
    <DemoModeBadge />
  </>
);

export default HeaderWithDemoBadge;
