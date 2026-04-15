import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const REQUEST_TIMEOUT_MS = 9000;
const QUOTES_CACHE_KEY = 'mudrost-quotes-cache-v2';
const CURRENT_QUOTE_KEY = 'mudrost-current-quote-v2';
const QUOTES_CACHE_TTL_MS = 2 * 60 * 1000;

const state = {
  user: null,
  profile: null,
  currentQuote: null,
  currentVote: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  quoteText: $('quoteText'),
  quoteId: $('quoteId'),
  globalMessage: $('globalMessage'),
  themeBtn: $('themeBtn'),
  accountBtn: $('accountBtn'),
  refreshBtn: $('refreshBtn'),
  copyBtn: $('copyBtn'),
  shareBtn: $('shareBtn'),
  likeBtn: $('likeBtn'),
  dislikeBtn: $('dislikeBtn'),

  authModal: $('authModal'),
  accountModal: $('accountModal'),
  suggestionModal: $('suggestionModal'),
  favoritesModal: $('favoritesModal'),
  dislikedModal: $('dislikedModal'),

  authForm: $('authForm'),
  email: $('email'),
  password: $('password'),
  signInBtn: $('signInBtn'),
  signUpBtn: $('signUpBtn'),
  signOutBtn: $('signOutBtn'),
  authMessage: $('authMessage'),

  userEmail: $('userEmail'),
  adminLink: $('adminLink'),
  openSuggestionBtn: $('openSuggestionBtn'),
  openFavoritesBtn: $('openFavoritesBtn'),
  openDislikedBtn: $('openDislikedBtn'),
  showOnlyLikedToggle: $('showOnlyLikedToggle'),
  hideDislikedToggle: $('hideDislikedToggle'),

  suggestionForm: $('suggestionForm'),
  suggestionText: $('suggestionText'),
  suggestionBtn: $('suggestionBtn'),
  suggestionMessage: $('suggestionMessage'),

  favoritesList: $('favoritesList'),
  favoritesMessage: $('favoritesMessage'),
  dislikedList: $('dislikedList'),
  dislikedMessage: $('dislikedMessage'),
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
  const colors = {
    info: 'var(--muted)',
    success: 'var(--success)',
    error: 'var(--danger)',
  };
  el.style.color = colors[type] || colors.info;
}

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Неверная почта или пароль.';
  if (msg.includes('email not confirmed')) return 'Подтверждение почты всё ещё включено в Supabase.';
  if (msg.includes('user already registered')) return 'Пользователь с такой почтой уже зарегистрирован.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Не удалось подключиться к серверу.';
  if (msg.includes('timed out')) return 'Сервер отвечает слишком долго.';
  if (msg.includes('row-level security')) return 'Недостаточно прав для этого действия.';
  return error?.message || 'Что-то пошло не так.';
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('mudrost-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('mudrost-theme');
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
    return;
  }
  applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function getQuoteUrl(quoteId = state.currentQuote?.id) {
  const url = new URL(window.location.href);
  if (quoteId) {
    url.searchParams.set('quote', quoteId);
  } else {
    url.searchParams.delete('quote');
  }
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
  } catch (error) {
    console.warn('saveQuotesCache:', error);
  }
}

function readQuotesCache() {
  try {
    const raw = sessionStorage.getItem(QUOTES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !Array.isArray(parsed?.quotes)) return null;
    if (Date.now() - parsed.savedAt > QUOTES_CACHE_TTL_MS) return null;
    return parsed.quotes;
  } catch (error) {
    console.warn('readQuotesCache:', error);
    return null;
  }
}

function saveCurrentQuote(quote) {
  if (!quote?.id || !quote?.text) return;
  try {
    localStorage.setItem(CURRENT_QUOTE_KEY, JSON.stringify(quote));
  } catch (error) {
    console.warn('saveCurrentQuote:', error);
  }
}

function readCurrentQuote() {
  try {
    const raw = localStorage.getItem(CURRENT_QUOTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.text) return null;
    return parsed;
  } catch (error) {
    console.warn('readCurrentQuote:', error);
    return null;
  }
}

