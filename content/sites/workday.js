// JobTrail — Workday ATS Extractor
// Extracts job details from Workday job pages (*.myworkdayjobs.com)

window.JobTrailSiteExtractor = {
  source: 'workday',

  isJobPage() {
    const hostname = window.location.hostname;
    return hostname.includes('myworkdayjobs.com') &&
      (window.location.pathname.includes('/job/') ||
        window.location.pathname.includes('/en-US/job/') ||
        document.querySelector('[data-automation-id="jobTitle"]') !== null);
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
      console.warn('[JobTrail] Workday extraction error:', err);
      return null;
    }
  },

  _getTitle() {
    const selectors = [
      '[data-automation-id="jobTitle"]',
      'h2[data-automation-id="jobTitle"]',
      '.css-lfn7xl h2',
      'h1.css-1hgti2p',
      'h2'
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
    // Workday company often in the subdomain or in the breadcrumb
    const selectors = [
      '[data-automation-id="companyName"]',
      '.css-j1386c',
      '.GWTJobBoardBreadcrumb a'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    // Fallback: parse subdomain
    const subdomain = window.location.hostname.split('.')[0];
    if (subdomain && subdomain !== 'www') {
      return subdomain.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return '';
  },

  _getLocation() {
    const selectors = [
      '[data-automation-id="locations"]',
      '[data-automation-id="jobPostingLocation"]',
      '.css-129m7dg'
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
      '[data-automation-id="salary"]',
      '[data-automation-id="payRange"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && text.includes('$')) {
        return text;
      }
    }
    return '';
  },

  _getDescription() {
    const selectors = [
      '[data-automation-id="jobPostingDescription"]',
      '.css-pob9bl',
      '#mainContent'
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
