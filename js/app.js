import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const state = {
  session: null,
  user: null,
  currentQuote: null,
  currentVote: null,
  profile: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  quoteText: $('quoteText'),
  quoteId: $('quoteId'),
  quoteLikes: $('quoteLikes'),
  quoteDislikes: $('quoteDislikes'),

  refreshBtn: $('refreshBtn'),
  copyBtn: $('copyBtn'),
  shareBtn: $('shareBtn'),
  themeBtn: $('themeBtn'),

  likeBtn: $('likeBtn'),
  dislikeBtn: $('dislikeBtn'),

  authBlock: $('authBlock'),
  userBlock: $('userBlock'),
  userEmail: $('userEmail'),
  adminLink: $('adminLink'),

  emailInput: $('email'),
  passwordInput: $('password'),
  signInBtn: $('signInBtn'),
  signUpBtn: $('signUpBtn'),
  signOutBtn: $('signOutBtn'),
  authMessage: $('authMessage'),

  suggestionText: $('suggestionText'),
  suggestionBtn: $('suggestionBtn'),
  suggestionMessage: $('suggestionMessage'),
};

function setText(el, text) {
  if (el) el.textContent = text;
}

function setHtml(el, html) {
  if (el) el.innerHTML = html;
}

function show(el) {
  if (el) el.style.display = '';
}

function hide(el) {
  if (el) el.style.display = 'none';
}

function disable(el, value = true) {
  if (el) el.disabled = value;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return 'Неверная почта или пароль.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Подтверди почту по письму и попробуй снова.';
  }
  if (msg.includes('user already registered')) {
    return 'Пользователь с такой почтой уже зарегистрирован.';
  }
  if (msg.includes('password should be at least')) {
    return 'Пароль слишком короткий.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Не удалось подключиться к серверу.';
  }

  return error?.message || 'Что-то пошло не так.';
}