function showQuote(quote, syncUrl = true) {
  if (!quote) return;
  state.currentQuote = quote;
  if (els.quoteId) els.quoteId.value = quote.id;
  if (els.quoteText) els.quoteText.textContent = quote.text;
  saveCurrentQuote(quote);
  if (syncUrl) updateQuoteUrl(quote.id, true);
}

function restoreCachedQuoteToUI() {
  const quote = readCurrentQuote();
  if (!quote) return false;
  showQuote(quote, false);
  return true;
}

async function fetchApprovedQuotes() {
  const cached = readQuotesCache();
  if (cached?.length) return cached;
  const quotesRes = await withTimeout(
    supabase.from('quotes').select('id,text,status').eq('status', 'approved'),
    'load quotes'
  );
  if (quotesRes.error) throw quotesRes.error;
  const quotes = quotesRes.data || [];
  saveQuotesCache(quotes);
  return quotes;
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
  const paragraphs = String(text || '').split(/\n+/);
  const lines = [];
  paragraphs.forEach((paragraph, idx) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (idx < paragraphs.length - 1) lines.push('');
  });
  return lines;
}

async function generateShareImageBlob() {
  const quoteText = state.currentQuote?.text || '';
  const quoteUrl = getQuoteUrl();
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
  ctx.arc(180, 120, 200, 0, Math.PI * 2);
  ctx.fill();

  const cardX = 72;
  const cardY = 96;
  const cardW = 936;
  const cardH = 1158;
  ctx.save();
  roundedRect(ctx, cardX, cardY, cardW, cardH, 42);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, cardX + 56, cardY + 52, 78, 78, 24);
  ctx.fillStyle = primarySoft;
  ctx.fill();
  ctx.font = '48px Spectral';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = primary;
  ctx.fillText('✦', cardX + 95, cardY + 92);
  ctx.restore();

  ctx.fillStyle = muted;
  ctx.font = '600 36px Spectral';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Мудрость дня', cardX + 160, cardY + 103);

  ctx.fillStyle = text;
  ctx.font = '500 62px Spectral';
  const lines = wrapLines(ctx, `«${quoteText}»`, cardW - 140);
  const lineHeight = 84;
  const blockHeight = lines.length * lineHeight;
  let y = cardY + Math.max(280, (cardH - blockHeight) / 2 - 40);
  for (const line of lines) {
    ctx.fillText(line, cardX + 70, y);
    y += lineHeight;
  }

  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 70, cardY + cardH - 180);
  ctx.lineTo(cardX + cardW - 70, cardY + cardH - 180);
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = '400 28px Spectral';
  ctx.fillText(quoteUrl.replace(/^https?:\/\//, ''), cardX + 70, cardY + cardH - 115);
  ctx.fillStyle = primary;
  ctx.font = '600 30px Spectral';
  ctx.fillText('Мудрость дня', cardX + 70, cardY + cardH - 70);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob;
}

function updateAccountButton() {
  if (!els.accountBtn) return;
  const loggedIn = !!state.user;
  els.accountBtn.title = loggedIn ? 'Личный кабинет' : 'Войти';
  els.accountBtn.setAttribute('aria-label', loggedIn ? 'Личный кабинет' : 'Войти');
}

function updateAuthUI() {
  updateAccountButton();
  if (els.userEmail) els.userEmail.textContent = state.user?.email || '—';

  if (els.adminLink) {
    const isAdmin = state.profile?.role === 'admin';
    els.adminLink.classList.toggle('hidden-link', !isAdmin);
    els.adminLink.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  if (els.showOnlyLikedToggle) {
    els.showOnlyLikedToggle.checked = !!state.profile?.show_only_liked;
    els.showOnlyLikedToggle.disabled = !state.user;
  }

  if (els.hideDislikedToggle) {
    els.hideDislikedToggle.checked = !!state.profile?.hide_disliked;
    els.hideDislikedToggle.disabled = !state.user;
  }
}

function updateVoteButtons() {
  if (els.likeBtn) {
    const active = state.currentVote === 'like';
    els.likeBtn.classList.toggle('active', active);
    els.likeBtn.classList.toggle('like', active);
    els.likeBtn.disabled = false;
  }
  if (els.dislikeBtn) {
    const active = state.currentVote === 'dislike';
    els.dislikeBtn.classList.toggle('active', active);
    els.dislikeBtn.classList.toggle('dislike', active);
    els.dislikeBtn.disabled = false;
  }
}

function clearStoredSession() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.toLowerCase().includes('supabase')) localStorage.removeItem(key);
    });
    sessionStorage.clear();
  } catch (error) {
    console.warn('clearStoredSession:', error);
  }
}

