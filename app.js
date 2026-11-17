'use strict';

const STORAGE_KEY = 'countdown-pwa:v1';
const CHROME_HIDE_MS = 4000;
const DURATION_PRESETS = [
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 }
];
const TIME_PRESETS = [
  { label: '6:00 PM', time: '18:00:00' },
  { label: '7:00 PM', time: '19:00:00' },
  { label: '8:00 PM', time: '20:00:00' },
  { label: '9:00 PM', time: '21:00:00' },
  { label: 'Midnight', time: '00:00:00' }
];

const els = {
  app: document.getElementById('app'),
  setup: document.getElementById('view-setup'),
  timer: document.getElementById('view-timer'),
  ended: document.getElementById('view-ended'),
  form: document.getElementById('setup-form'),
  label: document.getElementById('input-label'),
  time: document.getElementById('input-time'),
  date: document.getElementById('input-date'),
  hint: document.getElementById('target-hint'),
  picker: document.getElementById('time-picker'),
  presetsDuration: document.getElementById('presets-duration'),
  presetsTime: document.getElementById('presets-time'),
  timerLabel: document.getElementById('timer-label'),
  timerMeta: document.getElementById('timer-meta'),
  clock: document.getElementById('clock'),
  progressRail: document.getElementById('progress-rail'),
  progressFill: document.getElementById('progress-fill'),
  clusterDays: document.getElementById('cluster-days'),
  colonDays: document.getElementById('colon-days'),
  toggle: document.getElementById('btn-toggle'),
  reset: document.getElementById('btn-reset'),
  sound: document.getElementById('btn-sound'),
  fullscreen: document.getElementById('btn-fullscreen'),
  install: document.getElementById('btn-install'),
  settings: document.getElementById('btn-settings'),
  dialog: document.getElementById('settings-dialog'),
  settingSound: document.getElementById('setting-sound'),
  setting12h: document.getElementById('setting-12h'),
  notifyBtn: document.getElementById('btn-notify'),
  notifyStatus: document.getElementById('notify-status'),
  endedSub: document.getElementById('ended-sub'),
  endedAmpm: document.getElementById('ended-ampm'),
  endedClock: document.getElementById('ended-clock'),
  confetti: document.getElementById('confetti'),
  themeMeta: document.getElementById('meta-theme-color')
};

const picker = {
  hour: 7,
  minute: 0,
  second: 0,
  ampm: 'PM'
};

const state = {
  mode: 'setup',
  target: null,
  totalMs: 0,
  remainingMs: 0,
  soundOn: true,
  hour12: true,
  label: '',
  raf: 0,
  endTimeout: 0,
  chromeTimer: 0,
  wakeLock: null,
  lastShown: '',
  endedKey: '',
  installPrompt: null,
  audioCtx: null,
  confetti: null
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.soundOn === 'boolean') state.soundOn = data.soundOn;
    if (typeof data.hour12 === 'boolean') state.hour12 = data.hour12;
    if (typeof data.label === 'string') els.label.value = data.label;
    if (typeof data.time === 'string' && data.time) setTimeFromString(data.time);
    if (typeof data.date === 'string' && data.date) {
      const today = toISODate(new Date());
      els.date.value = data.date >= today ? data.date : '';
    }
  } catch (err) {
    console.warn('Could not restore settings', err);
  }
}

