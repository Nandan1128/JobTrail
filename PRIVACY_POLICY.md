# Privacy Policy for JobTrail

**Effective Date:** August 18, 2026

JobTrail ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how data is handled by the JobTrail Chrome Extension.

### 1. Data Collection and Usage
JobTrail operates on a strict **privacy-first, local-only** model:
- **Local Storage:** All tracked job titles, company names, URLs, application statuses, and notes are stored strictly inside your browser's local storage (`chrome.storage.local`).
- **No Third-Party Servers:** We do not host external servers, databases, or analytics endpoints. None of your job application data is ever transmitted to us or any third party.

### 2. Google Sheets Integration
If you choose to enable live synchronization with Google Sheets:
- Your application data is sent directly from your browser to your personal Google Apps Script Web App URL via encrypted HTTPS.
- We do not collect or have access to your Google account credentials, spreadsheets, or Web App URLs.

### 3. Chrome Extension Permissions
- `storage`: Required to save your job application data and extension settings locally.
- `activeTab`: Required to inspect the current page DOM to extract job metadata when you navigate to job listings.
- `downloads`: Required to save exported `.xlsx` Excel files to your local device.
- `tabs`: Required to monitor active tab URL changes for dynamic single-page applications.
- `<all_urls>`: Required to allow universal job metadata extraction across any company career portal.

### 4. Third-Party Websites
JobTrail interacts with public web page structures (JSON-LD, microdata) on sites you choose to visit. JobTrail does not collect or track your browsing activity outside of processing job listings for saving.

### 5. Changes to This Privacy Policy
Any future updates to this Privacy Policy will be posted here.

### 6. Contact
For questions regarding this policy, please create an issue on our GitHub repository.
