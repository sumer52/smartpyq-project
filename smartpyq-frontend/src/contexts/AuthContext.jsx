import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';

const AuthContext = createContext();

// Hardcoded demo credentials - frontend-only, zero backend dependency
const DEMO_EMAIL = 'demo@smartpyq.com';
const DEMO_PASSWORD = 'demo123';
const DEMO_SESSION_KEY = 'demo_session';
const DEMO_USER = {
  id: 'demo-001',
  name: 'Demo Student',
  email: DEMO_EMAIL,
  avatar: null,
  role: 'demo',
  course: 'B.Sc Computer Science',
  semester: 'sem5',
  specialization: 'Computer Science',
  academic_year: '3rd Year',
  onboarding_completed: true,
  stats: { papersDownloaded: 47, studyStreak: 12 }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Mock user data for demonstration
  const mockUser = {
    id: 1,
    name: 'sumer',
    email: 'sumer@university.edu',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
    role: 'Student',
    course: 'B.Sc Computer Science',
    year: '3rd Year',
    semester: 'Semester 5',
    joinedDate: '2022-08-15',
    stats: {
      papersDownloaded: 47,
      studyStreak: 12,
      favoriteSubjects: ['Data Structures', 'Algorithms', 'Database Systems'],
      recentActivity: [
        { action: 'Downloaded', item: 'Data Structures - 2023 Paper', time: '2 hours ago' },
        { action: 'Saved', item: 'Algorithms - 2022 Paper', time: '1 day ago' },
        { action: 'Viewed', item: 'Database Systems - 2021 Paper', time: '2 days ago' }
      ]
    }
  };

  useEffect(() => {
    const checkAuthStatus = () => {
      // 1. Check for demo session first
      const demoSession = localStorage.getItem(DEMO_SESSION_KEY);
      if (demoSession) {
        try {
          const parsed = JSON.parse(demoSession);
          if (parsed && parsed.email === DEMO_EMAIL) {
            setUser(DEMO_USER);
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        } catch {}
        localStorage.removeItem(DEMO_SESSION_KEY);
      }

      // 2. Check for real token-based session
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      const userData = localStorage.getItem('userData') || localStorage.getItem('user');
      
      if (token && userData) {
        try {
          // Check if JWT token is expired by decoding payload
          const payload = JSON.parse(atob(token.split('.')[1]));
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp < now) {
            // Token is expired, clear everything
            localStorage.removeItem('auth_token');
            localStorage.removeItem('authToken');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('userData');
            localStorage.removeItem('user');
            setIsLoading(false);
            return;
          }
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Error parsing user data:', error);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
          localStorage.removeItem('user');
        }
      }
      setIsLoading(false);
    };

    checkAuthStatus();
  }, []);

  // Frontend-only demo login
  const loginDemo = useCallback((email, password) => {
    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ email: DEMO_EMAIL, ts: Date.now() }));
      setUser(DEMO_USER);
      setIsAuthenticated(true);
      return { success: true };
    }
    return { success: false, error: 'Invalid demo credentials.' };
  }, []);

  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/simple-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();
      
      // Store tokens
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('authToken', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      // Store user data
      const userData = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        tenant_id: data.user.tenant_id,
        avatar: null,
        course: data.user.course,
        specialization: data.user.specialization,
        academic_year: data.user.academic_year,
        semester: data.user.semester,
        onboarding_completed: data.user.onboarding_completed,
        stats: { papersDownloaded: 0, studyStreak: 0 }
      };
      
      localStorage.setItem('userData', JSON.stringify(userData));
      localStorage.setItem('user', JSON.stringify(userData));
      
      setUser(userData);
      setIsAuthenticated(true);
      setIsLoading(false);
      
      return { success: true, user: userData };
    } catch (error) {
      setIsLoading(false);
      return { success: false, error: error.message || 'Login failed. Please try again.' };
    }
  }, []);

  const register = useCallback(async (userData) => {
    // This is now a lightweight helper used by RegisterPage for non-critical steps
    // The actual account creation happens via /api/v1/auth/register-complete
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    const isDemo = localStorage.getItem(DEMO_SESSION_KEY);
    if (isDemo) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      setUser(null);
      setIsAuthenticated(false);
      return;
    }
    // Try to call backend logout to invalidate tokens
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      if (token) {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }).catch(() => {}); // Best-effort backend logout
      }
    } catch (e) {
      // Ignore errors on logout
    }
    // Clear all stored data
    localStorage.removeItem(DEMO_SESSION_KEY);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('user');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (localStorage.getItem(DEMO_SESSION_KEY)) return true;
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return false;
      
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('authToken', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token);
        }
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }, []);

  // Global fetch interceptor for 401 responses
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401 && isAuthenticated) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          // Token refresh failed, log out
          logout();
        }
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, [isAuthenticated]);

  // Periodic token refresh - check every 30 minutes
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(async () => {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      if (!token) return;
      
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = payload.exp - now;
        
        // If token expires in less than 1 hour, refresh it
        if (timeLeft < 3600 && timeLeft > 0) {
          await refreshAccessToken();
        }
      } catch (e) {
        // Token might be malformed, try refresh
        await refreshAccessToken();
      }
    }, 30 * 60 * 1000); // Check every 30 minutes
    
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const updateUser = useCallback((updatedData) => {
    if (localStorage.getItem(DEMO_SESSION_KEY)) return;
    const updatedUser = { ...user, ...updatedData };
    setUser(updatedUser);
    localStorage.setItem('userData', JSON.stringify(updatedUser));
  }, []);

  const fetchProfile = useCallback(async () => {
    if (localStorage.getItem(DEMO_SESSION_KEY)) return;
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      if (!token) return;
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const profile = await response.json();
        const updatedUser = {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          tenant_id: profile.tenant_id,
          avatar: null,
          course: profile.course,
          specialization: profile.specialization,
          academic_year: profile.academic_year,
          semester: profile.semester,
          onboarding_completed: profile.onboarding_completed,
          stats: { papersDownloaded: 0, studyStreak: 0 }
        };
        setUser(updatedUser);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e);
    }
  }, []);

  const completeOnboarding = useCallback(async (onboardingData) => {
    if (localStorage.getItem(DEMO_SESSION_KEY)) return { success: true };
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(onboardingData)
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Onboarding failed');
      }
      // Refresh profile to get updated data
      await fetchProfile();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [fetchProfile]);

  const updateAcademicProfile = useCallback(async (academicData) => {
    if (localStorage.getItem(DEMO_SESSION_KEY)) return { success: true };
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/profile/academic`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(academicData)
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Update failed');
      }
      await fetchProfile();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [fetchProfile]);

  const deleteAccount = useCallback(async (password) => {
    if (localStorage.getItem(DEMO_SESSION_KEY)) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      setUser(null);
      setIsAuthenticated(false);
      return { success: true };
    }
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      if (!token) throw new Error('Not authenticated');

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password, confirmation: 'DELETE' })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Account deletion failed');
      }

      // Clear all stored auth data
      localStorage.removeItem('auth_token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('userData');
      localStorage.removeItem('user');

      setUser(null);
      setIsAuthenticated(false);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  // Demo user detection
  const isDemoUser = user?.role === 'demo' || localStorage.getItem(DEMO_SESSION_KEY) !== null;

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    isDemoUser,
    login,
    loginDemo,
    register,
    logout,
    updateUser,
    fetchProfile,
    completeOnboarding,
    updateAcademicProfile,
    deleteAccount
  }), [user, isAuthenticated, isLoading, isDemoUser, login, register, logout, updateUser, fetchProfile, completeOnboarding, updateAcademicProfile, deleteAccount]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;