// JobTrail — Glassdoor Job Extractor
// Extracts job details from Glassdoor job listing pages

window.JobTrailSiteExtractor = {
  source: 'glassdoor',

  isJobPage() {
    const path = window.location.pathname;
    return path.includes('/job-listing/') ||
      path.includes('/Job/') ||
      path.includes('/partner/jobListing') ||
      document.querySelector('[data-test="jobTitle"]') !== null;
  },

  extract() {
    if (!this.isJobPage()) return null;

    try {
      const title = this._getTitle();
      const company = this._getCompany();

      if (!title && !company) return null;

      return {
        title: title || 'Untitled Position',
        company: company || 'Unknown Company',
        location: this._getLocation(),
        salary: this._getSalary(),
        url: this._cleanUrl(),
        source: this.source,
        description: this._getDescription()
      };
    } catch (err) {
      console.warn('[JobTrail] Glassdoor extraction error:', err);
      return null;
    }
  },

  _getTitle() {
    const selectors = [
      '[data-test="jobTitle"]',
      '.job-title',
      '.css-1vg6q84',
      'h1.heading_Heading__BqX5J',
      '.JobDetails_jobTitle__eFphp',
      'h1'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return '';
  },

  _getCompany() {
    const selectors = [
      '[data-test="employerName"]',
      '.employer-name',
      '.css-87uc0g a',
      '.EmployerProfile_profileContainer__d5rMb a',
      '.JobDetails_companyName__l2yLY'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        // Remove rating number that's sometimes appended
        return el.textContent.trim().replace(/\d+\.\d+$/, '').trim();
      }
    }
    return '';
  },

  _getLocation() {
    const selectors = [
      '[data-test="location"]',
      '.location',
      '.css-56kyx5',
      '.JobDetails_location__mSg5h'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return '';
  },

  _getSalary() {
    const selectors = [
      '[data-test="detailSalary"]',
      '.salary-estimate span',
      '.css-1bluz6i',
      '.SalaryEstimate_salaryRange__brHFo'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && (text.includes('$') || text.includes('K') || text.includes('Employer'))) {
        return text;
      }
    }
    return '';
  },

  _getDescription() {
    const selectors = [
      '.jobDescriptionContent',
      '[data-test="jobDescription"]',
      '.desc',
      '.JobDetails_jobDescription__6VeBn'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim().substring(0, 300);
      }
    }
    return '';
  },

  _cleanUrl() {
    return window.location.href.split('?')[0];
  }
};