function saveSettings() {
  const data = {
    soundOn: state.soundOn,
    hour12: state.hour12,
    label: els.label.value.trim(),
    time: getTimeString(),
    date: els.date.value
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Could not save settings', err);
  }
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function wrap(value, min, max) {
  const span = max - min + 1;
  return ((value - min) % span + span) % span + min;
}

function hourRange() {
  return state.hour12 ? { min: 1, max: 12 } : { min: 0, max: 23 };
}

function parseTime(value) {
  if (!value) return null;
  const parts = value.split(':');
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  const ss = parts.length > 2 ? Number(parts[2]) : 0;
  if (![hh, mm, ss].every(Number.isFinite)) return null;
  return { hh, mm, ss };
}

function getTimeString() {
  let h = picker.hour;
  if (state.hour12) {
    if (picker.ampm === 'AM') h = picker.hour === 12 ? 0 : picker.hour;
    else h = picker.hour === 12 ? 12 : picker.hour + 12;
  }
  return pad2(h) + ':' + pad2(picker.minute) + ':' + pad2(picker.second);
}

function setTimeFromString(value) {
  const parsed = parseTime(value);
  if (!parsed) return;
  if (state.hour12) {
    picker.ampm = parsed.hh >= 12 ? 'PM' : 'AM';
    picker.hour = parsed.hh % 12 === 0 ? 12 : parsed.hh % 12;
  } else {
    picker.hour = parsed.hh;
  }
  picker.minute = parsed.mm;
  picker.second = parsed.ss;
  syncHiddenTime();
  renderPicker();
}

function syncHiddenTime() {
  els.time.value = getTimeString();
}

function unitValue(unit) {
  if (unit === 'hour') return picker.hour;
  if (unit === 'minute') return picker.minute;
  return picker.second;
}

function unitRange(unit) {
  if (unit === 'hour') return hourRange();
  return { min: 0, max: 59 };
}

function stepUnit(unit, delta) {
  const range = unitRange(unit);
  const next = wrap(unitValue(unit) + delta, range.min, range.max);
  if (unit === 'hour') picker.hour = next;
  else if (unit === 'minute') picker.minute = next;
  else picker.second = next;
  syncHiddenTime();
  renderPicker();
  highlightPreset();
  updateHint();
  saveSettings();
}

function neighbor(unit, delta) {
  const range = unitRange(unit);
  return wrap(unitValue(unit) + delta, range.min, range.max);
}

function renderPicker() {
  ['hour', 'minute', 'second'].forEach((unit) => {
    const current = els.picker.querySelector('[data-display="' + unit + '"]');
    const prev = els.picker.querySelector('.wheel-prev[data-adj^="' + unit + '"]');
    const next = els.picker.querySelector('.wheel-next[data-adj^="' + unit + '"]');
    if (current) current.textContent = pad2(unitValue(unit));
    if (prev) prev.textContent = pad2(neighbor(unit, -1));
    if (next) next.textContent = pad2(neighbor(unit, 1));
    const view = els.picker.querySelector('[data-swipe="' + unit + '"]');
    if (view) {
      const range = unitRange(unit);
      view.setAttribute('aria-valuemin', String(range.min));
      view.setAttribute('aria-valuemax', String(range.max));
      view.setAttribute('aria-valuenow', String(unitValue(unit)));
      view.setAttribute('aria-valuetext', pad2(unitValue(unit)));
    }
  });
  els.picker.classList.toggle('is-24h', !state.hour12);
  els.picker.querySelectorAll('[data-ampm]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.ampm === picker.ampm));
  });
}

function computeTarget(dateStr, timeStr, now) {
  const parsed = parseTime(timeStr);
  if (!parsed) return null;
  const base = now || new Date();
  let year = base.getFullYear();
  let month = base.getMonth();
  let day = base.getDate();
  if (dateStr) {
    const bits = dateStr.split('-').map(Number);
    if (bits.length === 3 && bits.every(Number.isFinite)) {
      year = bits[0];
      month = bits[1] - 1;
      day = bits[2];
    }
  }
  const target = new Date(year, month, day, parsed.hh, parsed.mm, parsed.ss, 0);
  while (target.getTime() <= base.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function formatTarget(date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: state.hour12
  });
}

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.round(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (days) parts.push(days + 'd');
  if (days || hours) parts.push(hours + 'h');
  parts.push(minutes + 'm');
  parts.push(seconds + 's');
  return parts.join(' ');
}

