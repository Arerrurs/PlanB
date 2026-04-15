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
  booted: false,
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
  authForm: $('authForm'),
  email: $('email'),
  password: $('password'),
  signInBtn: $('signInBtn'),
  signUpBtn: $('signUpBtn'),
  signOutBtn: $('signOutBtn'),
  authMessage: $('authMessage'),
  userEmail: $('userEmail'),
  openSuggestionBtn: $('openSuggestionBtn'),
  adminLink: $('adminLink'),
  suggestionForm: $('suggestionForm'),
  suggestionText: $('suggestionText'),
  suggestionBtn: $('suggestionBtn'),
  suggestionMessage: $('suggestionMessage'),
};

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
  if (msg.includes('duplicate key')) return 'Такая запись уже существует.';
  if (msg.includes('row-level security')) return 'Недостаточно прав для этого действия.';
  return error?.message || 'Что-то пошло не так.';
}

function withTimeout(promise, label = 'request', ms = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const id = window.setTimeout(() => {
        window.clearTimeout(id);
        reject(new Error(`${label} timed out`));
      }, ms);
    }),
  ]);
}

function clearStoredSession() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.toLowerCase().includes('supabase')) {
        localStorage.removeItem(key);
      }
    });
    sessionStorage.clear();
  } catch (error) {
    console.warn('clearStoredSession:', error);
  }
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('mudrost-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('mudrost-theme');
  if (saved === 'dark' || saved === 'light') return applyTheme(saved);
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
  if ([...document.querySelectorAll('.modal')].every((m) => m.hidden)) {
    document.body.style.overflow = '';
  }
}

function updateAccountButton() {
  const loggedIn = !!state.user;
  if (!els.accountBtn) return;
  els.accountBtn.title = loggedIn ? 'Личный кабинет' : 'Войти';
  els.accountBtn.setAttribute('aria-label', loggedIn ? 'Личный кабинет' : 'Войти');
}

function updateAuthUI() {
  updateAccountButton();
  if (els.userEmail) els.userEmail.textContent = state.user?.email || '—';
  if (els.adminLink) {
    els.adminLink.style.display = state.profile?.role === 'admin' ? 'block' : 'none';
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

function getIndexUrl() {
  return new URL('./index.html', window.location.href).href;
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
    if (error) console.warn('profile upsert:', error);
  } catch (error) {
    console.warn('profile upsert timeout/fail:', error);
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
      supabase
        .from('profiles')
        .select('id,email,role')
        .eq('id', state.user.id)
        .maybeSingle(),
      'load profile'
    );

    if (error) {
      console.warn('profile load:', error);
      state.profile = null;
    } else {
      state.profile = data || null;
    }
  } catch (error) {
    console.warn('profile load timeout/fail:', error);
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
      supabase
        .from('quote_votes')
        .select('vote')
        .eq('quote_id', quoteId)
        .eq('user_id', state.user.id)
        .maybeSingle(),
      'load vote'
    );

    if (error) {
      console.warn('vote load:', error);
      state.currentVote = null;
    } else {
      state.currentVote = data?.vote || null;
    }
  } catch (error) {
    console.warn('vote load timeout/fail:', error);
    state.currentVote = null;
  }

  updateVoteButtons();
}

async function loadRandomQuote() {
  setMessage(els.globalMessage, '');
  if (els.quoteText) els.quoteText.textContent = 'Загрузка цитаты...';

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('quotes')
        .select('id,text,status')
        .eq('status', 'approved'),
      'load quotes'
    );

    if (error) throw error;

    if (!data?.length) {
      state.currentQuote = null;
      state.currentVote = null;
      if (els.quoteText) els.quoteText.textContent = 'Пока нет опубликованных цитат.';
      updateVoteButtons();
      return;
    }

    const random = data[Math.floor(Math.random() * data.length)];
    state.currentQuote = random;
    if (els.quoteId) els.quoteId.value = random.id;
    if (els.quoteText) els.quoteText.textContent = random.text;
    await loadUserVote(random.id);
  } catch (error) {
    console.warn('quotes load:', error);
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
  const shareData = {
    title: 'Мудрость дня',
    text: `«${state.currentQuote.text}»`,
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch {
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(`${shareData.text}\n\n${shareData.url}`);
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

    await Promise.allSettled([
      ensureProfileExists(),
      loadProfile(),
      loadUserVote(state.currentQuote?.id),
    ]);
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
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getIndexUrl(),
        },
      }),
      'sign up'
    );
    if (error) throw error;

    state.user = data.user || data.session?.user || null;

    if (state.user && data.session) {
      closeModal(els.authModal);
      els.authForm?.reset();
      setMessage(els.authMessage, '');
      setMessage(els.globalMessage, 'Аккаунт создан.', 'success');
      await Promise.allSettled([
        ensureProfileExists(),
        loadProfile(),
        loadUserVote(state.currentQuote?.id),
      ]);
    } else {
      setMessage(
        els.authMessage,
        'Аккаунт создан. Если подтверждение почты включено в Supabase — проверь письмо.',
        'success'
      );
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
      supabase.auth.signOut({ scope: 'local' }),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  } catch (error) {
    console.warn('signOut:', error);
  } finally {
    clearStoredSession();
    state.user = null;
    state.profile = null;
    state.currentVote = null;
    updateAuthUI();
    updateVoteButtons();
    closeModal(els.accountModal);
    setMessage(els.globalMessage, 'Вы вышли из аккаунта.', 'success');
    if (els.signOutBtn) els.signOutBtn.disabled = false;
  }
}

