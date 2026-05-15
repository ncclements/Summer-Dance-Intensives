/**
 * Summer Dance Intensives — Apps Script backend
 *
 * Endpoints:
 *   GET  → live class availability JSON
 *   POST → create an enrollment, append to sheet, send emails
 *
 * Required Script Properties (Project Settings → Script properties):
 *   SHEET_ID         The Google Sheet's ID (from its URL)
 *   JESSICA_EMAIL    Where to send the "new enrollment" notification
 *   VENMO_HANDLE     e.g. "JessicaQuinn"        (no leading @)
 *   CASHAPP_HANDLE   e.g. "JessicaQuinn"        (no leading $)
 *
 * Sheet columns (row 1 must be the header):
 *   Timestamp | Student Name | Grade | Parent Name | Email | Phone |
 *   Classes Selected | Total | Payment Method | Paid? | Enrollment ID | Notes
 *
 * Deploy: New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Copy the URL into config.js as APPS_SCRIPT_URL.
 */

const PRICE_PER_CLASS = 40;
const CAPACITY = 20;

// Mirrors assets/app.js CLASSES — KEEP IN SYNC.
const CLASSES = [
  { date: 'June 1',  topic: 'Stamina, Strength and Flexibility' },
  { date: 'June 8',  topic: 'Leaps, Turns and Stamina' },
  { date: 'June 15', topic: 'Kicks, Tricks and Stamina' },
  { date: 'June 22', topic: 'Stamina, Strength and Flexibility' },
  { date: 'June 29', topic: 'Leaps, Turns and Stamina' },
  { date: 'July 6',  topic: 'Kicks, Tricks and Stamina' }
];
const VALID_DATES = CLASSES.map(function (c) { return c.date; });
const TOPIC_BY_DATE = CLASSES.reduce(function (acc, c) { acc[c.date] = c.topic; return acc; }, {});

const COL = {
  TIMESTAMP: 1,
  STUDENT:   2,
  GRADE:     3,
  PARENT:    4,
  EMAIL:     5,
  PHONE:     6,
  CLASSES:   7,
  TOTAL:     8,
  METHOD:    9,
  PAID:     10,
  ENROLL_ID:11,
  NOTES:    12
};

// ============================================================
// GET — return availability
// ============================================================
function doGet(e) {
  try {
    var counts = countEnrollments_();
    var classes = {};
    CLASSES.forEach(function (c) {
      classes[c.date] = { booked: counts[c.date] || 0, capacity: CAPACITY };
    });
    return jsonResponse_({
      classes: classes,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ error: 'Could not load availability.', detail: String(err) });
  }
}

// ============================================================
// POST — create enrollment
// ============================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var body = JSON.parse(e.postData.contents);

    // Validate inputs
    var errors = validatePayload_(body);
    if (errors.length) {
      return jsonResponse_({ success: false, code: 'VALIDATION', error: errors.join(' ') });
    }

    // Capacity check (under lock so two simultaneous submits can't oversell)
    var counts = countEnrollments_();
    var fullClasses = body.classes.filter(function (d) {
      return (counts[d] || 0) >= CAPACITY;
    });
    if (fullClasses.length) {
      return jsonResponse_({
        success: false,
        code: 'CLASS_FULL',
        error: 'One or more selected classes just filled up.',
        fullClasses: fullClasses
      });
    }

    // Build row
    var enrollmentId = buildEnrollmentId_();
    var total = body.classes.length * PRICE_PER_CLASS;
    var now = new Date();
    var formattedPhone = formatPhone_(body.parentPhone);
    var row = [];
    row[COL.TIMESTAMP - 1] = now;
    row[COL.STUDENT   - 1] = escapeForSheet_(body.studentName);
    row[COL.GRADE     - 1] = escapeForSheet_(body.grade);
    row[COL.PARENT    - 1] = escapeForSheet_(body.parentName);
    row[COL.EMAIL     - 1] = escapeForSheet_(body.parentEmail);
    row[COL.PHONE     - 1] = escapeForSheet_(formattedPhone);
    row[COL.CLASSES   - 1] = escapeForSheet_(body.classes.join(', '));
    row[COL.TOTAL     - 1] = total;
    row[COL.METHOD    - 1] = '';
    row[COL.PAID      - 1] = false;
    row[COL.ENROLL_ID - 1] = enrollmentId;
    row[COL.NOTES     - 1] = '';

    var sheet = getSheet_();
    sheet.appendRow(row);

    // Fire-and-forget emails — never let an email failure block enrollment.
    try { sendNotificationEmail_(body, total, enrollmentId); }
    catch (mailErr) { console.error('Notification email failed:', mailErr); }

    try { sendConfirmationEmail_(body, total, enrollmentId); }
    catch (mailErr) { console.error('Confirmation email failed:', mailErr); }

    return jsonResponse_({
      success: true,
      enrollmentId: enrollmentId,
      total: total,
      classes: body.classes
    });

  } catch (err) {
    console.error(err);
    return jsonResponse_({ success: false, code: 'SERVER', error: 'Server error: ' + err.message });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ============================================================
// Helpers
// ============================================================

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  var sheetId = props_('SHEET_ID');
  var ss = SpreadsheetApp.openById(sheetId);
  // Use the first sheet by default. Rename it if you want.
  return ss.getSheets()[0];
}