function splitTime(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    totalSec,
    ms
  };
}

function updateHint() {
  const now = new Date();
  const target = computeTarget(els.date.value, getTimeString(), now);
  if (!target) {
    els.hint.textContent = 'Pick a time to see how long is left.';
    return;
  }
  const ms = target.getTime() - now.getTime();
  let extra = '';
  const todayISO = toISODate(now);
  const selectedToday = !els.date.value || els.date.value === todayISO;
  if (selectedToday && toISODate(target) !== todayISO) {
    extra = ' That time has already passed today, so it will run until tomorrow.';
  }
  els.hint.textContent = 'Counts down ' + formatDuration(ms) + ' to ' + formatTarget(target) + '.' + extra;
}

function applySoundUI() {
  els.sound.setAttribute('aria-pressed', String(state.soundOn));
  els.sound.querySelector('.icon-sound-on').classList.toggle('hidden', !state.soundOn);
  els.sound.querySelector('.icon-sound-off').classList.toggle('hidden', state.soundOn);
  els.settingSound.checked = state.soundOn;
}

function applyFullscreenUI() {
  const on = Boolean(document.fullscreenElement);
  els.fullscreen.setAttribute('aria-pressed', String(on));
  els.fullscreen.querySelector('.icon-enter-fs').classList.toggle('hidden', on);
  els.fullscreen.querySelector('.icon-exit-fs').classList.toggle('hidden', !on);
}

function applyToggleUI() {
  const paused = state.mode === 'paused';
  els.toggle.querySelector('.icon-pause').classList.toggle('hidden', paused);
  els.toggle.querySelector('.icon-play').classList.toggle('hidden', !paused);
  els.toggle.querySelector('.ctrl-label').textContent = paused ? 'Resume' : 'Pause';
  els.toggle.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  els.toggle.title = paused ? 'Resume (Space)' : 'Pause (Space)';
}

function setThemeColor(color) {
  if (els.themeMeta) els.themeMeta.setAttribute('content', color);
}

