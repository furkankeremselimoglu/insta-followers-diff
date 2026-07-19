/**
 * app.js — DOM wiring for insta-followers-diff
 * Three input modes: ZIP / loose JSON files / folder drop or picker.
 * Zero network APIs — all processing is local; no outbound requests are made.
 */
import { extractFollowFiles } from './zip.js';
import { classifyPaths } from './core/locate.js';
import { parseFollowList, mergeAccounts } from './core/parse.js';
import { computeDiff } from './core/diff.js';
import { accountsToCsv } from './core/csv.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_RENDER_ROWS = 2000;
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB notice threshold
const FOLDER_WALK_DEPTH = 10;
const FILE_SKIP_SIZE = 50 * 1024 * 1024; // 50 MB per file

// ─── DOM References (populated after DOMContentLoaded) ───────────────────────
let dropZone, fileInput, folderInput, statusRegion;
let dropZoneBtn;
let resultsSection, errorSection;
let errorMsg;
let sizeNotice;

// Results DOM
let summaryFollowing, summaryFollowers, summaryNotFollowingBack, summaryFans, summaryMutuals;
let tabNotFollowing, tabFans;
let tabBtnNotFollowing, tabBtnFans;
let searchInput, sortSelect;
let listContainer, showAllBtn, showAllWrapper;
let downloadCsvBtn;
let startOverBtn;

// Active state
let activeTab = 'notFollowingBack'; // 'notFollowingBack' | 'fans'
let diffResult = null;
let activeAccounts = [];
let filteredAccounts = [];
let showingAll = false;

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  dropZone        = document.getElementById('drop-zone');
  dropZoneBtn     = document.getElementById('drop-zone-btn');
  fileInput       = document.getElementById('file-input');
  folderInput     = document.getElementById('folder-input');
  statusRegion    = document.getElementById('status-region');
  resultsSection  = document.getElementById('results-section');
  errorSection    = document.getElementById('error-section');
  errorMsg        = document.getElementById('error-msg');
  sizeNotice      = document.getElementById('size-notice');

  summaryFollowing        = document.getElementById('summary-following');
  summaryFollowers        = document.getElementById('summary-followers');
  summaryNotFollowingBack = document.getElementById('summary-not-following-back');
  summaryFans             = document.getElementById('summary-fans');
  summaryMutuals          = document.getElementById('summary-mutuals');

  tabNotFollowing = document.getElementById('tab-not-following');
  tabFans         = document.getElementById('tab-fans');
  tabBtnNotFollowing = document.getElementById('tab-btn-not-following');
  tabBtnFans         = document.getElementById('tab-btn-fans');

  searchInput   = document.getElementById('search-input');
  sortSelect    = document.getElementById('sort-select');
  listContainer = document.getElementById('list-container');
  showAllBtn    = document.getElementById('show-all-btn');
  showAllWrapper = document.getElementById('show-all-wrapper');
  downloadCsvBtn = document.getElementById('download-csv-btn');
  startOverBtn   = document.getElementById('start-over-btn');

  // Drag and drop
  dropZone.addEventListener('dragover', onDragOver);
  dropZone.addEventListener('dragleave', onDragLeave);
  dropZone.addEventListener('drop', onDrop);

  // Buttons trigger file pickers
  const folderBtn = document.getElementById('folder-btn');
  dropZoneBtn.addEventListener('click', () => fileInput.click());
  dropZoneBtn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  if (folderBtn) {
    folderBtn.addEventListener('click', () => folderInput.click());
    folderBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); folderInput.click(); }
    });
  }

  fileInput.addEventListener('change', () => handleFiles(Array.from(fileInput.files)));
  folderInput.addEventListener('change', () => handleFiles(Array.from(folderInput.files)));

  // Tab switching
  tabBtnNotFollowing.addEventListener('click', () => switchTab('notFollowingBack'));
  tabBtnFans.addEventListener('click', () => switchTab('fans'));

  // Search + sort
  searchInput.addEventListener('input', applyFilters);
  sortSelect.addEventListener('change', applyFilters);

  // Show all
  showAllBtn.addEventListener('click', () => {
    showingAll = true;
    renderList();
  });

  // CSV download
  downloadCsvBtn.addEventListener('click', downloadCsv);

  // Start over
  startOverBtn.addEventListener('click', startOver);
});

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('drag-over');
}

function onDragLeave(e) {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
}

