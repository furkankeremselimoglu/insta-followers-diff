/**
 * i18n.js — language state, t(key, params), static-DOM translation.
 * Dictionaries are statically imported ES modules (no fetch — CSP/privacy-guard safe).
 * Must stay importable under Node: no top-level browser globals.
 */

import en from './en.js';
import tr from './tr.js';

const DICTS = { en, tr };
const STORAGE_KEY = 'ifd-lang';
let current = 'en';
const listeners = [];

/**
 * Pure detection logic — separated so tests can inject (stored, languages)
 * without touching localStorage/navigator globals.
 * @param {string|null} stored  — validated localStorage value, or null
 * @param {string[]}    langs   — e.g. navigator.languages or [navigator.language]
 */
export function detectLanguageFrom(stored, langs) {
  if (stored && Object.prototype.hasOwnProperty.call(DICTS, stored)) return stored;
  for (const l of langs) {
    if (typeof l === 'string' && l.toLowerCase().startsWith('tr')) return 'tr';
  }
  return 'en';
}

export function detectLanguage() {
  let stored = null;
  try { if (typeof localStorage !== 'undefined') stored = localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
  let langs = [];
  if (typeof navigator !== 'undefined') {
    langs = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages : [navigator.language];
  }
  return detectLanguageFrom(stored, langs);
}

export function getLanguage() { return current; }

export function t(key, params) {
  const dict = DICTS[current] || en;
  let str = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : en[key];
  if (str === undefined) return key;
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m);
  }
  return str;
}

export function setLanguage(lang) {
  if (!Object.prototype.hasOwnProperty.call(DICTS, lang)) return; // unknown codes: no-op
  current = lang;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  if (typeof document !== 'undefined') applyStaticTranslations();
  for (const cb of listeners) cb(lang);
}

export function onLanguageChange(cb) { listeners.push(cb); }

export function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); }); // static author-controlled dictionary HTML only
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
  document.title = t('page.title');
  document.documentElement.lang = current;
  const btnEn = document.getElementById('lang-btn-en');
  const btnTr = document.getElementById('lang-btn-tr');
  if (btnEn) btnEn.setAttribute('aria-pressed', String(current === 'en'));
  if (btnTr) btnTr.setAttribute('aria-pressed', String(current === 'tr'));
}

export function initI18n() {
  current = detectLanguage(); // auto-detection does NOT persist; only explicit clicks do
  applyStaticTranslations();
  const btnEn = document.getElementById('lang-btn-en');
  const btnTr = document.getElementById('lang-btn-tr');
  if (btnEn) btnEn.addEventListener('click', () => setLanguage('en'));
  if (btnTr) btnTr.addEventListener('click', () => setLanguage('tr'));
}