function showView(name) {
  els.setup.classList.toggle('hidden', name !== 'setup');
  els.timer.classList.toggle('hidden', name !== 'timer');
  els.ended.classList.toggle('hidden', name !== 'ended');
  const standby = name === 'timer' || name === 'ended';
  document.body.classList.toggle('standby', standby);
  els.app.classList.toggle('immersive', standby);
  setThemeColor(standby ? '#000000' : '#6d5efc');
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function createDigit(value) {
  const el = document.createElement('div');
  el.className = 'digit';
  el.dataset.value = value;
  el.innerHTML = '<span class="digit-out"></span><span class="digit-in"></span>';
  el.querySelector('.digit-in').textContent = value;
  return el;
}

function ensureDigits(pair, count) {
  const current = pair.querySelectorAll('.digit').length;
  if (current === count) return;
  pair.replaceChildren();
  for (let i = 0; i < count; i += 1) {
    pair.appendChild(createDigit('0'));
  }
}

function setDigit(el, nextValue, animate) {
  const next = String(nextValue);
  if (el.dataset.value === next && !el.classList.contains('is-animating')) return;
  const prev = el.dataset.value || '0';
  el.dataset.value = next;
  const out = el.querySelector('.digit-out');
  const inn = el.querySelector('.digit-in');
  if (!animate || prefersReducedMotion() || prev === next) {
    el.classList.remove('is-animating');
    inn.textContent = next;
    out.textContent = '';
    return;
  }
  out.textContent = prev;
  inn.textContent = next;
  el.classList.remove('is-animating');
  void el.offsetWidth;
  el.classList.add('is-animating');
  const done = (event) => {
    if (event && event.target !== inn) return;
    el.classList.remove('is-animating');
    inn.removeEventListener('animationend', done);
  };
  inn.addEventListener('animationend', done);
}

function renderPairs(values, animate) {
  Object.keys(values).forEach((unit) => {
    const pair = document.querySelector('[data-pair="' + unit + '"]');
    if (!pair) return;
    const digits = values[unit];
    ensureDigits(pair, digits.length);
    const cards = pair.querySelectorAll('.digit');
    for (let i = 0; i < cards.length; i += 1) {
      setDigit(cards[i], digits[i], animate);
    }
  });
}

function renderClock(ms, animate) {
  const parts = splitTime(ms);
  const showDays = parts.days > 0;
  els.clusterDays.classList.toggle('hidden', !showDays);
  els.colonDays.classList.toggle('hidden', !showDays);
  els.clock.classList.toggle('has-days', showDays);
  const values = {
    days: pad2(parts.days),
    hours: pad2(parts.hours),
    minutes: pad2(parts.minutes),
    seconds: pad2(parts.seconds)
  };
  renderPairs(values, animate);
  state.lastShown = values.days + values.hours + values.minutes + values.seconds;
}

function renderEndedClock(animate) {
  const now = new Date();
  let hours = now.getHours();
  let ampm = '';
  if (state.hour12) {
    ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
  }
  const values = {
    'ended-hours': pad2(hours),
    'ended-minutes': pad2(now.getMinutes()),
    'ended-seconds': pad2(now.getSeconds())
  };
  const key = values['ended-hours'] + values['ended-minutes'] + values['ended-seconds'] + ampm;
  renderPairs(values, animate && key !== state.endedKey && state.endedKey !== '');
  state.endedKey = key;
  if (ampm) {
    els.endedAmpm.textContent = ampm;
    els.endedAmpm.classList.remove('hidden');
  } else {
    els.endedAmpm.classList.add('hidden');
  }
  els.endedClock.classList.toggle('has-ampm', Boolean(ampm));
}

function updateProgress(remaining, total) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.min(1, Math.max(0, remaining / safeTotal));
  els.progressFill.style.transform = 'scaleX(' + ratio + ')';
  const warning = remaining <= 60 * 1000 && remaining > 0;
  const urgent = remaining <= 10 * 1000 && remaining > 0 && state.mode === 'running';
  els.progressRail.classList.toggle('is-warning', warning || urgent);
  els.timer.classList.toggle('is-warning', warning && !urgent);
  els.timer.classList.toggle('is-urgent', urgent);
}

function currentRemaining() {
  if (state.mode === 'paused') return state.remainingMs;
  if (!state.target) return 0;
  return state.target.getTime() - Date.now();
}

function tick() {
  if (state.mode === 'ended') {
    renderEndedClock(true);
    state.raf = window.requestAnimationFrame(tick);
    return;
  }
  const remaining = currentRemaining();
  if (remaining <= 0 && state.mode === 'running') {
    finishCountdown();
    return;
  }
  const display = Math.max(0, remaining);
  const parts = splitTime(display);
  const key = pad2(parts.days) + pad2(parts.hours) + pad2(parts.minutes) + pad2(parts.seconds);
  renderClock(display, key !== state.lastShown && state.lastShown !== '');
  updateProgress(display, state.totalMs);
  if (state.mode === 'running' || state.mode === 'paused') {
    state.raf = window.requestAnimationFrame(tick);
  }
}

function clearTimers() {
  if (state.raf) window.cancelAnimationFrame(state.raf);
  if (state.endTimeout) window.clearTimeout(state.endTimeout);
  state.raf = 0;
  state.endTimeout = 0;
}

function shouldHoldWakeLock() {
  return state.mode === 'running' || state.mode === 'paused' || state.mode === 'ended';
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {
      state.wakeLock = null;
    });
  } catch (err) {
    state.wakeLock = null;
  }
}

async function releaseWakeLock() {
  try {
    if (state.wakeLock) await state.wakeLock.release();
  } catch (err) {
    // ignore
  }
  state.wakeLock = null;
}