async function onDrop(e) {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const items = Array.from(e.dataTransfer.items || []);
  const files = Array.from(e.dataTransfer.files || []);

  // Check for directory entries via webkitGetAsEntry
  const hasDirectory = items.some(item => {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    return entry && entry.isDirectory;
  });

  if (hasDirectory) {
    setStatus('Reading folder…');
    try {
      const allFiles = await walkEntries(items);
      await processLooseFiles(allFiles);
    } catch (err) {
      showError('Error reading folder: ' + escapeHtml(err.message));
    }
    return;
  }

  // Check for ZIP
  const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip') || f.type === 'application/zip');
  if (zipFile) {
    await processZip(zipFile);
    return;
  }

  // Loose files
  if (files.length > 0) {
    await handleFiles(files);
    return;
  }

  showError('No supported files found. Drop a ZIP, loose JSON files, or an export folder.');
}

// ─── File Handling ────────────────────────────────────────────────────────────

async function handleFiles(files) {
  if (files.length === 0) return;

  // Single ZIP?
  if (files.length === 1 && (files[0].name.toLowerCase().endsWith('.zip') || files[0].type === 'application/zip')) {
    await processZip(files[0]);
    return;
  }

  // Loose files (may include files from a webkitdirectory picker)
  await processLooseFiles(files);
}

async function processZip(file) {
  setStatus('Reading ZIP…');

  if (file.size > MAX_FILE_SIZE_BYTES) {
    showSizeNotice();
  }

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    showError('Could not read file: ' + escapeHtml(err.message));
    return;
  }

  setStatus('Extracting follow files…');
  let extracted;
  try {
    extracted = await extractFollowFiles(bytes);
  } catch (err) {
    showError('Failed to extract ZIP: ' + escapeHtml(err.message));
    return;
  }

  const { followersTexts, followingTexts, htmlDetected } = extracted;

  if (htmlDetected) {
    showHtmlExportError();
    return;
  }

  await processParsedTexts(followersTexts, followingTexts);
}

async function processLooseFiles(files) {
  setStatus('Classifying files…');

  // Build paths list for classification; use relative path if available (webkitdirectory sets .webkitRelativePath)
  const pathMap = new Map(); // classifiable path → File
  for (const file of files) {
    const p = file.webkitRelativePath || file.name;
    pathMap.set(p, file);
  }

  const classified = classifyPaths(Array.from(pathMap.keys()));

  // Per-bucket rule: HTML guidance takes priority whenever a needed JSON half
  // is missing but its HTML counterpart is present.
  if (classified.html.length > 0 && (classified.followers.length === 0 || classified.following.length === 0)) {
    showHtmlExportError();
    return;
  }

  // Read text content
  const readText = async (path) => {
    const file = pathMap.get(path);
    if (!file) return null;
    if (file.size > FILE_SKIP_SIZE) {
      console.warn('Skipping oversized file:', path);
      return null;
    }
    return await file.text();
  };

  setStatus('Reading files…');
  const followersTexts = (await Promise.all(classified.followers.map(readText))).filter(t => t != null);
  const followingTexts = (await Promise.all(classified.following.map(readText))).filter(t => t != null);

  await processParsedTexts(followersTexts, followingTexts);
}

async function processParsedTexts(followersTexts, followingTexts) {
  setStatus('Parsing…');

  // Check for HTML export in content
  for (const text of [...followersTexts, ...followingTexts]) {
    const trimmed = text.replace(/^﻿/, '').trimStart();
    if (trimmed.startsWith('<')) {
      showHtmlExportError();
      return;
    }
  }

  if (followersTexts.length === 0 && followingTexts.length === 0) {
    showError(
      'No followers or following files found.\n' +
      'Expected files like <code>followers_1.json</code> and <code>following.json</code> inside ' +
      '<code>connections/followers_and_following/</code>.\n' +
      'Make sure you dropped the right folder or ZIP from your Instagram export.'
    );
    return;
  }

  if (followersTexts.length === 0) {
    showError(
      'No followers files found (e.g. <code>followers_1.json</code>).\n' +
      'Following data was detected but followers data is missing.\n' +
      'Check that your export includes <code>connections/followers_and_following/followers_1.json</code>.'
    );
    return;
  }

  if (followingTexts.length === 0) {
    showError(
      'No following file found (e.g. <code>following.json</code>).\n' +
      'Followers data was detected but following data is missing.\n' +
      'Check that your export includes <code>connections/followers_and_following/following.json</code>.'
    );
    return;
  }

  // Parse all lists
  let followerLists = [];
  let followingLists = [];

  try {
    for (const text of followersTexts) {
      followerLists.push(parseFollowList(text));
    }
  } catch (err) {
    showError('Failed to parse followers file: ' + escapeHtml(err.message));
    return;
  }

  try {
    for (const text of followingTexts) {
      followingLists.push(parseFollowList(text));
    }
  } catch (err) {
    showError('Failed to parse following file: ' + escapeHtml(err.message));
    return;
  }

  const followers = mergeAccounts(...followerLists);
  const following = mergeAccounts(...followingLists);

  diffResult = computeDiff(followers, following);
  setStatus('');
  showResults();
}

