/* ============================================================
   Summer Dance Intensives — front-end logic
   Vanilla JS. No build step.
   ============================================================ */
(function () {
  'use strict';

  // ---- Canonical class data (must mirror apps-script/Code.gs) -----------
  const CLASSES = [
    { date: 'June 1',  topic: 'Stamina, Strength and Flexibility' },
    { date: 'June 8',  topic: 'Leaps, Turns and Stamina' },
    { date: 'June 15', topic: 'Kicks, Tricks and Stamina' },
    { date: 'June 22', topic: 'Stamina, Strength and Flexibility' },
    { date: 'June 29', topic: 'Leaps, Turns and Stamina' },
    { date: 'July 6',  topic: 'Kicks, Tricks and Stamina' }
  ];
  const PRICE_PER_CLASS = 40;
  const CAPACITY = 20;

  const CFG = window.CONFIG || {};

  // ---- Small utilities --------------------------------------------------
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmtMoney = (n) => '$' + Number(n).toFixed(0);

  function spotsLabel(remaining) {
    if (remaining <= 0) return 'Full';
    if (remaining === 1) return '1 spot left';
    if (remaining <= 4) return remaining + ' spots left';
    return remaining + ' of ' + CAPACITY + ' open';
  }
  function spotsClass(remaining) {
    if (remaining <= 0) return 'spots is-full';
    if (remaining <= 4) return 'spots is-low';
    return 'spots';
  }

  // Fetch live availability from Apps Script.
  // Returns: { 'June 1': { booked: n, capacity: 20 }, ... } — or null on failure.
  async function fetchAvailability() {
    if (!CFG.APPS_SCRIPT_URL || CFG.APPS_SCRIPT_URL.indexOf('PASTE') === 0) {
      console.warn('[dance] APPS_SCRIPT_URL not configured — using empty availability.');
      return {};
    }
    try {
      const res = await fetch(CFG.APPS_SCRIPT_URL, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data && data.classes ? data.classes : {};
    } catch (err) {
      console.error('[dance] availability fetch failed:', err);
      return null;
    }
  }

  // POST enrollment to Apps Script. Uses text/plain to avoid CORS preflight.
  async function submitEnrollment(payload) {
    if (!CFG.APPS_SCRIPT_URL || CFG.APPS_SCRIPT_URL.indexOf('PASTE') === 0) {
      throw new Error('Enrollment endpoint not configured. Ask Jessica to finish setup.');
    }
    const res = await fetch(CFG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error('Server returned an unexpected response. Please try again.'); }
    if (!data.success) {
      const err = new Error(data.error || 'Something went wrong.');
      err.code = data.code;
      err.fullClasses = data.fullClasses;
      throw err;
    }
    return data;
  }

  // ---- Payment link builders -------------------------------------------
  function buildPaymentLinks(total, studentName) {
    const note = 'Dance Intensive - ' + (studentName || '');
    return {
      venmo:   'https://venmo.com/?txn=pay&audience=public&recipients=' +
               encodeURIComponent(CFG.VENMO_HANDLE || '') +
               '&amount=' + total +
               '&note=' + encodeURIComponent(note),
      cashapp: 'https://cash.app/$' + encodeURIComponent(CFG.CASHAPP_HANDLE || '') + '/' + total
    };
  }

  // ============================================================
  // PAGE: index.html — render schedule grid
  // ============================================================
  async function initLanding() {
    const grid = $('#schedule-grid');
    if (!grid) return;

    const availability = await fetchAvailability();
    grid.innerHTML = '';

    CLASSES.forEach((cls) => {
      const avail = availability && availability[cls.date];
      const booked = avail ? avail.booked : 0;
      const remaining = Math.max(0, CAPACITY - booked);
      const isFull = remaining <= 0;
      const unknown = availability === null;

      const card = document.createElement('article');
      card.className = 'class-card' + (isFull ? ' is-full' : '');

      const spotText = unknown
        ? 'Check availability'
        : spotsLabel(remaining);
      const spotCls = unknown ? 'spots' : spotsClass(remaining);

      card.innerHTML = `
        <div class="card-date">${cls.date}</div>
        <div class="card-topic">${cls.topic}</div>
        <div class="card-meta">
          <span class="card-pricetag">${fmtMoney(PRICE_PER_CLASS)}</span>
          <span class="${spotCls}">${spotText}</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // ============================================================
  // PAGE: enroll.html — render class picker and wire form
  // ============================================================
  async function initEnroll() {
    const form = $('#enroll-form');
    if (!form) return;

    const picker     = $('#class-picker');
    const totalAmt   = $('#total-amount');
    const totalCount = $('#total-count');
    const submitBtn  = $('#submit-btn');
    const formError  = $('#form-error');

    let availability = await fetchAvailability();
    if (availability === null) availability = {};

    // Render class options
    picker.innerHTML = '';
    CLASSES.forEach((cls, i) => {
      const booked = (availability[cls.date] && availability[cls.date].booked) || 0;
      const remaining = Math.max(0, CAPACITY - booked);
      const isFull = remaining <= 0;
      const id = 'cls-' + i;

      const label = document.createElement('label');
      label.className = 'class-option' + (isFull ? ' is-full' : '');
      label.htmlFor = id;
      label.innerHTML = `
        <input type="checkbox" id="${id}" name="classes" value="${cls.date}" ${isFull ? 'disabled' : ''} />
        <div class="opt-main">
          <span class="opt-date">${cls.date}</span>
          <span class="opt-topic">${cls.topic}</span>
        </div>
        <span class="${spotsClass(remaining)}">${spotsLabel(remaining)}</span>
      `;
      picker.appendChild(label);
    });

    // Live UI updates
    function refreshTotals() {
      const checked = $$('#class-picker input[type="checkbox"]:checked');
      checked.forEach((cb) => cb.closest('.class-option').classList.add('is-checked'));
      $$('#class-picker input[type="checkbox"]:not(:checked)').forEach((cb) =>
        cb.closest('.class-option').classList.remove('is-checked')
      );
      const count = checked.length;
      totalAmt.textContent = fmtMoney(count * PRICE_PER_CLASS);
      totalCount.textContent = '(' + count + ' class' + (count === 1 ? '' : 'es') + ' selected)';
      validate();
    }

    // Validation
    const fields = {
      studentName:  { el: $('#studentName'),  check: (v) => v.trim().length >= 2,                msg: 'Please enter the dancer\'s name.' },
      grade:        { el: $('#grade'),        check: (v) => v !== '',                            msg: 'Pick a grade.' },
      parentName:   { el: $('#parentName'),   check: (v) => v.trim().length >= 2,                msg: 'Please enter your name.' },
      parentEmail:  { el: $('#parentEmail'),  check: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), msg: 'Enter a valid email.' },
      parentPhone:  { el: $('#parentPhone'),  check: (v) => (v.replace(/\D/g, '').length >= 10),  msg: 'Enter a valid US phone number.' }
    };

    function setError(name, msg) {
      const el = fields[name].el;
      const errEl = document.querySelector('.field-error[data-for="' + name + '"]');
      if (msg) {
        el.classList.add('is-invalid');
        if (errEl) errEl.textContent = msg;
      } else {
        el.classList.remove('is-invalid');
        if (errEl) errEl.textContent = '';
      }
    }

    function validate({ showAll = false } = {}) {
      let allValid = true;
      Object.keys(fields).forEach((name) => {
        const f = fields[name];
        const v = f.el.value || '';
        const ok = f.check(v);
        if (!ok) {
          allValid = false;
          if (showAll || f.el.dataset.touched) setError(name, f.msg);
        } else {
          setError(name, '');
        }
      });
      const checked = $$('#class-picker input[type="checkbox"]:checked').length;
      const classErr = document.querySelector('.field-error[data-for="classes"]');
      if (checked === 0) {
        allValid = false;
        if (showAll && classErr) classErr.textContent = 'Pick at least one class.';
      } else if (classErr) {
        classErr.textContent = '';
      }
      submitBtn.disabled = !allValid;
      return allValid;
    }

    Object.values(fields).forEach((f) => {
      f.el.addEventListener('input', () => { f.el.dataset.touched = '1'; validate(); });
      f.el.addEventListener('blur',  () => { f.el.dataset.touched = '1'; validate(); });
    });
    picker.addEventListener('change', refreshTotals);

    // Initial state
    refreshTotals();

    // Submit
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      formError.hidden = true;

      if (!validate({ showAll: true })) {
        formError.hidden = false;
        formError.textContent = 'Please fix the highlighted fields and try again.';
        return;
      }

      const payload = {
        studentName: $('#studentName').value.trim(),
        grade: $('#grade').value,
        parentName: $('#parentName').value.trim(),
        parentEmail: $('#parentEmail').value.trim(),
        parentPhone: $('#parentPhone').value.trim(),
        classes: $$('#class-picker input[type="checkbox"]:checked').map((cb) => cb.value)
      };

      submitBtn.classList.add('is-loading');
      submitBtn.disabled = true;

      try {
        const result = await submitEnrollment(payload);
        // Cache the enrollment for the confirmation page (avoids a second round-trip)
        try {
          sessionStorage.setItem('enrollment:' + result.enrollmentId, JSON.stringify({
            ...result,
            studentName: payload.studentName,
            parentEmail: payload.parentEmail,
            classes: payload.classes
          }));
        } catch (e) { /* sessionStorage can fail in private mode — non-fatal */ }
        window.location.href = 'confirmation.html#id=' + encodeURIComponent(result.enrollmentId);
      } catch (err) {
        submitBtn.classList.remove('is-loading');
        submitBtn.disabled = false;
        formError.hidden = false;
        if (err.code === 'CLASS_FULL' && Array.isArray(err.fullClasses)) {
          formError.textContent = 'These classes just filled up while you were enrolling: ' +
            err.fullClasses.join(', ') + '. Please uncheck them and try again.';
          // Mark the full ones in the UI
          err.fullClasses.forEach((date) => {
            const cb = $$('#class-picker input[type="checkbox"]')
              .find((el) => el.value === date);
            if (cb) {
              cb.checked = false;
              cb.disabled = true;
              cb.closest('.class-option').classList.add('is-full');
            }
          });
          refreshTotals();
        } else {
          formError.textContent = err.message || 'Something went wrong. Please try again.';
        }
      }
    });
  }

  // ============================================================
  // PAGE: confirmation.html — show summary + payment links
  // ============================================================
  async function initConfirmation() {
    const loading = $('#confirm-loading');
    const content = $('#confirm-content');
    const errBox  = $('#confirm-error');
    if (!loading || !content) return;

    const hash = window.location.hash || '';
    const match = hash.match(/id=([^&]+)/);
    const enrollmentId = match ? decodeURIComponent(match[1]) : '';

    if (!enrollmentId) {
      loading.hidden = true;
      errBox.hidden = false;
      return;
    }

    let enrollment = null;
    try {
      const cached = sessionStorage.getItem('enrollment:' + enrollmentId);
      if (cached) enrollment = JSON.parse(cached);
    } catch (e) { /* ignore */ }

    // We could also fetch from Apps Script here, but to keep doGet read-only
    // and avoid round-tripping, we rely on the sessionStorage handoff.
    if (!enrollment) {
      loading.hidden = true;
      errBox.hidden = false;
      return;
    }

    loading.hidden = true;
    content.hidden = false;

    // Render summary
    const suffix = enrollment.studentName ? (', ' + enrollment.studentName) : '';
    $('#confirm-name-suffix').textContent = suffix;
    $('#confirm-id').textContent = enrollmentId;
    $('#confirm-email').textContent = enrollment.parentEmail || 'your inbox';
    $('#confirm-total').textContent = fmtMoney(enrollment.total);

    const list = $('#confirm-classes');
    list.innerHTML = '';
    const topicByDate = {};
    CLASSES.forEach((c) => { topicByDate[c.date] = c.topic; });
    enrollment.classes.forEach((date) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span><span class="cl-date">${date}</span> <span class="cl-topic">· ${topicByDate[date] || ''}</span></span>
        <span class="cl-price">${fmtMoney(PRICE_PER_CLASS)}</span>
      `;
      list.appendChild(li);
    });

    // Wire payment links
    const links = buildPaymentLinks(enrollment.total, enrollment.studentName);

    const venmoEl   = $('#pay-venmo');
    const cashappEl = $('#pay-cashapp');

    venmoEl.href   = links.venmo;
    cashappEl.href = links.cashapp;

    $('[data-handle="venmo"]').textContent   = CFG.VENMO_HANDLE   || '—';
    $('[data-handle="cashapp"]').textContent = CFG.CASHAPP_HANDLE || '—';
  }

  // ---- Boot -------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initLanding();
    initEnroll();
    initConfirmation();
  });
})();
