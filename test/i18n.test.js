/**
 * i18n.test.js — dictionary integrity + translation API unit tests.
 * Uses node:test + node:assert/strict, no fixtures, no dependencies.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import en from '../web/js/i18n/en.js';
import tr from '../web/js/i18n/tr.js';
import { t, setLanguage, getLanguage, detectLanguage, detectLanguageFrom } from '../web/js/i18n/i18n.js';

/** Extract the sorted unique {placeholder} names from a dictionary value. */
function placeholders(str) {
  return [...new Set([...str.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
}

// ---------------------------------------------------------------------------
// dictionary key parity
// ---------------------------------------------------------------------------

describe('dictionary key parity', () => {
  it('en and tr have identical key sets', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(tr).sort());
  });

  it('dictionaries are non-empty', () => {
    assert.ok(Object.keys(en).length > 0);
  });
});

// ---------------------------------------------------------------------------
// dictionary values
// ---------------------------------------------------------------------------

describe('dictionary values', () => {
  it('every en value is a non-empty string', () => {
    for (const [key, value] of Object.entries(en)) {
      assert.equal(typeof value, 'string', `en[${key}] must be a string`);
      assert.ok(value.trim().length > 0, `en[${key}] must be non-empty`);
    }
  });

  it('every tr value is a non-empty string', () => {
    for (const [key, value] of Object.entries(tr)) {
      assert.equal(typeof value, 'string', `tr[${key}] must be a string`);
      assert.ok(value.trim().length > 0, `tr[${key}] must be non-empty`);
    }
  });
});

// ---------------------------------------------------------------------------
// placeholder parity
// ---------------------------------------------------------------------------

describe('placeholder parity', () => {
  it('interpolation placeholders match between en and tr for every key', () => {
    for (const key of Object.keys(en)) {
      assert.deepEqual(placeholders(tr[key]), placeholders(en[key]), key);
    }
  });
});

// ---------------------------------------------------------------------------
// translation API
// ---------------------------------------------------------------------------

describe('translation API', () => {
  it('detectLanguageFrom: no stored value, English browser langs → en', () => {
    assert.equal(detectLanguageFrom(null, ['en-US', 'en']), 'en');
  });

  it('detectLanguageFrom: no stored value, Turkish browser lang → tr', () => {
    assert.equal(detectLanguageFrom(null, ['tr-TR']), 'tr');
    assert.equal(detectLanguageFrom(null, ['tr']), 'tr');
  });

  it('detectLanguageFrom: stored "tr" overrides any browser langs', () => {
    assert.equal(detectLanguageFrom('tr', ['en-US']), 'tr');
  });

  it('detectLanguageFrom: stored "en" overrides Turkish browser langs', () => {
    assert.equal(detectLanguageFrom('en', ['tr-TR']), 'en');
  });

  it('detectLanguageFrom: empty langs with no stored value → en', () => {
    assert.equal(detectLanguageFrom(null, []), 'en');
  });

  it('getLanguage and t() start from English default', () => {
    assert.equal(getLanguage(), 'en');
    assert.equal(t('drop.chooseFiles'), en['drop.chooseFiles']);
  });

  it('setLanguage switches lookups to Turkish', () => {
    setLanguage('tr');
    assert.equal(getLanguage(), 'tr');
    assert.equal(t('drop.chooseFiles'), tr['drop.chooseFiles']);
    setLanguage('en');
  });

  it('setLanguage ignores unknown language codes', () => {
    setLanguage('en');
    setLanguage('de');
    assert.equal(getLanguage(), 'en');
  });

  it('unknown keys fall back to the key itself', () => {
    assert.equal(t('nonexistent.key'), 'nonexistent.key');
  });

  it('missing tr key falls back to the English value', () => {
    const saved = tr['drop.chooseFiles'];
    try {
      delete tr['drop.chooseFiles'];
      setLanguage('tr');
      assert.equal(t('drop.chooseFiles'), en['drop.chooseFiles']);
    } finally {
      tr['drop.chooseFiles'] = saved;
      setLanguage('en');
    }
  });

  it('interpolates {name} params', () => {
    const out = t('tabs.notFollowingBack', { count: '42' });
    assert.ok(out.includes('42'));
    assert.ok(!out.includes('{count}'));
    assert.ok(t('list.showAllCount', { count: 5000 }).includes('5000'));
  });

  it('leaves unknown placeholders literal when params are missing', () => {
    assert.equal(t('errors.readFile'), en['errors.readFile']);
    assert.ok(t('errors.readFile', {}).includes('{message}'));
  });

  it('multi-param interpolation for the health banner', () => {
    const s = t('health.incompleteSummary', { from: '2024-01-01', to: '2024-06-01', backTo: '2015-03-10', count: '1,234' });
    assert.ok(s.includes('2024-01-01'));
    assert.ok(s.includes('2024-06-01'));
    assert.ok(s.includes('2015-03-10'));
    assert.ok(s.includes('1,234'));
    assert.ok(!/\{\w+\}/.test(s));
  });

  after(() => setLanguage('en'));
});