async function vote(voteType) {
  if (!state.user) {
    openModal(els.authModal);
    setMessage(els.authMessage, 'Войди, чтобы голосовать.', 'error');
    return;
  }
  if (!state.currentQuote?.id) return;

  els.likeBtn.disabled = true;
  els.dislikeBtn.disabled = true;

  try {
    if (state.currentVote === voteType) {
      const { error } = await withTimeout(
        supabase
          .from('quote_votes')
          .delete()
          .eq('quote_id', state.currentQuote.id)
          .eq('user_id', state.user.id),
        'delete vote'
      );
      if (error) throw error;
      state.currentVote = null;
    } else {
      const { error } = await withTimeout(
        supabase.from('quote_votes').upsert(
          { quote_id: state.currentQuote.id, user_id: state.user.id, vote: voteType },
          { onConflict: 'quote_id,user_id' }
        ),
        'save vote'
      );
      if (error) throw error;
      state.currentVote = voteType;
    }

    updateVoteButtons();
  } catch (error) {
    console.warn('vote:', error);
    setMessage(els.globalMessage, normalizeError(error), 'error');
  } finally {
    els.likeBtn.disabled = false;
    els.dislikeBtn.disabled = false;
  }
}

async function sendSuggestion() {
  const text = els.suggestionText?.value.trim();
  if (!text) return setMessage(els.suggestionMessage, 'Напиши цитату.', 'error');

  els.suggestionBtn.disabled = true;
  setMessage(els.suggestionMessage, 'Отправляем...');

  try {
    let result = await withTimeout(
      supabase.from('quote_suggestions').insert({
        text,
        user_id: state.user?.id || null,
        status: 'pending',
      }),
      'save suggestion'
    );

    if (result.error && state.user) {
      result = await withTimeout(
        supabase.from('quote_suggestions').insert({
          text,
          user_id: null,
          status: 'pending',
        }),
        'save suggestion fallback'
      );
    }

    if (result.error) throw result.error;

    els.suggestionForm?.reset();
    setMessage(els.suggestionMessage, 'Отправлено.', 'success');
    window.setTimeout(() => {
      closeModal(els.suggestionModal);
      setMessage(els.suggestionMessage, '');
    }, 700);
  } catch (error) {
    console.warn('suggestion:', error);
    setMessage(els.suggestionMessage, normalizeError(error), 'error');
  } finally {
    els.suggestionBtn.disabled = false;
  }
}

async function initSession() {
  try {
    const {
      data: { session },
      error,
    } = await withTimeout(supabase.auth.getSession(), 'get session');

    if (error) console.warn('getSession:', error);

    state.user = session?.user || null;
    updateAuthUI();

    if (state.user) {
      await Promise.allSettled([ensureProfileExists(), loadProfile()]);
    } else {
      state.profile = null;
      updateAuthUI();
    }
  } catch (error) {
    console.warn('initSession:', error);
    state.user = null;
    state.profile = null;
    updateAuthUI();
  }
}

function bindModalEvents() {
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(document.getElementById(el.dataset.close)));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach((modal) => {
        if (!modal.hidden) closeModal(modal);
      });
    }
  });
}

function bindEvents() {
  els.themeBtn?.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
  els.refreshBtn?.addEventListener('click', loadRandomQuote);
  els.copyBtn?.addEventListener('click', copyQuote);
  els.shareBtn?.addEventListener('click', shareQuote);
  els.likeBtn?.addEventListener('click', () => vote('like'));
  els.dislikeBtn?.addEventListener('click', () => vote('dislike'));

  els.accountBtn?.addEventListener('click', () => {
    if (state.user) openModal(els.accountModal);
    else openModal(els.authModal);
  });

  els.signInBtn?.addEventListener('click', signIn);
  els.signUpBtn?.addEventListener('click', signUp);
  els.signOutBtn?.addEventListener('click', signOutUser);
  els.openSuggestionBtn?.addEventListener('click', () => {
    closeModal(els.accountModal);
    openModal(els.suggestionModal);
  });
  els.suggestionBtn?.addEventListener('click', sendSuggestion);

  els.authForm?.addEventListener('submit', (e) => e.preventDefault());
  els.suggestionForm?.addEventListener('submit', (e) => e.preventDefault());
  els.password?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') signIn();
  });

  supabase.auth.onAuthStateChange((event, session) => {
    state.user = session?.user || null;
    if (!state.booted && event === 'INITIAL_SESSION') return;

    if (state.user) {
      Promise.allSettled([
        ensureProfileExists(),
        loadProfile(),
        loadUserVote(state.currentQuote?.id),
      ]);
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
  bindModalEvents();
  bindEvents();
  updateAuthUI();
  updateVoteButtons();

  await Promise.allSettled([
    initSession(),
    loadRandomQuote(),
  ]);

  state.booted = true;
}

document.addEventListener('DOMContentLoaded', init);