async function ensureProfileExists() {
  if (!state.user) return;
  try {
    const { error } = await withTimeout(
      supabase.from('profiles').upsert(
        { id: state.user.id, email: state.user.email },
        { onConflict: 'id' }
      ),
      'ensure profile'
    );
    if (error) console.warn('ensureProfileExists:', error);
  } catch (error) {
    console.warn('ensureProfileExists timeout/fail:', error);
  }
}

async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    updateAuthUI();
    return;
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('id,email,role,hide_disliked,show_only_liked').eq('id', state.user.id).maybeSingle(),
      'load profile'
    );

    if (error) {
      console.warn('loadProfile:', error);
      state.profile = null;
    } else {
      state.profile = data || null;
    }
  } catch (error) {
    console.warn('loadProfile timeout/fail:', error);
    state.profile = null;
  }

  updateAuthUI();
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
      'load vote'
    );

    if (error) {
      console.warn('loadUserVote:', error);
      state.currentVote = null;
    } else {
      state.currentVote = data?.vote || null;
    }
  } catch (error) {
    console.warn('loadUserVote timeout/fail:', error);
    state.currentVote = null;
  }

  updateVoteButtons();
}

async function getVoteIds(voteType) {
  if (!state.user) return [];
  try {
    const { data, error } = await withTimeout(
      supabase.from('quote_votes').select('quote_id').eq('user_id', state.user.id).eq('vote', voteType),
      `load ${voteType} ids`
    );
    if (error) throw error;
    return (data || []).map((item) => item.quote_id).filter(Boolean);
  } catch (error) {
    console.warn(`getVoteIds ${voteType}:`, error);
    return [];
  }
}

async function loadRandomQuote() {
  setMessage(els.globalMessage, '');
  if (els.quoteText && !state.currentQuote?.text) els.quoteText.textContent = 'Загрузка цитаты...';

  try {
    const [quotes, likedIds, dislikedIds] = await Promise.all([
      fetchApprovedQuotes(),
      state.user && state.profile?.show_only_liked ? getVoteIds('like') : Promise.resolve([]),
      state.user && state.profile?.hide_disliked ? getVoteIds('dislike') : Promise.resolve([]),
    ]);

    let filteredQuotes = quotes || [];
    if (likedIds.length) {
      const likedSet = new Set(likedIds);
      filteredQuotes = filteredQuotes.filter((quote) => likedSet.has(quote.id));
    }
    if (dislikedIds.length) {
      const dislikedSet = new Set(dislikedIds);
      filteredQuotes = filteredQuotes.filter((quote) => !dislikedSet.has(quote.id));
    }

    if (!filteredQuotes.length) {
      state.currentQuote = null;
      state.currentVote = null;
      if (els.quoteText) {
        if (state.profile?.show_only_liked) {
          els.quoteText.textContent = 'В любимых пока пусто.';
        } else if (state.profile?.hide_disliked) {
          els.quoteText.textContent = 'Под подходящий фильтр пока ничего не осталось.';
        } else {
          els.quoteText.textContent = 'Пока нет опубликованных цитат.';
        }
      }
      updateVoteButtons();
      return;
    }

    const random = filteredQuotes[Math.floor(Math.random() * filteredQuotes.length)];
    showQuote(random, true);
    await loadUserVote(random.id);
  } catch (error) {
    console.warn('loadRandomQuote:', error);
    if (els.quoteText) els.quoteText.textContent = 'Не удалось загрузить цитаты.';
    state.currentQuote = null;
    state.currentVote = null;
    updateVoteButtons();
    setMessage(els.globalMessage, normalizeError(error), 'error');
  }
}

