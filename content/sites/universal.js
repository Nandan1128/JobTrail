// JobTrail — Universal Job Extractor
// Extracts job details from ANY website using Schema.org JSON-LD (JobPosting),
// HTML5 Microdata, OpenGraph metadata, and high-precision semantic DOM heuristics.

(function () {
  'use strict';

  window.JobTrailUniversalExtractor = {
    source: 'universal',

    /**
     * Determines if the current page is a job listing page
     */
    isJobPage() {
      // 1. JSON-LD Check (Instant, 100% reliable)
      if (this._hasJsonLdJob()) return true;

      // 2. Microdata Check
      if (this._hasMicrodataJob()) return true;

      // 3. Heuristic Check
      return this._isJobPageHeuristic();
    },

    /**
     * Extracts job data using the best available strategy
     */
    extract() {
      if (!this.isJobPage()) return null;

      try {
        // Strategy 1: Schema.org JSON-LD (Highest accuracy, covers 80%+ of career boards)
        const jsonLdData = this._extractFromJsonLd();
        if (jsonLdData) return jsonLdData;

        // Strategy 2: HTML5 Microdata (Schema.org in DOM tags)
        const microdata = this._extractFromMicrodata();
        if (microdata) return microdata;

        // Strategy 3: Semantic Heuristics & Meta Tags
        const heuristicData = this._extractFromHeuristics();
        if (heuristicData) return heuristicData;

        return null;
      } catch (err) {
        console.warn('[JobTrail] Universal extraction error:', err);
        return null;
      }
    },

    // ==========================================
    // Strategy 1: Schema.org JSON-LD Parser
    // ==========================================

    _hasJsonLdJob() {
      return this._getJsonLdJobObject() !== null;
    },

    _getJsonLdJobObject() {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const content = script.textContent.trim();
          if (!content) continue;
          const parsed = JSON.parse(content);
          const job = this._findJobInJson(parsed);
          if (job) return job;
        } catch (e) {
          // Ignore JSON parse errors in malformed script tags
        }
      }
      return null;
    },

    _findJobInJson(obj) {
      if (!obj) return null;

      if (Array.isArray(obj)) {
        for (const item of obj) {
          const found = this._findJobInJson(item);
          if (found) return found;
        }
        return null;
      }

      if (typeof obj === 'object') {
        const type = obj['@type'];
        if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) {
          return obj;
        }
        if (Array.isArray(obj['@graph'])) {
          for (const item of obj['@graph']) {
            const found = this._findJobInJson(item);
            if (found) return found;
          }
        }
      }
      return null;
    },

    _extractFromJsonLd() {
      const job = this._getJsonLdJobObject();
      if (!job) return null;

      const title = this._cleanText(job.title || job.name || '');
      const company = this._extractCompanyFromJsonLd(job.hiringOrganization) || this._getDomainBrand();
      const location = this._extractLocationFromJsonLd(job.jobLocation, job.applicantLocationRequirements, job.jobLocationType);
      const salary = this._extractSalaryFromJsonLd(job.baseSalary || job.estimatedSalary || job.salary);
      const description = this._cleanDescription(job.description);
      const platform = this._detectPlatformName();
      const employmentType = this._normalizeEmploymentType(job.employmentType);
      const datePosted = this._normalizeDate(job.datePosted);
      const workType = this._detectWorkType(job.jobLocationType, location, job.applicantLocationRequirements);

      if (!title) return null;

      return {
        title: title,
        company: company || 'Unknown Company',
        location: location || 'Not Specified',
        salary: salary || '',
        url: this._cleanUrl(job.url || window.location.href),
        source: platform ? `${platform} (auto)` : 'auto-detect',
        description: description,
        employmentType: employmentType,
        datePosted: datePosted,
        workType: workType
      };
    },

    _extractCompanyFromJsonLd(org) {
      if (!org) return '';
      if (typeof org === 'string') return this._cleanText(org);
      if (typeof org === 'object') {
        return this._cleanText(org.name || org.legalName || '');
      }
      return '';
    },

    _extractLocationFromJsonLd(loc, requirements, locationType) {
      const parts = [];

      // Check for remote / telecommute
      if (locationType === 'TELECOMMUTE' || locationType === 'remote' ||
          (typeof loc === 'string' && /remote/i.test(loc))) {
        parts.push('Remote');
      }

      if (Array.isArray(loc)) {
        const subLocs = loc.map(l => this._formatSingleAddress(l)).filter(Boolean);
        if (subLocs.length) parts.push(subLocs.join('; '));
      } else if (loc && typeof loc === 'object') {
        const formatted = this._formatSingleAddress(loc);
        if (formatted) parts.push(formatted);
      } else if (typeof loc === 'string') {
        parts.push(this._cleanText(loc));
      }

      if (parts.length === 0 && requirements) {
        if (typeof requirements === 'string') parts.push(requirements);
        else if (requirements.name) parts.push(requirements.name);
      }

      return parts.filter(Boolean).join(', ') || '';
    },

    _formatSingleAddress(locObj) {
      if (!locObj) return '';
      if (typeof locObj === 'string') return this._cleanText(locObj);

      const addr = locObj.address || locObj;
      if (typeof addr === 'string') return this._cleanText(addr);

      const pieces = [
        addr.addressLocality,
        addr.addressRegion,
        addr.addressCountry?.name || addr.addressCountry
      ].filter(Boolean);

      return pieces.join(', ');
    },

    _extractSalaryFromJsonLd(sal) {
      if (!sal) return '';
      if (typeof sal === 'string') return this._cleanText(sal);

      if (typeof sal === 'object') {
        const val = sal.value || sal;
        const currency = sal.currency || val.currency || '$';
        const unit = val.unitText ? ` / ${val.unitText.toLowerCase().replace('unit_', '')}` : '';

        if (typeof val === 'number') {
          return `${currency}${val.toLocaleString()}${unit}`;
        }
        if (val.minValue && val.maxValue) {
          return `${currency}${Number(val.minValue).toLocaleString()} - ${currency}${Number(val.maxValue).toLocaleString()}${unit}`;
        }
        if (val.value) {
          return `${currency}${Number(val.value).toLocaleString()}${unit}`;
        }
        if (val.minValue) {
          return `From ${currency}${Number(val.minValue).toLocaleString()}${unit}`;
        }
      }
      return '';
    },

    // ==========================================
    // Strategy 2: HTML5 Microdata Parser
    // ==========================================

    _hasMicrodataJob() {
      return document.querySelector('[itemtype*="JobPosting"]') !== null;
    },

    _extractFromMicrodata() {
      const root = document.querySelector('[itemtype*="JobPosting"]');
      if (!root) return null;

      const titleEl = root.querySelector('[itemprop="title"], [itemprop="name"]');
      const title = titleEl ? (titleEl.getAttribute('content') || this._cleanText(titleEl.textContent)) : '';
      if (!title) return null;

      const orgEl = root.querySelector('[itemprop="hiringOrganization"] [itemprop="name"], [itemprop="hiringOrganization"]');
      const company = orgEl ? (orgEl.getAttribute('content') || this._cleanText(orgEl.textContent)) : this._getDomainBrand();

      const locEl = root.querySelector('[itemprop="jobLocation"] [itemprop="streetAddress"], [itemprop="streetAddress"], [itemprop="jobLocation"], [itemprop="address"]');
      const location = locEl ? (locEl.getAttribute('content') || this._cleanText(locEl.textContent)) : '';

      const salEl = root.querySelector('[itemprop="baseSalary"], [itemprop="salary"]');
      const salary = salEl ? (salEl.getAttribute('content') || this._cleanText(salEl.textContent)) : '';

      return {
        title: title,
        company: company || 'Unknown Company',
        location: location || 'Not Specified',
        salary: salary || '',
        url: this._cleanUrl(window.location.href),
        source: this._detectPlatformName() ? `${this._detectPlatformName()} (auto)` : 'auto-detect',
        description: '',
        employmentType: '',
        datePosted: '',
        workType: this._detectWorkTypeFromText(location)
      };
    },

    // ==========================================
    // Strategy 3: Semantic Heuristics & Meta Tags
    // ==========================================

    _isJobPageHeuristic() {
      const url = window.location.href.toLowerCase();
      const path = window.location.pathname.toLowerCase();

      // Strong URL patterns
      const hasJobUrlPattern = /\/(jobs?|careers?|positions?|openings?|vacanc(y|ies)|postings?|opps?)\/[a-z0-9_-]+/i.test(path) ||
                               /[?&](job_id|gh_jid|reqid|posting_id)=/i.test(url);

      // Look for prominent "Apply" button or action
      const hasApplyButton = this._findApplyButton() !== null;

      // Look for job headers / headings
      const h1 = document.querySelector('h1');
      const hasH1 = h1 && h1.textContent.trim().length > 3 && h1.textContent.trim().length < 120;

      // Check if page contains typical job section keywords
      const bodyText = document.body ? document.body.innerText.substring(0, 5000).toLowerCase() : '';
      const jobKeywordCount = [
        'job description',
        'about the role',
        'responsibilities',
        'qualifications',
        'requirements',
        'what you\'ll do',
        'apply for this job',
        'apply now',
        'equal opportunity employer',
        'benefits & perks'
      ].filter(kw => bodyText.includes(kw)).length;

      // Safe threshold to avoid false positives on blogs/articles
      if (hasJobUrlPattern && hasApplyButton) return true;
      if (hasJobUrlPattern && hasH1 && jobKeywordCount >= 2) return true;
      if (hasApplyButton && jobKeywordCount >= 3 && hasH1) return true;

      return false;
    },

    _extractFromHeuristics() {
      const title = this._getTitleFromDom();
      if (!title) return null;

      const company = this._getCompanyFromDom();
      const location = this._getLocationFromDom();
      const salary = this._getSalaryFromDom();
      const description = this._getDescriptionFromDom();

      return {
        title: title,
        company: company || this._getDomainBrand() || 'Unknown Company',
        location: location || 'Not Specified',
        salary: salary || '',
        url: this._cleanUrl(window.location.href),
        source: 'auto-detect',
        description: description,
        employmentType: '',
        datePosted: '',
        workType: this._detectWorkTypeFromText(location)
      };
    },

    _getTitleFromDom() {
      // 1. Try OpenGraph title (e.g. "Senior React Engineer at Acme")
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      if (ogTitle && ogTitle.length < 100) {
        // Strip out " - Careers", " | Company", " at Company"
        const cleanOg = ogTitle.split(/ - | \| | at /i)[0].trim();
        if (cleanOg.length > 3) return cleanOg;
      }

      // 2. Try primary H1
      const h1s = Array.from(document.querySelectorAll('h1'));
      for (const h1 of h1s) {
        const text = this._cleanText(h1.textContent);
        if (text.length > 3 && text.length < 100 && !/careers|jobs|welcome|join us/i.test(text)) {
          return text;
        }
      }

      // 3. Fallback: document.title
      if (document.title) {
        const cleaned = document.title.split(/ - | \| | · | at /i)[0].trim();
        if (cleaned.length > 3 && cleaned.length < 100) return cleaned;
      }

      return '';
    },

    _getCompanyFromDom() {
      // 1. OpenGraph site_name
      const ogSite = document.querySelector('meta[property="og:site_name"]')?.content;
      if (ogSite && ogSite.trim()) return this._cleanText(ogSite);

      // 2. Look for common company selectors
      const selectors = [
        '[class*="company-name"]',
        '[class*="companyName"]',
        '[class*="employer-name"]',
        '[data-testid*="company"]',
        '[class*="organization"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim() && el.textContent.trim().length < 60) {
          return this._cleanText(el.textContent);
        }
      }

      // 3. Extract from document title
      if (document.title.includes(' at ')) {
        return document.title.split(' at ')[1]?.split(/ - | \| /)[0]?.trim() || '';
      }

      // 4. Fallback to domain name
      return this._getDomainBrand();
    },

    _getLocationFromDom() {
      const selectors = [
        '[class*="location"]',
        '[class*="job-location"]',
        '[data-testid*="location"]',
        '[class*="workplace"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim() && el.textContent.trim().length < 80) {
          const text = this._cleanText(el.textContent);
          // Verify it doesn't contain unrelated paragraphs
          if (!text.includes('\n') && text.length > 2) {
            return text;
          }
        }
      }
      return '';
    },

    _getSalaryFromDom() {
      // Look for salary patterns in metadata containers or headings
      const regex = /(?:\$|€|£|₹)\s?[\d,]+(?:\s*-\s*(?:\$|€|£|₹)?\s*[\d,]+)?\s*(?:k|K|(?:\/|\s*per\s*)(?:yr|year|mo|month|hr|hour))?/i;
      
      const salarySelectors = [
        '[class*="salary"]',
        '[class*="compensation"]',
        '[class*="pay-range"]',
        '[data-testid*="salary"]'
      ];
      for (const sel of salarySelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          const match = el.textContent.match(regex);
          if (match) return match[0].trim();
        }
      }

      // Fallback: search early page text
      const metaArea = document.querySelector('header, main, [class*="header"], [class*="meta"]');
      if (metaArea) {
        const match = metaArea.textContent.match(regex);
        if (match) return match[0].trim();
      }

      return '';
    },

    _getDescriptionFromDom() {
      const descEl = document.querySelector('main, article, [class*="description"], [class*="job-details"]');
      if (descEl) {
        return this._cleanText(descEl.textContent).substring(0, 300);
      }
      return '';
    },

    _findApplyButton() {
      const candidates = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"], [role="menuitem"]'));
      return candidates.find(el => {
        const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
        return /^(easy\s+)?apply(\s+now)?(\s*[»›>])?$|^apply\s+(for|with|on|to)|^start\s+applying|^submit\s+application|^apply$/i.test(text);
      }) || null;
    },

    // ==========================================
    // Utility Helpers
    // ==========================================

    _getDomainBrand() {
      const host = window.location.hostname.replace(/^www\./, '');
      const parts = host.split('.');
      if (parts.length >= 2) {
        const name = parts[0];
        // Capitalize domain name
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
      return host;
    },

    _detectPlatformName() {
      const host = window.location.hostname.toLowerCase();
      if (host.includes('ashbyhq.com')) return 'Ashby';
      if (host.includes('smartrecruiters.com')) return 'SmartRecruiters';
      if (host.includes('workable.com')) return 'Workable';
      if (host.includes('bamboohr.com')) return 'BambooHR';
      if (host.includes('jobvite.com')) return 'Jobvite';
      if (host.includes('ziprecruiter.com')) return 'ZipRecruiter';
      if (host.includes('rippling.com')) return 'Rippling';
      if (host.includes('pinpointhq.com')) return 'Pinpoint';
      if (host.includes('breezy.hr')) return 'Breezy HR';
      if (host.includes('recruitee.com')) return 'Recruitee';
      if (host.includes('lever.co')) return 'Lever';
      if (host.includes('greenhouse.io')) return 'Greenhouse';
      return '';
    },

    _cleanText(str) {
      if (!str) return '';
      return str.replace(/\s+/g, ' ').trim();
    },

    _cleanDescription(htmlOrText) {
      if (!htmlOrText) return '';
      return htmlOrText
        .replace(/<[^>]*>?/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 300);
    },

    _cleanUrl(url) {
      if (!url) return window.location.href;
      return url.split('?')[0].split('#')[0];
    },

    /**
     * Normalize employmentType from JSON-LD
     * Handles: 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERN', arrays, etc.
     */
    _normalizeEmploymentType(raw) {
      if (!raw) return '';
      const types = Array.isArray(raw) ? raw : [raw];
      const labels = types.map(t => {
        const normalized = String(t).toUpperCase().replace(/[^A-Z_]/g, '');
        const map = {
          'FULL_TIME': 'Full-time', 'FULLTIME': 'Full-time',
          'PART_TIME': 'Part-time', 'PARTTIME': 'Part-time',
          'CONTRACT': 'Contract', 'CONTRACTOR': 'Contract',
          'TEMPORARY': 'Temporary', 'TEMP': 'Temporary',
          'INTERN': 'Internship', 'INTERNSHIP': 'Internship',
          'VOLUNTEER': 'Volunteer', 'PER_DIEM': 'Per Diem',
          'FREELANCE': 'Freelance', 'OTHER': 'Other'
        };
        return map[normalized] || this._cleanText(String(t));
      }).filter(Boolean);
      return labels.join(', ');
    },

    /**
     * Normalize an ISO date string to a human-readable format
     */
    _normalizeDate(raw) {
      if (!raw) return '';
      try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return this._cleanText(String(raw));
        return d.toISOString().split('T')[0]; // YYYY-MM-DD
      } catch {
        return '';
      }
    },

    /**
     * Detect work type (Remote / Hybrid / On-site) from JSON-LD fields
     */
    _detectWorkType(jobLocationType, locationStr, requirements) {
      // Check jobLocationType field
      if (jobLocationType) {
        const lt = String(jobLocationType).toUpperCase();
        if (lt === 'TELECOMMUTE' || lt === 'REMOTE') return 'Remote';
      }

      return this._detectWorkTypeFromText(locationStr);
    },

    /**
     * Detect work type from text content (location string or page body)
     */
    _detectWorkTypeFromText(text) {
      if (!text) return '';
      const lower = text.toLowerCase();
      if (/\bhybrid\b/i.test(lower)) return 'Hybrid';
      if (/\bremote\b/i.test(lower)) return 'Remote';
      if (/\bon[- ]?site\b|\bin[- ]?office\b|\bin[- ]?person\b/i.test(lower)) return 'On-site';
      return '';
    }
  };

  console.log('[JobTrail] Universal Extractor ready');
})();
