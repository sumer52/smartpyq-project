import { useState, useEffect, useCallback, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HomeIcon, BookOpenIcon, CloudArrowUpIcon, ChatBubbleLeftRightIcon, ArrowRightOnRectangleIcon, MagnifyingGlassIcon, AcademicCapIcon, ShieldCheckIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';

const SiteHeader = memo(() => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout, isDemoUser, isAdmin } = useAuth();

  const handleHomeClick = useCallback(
    (e) => {
      e.preventDefault();
      navigate('/', { viewTransition: true });
    },
    [navigate]
  );

  // Hairline rule appears once the page scrolls past the fold.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 12);
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
    navigate('/', { viewTransition: true });
  };

  // The whole student platform is public — no login needed for any of it.
  // Signed-in admins work from the Dashboard: the header swaps the Home link
  // for a prominent Dashboard button instead.
  const navItems = [
    { name: 'Home', href: '/', icon: HomeIcon, hiddenForAdmin: true },
    { name: 'PYQ Hub', href: '/pyq', icon: BookOpenIcon },
    { name: 'Practice', href: '/practice', icon: AcademicCapIcon },
    { name: 'Search', href: '/search', icon: MagnifyingGlassIcon },
    { name: 'AI', href: '/ai', icon: ChatBubbleLeftRightIcon },
    { name: 'My Papers', href: '/my-papers', icon: DocumentArrowUpIcon },
    // Everyone can upload: visitors hit the public upload page; admins
    // get the full upload wizard (their papers publish without review).
    { name: 'Upload', href: isAdmin ? '/upload' : '/my-papers', icon: CloudArrowUpIcon },
  ].filter(item => (!item.adminOnly || isAdmin) && (!item.hiddenForAdmin || !isAdmin));

  // Only highlight the item whose href exactly matches the current path
  const isActive = (item) => location.pathname === item.href;

  return (
    <header className={'site-header' + (scrolled ? ' site-header--scrolled' : '')} role='banner'
      style={{ viewTransitionName: 'site-header' }}>
      <div className='site-header__inner'>
        <Link to='/' onClick={handleHomeClick} className='site-header__wordmark' aria-label='SmartPYQ Home'>
          <span className='site-header__mark' aria-hidden='true'>S</span>
          <span>SmartPYQ</span>
        </Link>

        <nav className='site-header__nav' role='navigation' aria-label='Main navigation'>
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link key={item.name} to={item.href} viewTransition
                onClick={item.name === 'Home' ? handleHomeClick : undefined}
                className={'site-header__nav-item' + (active ? ' site-header__nav-item--active' : '')}
                aria-current={active ? 'page' : undefined}>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button className='site-header__hamburger' onClick={() => setShowMobileMenu(!showMobileMenu)} aria-label='Menu' aria-expanded={showMobileMenu}>
          <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'>
            {showMobileMenu
              ? <path d='M18 6L6 18M6 6l12 12' />
              : <path d='M4 6h16M4 12h16M4 18h16' />
            }
          </svg>
        </button>

        <div className='site-header__right'>
          {isAuthenticated && isAdmin ? (
            <div className='relative flex items-center gap-2'>
              <Link to='/admin' viewTransition className='site-header__cta' aria-label='Admin Dashboard'>
                Dashboard
              </Link>
              <button onClick={() => setShowUserMenu(!showUserMenu)} className='site-header__avatar-btn' aria-label='Admin menu' aria-expanded={showUserMenu}>
                <div className='site-header__avatar'>{user?.name?.charAt(0)?.toUpperCase() || 'A'}</div>
              </button>
              <AnimatePresence>
                {showUserMenu && (
                  <motion.div className='site-header__dropdown' initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                    <div className='site-header__dd-head'>
                      <p className='site-header__dd-name'>{user?.name}</p>
                      <p className='site-header__dd-course'>Administrator</p>
                    </div>
                    <Link to='/admin' viewTransition className='site-header__dd-item' onClick={() => setShowUserMenu(false)}><ShieldCheckIcon className='h-4 w-4' /> Admin Dashboard</Link>
                    <Link to='/upload' viewTransition className='site-header__dd-item' onClick={() => setShowUserMenu(false)}><CloudArrowUpIcon className='h-4 w-4' /> Upload PDF</Link>
                    <hr className='border-muted-200 my-1' />
                    <button onClick={handleLogout} className='site-header__dd-item text-error'><ArrowRightOnRectangleIcon className='h-4 w-4' /> Logout</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : isAuthenticated && !isAdmin ? (
            /* Legacy signed-in student session: offer sign-out, no student
               dashboard/profile destinations exist anymore. */
            <button onClick={handleLogout} className='site-header__cta' aria-label='Sign out legacy session'>Sign&nbsp;out</button>
          ) : (
            /* Public visitors see no login chrome. Admin entry lives in the
               footer (Admin Login) and behind Upload. */
            <Link to='/admin/login' viewTransition className='site-header__cta' aria-label='Admin login'>Admin</Link>
          )}
        </div>
      </div>
      {/* Mobile menu — plain list below the bar. */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div
            className='site-header__mobile'
            onClick={(e) => { if (e.target.closest('a')) setShowMobileMenu(false); }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {isAdmin && (
              <a href='/admin' className='site-header__mobile-item'>
                <ShieldCheckIcon className='h-4 w-4' /> Dashboard
              </a>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <a key={item.name} href={item.href}
                  onClick={item.name === 'Home' ? handleHomeClick : undefined}
                  className={'site-header__mobile-item' + (active ? ' site-header__mobile-item--active' : '')}
                >
                  <Icon className='h-4 w-4' />
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

// Demo-mode badge. Rendered OUTSIDE <header> on purpose: fixed positioning
// anchors to the real viewport, bottom-center, where it collides with nothing.
const DemoModeBadge = () => {
  const { isAuthenticated, isDemoUser } = useAuth();
  if (!(isAuthenticated && isDemoUser)) return null;
  return (
    <div className="demo-mode-badge" role="status">
      Demo Mode: Full Access
    </div>
  );
};

const HeaderWithDemoBadge = (props) => (
  <>
    <SiteHeader {...props} />
    <DemoModeBadge />
  </>
);

export default HeaderWithDemoBadge;
