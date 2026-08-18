# JobTrail 🚀

> Effortless, automatic job application tracking for your job search.

JobTrail is a privacy-first Chrome Extension (Manifest V3) that automatically detects job listings across major career portals and company ATS systems, extracts key application metadata with single-click saving, monitors application status in real-time, and live-syncs everything directly to **Google Sheets** and **Excel**.

---

## ✨ Features

- ⚡ **Auto-Detection & Extraction**: Instant detection of job details via Schema.org JSON-LD, Microdata, and heuristic fallback parsing.
- 🎯 **Universal Site Support**: Native site extractors for LinkedIn, Naukri.com, Indeed, Glassdoor, Greenhouse, Lever, Workday + Universal Fallback for enterprise career portals (Capgemini, Workable, BambooHR, Ashby, etc.).
- 📊 **Live Google Sheets Real-Time Sync**: Zero-login, zero-OAuth Google Apps Script Webhook integration. Apps automatically update rows upon status changes or new saves.
- 🔁 **Multi-Factor Deduplication**: 3-layer deduplication engine using normalized URLs, unique Job ID extraction, and Title + Company case-insensitive matching.
- 📌 **Status Management**: Track your application journey (`Saved`, `Applied`, `Phone Screen`, `Interview`, `Offer`, `Rejected`, `Withdrawn`).
- 📥 **Excel Export**: Built-in 1-click Excel export (`.xlsx`) via sheetjs.
- 🔒 **100% Local & Private**: Your data is stored in browser local storage and your personal Google Sheet. No intermediate servers or analytics tracking.

---

## 🏗️ Architecture

JobTrail follows Chrome Extension Manifest V3 best practices using decoupled content scripts, custom shadow DOM isolation for overlays, and background service workers:

```
JobTrail Extension
 ├── manifest.json                  # Manifest V3 Specification
 ├── background/
 │    └── service-worker.js          # State management, deduplication engine, sync handler
 ├── content/
 │    ├── sites/                    # Platform-specific & Universal extractors
 │    │    ├── linkedin.js
 │    │    ├── naukri.js
 │    │    ├── indeed.js
 │    │    ├── glassdoor.js
 │    │    ├── greenhouse.js
 │    │    ├── lever.js
 │    │    ├── workday.js
 │    │    └── universal.js
 │    ├── detector.js                # SPA mutation observer & trigger loop
 │    ├── apply-tracker.js          # Atomic application click/modal tracking
 │    └── overlay.js                # Isolated Shadow DOM floating save card
 ├── popup/                         # Main extension UI dashboard
 └── lib/                           # Vendor scripts (SheetJS) & Apps Script templates
```

---

## ⚡ Google Sheets Setup Guide

1. Open [sheets.new](https://sheets.new) to create a fresh Google Sheet.
2. Click **Extensions > Apps Script**.
3. Replace existing script code with the template provided inside the JobTrail popup **Google Sheets Sync** settings tab.
4. Click **Deploy > New deployment**.
5. Select type **Web app**, set **Execute as: Me**, and **Who has access: Anyone**.
6. Copy the generated Web App URL into the JobTrail settings modal and click **Save Settings**.

---

## 📄 License

MIT License. Free for personal and portfolio usage.