async function copyQuote() {
  if (!state.currentQuote?.text) return;
  try {
    await navigator.clipboard.writeText(state.currentQuote.text);
    setMessage(els.globalMessage, 'Скопировано.', 'success');
  } catch {
    setMessage(els.globalMessage, 'Не удалось скопировать.', 'error');
  }
}

async function shareQuote() {
  if (!state.currentQuote?.text) return;
  const quoteUrl = getQuoteUrl();
  const shareText = `«${state.currentQuote.text}»

${quoteUrl}`;

  if (navigator.share) {
    if (isMobileLikeDevice()) {
      try {
        const blob = await generateShareImageBlob();
        if (blob) {
          const file = new File([blob], `mudrost-${state.currentQuote.id}.png`, { type: 'image/png' });
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'Мудрость дня',
              text: shareText,
              files: [file],
            });
            return;
          }
        }
      } catch (error) {
        console.warn('mobile share image fallback:', error);
      }
    }

    try {
      await navigator.share({
        title: 'Мудрость дня',
        text: shareText,
      });
      return;
    } catch {
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(shareText);
    setMessage(els.globalMessage, 'Цитата и ссылка скопированы.', 'success');
  } catch {
    setMessage(els.globalMessage, 'Не удалось поделиться.', 'error');
  }
}

async function signIn() {
  const email = els.email?.value.trim();
  const password = els.password?.value || '';
  if (!email || !password) return setMessage(els.authMessage, 'Заполни почту и пароль.', 'error');

  els.signInBtn.disabled = true;
  els.signUpBtn.disabled = true;
  setMessage(els.authMessage, 'Пробуем войти...');

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      'sign in'
    );
    if (error) throw error;

    state.user = data.user || data.session?.user || null;
    closeModal(els.authModal);
    els.authForm?.reset();
    setMessage(els.authMessage, '');
    setMessage(els.globalMessage, 'Вход выполнен.', 'success');

    await Promise.allSettled([ensureProfileExists(), loadProfile(), loadUserVote(state.currentQuote?.id)]);
    await loadRandomQuote();
  } catch (error) {
    console.warn('signIn:', error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    els.signInBtn.disabled = false;
    els.signUpBtn.disabled = false;
  }
}

async function signUp() {
  const email = els.email?.value.trim();
  const password = els.password?.value || '';
  if (!email || !password) return setMessage(els.authMessage, 'Заполни почту и пароль.', 'error');

  els.signInBtn.disabled = true;
  els.signUpBtn.disabled = true;
  setMessage(els.authMessage, 'Создаём аккаунт...');

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signUp({ email, password }),
      'sign up'
    );
    if (error) throw error;

    state.user = data.user || data.session?.user || null;

    if (state.user) {
      closeModal(els.authModal);
      els.authForm?.reset();
      setMessage(els.authMessage, '');
      setMessage(els.globalMessage, 'Аккаунт создан.', 'success');
      await Promise.allSettled([ensureProfileExists(), loadProfile(), loadUserVote(state.currentQuote?.id)]);
      await loadRandomQuote();
    } else {
      setMessage(els.authMessage, 'Аккаунт создан, но в Supabase всё ещё включено подтверждение почты. Выключи Confirm email в настройках Auth.', 'info');
    }
  } catch (error) {
    console.warn('signUp:', error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    els.signInBtn.disabled = false;
    els.signUpBtn.disabled = false;
  }
}