function scheduleEnd(remaining) {
  if (state.endTimeout) window.clearTimeout(state.endTimeout);
  state.endTimeout = window.setTimeout(() => {
    if (state.mode === 'running') finishCountdown();
  }, Math.max(0, remaining + 20));
}

function showChrome(temporary) {
  document.body.classList.remove('chrome-hidden');
  if (state.chromeTimer) window.clearTimeout(state.chromeTimer);
  state.chromeTimer = 0;
  const autoHide = temporary !== false && (state.mode === 'running' || state.mode === 'ended');
  if (autoHide) {
    state.chromeTimer = window.setTimeout(hideChrome, CHROME_HIDE_MS);
  }
}

function hideChrome() {
  if (state.mode === 'paused') return;
  if (els.dialog.open) return;
  if (state.mode !== 'running' && state.mode !== 'ended') return;
  document.body.classList.add('chrome-hidden');
}

function startCountdown(target, label, options) {
  const now = Date.now();
  state.target = target;
  state.totalMs = Math.max(0, target.getTime() - now);
  state.remainingMs = state.totalMs;
  state.label = label || 'Countdown';
  state.mode = 'running';
  state.lastShown = '';
  els.timerLabel.textContent = state.label;
  els.timerMeta.textContent = 'Until ' + formatTarget(target);
  showView('timer');
  applyToggleUI();
  renderClock(state.totalMs, false);
  updateProgress(state.totalMs, state.totalMs);
  clearTimers();
  state.raf = window.requestAnimationFrame(tick);
  scheduleEnd(state.totalMs);
  requestWakeLock();
  unlockAudio();
  maybeRequestNotification();
  if (options && options.hideChrome) hideChrome();
  else showChrome(true);
  if (options && options.fullscreen === false) return;
  maybeEnterFullscreen();
}

function pauseCountdown() {
  if (state.mode !== 'running') return;
  state.remainingMs = Math.max(0, currentRemaining());
  state.mode = 'paused';
  state.target = new Date(Date.now() + state.remainingMs);
  clearTimers();
  renderClock(state.remainingMs, false);
  updateProgress(state.remainingMs, state.totalMs);
  applyToggleUI();
  els.timerMeta.textContent = 'Paused · ' + formatDuration(state.remainingMs) + ' left';
  showChrome(false);
  requestWakeLock();
}

function resumeCountdown() {
  if (state.mode !== 'paused') return;
  state.target = new Date(Date.now() + state.remainingMs);
  state.mode = 'running';
  applyToggleUI();
  els.timerMeta.textContent = 'Until ' + formatTarget(state.target);
  clearTimers();
  state.raf = window.requestAnimationFrame(tick);
  scheduleEnd(state.remainingMs);
  requestWakeLock();
  unlockAudio();
  showChrome(true);
}

function resetToSetup() {
  state.mode = 'setup';
  state.target = null;
  clearTimers();
  if (state.chromeTimer) window.clearTimeout(state.chromeTimer);
  document.body.classList.remove('chrome-hidden');
  releaseWakeLock();
  stopConfetti();
  showView('setup');
  applyToggleUI();
  updateHint();
  maybeExitFullscreen();
}

function finishCountdown() {
  if (state.mode === 'ended') return;
  state.mode = 'ended';
  clearTimers();
  renderClock(0, true);
  updateProgress(0, state.totalMs);
  els.timer.classList.remove('is-urgent', 'is-warning');
  els.endedSub.textContent = state.label && state.label !== 'Countdown'
    ? state.label + ' ended · ' + formatTarget(state.target || new Date())
    : 'The time you set has arrived.';
  state.endedKey = '';
  renderEndedClock(false);
  showView('ended');
  hideChrome();
  requestWakeLock();
  state.raf = window.requestAnimationFrame(tick);
  launchConfetti();
  if (state.soundOn) playChime();
  notifyEnd();
  if (navigator.vibrate) navigator.vibrate([180, 80, 180, 80, 320]);
}

