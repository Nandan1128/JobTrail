// JobTrail — Excel Exporter
// Generates a formatted .xlsx file from tracked job data using SheetJS

/**
 * Export jobs array to an Excel file and trigger download
 * @param {Array} jobs - Array of job objects from storage
 */
function exportJobsToExcel(jobs) {
  if (!jobs || jobs.length === 0) {
    console.warn('[JobTrail] No jobs to export');
    return;
  }

  // Format data for the spreadsheet
  const rows = jobs.map(job => ({
    'Job ID': job.jobId || extractJobIdFromUrl(job.url) || (job.id ? 'JT-' + job.id.split('-')[0].toUpperCase() : 'N/A'),
    'Job Title': job.title || '',
    'Company': job.company || '',
    'Location': job.location || '',
    'Salary': job.salary || '',
    'Status': formatStatus(job.status),
    'Source': (job.source || 'manual').charAt(0).toUpperCase() + (job.source || 'manual').slice(1),
    'Date Saved': formatDate(job.dateSaved),
    'Date Applied': formatDate(job.dateApplied),
    'URL': job.url || '',
    'Notes': job.notes || '',
    'Description': (job.description || '').substring(0, 200)
  }));

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 35 },  // Job Title
    { wch: 25 },  // Company
    { wch: 22 },  // Location
    { wch: 18 },  // Salary
    { wch: 15 },  // Status
    { wch: 12 },  // Source
    { wch: 18 },  // Date Saved
    { wch: 18 },  // Date Applied
    { wch: 50 },  // URL
    { wch: 30 },  // Notes
    { wch: 40 }   // Description
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Job Applications');

  // Generate the file
  const today = new Date().toISOString().split('T')[0];
  const filename = `JobTrail_Applications_${today}.xlsx`;

  // Write to binary and trigger download
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Format status for display
 */
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

/**
 * Format ISO date string to readable format
 */
function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return isoString;
  }
}

function extractJobIdFromUrl(url) {
  if (!url) return '';
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
  return '';
}
