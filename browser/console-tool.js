/**
 * console-tool.js — insta-followers-diff in-browser tool
 *
 * Paste the ENTIRE contents of this file into a DevTools Console on
 * www.instagram.com (while logged in) and press Enter.
 *
 * Nothing is imported, nothing is loaded from a remote host.
 * All fetches are same-origin calls to instagram.com using your existing
 * logged-in session. No credentials are entered or stored.
 *
 * WARNING: Using this tool violates Instagram's Terms of Service and may
 * result in rate-limiting, a security checkpoint, or account suspension.
 * The official data export is the recommended, zero-risk path.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  var APP_ID_FALLBACK = '936619743392459';
  var PAGE_SIZE = 50;
  var DELAY_MIN_MS = 1200;
  var DELAY_MAX_MS = 2500;
  var MAX_PAGES = 400;
  var PANEL_ID = 'ifd-inbrowser-panel';
  var RENDER_CAP = 2000;

  // ---------------------------------------------------------------------------
  // Custom error types
  // ---------------------------------------------------------------------------
  function NotLoggedInError(msg) {
    this.name = 'NotLoggedInError';
    this.message = msg || 'Not logged in';
  }
  NotLoggedInError.prototype = Object.create(Error.prototype);

  function RateLimitError(msg) {
    this.name = 'RateLimitError';
    this.message = msg || 'Rate limited (HTTP 429)';
  }
  RateLimitError.prototype = Object.create(Error.prototype);

  function ApiError(msg, status) {
    this.name = 'ApiError';
    this.message = msg || 'API error';
    this.status = status;
  }
  ApiError.prototype = Object.create(Error.prototype);

  // ---------------------------------------------------------------------------
  // Guard: must be on instagram.com
  // ---------------------------------------------------------------------------
  // Require the canonical desktop host: the API is fetched from
  // www.instagram.com, and a credentialed fetch from a different Instagram
  // host (bare instagram.com, m.instagram.com, ...) would be cross-origin.
  if (location.hostname !== 'www.instagram.com') {
    alert(
      'insta-followers-diff: Open this on www.instagram.com (the desktop site) ' +
      'while logged in, then run again.\n\n' +
      'If you are on instagram.com, m.instagram.com, or another host, click the ' +
      'Instagram logo to reach www.instagram.com first.'
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Consent gate
  // ---------------------------------------------------------------------------
  var CONSENT_TEXT =
    'insta-followers-diff — IN-BROWSER TOOL\n\n' +
    'This runs an UNOFFICIAL request against Instagram using YOUR logged-in\n' +
    'session. It only reads YOUR OWN followers/following and computes the\n' +
    'result locally in your browser.\n\n' +
    'Using tools like this VIOLATES Instagram\'s Terms of Service and can\n' +
    'lead to rate-limiting, a security checkpoint, or account\n' +
    'suspension/ban.\n\n' +
    'The safe, recommended path is the official Instagram data export (see\n' +
    'https://furkankeremselimoglu.github.io/insta-followers-diff/).\n\n' +
    'Continue at your own risk?';

  if (!confirm(CONSENT_TEXT)) {
    return;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getCookie(name) {
    var pairs = document.cookie.split(';');
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].trim();
      var eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      var key = pair.slice(0, eqIdx).trim();
      if (key === name) {
        return decodeURIComponent(pair.slice(eqIdx + 1));
      }
    }
    return '';
  }

  function resolveUserId() {
    // Primary: ds_user_id cookie (own account, set at login)
    var fromCookie = getCookie('ds_user_id');
    if (fromCookie && /^\d+$/.test(fromCookie.trim())) {
      return fromCookie.trim();
    }

    // Fallback 1: window._sharedData
    try {
      var viewerId =
        window._sharedData &&
        window._sharedData.config &&
        window._sharedData.config.viewerId;
      if (viewerId && /^\d+$/.test(String(viewerId))) {
        return String(viewerId);
      }
    } catch (e) { /* ignore */ }

    // Fallback 2: regex-scrape the page HTML (viewer-specific patterns only;
    // "user_id" is intentionally excluded — on a profile page it resolves to
    // the profile owner's id, not the logged-in viewer's id)
    var html = document.documentElement.innerHTML;
    var patterns = [
      /"viewer_id"\s*:\s*"(\d+)"/,
      /"ds_user_id"\s*:\s*"(\d+)"/,
    ];
    for (var p = 0; p < patterns.length; p++) {
      var m = html.match(patterns[p]);
      if (m && m[1]) return m[1];
    }

    throw new NotLoggedInError(
      'Could not determine your user id. Make sure you are logged in to instagram.com.'
    );
  }

  function resolveAppId() {
    // Try to scrape the app id from loaded scripts
    try {
      var scripts = document.querySelectorAll('script[src]');
      // Also try inline script content (limited by size)
      var inlineScripts = document.querySelectorAll('script:not([src])');
      var appIdRe = /"app_id"\s*:\s*"(\d{12,16})"|appId["']?\s*[:=]\s*["'](\d{12,16})/;
      for (var i = 0; i < inlineScripts.length; i++) {
        var txt = inlineScripts[i].textContent || '';
        if (txt.length > 500000) continue; // skip huge scripts
        var match = txt.match(appIdRe);
        if (match) return match[1] || match[2];
      }
    } catch (e) { /* ignore — fall through to constant */ }
    return APP_ID_FALLBACK;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function jitter() {
    return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
  }

  function keyOf(username) {
    return username.normalize('NFC').toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // API fetch helpers
  // ---------------------------------------------------------------------------
  function fetchPage(list, userId, appId, maxId) {
    var url =
      'https://www.instagram.com/api/v1/friendships/' +
      userId +
      '/' +
      list +
      '/?count=' +
      PAGE_SIZE +
      (maxId ? '&max_id=' + encodeURIComponent(maxId) : '');

    return fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-IG-App-ID': appId,
        'X-CSRFToken': getCookie('csrftoken') || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }).then(function (res) {
      // Redirect to login page
      if (res.redirected && /\/login\/?/.test(res.url)) {
        throw new NotLoggedInError('Session expired. Please log in to instagram.com and retry.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new NotLoggedInError('Authentication failed (HTTP ' + res.status + '). Make sure you are logged in.');
      }
      if (res.status === 429) {
        throw new RateLimitError('Instagram throttled the request (HTTP 429). Stop, wait ~10–15 min, then retry.');
      }
      if (!res.ok) {
        throw new ApiError('Instagram API returned HTTP ' + res.status + '. Try again later.', res.status);
      }
      return res.json();
    }).then(function (data) {
      return {
        users: Array.isArray(data.users) ? data.users : [],
        next_max_id: data.next_max_id || '',
      };
    });
  }

  function paginateAll(list, userId, appId, onProgress) {
    var accounts = [];
    var maxId = '';
    var pages = 0;
    var complete = true;

    function nextPage() {
      return fetchPage(list, userId, appId, maxId).then(function (data) {
        pages++;
        var users = data.users;

        for (var i = 0; i < users.length; i++) {
          var u = users[i];
          if (u && u.username) {
            accounts.push({
              username: u.username,
              pk: String(u.pk || ''),
              full_name: u.full_name || '',
            });
          }
        }

        if (typeof onProgress === 'function') {
          onProgress(list, accounts.length);
        }

        var nextCursor = data.next_max_id;
        if (!nextCursor || users.length === 0 || pages >= MAX_PAGES) {
          if (pages >= MAX_PAGES && nextCursor) {
            complete = false;
          }
          return { accounts: accounts, complete: complete };
        }

        maxId = nextCursor;
        return sleep(jitter()).then(nextPage);
      });
    }

    return nextPage();
  }

  // ---------------------------------------------------------------------------
  // Diff (mirrors web/js/core/diff.js logic exactly)
  // ---------------------------------------------------------------------------
  function computeDiff(followers, following) {
    var followerKeys = Object.create(null);
    var followingKeys = Object.create(null);

    for (var i = 0; i < followers.length; i++) {
      followerKeys[keyOf(followers[i].username)] = true;
    }
    for (var j = 0; j < following.length; j++) {
      followingKeys[keyOf(following[j].username)] = true;
    }

    var notFollowingBack = following.filter(function (a) {
      return !followerKeys[keyOf(a.username)];
    });
    var fans = followers.filter(function (a) {
      return !followingKeys[keyOf(a.username)];
    });
    var mutuals = followers.filter(function (a) {
      return followingKeys[keyOf(a.username)];
    });

    // Deduplicate counts by key (mirrors diff.js)
    function dedupCount(arr) {
      var seen = Object.create(null);
      var count = 0;
      for (var i = 0; i < arr.length; i++) {
        var k = keyOf(arr[i].username);
        if (!seen[k]) { seen[k] = true; count++; }
      }
      return count;
    }

    var followerKeySet = Object.create(null);
    for (var fi = 0; fi < followers.length; fi++) followerKeySet[keyOf(followers[fi].username)] = true;
    var followingKeySet = Object.create(null);
    for (var gi = 0; gi < following.length; gi++) followingKeySet[keyOf(following[gi].username)] = true;

    return {
      notFollowingBack: notFollowingBack,
      fans: fans,
      mutuals: mutuals,
      counts: {
        followers: Object.keys(followerKeySet).length,
        following: Object.keys(followingKeySet).length,
        notFollowingBack: dedupCount(notFollowingBack),
        fans: dedupCount(fans),
        mutuals: dedupCount(mutuals),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Export builders (format must match scraper/export_writer.py + parse.js)
  // ---------------------------------------------------------------------------
  function toItem(acc, capturedTs) {
    return {
      title: '',
      media_list_data: [],
      string_list_data: [
        {
          href: 'https://www.instagram.com/' + acc.username + '/',
          value: acc.username,
          timestamp: capturedTs,
        },
      ],
    };
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function downloadExport(followers, following) {
    var capturedTs = Math.floor(Date.now() / 1000);
    var followersJson = JSON.stringify(
      followers.map(function (a) { return toItem(a, capturedTs); }),
      null,
      2
    );
    var followingJson = JSON.stringify(
      {
        relationships_following: following.map(function (a) {
          return toItem(a, capturedTs);
        }),
      },
      null,
      2
    );

    download('followers_1.json', followersJson);
    setTimeout(function () {
      download('following.json', followingJson);
    }, 400);
  }

  // ---------------------------------------------------------------------------
  // Panel UI — built entirely with createElement + element.style.<prop> = value
  // No innerHTML, no setAttribute('style',...), no .style.cssText, no <style>
  // ---------------------------------------------------------------------------

  // Remove any existing panel (guard against double-injection)
  var existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();

  // Color palette (dark panel)
  var C = {
    bg: '#1a1a1a',
    surface: '#242424',
    border: '#3a3a3a',
    text: '#e8e8e8',
    muted: '#999',
    accent: '#c084fc',    // purple-ish
    accentBg: '#2d1f3d',
    danger: '#f87171',
    dangerBg: '#3b1212',
    warn: '#fbbf24',
    warnBg: '#3b2a00',
    success: '#4ade80',
    link: '#93c5fd',
    btnBg: '#333',
    btnHover: '#444',
  };

  var panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.position = 'fixed';
  panel.style.top = '16px';
  panel.style.right = '16px';
  panel.style.zIndex = '2147483647';
  panel.style.width = '360px';
  panel.style.maxHeight = '80vh';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.overflow = 'hidden';
  panel.style.borderRadius = '12px';
  panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.6)';
  panel.style.background = C.bg;
  panel.style.color = C.text;
  panel.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  panel.style.fontSize = '13px';
  panel.style.lineHeight = '1.5';
  document.body.appendChild(panel);

  // -- Header row
  var header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '12px 14px 10px';
  header.style.background = C.surface;
  header.style.borderBottom = '1px solid ' + C.border;
  header.style.flexShrink = '0';
  panel.appendChild(header);

  var titleEl = document.createElement('span');
  titleEl.textContent = 'insta-followers-diff · in-browser';
  titleEl.style.fontWeight = '600';
  titleEl.style.color = C.accent;
  titleEl.style.fontSize = '13px';
  header.appendChild(titleEl);

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close panel');
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.color = C.muted;
  closeBtn.style.fontSize = '18px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.padding = '0 4px';
  closeBtn.style.lineHeight = '1';
  closeBtn.addEventListener('click', function () { panel.remove(); });
  header.appendChild(closeBtn);

  // -- Banner region (errors / warnings)
  var bannerEl = document.createElement('div');
  bannerEl.style.display = 'none';
  bannerEl.style.padding = '8px 14px';
  bannerEl.style.fontSize = '12px';
  bannerEl.style.flexShrink = '0';
  panel.appendChild(bannerEl);

  function showBanner(text, type) {
    // type: 'error' | 'warn' | 'partial'
    bannerEl.style.display = 'block';
    bannerEl.textContent = text;
    if (type === 'error') {
      bannerEl.style.background = C.dangerBg;
      bannerEl.style.color = C.danger;
    } else if (type === 'warn' || type === 'partial') {
      bannerEl.style.background = C.warnBg;
      bannerEl.style.color = C.warn;
    }
  }

  // -- Progress region
  var progressEl = document.createElement('div');
  progressEl.style.padding = '12px 14px';
  progressEl.style.color = C.muted;
  progressEl.style.fontSize = '12px';
  progressEl.style.flexShrink = '0';
  progressEl.textContent = 'Starting…';
  panel.appendChild(progressEl);

  function updateProgress(list, count) {
    var label = list === 'following' ? 'Following' : 'Followers';
    progressEl.textContent = 'Fetching ' + label.toLowerCase() + '… ' + count;
  }

  // -- Summary counts
  var summaryEl = document.createElement('div');
  summaryEl.style.display = 'none';
  summaryEl.style.padding = '10px 14px';
  summaryEl.style.background = C.surface;
  summaryEl.style.borderBottom = '1px solid ' + C.border;
  summaryEl.style.flexShrink = '0';
  panel.appendChild(summaryEl);

  function buildCountPill(label, value) {
    var wrap = document.createElement('div');
    wrap.style.display = 'inline-flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.marginRight = '10px';
    wrap.style.marginBottom = '4px';

    var num = document.createElement('span');
    num.textContent = value;
    num.style.fontWeight = '700';
    num.style.fontSize = '15px';
    num.style.color = C.accent;
    wrap.appendChild(num);

    var lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.fontSize = '10px';
    lbl.style.color = C.muted;
    lbl.style.textTransform = 'uppercase';
    lbl.style.letterSpacing = '0.05em';
    wrap.appendChild(lbl);

    return wrap;
  }

  function renderSummary(counts) {
    // Clear
    while (summaryEl.firstChild) summaryEl.removeChild(summaryEl.firstChild);
    summaryEl.style.display = 'flex';
    summaryEl.style.flexWrap = 'wrap';

    summaryEl.appendChild(buildCountPill('Following', counts.following));
    summaryEl.appendChild(buildCountPill('Followers', counts.followers));
    summaryEl.appendChild(buildCountPill('Not following back', counts.notFollowingBack));
    summaryEl.appendChild(buildCountPill('Fans', counts.fans));
    summaryEl.appendChild(buildCountPill('Mutuals', counts.mutuals));
  }

  // -- Toggle buttons
  var toggleEl = document.createElement('div');
  toggleEl.style.display = 'none';
  toggleEl.style.padding = '8px 14px';
  toggleEl.style.borderBottom = '1px solid ' + C.border;
  toggleEl.style.flexShrink = '0';
  panel.appendChild(toggleEl);

  var btnNFB = document.createElement('button');
  var btnFans = document.createElement('button');

  function styleToggle(btn, active) {
    btn.style.background = active ? C.accentBg : C.btnBg;
    btn.style.color = active ? C.accent : C.text;
    btn.style.border = active ? '1px solid ' + C.accent : '1px solid ' + C.border;
    btn.style.borderRadius = '6px';
    btn.style.padding = '5px 10px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.marginRight = '6px';
  }

  toggleEl.appendChild(btnNFB);
  toggleEl.appendChild(btnFans);

  // -- Scroll area
  var scrollEl = document.createElement('div');
  scrollEl.style.overflowY = 'auto';
  scrollEl.style.flex = '1';
  scrollEl.style.padding = '4px 0';
  panel.appendChild(scrollEl);

  var listEl = document.createElement('ul');
  listEl.style.listStyle = 'none';
  listEl.style.margin = '0';
  listEl.style.padding = '0';
  scrollEl.appendChild(listEl);

  var showAllBtn = document.createElement('button');
  showAllBtn.style.display = 'none';
  showAllBtn.style.width = '100%';
  showAllBtn.style.padding = '8px';
  showAllBtn.style.background = C.btnBg;
  showAllBtn.style.color = C.text;
  showAllBtn.style.border = 'none';
  showAllBtn.style.cursor = 'pointer';
  showAllBtn.style.fontSize = '12px';
  scrollEl.appendChild(showAllBtn);

  function renderList(accounts, showAll) {
    // Clear list
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    showAllBtn.style.display = 'none';

    var toRender = showAll ? accounts : accounts.slice(0, RENDER_CAP);

    for (var i = 0; i < toRender.length; i++) {
      var acc = toRender[i];
      var li = document.createElement('li');
      li.style.borderBottom = '1px solid ' + C.border;
      li.style.padding = '6px 14px';

      var link = document.createElement('a');
      link.href = 'https://www.instagram.com/' + acc.username + '/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '@' + acc.username;
      link.style.color = C.link;
      link.style.textDecoration = 'none';
      link.style.display = 'block';

      if (acc.full_name) {
        var name = document.createElement('span');
        name.textContent = ' — ' + acc.full_name;
        name.style.color = C.muted;
        name.style.fontSize = '11px';
        link.appendChild(name);
      }

      li.appendChild(link);
      listEl.appendChild(li);
    }

    if (!showAll && accounts.length > RENDER_CAP) {
      showAllBtn.style.display = 'block';
      showAllBtn.textContent = 'Show all ' + accounts.length + ' accounts';
      showAllBtn.onclick = function () { renderList(accounts, true); };
    }
  }

  // -- Footer
  var footerEl = document.createElement('div');
  footerEl.style.display = 'flex';
  footerEl.style.flexDirection = 'column';
  footerEl.style.padding = '10px 14px';
  footerEl.style.borderTop = '1px solid ' + C.border;
  footerEl.style.background = C.surface;
  footerEl.style.flexShrink = '0';
  panel.appendChild(footerEl);

  var footerBtnRow = document.createElement('div');
  footerBtnRow.style.display = 'flex';
  footerBtnRow.style.gap = '8px';
  footerEl.appendChild(footerBtnRow);

  var dlBtn = document.createElement('button');
  dlBtn.textContent = 'Download export files';
  dlBtn.style.background = C.btnBg;
  dlBtn.style.color = C.text;
  dlBtn.style.border = '1px solid ' + C.border;
  dlBtn.style.borderRadius = '6px';
  dlBtn.style.padding = '6px 12px';
  dlBtn.style.cursor = 'pointer';
  dlBtn.style.fontSize = '12px';
  dlBtn.style.flex = '1';
  dlBtn.style.display = 'none';
  footerBtnRow.appendChild(dlBtn);

  var closeFooterBtn = document.createElement('button');
  closeFooterBtn.textContent = 'Close';
  closeFooterBtn.style.background = 'none';
  closeFooterBtn.style.color = C.muted;
  closeFooterBtn.style.border = '1px solid ' + C.border;
  closeFooterBtn.style.borderRadius = '6px';
  closeFooterBtn.style.padding = '6px 12px';
  closeFooterBtn.style.cursor = 'pointer';
  closeFooterBtn.style.fontSize = '12px';
  closeFooterBtn.addEventListener('click', function () { panel.remove(); });
  footerBtnRow.appendChild(closeFooterBtn);

  var dlNote = document.createElement('p');
  dlNote.textContent = 'Your browser may ask to allow multiple downloads.';
  dlNote.style.margin = '6px 0 0';
  dlNote.style.fontSize = '11px';
  dlNote.style.color = C.muted;
  dlNote.style.display = 'none';
  footerEl.appendChild(dlNote);

  var tsNote = document.createElement('p');
  tsNote.textContent =
    'Note: exported timestamps reflect capture time, not the original follow date ' +
    '(Instagram’s API does not expose follow dates).';
  tsNote.style.margin = '4px 0 0';
  tsNote.style.fontSize = '11px';
  tsNote.style.color = C.muted;
  tsNote.style.display = 'none';
  footerEl.appendChild(tsNote);

  // ---------------------------------------------------------------------------
  // Runner
  // ---------------------------------------------------------------------------
  var _followers = [];
  var _following = [];
  var _activeList = 'notFollowingBack'; // 'notFollowingBack' | 'fans'

  function setActiveList(name) {
    _activeList = name;
    var diff = computeDiff(_followers, _following);
    var accounts = name === 'fans' ? diff.fans : diff.notFollowingBack;
    renderList(accounts, false);
    styleToggle(btnNFB, name !== 'fans');
    styleToggle(btnFans, name === 'fans');
    btnNFB.textContent = 'Not following you back (' + diff.counts.notFollowingBack + ')';
    btnFans.textContent = 'Fans (' + diff.counts.fans + ')';
  }

  function handleError(err) {
    progressEl.style.display = 'none';
    if (err instanceof NotLoggedInError) {
      showBanner(
        'Not logged in: ' + err.message +
        ' — Log into instagram.com, refresh, and paste the script again.',
        'error'
      );
    } else if (err instanceof RateLimitError) {
      showBanner(
        'Rate limited (429): Instagram throttled the request. Stop now, wait ' +
        '10–15 minutes, then retry. Any results fetched before the limit ' +
        'are shown below but may be INCOMPLETE.',
        'warn'
      );
    } else {
      showBanner(
        'API error: ' + (err.message || String(err)) +
        ' — Check the console for details and try again later.',
        'error'
      );
    }
    console.error('[insta-followers-diff]', err);
  }

  (function run() {
    var appId, userId;

    try {
      appId = resolveAppId();
      userId = resolveUserId();
    } catch (err) {
      handleError(err);
      return;
    }

    progressEl.textContent = 'Fetching following… 0';

    paginateAll('following', userId, appId, updateProgress)
      .then(function (result) {
        _following = result.accounts;
        var followingComplete = result.complete;

        progressEl.textContent = 'Fetching followers… 0';

        return paginateAll('followers', userId, appId, updateProgress)
          .then(function (followersResult) {
            _followers = followersResult.accounts;
            var followersComplete = followersResult.complete;

            // Hide progress
            progressEl.style.display = 'none';

            // Partial warning if either list was capped
            if (!followingComplete || !followersComplete) {
              showBanner(
                '⚠ PARTIAL RESULTS: The page cap (' + MAX_PAGES +
                ' pages) was hit for ' +
                (!followingComplete && !followersComplete
                  ? 'both following and followers'
                  : !followingComplete
                  ? 'following'
                  : 'followers') +
                '. Diff results below may be INCOMPLETE.',
                'partial'
              );
            }

            var diff = computeDiff(_followers, _following);

            renderSummary(diff.counts);
            summaryEl.style.display = 'flex';

            // Set up toggles
            toggleEl.style.display = 'block';
            btnNFB.textContent = 'Not following you back (' + diff.counts.notFollowingBack + ')';
            btnFans.textContent = 'Fans (' + diff.counts.fans + ')';
            styleToggle(btnNFB, true);
            styleToggle(btnFans, false);

            btnNFB.addEventListener('click', function () { setActiveList('notFollowingBack'); });
            btnFans.addEventListener('click', function () { setActiveList('fans'); });

            renderList(diff.notFollowingBack, false);

            // Show download controls
            dlBtn.style.display = 'block';
            dlNote.style.display = 'block';
            tsNote.style.display = 'block';

            dlBtn.addEventListener('click', function () {
              downloadExport(_followers, _following);
            });
          });
      })
      .catch(function (err) {
        // If we have partial data, still render what we have
        if (_following.length > 0 || _followers.length > 0) {
          var diff = computeDiff(_followers, _following);
          renderSummary(diff.counts);
          summaryEl.style.display = 'flex';
          toggleEl.style.display = 'block';
          btnNFB.textContent = 'Not following you back (' + diff.counts.notFollowingBack + ')';
          btnFans.textContent = 'Fans (' + diff.counts.fans + ')';
          styleToggle(btnNFB, true);
          styleToggle(btnFans, false);
          btnNFB.addEventListener('click', function () { setActiveList('notFollowingBack'); });
          btnFans.addEventListener('click', function () { setActiveList('fans'); });
          renderList(diff.notFollowingBack, false);

          if (_followers.length > 0 && _following.length > 0) {
            dlBtn.style.display = 'block';
            dlNote.style.display = 'block';
            tsNote.style.display = 'block';
            dlBtn.addEventListener('click', function () {
              downloadExport(_followers, _following);
            });
          }
        }
        handleError(err);
      });
  })();
})();