function props_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Script property missing: ' + key);
  return v;
}

function propsOptional_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function countEnrollments_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  var counts = {};
  if (lastRow < 2) return counts;

  var range = sheet.getRange(2, COL.CLASSES, lastRow - 1, 1).getValues();
  range.forEach(function (r) {
    var cell = String(r[0] || '');
    if (!cell) return;
    cell.split(',').forEach(function (d) {
      var date = d.trim();
      if (!date) return;
      counts[date] = (counts[date] || 0) + 1;
    });
  });
  return counts;
}

function validatePayload_(b) {
  var errs = [];
  if (!b || typeof b !== 'object') { errs.push('Missing request body.'); return errs; }
  if (!b.studentName || String(b.studentName).trim().length < 2) errs.push('Student name is required.');
  if (!b.grade)                                                  errs.push('Grade is required.');
  if (!b.parentName  || String(b.parentName).trim().length < 2)  errs.push('Parent name is required.');
  if (!b.parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.parentEmail)) errs.push('Valid email is required.');
  if (!b.parentPhone || String(b.parentPhone).replace(/\D/g, '').length < 10) errs.push('Valid phone is required.');
  if (!Array.isArray(b.classes) || b.classes.length === 0) {
    errs.push('Pick at least one class.');
  } else {
    var bad = b.classes.filter(function (d) { return VALID_DATES.indexOf(d) === -1; });
    if (bad.length) errs.push('Unknown class date(s): ' + bad.join(', '));
    var uniq = {};
    b.classes.forEach(function (d) { uniq[d] = true; });
    if (Object.keys(uniq).length !== b.classes.length) errs.push('Duplicate class dates.');
  }
  return errs;
}

function buildEnrollmentId_() {
  var d = new Date();
  var tz = Session.getScriptTimeZone();
  var stamp = Utilities.formatDate(d, tz, 'yyyyMMdd-HHmm');
  var rand = Math.random().toString(36).toUpperCase().slice(2, 5);
  return 'ENR-' + stamp + '-' + rand;
}

// ---- Emails -----------------------------------------------------------

function sendNotificationEmail_(b, total, enrollmentId) {
  var jess = props_('JESSICA_EMAIL');
  var subject = 'New enrollment: ' + b.studentName + ' (' + b.classes.length + ' class' + (b.classes.length === 1 ? '' : 'es') + ')';
  var classLines = b.classes.map(function (d) { return '  • ' + d + ' — ' + (TOPIC_BY_DATE[d] || ''); }).join('\n');
  var body =
    'A new enrollment came in.\n\n' +
    'Student: ' + b.studentName + ' (Grade ' + b.grade + ')\n' +
    'Parent:  ' + b.parentName + '\n' +
    'Email:   ' + b.parentEmail + '\n' +
    'Phone:   ' + b.parentPhone + '\n\n' +
    'Classes:\n' + classLines + '\n\n' +
    'Total:   $' + total + '\n' +
    'ID:      ' + enrollmentId + '\n';
  GmailApp.sendEmail(jess, subject, body, { name: 'Summer Dance Intensives' });
}

