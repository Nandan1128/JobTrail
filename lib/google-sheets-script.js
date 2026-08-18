// ============================================================
// JobTrail — Google Apps Script for Live Google Sheets Sync
// ============================================================
// Instructions:
// 1. Open a new or existing Google Sheet (https://sheets.new)
// 2. Click Extensions > Apps Script
// 3. Delete any code in the editor and PASTE this entire script
// 4. Click "Deploy" > "New deployment"
// 5. Select type: "Web app"
// 6. Set Description: "JobTrail Sync"
// 7. Set "Execute as": "Me"
// 8. Set "Who has access": "Anyone" (Required so your extension can send data)
// 9. Click "Deploy", authorize permissions, and COPY the Web app URL
// 10. Paste the Web app URL into JobTrail extension settings!
// ============================================================

const HEADERS = [
  'Job ID',
  'Job Title',
  'Company',
  'Location',
  'Salary',
  'Status',
  'Source',
  'Date Saved',
  'Date Applied',
  'Job URL',
  'Notes',
  'Description'
];

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
      if (!job) return responseJson({ success: false, message: 'No job data provided' });

      // Check if job already exists in sheet
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
        if (job) {
          updateRow(sheet, rowIndex, { ...job, ...updates });
        } else {
          updateSpecificFields(sheet, rowIndex, updates);
        }
        return responseJson({ success: true, action: 'updated', row: rowIndex });
      } else if (job) {
        appendJobRow(sheet, { ...job, ...updates });
        return responseJson({ success: true, action: 'added_new' });
      }
      return responseJson({ success: false, message: 'Job not found to update' });
    }

    if (action === 'syncAll') {
      const jobs = data.jobs || [];
      let added = 0;
      let updated = 0;

      for (const job of jobs) {
        const row = findRowByJobId(sheet, job.id || job.url);
        if (row > 0) {
          updateRow(sheet, row, job);
          updated++;
        } else {
          appendJobRow(sheet, job);
          added++;
        }
      }
      return responseJson({ success: true, added, updated, total: jobs.length });
    }

    return responseJson({ success: false, message: 'Unknown action' });
  } catch (err) {
    return responseJson({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  return responseJson({
    status: 'online',
    app: 'JobTrail Sync Endpoint',
    version: '1.0.0'
  });
}

// --- Helper Functions ---

function setupHeadersIfNeeded(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#4f46e5');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setFontFamily('Inter');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);

    // Set standard column widths
    const widths = [120, 220, 180, 150, 130, 120, 110, 130, 130, 280, 200, 250];
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }
}

function appendJobRow(sheet, job) {
  const displayId = job.jobId || extractDisplayJobId(job);
  const row = [
    displayId,
    job.title || 'Untitled Position',
    job.company || 'Unknown Company',
    job.location || '',
    job.salary || '',
    formatStatus(job.status),
    job.source || 'manual',
    job.employmentType || '',
    job.workType || '',
    formatDate(job.dateSaved),
    formatDate(job.dateApplied),
    job.datePosted || '',
    formatDate(job.lastUpdated),
    job.url || '',
    job.notes || '',
    (job.description || '').substring(0, 300)
  ];
  sheet.appendRow(row);
}

function updateRow(sheet, rowIndex, job) {
  const displayId = job.jobId || extractDisplayJobId(job);
  const row = [
    displayId,
    job.title || 'Untitled Position',
    job.company || 'Unknown Company',
    job.location || '',
    job.salary || '',
    formatStatus(job.status),
    job.source || 'manual',
    job.employmentType || '',
    job.workType || '',
    formatDate(job.dateSaved),
    formatDate(job.dateApplied),
    job.datePosted || '',
    formatDate(job.lastUpdated),
    job.url || '',
    job.notes || '',
    (job.description || '').substring(0, 300)
  ];
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
  if (updates.status) {
    sheet.getRange(rowIndex, 6).setValue(formatStatus(updates.status));
  }
  if (updates.dateApplied) {
    sheet.getRange(rowIndex, 9).setValue(formatDate(updates.dateApplied));
  }
  if (updates.notes !== undefined) {
    sheet.getRange(rowIndex, 11).setValue(updates.notes);
  }
}

function findRowByJobId(sheet, idOrUrl) {
  if (!idOrUrl) return -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    // Check ID (Col 1) or URL (Col 10)
    if (data[i][0] === idOrUrl || data[i][9] === idOrUrl) {
      return i + 1; // 1-indexed row number
    }
  }
  return -1;
}

function formatStatus(status) {
  const statusMap = {
    'saved': 'Saved',
    'applied': 'Applied',
    'phone_screen': 'Phone Screen',
    'interview': 'Interview',
    'offer': 'Offer',
    'rejected': 'Rejected'
  };
  return statusMap[status] || status || 'Saved';
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd HH:mm');
  } catch (e) {
    return isoString;
  }
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
