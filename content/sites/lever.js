// JobTrail — Lever ATS Extractor
// Extracts job details from Lever job board pages (jobs.lever.co)

window.JobTrailSiteExtractor = {
  source: 'lever',

  isJobPage() {
    const hostname = window.location.hostname;
    const path = window.location.pathname;
    // Lever URLs look like: jobs.lever.co/company/job-id-uuid
    return hostname === 'jobs.lever.co' &&
      path.split('/').filter(Boolean).length >= 2;
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
      console.warn('[JobTrail] Lever extraction error:', err);
      return null;
    }
  },

  _getTitle() {
    const selectors = [
      '.posting-headline h2',
      '.section-header.posting-header h2',
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
    // Lever shows company name in the header/logo area
    const selectors = [
      '.main-header-logo a img',
      '.posting-header .company-name',
      'title'
    ];
    // Try the image alt text
    const logoImg = document.querySelector('.main-header-logo a img');
    if (logoImg && logoImg.alt) {
      return logoImg.alt.replace(' logo', '').replace('Logo', '').trim();
    }
    // Fallback: extract from URL path
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return '';
  },

  _getLocation() {
    const selectors = [
      '.posting-categories .sort-by-time .location',
      '.posting-categories .location',
      '.posting-headline .location',
      '.workplaceTypes'
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
    // Lever occasionally shows salary in a custom field
    const commitmentEl = document.querySelector('.posting-categories .commitment');
    if (commitmentEl) {
      const text = commitmentEl.textContent.trim();
      if (text.includes('$')) return text;
    }
    return '';
  },

  _getDescription() {
    const selectors = [
      '.posting-page .content .section-wrapper',
      '.posting-page .section.page-centered',
      '[data-qa="job-description"]'
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