function sendConfirmationEmail_(b, total, enrollmentId) {
  var venmo   = propsOptional_('VENMO_HANDLE');
  var cashapp = propsOptional_('CASHAPP_HANDLE');

  var note = encodeURIComponent('Dance Intensive - ' + b.studentName);
  var venmoUrl   = venmo   ? 'https://venmo.com/?txn=pay&audience=public&recipients=' + encodeURIComponent(venmo) + '&amount=' + total + '&note=' + note : '';
  var cashappUrl = cashapp ? 'https://cash.app/$' + encodeURIComponent(cashapp) + '/' + total : '';

  var classRows = b.classes.map(function (d) {
    return '<li><strong>' + d + '</strong> — ' + (TOPIC_BY_DATE[d] || '') + '</li>';
  }).join('');

  var payRows = '';
  if (venmoUrl)   payRows += payRow_('Venmo',   venmoUrl,   '@' + venmo);
  if (cashappUrl) payRows += payRow_('CashApp', cashappUrl, '$' + cashapp);

  var html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#2A2A2A; max-width:560px; margin:0 auto; padding:24px;">' +
      '<h1 style="font-family:Georgia,serif; color:#2A2A2A; margin:0 0 8px;">You\'re enrolled!</h1>' +
      '<p style="color:#5A5754;">Thanks, ' + escapeHtml_(b.parentName) + ' — ' + escapeHtml_(b.studentName) +
      ' (Grade ' + escapeHtml_(b.grade) + ') is signed up for the following ' +
      b.classes.length + ' class' + (b.classes.length === 1 ? '' : 'es') + ':</p>' +
      '<ul style="line-height:1.7; padding-left:20px;">' + classRows + '</ul>' +
      '<p style="font-size:1.1em;"><strong>Total due: $' + total + '</strong></p>' +

      '<h2 style="font-family:Georgia,serif; margin-top:32px;">Pay anytime before the first class</h2>' +
      '<table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">' + payRows + '</table>' +

      '<h3 style="font-family:Georgia,serif; margin-top:32px;">Where & when</h3>' +
      '<p>4227 Center St, Deer Park TX 77536<br>Mondays, 1:00 – 3:00 PM</p>' +

      '<p style="color:#666; font-size:0.9em; margin-top:32px;">Enrollment ID: <code>' + enrollmentId + '</code></p>' +
      '<p style="color:#666; font-size:0.9em;">Questions? Just reply to this email.</p>' +
      '<p style="color:#2A2A2A;">— Jessica</p>' +
    '</div>';

  var plain =
    'You\'re enrolled!\n\n' +
    'Student: ' + b.studentName + ' (Grade ' + b.grade + ')\n' +
    'Classes:\n' + b.classes.map(function (d) { return '  - ' + d + ' (' + (TOPIC_BY_DATE[d] || '') + ')'; }).join('\n') + '\n\n' +
    'Total due: $' + total + '\n\n' +
    'Pay before the first class:\n' +
    (venmoUrl   ? '  Venmo:   ' + venmoUrl + '\n'   : '') +
    (cashappUrl ? '  CashApp: ' + cashappUrl + '\n' : '') +
    '\n4227 Center St, Deer Park TX 77536\nMondays, 1:00 – 3:00 PM\n\n' +
    'Enrollment ID: ' + enrollmentId + '\n— Jessica';

  GmailApp.sendEmail(b.parentEmail, 'Enrollment confirmed — Summer Dance Intensives', plain, {
    htmlBody: html,
    name: 'Jessica Quinn — Summer Dance Intensives'
  });
}

function payRow_(label, url, display) {
  return '<tr>' +
    '<td style="padding:8px 12px 8px 0; vertical-align:top;"><strong>' + label + ':</strong></td>' +
    '<td style="padding:8px 0;"><a href="' + url + '" style="color:#D85A30; font-weight:600;">' + escapeHtml_(display) + ' →</a></td>' +
  '</tr>';
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPhone_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length === 10) {
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }
  return digits;
}

// Prevent Sheets from interpreting user-supplied text as a formula.
function escapeForSheet_(val) {
  var s = String(val == null ? '' : val);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

// ============================================================
// Manual test helper — run from Apps Script editor to verify setup.
// ============================================================
function _testSetup() {
  console.log('SHEET_ID present:',      !!propsOptional_('SHEET_ID'));
  console.log('JESSICA_EMAIL present:', !!propsOptional_('JESSICA_EMAIL'));
  console.log('VENMO_HANDLE:',          propsOptional_('VENMO_HANDLE'));
  console.log('CASHAPP_HANDLE:',        propsOptional_('CASHAPP_HANDLE'));
  console.log('Sheet first row:',       getSheet_().getRange(1, 1, 1, 12).getValues()[0]);
  console.log('Current counts:',        countEnrollments_());
}
