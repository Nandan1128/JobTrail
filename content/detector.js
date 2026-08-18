// JobTrail — Core Detection Engine
// Monitors page changes via MutationObserver and coordinates extraction + overlay

(function () {
  'use strict';

  // Prevent double initialization
  if (window.__jobtrailDetectorInit) return;
  window.__jobtrailDetectorInit = true;

  const DEBOUNCE_MS = 800;
  const CHECK_INTERVAL_MS = 2000;
  let lastExtractedUrl = '';
  let lastExtractedTitle = '';
  let debounceTimer = null;
  let currentJobData = null;
  let retryCount = 0;
  const MAX_RETRIES = 10;

  /**
   * Helper to get the active extractor (Site-specific first, then Universal fallback)
   */
  function getActiveExtractor() {
    if (window.JobTrailSiteExtractor) {
      return window.JobTrailSiteExtractor;
    }
    if (window.JobTrailUniversalExtractor) {
      return window.JobTrailUniversalExtractor;
    }
    return null;
  }

  /**
   * Main detection routine — called on page changes
   */
  function detect() {
    const extractor = getActiveExtractor();

    // Check if any extractor is available
    if (!extractor) {
      console.log('[JobTrail] No extractor found');
      return;
    }

    if (!extractor.isJobPage()) {
      // If site extractor didn't match, try universal extractor
      if (extractor === window.JobTrailSiteExtractor && window.JobTrailUniversalExtractor?.isJobPage()) {
        const universalData = window.JobTrailUniversalExtractor.extract();
        if (universalData) {
          processJobData(universalData);
          return;
        }
      }

      // Not on a job page — hide overlay if visible
      if (window.JobTrailOverlay) {
        window.JobTrailOverlay.hide();
      }
      currentJobData = null;
      retryCount = 0;
      return;
    }

    const data = extractor.extract();

    if (!data) {
      // If site extractor returned null, try universal extractor
      if (extractor === window.JobTrailSiteExtractor && window.JobTrailUniversalExtractor?.isJobPage()) {
        const universalData = window.JobTrailUniversalExtractor.extract();
        if (universalData) {
          processJobData(universalData);
          return;
        }
      }

      // Page looks like a job page but extraction failed — retry
      // (DOM might not be fully loaded yet on SPAs)
      retryCount++;
      if (retryCount <= MAX_RETRIES) {
        console.log(`[JobTrail] Extraction returned null, retrying (${retryCount}/${MAX_RETRIES})...`);
        setTimeout(detect, 1000);
      }
      return;
    }

    processJobData(data);
  }

  /**
   * Process extracted job data and trigger overlay
   */
  function processJobData(data) {
    retryCount = 0;

    // Check if this is actually new data (same title + company = same job)
    if (currentJobData &&
      currentJobData.title === data.title &&
      currentJobData.company === data.company &&
      currentJobData.url === data.url) {
      return;
    }

    console.log('[JobTrail] Job detected:', data.title, '—', data.company, `[${data.source || 'universal'}]`);

    lastExtractedUrl = data.url;
    lastExtractedTitle = data.title;
    currentJobData = data;

    // Check if this job is already saved
    try {
      if (!chrome.runtime?.id) {
        if (window.JobTrailOverlay) {
          window.JobTrailOverlay.show(data, false);
        }
        return;
      }

      chrome.runtime.sendMessage(
        { action: 'checkJob', data: data },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[JobTrail] Message error:', chrome.runtime.lastError.message);
            // Still show overlay even if check fails
            if (window.JobTrailOverlay) {
              window.JobTrailOverlay.show(data, false);
            }
            return;
          }

          if (window.JobTrailOverlay) {
            window.JobTrailOverlay.show(data, response?.exists || false, response?.job);
          }
        }
      );
    } catch (err) {
      console.warn('[JobTrail] Runtime message error:', err);
      // Still show overlay
      if (window.JobTrailOverlay) {
        window.JobTrailOverlay.show(data, false);
      }
    }
  }

  /**
   * Debounced detection to avoid excessive calls during SPA transitions
   */
  function debouncedDetect() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(detect, DEBOUNCE_MS);
  }

  /**
   * Force re-detection (resets dedup state)
   */
  function forceDetect() {
    lastExtractedUrl = '';
    lastExtractedTitle = '';
    currentJobData = null;
    retryCount = 0;
    detect();
    // Schedule delayed passes for SPAs like LinkedIn where DOM loads asynchronously
    setTimeout(detect, 600);
    setTimeout(detect, 1200);
  }

  // --- Initialize ---

  // Run initial detection after delays to let the page render
  setTimeout(detect, 1500);
  setTimeout(detect, 3000);
  setTimeout(detect, 5000);

  // Watch for DOM mutations (SPA navigation)
  const observer = new MutationObserver((mutations) => {
    // Only trigger on meaningful changes (node additions/removals)
    const dominated = mutations.some(m =>
      m.addedNodes.length > 0 || m.removedNodes.length > 0
    );
    if (dominated) {
      debouncedDetect();
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    // Body not ready yet — wait for it
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  // Intercept pushState and replaceState for SPA URL changes
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    console.log('[JobTrail] pushState detected');
    forceDetect();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    debouncedDetect();
  };

  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    console.log('[JobTrail] popstate detected');
    forceDetect();
  });

  // Fallback periodic check — catches cases where URL changes without pushState
  let lastCheckHref = window.location.href;
  setInterval(() => {
    const currentHref = window.location.href;
    if (currentHref !== lastCheckHref) {
      console.log('[JobTrail] URL change detected via interval:', currentHref);
      lastCheckHref = currentHref;
      forceDetect();
    } else if (!currentJobData && getActiveExtractor()?.isJobPage()) {
      // We're on a job page but haven't extracted yet — try again
      detect();
    }
  }, CHECK_INTERVAL_MS);

  console.log('[JobTrail] Detection engine initialized with source:', getActiveExtractor()?.source || 'pending', 'on', window.location.href);
})();
