// JobTrail — Background Service Worker
// Handles message passing, storage management, badge updates, deduplication,
// and real-time live synchronization with Google Sheets.

const STORAGE_KEY = 'jobtrail_jobs';
const SHEETS_CONFIG_KEY = 'jobtrail_sheets_config';
const STATUSES = ['saved', 'applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];

/**
 * Generate a unique ID (UUID v4 style)
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get all stored jobs
 */
async function getJobs() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

/**
 * Save all jobs to storage
 */
async function setJobs(jobs) {
  await chrome.storage.local.set({ [STORAGE_KEY]: jobs });
  updateBadge(jobs.length);
}

/**
 * Get Google Sheets configuration
 */
async function getSheetsConfig() {
  const result = await chrome.storage.local.get(SHEETS_CONFIG_KEY);
  return result[SHEETS_CONFIG_KEY] || {
    enabled: false,
    webhookUrl: '',
    sheetUrl: '',
    lastSync: null
  };
}

/**
 * Save Google Sheets configuration
 */
async function setSheetsConfig(config) {
  await chrome.storage.local.set({ [SHEETS_CONFIG_KEY]: config });
}

/**
 * Sync a payload to Google Sheets via Webhook
 */
async function syncToGoogleSheets(payload, retryAttempt = 0) {
  try {
    const config = await getSheetsConfig();
    if (!config.enabled || !config.webhookUrl) {
      return { skipped: true };
    }

    console.log('[JobTrail] Syncing to Google Sheets:', payload.action);

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Apps script prefers text/plain for CORS preflights
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('[JobTrail] Google Sheets response:', result);

    // Update last sync time
    config.lastSync = new Date().toISOString();
    await setSheetsConfig(config);

    return result;
  } catch (err) {
    console.warn(`[JobTrail] Google Sheets sync error (attempt ${retryAttempt + 1}):`, err);

    // Retry once on network failure
    if (retryAttempt < 1) {
      console.log('[JobTrail] Retrying Google Sheets sync in 3 seconds...');
      await new Promise(r => setTimeout(r, 3000));
      return syncToGoogleSheets(payload, retryAttempt + 1);
    }

    return { success: false, error: err.message };
  }
}

/**
/**
 * Normalize URL for deduplication
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('refId');
    u.searchParams.delete('trackingId');
    u.searchParams.delete('trk');
    u.searchParams.delete('currentJobId');
    u.searchParams.delete('position');
    u.searchParams.delete('feedId');
    return u.href.replace(/\/$/, '');
  } catch {
    return url || '';
  }
}

/**
 * Extract clean, human-readable Portal Job ID from URL or job object, with short clean fallback
 */
function extractDisplayJobId(dataOrUrl) {
  if (!dataOrUrl) return 'N/A';

  if (typeof dataOrUrl === 'object' && dataOrUrl.jobId && typeof dataOrUrl.jobId === 'string' && !dataOrUrl.jobId.includes('-4xxx-')) {
    return dataOrUrl.jobId;
  }

  const url = typeof dataOrUrl === 'string' ? dataOrUrl : (dataOrUrl.url || '');
  if (url) {
    try {
      // Indeed (jk=7a8b9c123456 or vjk=...)
      const indeedMatch = url.match(/[?&](?:jk|vjk)=([a-f0-9]{12,})/i);
      if (indeedMatch) return indeedMatch[1];

      // LinkedIn (4449047029 or currentJobId=...)
      const linkedinMatch = url.match(/(?:currentJobId=|\/jobs\/view\/)(\d{8,})/i);
      if (linkedinMatch) return linkedinMatch[1];

      // Enterprise ATS (/job/Bangalore-Android.../1423696033/ or /jobs/1423696033)
      const pathMatch = url.match(/\/(\d{6,12})\/?(?:[?#]|$)/) || url.match(/(?:job_?id=|\/job\/|\/jobs\/)(\d{6,12})/i);
      if (pathMatch) return pathMatch[1];

      // General query params (job_id, reqid, position_id)
      const paramMatch = url.match(/[?&](?:job_?id|req_?id|position_?id|posting_?id)=([a-z0-9_-]{5,})/i);
      if (paramMatch) return paramMatch[1];
    } catch (e) { /* ignore */ }
  }

  const rawId = typeof dataOrUrl === 'object' ? (dataOrUrl.id || '') : '';
  if (rawId && rawId.length >= 8) {
    return 'JT-' + rawId.split('-')[0].toUpperCase();
  }

  return 'JT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Find existing job by normalized URL, Job ID in URL, or Title + Company
 */
async function findExistingJob(dataOrUrl) {
  const jobs = await getJobs();
  if (!jobs || jobs.length === 0 || !dataOrUrl) return null;

  const targetUrl = typeof dataOrUrl === 'string' ? dataOrUrl : (dataOrUrl.url || '');
  const targetTitle = typeof dataOrUrl === 'object' ? (dataOrUrl.title || '').trim().toLowerCase() : '';
  const targetCompany = typeof dataOrUrl === 'object' ? (dataOrUrl.company || '').trim().toLowerCase() : '';

  const normalizedTarget = normalizeUrl(targetUrl);

  // Extract numeric or alphanumeric Job ID (e.g. 4449047029 on LinkedIn, 1423696033 on Capgemini, jk= on Indeed)
  const targetJobIdMatch = targetUrl.match(/(?:currentJobId=|job\/|view\/|jk=|\/jobs\/)(\d{6,}|[a-f0-9]{16})/i) || targetUrl.match(/(\d{6,})/);
  const targetJobId = targetJobIdMatch ? targetJobIdMatch[1] : null;

  return jobs.find(j => {
    // 1. Direct URL or normalized URL match
    if (j.url && normalizeUrl(j.url) === normalizedTarget) return true;

    // 2. Job ID in URL match
    if (targetJobId && j.url && j.url.includes(targetJobId)) return true;

    // 3. Title + Company match (case insensitive)
    if (targetTitle && targetCompany && j.title && j.company) {
      const jTitle = j.title.trim().toLowerCase();
      const jCompany = j.company.trim().toLowerCase();
      if (jTitle === targetTitle && jCompany === targetCompany) return true;
    }

    return false;
  }) || null;
}

/**
 * Check if a job already exists
 */
async function jobExists(dataOrUrl) {
  const existing = await findExistingJob(dataOrUrl);
  return !!existing;
}

/**
 * Update the extension badge with job count
 */
function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// --- Message Handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveJob') {
    handleSaveJob(message.data).then(sendResponse);
    return true; // async response
  }

  if (message.action === 'checkJob') {
    findExistingJob(message.data || message.url).then(existingJob => {
      sendResponse({ exists: !!existingJob, job: existingJob });
    });
    return true;
  }

  if (message.action === 'getJobs') {
    getJobs().then(jobs => {
      sendResponse({ jobs });
    });
    return true;
  }

  if (message.action === 'updateJob') {
    handleUpdateJob(message.id, message.updates).then(sendResponse);
    return true;
  }

  if (message.action === 'deleteJob') {
    handleDeleteJob(message.id).then(sendResponse);
    return true;
  }

  if (message.action === 'clearAll') {
    handleClearAll().then(sendResponse);
    return true;
  }

  if (message.action === 'exportExcel') {
    handleExportExcel().then(sendResponse);
    return true;
  }

  if (message.action === 'addManualJob') {
    handleSaveJob(message.data).then(sendResponse);
    return true;
  }

  if (message.action === 'markApplied') {
    handleMarkApplied(message.data).then(sendResponse);
    return true;
  }

  if (message.action === 'getStats') {
    handleGetStats().then(sendResponse);
    return true;
  }

  // --- Google Sheets Sync Actions ---

  if (message.action === 'getSheetsConfig') {
    getSheetsConfig().then(config => sendResponse({ config }));
    return true;
  }

  if (message.action === 'saveSheetsConfig') {
    setSheetsConfig(message.config).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'testGoogleSheets') {
    testGoogleSheetsWebhook(message.webhookUrl).then(sendResponse);
    return true;
  }

  if (message.action === 'syncAllToGoogleSheets') {
    handleSyncAllToGoogleSheets().then(sendResponse);
    return true;
  }
});

/**
 * Test a Google Sheets Webhook URL
 */
async function testGoogleSheetsWebhook(url) {
  try {
    if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
      return { success: false, message: 'Invalid URL. Must be a Google Apps Script Web App URL.' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'test' })
    });

    const result = await response.json();
    return { success: result.success || true, message: result.message || 'Connection successful!' };
  } catch (err) {
    console.warn('[JobTrail] Test webhook error:', err);
    return { success: false, message: 'Failed to connect. Please check permissions in Apps Script (Must be "Who has access: Anyone").' };
  }
}

