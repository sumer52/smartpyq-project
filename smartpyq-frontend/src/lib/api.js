// API Configuration and Utilities
// Backend origin comes from the single config module (backendUrl.js).
import { BACKEND_URL, isBackendConfigured, MISSING_BACKEND_URL_MESSAGE } from './backendUrl';

import { isDemoSessionActive, attachDemoBackendSession } from './demoSession';

// Typed failure for API calls in a misconfigured production build: callers
// already handle thrown ApiErrors, so data pages render their error states
// instead of the whole app dying at import time. Thrown lazily (not as a
// top-level class extending ApiError, which would crash on import order).
const ensureBackendConfigured = () => {
  if (!isBackendConfigured) {
    const error = new ApiError(MISSING_BACKEND_URL_MESSAGE, 0, null);
    error.name = 'BackendConfigurationError';
    throw error;
  }
};

// Requests must never hang forever: a backend that accepts the TCP connection
// and then never answers used to leave every page on its loading skeleton.
// 20s is long enough for a slow list response (and a Render cold start) and
// short enough that the user sees a real error instead of an endless spinner.
export const REQUEST_TIMEOUT_MS = 20000;

// A sleeping free-tier instance answers its first request only after 30-60s of
// cold start, and a deploy in progress answers 502/503 for a few seconds. Public
// reads get one extra attempt with this budget, so the first visitor of the day
// sees the library instead of
// "We couldn't load the paper library counts just now."
export const COLD_START_RETRY_TIMEOUT_MS = 60000;

const isDev = import.meta.env.DEV;

// Development-only diagnostics. Production stays quiet (no console noise, no
// endpoint names leaked into the browser console for visitors).
const devLog = (message, details) => {
  if (!isDev) return;
  if (details === undefined) console.error(`[api] ${message}`);
  else console.error(`[api] ${message}`, details);
};

/** AbortController that fires after `ms`, so a stalled fetch rejects. */
const abortAfter = (ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
};

const timeoutError = (baseURL, ms) => new ApiError(
  `The server at ${baseURL} did not respond within ${Math.round(ms / 1000)} seconds. ` +
  'It may be starting up — please try again.',
  0,
  null,
  'TIMEOUT'
);

// Custom error classes for better error handling
class ApiError extends Error {
  constructor(message, status, data = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = code;
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
    // NOTE: no default Content-Type. GET/DELETE requests carry no body, and a
    // Content-Type header on a body-less request makes it a non-simple CORS
    // request, forcing a preflight OPTIONS round-trip to the backend before
    // every call (~2x perceived latency). JSON bodies set it explicitly in
    // request() below.
    this.defaultHeaders = {};
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
        const guard = abortAfter(REQUEST_TIMEOUT_MS);
        let refreshResponse;
        try {
          refreshResponse = await fetch(`${this.baseURL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
            signal: guard.signal
          });
        } finally {
          guard.cancel();
        }
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
    ensureBackendConfigured();
    const url = `${this.baseURL}${endpoint}`;
    // `timeoutMs` and `signal` are transport controls, not fetch options.
    const {
      timeoutMs = REQUEST_TIMEOUT_MS,
      signal: callerSignal,
      ...fetchOptions
    } = options;
    const config = {
      headers: this.getAuthHeaders(),
      ...fetchOptions,
    };
    // JSON bodies need the JSON content-type. FormData must set its own
    // boundary — never send a JSON content-type with a FormData payload.
    if (options.body && !(options.body instanceof FormData)) {
      config.headers = { 'Content-Type': 'application/json', ...config.headers };
    }
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

    // One deadline covers the request and any single 401 retry below.
    const controller = new AbortController();
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', forwardAbort, { once: true });
    }
    config.signal = controller.signal;

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
        devLog(`${response.status} ${endpoint}`, errorMessage);

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

      // Our own deadline fired: report a timeout, not a generic network error.
      if (timedOut) {
        devLog(`timeout after ${timeoutMs}ms: ${endpoint}`);
        throw timeoutError(this.baseURL, timeoutMs);
      }

      // The caller cancelled (route change, new keystroke in search). Let the
      // caller decide — callers already ignore AbortError.
      if (error?.name === 'AbortError') throw error;

      // Network errors or other fetch failures — name the backend so the
      // message tells the user what to check instead of a bare "Failed to fetch".
      devLog(`request failed: ${endpoint}`, error);
      const unreachable = error instanceof TypeError ||
        /failed to fetch|load failed|networkerror/i.test(error?.message || '');
      throw new ApiError(
        unreachable
          ? `Can't reach the server at ${this.baseURL}. Check that the backend is running, then try again.`
          : `Network error: ${error.message}`,
        0,
        null,
        'NETWORK'
      );
    } finally {
      clearTimeout(deadline);
      callerSignal?.removeEventListener?.('abort', forwardAbort);
    }
  }

