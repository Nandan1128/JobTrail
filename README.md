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

## 📦 How to Install & Use JobTrail

### 1. Installation (Developer Mode)
1. Clone or download this repository to your computer:
   ```bash
   git clone https://github.com/Nandan1128/JobTrail.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (button in the top-left corner).
5. Select the `JobTrail` project folder.

---

### 2. How to Use

#### ✦ Saving Job Listings
1. Visit any job posting on **LinkedIn, Naukri, Indeed, Glassdoor, Greenhouse, Lever, Workday, Capgemini**, or any company career portal.
2. A floating **JobTrail overlay card** automatically slides in with extracted job information (Title, Company, Location, Salary, Employment Type, Work Type).
3. Click **✦ Save to JobTrail** to save it to your pipeline.
4. *(Optional)* Click and hold the header to **drag** the card anywhere on screen, use the corner handle to **resize**, or use the `💧` slider to adjust **transparency**.

#### ⚡ Automatic Application Tracking
- When you click **Apply** or complete an application on supported job sites, JobTrail automatically detects it and updates the status to **`Applied`** with the date & time.

#### 📊 Dashboard & Pipeline Management
1. Click the **JobTrail icon** in your Chrome toolbar to open the dashboard popup.
2. Filter applications by status (`Saved`, `Applied`, `Screen`, `Interview`, `Offer`, `Rejected`, `Withdrawn`) or search by keywords.
3. Update application status dropdowns or add custom notes inline.
4. Click the **Download** icon to export your complete application history as a formatted Excel (`.xlsx`) file.

#### 🔗 Google Sheets Real-Time Sync
- Open the Google Sheets settings tab in the popup to set up real-time auto-sync.
- Click the green `↗` button in the popup header anytime to open your Google Sheet in 1 click!

---

## ⚡ Google Sheets Setup Guide

1. Open [sheets.new](https://sheets.new) to create a fresh Google Sheet.
2. Click **Extensions > Apps Script**.
3. Replace existing script code with the template provided inside the JobTrail popup **Google Sheets Sync** settings tab.
4. Click **Deploy > New deployment**.
5. Select type **Web app**, set **Execute as: Me**, and **Who has access: Anyone**.
6. Copy the generated Web App URL into the JobTrail settings modal and click **Save Settings**.

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

## 📄 License

MIT License. Free for personal and portfolio usage.
