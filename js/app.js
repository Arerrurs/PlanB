import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const REQUEST_TIMEOUT_MS = 12000;
const AUTH_TIMEOUT_MS = 22000;
const QUOTES_CACHE_KEY = 'mudrost-quotes-cache-v3';
const CURRENT_QUOTE_KEY = 'mudrost-current-quote-v3';
const QUOTES_CACHE_TTL_MS = 2 * 60 * 1000;
const THEME_KEY = 'mudrost-theme';
const LIGHT_ACCENT_KEY = 'mudrost-light-accent';
const DARK_ACCENT_KEY = 'mudrost-dark-accent';
const LIKED_FILTER_MODE_KEY = 'mudrost-liked-filter-mode';
const DISLIKED_FILTER_MODE_KEY = 'mudrost-disliked-filter-mode';
const TIMER_DISABLED_KEY = 'mudrost-disable-timer';
const CLICK_REFRESH_KEY = 'mudrost-click-refresh';
const USERNAME_CACHE_KEY = 'mudrost-profile-username';
const DEFAULT_LIGHT_ACCENT = '#a855f7';
const DEFAULT_DARK_ACCENT = '#f472b6';
const AUTO_REFRESH_MS = 60000;

const state = {
  user: null,
  profile: null,
  currentQuote: null,
  currentVote: null,
  autoRefreshAt: Date.now() + AUTO_REFRESH_MS,
  autoRefreshBusy: false,
  likedIds: null,
  dislikedIds: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  quoteCard: $('quoteCard'),
  quoteText: $('quoteText'),
  quoteId: $('quoteId'),
  globalMessage: $('globalMessage'),
  statsBtn: $('statsBtn'),
  themeBtn: $('themeBtn'),
  accountBtn: $('accountBtn'),
  refreshBtn: $('refreshBtn'),
  copyBtn: $('copyBtn'),
  shareBtn: $('shareBtn'),
  shareCardBtn: $('shareCardBtn'),
  likeBtn: $('likeBtn'),
  dislikeBtn: $('dislikeBtn'),

  authModal: $('authModal'),
  registerModal: $('registerModal'),
  accountModal: $('accountModal'),
  settingsModal: $('settingsModal'),
  suggestionModal: $('suggestionModal'),
  favoritesModal: $('favoritesModal'),
  dislikedModal: $('dislikedModal'),
  statsModal: $('statsModal'),
  recoveryModal: $('recoveryModal'),
  resetPasswordModal: $('resetPasswordModal'),

  authForm: $('authForm'),
  registerForm: $('registerForm'),
  identifier: $('identifier'),
  password: $('password'),
  registerEmail: $('registerEmail'),
  registerUsername: $('registerUsername'),
  registerPassword: $('registerPassword'),
  signInBtn: $('signInBtn'),
  signUpBtn: $('signUpBtn'),
  signOutBtn: $('signOutBtn'),
  openRegisterBtn: $('openRegisterBtn'),
  openLoginBtn: $('openLoginBtn'),
  openRecoveryBtn: $('openRecoveryBtn'),
  authMessage: $('authMessage'),
  registerMessage: $('registerMessage'),
  recoveryForm: $('recoveryForm'),
  recoveryIdentifier: $('recoveryIdentifier'),
  recoveryBtn: $('recoveryBtn'),
  recoveryMessage: $('recoveryMessage'),
  resetPasswordForm: $('resetPasswordForm'),
  resetPasswordInput: $('resetPasswordInput'),
  resetPasswordBtn: $('resetPasswordBtn'),
  resetPasswordMessage: $('resetPasswordMessage'),

  userEmail: $('userEmail'),
  settingsBtn: $('settingsBtn'),
  adminLink: $('adminLink'),
  openSuggestionBtn: $('openSuggestionBtn'),
  openFavoritesBtn: $('openFavoritesBtn'),
  openDislikedBtn: $('openDislikedBtn'),
  likedFilterControl: $('likedFilterControl'),
  dislikedFilterControl: $('dislikedFilterControl'),

  settingsForm: $('settingsForm'),
  settingsEmailStatic: $('settingsEmailStatic'),
  settingsEmailInput: $('settingsEmailInput'),
  settingsUsername: $('settingsUsername'),
  settingsPassword: $('settingsPassword'),
  disableTimerInput: $('disableTimerInput'),
  clickRefreshInput: $('clickRefreshInput'),
  lightAccentInput: $('lightAccentInput'),
  darkAccentInput: $('darkAccentInput'),
  saveSettingsBtn: $('saveSettingsBtn'),
  resetAccentBtn: $('resetAccentBtn'),
  settingsMessage: $('settingsMessage'),

  suggestionForm: $('suggestionForm'),
  suggestionText: $('suggestionText'),
  suggestionBtn: $('suggestionBtn'),
  suggestionMessage: $('suggestionMessage'),

  favoritesList: $('favoritesList'),
  favoritesMessage: $('favoritesMessage'),
  dislikedList: $('dislikedList'),
  dislikedMessage: $('dislikedMessage'),

  statsMessage: $('statsMessage'),
  topLikedText: $('topLikedText'),
  topLikedMeta: $('topLikedMeta'),
  topDislikedText: $('topDislikedText'),
  topDislikedMeta: $('topDislikedMeta'),
  minuteTimer: $('minuteTimer'),
};

function withTimeout(promise, label = 'request', ms = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

function setMessage(el, text = '', type = 'info') {
  if (!el) return;
  el.textContent = text;
  const colors = { info: 'var(--muted)', success: 'var(--success)', error: 'var(--danger)' };
  el.style.color = colors[type] || colors.info;
}

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Неверные почта, логин или пароль.';
  if (msg.includes('email not confirmed')) return 'Подтверждение почты всё ещё включено в Supabase.';
  if (msg.includes('user already registered')) return 'Пользователь с такой почтой уже зарегистрирован.';
  if (msg.includes('profiles_username') || msg.includes('duplicate key')) return 'Такой логин уже занят.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Не удалось подключиться к серверу.';
  if (msg.includes('timed out')) return 'Сервер отвечает слишком долго.';
  if (msg.includes('row-level security')) return 'Недостаточно прав для этого действия.';
  return error?.message || 'Что-то пошло не так.';
}


