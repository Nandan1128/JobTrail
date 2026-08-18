// JobTrail — Universal Apply Tracker
// Automatically detects when a user clicks "Apply" on ANY job board or company career site
// (LinkedIn Easy Apply & External Apply, Indeed, Capgemini, Workday, Greenhouse, Lever, Ashby, etc.),
// auto-saves the job with status "Applied", updates Google Sheets in real-time,
// and shows a success confirmation toast.

(function () {
  'use strict';

  if (window.__jobtrailApplyTrackerInit) return;
  window.__jobtrailApplyTrackerInit = true;

  let currentJobDataForApply = null;

  // Regex pattern for matching any "Apply" button or link
  const APPLY_TEXT_REGEX = /^(easy\s+)?apply(\s+now)?(\s*[»›>→…])?$|^apply\s+(for|with|on|to|online)|^start\s+applying|^submit\s+application|^apply$/i;
  const NOT_APPLY_REGEX = /\b(applied|applicant|applicants|applying to|how to apply|application guide|application status|terms)\b/i;

  const SUBMIT_SELECTORS = [
    'button[aria-label*="Submit application" i]',
    'button[aria-label*="Submit" i]',
    'button[aria-label*="Review your application" i]',
    'button[data-control-name="submit_unify"]',
    '.artdeco-button--primary[aria-label*="Submit" i]',
    '.jobs-easy-apply-footer button.artdeco-button--primary',
    'button.jobs-apply-button'
  ];

  const SUCCESS_SELECTORS = [
    '.artdeco-toast-item',
    '.artdeco-inline-feedback--success',
    '.jobs-post-apply-content',
    '.jpac-modal-header',
    '.artdeco-inline-feedback'
  ];

  const SUCCESS_TEXT_PATTERNS = [
    'application was sent',
    'application sent',
    'applied successfully',
    'application submitted',
    'you applied',
    'application has been submitted'
  ];

  // ===========================================
  // Core Extraction & Save
  // ===========================================

  /**
   * Get the current job data from whichever extractor is active
   */
  function getCurrentJobData() {
    if (window.JobTrailSiteExtractor && typeof window.JobTrailSiteExtractor.isJobPage === 'function' && window.JobTrailSiteExtractor.isJobPage()) {
      const data = window.JobTrailSiteExtractor.extract();
      if (data && data.title) return data;
    }
    if (window.JobTrailUniversalExtractor && typeof window.JobTrailUniversalExtractor.isJobPage === 'function' && window.JobTrailUniversalExtractor.isJobPage()) {
      const data = window.JobTrailUniversalExtractor.extract();
      if (data && data.title) return data;
    }
    return null;
  }

  let lastAppliedKey = '';
  let lastAppliedTime = 0;

  /**
   * Save a job and mark it as "applied"
   */
  function saveAsApplied(jobData) {
    const data = jobData || getCurrentJobData() || currentJobDataForApply;
    if (!data || !data.title) return;

    // 5-second debounce guard to prevent double dispatch on rapid clicks/modals
    const key = (data.url || '') + '|' + (data.title || '') + '|' + (data.company || '');
    const now = Date.now();
    if (key === lastAppliedKey && (now - lastAppliedTime) < 5000) {
      console.log('[JobTrail] Duplicate apply event suppressed within 5s for:', data.title);
      return;
    }

    lastAppliedKey = key;
    lastAppliedTime = now;

    if (!chrome.runtime?.id) {
      console.warn('[JobTrail] Extension context invalidated in apply-tracker.');
      return;
    }

    console.log('[JobTrail] Auto-marking as applied:', data.title, '—', data.company);

    try {
      chrome.runtime.sendMessage(
        { action: 'markApplied', data: data },
        (response) => {
          if (chrome.runtime.lastError || !chrome.runtime?.id) {
            console.warn('[JobTrail] Apply tracker error:', chrome.runtime.lastError?.message);
            return;
          }

          if (response?.success) {
            console.log('[JobTrail] ✅ Job marked as applied:', response.job.title, `(${response.action})`);
            showApplyToast('Application tracked! Status: Applied');
          }
        }
      );
    } catch (err) {
      console.warn('[JobTrail] Apply tracker execution error:', err);
    }
  }

  /**
   * Show a toast notification on the page
   */
  function showApplyToast(message) {
    const existing = document.getElementById('jt-apply-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'jt-apply-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 24px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #059669, #10b981);
      color: white;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      z-index: 2147483647;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      transform: translateX(400px);
      transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none;
    `;
    toast.textContent = '✓ ' + message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
      toast.style.transform = 'translateX(400px)';
      setTimeout(() => toast.remove(), 500);
    }, 4500);
  }

  // ===========================================
  // Universal Apply Button Detection
  // ===========================================

  function isApplyElement(el) {
    if (!el) return false;

    // Check text content
    const text = (el.textContent || el.value || '').trim();
    if (text && APPLY_TEXT_REGEX.test(text) && !NOT_APPLY_REGEX.test(text)) {
      return true;
    }

    // Check aria-label or title
    const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    if (aria && APPLY_TEXT_REGEX.test(aria) && !NOT_APPLY_REGEX.test(aria)) {
      return true;
    }

    // Check href attribute
    const href = el.getAttribute('href') || '';
    if (href && (/\/apply(\/|\?|$)|talentcommunity\/apply/i.test(href) || /job_app/i.test(href))) {
      if (!NOT_APPLY_REGEX.test(text)) {
        return true;
      }
    }

    // Check class names
    const className = el.className || '';
    if (typeof className === 'string' &&
        /dialogApplyBtn|socialbutton-link|apply-button|jobs-apply-button|btn-social-apply/i.test(className) &&
        !NOT_APPLY_REGEX.test(text)) {
      return true;
    }

    return false;
  }

  function isEasyApplyElement(el) {
    if (!el) return false;
    const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
    return text.includes('easy apply') ||
           (el.classList?.contains('artdeco-button--primary') && text.includes('apply'));
  }

  /**
   * Scan page and attach click listeners to all apply buttons & links
   */
  function attachUniversalApplyListeners() {
    const candidates = document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"], [role="menuitem"], [class*="apply" i], [id*="apply" i]');

    candidates.forEach(el => {
      if (el.dataset.jobtrailTracked) return;

      if (isApplyElement(el)) {
        el.dataset.jobtrailTracked = 'true';

        const isEasy = isEasyApplyElement(el);

        // Attach listener with capture: true so we intercept before navigation or modal creation
        el.addEventListener('click', () => {
          console.log('[JobTrail] Apply clicked on element:', el);
          const jobData = getCurrentJobData();

          if (jobData) {
            currentJobDataForApply = jobData;
            // Mark as applied immediately
            saveAsApplied(jobData);
          }

          if (isEasy) {
            // Also monitor Easy Apply modal until final submit
            startMonitoringEasyApply();
          }
        }, true);
      }
    });
  }

  // ===========================================
  // Easy Apply Modal Monitoring (LinkedIn)
  // ===========================================

  let easyApplyObserver = null;

  function startMonitoringEasyApply() {
    stopMonitoringEasyApply();
    console.log('[JobTrail] Monitoring Easy Apply modal steps...');

    easyApplyObserver = new MutationObserver(() => {
      attachSubmitListeners();
      checkForApplicationSuccess();
    });

    easyApplyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    setTimeout(attachSubmitListeners, 500);
    setTimeout(attachSubmitListeners, 1500);
    setTimeout(attachSubmitListeners, 3000);

    setTimeout(() => {
      stopMonitoringEasyApply();
    }, 5 * 60 * 1000);
  }

  function stopMonitoringEasyApply() {
    if (easyApplyObserver) {
      easyApplyObserver.disconnect();
      easyApplyObserver = null;
    }
  }

  function attachSubmitListeners() {
    SUBMIT_SELECTORS.forEach(selector => {
      document.querySelectorAll(selector).forEach(btn => {
        if (btn.dataset.jobtrailSubmitTracked) return;
        btn.dataset.jobtrailSubmitTracked = 'true';

        btn.addEventListener('click', () => {
          console.log('[JobTrail] Submit button clicked');
          const data = getCurrentJobData() || currentJobDataForApply;
          if (data) {
            saveAsApplied(data);
          }
        }, true);
      });
    });

    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if ((text.includes('submit application') || text === 'submit' || aria.includes('submit application')) &&
        !btn.dataset.jobtrailSubmitTracked) {
        btn.dataset.jobtrailSubmitTracked = 'true';
        btn.addEventListener('click', () => {
          console.log('[JobTrail] Submit button (by text/aria) clicked');
          const data = getCurrentJobData() || currentJobDataForApply;
          if (data) {
            saveAsApplied(data);
          }
        }, true);
      }
    });
  }

  function checkForApplicationSuccess() {
    for (const selector of SUCCESS_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent.toLowerCase();
        for (const pattern of SUCCESS_TEXT_PATTERNS) {
          if (text.includes(pattern)) {
            console.log('[JobTrail] Application success detected:', pattern);
            const data = getCurrentJobData() || currentJobDataForApply;
            if (data) {
              saveAsApplied(data);
              currentJobDataForApply = null;
              stopMonitoringEasyApply();
            }
            return;
          }
        }
      }
    }

    const appliedBadges = document.querySelectorAll('.artdeco-inline-feedback, .post-apply-timeline');
    if (appliedBadges.length > 0) {
      const data = getCurrentJobData() || currentJobDataForApply;
      if (data) {
        console.log('[JobTrail] Post-apply element detected');
        saveAsApplied(data);
        currentJobDataForApply = null;
        stopMonitoringEasyApply();
      }
    }
  }

  // ===========================================
  // Initialization & Periodic Scanning
  // ===========================================

  function scanForApplyButtons() {
    attachUniversalApplyListeners();
    attachSubmitListeners();
  }

  // Initial scan with staggered delays
  setTimeout(scanForApplyButtons, 1000);
  setTimeout(scanForApplyButtons, 2500);
  setTimeout(scanForApplyButtons, 4500);

  // Re-scan whenever the DOM changes (SPAs, modals, dropdown opens)
  const applyObserver = new MutationObserver(() => {
    clearTimeout(applyObserver._timeout);
    applyObserver._timeout = setTimeout(scanForApplyButtons, 800);
  });

  if (document.body) {
    applyObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      applyObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  // URL change listener for SPAs
  let lastApplyTrackerHref = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastApplyTrackerHref) {
      lastApplyTrackerHref = window.location.href;
      currentJobDataForApply = null;
      setTimeout(scanForApplyButtons, 1200);
    }
  }, 1200);

  console.log('[JobTrail] Universal Apply tracker active on:', window.location.href);
})();
