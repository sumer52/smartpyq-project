// Per-page <head> management without a dependency.
//
// This is a client-rendered SPA: search engines run the JS and see these
// values, but link-preview crawlers that do not run JS still read the static
// index.html tags. Keep both honest — the defaults live in index.html, and
// this hook overrides them for the page currently mounted, restoring the
// previous values when the page unmounts.
import { useEffect } from 'react';

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://smartpyq-project.vercel.app').replace(/\/+$/, '');

export const SITE_NAME = 'SmartPYQ';

export const DEFAULT_TITLE = 'SmartPYQ - Intelligent Previous Year Papers Platform';
export const DEFAULT_DESCRIPTION =
  'SmartPYQ - Previous Year Papers with AI-powered study assistance. Access, analyze, and excel with intelligent question paper platform.';

export const absoluteUrl = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/** Set a meta tag's content and return an undo function. */
function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  const created = !element;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  const previous = element.getAttribute('content');
  element.setAttribute('content', content);
  return () => {
    if (created) element.remove();
    else if (previous === null) element.removeAttribute('content');
    else element.setAttribute('content', previous);
  };
}

/** Set the canonical link and return an undo function. */
function setCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]');
  const created = !element;
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  const previous = element.getAttribute('href');
  element.setAttribute('href', href);
  return () => {
    if (created) element.remove();
    else if (previous) element.setAttribute('href', previous);
    else element.removeAttribute('href');
  };
}

/** Replace the page's JSON-LD block; returns an undo function. */
function setJsonLd(data) {
  const ID = 'page-structured-data';
  document.getElementById(ID)?.remove();
  if (!data) return () => {};
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = ID;
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
  return () => document.getElementById(ID)?.remove();
}

/**
 * Apply per-page metadata.
 *
 * @param {object} meta
 * @param {string} meta.title       Page title (site name is appended).
 * @param {string} meta.description Meta description.
 * @param {string} meta.path        Canonical path on this site, e.g. "/paper/12".
 * @param {string} [meta.type]      og:type, "article" for content pages.
 * @param {object} [meta.jsonLd]    Structured data for this page.
 * @param {boolean} [meta.noindex]  Keep the page out of search results.
 */
export function usePageMeta({ title, description, path, type = 'website', jsonLd, noindex = false }) {
  useEffect(() => {
    if (!title) return undefined;
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const previousTitle = document.title;
    document.title = fullTitle;

    const url = absoluteUrl(path || (typeof window !== 'undefined' ? window.location.pathname : '/'));
    const undos = [
      setMeta('name', 'description', description || DEFAULT_DESCRIPTION),
      setMeta('property', 'og:type', type),
      setMeta('property', 'og:title', fullTitle),
      setMeta('property', 'og:description', description || DEFAULT_DESCRIPTION),
      setMeta('property', 'og:url', url),
      setMeta('name', 'twitter:title', fullTitle),
      setMeta('name', 'twitter:description', description || DEFAULT_DESCRIPTION),
      setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow'),
      setCanonical(url),
      setJsonLd(jsonLd),
    ];

    return () => {
      document.title = previousTitle;
      // Undo in reverse so duplicated tags restore cleanly.
      for (const undo of undos.reverse()) undo();
    };
    // jsonLd is rebuilt on every render of the caller; compare by content to
    // avoid re-running this effect on unrelated state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, type, noindex, JSON.stringify(jsonLd)]);
}

export default usePageMeta;
