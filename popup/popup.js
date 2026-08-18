// JobTrail — Popup JavaScript
// Main dashboard logic: rendering, filtering, status updates, export,
// and real-time live Google Sheets synchronization configuration.

(function () {
  'use strict';

  // --- State ---
  let allJobs = [];
  let activeFilter = 'all';
  let searchQuery = '';
  let sheetsConfig = { enabled: false, webhookUrl: '', lastSync: null };

  // --- DOM References ---
  const jobListEl = document.getElementById('job-list');
  const emptyStateEl = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const filterChipsEl = document.getElementById('filter-chips');
  const addModal = document.getElementById('add-modal');
  const addForm = document.getElementById('add-form');
  const confirmModal = document.getElementById('confirm-modal');
  const sheetsModal = document.getElementById('sheets-modal');
  const footerInfo = document.getElementById('footer-info');
  const syncDot = document.getElementById('sync-dot');

  // Google Sheets Modal elements
  const toggleSheetsSync = document.getElementById('toggle-sheets-sync');
  const inputWebhookUrl = document.getElementById('input-webhook-url');
  const inputSheetUrl = document.getElementById('input-sheet-url');
  const sheetsStatusHint = document.getElementById('sheets-status-hint');
  const btnTestSheets = document.getElementById('btn-test-sheets');
  const btnSaveSheets = document.getElementById('btn-save-sheets-config');
  const btnSyncAllSheets = document.getElementById('btn-sync-all-sheets');
  const btnCopyScript = document.getElementById('btn-copy-script');
  const sheetsCodePreview = document.getElementById('sheets-code-preview');

  // Stat elements
  const statTotal = document.querySelector('#stat-total .stat-number');
  const statApplied = document.querySelector('#stat-applied .stat-number');
  const statInterview = document.querySelector('#stat-interview .stat-number');
  const statOffer = document.querySelector('#stat-offer .stat-number');

  // --- Status Configuration ---
  const STATUS_LABELS = {
    saved: 'Saved',
    applied: 'Applied',
    phone_screen: 'Phone Screen',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn'
  };

  // Google Apps Script Template Code (for 1-click copy)
  const GOOGLE_APPS_SCRIPT_CODE = `// JobTrail — Google Apps Script for Google Sheets Live Sync
const HEADERS = ['Job ID', 'Job Title', 'Company', 'Location', 'Salary', 'Status', 'Source', 'Employment Type', 'Work Type', 'Date Saved', 'Date Applied', 'Date Posted', 'Last Updated', 'Job URL', 'Notes', 'Description'];

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    setupHeadersIfNeeded(sheet);
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'addJob';

    if (action === 'test') {
      return responseJson({ success: true, message: 'Connected to Google Sheets successfully!' });
    }
    if (action === 'addJob') {
      const job = data.job;
      if (!job) return responseJson({ success: false, message: 'No job data' });
      const existingRow = findRowByJobId(sheet, job.id || job.url);
      if (existingRow > 0) {
        updateRow(sheet, existingRow, job);
        return responseJson({ success: true, action: 'updated', row: existingRow });
      } else {
        appendJobRow(sheet, job);
        return responseJson({ success: true, action: 'added' });
      }
    }
    if (action === 'updateJob') {
      const job = data.job;
      const updates = data.updates || {};
      const targetId = data.id || job?.id || job?.url;
      const rowIndex = findRowByJobId(sheet, targetId);
      if (rowIndex > 0) {
        if (job) updateRow(sheet, rowIndex, { ...job, ...updates });
        else updateSpecificFields(sheet, rowIndex, updates);
        return responseJson({ success: true, action: 'updated', row: rowIndex });
      } else if (job) {
        appendJobRow(sheet, { ...job, ...updates });
        return responseJson({ success: true, action: 'added_new' });
      }
      return responseJson({ success: false, message: 'Job not found to update' });
    }
    if (action === 'syncAll') {
      const jobs = data.jobs || [];
      let added = 0, updated = 0;
      for (const job of jobs) {
        const row = findRowByJobId(sheet, job.id || job.url);
        if (row > 0) { updateRow(sheet, row, job); updated++; }
        else { appendJobRow(sheet, job); added++; }
      }
      return responseJson({ success: true, added, updated, total: jobs.length });
    }
    return responseJson({ success: false, message: 'Unknown action' });
  } catch (err) {
    return responseJson({ success: false, error: err.toString() });
  }
}

function setupHeadersIfNeeded(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#4f46e5').setFontColor('#ffffff').setFontWeight('bold').setFontFamily('Inter').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    [120, 220, 180, 150, 130, 120, 110, 130, 120, 130, 130, 120, 130, 280, 200, 250].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }
}

function appendJobRow(sheet, job) {
  const displayId = job.jobId || extractDisplayJobId(job);
  sheet.appendRow([displayId, job.title||'Untitled Position', job.company||'Unknown Company', job.location||'', job.salary||'', formatStatus(job.status), job.source||'manual', job.employmentType||'', job.workType||'', formatDate(job.dateSaved), formatDate(job.dateApplied), job.datePosted||'', formatDate(job.lastUpdated), job.url||'', job.notes||'', (job.description||'').substring(0, 300)]);
}

function updateRow(sheet, rowIndex, job) {
  const displayId = job.jobId || extractDisplayJobId(job);
  const row = [displayId, job.title||'Untitled Position', job.company||'Unknown Company', job.location||'', job.salary||'', formatStatus(job.status), job.source||'manual', job.employmentType||'', job.workType||'', formatDate(job.dateSaved), formatDate(job.dateApplied), job.datePosted||'', formatDate(job.lastUpdated), job.url||'', job.notes||'', (job.description||'').substring(0, 300)];
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

function extractDisplayJobId(jobOrUrl) {
  if (!jobOrUrl) return 'N/A';
  if (typeof jobOrUrl === 'object' && jobOrUrl.jobId && typeof jobOrUrl.jobId === 'string' && !jobOrUrl.jobId.includes('-4xxx-')) {
    return jobOrUrl.jobId;
  }
  const url = typeof jobOrUrl === 'string' ? jobOrUrl : (jobOrUrl.url || '');
  if (url) {
    try {
      const indeedMatch = url.match(/[?&](?:jk|vjk)=([a-f0-9]{12,})/i);
      if (indeedMatch) return indeedMatch[1];
      const linkedinMatch = url.match(/(?:currentJobId=|\/jobs\/view\/)(\d{8,})/i);
      if (linkedinMatch) return linkedinMatch[1];
      const pathMatch = url.match(/\/(\d{6,12})\/?(?:[?#]|$)/) || url.match(/(?:job_?id=|\/job\/|\/jobs\/)(\d{6,12})/i);
      if (pathMatch) return pathMatch[1];
      const paramMatch = url.match(/[?&](?:job_?id|req_?id|position_?id|posting_?id)=([a-z0-9_-]{5,})/i);
      if (paramMatch) return paramMatch[1];
    } catch (e) { /* ignore */ }
  }
  const rawId = typeof jobOrUrl === 'object' ? (jobOrUrl.id || '') : '';
  if (rawId && rawId.length >= 8) {
    return 'JT-' + rawId.split('-')[0].toUpperCase();
  }
  return 'JT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function updateSpecificFields(sheet, rowIndex, updates) {
  if (updates.status) sheet.getRange(rowIndex, 6).setValue(formatStatus(updates.status));
  if (updates.dateApplied) sheet.getRange(rowIndex, 11).setValue(formatDate(updates.dateApplied));
  if (updates.lastUpdated) sheet.getRange(rowIndex, 13).setValue(formatDate(updates.lastUpdated));
  if (updates.notes !== undefined) sheet.getRange(rowIndex, 15).setValue(updates.notes);
}

function findRowByJobId(sheet, target) {
  if (!target) return -1;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return -1;
  const targetId = (typeof target === 'object' ? (target.jobId || target.id) : target) || '';
  const targetUrl = typeof target === 'object' ? (target.url || '') : (String(target).startsWith('http') ? target : '');
  const targetTitle = typeof target === 'object' ? (target.title || '').trim().toLowerCase() : '';
  const targetCompany = typeof target === 'object' ? (target.company || '').trim().toLowerCase() : '';
  const cleanTargetUrl = cleanUrlForSheet(targetUrl);
  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][0] || '');
    const rowTitle = String(data[i][1] || '').trim().toLowerCase();
    const rowCompany = String(data[i][2] || '').trim().toLowerCase();
    const rowUrl = String(data[i][13] || data[i][9] || '');
    if (targetId && rowId && rowId === targetId) return i + 1;
    if (cleanTargetUrl && rowUrl && cleanUrlForSheet(rowUrl) === cleanTargetUrl) return i + 1;
    if (targetTitle && targetCompany && rowTitle && rowCompany) {
      if (rowTitle === targetTitle && rowCompany === targetCompany) return i + 1;
    }
  }
  return -1;
}

function cleanUrlForSheet(url) {
  if (!url) return '';
  return String(url).split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase();
}

function formatStatus(status) {
  const map = { saved: 'Saved', applied: 'Applied', phone_screen: 'Phone Screen', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' };
  return map[status] || status || 'Saved';
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd HH:mm');
  } catch (e) { return isoString; }
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;

  // --- Initialize ---
  init();

  async function init() {
    await loadJobs();
    await loadSheetsConfig();
    setupEventListeners();
  }

  // --- Data Loading ---
  async function loadJobs() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getJobs' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[JobTrail] Load error:', chrome.runtime.lastError);
          allJobs = [];
        } else {
          allJobs = response?.jobs || [];
        }
        renderAll();
        resolve();
      });
    });
  }

  async function loadSheetsConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSheetsConfig' }, (response) => {
        if (response?.config) {
          sheetsConfig = response.config;
          updateSyncDot();
        }
        resolve();
      });
    });
  }

  function updateSyncDot() {
    if (syncDot) {
      syncDot.style.display = (sheetsConfig.enabled && sheetsConfig.webhookUrl) ? 'block' : 'none';
    }
    const btnOpenHeader = document.getElementById('btn-open-sheet-header');
    if (btnOpenHeader) {
      btnOpenHeader.style.display = (sheetsConfig.sheetUrl || (sheetsConfig.enabled && sheetsConfig.webhookUrl)) ? 'flex' : 'none';
    }
  }

  // --- Rendering ---
  function renderAll() {
    renderStats();
    renderJobList();
    updateFooter();
  }

  function renderStats() {
    statTotal.textContent = allJobs.length;
    statApplied.textContent = allJobs.filter(j => j.status === 'applied').length;
    statInterview.textContent = allJobs.filter(j =>
      j.status === 'interview' || j.status === 'phone_screen'
    ).length;
    statOffer.textContent = allJobs.filter(j => j.status === 'offer').length;
  }

  function renderJobList() {
    const filtered = getFilteredJobs();

    if (allJobs.length === 0) {
      jobListEl.style.display = 'none';
      emptyStateEl.style.display = '';
      return;
    }

    emptyStateEl.style.display = 'none';
    jobListEl.style.display = '';

    if (filtered.length === 0) {
      jobListEl.innerHTML = `
        <div class="no-results">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span class="no-results-text">No matching jobs found</span>
        </div>
      `;
      return;
    }

    jobListEl.innerHTML = filtered.map((job, i) => createJobCardHtml(job, i)).join('');

    // Attach event listeners to cards
    jobListEl.querySelectorAll('.job-card').forEach(card => {
      const jobId = card.dataset.id;

      // Status change
      const statusSelect = card.querySelector('.job-card-status-select');
      if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
          updateJobStatus(jobId, e.target.value);
        });
      }

      // Delete button
      const deleteBtn = card.querySelector('.job-card-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          showConfirm('Delete this job?', 'This action cannot be undone.', () => {
            deleteJob(jobId);
          });
        });
      }

      // Notes input
      const notesInput = card.querySelector('.job-card-notes-input');
      if (notesInput) {
        let notesTimeout;
        notesInput.addEventListener('input', (e) => {
          clearTimeout(notesTimeout);
          notesTimeout = setTimeout(() => {
            updateJobNotes(jobId, e.target.value);
          }, 500);
        });
      }
    });
  }

  function createJobCardHtml(job, index) {
    const statusClass = `status-${job.status}`;
    const sourceClass = `source-${job.source || 'manual'}`;
    const dateStr = formatDateShort(job.dateSaved);
    const hasUrl = job.url && job.url.trim();

    return `
      <div class="job-card" data-id="${job.id}" data-status="${job.status}" style="animation-delay: ${index * 0.05}s">
        <div class="job-card-top">
          <div class="job-card-info">
            <div class="job-card-title" title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</div>
            <div class="job-card-company">
              ${escapeHtml(job.company)}
              <span class="source-badge ${sourceClass}">${escapeHtml(job.source || 'manual')}</span>
            </div>
          </div>
          <button class="job-card-delete" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            </svg>
          </button>
        </div>

        <div class="job-card-meta">
          ${job.location ? `
            <span class="job-card-meta-item">
              <span class="job-card-meta-icon">📍</span>
              ${escapeHtml(job.location)}
            </span>
          ` : ''}
          ${job.salary ? `
            <span class="job-card-meta-item">
              <span class="job-card-meta-icon">💰</span>
              ${escapeHtml(job.salary)}
            </span>
          ` : ''}
          ${job.employmentType ? `
            <span class="job-card-meta-item">
              <span class="job-card-meta-icon">💼</span>
              ${escapeHtml(job.employmentType)}
            </span>
          ` : ''}
          ${job.workType ? `
            <span class="job-card-meta-item job-card-work-badge">
              ${escapeHtml(job.workType)}
            </span>
          ` : ''}
        </div>

        <div class="job-card-bottom">
          <select class="job-card-status-select ${statusClass}" title="Change status">
            ${Object.entries(STATUS_LABELS).map(([value, label]) =>
              `<option value="${value}" ${value === job.status ? 'selected' : ''}>${label}</option>`
            ).join('')}
          </select>
          <div class="job-card-actions">
            <span class="job-card-date">${dateStr}</span>
            ${hasUrl ? `
              <a href="${escapeHtml(job.url)}" target="_blank" class="job-card-link" title="Open listing">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            ` : ''}
          </div>
        </div>

        <div class="job-card-notes">
          <textarea class="job-card-notes-input" placeholder="Add notes..." rows="1">${escapeHtml(job.notes || '')}</textarea>
        </div>
      </div>
    `;
  }

  function updateFooter() {
    const count = allJobs.length;
    footerInfo.textContent = `${count} job${count !== 1 ? 's' : ''} tracked`;
  }

  // --- Filtering ---
  function getFilteredJobs() {
    let jobs = allJobs;

    if (activeFilter !== 'all') {
      jobs = jobs.filter(j => j.status === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      jobs = jobs.filter(j =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.company || '').toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q) ||
        (j.notes || '').toLowerCase().includes(q)
      );
    }

    return jobs;
  }

  // --- Actions ---
  async function updateJobStatus(id, newStatus) {
    chrome.runtime.sendMessage(
      { action: 'updateJob', id, updates: { status: newStatus } },
      (response) => {
        if (response?.success) {
          const job = allJobs.find(j => j.id === id);
          if (job) {
            job.status = newStatus;
            if (response.job?.dateApplied) {
              job.dateApplied = response.job.dateApplied;
            }
          }
          renderAll();
          showToast('Status updated', 'success');
        }
      }
    );
  }

  async function updateJobNotes(id, notes) {
    chrome.runtime.sendMessage(
      { action: 'updateJob', id, updates: { notes } },
      (response) => {
        if (response?.success) {
          const job = allJobs.find(j => j.id === id);
          if (job) job.notes = notes;
        }
      }
    );
  }

  async function deleteJob(id) {
    chrome.runtime.sendMessage(
      { action: 'deleteJob', id },
      (response) => {
        if (response?.success) {
          allJobs = allJobs.filter(j => j.id !== id);
          renderAll();
          showToast('Job removed', 'success');
        }
      }
    );
  }

  async function clearAllJobs() {
    chrome.runtime.sendMessage(
      { action: 'clearAll' },
      (response) => {
        if (response?.success) {
          allJobs = [];
          renderAll();
          showToast('All jobs cleared', 'success');
        }
      }
    );
  }

  function exportToExcel() {
    if (allJobs.length === 0) {
      showToast('No jobs to export', 'error');
      return;
    }

    try {
      exportJobsToExcel(allJobs);
      showToast('Excel file downloaded!', 'success');
    } catch (err) {
      console.error('[JobTrail] Export error:', err);
      showToast('Export failed', 'error');
    }
  }

  // --- Add Job Modal ---
  function openAddModal() {
    addForm.reset();
    addModal.style.display = '';

    // Try to pre-fill URL from current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url && !tabs[0].url.startsWith('chrome')) {
        document.getElementById('input-url').value = tabs[0].url;
      }
    });
  }

  function closeAddModal() {
    addModal.style.display = 'none';
  }

  function handleAddJob(e) {
    e.preventDefault();

    const data = {
      title: document.getElementById('input-title').value.trim(),
      company: document.getElementById('input-company').value.trim(),
      location: document.getElementById('input-location').value.trim(),
      salary: document.getElementById('input-salary').value.trim(),
      url: document.getElementById('input-url').value.trim(),
      notes: document.getElementById('input-notes').value.trim(),
      source: 'manual'
    };

    if (!data.title || !data.company) {
      showToast('Title and company are required', 'error');
      return;
    }

    chrome.runtime.sendMessage(
      { action: 'addManualJob', data },
      (response) => {
        if (response?.success) {
          allJobs.unshift(response.job);
          renderAll();
          closeAddModal();
          showToast('Job added!', 'success');
        } else {
          showToast(response?.message || 'Failed to add job', 'error');
        }
      }
    );
  }

  // --- Google Sheets Sync Modal ---
  function openSheetsModal() {
    toggleSheetsSync.checked = Boolean(sheetsConfig.enabled);
    inputWebhookUrl.value = sheetsConfig.webhookUrl || '';
    if (inputSheetUrl) inputSheetUrl.value = sheetsConfig.sheetUrl || '';
    sheetsCodePreview.value = GOOGLE_APPS_SCRIPT_CODE;

    if (sheetsConfig.enabled && sheetsConfig.webhookUrl) {
      sheetsStatusHint.textContent = '✓ Live Auto-Sync Active';
      sheetsStatusHint.style.color = '#10b981';
    } else {
      sheetsStatusHint.textContent = 'Enter your deployed Google Apps Script URL';
      sheetsStatusHint.style.color = '';
    }

    sheetsModal.style.display = '';
  }

  function closeSheetsModal() {
    sheetsModal.style.display = 'none';
  }

  function handleTestSheets() {
    const url = inputWebhookUrl.value.trim();
    if (!url) {
      sheetsStatusHint.textContent = 'Please enter a Web App URL first';
      sheetsStatusHint.style.color = '#ef4444';
      return;
    }

    btnTestSheets.textContent = 'Testing...';
    btnTestSheets.disabled = true;

    chrome.runtime.sendMessage({ action: 'testGoogleSheets', webhookUrl: url }, (response) => {
      btnTestSheets.disabled = false;
      btnTestSheets.textContent = 'Test';

      if (response?.success) {
        sheetsStatusHint.textContent = '✓ Connection Verified!';
        sheetsStatusHint.style.color = '#10b981';
        showToast('Google Sheets connected!', 'success');
      } else {
        sheetsStatusHint.textContent = '✕ ' + (response?.message || 'Connection failed');
        sheetsStatusHint.style.color = '#ef4444';
      }
    });
  }

  function handleSaveSheetsConfig() {
    const newConfig = {
      enabled: toggleSheetsSync.checked,
      webhookUrl: inputWebhookUrl.value.trim(),
      sheetUrl: inputSheetUrl ? inputSheetUrl.value.trim() : (sheetsConfig.sheetUrl || ''),
      lastSync: sheetsConfig.lastSync || null
    };

    chrome.runtime.sendMessage({ action: 'saveSheetsConfig', config: newConfig }, () => {
      sheetsConfig = newConfig;
      updateSyncDot();
      closeSheetsModal();
      showToast('Google Sheets settings saved!', 'success');
    });
  }

  function handleOpenGoogleSheet() {
    const url = (inputSheetUrl && inputSheetUrl.value.trim()) || sheetsConfig.sheetUrl || 'https://sheets.google.com';
    chrome.tabs.create({ url });
  }

  function handleSyncAllSheets() {
    if (allJobs.length === 0) {
      showToast('No jobs to sync', 'error');
      return;
    }

    const url = inputWebhookUrl.value.trim() || sheetsConfig.webhookUrl;
    if (!url) {
      showToast('Please enter Web App URL first', 'error');
      return;
    }

    btnSyncAllSheets.textContent = 'Syncing...';
    btnSyncAllSheets.disabled = true;

    chrome.runtime.sendMessage({ action: 'syncAllToGoogleSheets' }, (response) => {
      btnSyncAllSheets.disabled = false;
      btnSyncAllSheets.textContent = 'Sync All Past Jobs';

      if (response?.success) {
        showToast(`✓ Synced ${response.total || allJobs.length} jobs to Google Sheets!`, 'success');
      } else {
        showToast('Sync failed: ' + (response?.error || response?.message || 'Check Webhook URL'), 'error');
      }
    });
  }

  function handleCopyScript() {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE).then(() => {
      btnCopyScript.textContent = '✓ Copied!';
      setTimeout(() => {
        btnCopyScript.textContent = 'Copy Script Code';
      }, 2000);
    });
  }

  // --- Confirm Dialog ---
  let confirmCallback = null;

  function showConfirm(title, text, callback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-text').textContent = text;
    confirmCallback = callback;
    confirmModal.style.display = '';
  }

  function closeConfirm() {
    confirmModal.style.display = 'none';
    confirmCallback = null;
  }

  // --- Toast ---
  let toastTimeout;

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    clearTimeout(toastTimeout);
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    toastTimeout = setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // --- Utilities ---
  function formatDateShort(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderJobList();
    });

    // Filter chips
    filterChipsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      filterChipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      activeFilter = chip.dataset.filter;
      renderJobList();
    });

    // Horizontal mouse wheel scrolling for filter chips
    filterChipsEl.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        filterChipsEl.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    // Google Sheets button & modal
    document.getElementById('btn-sheets').addEventListener('click', openSheetsModal);
    document.getElementById('btn-open-sheet-header')?.addEventListener('click', handleOpenGoogleSheet);
    document.getElementById('btn-open-google-sheet')?.addEventListener('click', handleOpenGoogleSheet);
    document.getElementById('sheets-modal-close').addEventListener('click', closeSheetsModal);
    btnTestSheets.addEventListener('click', handleTestSheets);
    btnSaveSheets.addEventListener('click', handleSaveSheetsConfig);
    btnSyncAllSheets.addEventListener('click', handleSyncAllSheets);
    btnCopyScript.addEventListener('click', handleCopyScript);
    sheetsModal.addEventListener('click', (e) => {
      if (e.target === sheetsModal) closeSheetsModal();
    });

    // Add job buttons
    document.getElementById('btn-add-job').addEventListener('click', openAddModal);
    document.getElementById('btn-empty-add')?.addEventListener('click', openAddModal);

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeAddModal);
    addModal.addEventListener('click', (e) => {
      if (e.target === addModal) closeAddModal();
    });

    // Add form submit
    addForm.addEventListener('submit', handleAddJob);

    // Export
    document.getElementById('btn-export').addEventListener('click', exportToExcel);

    // Clear all
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (allJobs.length === 0) {
        showToast('No jobs to clear', 'error');
        return;
      }
      showConfirm(
        'Clear all jobs?',
        `This will permanently remove all ${allJobs.length} tracked jobs. This cannot be undone.`,
        clearAllJobs
      );
    });

    // Confirm dialog
    document.getElementById('confirm-ok').addEventListener('click', () => {
      if (confirmCallback) confirmCallback();
      closeConfirm();
    });
    document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeConfirm();
    });

    // Keyboard shortcut: Escape closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (addModal.style.display !== 'none') closeAddModal();
        if (sheetsModal.style.display !== 'none') closeSheetsModal();
        if (confirmModal.style.display !== 'none') closeConfirm();
      }
    });
  }
})();
