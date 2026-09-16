// API Configuration and Utilities
// Backend origin comes from the single config module (backendUrl.js).
import { BACKEND_URL, assertBackendConfigured } from './backendUrl';

import { isDemoSessionActive, attachDemoBackendSession } from './demoSession';

// Surface a missing production configuration on the first API call.
assertBackendConfigured();

// Custom error classes for better error handling
class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required', data = null) {
    super(message, 401, data);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends ApiError {
  constructor(message = 'Access denied', data = null) {
    super(message, 403, data);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', data = null) {
    super(message, 404, data);
    this.name = 'NotFoundError';
  }
}

// API Client with error handling
class ApiClient {
  constructor(baseURL = BACKEND_URL) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    this.onUnauthorized = null; // Callback for 401 errors
  }

  // Set callback for handling unauthorized errors
  setUnauthorizedHandler(handler) {
    this.onUnauthorized = handler;
  }

  // Shared token refresh — concurrent 401s wait for ONE refresh attempt so
  // rotating refresh tokens can't invalidate each other.
  async refreshAccessToken() {
    if (this._refreshPromise) return this._refreshPromise;
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return null;
    this._refreshPromise = (async () => {
      try {
        const refreshResponse = await fetch(`${this.baseURL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!refreshResponse.ok) return null;
        const refreshData = await refreshResponse.json();
        localStorage.setItem('auth_token', refreshData.access_token);
        localStorage.setItem('authToken', refreshData.access_token);
        if (refreshData.refresh_token) {
          localStorage.setItem('refresh_token', refreshData.refresh_token);
        }
        return refreshData.access_token;
      } catch {
        return null;
      } finally {
        // Clear after a microtask so same-tick 401s share this attempt
        setTimeout(() => { this._refreshPromise = null; }, 0);
      }
    })();
    return this._refreshPromise;
  }

  // Get authentication headers
  getAuthHeaders() {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    return token ? { ...this.defaultHeaders, Authorization: `Bearer ${token}` } : this.defaultHeaders;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!localStorage.getItem('auth_token');
  }

  // Clear authentication token
  clearAuth() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('userData');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getAuthHeaders(),
      ...options,
    };
    // Multipart bodies must set their own boundary — never send the default
    // JSON content-type with a FormData payload.
    if (options.body instanceof FormData) {
      const headers = { ...config.headers };
      delete headers['Content-Type'];
      delete headers['content-type'];
      config.headers = headers;
    }

    // A demo session silently attaches the real backend demo account so feature
    // pages (PYQ Hub, Upload, Analysis, Practice) can load actual data. This is a
    // no-op when no demo session is active or the backend is unreachable.
    if (isDemoSessionActive() && !localStorage.getItem('auth_token') && !localStorage.getItem('authToken')) {
      await attachDemoBackendSession();
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      if (options.headers) {
        config.headers = token && !options.headers.Authorization
          ? { ...options.headers, Authorization: `Bearer ${token}` }
          : options.headers;
      } else {
        config.headers = this.getAuthHeaders();
      }
    }

    try {
      const response = await fetch(url, config);
      
      // Handle different error status codes
      if (!response.ok) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (e) {
          // Response might not be JSON
        }

        const errorMessage = errorData?.detail || errorData?.message || `HTTP ${response.status}`;

        switch (response.status) {
          case 401: {
            // Try ONE shared refresh before giving up
            const newToken = (!url.includes('/auth/refresh') && !url.includes('/auth/login'))
              ? await this.refreshAccessToken()
              : null;
            if (newToken) {
              // Retry original request with the new token
              config.headers = { ...config.headers, Authorization: `Bearer ${newToken}` };
              const retryResponse = await fetch(url, config);
              if (retryResponse.ok) return await retryResponse.json();
            }
            // Demo sessions are never force-logged-out here: when the backend is
            // unreachable (or rejects the demo account) the caller handles it.
            if (isDemoSessionActive()) {
              throw new UnauthorizedError(errorMessage, errorData);
            }
            // If refresh failed or no refresh token, clear auth
            this.clearAuth();
            // Public platform: surface the error to the caller instead of
            // bouncing visitors to a login page that no longer exists.
            if (this.onUnauthorized) {
              this.onUnauthorized(errorMessage);
            }
            throw new UnauthorizedError(errorMessage, errorData);
          }

          case 403:
            throw new ForbiddenError(errorMessage, errorData);

          case 404:
            throw new NotFoundError(errorMessage, errorData);

          case 422:
            // Validation error
            throw new ApiError(`Validation error: ${errorMessage}`, 422, errorData);

          case 429:
            // Rate limited
            throw new ApiError('Too many requests. Please try again later.', 429, errorData);

          case 500:
          case 502:
          case 503:
            throw new ApiError('Server error. Please try again later.', response.status, errorData);

          default:
            throw new ApiError(errorMessage, response.status, errorData);
        }
      }
      
      // Handle empty responses (204 No Content)
      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      // Re-throw API errors (don't fall back to mock data)
      if (error instanceof ApiError) {
        throw error;
      }

      // Network errors or other fetch failures
      console.error('API request failed:', error);
      throw new ApiError(`Network error: ${error.message}`, 0);
    }
  }

  async getFeatures() {
    return this.request('/api/v1/features');
  }

  async getPapers(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/v1/papers?${queryString}`);
  }

  async searchPapers(query = '', filters = {}) {
    const params = { q: query, ...filters };
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/v1/papers?${queryString}`);
  }

  async getPaperById(id) {
    return this.request(`/api/v1/papers/${id}`);
  }

  async authorizePaperDownload(id) {
    const url = `${this.baseURL}/api/v1/papers/${id}/download`;
    const headers = {};
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      if (response.status === 401) { this.clearAuth(); throw new UnauthorizedError('Authentication required'); }
      throw new ApiError('Download failed', response.status);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    let filename = 'paper_' + id + '.pdf';
    const match = disposition.match(/filename[^;=]*="?([^"]+)/i);
    if (match) filename = match[1].trim();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return { success: true, filename };
  }

  async stampPaper(id, watermarkData) {
    // TODO: Implement actual watermark stamping
    return this.request(`/api/v1/papers/${id}/stamp`, {
      method: 'POST',
      body: JSON.stringify(watermarkData)
    });
  }

  async analyzePaper(formData) {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.request('/api/v1/papers/analyze', {
      method: 'POST',
      headers: headers,
      body: formData
    });
  }

  async uploadPaper(formData) {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.request('/api/v1/papers/upload', {
      method: 'POST',
      headers: headers,
      body: formData
    });
  }

  async sendChatMessage(message, sessionId) {
    // TODO: Implement actual chat API
    return this.request('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId })
    });
  }



  // Analysis API
  async startAnalysis(paperIds) {
    return this.request('/api/v1/analysis/analyze', {
      method: 'POST',
      body: JSON.stringify(paperIds)
    });
  }

  // Public multi-paper PYQ analysis (PYQ Hub flow). One synchronous request
  // returning {analysis_id, reused, insights, paper_ids}.
  async analyzePapersPublic(paperIds) {
    return this.request('/api/v1/analysis/analyze-public', {
      method: 'POST',
      body: JSON.stringify({ paper_ids: paperIds })
    });
  }

  // Question detail with recurrence evidence (public).
  async getQuestionDetail(questionId, paperIds) {
    const params = new URLSearchParams();
    if (paperIds && paperIds.length) params.set('papers', paperIds.join(','));
    const qs = params.toString();
    return this.request('/api/v1/analysis/questions/' + questionId + '/detail' + (qs ? '?' + qs : ''));
  }

  // Available PYQ years with per-year approved-paper counts (public).
  async getYearAvailability(filters = {}) {
    const params = new URLSearchParams();
    if (filters.subject) params.set('subject', filters.subject);
    if (filters.stream) params.set('stream', filters.stream);
    if (filters.semester) params.set('semester', filters.semester);
    const qs = params.toString();
    return this.request('/api/v1/papers/years' + (qs ? '?' + qs : ''));
  }

  async getAnalyses() {
    return this.request('/api/v1/analysis/analyses');
  }

  async getAnalysis(id) {
    return this.request('/api/v1/analysis/analyses/' + id);
  }

  async getAnalysisInsights(id) {
    return this.request('/api/v1/analysis/analyses/' + id + '/insights');
  }

  async deleteAnalysis(id) {
    return this.request('/api/v1/analysis/analyses/' + id, { method: 'DELETE' });
  }

  async getQuestions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('/api/v1/analysis/questions' + (qs ? '?' + qs : ''));
  }

  async searchQuestions(query, subject) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (subject) params.set('subject', subject);
    return this.request('/api/v1/analysis/questions/search?' + params.toString());
  }

  async getRepeatedQuestions(subject, minFrequency) {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (minFrequency) params.set('min_frequency', minFrequency);
    return this.request('/api/v1/analysis/repeated-questions?' + params.toString());
  }

  async getRepeatedQuestionDetail(groupId) {
    return this.request('/api/v1/analysis/repeated-questions/' + groupId);
  }

  async getDashboard() {
    return this.request('/api/v1/analysis/dashboard');
  }


  async startPractice(questionId) {
    const params = new URLSearchParams({ question_id: questionId });
    return this.request('/api/v1/analysis/practice?' + params.toString(), { method: 'POST' });
  }

  async getPracticeHistory() {
    return this.request('/api/v1/analysis/practice/history');
  }

  // ------------------------------------------------------------------
  // Teacher answers (Exam Practice Mode)
  // ------------------------------------------------------------------

  async saveQuestionAnswer(questionId, formData) {
    // Multipart upload: must not send the default JSON content-type.
    return this.request(`/api/v1/questions/${questionId}/answer`, {
      method: 'POST',
      body: formData,
    });
  }

  async deleteQuestionAnswer(questionId) {
    return this.request(`/api/v1/questions/${questionId}/answer`, { method: 'DELETE' });
  }

  answerFileUrl(questionId) {
    return `${this.baseURL}/api/v1/questions/${questionId}/answer-file`;
  }

  // ------------------------------------------------------------------
  // Student paper submissions + admin verification
  // ------------------------------------------------------------------

  async uploadStudentPaper(formData, onProgress) {
    // XHR (not fetch) so the caller can show real upload progress.
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseURL}/api/v1/papers/upload-student`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* non-JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(data?.detail || `HTTP ${xhr.status}`, xhr.status, data));
      };
      xhr.onerror = () => reject(new ApiError('Network error during upload', 0));
      xhr.send(formData);
    });
  }

  async getMySubmissions() {
    return this.request('/api/v1/papers/mine');
  }

  async getPendingReview() {
    return this.request('/api/v1/papers/pending-review');
  }

  // Authenticated binary fetch (used by the admin review preview — pending
  // papers need the Authorization header, which a plain iframe can't send).
  async getFileBlob(endpoint) {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${this.baseURL}${endpoint}`, { headers });
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status}`, res.status);
    }
    return res.blob();
  }
}


// Export error classes for use in components
export { ApiError, UnauthorizedError, ForbiddenError, NotFoundError };

// Export singleton instance
export const api = new ApiClient();
export const apiClient = api; // Alias for compatibility

// Export individual methods for convenience
export const {
  getFeatures,
  getPapers,
  searchPapers,
  getPaperById,
  authorizePaperDownload,
  stampPaper,
  uploadPaper,
  sendChatMessage,
} = api;

export default api;