// JobTrail — Naukri.com Site Extractor
// Dedicated extractor for India's #1 job portal

(function () {
  'use strict';

  if (window.JobTrailSiteExtractor) return;

  window.JobTrailSiteExtractor = {
    source: 'naukri',

    /**
     * Determines if the current page is a Naukri job listing page
     */
    isJobPage() {
      const url = window.location.href.toLowerCase();
      const path = window.location.pathname.toLowerCase();

      // Job detail pages: /job-listings-*, /job/*, or jd paths
      if (/\/job-listings-|\/job\/|\/jd\//.test(path)) return true;

      // Check for job detail container in DOM
      if (document.querySelector('.jd-header-comp-name, .styles_jd-header-comp-name, [class*="jd-header"], .job-header')) return true;

      // JSON-LD fallback
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] === 'JobPosting' || (Array.isArray(data['@type']) && data['@type'].includes('JobPosting'))) {
            return true;
          }
        } catch (e) { /* ignore */ }
      }

      return false;
    },

    /**
     * Extracts job data from a Naukri job listing
     */
    extract() {
      if (!this.isJobPage()) return null;

      // Strategy 1: JSON-LD (most reliable on Naukri)
      const jsonLdData = this._extractFromJsonLd();
      if (jsonLdData) return jsonLdData;

      // Strategy 2: DOM scraping
      return this._extractFromDom();
    },

    _extractFromJsonLd() {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] !== 'JobPosting') continue;

          const title = data.title || data.name || '';
          const company = data.hiringOrganization?.name || '';
          const location = this._extractLocation(data);
          const salary = this._extractSalary(data);
          const description = this._cleanDescription(data.description);
          const employmentType = this._normalizeEmploymentType(data.employmentType);
          const datePosted = data.datePosted ? data.datePosted.split('T')[0] : '';
          const workType = this._detectWorkType(data, location);

          if (!title) continue;

          return {
            title: this._clean(title),
            company: this._clean(company) || 'Unknown Company',
            location: location || 'Not Specified',
            salary: salary || '',
            url: this._cleanUrl(data.url || window.location.href),
            source: 'Naukri',
            description: description,
            employmentType: employmentType,
            datePosted: datePosted,
            workType: workType
          };
        } catch (e) { /* ignore */ }
      }
      return null;
    },

    _extractFromDom() {
      // Naukri's DOM class names (they use CSS modules, so we match patterns)
      const titleEl = document.querySelector(
        '.jd-header-title, [class*="jd-header-title"], h1[class*="title"], .job-title'
      );
      const title = titleEl ? this._clean(titleEl.textContent) : '';
      if (!title) return null;

      const companyEl = document.querySelector(
        '.jd-header-comp-name a, [class*="jd-header-comp-name"] a, .company-name a, [class*="companyName"]'
      );
      const company = companyEl ? this._clean(companyEl.textContent) : '';

      const locationEl = document.querySelector(
        '.jd-header-comp-loc [class*="location"], [class*="loc-container"], .location, [class*="location"]'
      );
      const location = locationEl ? this._clean(locationEl.textContent) : '';

      const salaryEl = document.querySelector(
        '.salary [class*="salary"], [class*="sal-wrap"], .salary, [class*="salary"]'
      );
      const salary = salaryEl ? this._clean(salaryEl.textContent) : '';

      const expEl = document.querySelector(
        '[class*="exp-wrap"], [class*="experience"], .experience'
      );
      const experience = expEl ? this._clean(expEl.textContent) : '';

      const descEl = document.querySelector(
        '.dang-inner-html, [class*="job-desc"], .job-description, [class*="description"]'
      );
      const description = descEl ? this._clean(descEl.textContent).substring(0, 300) : '';

      return {
        title: title,
        company: company || 'Unknown Company',
        location: location || 'Not Specified',
        salary: salary || '',
        url: this._cleanUrl(window.location.href),
        source: 'Naukri',
        description: description,
        employmentType: '',
        datePosted: '',
        workType: this._detectWorkTypeFromText(location)
      };
    },

    _extractLocation(data) {
      const loc = data.jobLocation;
      if (!loc) return '';

      if (Array.isArray(loc)) {
        return loc.map(l => {
          const addr = l.address || l;
          if (typeof addr === 'string') return addr;
          return [addr.addressLocality, addr.addressRegion, addr.addressCountry?.name || addr.addressCountry]
            .filter(Boolean).join(', ');
        }).filter(Boolean).join('; ');
      }

      if (typeof loc === 'string') return loc;
      const addr = loc.address || loc;
      if (typeof addr === 'string') return addr;
      return [addr.addressLocality, addr.addressRegion, addr.addressCountry?.name || addr.addressCountry]
        .filter(Boolean).join(', ');
    },

    _extractSalary(data) {
      const sal = data.baseSalary || data.estimatedSalary;
      if (!sal) return '';
      if (typeof sal === 'string') return this._clean(sal);
      if (typeof sal === 'object') {
        const val = sal.value || sal;
        const currency = sal.currency || val.currency || '₹';
        const unit = val.unitText ? ` / ${val.unitText.toLowerCase()}` : '';
        if (val.minValue && val.maxValue) {
          return `${currency}${Number(val.minValue).toLocaleString('en-IN')} - ${currency}${Number(val.maxValue).toLocaleString('en-IN')}${unit}`;
        }
        if (val.value) return `${currency}${Number(val.value).toLocaleString('en-IN')}${unit}`;
      }
      return '';
    },

    _normalizeEmploymentType(raw) {
      if (!raw) return '';
      const types = Array.isArray(raw) ? raw : [raw];
      const map = {
        'FULL_TIME': 'Full-time', 'FULLTIME': 'Full-time',
        'PART_TIME': 'Part-time', 'PARTTIME': 'Part-time',
        'CONTRACT': 'Contract', 'TEMPORARY': 'Temporary',
        'INTERN': 'Internship', 'INTERNSHIP': 'Internship',
        'FREELANCE': 'Freelance'
      };
      return types.map(t => map[String(t).toUpperCase().replace(/[^A-Z_]/g, '')] || String(t)).join(', ');
    },

    _detectWorkType(data, locationStr) {
      if (data.jobLocationType === 'TELECOMMUTE') return 'Remote';
      return this._detectWorkTypeFromText(locationStr);
    },

    _detectWorkTypeFromText(text) {
      if (!text) return '';
      const lower = text.toLowerCase();
      if (/\bhybrid\b/.test(lower)) return 'Hybrid';
      if (/\bremote\b/.test(lower)) return 'Remote';
      if (/\bon[- ]?site\b|\bin[- ]?office\b/.test(lower)) return 'On-site';
      return '';
    },

    _clean(str) {
      if (!str) return '';
      return str
        .replace(/\b\d+\s*[-–]\s*\d+\s*(?:yrs?|years?)\b/gi, '') // Strip experience tags like "1-3 Yrs"
        .replace(/\s+/g, ' ')
        .trim();
    },

    _cleanDescription(html) {
      if (!html) return '';
      return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
    },

    _cleanUrl(url) {
      if (!url) url = window.location.href;
      try {
        const u = new URL(url);
        // Extract 10-13 digit Naukri Job ID from path or query params
        const match = u.pathname.match(/job-listings-.*?-(\d{10,13})(?:[?#]|$)/i) ||
                      u.pathname.match(/-(\d{10,13})(?:[?#]|$)/) ||
                      u.pathname.match(/(\d{10,13})/) ||
                      u.search.match(/[?&]jobId=(\d{10,13})/i);
        if (match) {
          return `https://www.naukri.com/job-listings-${match[1]}`;
        }
        u.hash = '';
        u.search = '';
        return u.href.replace(/\/$/, '');
      } catch {
        return url.split('?')[0].split('#')[0].replace(/\/$/, '');
      }
    }
  };

  console.log('[JobTrail] Naukri extractor initialized');
})();