function unlockAudio() {
  if (!state.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    state.audioCtx = new Ctx();
  }
  if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume().catch(() => {});
  }
}

function playChime() {
  unlockAudio();
  const ctx = state.audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    const t = now + i * 0.13;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.75);
  });
}

function updateNotifyUI() {
  if (!('Notification' in window)) {
    els.notifyStatus.textContent = 'Notifications are not supported in this browser.';
    els.notifyBtn.disabled = true;
    els.notifyBtn.textContent = 'Unavailable';
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    els.notifyStatus.textContent = 'Enabled — you will get an alert when time is up.';
    els.notifyBtn.textContent = 'Enabled';
    els.notifyBtn.disabled = true;
  } else if (perm === 'denied') {
    els.notifyStatus.textContent = 'Blocked in the browser. Enable them from site settings if you want alerts.';
    els.notifyBtn.textContent = 'Blocked';
    els.notifyBtn.disabled = true;
  } else {
    els.notifyStatus.textContent = 'Get an alert if the tab is in the background.';
    els.notifyBtn.textContent = 'Enable';
    els.notifyBtn.disabled = false;
  }
}

function maybeRequestNotification() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(updateNotifyUI).catch(() => {});
  }
}

function notifyEnd() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const body = state.label && state.label !== 'Countdown'
      ? state.label + ' — time’s up.'
      : 'Your countdown has finished.';
    const iconUrl = new URL('./icons/icon-192.png', window.location.href).href;
    const n = new Notification('Countdown Timer', {
      body,
      icon: iconUrl,
      badge: iconUrl,
      silent: true
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.warn('Notification failed', err);
  }
}

function launchConfetti() {
  const canvas = els.confetti;
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const colors = ['#7c6eff', '#00d4c8', '#ffb020', '#ff5c7a', '#f4f6fb', '#c44cff'];
  const pieces = [];
  const count = prefersReducedMotion() ? 24 : 110;
  for (let i = 0; i < count; i += 1) {
    pieces.push({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.35,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      vx: -2.5 + Math.random() * 5,
      vy: 2 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: -0.18 + Math.random() * 0.36,
      color: colors[i % colors.length],
      shape: i % 3
    });
  }
  let started = performance.now();
  function frame(now) {
    const elapsed = now - started;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.vy += 0.04;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > window.innerHeight + 20 && elapsed < 1600) {
        p.y = -20;
        p.x = Math.random() * window.innerWidth;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = elapsed > 2200 ? Math.max(0, 1 - (elapsed - 2200) / 700) : 1;
      ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.h / 2);
        ctx.lineTo(p.w / 2, p.h / 2);
        ctx.lineTo(-p.w / 2, p.h / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
    if (elapsed < 3000) {
      state.confetti = { frame: window.requestAnimationFrame(frame), resize };
    } else {
      stopConfetti();
    }
  }
  window.addEventListener('resize', resize);
  state.confetti = { frame: window.requestAnimationFrame(frame), resize };
}

function stopConfetti() {
  if (!state.confetti) return;
  if (state.confetti.frame) window.cancelAnimationFrame(state.confetti.frame);
  if (state.confetti.resize) window.removeEventListener('resize', state.confetti.resize);
  const ctx = els.confetti.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, els.confetti.width, els.confetti.height);
  state.confetti = null;
}

function buildPresets() {
  DURATION_PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      const target = new Date(Date.now() + preset.ms);
      els.date.value = toISODate(target);
      setTimeFromString(
        pad2(target.getHours()) + ':' + pad2(target.getMinutes()) + ':' + pad2(target.getSeconds())
      );
      highlightPreset();
      updateHint();
      saveSettings();
    });
    els.presetsDuration.appendChild(btn);
  });

  TIME_PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.time = preset.time;
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      els.date.value = '';
      setTimeFromString(preset.time);
      highlightPreset();
      updateHint();
      saveSettings();
    });
    els.presetsTime.appendChild(btn);
  });
}

