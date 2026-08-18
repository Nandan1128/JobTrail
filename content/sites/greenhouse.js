// JobTrail — Greenhouse ATS Extractor
// Extracts job details from Greenhouse job board pages (boards.greenhouse.io)

window.JobTrailSiteExtractor = {
  source: 'greenhouse',

  isJobPage() {
    const hostname = window.location.hostname;
    const path = window.location.pathname;
    return (hostname.includes('greenhouse.io')) &&
      (path.match(/\/jobs\/\d+/) || document.querySelector('#app_body .app-title') !== null);
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
      console.warn('[JobTrail] Greenhouse extraction error:', err);
      return null;
    }
  },

  _getTitle() {
    const selectors = [
      '.app-title',
      '#header .company-name + h1',
      'h1.heading',
      '.job__title',
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
    // Greenhouse boards often have company name in the page title or header
    const selectors = [
      '.company-name',
      '#header .company-name',
      '.logo-container img'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
      // Try alt text on logo
      if (el && el.alt) {
        return el.alt.replace(' logo', '').trim();
      }
    }
    // Fallback: extract from page title
    const pageTitle = document.title;
    if (pageTitle.includes(' at ')) {
      return pageTitle.split(' at ')[1]?.split(' - ')[0]?.trim() || '';
    }
    return '';
  },

  _getLocation() {
    const selectors = [
      '.location',
      '.body--metadata .location',
      '.job__location'
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
    // Greenhouse rarely shows salary in a structured field,
    // but sometimes it's in the description
    return '';
  },

  _getDescription() {
    const selectors = [
      '#content',
      '.job__description',
      '.content .body'
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
    return window.location.href.split('?')[0].split('#')[0];
  }
};
