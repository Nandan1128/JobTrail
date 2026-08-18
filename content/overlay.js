// JobTrail — Floating Save Overlay
// Renders a floating card when a job listing is detected, allowing one-click save

(function () {
  'use strict';

  if (window.__jobtrailOverlayInit) return;
  window.__jobtrailOverlayInit = true;

  let shadowHost = null;
  let shadowRoot = null;
  let overlayEl = null;
  let currentData = null;
  let hideTimeout = null;

  // Drag-and-Drop state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startLeft = 0;
  let startTop = 0;
  let hasBeenMoved = false;

  /**
   * Create the shadow DOM host and overlay markup
   */
  function createOverlay() {
    if (shadowHost) return;

    shadowHost = document.createElement('div');
    shadowHost.id = 'jobtrail-overlay-host';
    shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; pointer-events: none;';
    document.body.appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

    // Inject styles into shadow DOM
    const style = document.createElement('style');
    style.textContent = `

      :host {
        all: initial;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .jt-overlay {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 360px;
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.97) 0%, rgba(30, 41, 59, 0.97) 100%);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 16px;
        padding: 20px;
        color: #e2e8f0;
        pointer-events: auto;
        transform: translateX(420px);
        opacity: 0;
        transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity 0.4s ease;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5),
                    0 0 40px rgba(99, 102, 241, 0.15),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .jt-overlay.jt-visible {
        transform: translateX(0);
        opacity: 1;
      }

      .jt-overlay.jt-hidden {
        transform: translateX(420px);
        opacity: 0;
      }

      .jt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        cursor: grab;
        user-select: none;
        -webkit-user-select: none;
      }

      .jt-header:active {
        cursor: grabbing;
      }

      .jt-drag-handle {
        font-size: 13px;
        color: #64748b;
        margin-left: 6px;
        opacity: 0.6;
        cursor: grab;
        letter-spacing: -1px;
        transition: opacity 0.2s, color 0.2s;
      }

      .jt-header:hover .jt-drag-handle {
        opacity: 1;
        color: #818cf8;
      }

      .jt-header-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .jt-opacity-wrap {
        display: flex;
        align-items: center;
        gap: 4px;
        background: rgba(255, 255, 255, 0.06);
        padding: 3px 8px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .jt-opacity-icon {
        font-size: 11px;
        opacity: 0.7;
        user-select: none;
      }

      .jt-opacity-slider {
        width: 55px;
        height: 4px;
        accent-color: #818cf8;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        outline: none;
      }

      .jt-resize-handle {
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 14px;
        height: 14px;
        cursor: se-resize;
        border-right: 2px solid rgba(129, 140, 248, 0.6);
        border-bottom: 2px solid rgba(129, 140, 248, 0.6);
        border-bottom-right-radius: 4px;
        pointer-events: auto;
        transition: border-color 0.2s;
      }

      .jt-resize-handle:hover {
        border-color: #818cf8;
      }

      .jt-brand {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .jt-logo {
        width: 20px;
        height: 20px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: white;
      }

      .jt-brand-name {
        font-size: 12px;
        font-weight: 600;
        color: #94a3b8;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      .jt-close {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        color: #64748b;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        line-height: 1;
      }

      .jt-close:hover {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .jt-job-info {
        margin-bottom: 16px;
      }

      .jt-job-title {
        font-size: 15px;
        font-weight: 600;
        color: #f1f5f9;
        line-height: 1.4;
        margin-bottom: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .jt-company {
        font-size: 13px;
        color: #8b5cf6;
        font-weight: 500;
      }

      .jt-meta {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .jt-meta-item {
        font-size: 11px;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .jt-meta-icon {
        font-size: 13px;
        opacity: 0.7;
      }

      .jt-actions {
        display: flex;
        gap: 8px;
      }

      .jt-btn-save {
        flex: 1;
        padding: 10px 16px;
        border: none;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        letter-spacing: 0.3px;
        position: relative;
        overflow: hidden;
      }

      .jt-btn-save::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
        transition: left 0.5s ease;
      }

      .jt-btn-save:hover::before {
        left: 100%;
      }

      .jt-btn-save:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
      }

      .jt-btn-save:active {
        transform: translateY(0);
      }

      .jt-btn-save.jt-saved {
        background: linear-gradient(135deg, #059669, #10b981);
        cursor: default;
      }

      .jt-btn-save.jt-saved:hover {
        transform: none;
        box-shadow: none;
      }

      .jt-btn-save.jt-already-saved {
        background: rgba(255, 255, 255, 0.06);
        color: #94a3b8;
        cursor: default;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .jt-btn-save.jt-already-saved:hover {
        transform: none;
        box-shadow: none;
      }

      .jt-btn-dismiss {
        padding: 10px 14px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.04);
        color: #94a3b8;
        transition: all 0.2s ease;
      }

      .jt-btn-dismiss:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
      }

      .jt-source-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
        margin-left: 8px;
      }

      @keyframes jt-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .jt-saving {
        animation: jt-pulse 1s ease-in-out infinite;
      }

      .jt-status-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .jt-status-label {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
      }

      .jt-status-select {
        flex: 1;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(99, 102, 241, 0.3);
        background: rgba(255, 255, 255, 0.06);
        color: #e2e8f0;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        outline: none;
        transition: border-color 0.2s;
      }

      .jt-status-select:hover,
      .jt-status-select:focus {
        border-color: rgba(99, 102, 241, 0.6);
      }

      .jt-status-select option {
        background: #1e293b;
        color: #e2e8f0;
      }

      .jt-work-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .jt-work-remote {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }

      .jt-work-hybrid {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }

      .jt-work-onsite {
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
      }

      .jt-not-job {
        display: block;
        text-align: center;
        font-size: 10px;
        color: #475569;
        margin-top: 8px;
        cursor: pointer;
        transition: color 0.2s;
        text-decoration: none;
        border: none;
        background: none;
        width: 100%;
        font-family: inherit;
      }

      .jt-not-job:hover {
        color: #94a3b8;
      }
    `;
    shadowRoot.appendChild(style);

    overlayEl = document.createElement('div');
    overlayEl.className = 'jt-overlay';
    overlayEl.innerHTML = `
      <div class="jt-header">
        <div class="jt-brand">
          <div class="jt-logo">JT</div>
          <span class="jt-brand-name">JobTrail</span>
          <span class="jt-drag-handle" title="Click and drag to move">⠿</span>
        </div>
        <div class="jt-header-controls">
          <div class="jt-opacity-wrap" title="Adjust Box Opacity">
            <span class="jt-opacity-icon" title="Opacity">💧</span>
            <input type="range" class="jt-opacity-slider" min="0.25" max="1.0" step="0.05" value="0.97">
          </div>
          <button class="jt-close" title="Dismiss">✕</button>
        </div>
      </div>
      <div class="jt-job-info">
        <div class="jt-job-title"></div>
        <div class="jt-company"></div>
      </div>
      <div class="jt-meta">
        <span class="jt-meta-item jt-location">
          <span class="jt-meta-icon">📍</span>
          <span class="jt-location-text"></span>
        </span>
        <span class="jt-meta-item jt-salary" style="display:none;">
          <span class="jt-meta-icon">💰</span>
          <span class="jt-salary-text"></span>
        </span>
        <span class="jt-meta-item jt-employment-type" style="display:none;">
          <span class="jt-meta-icon">💼</span>
          <span class="jt-employment-type-text"></span>
        </span>
        <span class="jt-meta-item jt-work-type-badge" style="display:none;"></span>
      </div>
      <div class="jt-status-row" style="display:none;">
        <span class="jt-status-label">Status:</span>
        <select class="jt-status-select">
          <option value="saved">Saved</option>
          <option value="applied">Applied</option>
          <option value="phone_screen">Phone Screen</option>
          <option value="interview">Interview</option>
          <option value="offer">Offer</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>
      <div class="jt-actions">
        <button class="jt-btn-save">
          ✦ Save to JobTrail
        </button>
        <button class="jt-btn-dismiss">Skip</button>
      </div>
      <button class="jt-not-job">Not a job listing? Dismiss forever</button>
      <div class="jt-resize-handle" title="Drag corner to resize"></div>
    `;
    shadowRoot.appendChild(overlayEl);

    // Wire up events
    overlayEl.querySelector('.jt-close').addEventListener('click', () => hide());
    overlayEl.querySelector('.jt-btn-dismiss').addEventListener('click', () => hide());
    overlayEl.querySelector('.jt-btn-save').addEventListener('click', handleSave);
    overlayEl.querySelector('.jt-not-job').addEventListener('click', () => {
      // Dismiss and prevent re-detection on this URL
      sessionStorage.setItem('jobtrail_dismissed_' + window.location.pathname, '1');
      hide();
    });

    // Wire up status select change for existing jobs
    overlayEl.querySelector('.jt-status-select').addEventListener('change', handleStatusChange);

    // Make card draggable with cursor
    setupDraggable();

    // Setup opacity slider control
    setupOpacityControl();

    // Setup corner resize handle
    setupResizable();
  }

  /**
   * Set up mouse drag handler for overlay card
   */
  function setupDraggable() {
    const header = overlayEl.querySelector('.jt-header');

    function onMouseDown(e) {
      // Don't drag if clicking buttons, links, inputs, or handles
      const target = e.target;
      if (target.closest('button') || target.closest('select') || target.closest('a') || target.closest('input') || target.closest('.jt-close') || target.closest('.jt-resize-handle')) {
        return;
      }

      isDragging = true;
      const rect = overlayEl.getBoundingClientRect();

      // Lock current visual position into absolute top/left coordinates on first move
      if (!hasBeenMoved) {
        overlayEl.style.bottom = 'auto';
        overlayEl.style.right = 'auto';
        overlayEl.style.left = rect.left + 'px';
        overlayEl.style.top = rect.top + 'px';
        overlayEl.style.transform = 'none';
        hasBeenMoved = true;
      }

      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startLeft = parseFloat(overlayEl.style.left) || rect.left;
      startTop = parseFloat(overlayEl.style.top) || rect.top;

      overlayEl.style.transition = 'none';
      if (header) header.style.cursor = 'grabbing';
      overlayEl.style.cursor = 'grabbing';

      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!isDragging) return;

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      let newLeft = startLeft + dx;
      let newTop = startTop + dy;

      // Keep inside view boundaries with 10px padding
      const maxLeft = window.innerWidth - overlayEl.offsetWidth - 10;
      const maxTop = window.innerHeight - overlayEl.offsetHeight - 10;

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      overlayEl.style.left = newLeft + 'px';
      overlayEl.style.top = newTop + 'px';
    }

    function onMouseUp() {
      if (isDragging) {
        isDragging = false;
        overlayEl.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease, box-shadow 0.3s ease';
        if (header) header.style.cursor = 'grab';
        overlayEl.style.cursor = 'default';
      }
    }

    overlayEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  /**
   * Set up opacity slider control
   */
  function setupOpacityControl() {
    const slider = overlayEl.querySelector('.jt-opacity-slider');
    const savedOpacity = localStorage.getItem('jobtrail_overlay_opacity') || '0.97';

    slider.value = savedOpacity;
    overlayEl.style.opacity = savedOpacity;

    slider.addEventListener('input', (e) => {
      const val = e.target.value;
      overlayEl.style.opacity = val;
      localStorage.setItem('jobtrail_overlay_opacity', val);
    });
  }

  /**
   * Set up resizable handle for overlay card
   */
  function setupResizable() {
    const handle = overlayEl.querySelector('.jt-resize-handle');
    let isResizing = false;
    let startW = 0, startH = 0, startX = 0, startY = 0;

    // Restore saved dimensions if present
    const savedW = localStorage.getItem('jobtrail_overlay_width');
    const savedH = localStorage.getItem('jobtrail_overlay_height');
    if (savedW) overlayEl.style.width = savedW;
    if (savedH) overlayEl.style.height = savedH;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = overlayEl.offsetWidth;
      startH = overlayEl.offsetHeight;
      e.stopPropagation();
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const newW = Math.max(280, Math.min(650, startW + (e.clientX - startX)));
      const newH = Math.max(180, Math.min(650, startH + (e.clientY - startY)));
      overlayEl.style.width = newW + 'px';
      overlayEl.style.height = newH + 'px';
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        localStorage.setItem('jobtrail_overlay_width', overlayEl.style.width);
        localStorage.setItem('jobtrail_overlay_height', overlayEl.style.height);
      }
    });
  }

  /**
   * Handle save button click
   */
  function handleSave() {
    if (!currentData) return;

    const saveBtn = overlayEl.querySelector('.jt-btn-save');
    if (saveBtn.classList.contains('jt-saved') || saveBtn.classList.contains('jt-already-saved')) return;

    // Check if extension context is still valid (e.g. if extension was reloaded in developer mode)
    if (!chrome.runtime?.id) {
      console.warn('[JobTrail] Extension context invalidated. Please refresh the page.');
      saveBtn.textContent = '⟳ Refresh Page';
      saveBtn.title = 'Extension was reloaded. Please refresh (F5) this tab.';
      setTimeout(() => {
        saveBtn.textContent = '✦ Save to JobTrail';
      }, 3500);
      return;
    }

    saveBtn.classList.add('jt-saving');
    saveBtn.textContent = 'Saving...';

    try {
      chrome.runtime.sendMessage(
        { action: 'saveJob', data: currentData },
        (response) => {
          saveBtn.classList.remove('jt-saving');

          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            console.warn('[JobTrail] Save message error:', errMsg);

            if (errMsg.includes('Extension context invalidated') || !chrome.runtime?.id) {
              saveBtn.textContent = '⟳ Refresh Page';
              saveBtn.title = 'Extension was reloaded. Please refresh (F5) this tab.';
            } else {
              saveBtn.textContent = '✕ Error — Try Again';
            }
            setTimeout(() => {
              saveBtn.textContent = '✦ Save to JobTrail';
            }, 3000);
            return;
          }

          if (response?.success) {
            saveBtn.classList.add('jt-saved');
            saveBtn.textContent = '✓ Saved!';

            // Auto-dismiss after 3 seconds
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => hide(), 3000);
          } else {
            saveBtn.textContent = response?.message || '✕ Error';
            setTimeout(() => {
              saveBtn.textContent = '✦ Save to JobTrail';
            }, 2000);
          }
        }
      );
    } catch (err) {
      console.warn('[JobTrail] Save execution error:', err);
      saveBtn.classList.remove('jt-saving');
      if (err.message && err.message.includes('Extension context invalidated')) {
        saveBtn.textContent = '⟳ Refresh Page';
        saveBtn.title = 'Extension was reloaded. Please refresh (F5) this tab.';
      } else {
        saveBtn.textContent = '✕ Error';
      }
      setTimeout(() => {
        saveBtn.textContent = '✦ Save to JobTrail';
      }, 3000);
    }
  }

  /**
   * Show the overlay with job data
   */
  function show(jobData, alreadySaved, existingJob) {
    // Check session dismissal
    if (sessionStorage.getItem('jobtrail_dismissed_' + window.location.pathname)) return;

    createOverlay();
    currentData = jobData;

    clearTimeout(hideTimeout);

    // Update content
    overlayEl.querySelector('.jt-job-title').textContent = jobData.title;

    const companyEl = overlayEl.querySelector('.jt-company');
    companyEl.innerHTML = '';
    companyEl.textContent = jobData.company;

    if (jobData.source) {
      const badge = document.createElement('span');
      badge.className = 'jt-source-badge';
      badge.textContent = jobData.source;
      companyEl.appendChild(badge);
    }

    // Location
    const locEl = overlayEl.querySelector('.jt-location');
    const locTextEl = overlayEl.querySelector('.jt-location-text');
    if (jobData.location) {
      locEl.style.display = '';
      locTextEl.textContent = jobData.location;
    } else {
      locEl.style.display = 'none';
    }

    // Salary
    const salaryEl = overlayEl.querySelector('.jt-salary');
    const salaryTextEl = overlayEl.querySelector('.jt-salary-text');
    if (jobData.salary) {
      salaryEl.style.display = '';
      salaryTextEl.textContent = jobData.salary;
    } else {
      salaryEl.style.display = 'none';
    }

    // Employment Type
    const empTypeEl = overlayEl.querySelector('.jt-employment-type');
    const empTypeTextEl = overlayEl.querySelector('.jt-employment-type-text');
    if (jobData.employmentType) {
      empTypeEl.style.display = '';
      empTypeTextEl.textContent = jobData.employmentType;
    } else {
      empTypeEl.style.display = 'none';
    }

    // Work Type Badge (Remote/Hybrid/On-site)
    const workBadgeEl = overlayEl.querySelector('.jt-work-type-badge');
    if (jobData.workType) {
      workBadgeEl.style.display = '';
      workBadgeEl.textContent = jobData.workType;
      workBadgeEl.className = 'jt-meta-item jt-work-type-badge jt-work-badge';
      if (jobData.workType === 'Remote') workBadgeEl.classList.add('jt-work-remote');
      else if (jobData.workType === 'Hybrid') workBadgeEl.classList.add('jt-work-hybrid');
      else if (jobData.workType === 'On-site') workBadgeEl.classList.add('jt-work-onsite');
    } else {
      workBadgeEl.style.display = 'none';
    }

    // Status row (visible only when duplicate detected)
    const statusRow = overlayEl.querySelector('.jt-status-row');
    const statusSelect = overlayEl.querySelector('.jt-status-select');
    const isSaved = alreadySaved || !!existingJob;

    // Save button state
    const saveBtn = overlayEl.querySelector('.jt-btn-save');
    saveBtn.classList.remove('jt-saved', 'jt-saving', 'jt-already-saved');

    if (isSaved) {
      saveBtn.classList.add('jt-already-saved');
      const status = existingJob?.status || 'saved';
      const STATUS_LABELS = {
        saved: '✓ Saved', applied: '✓ Applied', phone_screen: '✓ Phone Screen',
        interview: '✓ Interviewing', offer: '✓ Offer Received',
        rejected: '✓ Rejected', withdrawn: '✓ Withdrawn'
      };
      saveBtn.textContent = STATUS_LABELS[status] || '✓ Already Saved';

      // Show status update row
      statusRow.style.display = '';
      statusSelect.value = status;
      statusSelect.dataset.jobId = existingJob?.id || '';
    } else {
      saveBtn.textContent = '✦ Save to JobTrail';
      statusRow.style.display = 'none';
    }

    // Animate in
    const savedOpacity = localStorage.getItem('jobtrail_overlay_opacity') || '0.97';
    requestAnimationFrame(() => {
      overlayEl.classList.remove('jt-hidden');
      overlayEl.classList.add('jt-visible');
      overlayEl.style.opacity = savedOpacity;
      if (hasBeenMoved) {
        overlayEl.style.transform = 'none';
      }
    });
  }

  /**
   * Handle status change from the overlay dropdown (for already-saved jobs)
   */
  function handleStatusChange(e) {
    const newStatus = e.target.value;
    const jobId = e.target.dataset.jobId;
    if (!jobId || !chrome.runtime?.id) return;

    try {
      chrome.runtime.sendMessage(
        { action: 'updateJob', id: jobId, updates: { status: newStatus } },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[JobTrail] Status update error:', chrome.runtime.lastError.message);
            return;
          }

          if (response?.success) {
            // Update the save button text to reflect the new status
            const saveBtn = overlayEl.querySelector('.jt-btn-save');
            const STATUS_LABELS = {
              saved: '✓ Saved', applied: '✓ Applied', phone_screen: '✓ Phone Screen',
              interview: '✓ Interviewing', offer: '✓ Offer Received',
              rejected: '✓ Rejected', withdrawn: '✓ Withdrawn'
            };
            saveBtn.textContent = STATUS_LABELS[newStatus] || '✓ Updated';

            console.log(`[JobTrail] Status updated to "${newStatus}" from overlay`);
          }
        }
      );
    } catch (err) {
      console.warn('[JobTrail] Status change error:', err);
    }
  }

  /**
   * Hide the overlay with animation
   */
  function hide() {
    if (!overlayEl) return;
    clearTimeout(hideTimeout);
    overlayEl.classList.remove('jt-visible');
    overlayEl.classList.add('jt-hidden');
    currentData = null;
  }

  // Export the overlay controller
  window.JobTrailOverlay = { show, hide };

  console.log('[JobTrail] Overlay initialized');
})();

