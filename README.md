# Summer Dance Intensives

A static enrollment site for Jessica Quinn's Summer Dance Intensives in Deer Park, TX.
Hosted on GitHub Pages, backed by a Google Sheet via Google Apps Script.

- **Front end**: plain HTML/CSS/JS — no build step, no frameworks.
- **Back end**: one Apps Script web app that reads/writes a Google Sheet and sends email.
- **Payments**: link-based (PayPal / Venmo / CashApp / Zelle). No payment API integration.

---

## File map

```
/
├── index.html              Landing: hero + schedule grid + enroll CTA
├── enroll.html             Multi-class enrollment form
├── confirmation.html       Thank-you with payment links
├── 404.html                Not-found page
├── config.js               Local-only — your real handles + Apps Script URL (gitignored)
├── config.example.js       Template — copy to config.js and fill in
├── assets/
│   ├── styles.css          All styles
│   ├── app.js              Form logic, fetch, payment links, capacity check
│   └── img/                Asset folder (currently empty)
├── apps-script/
│   └── Code.gs             Apps Script source — paste into a Google Sheet's Apps Script editor
├── .github/workflows/
│   └── pages.yml           GitHub Pages deploy on push to main
├── .gitignore              Keeps config.js out of git
└── README.md               This file
```

---

## Setup checklist

### 1. Get the code
```bash
git clone https://github.com/ncclements/Summer-Dance-Intensives.git
cd Summer-Dance-Intensives
cp config.example.js config.js
```
(Or open the repo in a GitHub Codespace — `cp` step still required.)

### 2. Create the Google Sheet
Make a new Google Sheet. Name it whatever you like (e.g. `Summer Dance Intensives 2026`).
Paste these **12 column headers** into row 1, left to right:

| Timestamp | Student Name | Grade | Parent Name | Email | Phone | Classes Selected | Total | Payment Method | Paid? | Enrollment ID | Notes |

The Apps Script writes here; later you'll edit **Payment Method**, **Paid?**, and **Notes** by hand as payments come in.

Note the **Sheet ID** in its URL — it's the long string between `/d/` and `/edit`.

### 3. Create the Apps Script project
From the sheet: **Extensions → Apps Script**. A new editor tab opens.
- Delete the placeholder `function myFunction() {}`.
- Paste the entire contents of `apps-script/Code.gs` into the editor.
- Save (⌘/Ctrl + S) and rename the project (top-left) to something like `Dance Enrollment Backend`.

### 4. Set Script Properties
In the Apps Script editor: **Project Settings (gear icon) → Script properties → Add script property**. Add each of these:

| Property | Value | Example |
|---|---|---|
| `SHEET_ID` | The sheet's ID (from step 2) | `1AbC...xyz` |
| `JESSICA_EMAIL` | Where to notify on new enrollments | `jessica@example.com` |
| `PAYPAL_HANDLE` | PayPal.me username, no slash | `jessicaquinn` |
| `VENMO_HANDLE` | Venmo username, no `@` | `JessicaQuinn` |
| `CASHAPP_HANDLE` | $cashtag without the `$` | `JessicaQuinn` |
| `ZELLE_CONTACT` | Email or phone you receive Zelle at | `jessica@example.com` |

> Tip: in the Apps Script editor, select the `_testSetup` function from the dropdown and click **Run** once. The Execution log will confirm all properties are present and show your sheet header row. You'll be asked to authorize the script the first time.

### 5. Deploy as a Web App
- **Deploy → New deployment**.
- Click the gear → **Web app**.
- Description: `Dance enrollment v1`.
- **Execute as: Me**.
- **Who has access: Anyone** (required — anonymous browsers need to POST).
- Click **Deploy**, authorize when prompted, and **copy the Web app URL** that appears.
  It looks like `https://script.google.com/macros/s/AKfy.../exec`.

> Every time you change `Code.gs`, do **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Otherwise the live web app keeps running the old code.

### 6. Configure local `config.js`
Open `config.js` (your local copy from step 1) and fill in real values:

```js
window.CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfy.../exec',
  PAYPAL_HANDLE:   'jessicaquinn',
  VENMO_HANDLE:    'JessicaQuinn',
  CASHAPP_HANDLE:  'JessicaQuinn',
  ZELLE_CONTACT:   'jessica@example.com',
  INSTRUCTOR_NAME: 'Jessica Quinn',
  INSTRUCTOR_CONTACT_EMAIL: 'jessica@example.com'
};
```

Open `index.html` in a browser to smoke-test locally. The schedule grid should show live counts.

### 7. Add the same values as GitHub Actions secrets
GitHub Pages won't have your local `config.js`. The deploy workflow synthesizes one at build time from these repository secrets.

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `APPS_SCRIPT_URL`
- `PAYPAL_HANDLE`
- `VENMO_HANDLE`
- `CASHAPP_HANDLE`
- `ZELLE_CONTACT`
- `INSTRUCTOR_CONTACT_EMAIL`