/**
 * Bulk sync all existing jobs to Google Sheets
 */
async function handleSyncAllToGoogleSheets() {
  try {
    const jobs = await getJobs();
    if (jobs.length === 0) {
      return { success: false, message: 'No jobs to sync' };
    }

    const result = await syncToGoogleSheets({ action: 'syncAll', jobs });
    return result;
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Mark a job as applied (or create it directly as applied if not previously saved)
 */
async function handleMarkApplied(data) {
  try {
    if (!data) return { success: false, message: 'No job data provided' };

    const jobs = await getJobs();
    const targetUrl = data.url || '';
    const normalizedTarget = normalizeUrl(targetUrl);

    // Extract numeric or alphanumeric job ID from URL (e.g. LinkedIn 4449047029)
    const targetJobIdMatch = targetUrl.match(/(\d{6,})/);
    const targetJobId = targetJobIdMatch ? targetJobIdMatch[1] : null;

    let index = jobs.findIndex(j => {
      if (j.url && normalizeUrl(j.url) === normalizedTarget) return true;
      if (targetJobId && j.url && j.url.includes(targetJobId)) return true;
      if (j.title && data.title && j.company && data.company &&
          j.title.toLowerCase() === data.title.toLowerCase() &&
          j.company.toLowerCase() === data.company.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (index !== -1) {
      // Job exists -> update status to applied
      const now = new Date().toISOString();
      jobs[index].status = 'applied';
      if (!jobs[index].dateApplied) {
        jobs[index].dateApplied = now;
      }
      await setJobs(jobs);

      // Live real-time sync update to Google Sheets
      syncToGoogleSheets({
        action: 'updateJob',
        id: jobs[index].id,
        job: jobs[index],
        updates: { status: 'applied', dateApplied: jobs[index].dateApplied }
      });

      console.log('[JobTrail] ✅ Existing job marked as applied:', jobs[index].title);
      return { success: true, job: jobs[index], action: 'updated' };
    } else {
      // New job -> save directly as applied
      const now = new Date().toISOString();
      const rawId = generateId();
      const job = {
        id: rawId,
        jobId: extractDisplayJobId(data),
        title: data.title || 'Untitled Position',
        company: data.company || 'Unknown Company',
        location: data.location || '',
        salary: data.salary || '',
        url: data.url || '',
        source: data.source || 'manual',
        status: 'applied',
        dateSaved: now,
        dateApplied: now,
        lastUpdated: now,
        notes: data.notes || '',
        description: data.description || '',
        employmentType: data.employmentType || '',
        datePosted: data.datePosted || '',
        workType: data.workType || ''
      };

      jobs.unshift(job);
      await setJobs(jobs);

      // Live real-time sync to Google Sheets
      syncToGoogleSheets({ action: 'addJob', job });

      console.log('[JobTrail] ✅ New job created & marked as applied:', job.title);
      return { success: true, job, action: 'saved_new' };
    }
  } catch (err) {
    console.error('[JobTrail] Mark applied error:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Save a new job
 */
async function handleSaveJob(data) {
  try {
    const existing = await findExistingJob(data);
    if (existing) {
      return { success: false, message: 'Job already saved', job: existing };
    }

    const now = new Date().toISOString();
    const rawId = generateId();
    const job = {
      id: rawId,
      jobId: extractDisplayJobId(data),
      title: data.title || 'Untitled Position',
      company: data.company || 'Unknown Company',
      location: data.location || '',
      salary: data.salary || '',
      url: data.url || '',
      source: data.source || 'manual',
      status: 'saved',
      dateSaved: now,
      dateApplied: '',
      lastUpdated: now,
      notes: data.notes || '',
      description: data.description || '',
      employmentType: data.employmentType || '',
      datePosted: data.datePosted || '',
      workType: data.workType || ''
    };

    const jobs = await getJobs();
    jobs.unshift(job); // newest first
    await setJobs(jobs);

    // Live real-time sync to Google Sheets
    syncToGoogleSheets({ action: 'addJob', job });

    return { success: true, job };
  } catch (err) {
    console.error('[JobTrail] Save error:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Update an existing job
 */
async function handleUpdateJob(id, updates) {
  try {
    const jobs = await getJobs();
    const index = jobs.findIndex(j => j.id === id);
    if (index === -1) {
      return { success: false, message: 'Job not found' };
    }

    // Track when status changes to "applied"
    if (updates.status === 'applied' && jobs[index].status !== 'applied' && !jobs[index].dateApplied) {
      updates.dateApplied = new Date().toISOString();
    }

    // Always track last updated timestamp
    updates.lastUpdated = new Date().toISOString();

    jobs[index] = { ...jobs[index], ...updates };
    await setJobs(jobs);

    // Live real-time sync update to Google Sheets
    syncToGoogleSheets({
      action: 'updateJob',
      id: id,
      job: jobs[index],
      updates: updates
    });

    return { success: true, job: jobs[index] };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Delete a job
 */
async function handleDeleteJob(id) {
  try {
    const jobs = await getJobs();
    const filtered = jobs.filter(j => j.id !== id);
    await setJobs(filtered);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Clear all jobs
 */
async function handleClearAll() {
  try {
    await setJobs([]);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Get statistics
 */
async function handleGetStats() {
  const jobs = await getJobs();
  const stats = {
    total: jobs.length,
    byStatus: {},
    thisWeek: 0,
    thisMonth: 0
  };

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const status of STATUSES) {
    stats.byStatus[status] = 0;
  }

  for (const job of jobs) {
    stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;
    const saved = new Date(job.dateSaved);
    if (saved >= weekAgo) stats.thisWeek++;
    if (saved >= monthAgo) stats.thisMonth++;
  }

  return { stats };
}

/**
 * Handle Excel export - sends data back to popup for client-side generation
 */
async function handleExportExcel() {
  try {
    const jobs = await getJobs();
    return { success: true, jobs };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// --- Initialization ---

// Update badge on startup
chrome.runtime.onStartup?.addListener(async () => {
  const jobs = await getJobs();
  updateBadge(jobs.length);
});

// Update badge on install
chrome.runtime.onInstalled.addListener(async () => {
  const jobs = await getJobs();
  updateBadge(jobs.length);
});