function highlightPreset() {
  const current = getTimeString();
  els.presetsTime.querySelectorAll('.chip').forEach((chip) => {
    const preset = chip.dataset.time;
    const match = (current === preset || current === preset + ':00' || current.slice(0, 8) === preset.slice(0, 8)) && !els.date.value;
    chip.setAttribute('aria-pressed', String(match));
  });
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function isTouchDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      const root = document.documentElement;
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    }
  } catch (err) {
    console.warn('Fullscreen failed', err);
  }
}

function maybeEnterFullscreen() {
  if (!isTouchDevice()) return;
  if (document.fullscreenElement) return;
  const root = document.documentElement;
  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!req) return;
  Promise.resolve(req.call(root)).catch(() => {});
}

function maybeExitFullscreen() {
  if (!document.fullscreenElement) return;
  if (!isTouchDevice()) return;
  document.exitFullscreen().catch(() => {});
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('Service worker registration failed', err);
  });
}

function setupInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    if (!isStandalone()) els.install.classList.remove('hidden');
  });
  els.install.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    try {
      await state.installPrompt.userChoice;
    } catch (err) {
      // ignore
    }
    state.installPrompt = null;
    els.install.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => {
    els.install.classList.add('hidden');
    state.installPrompt = null;
  });
  if (isStandalone()) els.install.classList.add('hidden');
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function bindRepeat(btn, fn) {
  let hold = 0;
  let delay = 0;
  const start = (event) => {
    if (event.button && event.button !== 0) return;
    event.preventDefault();
    fn();
    delay = window.setTimeout(() => {
      hold = window.setInterval(fn, 70);
    }, 380);
    const stop = () => {
      window.clearTimeout(delay);
      window.clearInterval(hold);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  btn.addEventListener('pointerdown', start);
}

function bindSwipe(el, onInc, onDec) {
  let lastY = 0;
  let acc = 0;
  let active = false;
  el.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    active = true;
    lastY = event.clientY;
    acc = 0;
    try { el.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
  });
  el.addEventListener('pointermove', (event) => {
    if (!active) return;
    const dy = event.clientY - lastY;
    lastY = event.clientY;
    acc += dy;
    while (acc <= -18) {
      onInc();
      acc += 18;
    }
    while (acc >= 18) {
      onDec();
      acc -= 18;
    }
  });
  const end = () => { active = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.deltaY > 0) onInc();
    else onDec();
  }, { passive: false });
  el.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onDec();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onInc();
    }
  });
}

function bindPicker() {
  els.picker.querySelectorAll('[data-step]').forEach((btn) => {
    const parts = btn.dataset.step.split(':');
    const unit = parts[0];
    const delta = Number(parts[1]);
    bindRepeat(btn, () => stepUnit(unit, delta));
  });
  els.picker.querySelectorAll('[data-adj]').forEach((el) => {
    el.addEventListener('click', () => {
      const parts = el.dataset.adj.split(':');
      stepUnit(parts[0], Number(parts[1]));
    });
  });
  ['hour', 'minute', 'second'].forEach((unit) => {
    const view = els.picker.querySelector('[data-swipe="' + unit + '"]');
    if (view) bindSwipe(view, () => stepUnit(unit, 1), () => stepUnit(unit, -1));
  });
  els.picker.querySelectorAll('[data-ampm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      picker.ampm = btn.dataset.ampm;
      syncHiddenTime();
      renderPicker();
      highlightPreset();
      updateHint();
      saveSettings();
    });
  });
}

