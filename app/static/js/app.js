/* ==========================================================================
   TruthLens AI — app.js
   Vanilla JS. No dependencies. User-submitted text is only ever written with
   textContent / value, never innerHTML.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Helpers & configuration
   * ------------------------------------------------------------------ */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReducedMotion = () => reducedMotionQuery.matches;

  const config = {
    // URLs come from Flask's url_for() via data attributes, with safe fallbacks.
    predictUrl: document.body.dataset.apiPredict || '/api/predict',
    healthUrl: document.body.dataset.apiHealth || '/api/health',
    requestTimeoutMs: 45000,   // generous: free hosts can take a while to wake up
    minAnalysisMs: 1000,       // keeps the progress messages readable, never longer
    progressStepMs: 500,
    slowNoticeMs: 7000,
    healthTimeoutMs: 15000,
    ringDurationMs: 1100,
    draftKey: 'truthlens:draft',
  };

  const MESSAGES = {
    empty: 'Please enter some news text first.',
    server: "We couldn't analyze this content right now. Please try again.",
    network: 'Unable to connect to the AI service. Please check your connection and try again.',
    timeout: 'The analysis is taking longer than expected. Please try again in a moment.',
  };

  const PROGRESS_STEPS = [
    'Analyzing content…',
    'Checking linguistic patterns…',
    'Evaluating model signals…',
  ];

  const SAMPLES = [
    "NASA's Perseverance rover successfully landed on Mars on February 18, 2021, at Jezero Crater. The rover was sent to study the Martian surface and search for signs of ancient microbial life.",
    "NASA has announced that its Perseverance rover discovered a fully functioning ancient human city beneath the surface of Mars, including buildings, roads, and written records from an unknown civilization.",
  ];

  /** Error carrying a "kind" that maps to a friendly message. */
  class AnalysisError extends Error {
    constructor(kind) {
      super(kind);
      this.kind = kind;
    }
  }

  /* ------------------------------------------------------------------ *
   * Result helpers
   * ------------------------------------------------------------------ */

  /** Accepts 0.94, "0.94", 94, "94", "94%" and returns a 0–100 number, or null. */
  function normalizeConfidence(value) {
    if (value === null || value === undefined || value === '') return null;
    const hasPercentSign = typeof value === 'string' && value.includes('%');
    const number = typeof value === 'string' ? parseFloat(value.replace('%', '')) : Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    const percent = !hasPercentSign && number <= 1 ? number * 100 : number;
    return percent > 100 ? null : percent;
  }

  function formatPercent(percent, { rounded = false } = {}) {
    if (rounded) return `${Math.round(percent)}%`;
    const text = percent.toFixed(1);
    return `${text.endsWith('.0') ? text.slice(0, -2) : text}%`;
  }

  function classifyPrediction(prediction) {
    const label = String(prediction).trim().toLowerCase();
    if (label.includes('fake')) return 'fake';
    if (label.includes('real')) return 'real';
    return 'unknown';
  }

  let ringFrame = 0;

  /** Animates the ring stroke and the number from 0 to `percent`. */
  function animateRing(circle, numberEl, percent) {
    cancelAnimationFrame(ringFrame);
    const radius = Number(circle.getAttribute('r')) || 52;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = String(circumference);

    const paint = (value, final) => {
      circle.style.strokeDashoffset = String(circumference * (1 - value / 100));
      numberEl.textContent = formatPercent(value, { rounded: !final });
    };

    if (prefersReducedMotion()) {
      paint(percent, true);
      return;
    }

    paint(0, false);
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / config.ringDurationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      paint(percent * eased, progress === 1);
      if (progress < 1) ringFrame = requestAnimationFrame(tick);
    };
    ringFrame = requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */
  function initNav() {
    const header = $('.site-header');
    const toggle = $('.nav-toggle');
    const nav = $('#site-nav');
    if (!header || !toggle || !nav) return;

    const setOpen = (open, restoreFocus = false) => {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      const use = $('use', toggle);
      if (use) use.setAttribute('href', open ? '#i-x' : '#i-menu');
      if (!open && restoreFocus) toggle.focus();
    };

    toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.classList.contains('is-open')) setOpen(false, true);
    });
    window.matchMedia('(min-width: 821px)').addEventListener('change', (event) => {
      if (event.matches) setOpen(false);
    });

    // Highlight the nav link for the section currently in view (home page only).
    if (!('IntersectionObserver' in window)) return;
    const links = $$('a[href^="#"]', nav);
    if (!links.length) return;

    const targets = new Map();
    ['top', 'analyze', 'how', 'api', 'about'].forEach((id) => {
      const element = document.getElementById(id);
      const linkId = id === 'analyze' ? 'top' : id;
      const link = links.find((item) => item.getAttribute('href') === `#${linkId}`);
      if (element && link) targets.set(element, link);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => link.removeAttribute('aria-current'));
          targets.get(entry.target).setAttribute('aria-current', 'true');
        });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    targets.forEach((_, element) => observer.observe(element));
  }

  /* ------------------------------------------------------------------ *
   * API health indicator
   * ------------------------------------------------------------------ */
  function initHealth() {
    const indicators = $$('[data-health]');
    if (!indicators.length) return;

    const render = (state) => {
      const labels = { checking: 'Checking API…', online: 'API online', offline: 'API unavailable' };
      indicators.forEach((indicator) => {
        indicator.dataset.state = state;
        const label = $('[data-health-label]', indicator);
        if (label) label.textContent = labels[state];
      });
    };

    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      render('checking');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.healthTimeoutMs);
      let online = false;
      try {
        const response = await fetch(config.healthUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        online = response.ok && data && data.status === 'healthy';
      } catch (error) {
        online = false;
      } finally {
        clearTimeout(timer);
        running = false;
      }
      render(online ? 'online' : 'offline');
    };

    $$('[data-health-refresh]').forEach((button) => button.addEventListener('click', check));
    window.addEventListener('online', check);
    check();
  }

  /* ------------------------------------------------------------------ *
   * Small utilities: copy buttons, origin placeholders
   * ------------------------------------------------------------------ */
  function initCopyButtons() {
    $$('[data-copy-target]').forEach((button) => {
      const label = $('[data-copy-label]', button);
      let timer = 0;

      button.addEventListener('click', async () => {
        const source = document.getElementById(button.dataset.copyTarget);
        if (!source) return;
        const text = source.textContent;

        let copied = false;
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (error) {
          const helper = document.createElement('textarea');
          helper.value = text;
          helper.setAttribute('readonly', '');
          helper.style.cssText = 'position:fixed;top:-100px;opacity:0';
          document.body.appendChild(helper);
          helper.select();
          try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
          helper.remove();
        }

        if (label) label.textContent = copied ? 'Copied' : 'Copy failed';
        clearTimeout(timer);
        timer = setTimeout(() => { if (label) label.textContent = 'Copy'; }, 1800);
      });
    });
  }

  function fillOrigin() {
    $$('[data-origin]').forEach((element) => {
      element.textContent = window.location.origin;
    });
  }

  /* ------------------------------------------------------------------ *
   * Detector (home page)
   * ------------------------------------------------------------------ */
  function initDetector() {
    const form = $('#detector-form');
    if (!form) return;

    const textarea = $('#news_text');
    const field = $('.field', form);
    const charCount = $('#char-count');
    const wordCount = $('#word-count');
    const clearButton = $('#btn-clear');
    const sampleButton = $('#btn-sample');
    const submitButton = $('#btn-analyze');
    const submitLabel = $('.btn__label', submitButton);
    const errorBox = $('#form-error');
    const errorText = $('#form-error-text');
    const progressList = $('#progress');
    const progressItems = $$('li', progressList);
    const slowNote = $('#slow-note');
    const liveRegion = $('#sr-status');

    const resultEl = $('#result');
    const resultTitle = $('#result-title');
    const resultSub = $('#result-sub');
    const resultIcon = $('#result-icon');
    const resultText = $('#analyzed-text');
    const ring = $('.ring', resultEl);
    const ringValue = $('#ring-value');
    const ringNumber = $('#ring-number');
    const againButton = $('#btn-again');
    const editButton = $('#btn-edit');

    let busy = false;
    let sampleIndex = 0;
    let progressTimer = 0;
    let progressIndex = 0;

    /* ---- Textarea behaviour ---- */
    const autoResize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    };

    const updateCounter = () => {
      const value = textarea.value;
      const trimmed = value.trim();
      const words = trimmed ? trimmed.split(/\s+/).length : 0;
      charCount.textContent = `${value.length.toLocaleString()} ${value.length === 1 ? 'character' : 'characters'}`;
      wordCount.textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
    };

    const updateControls = () => {
      clearButton.disabled = busy || textarea.value.length === 0;
      sampleButton.disabled = busy;
    };

    const refresh = () => {
      autoResize();
      updateCounter();
      updateControls();
    };

    const announce = (message) => { liveRegion.textContent = message; };

    /* ---- Errors ---- */
    const showError = (message) => {
      errorText.textContent = message;
      errorBox.hidden = false;
    };
    const clearError = () => {
      errorBox.hidden = true;
      errorText.textContent = '';
      textarea.removeAttribute('aria-invalid');
    };

    /* ---- Progress messages ---- */
    const renderProgress = () => {
      progressItems.forEach((item, index) => {
        item.classList.toggle('is-done', index < progressIndex);
        item.classList.toggle('is-active', index === progressIndex);
      });
    };

    const startProgress = () => {
      progressIndex = 0;
      progressList.hidden = false;
      slowNote.hidden = true;
      renderProgress();
      progressTimer = setInterval(() => {
        if (progressIndex < PROGRESS_STEPS.length - 1) {
          progressIndex += 1;
          renderProgress();
        }
      }, config.progressStepMs);
    };

    const stopProgress = () => {
      clearInterval(progressTimer);
      progressList.hidden = true;
      slowNote.hidden = true;
      progressItems.forEach((item) => item.classList.remove('is-active', 'is-done'));
    };

    const setBusy = (value) => {
      busy = value;
      submitButton.setAttribute('aria-disabled', String(value));
      submitButton.setAttribute('aria-busy', String(value));
      submitButton.classList.toggle('is-loading', value);
      submitLabel.textContent = value ? 'Analyzing…' : 'Analyze News';
      field.classList.toggle('is-scanning', value);
      textarea.readOnly = value;
      updateControls();
    };

    /* ---- Network ---- */
    async function requestPrediction(text) {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      const slowTimer = setTimeout(() => {
        slowNote.hidden = false;
        announce('Still working. The service may be starting up.');
      }, config.slowNoticeMs);

      try {
        let response;
        try {
          response = await fetch(config.predictUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ news_text: text }),
            signal: controller.signal,
          });
        } catch (error) {
          throw new AnalysisError(error && error.name === 'AbortError' ? 'timeout' : 'network');
        }

        let data = null;
        try {
          data = await response.json();
        } catch (error) {
          data = null; // HTML error pages from a proxy, empty bodies, etc.
        }

        if (!response.ok) throw new AnalysisError(response.status === 400 ? 'empty' : 'server');
        if (!data || data.success !== true) throw new AnalysisError('server');

        const prediction = typeof data.prediction === 'string' ? data.prediction.trim() : '';
        const confidence = normalizeConfidence(data.confidence);
        if (!prediction || confidence === null) throw new AnalysisError('server');

        return { prediction, confidence };
      } finally {
        clearTimeout(abortTimer);
        clearTimeout(slowTimer);
      }
    }

    /* ---- Result ---- */
    const hideResult = () => {
      cancelAnimationFrame(ringFrame);
      resultEl.hidden = true;
      resultEl.classList.remove('is-entering');
    };

    const showResult = ({ prediction, confidence }, submittedText) => {
      const state = classifyPrediction(prediction);
      const copy = {
        fake: { title: 'Likely Fake News', icon: '#i-alert' },
        real: { title: 'Likely Real News', icon: '#i-check-circle' },
        unknown: { title: `Prediction: ${prediction}`, icon: '#i-help' },
      }[state];

      resultEl.dataset.state = state;
      resultTitle.textContent = copy.title;
      resultSub.textContent = `Model prediction: ${prediction}`;
      resultIcon.setAttribute('href', copy.icon);
      resultText.textContent = submittedText;
      ring.setAttribute('aria-label', `Model confidence: ${formatPercent(confidence)}`);

      resultEl.hidden = false;
      resultEl.classList.remove('is-entering');
      void resultEl.offsetWidth; // restart the entrance animation
      resultEl.classList.add('is-entering');

      animateRing(ringValue, ringNumber, confidence);
      announce(`${copy.title}. Model confidence ${formatPercent(confidence)}.`);

      requestAnimationFrame(() => {
        resultEl.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        resultEl.focus({ preventScroll: true });
      });
    };

    /* ---- Main flow ---- */
    async function runAnalysis(text) {
      clearError();
      setBusy(true);
      startProgress();
      announce(PROGRESS_STEPS[0]);

      const startedAt = performance.now();
      let outcome = null;
      let failure = null;

      try {
        outcome = await requestPrediction(text);
        const remaining = config.minAnalysisMs - (performance.now() - startedAt);
        if (remaining > 0) await sleep(remaining);
      } catch (error) {
        failure = error;
      }

      stopProgress();
      setBusy(false);

      if (failure) {
        const kind = failure instanceof AnalysisError ? failure.kind : 'server';
        if (!(failure instanceof AnalysisError)) console.warn('[TruthLens] Unexpected error:', failure);
        showError(MESSAGES[kind] || MESSAGES.server);
        announce(MESSAGES[kind] || MESSAGES.server);
        return;
      }
      showResult(outcome, text);
    }

    /* ---- Events ---- */
    textarea.addEventListener('input', () => {
      refresh();
      if (!errorBox.hidden) clearError();
    });

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        form.requestSubmit ? form.requestSubmit() : submitButton.click();
      }
    });

    sampleButton.addEventListener('click', () => {
      if (busy) return;
      textarea.value = SAMPLES[sampleIndex];
      sampleIndex = (sampleIndex + 1) % SAMPLES.length;
      clearError();
      refresh();
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(0, 0);
      textarea.scrollTop = 0;
    });

    clearButton.addEventListener('click', () => {
      if (busy) return;
      textarea.value = '';
      clearError();
      hideResult();
      refresh();
      textarea.focus();
    });

    form.addEventListener('submit', (event) => {
      // Without fetch/AbortController the browser falls back to POST /predict.
      if (!('fetch' in window) || !('AbortController' in window)) return;
      event.preventDefault();
      if (busy) return;

      const text = textarea.value.trim();
      if (!text) {
        textarea.setAttribute('aria-invalid', 'true');
        showError(MESSAGES.empty);
        textarea.focus();
        return;
      }
      runAnalysis(text);
    });

    const returnToInput = ({ clear }) => {
      hideResult();
      if (clear) textarea.value = '';
      clearError();
      refresh();
      document.getElementById('analyze').scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      textarea.focus({ preventScroll: true });
    };

    againButton.addEventListener('click', () => returnToInput({ clear: true }));
    editButton.addEventListener('click', () => returnToInput({ clear: false }));

    // Keep the textarea sized correctly when the layout width changes.
    window.addEventListener('resize', autoResize);

    // Restore text carried over from the server-rendered result page ("Edit this text").
    try {
      const draft = sessionStorage.getItem(config.draftKey);
      if (draft) {
        textarea.value = draft;
        sessionStorage.removeItem(config.draftKey);
      }
    } catch (error) {
      /* storage unavailable — ignore */
    }

    refresh();
  }

  /* ------------------------------------------------------------------ *
   * Server-rendered result page (predict.html)
   * ------------------------------------------------------------------ */
  function initResultPage() {
    const root = $('[data-result-page]');
    if (!root) return;

    const circle = $('#ring-value');
    const numberEl = $('#ring-number');
    const percent = normalizeConfidence(root.dataset.confidence);
    if (circle && numberEl && percent !== null) animateRing(circle, numberEl, percent);

    const editLink = $('[data-edit-draft]');
    const text = $('#analyzed-text');
    if (editLink && text) {
      editLink.addEventListener('click', () => {
        try { sessionStorage.setItem(config.draftKey, text.textContent); } catch (error) { /* ignore */ }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initDetector();
    initResultPage();
    initCopyButtons();
    fillOrigin();
    initHealth();
  });
})();