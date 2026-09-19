import { useState, useEffect, useCallback, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HomeIcon, BookOpenIcon, CloudArrowUpIcon, ChatBubbleLeftRightIcon, UserIcon, ArrowRightOnRectangleIcon, Cog6ToothIcon, FireIcon, MagnifyingGlassIcon, AcademicCapIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
const FuturisticHeader = memo(() => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [entered, setEntered] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout, isDemoUser, isAdmin } = useAuth();
  
  const handleHomeClick = useCallback(
    (e) => {
      e.preventDefault();
      navigate('/');
    },
    [navigate]
  );
  
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Scrolled state: pill gains a stronger surface + shadow once the page
  // scrolls past the hero fold. rAF-throttled scroll listener.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 24);
        raf = 0;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  
  useEffect(() => {
    setShowUserMenu(false);
    setShowMobileMenu(false);
  }, [location.pathname, location.search]);
  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate('/');
  };

  // The whole student platform is public — no login needed for any of it.
  // Signed-in admins work from the Dashboard: the header swaps the Home link
  // for a prominent Dashboard button instead.
  const navItems = [
        { name: 'Home', href: '/', icon: HomeIcon, hiddenForAdmin: true },
        { name: 'PYQ', href: '/pyq', icon: BookOpenIcon },
        { name: 'Practice', href: '/practice', icon: AcademicCapIcon },
        { name: 'Search', href: '/search', icon: MagnifyingGlassIcon },
        { name: 'AI', href: '/ai', icon: ChatBubbleLeftRightIcon },
        // Single unified upload page: submit a paper (no account needed) and
        // track your submissions; admins publish instantly from here too.
        { name: 'Upload', href: '/my-papers', icon: CloudArrowUpIcon },
      ].filter(item => (!item.adminOnly || isAdmin) && (!item.hiddenForAdmin || !isAdmin));

  // Only highlight the item whose href exactly matches the current path
  const isActive = (item) => location.pathname === item.href;

  return (
    <header className={'fh ' + (entered ? 'fh--entered' : '') + (scrolled ? ' fh--scrolled' : '')} role='banner'>
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
          {isAuthenticated && isAdmin ? (
            <div className='relative flex items-center gap-2'>
              <Link to='/admin' className='fh__login' aria-label='Admin Dashboard' style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.2))', borderColor: 'rgba(16,185,129,0.4)', color: '#6ee7b7' }}>
                DASHBOARD
              </Link>
              <button onClick={() => setShowUserMenu(!showUserMenu)} className='fh__avatar-btn' aria-label='Admin menu' aria-expanded={showUserMenu}>
                <div className='fh__avatar'>{user?.name?.charAt(0)?.toUpperCase() || 'A'}</div>
              </button>
              <AnimatePresence>
                {showUserMenu && (
                  <motion.div className='fh__dropdown' initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }}>
                    <div className='fh__dd-head'>
                      <p className='fh__dd-name'>{user?.name}</p>
                      <p className='fh__dd-course'>Administrator</p>
                    </div>
                    <Link to='/admin' className='fh__dd-item text-emerald-400' onClick={() => setShowUserMenu(false)}><ShieldCheckIcon className='h-4 w-4' /> Admin Dashboard</Link>
                    <Link to='/my-papers' className='fh__dd-item' onClick={() => setShowUserMenu(false)}><CloudArrowUpIcon className='h-4 w-4' /> Upload Paper</Link>
                    <hr className='border-white/[0.06] my-1' />
                    <button onClick={handleLogout} className='fh__dd-item text-red-400 hover:bg-red-500/10'><ArrowRightOnRectangleIcon className='h-4 w-4' /> Logout</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : isAuthenticated && !isAdmin ? (
            /* Legacy signed-in student session: offer sign-out, no student
               dashboard/profile destinations exist anymore. */
            <button onClick={handleLogout} className='fh__login' aria-label='Sign out legacy session'>SIGN&nbsp;OUT</button>
          ) : (
            /* Public visitors see no login chrome at all. Admin entry lives
               in the footer (Admin Login) and behind Upload. */
            <Link to='/admin/login' className='fh__login' aria-label='Admin login'>ADMIN</Link>
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
            {isAdmin && (
              <a href='/admin' className='fh__mobile-item fh__mobile-item--in' style={{ animationDelay: '0s', color: '#6ee7b7' }}>
                <ShieldCheckIcon className='h-4 w-4' /> Dashboard
              </a>
            )}
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const active = isActive(item, index);
              return (
                <a key={item.name} href={item.href}
                  onClick={item.name === 'Home' ? handleHomeClick : undefined}
                  className={'fh__mobile-item fh__mobile-item--in' + (active ? ' fh__mobile-item--active' : '')}
                  style={{ animationDelay: (index + 1) * 0.03 + 's' }}
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
