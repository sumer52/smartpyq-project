/**
 * Client-side bookmarks for a public, account-free platform.
 *
 * Bookmarks are stored in localStorage keyed by question id, so any visitor
 * can save questions without registering or logging in. A cross-tab
 * `storage` listener keeps the UI in sync, and a tiny event bus lets
 * other components react to changes within the same tab.
 */
const KEY = 'smartpyq_local_bookmarks';
const EVENT = 'smartpyq:bookmarks-changed';

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full / private mode — bookmarks become session-only.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
};

export const localBookmarks = {
  /** All bookmarks, newest first. Each: {id, question_id, question_text, subject, saved_at} */
  list() {
    return read().sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));
  },

  isBookmarked(questionId) {
    return read().some((b) => b.question_id === questionId);
  },

  /** Returns true if added, false if it already existed. */
  add(question) {
    const list = read();
    if (list.some((b) => b.question_id === question.id)) return false;
    list.push({
      id: `local_${question.id}`,
      question_id: question.id,
      question_text: question.question_text || question.question || '',
      subject: question.subject || 'Uncategorized',
      saved_at: Date.now(),
    });
    write(list);
    return true;
  },

  /** Toggle. Returns the new bookmarked state. */
  toggle(question) {
    if (this.isBookmarked(question.id)) {
      this.remove(question.id);
      return false;
    }
    this.add(question);
    return true;
  },

  remove(questionId) {
    write(read().filter((b) => b.question_id !== questionId));
  },

  /** Subscribe to changes (same tab via custom event, cross-tab via storage). */
  subscribe(callback) {
    const onEvent = () => callback(this.list());
    const onStorage = (e) => {
      if (e.key === KEY) callback(this.list());
    };
    window.addEventListener(EVENT, onEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onEvent);
      window.removeEventListener('storage', onStorage);
    };
  },
};

export default localBookmarks;
