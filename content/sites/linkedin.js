// JobTrail — LinkedIn Job Extractor
// Extracts job details from LinkedIn job listing pages
// Supports logged-in two-pane search, direct job view, collections, and public views

(function () {
  'use strict';

  const GENERIC_TITLES = new Set([
    'search',
    'jobs',
    'job search',
    'search results',
    'notifications',
    'messaging',
    'network',
    'my network',
    'home',
    'linkedin',
    'feed'
  ]);

  window.JobTrailSiteExtractor = {
    source: 'linkedin',

    /**
     * Checks if the current page is a LinkedIn job listing
     */
    isJobPage() {
      const path = window.location.pathname.toLowerCase();
      const url = window.location.href;

      // 1. URL pattern match
      if (path.includes('/jobs/view/') ||
          path.includes('/jobs/search') ||
          path.includes('/jobs/collections') ||
          path.includes('/jobs/') ||
          url.includes('currentJobId=')) {
        return true;
      }

      // 2. Visible job container check
      if (this._getJobDetailContainer()) {
        return true;
      }

      // 3. Document title check
      if (this._parseDocumentTitle()) {
        return true;
      }

      return false;
    },

    /**
     * Main extraction routine
     */
    extract() {
      if (!this.isJobPage()) return null;

      try {
        // Strategy 1: Right-pane / main job detail view
        let title = this._getTitle();
        let company = this._getCompany();
        let location = this._getLocation();
        let salary = this._getSalary();
        let description = this._getDescription();

        // Strategy 2: Left-pane active search card (if right pane hasn't loaded yet)
        if (!title || !company) {
          const cardData = this._getFromActiveListCard();
          if (cardData) {
            title = title || cardData.title;
            company = company || cardData.company;
            location = location || cardData.location;
            salary = salary || cardData.salary;
          }
        }

        // Strategy 3: Parse document.title (e.g. "Flutter Developer | Levrez Technologies | LinkedIn")
        if (!title || !company) {
          const titleMeta = this._parseDocumentTitle();
          if (titleMeta) {
            title = title || titleMeta.title;
            company = company || titleMeta.company;
            location = location || titleMeta.location;
          }
        }

        // Strategy 4: JSON-LD on LinkedIn
        if (!title || !company) {
          const jsonLd = this._getJsonLdData();
          if (jsonLd) {
            title = title || jsonLd.title;
            company = company || jsonLd.company;
            location = location || jsonLd.location;
            salary = salary || jsonLd.salary;
            description = description || jsonLd.description;
          }
        }

        // Validate title against generic names
        if (this._isGenericTitle(title)) {
          // If title was generic, retry from document.title or active card
          const titleMeta = this._parseDocumentTitle();
          if (titleMeta && !this._isGenericTitle(titleMeta.title)) {
            title = titleMeta.title;
            company = company || titleMeta.company;
          } else {
            const cardData = this._getFromActiveListCard();
            if (cardData && !this._isGenericTitle(cardData.title)) {
              title = cardData.title;
              company = company || cardData.company;
            }
          }
        }

        // Must have at least a non-generic title
        if (!title || this._isGenericTitle(title)) {
          return null;
        }

        const jobUrl = this._cleanUrl();

        console.log('[JobTrail] LinkedIn extracted:', { title, company, location, url: jobUrl });

        return {
          title: this._cleanText(title),
          company: this._cleanText(company) || 'Unknown Company',
          location: this._cleanText(location) || 'Not Specified',
          salary: this._cleanText(salary) || '',
          url: jobUrl,
          source: this.source,
          description: this._cleanText(description)
        };
      } catch (err) {
        console.warn('[JobTrail] LinkedIn extraction error:', err);
        return null;
      }
    },

    // ==========================================
    // DOM Selectors & Strategies
    // ==========================================

    _getJobDetailContainer() {
      const selectors = [
        '.job-details-jobs-unified-top-card__container--two-pane',
        '.job-details-jobs-unified-top-card',
        '.jobs-unified-top-card',
        '.jobs-details__main-content',
        '.jobs-search__job-details--container',
        '.jobs-search__job-details',
        '.two-pane-serp-page__detail-view',
        'section.top-card-layout',
        '.topcard',
        '.job-view-layout'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    },

    _getTitle() {
      const container = this._getJobDetailContainer() || document;
      const selectors = [
        // Logged-in two-pane job view (Current 2024-2026 DOM)
        'h1.job-details-jobs-unified-top-card__job-title',
        '.job-details-jobs-unified-top-card__job-title h1',
        '.job-details-jobs-unified-top-card__job-title a',
        '.job-details-jobs-unified-top-card__job-title',
        'h1 a[href*="/jobs/view/"]',
        'h1.t-24.t-bold',
        // Older variants
        '.jobs-unified-top-card__job-title a',
        '.jobs-unified-top-card__job-title',
        '.jobs-details-top-card__job-title',
        // Public / direct view
        'h1.top-card-layout__title',
        '.top-card-layout__title',
        'h1.topcard__title',
        '.two-pane-serp-page__detail-view h2'
      ];

      for (const sel of selectors) {
        const el = container.querySelector(sel);
        if (el) {
          const text = this._cleanText(el.textContent);
          if (text && !this._isGenericTitle(text)) {
            return text;
          }
        }
      }
      return '';
    },

    _getCompany() {
      const container = this._getJobDetailContainer() || document;
      const selectors = [
        // Logged-in two-pane top card
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.job-details-jobs-unified-top-card__primary-description-without-tagline a',
        '.job-details-jobs-unified-top-card__primary-description a',
        '.job-details-jobs-unified-top-card__subtitle a',
        'a[href*="/company/"]',
        // Older variants
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__subtitle-primary-grouping a',
        '.jobs-details-top-card__company-url',
        // Public / direct view
        '.top-card-layout__entity-info a[data-tracking-control-name="public_jobs_topcard-org-name"]',
        'a.topcard__org-name-link',
        '.topcard__org-name-link',
        '.topcard__flavor a'
      ];

      for (const sel of selectors) {
        const el = container.querySelector(sel);
        if (el) {
          const text = this._cleanText(el.textContent);
          if (text && text.length < 100 && !/follow|apply|save|share/i.test(text)) {
            return text;
          }
        }
      }
      return '';
    },

    _getLocation() {
      const container = this._getJobDetailContainer() || document;
      const selectors = [
        '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
        '.job-details-jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__bullet',
        '.jobs-details-top-card__bullet',
        '.topcard__flavor--bullet',
        'span.topcard__flavor--bullet'
      ];

      for (const sel of selectors) {
        const el = container.querySelector(sel);
        if (el) {
          const text = this._cleanText(el.textContent);
          if (text && text.length < 100 && !text.includes('ago') && !text.includes('applicant')) {
            return text;
          }
        }
      }
      return '';
    },

    _getSalary() {
      const container = this._getJobDetailContainer() || document;
      const selectors = [
        '.salary-main-rail__data-body',
        '.job-details-jobs-unified-top-card__job-insight span',
        '.compensation__salary',
        '.jobs-unified-top-card__job-insight',
        '#SALARY .jobs-unified-description__salary'
      ];

      for (const sel of selectors) {
        const el = container.querySelector(sel);
        const text = el?.textContent?.trim();
        if (text && (text.includes('$') || text.includes('₹') || text.includes('€') || text.includes('£') ||
            text.includes('yr') || text.includes('hr') || text.includes('salary') || text.includes('LPA') || text.includes('/yr'))) {
          return this._cleanText(text);
        }
      }
      return '';
    },

    _getDescription() {
      const selectors = [
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-description-content__text',
        '#job-details',
        '.show-more-less-html__markup',
        '.description__text section'
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = this._cleanText(el.textContent);
          if (text && text.length > 20) {
            return text.substring(0, 300);
          }
        }
      }
      return '';
    },

    // ==========================================
    // Left-Pane Active Card Strategy
    // ==========================================

    _getFromActiveListCard() {
      const url = new URL(window.location.href);
      const currentJobId = url.searchParams.get('currentJobId');

      let card = null;
      if (currentJobId) {
        card = document.querySelector(`[data-job-id="${currentJobId}"], [data-occludable-job-id="${currentJobId}"]`);
      }

      if (!card) {
        card = document.querySelector('li.jobs-search-results-list__list-item--active, .job-card-container--clickable.job-card-list--is-active, .job-card-container--active');
      }

      if (!card) return null;

      const titleEl = card.querySelector('.job-card-list__title, a.job-card-list__title--link, .artdeco-entity-lockup__title');
      const companyEl = card.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle');
      const locationEl = card.querySelector('.job-card-container__metadata-item');

      const title = titleEl ? this._cleanText(titleEl.textContent) : '';
      const company = companyEl ? this._cleanText(companyEl.textContent) : '';
      const location = locationEl ? this._cleanText(locationEl.textContent) : '';

      if (title && !this._isGenericTitle(title)) {
        return { title, company, location, salary: '' };
      }

      return null;
    },

    // ==========================================
    // Document Title Parser Strategy
    // ==========================================

    _parseDocumentTitle() {
      const docTitle = document.title;
      if (!docTitle || !docTitle.includes('LinkedIn')) return null;

      // Format 1: "Flutter Developer | Levrez Technologies | LinkedIn"
      const pipeParts = docTitle.split('|').map(s => s.trim());
      if (pipeParts.length >= 3 && !this._isGenericTitle(pipeParts[0])) {
        return {
          title: pipeParts[0],
          company: pipeParts[1],
          location: ''
        };
      }

      // Format 2: "Company hiring Title in Location | LinkedIn"
      const hiringMatch = pipeParts[0]?.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$/i);
      if (hiringMatch && !this._isGenericTitle(hiringMatch[2])) {
        return {
          company: hiringMatch[1].trim(),
          title: hiringMatch[2].trim(),
          location: hiringMatch[3]?.trim() || ''
        };
      }

      // Format 3: "Title at Company | LinkedIn"
      const atMatch = pipeParts[0]?.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atMatch && !this._isGenericTitle(atMatch[1])) {
        return {
          title: atMatch[1].trim(),
          company: atMatch[2].trim(),
          location: ''
        };
      }

      return null;
    },

    // ==========================================
    // Schema.org JSON-LD on LinkedIn
    // ==========================================

    _getJsonLdData() {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent);
          const job = parsed['@type'] === 'JobPosting' ? parsed : null;
          if (job && job.title) {
            return {
              title: job.title,
              company: job.hiringOrganization?.name || '',
              location: job.jobLocation?.address?.addressLocality || '',
              salary: job.baseSalary?.value?.value ? `${job.baseSalary.currency || '$'}${job.baseSalary.value.value}` : '',
              description: job.description || ''
            };
          }
        } catch (e) {}
      }
      return null;
    },

    // ==========================================
    // Helpers & Sanitizers
    // ==========================================

    _isGenericTitle(title) {
      if (!title) return true;
      const lower = title.trim().toLowerCase();
      if (lower.length <= 2) return true;
      if (GENERIC_TITLES.has(lower)) return true;
      if (/^\d+\s+results?$/i.test(lower)) return true;
      if (/^search(\s+results)?$/i.test(lower)) return true;
      return false;
    },

    _cleanText(str) {
      if (!str) return '';
      return str.replace(/\s+/g, ' ').trim();
    },

    _cleanUrl() {
      const url = new URL(window.location.href);
      const match = url.pathname.match(/\/jobs\/view\/(\d+)/);
      if (match) {
        return `https://www.linkedin.com/jobs/view/${match[1]}/`;
      }
      const currentJobId = url.searchParams.get('currentJobId');
      if (currentJobId) {
        return `https://www.linkedin.com/jobs/view/${currentJobId}/`;
      }
      return window.location.href.split('?')[0];
    }
  };

  console.log('[JobTrail] LinkedIn extractor loaded on:', window.location.href);
})();