function isTimerDisabled() {
  const local = localStorage.getItem(TIMER_DISABLED_KEY);
  if (local === 'true' || local === 'false') return local === 'true';
  return !!state.profile?.disable_timer;
}

function setTimerDisabled(value) {
  localStorage.setItem(TIMER_DISABLED_KEY, value ? 'true' : 'false');
  if (state.profile) state.profile.disable_timer = !!value;
}

function isClickRefreshEnabled() {
  const local = localStorage.getItem(CLICK_REFRESH_KEY);
  if (local === 'true' || local === 'false') return local === 'true';
  return !!state.profile?.click_refresh_enabled;
}

function setClickRefreshEnabled(value) {
  localStorage.setItem(CLICK_REFRESH_KEY, value ? 'true' : 'false');
  if (state.profile) state.profile.click_refresh_enabled = !!value;
  els.quoteCard?.classList.toggle('click-refresh-enabled', !!value);
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function getIncomingAuthType() {
  try {
    const url = new URL(window.location.href);
    const queryType = url.searchParams.get('type');
    if (queryType) return queryType;
    if (window.location.hash.startsWith('#')) {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      return hash.get('type') || '';
    }
  } catch {}
  return '';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function isValidUsername(value) {
  return /^[a-z0-9._-]{3,24}$/.test(normalizeUsername(value));
}

async function resolveLoginEmail(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return raw.toLowerCase();
  const { data, error } = await withTimeout(supabase.rpc('resolve_login_email', { p_identifier: raw }), 'resolve login');
  if (error) throw error;
  return data || null;
}

function resetAutoRefreshDeadline() {
  state.autoRefreshAt = Date.now() + AUTO_REFRESH_MS;
  updateMinuteTimer();
}

function updateMinuteTimer() {
  if (!els.minuteTimer) return;
  if (isTimerDisabled()) {
    els.minuteTimer.textContent = 'таймер выкл';
    els.minuteTimer.classList.add('is-off');
    return;
  }
  els.minuteTimer.classList.remove('is-off');
  const remaining = Math.max(0, state.autoRefreshAt - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  els.minuteTimer.textContent = `${minutes}:${seconds}`;
}

function startAutoRefreshTicker() {
  updateMinuteTimer();
  window.setInterval(async () => {
    updateMinuteTimer();
    if (isTimerDisabled()) return;
    if (Date.now() < state.autoRefreshAt || state.autoRefreshBusy) return;
    state.autoRefreshBusy = true;
    try {
      await loadRandomQuote();
    } finally {
      state.autoRefreshBusy = false;
    }
  }, 1000);
}

function openModal(el) {
  if (!el) return;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(el) {
  if (!el) return;
  el.hidden = true;
  if ([...document.querySelectorAll('.modal')].every((modal) => modal.hidden)) {
    document.body.style.overflow = '';
  }
}

function hexToRgb(hex) {
  const value = hex.replace('#', '').trim();
  const normalized = value.length === 3 ? value.split('').map((x) => x + x).join('') : value;
  const int = Number.parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function setAccentCssVar(color) {
  const safe = color || DEFAULT_LIGHT_ACCENT;
  const { r, g, b } = hexToRgb(safe);
  document.documentElement.style.setProperty('--primary', safe);
  document.documentElement.style.setProperty('--primary-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
  document.body.style.setProperty('--primary', safe);
  document.body.style.setProperty('--primary-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
}

function getStoredAccent(theme) {
  return localStorage.getItem(theme === 'dark' ? DARK_ACCENT_KEY : LIGHT_ACCENT_KEY)
    || (theme === 'dark' ? DEFAULT_DARK_ACCENT : DEFAULT_LIGHT_ACCENT);
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
  setAccentCssVar(getStoredAccent(theme));
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const theme = savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
}

function syncThemeInputs() {
  if (els.lightAccentInput) els.lightAccentInput.value = getStoredAccent('light');
  if (els.darkAccentInput) els.darkAccentInput.value = getStoredAccent('dark');
}

function getFilterMode(kind) {
  const key = kind === 'like' ? LIKED_FILTER_MODE_KEY : DISLIKED_FILTER_MODE_KEY;
  const value = localStorage.getItem(key);
  return ['all', 'only', 'exclude'].includes(value) ? value : 'all';
}

function setFilterMode(kind, mode) {
  const key = kind === 'like' ? LIKED_FILTER_MODE_KEY : DISLIKED_FILTER_MODE_KEY;
  localStorage.setItem(key, ['all', 'only', 'exclude'].includes(mode) ? mode : 'all');
}

function syncFilterControls() {
  const likedMode = getFilterMode('like');
  const dislikedMode = getFilterMode('dislike');

  els.likedFilterControl?.querySelectorAll('[data-liked-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.likedMode === likedMode);
    btn.setAttribute('aria-pressed', btn.dataset.likedMode === likedMode ? 'true' : 'false');
  });

  els.dislikedFilterControl?.querySelectorAll('[data-disliked-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.dislikedMode === dislikedMode);
    btn.setAttribute('aria-pressed', btn.dataset.dislikedMode === dislikedMode ? 'true' : 'false');
  });
}

function cleanupUrlParams() {
  try {
    const url = new URL(window.location.href);
    const trash = ['logout', 'access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'sb'];
    let changed = false;
    for (const key of trash) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (window.location.hash && window.location.hash.includes('access_token=')) {
      url.hash = '';
      changed = true;
    }
    if (changed) {
      const query = url.searchParams.toString();
      const cleanUrl = `${url.pathname}${query ? `?${query}` : ''}${url.hash || ''}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  } catch (error) {
    console.warn('cleanupUrlParams:', error);
  }
}

function getQuoteUrl(quoteId = state.currentQuote?.id) {
  const url = new URL(window.location.href);
  ['logout', 'access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'sb'].forEach((key) => url.searchParams.delete(key));
  if (quoteId) url.searchParams.set('quote', quoteId);
  else url.searchParams.delete('quote');
  return url.toString();
}

function updateQuoteUrl(quoteId, replace = true) {
  const nextUrl = getQuoteUrl(quoteId);
  try {
    if (replace) window.history.replaceState({}, '', nextUrl);
    else window.history.pushState({}, '', nextUrl);
  } catch (error) {
    console.warn('updateQuoteUrl:', error);
  }
}

function saveQuotesCache(quotes) {
  try {
    sessionStorage.setItem(QUOTES_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), quotes }));
  } catch {}
}

function readQuotesCache() {
  try {
    const raw = sessionStorage.getItem(QUOTES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !Array.isArray(parsed?.quotes)) return null;
    if (Date.now() - parsed.savedAt > QUOTES_CACHE_TTL_MS) return null;
    return parsed.quotes;
  } catch {
    return null;
  }
}

function saveCurrentQuote(quote) {
  if (!quote?.id || !quote?.text) return;
  try {
    localStorage.setItem(CURRENT_QUOTE_KEY, JSON.stringify(quote));
  } catch {}
}

function readCurrentQuote() {
  try {
    const raw = localStorage.getItem(CURRENT_QUOTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.text) return null;
    return parsed;
  } catch {
    return null;
  }
}

function showQuote(quote, syncUrl = true) {
  if (!quote) return;
  state.currentQuote = quote;
  if (els.quoteText) els.quoteText.textContent = quote.text;
  if (els.quoteId) els.quoteId.value = quote.id;
  saveCurrentQuote(quote);
  resetAutoRefreshDeadline();
  if (syncUrl) updateQuoteUrl(quote.id);
}

function restoreCachedQuoteToUI() {
  const quote = readCurrentQuote();
  if (!quote) return false;
  showQuote(quote, false);
  return true;
}

function clearStoredSession() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.includes('supabase') || key === CURRENT_QUOTE_KEY || key === USERNAME_CACHE_KEY) localStorage.removeItem(key);
    });
    Object.keys(sessionStorage).forEach((key) => {
      if (key.includes('supabase') || key === QUOTES_CACHE_KEY) sessionStorage.removeItem(key);
    });
  } catch {}
}

function updateAccountButton() {
  const loggedIn = !!state.user;
  if (!els.accountBtn) return;
  els.accountBtn.title = loggedIn ? 'Личный кабинет' : 'Войти';
  els.accountBtn.setAttribute('aria-label', loggedIn ? 'Личный кабинет' : 'Войти');
}

function updateVoteButtons() {
  const vote = state.currentVote;
  els.likeBtn?.classList.toggle('active', vote === 'like');
  els.likeBtn?.classList.toggle('like', vote === 'like');
  els.dislikeBtn?.classList.toggle('active', vote === 'dislike');
  els.dislikeBtn?.classList.toggle('dislike', vote === 'dislike');
}

function getCachedUsername() {
  try { return (localStorage.getItem(USERNAME_CACHE_KEY) || '').trim(); } catch { return ''; }
}

function cacheUsername(username) {
  try {
    const clean = normalizeUsername(username || '');
    if (clean) localStorage.setItem(USERNAME_CACHE_KEY, clean);
    else localStorage.removeItem(USERNAME_CACHE_KEY);
  } catch {}
}

function getDisplayUsername() {
  return state.profile?.username || getCachedUsername() || normalizeUsername(state.user?.user_metadata?.username || '');
}

function updateAuthUI() {
  updateAccountButton();
  setMessage(els.authMessage, '');
  setMessage(els.settingsMessage, '');
  const displayUsername = getDisplayUsername();
  if (els.userEmail) els.userEmail.textContent = displayUsername ? `${displayUsername} · ${state.user?.email || '—'}` : (state.user?.email || '—');
  if (els.adminLink) els.adminLink.style.display = state.profile?.role === 'admin' ? 'block' : 'none';
  if (els.settingsEmailStatic) els.settingsEmailStatic.textContent = state.user?.email || '—';
  if (els.settingsEmailInput) els.settingsEmailInput.value = '';
  if (els.settingsUsername) els.settingsUsername.value = getDisplayUsername() || '';
  if (els.disableTimerInput) els.disableTimerInput.checked = isTimerDisabled();
  if (els.clickRefreshInput) els.clickRefreshInput.checked = isClickRefreshEnabled();
  els.quoteCard?.classList.toggle('click-refresh-enabled', isClickRefreshEnabled());
  syncThemeInputs();
  updateMinuteTimer();
  syncFilterControls();
}

async function ensureProfileExists() {
  if (!state.user) return;

  const { data: existing, error: selectError } = await withTimeout(
    supabase.from('profiles').select('id').eq('id', state.user.id).maybeSingle(),
    'ensure profile lookup'
  );
  if (selectError) throw selectError;
  if (existing?.id) { cacheUsername(state.user?.user_metadata?.username || ''); return; }

  const payload = {
    id: state.user.id,
    email: state.user.email,
    username: normalizeUsername(state.user?.user_metadata?.username || '') || null,
  };
  const { error } = await withTimeout(supabase.from('profiles').insert(payload), 'ensure profile insert');
  if (error) throw error;
  cacheUsername(payload.username);
}

async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    updateAuthUI();
    return;
  }

  const { data, error } = await withTimeout(
    supabase.from('profiles').select('id,email,username,role,hide_disliked,hide_liked,light_accent,dark_accent,disable_timer,click_refresh_enabled').eq('id', state.user.id).maybeSingle(),
    'load profile'
  );
  if (error) throw error;
  state.profile = data || null;

  cacheUsername(state.profile?.username || '');
  if (state.profile?.light_accent) localStorage.setItem(LIGHT_ACCENT_KEY, state.profile.light_accent);
  if (state.profile?.dark_accent) localStorage.setItem(DARK_ACCENT_KEY, state.profile.dark_accent);
  if (typeof state.profile?.disable_timer === 'boolean') localStorage.setItem(TIMER_DISABLED_KEY, state.profile.disable_timer ? 'true' : 'false');
  if (typeof state.profile?.click_refresh_enabled === 'boolean') localStorage.setItem(CLICK_REFRESH_KEY, state.profile.click_refresh_enabled ? 'true' : 'false');
  setAccentCssVar(getStoredAccent(document.body.classList.contains('dark') ? 'dark' : 'light'));
  updateAuthUI();
}

async function restoreSession() {
  try {
    const { data, error } = await withTimeout(supabase.auth.getSession(), 'get session');
    if (error) throw error;
    state.user = data?.session?.user || null;
  } catch {
    state.user = null;
  }
}

async function fetchApprovedQuotes() {
  const cached = readQuotesCache();
  if (cached?.length) return cached;
  const { data, error } = await withTimeout(
    supabase.from('quotes').select('id,text,status').eq('status', 'approved'),
    'load quotes'
  );
  if (error) throw error;
  const quotes = data || [];
  saveQuotesCache(quotes);
  return quotes;
}

async function loadUserVote(quoteId) {
  if (!state.user || !quoteId) {
    state.currentVote = null;
    updateVoteButtons();
    return;
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('quote_votes').select('vote').eq('quote_id', quoteId).eq('user_id', state.user.id).maybeSingle(),
      'load current vote'
    );
    if (error) throw error;
    state.currentVote = data?.vote || null;
  } catch {
    state.currentVote = null;
  }
  updateVoteButtons();
}

async function getVoteIds(kind, force = false) {
  if (!state.user) return [];
  if (!force) {
    if (kind === 'like' && state.likedIds) return state.likedIds;
    if (kind === 'dislike' && state.dislikedIds) return state.dislikedIds;
  }

  const { data, error } = await withTimeout(
    supabase.from('quote_votes').select('quote_id').eq('user_id', state.user.id).eq('vote', kind),
    `load ${kind} ids`
  );
  if (error) throw error;
  const ids = (data || []).map((item) => item.quote_id).filter(Boolean);
  if (kind === 'like') state.likedIds = ids;
  if (kind === 'dislike') state.dislikedIds = ids;
  return ids;
}

async function filterQuotesForUser(quotes) {
  if (!state.user) return quotes;
  let result = [...quotes];
  const likedMode = getFilterMode('like');
  const dislikedMode = getFilterMode('dislike');

  if (likedMode !== 'all') {
    const likedIds = await getVoteIds('like');
    result = likedMode === 'only'
      ? result.filter((quote) => likedIds.includes(quote.id))
      : result.filter((quote) => !likedIds.includes(quote.id));
  }

  if (dislikedMode !== 'all') {
    const dislikedIds = await getVoteIds('dislike');
    result = dislikedMode === 'only'
      ? result.filter((quote) => dislikedIds.includes(quote.id))
      : result.filter((quote) => !dislikedIds.includes(quote.id));
  }

  return result;
}

async function loadRandomQuote() {
  if (!state.currentQuote && !restoreCachedQuoteToUI()) {
    if (els.quoteText) els.quoteText.textContent = 'Загрузка цитаты...';
  }

  try {
    const quotes = await fetchApprovedQuotes();
    let pool = await filterQuotesForUser(quotes);
    if (!pool.length) pool = quotes;
    if (!pool.length) {
      if (els.quoteText) els.quoteText.textContent = 'Пока нет опубликованных цитат.';
      return;
    }

    const available = pool.filter((item) => item.id !== state.currentQuote?.id);
    const list = available.length ? available : pool;
    const selected = list[Math.floor(Math.random() * list.length)];
    showQuote(selected, true);
    await loadUserVote(selected.id);
  } catch (error) {
    console.warn('loadRandomQuote:', error);
    setMessage(els.globalMessage, normalizeError(error), 'error');
  }
}

async function loadQuoteById(quoteId) {
  if (!quoteId) return false;
  try {
    const { data, error } = await withTimeout(
      supabase.from('quotes').select('id,text,status').eq('id', quoteId).maybeSingle(),
      'load quote by id'
    );
    if (error) throw error;
    if (!data || data.status !== 'approved') return false;

    const filtered = await filterQuotesForUser([data]);
    if (!filtered.length) return false;

    showQuote(data, true);
    await loadUserVote(data.id);
    return true;
  } catch (error) {
    console.warn('loadQuoteById:', error);
    return false;
  }
}

async function copyQuote() {
  const shareText = `${state.currentQuote?.text || ''}\n\n${getQuoteUrl()}`;
  try {
    await navigator.clipboard.writeText(shareText.trim());
    setMessage(els.globalMessage, 'Цитата и ссылка скопированы.', 'success');
  } catch {
    setMessage(els.globalMessage, 'Не удалось скопировать.', 'error');
  }
}

function isMobileLikeDevice() {
  return window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text || '').split(/\n+/);
  for (const [index, paragraph] of paragraphs.entries()) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (index < paragraphs.length - 1) lines.push('');
  }
  return lines;
}

async function generateShareImageBlob() {
  const quoteText = state.currentQuote?.text || '';
  const styles = getComputedStyle(document.body);
  const bg = styles.getPropertyValue('--bg').trim() || '#120f1a';
  const surface = styles.getPropertyValue('--surface').trim() || '#191420';
  const border = styles.getPropertyValue('--border').trim() || '#3e314c';
  const text = styles.getPropertyValue('--text').trim() || '#f5f0f7';
  const muted = styles.getPropertyValue('--muted').trim() || '#bbaec3';
  const primary = styles.getPropertyValue('--primary').trim() || '#f472b6';
  const primarySoft = styles.getPropertyValue('--primary-soft').trim() || 'rgba(244,114,182,0.14)';

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = primarySoft;
  ctx.beginPath();
  ctx.arc(180, 120, 220, 0, Math.PI * 2);
  ctx.fill();

  const x = 72;
  const y = 96;
  const w = 936;
  const h = 1158;
  roundedRect(ctx, x, y, w, h, 42);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, x + 56, y + 52, 78, 78, 24);
  ctx.fillStyle = primarySoft;
  ctx.fill();
  ctx.font = '48px Spectral';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = primary;
  ctx.fillText('✦', x + 95, y + 92);
  ctx.restore();

  ctx.fillStyle = muted;
  ctx.font = '600 38px Spectral';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Мудрость дня', x + 164, y + 100);

  ctx.fillStyle = text;
  ctx.font = '600 64px Spectral';
  const textX = x + 84;
  const textY = y + 220;
  const lineHeight = 88;
  const lines = wrapLines(ctx, quoteText, w - 168);
  lines.slice(0, 10).forEach((line, index) => {
    ctx.fillText(line, textX, textY + index * lineHeight);
  });

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось создать изображение.'));
    }, 'image/png');
  });
}

async function shareQuoteText() {
  if (!state.currentQuote?.text) return;
  const quoteUrl = getQuoteUrl();
  const textOnly = `${state.currentQuote.text}

${quoteUrl}`;

  if (navigator.share && isMobileLikeDevice()) {
    try {
      await navigator.share({ text: textOnly });
      return;
    } catch {}
  }

  try {
    await navigator.clipboard.writeText(textOnly);
    setMessage(els.globalMessage, 'Цитата и ссылка скопированы.', 'success');
  } catch {
    setMessage(els.globalMessage, 'Не удалось поделиться.', 'error');
  }
}

async function shareQuoteCard() {
  if (!state.currentQuote?.text) return;
  try {
    const blob = await generateShareImageBlob();
    const file = new File([blob], 'mudrost-day-card.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'mudrost-day-card.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    setMessage(els.globalMessage, 'Карточка сохранена.', 'success');
  } catch (error) {
    console.warn('shareQuoteCard:', error);
    setMessage(els.globalMessage, 'Не удалось подготовить карточку.', 'error');
  }
}

async function persistUsername(username) {
  if (!state.user) return;
  const clean = normalizeUsername(username);
  if (!clean) return;
  const { error } = await withTimeout(
    supabase.from('profiles').update({ username: clean || null }).eq('id', state.user.id),
    'save username'
  );
  if (error) throw error;
  cacheUsername(clean);
}

async function sendRecoveryEmail() {
  const identifier = els.recoveryIdentifier?.value.trim();
  if (!identifier) return setMessage(els.recoveryMessage, 'Введите почту или логин.', 'error');

  els.recoveryBtn.disabled = true;
  setMessage(els.recoveryMessage, 'Отправляем письмо...');
  try {
    const email = await resolveLoginEmail(identifier);
    if (!email) throw new Error('Пользователь не найден.');
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(email, { redirectTo: getAuthRedirectUrl() }),
      'reset password email',
      AUTH_TIMEOUT_MS
    );
    if (error) throw error;
    setMessage(els.recoveryMessage, 'Письмо для восстановления отправлено.', 'success');
  } catch (error) {
    setMessage(els.recoveryMessage, normalizeError(error), 'error');
  } finally {
    els.recoveryBtn.disabled = false;
  }
}

async function saveRecoveredPassword() {
  const password = els.resetPasswordInput?.value || '';
  if (!password.trim()) return setMessage(els.resetPasswordMessage, 'Введите новый пароль.', 'error');

  els.resetPasswordBtn.disabled = true;
  setMessage(els.resetPasswordMessage, 'Сохраняем пароль...');
  try {
    const { data, error } = await withTimeout(
      supabase.auth.updateUser({ password }),
      'save recovered password',
      AUTH_TIMEOUT_MS
    );
    if (error) throw error;
    if (data?.user) state.user = data.user;
    setMessage(els.resetPasswordMessage, 'Пароль обновлён. Теперь можно войти.', 'success');
    els.resetPasswordForm?.reset();
    setTimeout(() => {
      closeModal(els.resetPasswordModal);
      openModal(els.authModal);
      cleanupUrlParams();
    }, 700);
  } catch (error) {
    setMessage(els.resetPasswordMessage, normalizeError(error), 'error');
  } finally {
    els.resetPasswordBtn.disabled = false;
  }
}

async function signIn() {
  const identifier = els.identifier?.value.trim();
  const password = els.password?.value.trim();
  if (!identifier || !password) return setMessage(els.authMessage, 'Заполните поле входа и пароль.', 'error');

  els.signInBtn.disabled = true;
  setMessage(els.authMessage, 'Пробуем войти...');

  try {
    const email = await resolveLoginEmail(identifier);
    if (!email) throw new Error('invalid login credentials');
    const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }), 'sign in', AUTH_TIMEOUT_MS);
    if (error) throw error;
    state.user = data.user || data.session?.user || null;
    closeModal(els.authModal);
    els.authForm?.reset();
    await Promise.allSettled([ensureProfileExists(), loadProfile(), loadUserVote(state.currentQuote?.id)]);
    await loadRandomQuote();
    setMessage(els.globalMessage, 'Вход выполнен.', 'success');
    setMessage(els.authMessage, '');
  } catch (error) {
    setMessage(els.authMessage, normalizeError(error), 'error');
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        state.user = data.session.user;
        closeModal(els.authModal);
        els.authForm?.reset();
        await Promise.allSettled([ensureProfileExists(), loadProfile(), loadUserVote(state.currentQuote?.id)]);
        await loadRandomQuote();
        setMessage(els.globalMessage, 'Вход выполнен.', 'success');
      }
    } catch {}
  } finally {
    els.signInBtn.disabled = false;
  }
}

async function signUp() {
  const email = els.registerEmail?.value.trim().toLowerCase();
  const username = normalizeUsername(els.registerUsername?.value);
  const password = els.registerPassword?.value || '';
  if (!email || !password || !username) return setMessage(els.registerMessage, 'Для регистрации нужны почта, логин и пароль.', 'error');
  if (!email.includes('@')) return setMessage(els.registerMessage, 'Для регистрации нужна корректная почта.', 'error');
  if (!isValidUsername(username)) return setMessage(els.registerMessage, 'Логин: 3–24 символа, латиница, цифры, точка, дефис или _.', 'error');

  els.signUpBtn.disabled = true;
  setMessage(els.registerMessage, 'Создаём аккаунт...');

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signUp({ email, password, options: { data: { username } } }),
      'sign up',
      AUTH_TIMEOUT_MS
    );
    if (error) throw error;
    state.user = data.user || data.session?.user || null;

    if (state.user) {
      await ensureProfileExists();
      cacheUsername(username);
      await persistUsername(username);
      closeModal(els.registerModal);
      els.registerForm?.reset();
      setMessage(els.globalMessage, 'Аккаунт создан.', 'success');
      await Promise.allSettled([loadProfile(), loadUserVote(state.currentQuote?.id)]);
      await loadRandomQuote();
    } else {
      setMessage(els.registerMessage, 'Аккаунт создан. Если подтверждение почты включено, завершите его в письме.', 'info');
    }
  } catch (error) {
    setMessage(els.registerMessage, normalizeError(error), 'error');
    try {
      const resolved = await resolveLoginEmail(email);
      if (resolved) {
        setMessage(els.registerMessage, 'Аккаунт, возможно, уже создан. Попробуйте войти.', 'info');
      }
    } catch {}
  } finally {
    els.signUpBtn.disabled = false;
  }
}

let isSigningOut = false;

async function signOutUser() {
  if (isSigningOut) return;
  isSigningOut = true;
  if (els.signOutBtn) els.signOutBtn.disabled = true;
  try {
    await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((resolve) => setTimeout(resolve, 2500))]);
  } catch {}
  finally {
    clearStoredSession();
    state.user = null;
    state.profile = null;
    state.currentVote = null;
    state.likedIds = null;
    state.dislikedIds = null;
    updateAuthUI();
    updateVoteButtons();
    closeModal(els.accountModal);
    cleanupUrlParams();
    window.location.replace(new URL('./index.html', window.location.href).pathname);
    isSigningOut = false;
  }
}

async function applyVoteToQuote(quoteId, voteType) {
  if (!state.user || !quoteId) return false;

  let currentVote = null;
  try {
    const { data, error } = await withTimeout(
      supabase.from('quote_votes').select('vote').eq('quote_id', quoteId).eq('user_id', state.user.id).maybeSingle(),
      'get current vote'
    );
    if (error) throw error;
    currentVote = data?.vote || null;
  } catch (error) {
    setMessage(els.globalMessage, normalizeError(error), 'error');
    return false;
  }

  try {
    if (currentVote === voteType) {
      const { error } = await withTimeout(
        supabase.from('quote_votes').delete().eq('quote_id', quoteId).eq('user_id', state.user.id),
        'delete vote'
      );
      if (error) throw error;
      if (state.currentQuote?.id === quoteId) state.currentVote = null;
    } else {
      const { error } = await withTimeout(
        supabase.from('quote_votes').upsert({ quote_id: quoteId, user_id: state.user.id, vote: voteType }, { onConflict: 'quote_id,user_id' }),
        'save vote'
      );
      if (error) throw error;
      if (state.currentQuote?.id === quoteId) state.currentVote = voteType;
    }

    state.likedIds = null;
    state.dislikedIds = null;
    if (state.currentQuote?.id === quoteId) updateVoteButtons();

    await Promise.allSettled([
      !els.favoritesModal.hidden ? openFavorites(true) : Promise.resolve(),
      !els.dislikedModal.hidden ? openDisliked(true) : Promise.resolve(),
    ]);

    if (currentVote === 'like' || currentVote === 'dislike' || getFilterMode('like') !== 'all' || getFilterMode('dislike') !== 'all') {
      await loadRandomQuote();
    }
    return true;
  } catch (error) {
    setMessage(els.globalMessage, normalizeError(error), 'error');
    return false;
  }
}

async function vote(voteType) {
  if (!state.user) {
    setMessage(els.globalMessage, 'Сначала зарегистрируйтесь или войдите.', 'info');
    openModal(els.authModal);
    return;
  }
  if (!state.currentQuote?.id) return;

  els.likeBtn.disabled = true;
  els.dislikeBtn.disabled = true;
  try {
    await applyVoteToQuote(state.currentQuote.id, voteType);
  } finally {
    els.likeBtn.disabled = false;
    els.dislikeBtn.disabled = false;
  }
}

async function saveProfileSetting(field, value) {
  if (!state.user) return false;
  try {
    const { error } = await withTimeout(
      supabase.from('profiles').update({ [field]: value }).eq('id', state.user.id),
      `save ${field}`
    );
    if (error) throw error;
    if (state.profile) state.profile[field] = value;
    updateAuthUI();
    await loadRandomQuote();
    return true;
  } catch (error) {
    setMessage(els.globalMessage, normalizeError(error), 'error');
    return false;
  }
}

function renderVoteList(targetEl, quotes, activeVote) {
  targetEl.innerHTML = quotes.map((quote) => `
    <article class="favorite-item" data-quote-id="${quote.id}">
      <p>${escapeHtml(quote.text)}</p>
      <div class="favorite-item__actions">
        <button class="icon-btn vote-btn ${activeVote === 'like' ? 'active like' : ''}" type="button" data-vote-list="like" data-quote-id="${quote.id}" aria-label="Нравится" title="Нравится">
          <span class="material-symbols-outlined">thumb_up</span>
        </button>
        <button class="icon-btn vote-btn ${activeVote === 'dislike' ? 'active dislike' : ''}" type="button" data-vote-list="dislike" data-quote-id="${quote.id}" aria-label="Не нравится" title="Не нравится">
          <span class="material-symbols-outlined">thumb_down</span>
        </button>
      </div>
    </article>
  `).join('');
}

async function loadVoteList(kind) {
  const messageEl = kind === 'like' ? els.favoritesMessage : els.dislikedMessage;
  const listEl = kind === 'like' ? els.favoritesList : els.dislikedList;
  const ids = await getVoteIds(kind, true);

  if (!ids.length) {
    setMessage(messageEl, kind === 'like' ? 'Пока нет лайкнутых цитат.' : 'Пока нет дизлайкнутых цитат.');
    listEl.innerHTML = '';
    return;
  }

  const { data, error } = await withTimeout(
    supabase.from('quotes').select('id,text,status').in('id', ids).eq('status', 'approved'),
    `load ${kind} quotes`
  );
  if (error) throw error;

  const quotes = data || [];
  if (!quotes.length) {
    setMessage(messageEl, kind === 'like' ? 'Пока нет лайкнутых цитат.' : 'Пока нет дизлайкнутых цитат.');
    listEl.innerHTML = '';
    return;
  }

  setMessage(messageEl, '');
  renderVoteList(listEl, quotes, kind);
}

async function openFavorites(refreshOnly = false) {
  if (!state.user) {
    setMessage(els.globalMessage, 'Сначала зарегистрируйтесь или войдите.', 'info');
    openModal(els.authModal);
    return;
  }
  if (!refreshOnly) {
    setMessage(els.favoritesMessage, 'Загружаем...');
    openModal(els.favoritesModal);
  }
  try {
    await loadVoteList('like');
  } catch (error) {
    setMessage(els.favoritesMessage, normalizeError(error), 'error');
  }
}

async function openDisliked(refreshOnly = false) {
  if (!state.user) {
    setMessage(els.globalMessage, 'Сначала зарегистрируйтесь или войдите.', 'info');
    openModal(els.authModal);
    return;
  }
  if (!refreshOnly) {
    setMessage(els.dislikedMessage, 'Загружаем...');
    openModal(els.dislikedModal);
  }
  try {
    await loadVoteList('dislike');
  } catch (error) {
    setMessage(els.dislikedMessage, normalizeError(error), 'error');
  }
}

async function sendSuggestion() {
  const text = els.suggestionText?.value.trim();
  if (!text) return setMessage(els.suggestionMessage, 'Напиши цитату.', 'error');

  els.suggestionBtn.disabled = true;
  setMessage(els.suggestionMessage, 'Отправляем...');
  try {
    const { error } = await withTimeout(
      supabase.from('quote_suggestions').insert({ text, user_id: state.user?.id || null }),
      'send suggestion'
    );
    if (error) throw error;
    els.suggestionText.value = '';
    setMessage(els.suggestionMessage, 'Отправлено.', 'success');
  } catch (error) {
    setMessage(els.suggestionMessage, normalizeError(error), 'error');
  } finally {
    els.suggestionBtn.disabled = false;
  }
}

async function saveSettings() {
  if (!state.user) return;
  const nextPassword = els.settingsPassword?.value.trim();
  const nextUsername = normalizeUsername(els.settingsUsername?.value);
  const nextEmail = els.settingsEmailInput?.value.trim().toLowerCase();
  const disableTimer = !!els.disableTimerInput?.checked;
  const clickRefreshEnabled = !!els.clickRefreshInput?.checked;
  const lightAccent = els.lightAccentInput?.value || DEFAULT_LIGHT_ACCENT;
  const darkAccent = els.darkAccentInput?.value || DEFAULT_DARK_ACCENT;

  els.saveSettingsBtn.disabled = true;
  if (nextUsername && !isValidUsername(nextUsername)) {
    setMessage(els.settingsMessage, 'Логин: 3–24 символа, латиница, цифры, точка, дефис или _.', 'error');
    els.saveSettingsBtn.disabled = false;
    return;
  }

  setMessage(els.settingsMessage, 'Сохраняем...');

  try {
    if (nextPassword) {
      const { data, error } = await withTimeout(supabase.auth.updateUser({ password: nextPassword }), 'update password', AUTH_TIMEOUT_MS);
      if (error) throw error;
      if (data?.user) state.user = data.user;
    }

    if (nextEmail && nextEmail !== (state.user?.email || '').toLowerCase()) {
      const { error: emailError } = await withTimeout(supabase.auth.updateUser({ email: nextEmail }, { emailRedirectTo: getAuthRedirectUrl() }), 'update email', AUTH_TIMEOUT_MS);
      if (emailError) throw emailError;
    }

    localStorage.setItem(LIGHT_ACCENT_KEY, lightAccent);
    localStorage.setItem(DARK_ACCENT_KEY, darkAccent);
    setTimerDisabled(disableTimer);
    setClickRefreshEnabled(clickRefreshEnabled);

    const profileUpdate = {
      email: state.user?.email || state.profile?.email || null,
      username: nextUsername || state.profile?.username || null,
      light_accent: lightAccent,
      dark_accent: darkAccent,
      disable_timer: disableTimer,
      click_refresh_enabled: clickRefreshEnabled,
    };

    const { error: profileError } = await withTimeout(
      supabase.from('profiles').update(profileUpdate).eq('id', state.user.id),
      'update profile settings'
    );
    if (profileError) throw profileError;

    await loadProfile();
    setAccentCssVar(getStoredAccent(document.body.classList.contains('dark') ? 'dark' : 'light'));
    updateMinuteTimer();
    const emailNotice = nextEmail && nextEmail !== (state.user?.email || '').toLowerCase()
      ? ' Письмо для подтверждения новой почты уже отправлено.'
      : '';
    setMessage(els.settingsMessage, `Настройки сохранены.${emailNotice}`, 'success');
    if (els.settingsPassword) els.settingsPassword.value = '';
    if (els.settingsEmailInput) els.settingsEmailInput.value = '';
  } catch (error) {
    setMessage(els.settingsMessage, normalizeError(error), 'error');
  } finally {
    els.saveSettingsBtn.disabled = false;
  }
}

async function resetAccents() {
  if (els.lightAccentInput) els.lightAccentInput.value = DEFAULT_LIGHT_ACCENT;
  if (els.darkAccentInput) els.darkAccentInput.value = DEFAULT_DARK_ACCENT;
  localStorage.setItem(LIGHT_ACCENT_KEY, DEFAULT_LIGHT_ACCENT);
  localStorage.setItem(DARK_ACCENT_KEY, DEFAULT_DARK_ACCENT);
  setAccentCssVar(getStoredAccent(document.body.classList.contains('dark') ? 'dark' : 'light'));
  if (state.user) {
    await saveSettings();
  }
}

async function loadStatsModal() {
  setMessage(els.statsMessage, 'Загружаем...');
  openModal(els.statsModal);

  try {
    const [votesRes, quotesRes] = await Promise.all([
      withTimeout(supabase.from('quote_votes').select('quote_id,vote'), 'load vote stats'),
      withTimeout(supabase.from('quotes').select('id,text,status').eq('status', 'approved'), 'load stats quotes'),
    ]);
    if (votesRes.error) throw votesRes.error;
    if (quotesRes.error) throw quotesRes.error;

    const counts = new Map();
    for (const row of votesRes.data || []) {
      const item = counts.get(row.quote_id) || { likes: 0, dislikes: 0 };
      if (row.vote === 'like') item.likes += 1;
      if (row.vote === 'dislike') item.dislikes += 1;
      counts.set(row.quote_id, item);
    }

    const quotes = new Map((quotesRes.data || []).map((quote) => [quote.id, quote]));
    let topLiked = null;
    let topDisliked = null;

    for (const [id, stat] of counts.entries()) {
      if (!quotes.has(id)) continue;
      if (!topLiked || stat.likes > topLiked.count) topLiked = { id, count: stat.likes };
      if (!topDisliked || stat.dislikes > topDisliked.count) topDisliked = { id, count: stat.dislikes };
    }
    const littleDataText = 'Сейчас мало данных для статистики, зайдите позже';

    if (topLiked && quotes.get(topLiked.id) && topLiked.count > 0) {
      els.topLikedText.textContent = quotes.get(topLiked.id).text;
      els.topLikedMeta.textContent = `${topLiked.count} лайков`;
    } else {
      els.topLikedText.textContent = littleDataText;
      els.topLikedMeta.textContent = '—';
    }

    if (topDisliked && quotes.get(topDisliked.id) && topDisliked.count > 0) {
      els.topDislikedText.textContent = quotes.get(topDisliked.id).text;
      els.topDislikedMeta.textContent = `${topDisliked.count} дизлайков`;
    } else {
      els.topDislikedText.textContent = littleDataText;
      els.topDislikedMeta.textContent = '—';
    }

    setMessage(els.statsMessage, '');
  } catch (error) {
    setMessage(els.statsMessage, normalizeError(error), 'error');
  }
}

function bindModalEvents() {
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(document.getElementById(el.dataset.close)));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.modal').forEach((modal) => {
      if (!modal.hidden) closeModal(modal);
    });
  });
}

function bindVoteListHandlers(container) {
  container?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-vote-list]');
    if (!button || !state.user) return;
    const voteType = button.dataset.voteList;
    const quoteId = button.dataset.quoteId;
    button.disabled = true;
    try {
      const ok = await applyVoteToQuote(quoteId, voteType);
      if (ok) {
        await Promise.allSettled([openFavorites(true), openDisliked(true)]);
      }
    } finally {
      button.disabled = false;
    }
  });
}

function bindEvents() {
  bindModalEvents();

  els.themeBtn?.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  els.statsBtn?.addEventListener('click', loadStatsModal);

  els.quoteCard?.addEventListener('click', (event) => {
    if (!isClickRefreshEnabled()) return;
    const interactive = event.target.closest('button, a, input, textarea, label, select');
    if (interactive) return;
    loadRandomQuote();
  });

  els.accountBtn?.addEventListener('click', () => {
    if (state.user) {
      updateAuthUI();
      openModal(els.accountModal);
    } else {
      openModal(els.authModal);
    }
  });

  els.openRegisterBtn?.addEventListener('click', () => {
    closeModal(els.authModal);
    setMessage(els.authMessage, '');
    openModal(els.registerModal);
  });

  els.openLoginBtn?.addEventListener('click', () => {
    closeModal(els.registerModal);
    setMessage(els.registerMessage, '');
    openModal(els.authModal);
  });

  els.openRecoveryBtn?.addEventListener('click', () => {
    closeModal(els.authModal);
    setMessage(els.authMessage, '');
    setMessage(els.recoveryMessage, '');
    openModal(els.recoveryModal);
  });

  els.settingsBtn?.addEventListener('click', () => {
    updateAuthUI();
    openModal(els.settingsModal);
  });

  els.refreshBtn?.addEventListener('click', loadRandomQuote);
  els.copyBtn?.addEventListener('click', copyQuote);
  els.shareBtn?.addEventListener('click', shareQuoteText);
  els.shareCardBtn?.addEventListener('click', shareQuoteCard);
  els.likeBtn?.addEventListener('click', () => vote('like'));
  els.dislikeBtn?.addEventListener('click', () => vote('dislike'));

  els.signInBtn?.addEventListener('click', signIn);
  els.signUpBtn?.addEventListener('click', signUp);
  els.recoveryBtn?.addEventListener('click', sendRecoveryEmail);
  els.resetPasswordBtn?.addEventListener('click', saveRecoveredPassword);
  els.signOutBtn?.addEventListener('click', signOutUser);
  els.openSuggestionBtn?.addEventListener('click', () => openModal(els.suggestionModal));
  els.openFavoritesBtn?.addEventListener('click', () => openFavorites(false));
  els.openDislikedBtn?.addEventListener('click', () => openDisliked(false));

  els.likedFilterControl?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-liked-mode]');
    if (!button) return;
    setFilterMode('like', button.dataset.likedMode);
    syncFilterControls();
    await Promise.allSettled([openFavorites(true), loadRandomQuote()]);
  });

  els.dislikedFilterControl?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-disliked-mode]');
    if (!button) return;
    setFilterMode('dislike', button.dataset.dislikedMode);
    syncFilterControls();
    await Promise.allSettled([openDisliked(true), loadRandomQuote()]);
  });

  els.saveSettingsBtn?.addEventListener('click', saveSettings);
  els.resetAccentBtn?.addEventListener('click', resetAccents);
  els.suggestionBtn?.addEventListener('click', sendSuggestion);

  bindVoteListHandlers(els.favoritesList);
  bindVoteListHandlers(els.dislikedList);

  els.authForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    signIn();
  });
  els.registerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    signUp();
  });
  els.settingsForm?.addEventListener('submit', (event) => event.preventDefault());
  els.suggestionForm?.addEventListener('submit', (event) => event.preventDefault());
  els.recoveryForm?.addEventListener('submit', (event) => { event.preventDefault(); sendRecoveryEmail(); });
  els.resetPasswordForm?.addEventListener('submit', (event) => { event.preventDefault(); saveRecoveredPassword(); });

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (isSigningOut) return;
    state.user = session?.user || null;
    state.likedIds = null;
    state.dislikedIds = null;
    if (state.user) {
      await Promise.allSettled([ensureProfileExists(), loadProfile(), loadUserVote(state.currentQuote?.id)]);
    } else {
      state.profile = null;
      state.currentVote = null;
      updateAuthUI();
      updateVoteButtons();
    }
  });
}

async function init() {
  const incomingAuthType = getIncomingAuthType();
  initTheme();
  syncThemeInputs();
  syncFilterControls();
  bindEvents();
  startAutoRefreshTicker();
  restoreCachedQuoteToUI();
  updateMinuteTimer();
  await restoreSession();
  cleanupUrlParams();
  if (state.user) {
    await Promise.allSettled([ensureProfileExists(), loadProfile()]);
  } else {
    updateAuthUI();
  }

  const quoteFromUrl = new URL(window.location.href).searchParams.get('quote');
  const loadedById = quoteFromUrl ? await loadQuoteById(quoteFromUrl) : false;
  if (!loadedById) await loadRandomQuote();

  if (incomingAuthType === 'recovery' && state.user) {
    setMessage(els.resetPasswordMessage, '');
    openModal(els.resetPasswordModal);
  }
}

window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled rejection:', event.reason);
});

document.addEventListener('DOMContentLoaded', init);