(Same values as `config.js`, minus `INSTRUCTOR_NAME` which is hard-coded in the workflow.)

> **Heads up:** the Apps Script URL and payment handles are visible to anyone who loads the live site (the browser executes `config.js` client-side). The secrets approach keeps them out of *git history*, not out of the deployed site. That's the right trade-off here — they're public-facing values that customers need to pay.

### 8. Enable GitHub Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 9. Push to main
```bash
git push origin main
```
Watch the Actions tab. When the workflow finishes (~1 min), your site is live at
`https://<your-github-username>.github.io/Summer-Dance-Intensives/`.

### 10. Test the full flow
- Load the site, confirm schedule counts render.
- Submit a fake enrollment with your own email.
- Confirm:
  - You receive the confirmation email (with working PayPal/Venmo/CashApp links).
  - Jessica receives the notification email.
  - A new row appears in the sheet.
  - The confirmation page shows the summary + payment buttons.
- Delete the test row from the sheet when done.

---

## Day-to-day operations

### See who's enrolled
Open the Google Sheet. Most-recent enrollments at the bottom.

### Mark an enrollment as paid
In the sheet, edit the **Paid?** column to `TRUE` (and optionally fill in **Payment Method**: `PayPal`, `Venmo`, `CashApp`, `Zelle`). The form doesn't read these back; they're just for your records.

### Handle a cancellation
Either:
- Add a note in the **Notes** column (e.g., "Cancelled — refunded $40 via Venmo on 6/3"). Leave the row in place. Spot counts will *not* free up — see below.
- **Or** delete the row entirely. This frees up the spot for someone else to grab.

Pick one and be consistent. Deleting frees spots; noting preserves history.

### Change capacity or prices
Both are constants at the top of `apps-script/Code.gs` and `assets/app.js` — change them in **both** files, then redeploy the Apps Script (step 5 above) and push the JS change.

### Add or change class dates
Edit the `CLASSES` array at the top of **both** `apps-script/Code.gs` and `assets/app.js`. They must match — the date strings are the join key between front-end checkboxes and back-end counts.

### Email volume
Apps Script's `GmailApp` has a 1,500-email/day limit on consumer Gmail accounts. We send 2 emails per enrollment (confirmation + notification), so you can comfortably handle hundreds of signups a day.

---

## Known limitations

- **Payments are not verified.** The site directs people to PayPal/Venmo/CashApp/Zelle but has no way to know if they actually paid. Jessica reconciles this manually by checking her accounts and marking the **Paid?** column. This is fine at this scale; it would not be at 500 dancers.
- **Spot counts are eventually consistent.** The sheet read happens on every GET. If two people POST within the same second, `LockService` serializes them so the cap is enforced — but two people *loading* the page simultaneously will both see the same "X spots left" until one submits.
- **No login / no account system.** Each enrollment is a one-shot form submission. There's no "view my enrollments" page. If a parent needs to add a class later, they re-enroll for the additional date.
- **No refund automation.** Cancellations + refunds are manual.
- **The Apps Script web app URL is public.** Anyone could send arbitrary POSTs to it. The validation in `doPost` rejects malformed payloads; the worst-case abuse is junk rows in the sheet. If that becomes a real problem, add a CAPTCHA or a shared-secret header.

---

## Troubleshooting

**Schedule grid says "Check availability" or never loads.**
→ `APPS_SCRIPT_URL` isn't set, or the Apps Script deployment isn't "Anyone" access, or the deployment URL is stale. Check the browser console for a fetch error.

**Form submit fails with CORS error.**
→ Apps Script doesn't support full CORS, so the front end sends POSTs as `text/plain` to avoid preflight. If you've edited `app.js` and added a `Content-Type: application/json` header, the browser will preflight and Apps Script will reject it. Keep it as `text/plain`.

**Got "Script function not found: doPost" when testing.**
→ You ran `doPost` from the editor without arguments. That endpoint expects an HTTP request — test by submitting the live form, not from the editor. Use `_testSetup` to sanity-check properties.

**Confirmation page says "We couldn't find that enrollment."**
→ The confirmation page reads the enrollment from `sessionStorage`, populated by the enroll page on success. Opening the confirmation URL in a different browser/tab won't have that data. The enrollment is still safely in the sheet and the parent received the email — they just can't reload the thank-you page.

**Emails not arriving.**
→ Check the Apps Script execution log (left sidebar → Executions). Email failures are caught and logged but don't fail the enrollment, so the row will exist in the sheet even if email broke. Common causes: hit the daily quota, recipient is invalid, OAuth scope not granted.