  async getFeatures() {
    return this.request('/api/v1/features/');
  }

  async getPapers(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/v1/papers/?${queryString}`);
  }

  async searchPapers(query = '', filters = {}) {
    const params = { q: query, ...filters };
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/v1/papers/?${queryString}`);
  }

  async getPaperById(id) {
    return this.request(`/api/v1/papers/${id}`);
  }

  // Everything the public /paper/:id page shows: the paper, its extracted
  // questions, and related papers from the same subject.
  async getPaperDetail(id) {
    return this.request(`/api/v1/papers/${id}/detail`);
  }

  async authorizePaperDownload(id) {
    ensureBackendConfigured();
    const url = `${this.baseURL}/api/v1/papers/${id}/download`;
    const headers = {};
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const guard = abortAfter(REQUEST_TIMEOUT_MS * 3);
    let response;
    try {
      response = await fetch(url, { method: 'GET', headers, signal: guard.signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw timeoutError(this.baseURL, REQUEST_TIMEOUT_MS * 3);
      throw new ApiError('Download failed — the server could not be reached.', 0, null, 'NETWORK');
    } finally {
      guard.cancel();
    }
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

  // One-shot AI answer for the /ai page (public endpoint, no auth needed).
  // Routed through request() so it inherits the abort deadline: a backend that
  // accepts the connection and never answers must reject, not hang forever.
  // Generation is slower than a list call, so it gets a longer (45s) budget.
  async simpleChat(prompt, sessionId, options = {}) {
    return this.request('/api/v1/chat/simple', {
      method: 'POST',
      body: JSON.stringify({ prompt, session_id: sessionId }),
      timeoutMs: 45000,
      ...(options.signal ? { signal: options.signal } : {}),
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

  // Browse tree derived from the papers actually in the database, so every
  // published paper is reachable (the old hardcoded catalog hid anything it
  // didn't know about).
  // One retry on a cold-start-shaped failure only: a 20s timeout (no bytes at
  // all — the instance is booting) or a 502/503 (deploy in progress). A plain
  // network/DNS failure is NOT retried: the backend is unreachable, and making
  // the visitor wait another minute before the error appears helps nobody.
  async getPaperCatalog() {
    try {
      return await this.request('/api/v1/papers/catalog');
    } catch (error) {
      const coldStart = error?.code === 'TIMEOUT' ||
        error?.status === 502 || error?.status === 503;
      if (!coldStart) throw error;
      devLog('catalog: retrying once after a cold-start failure');
      return this.request('/api/v1/papers/catalog', { timeoutMs: COLD_START_RETRY_TIMEOUT_MS });
    }
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

  // Unified, ranked search: returns papers and their extracted questions with
  // snippets and links back to the paper. Zero-result queries are logged
  // server-side so the library's gaps are visible.
  async searchAll(query, options = {}) {
    const params = new URLSearchParams({ q: query });
    if (options.limit) params.set('limit', options.limit);
    // A caller-provided signal lets a new keystroke cancel the in-flight search.
    return this.request('/api/v1/search?' + params.toString(), options.signal ? { signal: options.signal } : {});
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
    ensureBackendConfigured();
    // XHR (not fetch) so the caller can show real upload progress.
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseURL}/api/v1/papers/upload-student`);
      // Uploads are slow but must still fail visibly instead of spinning.
      xhr.timeout = 120000;
      xhr.ontimeout = () => reject(new ApiError('The upload timed out. Please try again.', 0, null, 'TIMEOUT'));
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

  async getMySubmissions(anonToken) {
    const qs = anonToken ? `?anon_token=${encodeURIComponent(anonToken)}` : '';
    return this.request(`/api/v1/papers/mine${qs}`);
  }

  async getPendingReview() {
    return this.request('/api/v1/papers/pending-review');
  }

  // Authenticated binary fetch (used by the admin review preview — pending
  // papers need the Authorization header, which a plain iframe can't send).
  async getFileBlob(endpoint) {
    ensureBackendConfigured();
    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const guard = abortAfter(REQUEST_TIMEOUT_MS * 3);
    let res;
    try {
      res = await fetch(`${this.baseURL}${endpoint}`, { headers, signal: guard.signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw timeoutError(this.baseURL, REQUEST_TIMEOUT_MS * 3);
      throw new ApiError('The server could not be reached.', 0, null, 'NETWORK');
    } finally {
      guard.cancel();
    }
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status}`, res.status);
    }
    return res.blob();
  }
}


// Anonymous upload tracking: the backend returns a token per signed-out
// upload; storing it lets this browser list "my submissions" without a login.
const ANON_TOKEN_KEY = 'smartpyq_anon_upload_token';

export const getAnonUploadToken = () => localStorage.getItem(ANON_TOKEN_KEY) || '';
export const setAnonUploadToken = (token) => {
  if (token) localStorage.setItem(ANON_TOKEN_KEY, token);
};

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