async function signOutUser() {
  if (els.signOutBtn) els.signOutBtn.disabled = true;
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (error) {
    console.warn('signOutUser:', error);
  } finally {
    clearStoredSession();
    state.user = null;
    state.profile = null;
    state.currentVote = null;
    updateAuthUI();
    updateVoteButtons();
    closeModal(els.accountModal);
    window.location.href = new URL('./index.html', window.location.href).href;
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
    console.warn('applyVoteToQuote precheck:', error);
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
        supabase.from('quote_votes').upsert({
          quote_id: quoteId,
          user_id: state.user.id,
          vote: voteType,
        }, { onConflict: 'quote_id,user_id' }),
        'save vote'
      );
      if (error) throw error;
      if (state.currentQuote?.id === quoteId) state.currentVote = voteType;
    }

    if (state.currentQuote?.id === quoteId) updateVoteButtons();

    await Promise.allSettled([
      !els.favoritesModal.hidden ? openFavorites(true) : Promise.resolve(),
      !els.dislikedModal.hidden ? openDisliked(true) : Promise.resolve(),
    ]);

    if ((voteType === 'dislike' && state.profile?.hide_disliked) ||
        (voteType === 'like' && state.profile?.show_only_liked) ||
        currentVote === 'dislike' ||
        currentVote === 'like') {
      await loadRandomQuote();
    }

    return true;
  } catch (error) {
    console.warn('applyVoteToQuote save:', error);
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
  if (state.profile) state.profile[field] = value;

  try {
    const { error } = await withTimeout(
      supabase.from('profiles').update({ [field]: value }).eq('id', state.user.id),
      `save ${field}`
    );
    if (error) throw error;
    updateAuthUI();
    await loadRandomQuote();
    return true;
  } catch (error) {
    console.warn(`saveProfileSetting ${field}:`, error);
    setMessage(els.globalMessage, normalizeError(error), 'error');
    return false;
  }
}