// ─── Folder Walk (webkitGetAsEntry) ──────────────────────────────────────────

async function walkEntries(items) {
  const collectedFiles = [];

  // IMPORTANT: webkitGetAsEntry() and getAsFile() must be called synchronously
  // before any await — the drag data store is deactivated after the first yield,
  // causing subsequent calls to return null on Chrome/Safari.
  const preCollected = items.map(item => {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    const file = (!entry && item.getAsFile) ? item.getAsFile() : null;
    return { entry, file };
  });

  for (const { entry, file } of preCollected) {
    if (entry) {
      await walkEntry(entry, 0, collectedFiles);
    } else if (file) {
      collectedFiles.push(file);
    }
  }

  return collectedFiles;
}

async function walkEntry(entry, depth, out) {
  if (depth > FOLDER_WALK_DEPTH) return;

  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    if (file.size <= FILE_SKIP_SIZE) {
      // Attach relative path for classifyPaths
      Object.defineProperty(file, 'webkitRelativePath', {
        get() { return entry.fullPath.replace(/^\//, ''); },
        configurable: true,
      });
      out.push(file);
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const child of batch) {
        await walkEntry(child, depth + 1, out);
      }
    } while (batch.length > 0);
  }
}

// ─── Results View ─────────────────────────────────────────────────────────────

function showResults() {
  hideError();
  hideSizeNotice();

  // Summary cards
  summaryFollowing.textContent        = diffResult.counts.following.toLocaleString();
  summaryFollowers.textContent        = diffResult.counts.followers.toLocaleString();
  summaryNotFollowingBack.textContent = diffResult.counts.notFollowingBack.toLocaleString();
  summaryFans.textContent             = diffResult.counts.fans.toLocaleString();
  summaryMutuals.textContent          = diffResult.counts.mutuals.toLocaleString();

  // Update tab labels with counts
  tabBtnNotFollowing.textContent = `Not following you back (${diffResult.counts.notFollowingBack.toLocaleString()})`;
  tabBtnFans.textContent         = `Fans (${diffResult.counts.fans.toLocaleString()})`;

  resultsSection.hidden = false;
  dropZone.hidden = true;

  // Default: not-following-back tab
  switchTab('notFollowingBack');
}

function switchTab(tab) {
  activeTab = tab;
  showingAll = false;

  if (tab === 'notFollowingBack') {
    tabBtnNotFollowing.setAttribute('aria-selected', 'true');
    tabBtnFans.setAttribute('aria-selected', 'false');
    tabNotFollowing.hidden = false;
    tabFans.hidden = true;
    tabNotFollowing.appendChild(listContainer);
    activeAccounts = diffResult ? diffResult.notFollowingBack : [];
    downloadCsvBtn.textContent = 'Download CSV (not-following-back.csv)';
  } else {
    tabBtnNotFollowing.setAttribute('aria-selected', 'false');
    tabBtnFans.setAttribute('aria-selected', 'true');
    tabNotFollowing.hidden = true;
    tabFans.hidden = false;
    tabFans.appendChild(listContainer);
    activeAccounts = diffResult ? diffResult.fans : [];
    downloadCsvBtn.textContent = 'Download CSV (fans.csv)';
  }

  listContainer.hidden = false;
  searchInput.value = '';
  applyFilters();
}

function applyFilters() {
  const query = searchInput.value.toLowerCase();
  const sort = sortSelect.value;

  let accounts = activeAccounts;

  if (query) {
    accounts = accounts.filter(a => a.username.toLowerCase().includes(query));
  }

  // Sort
  accounts = [...accounts];
  if (sort === 'username-az') {
    accounts.sort((a, b) => a.key.localeCompare(b.key));
  } else if (sort === 'newest') {
    accounts.sort((a, b) => {
      if (a.timestamp == null && b.timestamp == null) return 0;
      if (a.timestamp == null) return 1;
      if (b.timestamp == null) return -1;
      return b.timestamp - a.timestamp;
    });
  } else if (sort === 'oldest') {
    accounts.sort((a, b) => {
      if (a.timestamp == null && b.timestamp == null) return 0;
      if (a.timestamp == null) return 1;
      if (b.timestamp == null) return -1;
      return a.timestamp - b.timestamp;
    });
  }
  // default 'export-order': no sort — preserve array order

  filteredAccounts = accounts;
  showingAll = false;
  renderList();
}

