import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const REQUEST_TIMEOUT_MS = 8000;

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
  hideDislikedToggle: $('hideDislikedToggle'),

  suggestionText: $('suggestionText'),
  suggestionBtn: $('suggestionBtn'),
  suggestionMessage: $('suggestionMessage'),

  favoritesList: $('favoritesList'),
  favoritesMessage: $('favoritesMessage'),
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
    els.adminLink.style.display = state.profile?.role === 'admin' ? 'block' : 'none';
  }
  if (els.hideDislikedToggle) {
    els.hideDislikedToggle.checked = !!state.profile?.hide_disliked;
    els.hideDislikedToggle.disabled = !state.user;
  }
}

function updateVoteButtons() {
  if (els.likeBtn) {
    els.likeBtn.classList.toggle('active', state.currentVote === 'like');
    els.likeBtn.classList.toggle('like', state.currentVote === 'like');
    els.likeBtn.disabled = false;
  }
  if (els.dislikeBtn) {
    els.dislikeBtn.classList.toggle('active', state.currentVote === 'dislike');
    els.dislikeBtn.classList.toggle('dislike', state.currentVote === 'dislike');
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
      supabase.from('profiles').select('id,email,role,hide_disliked').eq('id', state.user.id).maybeSingle(),
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

async function getDislikedQuoteIds() {
  if (!state.user || !state.profile?.hide_disliked) return [];

  try {
    const { data, error } = await withTimeout(
      supabase.from('quote_votes').select('quote_id').eq('user_id', state.user.id).eq('vote', 'dislike'),
      'load disliked ids'
    );
    if (error) throw error;
    return (data || []).map((item) => item.quote_id);
  } catch (error) {
    console.warn('getDislikedQuoteIds:', error);
    return [];
  }
}

async function loadRandomQuote() {
  setMessage(els.globalMessage, '');
  if (els.quoteText) els.quoteText.textContent = 'Загрузка цитаты...';

  try {
    const [{ data, error }, dislikedIds] = await Promise.all([
      withTimeout(
        supabase.from('quotes').select('id,text,status').eq('status', 'approved'),
        'load quotes'
      ),
      getDislikedQuoteIds(),
    ]);

    if (error) throw error;

    let quotes = data || [];
    if (dislikedIds.length) {
      const dislikedSet = new Set(dislikedIds);
      quotes = quotes.filter((quote) => !dislikedSet.has(quote.id));
    }

    if (!quotes.length) {
      state.currentQuote = null;
      state.currentVote = null;
      if (els.quoteText) {
        els.quoteText.textContent = state.profile?.hide_disliked
          ? 'Под подходящий фильтр пока ничего не осталось.'
          : 'Пока нет опубликованных цитат.';
      }
      updateVoteButtons();
      return;
    }

    const random = quotes[Math.floor(Math.random() * quotes.length)];
    state.currentQuote = random;
    if (els.quoteId) els.quoteId.value = random.id;
    if (els.quoteText) els.quoteText.textContent = random.text;
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
  const shareText = `«${state.currentQuote.text}»\n\n${window.location.href}`;

  if (navigator.share) {
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
    } else {
      setMessage(els.authMessage, 'Аккаунт создан. Проверь настройки подтверждения почты.', 'info');
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
  els.signOutBtn.disabled = true;
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

async function vote(voteType) {
  if (!state.user) {
    openModal(els.authModal);
    return;
  }
  if (!state.currentQuote?.id) return;

  els.likeBtn.disabled = true;
  els.dislikeBtn.disabled = true;

  try {
    if (state.currentVote === voteType) {
      const { error } = await withTimeout(
        supabase.from('quote_votes').delete().eq('quote_id', state.currentQuote.id).eq('user_id', state.user.id),
        'delete vote'
      );
      if (error) throw error;
      state.currentVote = null;
    } else {
      const { error } = await withTimeout(
        supabase.from('quote_votes').upsert({
          quote_id: state.currentQuote.id,
          user_id: state.user.id,
          vote: voteType,
        }, { onConflict: 'quote_id,user_id' }),
        'save vote'
      );
      if (error) throw error;
      state.currentVote = voteType;
    }

    updateVoteButtons();

    if (voteType === 'dislike' && state.profile?.hide_disliked) {
      await loadRandomQuote();
    }
  } catch (error) {
    console.warn('vote:', error);
    setMessage(els.globalMessage, normalizeError(error), 'error');
  } finally {
    els.likeBtn.disabled = false;
    els.dislikeBtn.disabled = false;
  }
}

async function saveHideDislikedSetting() {
  if (!state.user) return;
  const value = !!els.hideDislikedToggle?.checked;
  if (state.profile) state.profile.hide_disliked = value;

  try {
    const { error } = await withTimeout(
      supabase.from('profiles').update({ hide_disliked: value }).eq('id', state.user.id),
      'save setting'
    );
    if (error) throw error;
    await loadRandomQuote();
  } catch (error) {
    console.warn('saveHideDislikedSetting:', error);
    setMessage(els.globalMessage, normalizeError(error), 'error');
  }
}

async function openFavorites() {
  if (!state.user) {
    openModal(els.authModal);
    return;
  }

  setMessage(els.favoritesMessage, 'Загружаем...');
  els.favoritesList.innerHTML = '';
  openModal(els.favoritesModal);

  try {
    const { data: likes, error: likesError } = await withTimeout(
      supabase.from('quote_votes').select('quote_id').eq('user_id', state.user.id).eq('vote', 'like'),
      'load favorites ids'
    );
    if (likesError) throw likesError;

    const ids = (likes || []).map((item) => item.quote_id).filter(Boolean);
    if (!ids.length) {
      setMessage(els.favoritesMessage, 'Пока ничего не лайкала.');
      return;
    }

    const { data: quotes, error: quotesError } = await withTimeout(
      supabase.from('quotes').select('id,text,status').in('id', ids).eq('status', 'approved'),
      'load favorites quotes'
    );
    if (quotesError) throw quotesError;

    if (!quotes?.length) {
      setMessage(els.favoritesMessage, 'Пока ничего не лайкала.');
      return;
    }

    setMessage(els.favoritesMessage, '');
    els.favoritesList.innerHTML = quotes.map((quote) => `
      <article class="favorite-item">
        <p>${escapeHtml(quote.text)}</p>
      </article>
    `).join('');
  } catch (error) {
    console.warn('openFavorites:', error);
    setMessage(els.favoritesMessage, normalizeError(error), 'error');
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
  els.openFavoritesBtn?.addEventListener('click', openFavorites);
  els.hideDislikedToggle?.addEventListener('change', saveHideDislikedSetting);
  els.suggestionBtn?.addEventListener('click', sendSuggestion);

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
  await loadRandomQuote();
}

window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled rejection:', event.reason);
});

document.addEventListener('DOMContentLoaded', init);