function renderVoteList(targetEl, quotes, kind) {
  targetEl.innerHTML = quotes.map((quote) => {
    const currentVote = kind === 'like' ? 'like' : 'dislike';
    const likeActive = currentVote === 'like';
    const dislikeActive = currentVote === 'dislike';
    return `
      <article class="favorite-item" data-quote-id="${quote.id}">
        <p>${escapeHtml(quote.text)}</p>
        <div class="favorite-item__actions">
          <button class="icon-btn vote-btn ${likeActive ? 'active like' : ''}" type="button" data-vote-list="like" data-quote-id="${quote.id}" aria-label="Нравится" title="Нравится">
            <span class="material-symbols-outlined">thumb_up</span>
          </button>
          <button class="icon-btn vote-btn ${dislikeActive ? 'active dislike' : ''}" type="button" data-vote-list="dislike" data-quote-id="${quote.id}" aria-label="Не нравится" title="Не нравится">
            <span class="material-symbols-outlined">thumb_down</span>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

async function loadVoteList(kind) {
  const messageEl = kind === 'like' ? els.favoritesMessage : els.dislikedMessage;
  const listEl = kind === 'like' ? els.favoritesList : els.dislikedList;

  const idsRes = await withTimeout(
    supabase.from('quote_votes').select('quote_id').eq('user_id', state.user.id).eq('vote', kind),
    `load ${kind} ids`
  );
  if (idsRes.error) throw idsRes.error;

  const ids = (idsRes.data || []).map((item) => item.quote_id).filter(Boolean);
  if (!ids.length) {
    setMessage(messageEl, kind === 'like' ? 'Пока ничего не лайкала.' : 'Пока ничего не дизлайкала.');
    listEl.innerHTML = '';
    return;
  }

  const quotesRes = await withTimeout(
    supabase.from('quotes').select('id,text,status').in('id', ids).eq('status', 'approved'),
    `load ${kind} quotes`
  );
  if (quotesRes.error) throw quotesRes.error;

  const quotes = quotesRes.data || [];
  if (!quotes.length) {
    setMessage(messageEl, kind === 'like' ? 'Пока ничего не лайкала.' : 'Пока ничего не дизлайкала.');
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
    console.warn('openFavorites:', error);
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
    console.warn('openDisliked:', error);
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
      supabase.from('quote_suggestions').insert({
        text,
        user_id: state.user?.id || null,
      }),
      'send suggestion'
    );
    if (error) throw error;
    els.suggestionText.value = '';
    setMessage(els.suggestionMessage, 'Отправлено.', 'success');
  } catch (error) {
    console.warn('sendSuggestion:', error);
    setMessage(els.suggestionMessage, normalizeError(error), 'error');
  } finally {
    els.suggestionBtn.disabled = false;
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

    if (state.user && state.profile?.show_only_liked) {
      const likedIds = await getVoteIds('like');
      if (!likedIds.includes(data.id)) return false;
    }
    if (state.user && state.profile?.hide_disliked) {
      const dislikedIds = await getVoteIds('dislike');
      if (dislikedIds.includes(data.id)) return false;
    }

    showQuote(data, true);
    await loadUserVote(data.id);
    return true;
  } catch (error) {
    console.warn('loadQuoteById:', error);
    return false;
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

async function restoreSession() {
  try {
    const { data, error } = await withTimeout(supabase.auth.getSession(), 'get session');
    if (error) throw error;
    state.user = data?.session?.user || null;
  } catch (error) {
    console.warn('restoreSession:', error);
    state.user = null;
  }
}

function bindVoteListHandlers(container, kind) {
  container?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-vote-list]');
    if (!button) return;
    if (!state.user) return;

    const voteType = button.dataset.voteList;
    const quoteId = button.dataset.quoteId;
    button.disabled = true;
    try {
      const ok = await applyVoteToQuote(quoteId, voteType);
      if (ok) {
        if (kind === 'like') {
          await openFavorites(true);
          await openDisliked(true);
        } else {
          await openDisliked(true);
          await openFavorites(true);
        }
      }
    } finally {
      button.disabled = false;
    }
  });
}

function bindEvents() {
  bindModalEvents();

  els.themeBtn?.addEventListener('click', () => {
    applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
  });

  els.accountBtn?.addEventListener('click', async () => {
    if (state.user) {
      updateAuthUI();
      openModal(els.accountModal);
    } else {
      openModal(els.authModal);
    }
  });

  els.refreshBtn?.addEventListener('click', loadRandomQuote);
  els.copyBtn?.addEventListener('click', copyQuote);
  els.shareBtn?.addEventListener('click', shareQuote);
  els.likeBtn?.addEventListener('click', () => vote('like'));
  els.dislikeBtn?.addEventListener('click', () => vote('dislike'));

  els.signInBtn?.addEventListener('click', signIn);
  els.signUpBtn?.addEventListener('click', signUp);
  els.signOutBtn?.addEventListener('click', signOutUser);
  els.openSuggestionBtn?.addEventListener('click', () => openModal(els.suggestionModal));
  els.openFavoritesBtn?.addEventListener('click', () => openFavorites(false));
  els.openDislikedBtn?.addEventListener('click', () => openDisliked(false));

  els.showOnlyLikedToggle?.addEventListener('change', async () => {
    const previous = !!state.profile?.show_only_liked;
    const next = !!els.showOnlyLikedToggle.checked;
    const ok = await saveProfileSetting('show_only_liked', next);
    if (!ok && els.showOnlyLikedToggle) els.showOnlyLikedToggle.checked = previous;
  });

  els.hideDislikedToggle?.addEventListener('change', async () => {
    const previous = !!state.profile?.hide_disliked;
    const next = !!els.hideDislikedToggle.checked;
    const ok = await saveProfileSetting('hide_disliked', next);
    if (!ok && els.hideDislikedToggle) els.hideDislikedToggle.checked = previous;
  });

  els.suggestionBtn?.addEventListener('click', sendSuggestion);

  bindVoteListHandlers(els.favoritesList, 'like');
  bindVoteListHandlers(els.dislikedList, 'dislike');

  els.authForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    signIn();
  });
  els.suggestionForm?.addEventListener('submit', (event) => event.preventDefault());

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user || null;
    if (state.user) {
      await Promise.allSettled([ensureProfileExists(), loadProfile()]);
      await loadUserVote(state.currentQuote?.id);
    } else {
      state.profile = null;
      state.currentVote = null;
      updateAuthUI();
      updateVoteButtons();
    }
  });
}

async function init() {
  initTheme();
  bindEvents();
  await restoreSession();
  if (state.user) {
    await Promise.allSettled([ensureProfileExists(), loadProfile()]);
  } else {
    updateAuthUI();
  }
  const quoteFromUrl = new URL(window.location.href).searchParams.get('quote');
  const loadedById = quoteFromUrl ? await loadQuoteById(quoteFromUrl) : false;
  if (!loadedById) await loadRandomQuote();
}


window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled rejection:', event.reason);
});

document.addEventListener('DOMContentLoaded', init);