function setMessage(el, text, type = 'info') {
  if (!el) return;

  el.textContent = text || '';
  el.dataset.type = type;

  const colors = {
    info: '#666',
    success: '#1d7a3e',
    error: '#b3261e',
  };

  el.style.color = colors[type] || colors.info;
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
    return;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function toggleTheme() {
  const isDark = document.body.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
}

function requireAuthMessage() {
  return state.user ? null : 'Для этого нужно войти.';
}

function renderQuoteLoading() {
  setText(els.quoteText, 'Загрузка цитаты...');
  setText(els.quoteLikes, '—');
  setText(els.quoteDislikes, '—');
}

function renderNoQuote() {
  state.currentQuote = null;
  state.currentVote = null;
  setText(els.quoteText, 'Пока нет опубликованных цитат.');
  setText(els.quoteLikes, '0');
  setText(els.quoteDislikes, '0');
  updateVoteButtons();
}

function renderQuote(quote, stats = { likes: 0, dislikes: 0 }) {
  state.currentQuote = quote;
  setText(els.quoteText, quote?.text || 'Нет текста');
  setText(els.quoteLikes, String(stats.likes ?? 0));
  setText(els.quoteDislikes, String(stats.dislikes ?? 0));
  if (els.quoteId) {
    els.quoteId.value = quote?.id ?? '';
  }
  updateVoteButtons();
}

function updateAuthUI() {
  const loggedIn = !!state.user;

  if (loggedIn) {
    hide(els.authBlock);
    show(els.userBlock);
    setText(els.userEmail, state.user.email || '');
  } else {
    show(els.authBlock);
    hide(els.userBlock);
    setText(els.userEmail, '');
  }

  if (els.adminLink) {
    els.adminLink.style.display = state.profile?.role === 'admin' ? '' : 'none';
  }
}

function updateVoteButtons() {
  const currentVote = state.currentVote;

  if (els.likeBtn) {
    els.likeBtn.classList.toggle('active', currentVote === 'like');
    els.likeBtn.setAttribute(
      'aria-pressed',
      currentVote === 'like' ? 'true' : 'false'
    );
  }

  if (els.dislikeBtn) {
    els.dislikeBtn.classList.toggle('active', currentVote === 'dislike');
    els.dislikeBtn.setAttribute(
      'aria-pressed',
      currentVote === 'dislike' ? 'true' : 'false'
    );
  }
}

async function fetchProfile() {
  if (!state.user) {
    state.profile = null;
    updateAuthUI();
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', state.user.id)
    .maybeSingle();

  if (error) {
    console.error('Ошибка профиля:', error);
    state.profile = null;
    updateAuthUI();
    return null;
  }

  state.profile = data || null;
  updateAuthUI();
  return data;
}

async function ensureProfileExists() {
  if (!state.user) return;

  const payload = {
    id: state.user.id,
    email: state.user.email,
  };

  const { error } = await supabase.from('profiles').upsert(payload, {
    onConflict: 'id',
  });

  if (error) {
    console.error('Не удалось создать/обновить profile:', error);
  }
}

async function getQuoteStats(quoteId) {
  const { count: likesCount, error: likesError } = await supabase
    .from('quote_votes')
    .select('*', { count: 'exact', head: true })
    .eq('quote_id', quoteId)
    .eq('vote', 'like');

  if (likesError) {
    console.error(likesError);
  }

  const { count: dislikesCount, error: dislikesError } = await supabase
    .from('quote_votes')
    .select('*', { count: 'exact', head: true })
    .eq('quote_id', quoteId)
    .eq('vote', 'dislike');

  if (dislikesError) {
    console.error(dislikesError);
  }

  return {
    likes: likesCount || 0,
    dislikes: dislikesCount || 0,
  };
}

async function getUserVote(quoteId) {
  if (!state.user) {
    state.currentVote = null;
    updateVoteButtons();
    return null;
  }

  const { data, error } = await supabase
    .from('quote_votes')
    .select('vote')
    .eq('quote_id', quoteId)
    .eq('user_id', state.user.id)
    .maybeSingle();

  if (error) {
    console.error('Ошибка получения голоса:', error);
    state.currentVote = null;
    updateVoteButtons();
    return null;
  }

  state.currentVote = data?.vote || null;
  updateVoteButtons();
  return state.currentVote;
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

async function loadRandomQuote() {
  renderQuoteLoading();

  const { data, error } = await supabase
    .from('quotes')
    .select('id, text, status, created_at')
    .eq('status', 'approved');

  if (error) {
    console.error('Ошибка загрузки цитат:', error);
    setText(els.quoteText, 'Не удалось загрузить цитаты.');
    setText(els.quoteLikes, '—');
    setText(els.quoteDislikes, '—');
    return;
  }

  const quote = pickRandom(data);

  if (!quote) {
    renderNoQuote();
    return;
  }

  const stats = await getQuoteStats(quote.id);
  await getUserVote(quote.id);
  renderQuote(quote, stats);
}

async function refreshQuote() {
  disable(els.refreshBtn, true);
  try {
    await loadRandomQuote();
  } finally {
    disable(els.refreshBtn, false);
  }
}

async function copyQuote() {
  const text = state.currentQuote?.text?.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    setMessage(els.authMessage, 'Цитата скопирована.', 'success');
  } catch {
    setMessage(els.authMessage, 'Не удалось скопировать цитату.', 'error');
  }
}

async function shareQuote() {
  const text = state.currentQuote?.text?.trim();
  if (!text) return;

  const payload = {
    title: 'Мудрость дня',
    text,
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch {
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n\n${window.location.href}`);
    setMessage(els.authMessage, 'Ссылка и цитата скопированы.', 'success');
  } catch {
    setMessage(els.authMessage, 'Не удалось поделиться цитатой.', 'error');
  }
}

async function vote(voteType) {
  const authRequired = requireAuthMessage();
  if (authRequired) {
    setMessage(els.authMessage, authRequired, 'error');
    return;
  }

  const quoteId = state.currentQuote?.id;
  if (!quoteId) return;

  disable(els.likeBtn, true);
  disable(els.dislikeBtn, true);

  try {
    if (state.currentVote === voteType) {
      const { error } = await supabase
        .from('quote_votes')
        .delete()
        .eq('quote_id', quoteId)
        .eq('user_id', state.user.id);

      if (error) throw error;

      state.currentVote = null;
    } else {
      const payload = {
        quote_id: quoteId,
        user_id: state.user.id,
        vote: voteType,
      };

      const { error } = await supabase.from('quote_votes').upsert(payload, {
        onConflict: 'quote_id,user_id',
      });

      if (error) throw error;

      state.currentVote = voteType;
    }

    const stats = await getQuoteStats(quoteId);
    renderQuote(state.currentQuote, stats);
  } catch (error) {
    console.error(error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    disable(els.likeBtn, false);
    disable(els.dislikeBtn, false);
  }
}

async function signIn() {
  const email = els.emailInput?.value?.trim();
  const password = els.passwordInput?.value || '';

  if (!email || !password) {
    setMessage(els.authMessage, 'Заполни почту и пароль.', 'error');
    return;
  }

  disable(els.signInBtn, true);
  disable(els.signUpBtn, true);
  setMessage(els.authMessage, 'Пробуем войти...', 'info');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    state.session = data.session || null;
    state.user = data.user || data.session?.user || null;

    await ensureProfileExists();
    await fetchProfile();
    updateAuthUI();
    await getUserVote(state.currentQuote?.id);
    setMessage(els.authMessage, 'Вход выполнен.', 'success');
  } catch (error) {
    console.error(error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    disable(els.signInBtn, false);
    disable(els.signUpBtn, false);
  }
}

async function signUp() {
  const email = els.emailInput?.value?.trim();
  const password = els.passwordInput?.value || '';

  if (!email || !password) {
    setMessage(els.authMessage, 'Заполни почту и пароль.', 'error');
    return;
  }

  disable(els.signInBtn, true);
  disable(els.signUpBtn, true);
  setMessage(els.authMessage, 'Создаём аккаунт...', 'info');

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    state.session = data.session || null;
    state.user = data.user || data.session?.user || null;

    if (state.user) {
      await ensureProfileExists();
      await fetchProfile();
      updateAuthUI();
      await getUserVote(state.currentQuote?.id);
      setMessage(els.authMessage, 'Аккаунт создан.', 'success');
    } else {
      setMessage(
        els.authMessage,
        'Аккаунт создан. Подтверди почту через письмо.',
        'success'
      );
    }
  } catch (error) {
    console.error(error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    disable(els.signInBtn, false);
    disable(els.signUpBtn, false);
  }
}

async function signOutUser() {
  disable(els.signOutBtn, true);

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    state.session = null;
    state.user = null;
    state.profile = null;
    state.currentVote = null;
    updateAuthUI();
    updateVoteButtons();
    setMessage(els.authMessage, 'Вы вышли из аккаунта.', 'success');
  } catch (error) {
    console.error(error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    disable(els.signOutBtn, false);
  }
}

async function sendSuggestion() {
  const text = els.suggestionText?.value?.trim();

  if (!text) {
    setMessage(els.suggestionMessage, 'Напиши цитату.', 'error');
    return;
  }

  disable(els.suggestionBtn, true);
  setMessage(els.suggestionMessage, 'Отправляем...', 'info');

  try {
    const payload = {
      text,
      status: 'pending',
      user_id: state.user?.id ?? null,
    };

    const { error } = await supabase.from('quote_suggestions').insert(payload);

    if (error) throw error;

    if (els.suggestionText) els.suggestionText.value = '';
    setMessage(
      els.suggestionMessage,
      'Цитата отправлена на модерацию.',
      'success'
    );
  } catch (error) {
    console.error(error);
    setMessage(els.suggestionMessage, normalizeError(error), 'error');
  } finally {
    disable(els.suggestionBtn, false);
  }
}

async function initSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('Ошибка getSession:', error);
  }

  state.session = session || null;
  state.user = session?.user || null;

  if (state.user) {
    await ensureProfileExists();
    await fetchProfile();
  } else {
    state.profile = null;
    updateAuthUI();
  }
}

function bindEvents() {
  els.themeBtn?.addEventListener('click', toggleTheme);
  els.refreshBtn?.addEventListener('click', refreshQuote);
  els.copyBtn?.addEventListener('click', copyQuote);
  els.shareBtn?.addEventListener('click', shareQuote);

  els.likeBtn?.addEventListener('click', () => vote('like'));
  els.dislikeBtn?.addEventListener('click', () => vote('dislike'));

  els.signInBtn?.addEventListener('click', signIn);
  els.signUpBtn?.addEventListener('click', signUp);
  els.signOutBtn?.addEventListener('click', signOutUser);

  els.suggestionBtn?.addEventListener('click', sendSuggestion);

  els.passwordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') signIn();
  });

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session || null;
    state.user = session?.user || null;

    if (state.user) {
      await ensureProfileExists();
      await fetchProfile();
      await getUserVote(state.currentQuote?.id);
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
  await initSession();
  await loadRandomQuote();
}

document.addEventListener('DOMContentLoaded', init);