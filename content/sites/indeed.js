// JobTrail — Indeed Job Extractor
// Extracts job details from Indeed job listing pages

window.JobTrailSiteExtractor = {
  source: 'indeed',

  isJobPage() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    return path.includes('/viewjob') ||
      path.includes('/rc/clk') ||
      params.has('jk') ||
      document.querySelector('[data-jk]') !== null;
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
      console.warn('[JobTrail] Indeed extraction error:', err);
      return null;
    }
  },

  _getTitle() {
    const selectors = [
      'h1.jobsearch-JobInfoHeader-title span',
      'h1.jobsearch-JobInfoHeader-title',
      '.jobsearch-JobInfoHeader-title-container h1',
      'h2.jobTitle span',
      'h2.jobTitle',
      '.icl-u-xs-mb--xs h1',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
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
      '[data-company-name] a',
      '[data-company-name]',
      '.jobsearch-InlineCompanyRating a',
      '.jobsearch-InlineCompanyRating div',
      '.css-1saizt3 a',
      '.icl-u-lg-mr--sm a',
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return '';
  },

  _getLocation() {
    const selectors = [
      '[data-testid="inlineHeader-companyLocation"]',
      '[data-testid="job-location"]',
      '.jobsearch-JobInfoHeader-subtitle > div:last-child',
      '.icl-u-xs-mt--xs .icl-IconFunctional--location + span',
      '.companyLocation'
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
      '#salaryInfoAndJobType span',
      '.salary-snippet span',
      '.jobsearch-JobMetadataHeader-item',
      '[data-testid="attribute_snippet_testid"]',
      '.metadata.salary-snippet-container .attribute_snippet'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && (text.includes('$') || text.includes('year') || text.includes('hour') || text.includes('a year'))) {
        return text;
      }
    }
    return '';
  },

  _getDescription() {
    const selectors = [
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '.jobsearch-JobComponent-description'
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
    const url = new URL(window.location.href);
    const jk = url.searchParams.get('jk');
    if (jk) {
      return `https://www.indeed.com/viewjob?jk=${jk}`;
    }
    return window.location.href.split('&')[0];
  }
};