function renderList() {
  const toRender = showingAll ? filteredAccounts : filteredAccounts.slice(0, MAX_RENDER_ROWS);
  const hasMore = !showingAll && filteredAccounts.length > MAX_RENDER_ROWS;

  // Build list items
  const frag = document.createDocumentFragment();

  if (toRender.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = activeAccounts.length === 0
      ? 'None — this list is empty.'
      : 'No results match your search.';
    frag.appendChild(empty);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'account-list';
    for (const account of toRender) {
      ul.appendChild(renderAccountRow(account));
    }
    frag.appendChild(ul);
  }

  listContainer.replaceChildren(frag);

  if (hasMore) {
    showAllWrapper.hidden = false;
    showAllBtn.textContent = `Show all ${filteredAccounts.length.toLocaleString()} accounts`;
  } else {
    showAllWrapper.hidden = true;
  }
}

function renderAccountRow(account) {
  const li = document.createElement('li');
  li.className = 'account-row';

  const profileUrl = account.href || `https://www.instagram.com/${encodeURIComponent(account.username)}/`;

  const link = document.createElement('a');
  link.href = profileUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'account-link';
  link.textContent = '@' + account.username;

  const date = document.createElement('span');
  date.className = 'account-date';
  if (account.timestamp != null) {
    const d = new Date(account.timestamp * 1000);
    date.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    date.setAttribute('title', d.toISOString());
  } else {
    date.textContent = '—';
    date.setAttribute('aria-label', 'follow date unknown');
  }

  li.appendChild(link);
  li.appendChild(date);
  return li;
}

// ─── CSV Download ─────────────────────────────────────────────────────────────

function downloadCsv() {
  // Export the full active tab list (activeAccounts), not the search-filtered subset.
  // The filename already reflects the tab; exporting a partial filtered view would
  // silently truncate the file whenever the user had typed in the search box.
  const csv = accountsToCsv(activeAccounts);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = activeTab === 'notFollowingBack' ? 'not-following-back.csv' : 'fans.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download can start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── State ────────────────────────────────────────────────────────────────────

function startOver() {
  diffResult = null;
  activeAccounts = [];
  filteredAccounts = [];
  showingAll = false;
  activeTab = 'notFollowingBack';

  resultsSection.hidden = true;
  dropZone.hidden = false;
  hideError();
  hideSizeNotice();
  setStatus('');

  // Reset inputs so the same file can be re-dropped
  fileInput.value = '';
  folderInput.value = '';
}

// ─── Status / Error Helpers ───────────────────────────────────────────────────

function setStatus(msg) {
  statusRegion.textContent = msg;
}

function showError(htmlMsg) {
  errorMsg.innerHTML = htmlMsg;
  errorSection.hidden = false;
  resultsSection.hidden = true;
  dropZone.hidden = false;
  setStatus('');
}

function hideError() {
  errorSection.hidden = true;
  errorMsg.innerHTML = '';
}

function showSizeNotice() {
  sizeNotice.hidden = false;
}

function hideSizeNotice() {
  sizeNotice.hidden = true;
}

function showHtmlExportError() {
  showError(
    '<strong>HTML export detected.</strong><br>' +
    'This app requires the <strong>JSON format</strong> export from Instagram.<br><br>' +
    'To get a JSON export:<br>' +
    '<ol>' +
    '<li>Go to <strong>Accounts Center</strong> → <strong>Your information and permissions</strong> → <strong>Download your information</strong>.</li>' +
    '<li>Select <strong>Download or transfer information</strong>.</li>' +
    '<li>Choose your Instagram account and select <strong>Some of your information</strong>.</li>' +
    '<li>Under <strong>Connections</strong>, check <strong>Followers and following</strong>.</li>' +
    '<li>Click <strong>Next</strong>, set <strong>Format</strong> to <strong>JSON</strong> (not HTML), then request the download.</li>' +
    '</ol>' +
    'Instagram may take up to 14 days to prepare the file. Once downloaded, drop the ZIP here.'
  );
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