function bindEvents() {
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const target = computeTarget(els.date.value, getTimeString(), new Date());
    if (!target) {
      els.hint.textContent = 'Please choose a time, for example 7:00:00 PM.';
      return;
    }
    saveSettings();
    startCountdown(target, els.label.value.trim() || 'Countdown');
  });

  els.date.addEventListener('input', () => {
    highlightPreset();
    updateHint();
    saveSettings();
  });
  els.date.addEventListener('change', () => {
    highlightPreset();
    updateHint();
    saveSettings();
  });
  els.label.addEventListener('change', saveSettings);

  els.toggle.addEventListener('click', () => {
    if (state.mode === 'running') pauseCountdown();
    else if (state.mode === 'paused') resumeCountdown();
    showChrome(state.mode === 'running');
  });
  els.reset.addEventListener('click', resetToSetup);

  els.ended.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    resetToSetup();
  });

  els.timer.addEventListener('pointerup', (event) => {
    if (event.target.closest('button')) return;
    if (document.body.classList.contains('chrome-hidden')) showChrome(true);
    else hideChrome();
  });

  document.addEventListener('mousemove', () => {
    if (state.mode === 'running' || state.mode === 'ended') showChrome(true);
  });

  const toggleSound = () => {
    state.soundOn = !state.soundOn;
    applySoundUI();
    saveSettings();
    if (state.soundOn) {
      unlockAudio();
      playChime();
    }
  };
  els.sound.addEventListener('click', toggleSound);
  els.settingSound.addEventListener('change', () => {
    state.soundOn = els.settingSound.checked;
    applySoundUI();
    saveSettings();
  });
  els.setting12h.addEventListener('change', () => {
    const current = getTimeString();
    state.hour12 = els.setting12h.checked;
    setTimeFromString(current);
    saveSettings();
    updateHint();
    highlightPreset();
    if (state.target && (state.mode === 'running' || state.mode === 'paused')) {
      els.timerMeta.textContent = state.mode === 'paused'
        ? 'Paused · ' + formatDuration(state.remainingMs) + ' left'
        : 'Until ' + formatTarget(state.target);
    }
  });

  els.fullscreen.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', applyFullscreenUI);

  els.settings.addEventListener('click', () => {
    updateNotifyUI();
    showChrome(false);
    els.dialog.showModal();
  });
  els.dialog.addEventListener('close', () => {
    if (state.mode === 'running') showChrome(true);
  });
  els.notifyBtn.addEventListener('click', () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(updateNotifyUI).catch(() => {});
  });

  document.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) return;
    if (els.dialog.open && event.key !== 'Escape') return;
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      if (state.mode === 'setup') els.form.requestSubmit();
      else if (state.mode === 'running') pauseCountdown();
      else if (state.mode === 'paused') resumeCountdown();
      else if (state.mode === 'ended') resetToSetup();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggleFullscreen();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      if (state.mode !== 'setup') resetToSetup();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (shouldHoldWakeLock()) requestWakeLock();
    if (state.mode === 'running' && currentRemaining() <= 0) finishCountdown();
  });
}

function init() {
  if (isStandalone()) document.body.classList.add('is-standalone');
  loadSettings();
  if (!els.time.value) setTimeFromString('19:00:00');
  else setTimeFromString(els.time.value);
  els.setting12h.checked = state.hour12;
  applySoundUI();
  applyFullscreenUI();
  applyToggleUI();
  renderPicker();
  bindPicker();
  buildPresets();
  highlightPreset();
  updateHint();
  updateNotifyUI();
  bindEvents();
  setupInstall();
  registerServiceWorker();
  window.setInterval(() => {
    if (state.mode === 'setup') updateHint();
  }, 1000);

  const params = new URLSearchParams(window.location.search);
  const preview = params.get('preview');
  if (preview === 'timer' || preview === 'ended') {
    const target = computeTarget(els.date.value, getTimeString(), new Date());
    if (target && preview === 'timer') {
      startCountdown(target, els.label.value.trim() || 'Dinner', { hideChrome: true, fullscreen: false });
    } else if (target && preview === 'ended') {
      state.target = new Date();
      state.label = els.label.value.trim() || 'Dinner';
      finishCountdown();
    }
  }
}

init();
