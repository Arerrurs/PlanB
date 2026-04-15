import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const $ = (id) => document.getElementById(id);

const els = {
  adminThemeBtn: $('adminThemeBtn'),
  refreshAdminBtn: $('refreshAdminBtn'),
  adminStatus: $('adminStatus'),
  accessDenied: $('accessDenied'),
  adminContent: $('adminContent'),
  statQuotes: $('statQuotes'),
  statSuggestions: $('statSuggestions'),
  statLikes: $('statLikes'),
  statDislikes: $('statDislikes'),
  newQuoteText: $('newQuoteText'),
  addQuoteBtn: $('addQuoteBtn'),
  adminMessage: $('adminMessage'),
  usersSummary: $('usersSummary'),
  usersList: $('usersList'),
  quotesList: $('quotesList'),
  suggestionsList: $('suggestionsList'),
  editQuoteModal: $('editQuoteModal'),
  editQuoteForm: $('editQuoteForm'),
  editQuoteId: $('editQuoteId'),
  editQuoteText: $('editQuoteText'),
  saveQuoteBtn: $('saveQuoteBtn'),
  editQuoteMessage: $('editQuoteMessage'),
};

let adminUser = null;
let quoteStatsMap = new Map();

function setMessage(el, text = '', type = 'info') {
  if (!el) return;
  el.textContent = text;
  const colors = { info: 'var(--muted)', success: 'var(--success)', error: 'var(--danger)' };
  el.style.color = colors[type] || colors.info;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('row-level security')) return 'Нет прав на это действие.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Не удалось подключиться к серверу.';
  return error?.message || 'Что-то пошло не так.';
}

async function checkAccess() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    setMessage(els.adminStatus, 'Ошибка чтения сессии.', 'error');
    els.accessDenied.classList.remove('hidden');
    els.adminContent.classList.add('hidden');
    return false;
  }

  const user = session?.user;
  if (!user) {
    setMessage(els.adminStatus, 'Сначала войди на главной странице.', 'error');
    els.accessDenied.classList.remove('hidden');
    els.adminContent.classList.add('hidden');
    return false;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    setMessage(els.adminStatus, `Ошибка доступа к profiles: ${error.message}`, 'error');
    els.accessDenied.classList.remove('hidden');
    els.adminContent.classList.add('hidden');
    return false;
  }

  if (!data || data.role !== 'admin') {
    setMessage(els.adminStatus, 'У тебя нет прав администратора.', 'error');
    els.accessDenied.classList.remove('hidden');
    els.adminContent.classList.add('hidden');
    return false;
  }

  adminUser = data;
  setMessage(els.adminStatus, `Администратор: ${data.email}`, 'success');
  els.accessDenied.classList.add('hidden');
  els.adminContent.classList.remove('hidden');
  return true;
}

async function loadStats() {
  const [quotesRes, suggestionsRes, likesRes, dislikesRes] = await Promise.all([
    supabase.from('quotes').select('*', { count: 'exact', head: true }),
    supabase.from('quote_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('quote_votes').select('*', { count: 'exact', head: true }).eq('vote', 'like'),
    supabase.from('quote_votes').select('*', { count: 'exact', head: true }).eq('vote', 'dislike'),
  ]);

  els.statQuotes.textContent = String(quotesRes.count || 0);
  els.statSuggestions.textContent = String(suggestionsRes.count || 0);
  els.statLikes.textContent = String(likesRes.count || 0);
  els.statDislikes.textContent = String(dislikesRes.count || 0);
}

async function loadQuoteVoteStats() {
  const { data, error } = await supabase
    .from('quote_votes')
    .select('quote_id,vote');

  quoteStatsMap = new Map();

  if (error || !data) {
    console.error('vote stats:', error);
    return;
  }

  for (const row of data) {
    const current = quoteStatsMap.get(row.quote_id) || { likes: 0, dislikes: 0 };
    if (row.vote === 'like') current.likes += 1;
    if (row.vote === 'dislike') current.dislikes += 1;
    quoteStatsMap.set(row.quote_id, current);
  }
}

function badgeClass(status) {
  if (status === 'pending') return 'badge pending';
  if (status === 'rejected') return 'badge rejected';
  return 'badge';
}

async function loadUsers() {
  const { data, error } = await supabase.rpc('admin_list_profiles');

  if (error) {
    console.error('users load:', error);
    els.usersSummary.textContent = 'Не удалось загрузить пользователей.';
    els.usersList.innerHTML = '<div class="admin-empty">Нет доступа к списку пользователей.</div>';
    return;
  }

  els.usersSummary.textContent = `Всего: ${data?.length || 0}`;

  if (!data?.length) {
    els.usersList.innerHTML = '<div class="admin-empty">Пользователей пока нет.</div>';
    return;
  }

  els.usersList.innerHTML = data.map((user) => `
    <article class="admin-item">
      <div class="user-email">${escapeHtml(user.email || 'без почты')}</div>
      <div class="admin-item__meta">
        <span class="badge">${escapeHtml(user.role || 'user')}</span>
        <span>${new Date(user.created_at).toLocaleString('ru-RU')}</span>
      </div>
    </article>
  `).join('');
}

async function loadQuotes() {
  const { data, error } = await supabase
    .from('quotes')
    .select('id,text,status,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    els.quotesList.innerHTML = '<div class="admin-empty">Не удалось загрузить цитаты.</div>';
    return;
  }

  if (!data?.length) {
    els.quotesList.innerHTML = '<div class="admin-empty">Пока пусто.</div>';
    return;
  }

  els.quotesList.innerHTML = data.map((item) => {
    const stats = quoteStatsMap.get(item.id) || { likes: 0, dislikes: 0 };
    const editedLine = item.updated_at && item.updated_at !== item.created_at
      ? `<span>обновлено: ${new Date(item.updated_at).toLocaleString('ru-RU')}</span>`
      : '';

    return `
      <article class="admin-item">
        <div class="admin-item__grid">
          <div>
            <div class="admin-item__text">${escapeHtml(item.text)}</div>
            <div class="admin-item__meta">
              <span class="${badgeClass(item.status)}">${escapeHtml(item.status)}</span>
              <span>${new Date(item.created_at).toLocaleString('ru-RU')}</span>
              ${editedLine}
            </div>
            <div class="admin-item__meta">
              <span class="stat-inline like"><span class="material-symbols-outlined">thumb_up</span>${stats.likes}</span>
              <span class="stat-inline dislike"><span class="material-symbols-outlined">thumb_down</span>${stats.dislikes}</span>
            </div>
          </div>
          <div class="admin-item__actions">
            <button class="text-btn" type="button" data-action="edit-quote" data-id="${item.id}" data-text="${encodeURIComponent(item.text)}">Редактировать</button>
            <button class="text-btn" type="button" data-action="approve-quote" data-id="${item.id}">Опубликовать</button>
            <button class="text-btn" type="button" data-action="reject-quote" data-id="${item.id}">Скрыть</button>
            <button class="text-btn danger" type="button" data-action="delete-quote" data-id="${item.id}">Удалить</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

async function loadSuggestions() {
  const { data, error } = await supabase
    .from('quote_suggestions')
    .select('id,text,status,created_at,user_id')
    .order('created_at', { ascending: false });

  if (error) {
    els.suggestionsList.innerHTML = '<div class="admin-empty">Не удалось загрузить предложения.</div>';
    return;
  }

  if (!data?.length) {
    els.suggestionsList.innerHTML = '<div class="admin-empty">Пока нет предложений.</div>';
    return;
  }

  els.suggestionsList.innerHTML = data.map((item) => `
    <article class="admin-item">
      <div class="admin-item__text">${escapeHtml(item.text)}</div>
      <div class="admin-item__meta">
        <span class="${badgeClass(item.status)}">${escapeHtml(item.status)}</span>
        <span>${new Date(item.created_at).toLocaleString('ru-RU')}</span>
      </div>
      <div class="admin-item__actions">
        <button class="text-btn primary" type="button" data-action="approve-suggestion" data-id="${item.id}">Принять</button>
        <button class="text-btn" type="button" data-action="reject-suggestion" data-id="${item.id}">Отклонить</button>
        <button class="text-btn danger" type="button" data-action="delete-suggestion" data-id="${item.id}">Удалить</button>
      </div>
    </article>
  `).join('');
}

async function refreshAll() {
  await Promise.all([
    loadStats(),
    loadUsers(),
    loadQuoteVoteStats(),
    loadSuggestions(),
  ]);
  await loadQuotes();
}

async function addQuote() {
  const text = els.newQuoteText.value.trim();
  if (!text) return setMessage(els.adminMessage, 'Напиши текст цитаты.', 'error');

  els.addQuoteBtn.disabled = true;
  try {
    const { error } = await supabase.from('quotes').insert({
      text,
      status: 'approved',
      created_by: adminUser.id,
    });
    if (error) throw error;
    els.newQuoteText.value = '';
    setMessage(els.adminMessage, 'Цитата добавлена.', 'success');
    await refreshAll();
  } catch (error) {
    console.error('addQuote:', error);
    setMessage(els.adminMessage, normalizeError(error), 'error');
  } finally {
    els.addQuoteBtn.disabled = false;
  }
}

function startEditQuote(id, encodedText) {
  els.editQuoteId.value = id;
  els.editQuoteText.value = decodeURIComponent(encodedText || '');
  setMessage(els.editQuoteMessage, '');
  openModal(els.editQuoteModal);
}

async function saveEditedQuote() {
  const id = els.editQuoteId.value;
  const text = els.editQuoteText.value.trim();
  if (!id || !text) return setMessage(els.editQuoteMessage, 'Напиши текст цитаты.', 'error');

  els.saveQuoteBtn.disabled = true;
  setMessage(els.editQuoteMessage, 'Сохраняем...');

  try {
    const { error } = await supabase
      .from('quotes')
      .update({ text, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    setMessage(els.editQuoteMessage, 'Сохранено.', 'success');
    await refreshAll();
    setTimeout(() => closeModal(els.editQuoteModal), 500);
  } catch (error) {
    console.error('saveEditedQuote:', error);
    setMessage(els.editQuoteMessage, normalizeError(error), 'error');
  } finally {
    els.saveQuoteBtn.disabled = false;
  }
}

async function handleAdminAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  button.disabled = true;

  try {
    if (action === 'edit-quote') {
      startEditQuote(id, button.dataset.text || '');
      return;
    }

    if (action === 'approve-quote') {
      const { error } = await supabase.from('quotes').update({ status: 'approved' }).eq('id', id);
      if (error) throw error;
    }

    if (action === 'reject-quote') {
      const { error } = await supabase.from('quotes').update({ status: 'rejected' }).eq('id', id);
      if (error) throw error;
    }

    if (action === 'delete-quote') {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw error;
    }

    if (action === 'approve-suggestion') {
      const { data: suggestion, error: suggestionError } = await supabase
        .from('quote_suggestions')
        .select('text')
        .eq('id', id)
        .maybeSingle();
      if (suggestionError) throw suggestionError;

      if (suggestion?.text) {
        const { error: insertError } = await supabase.from('quotes').insert({
          text: suggestion.text,
          status: 'approved',
          created_by: adminUser.id,
        });
        if (insertError) throw insertError;
      }

      const { error } = await supabase
        .from('quote_suggestions')
        .update({ status: 'approved', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }

    if (action === 'reject-suggestion') {
      const { error } = await supabase
        .from('quote_suggestions')
        .update({ status: 'rejected', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }

    if (action === 'delete-suggestion') {
      const { error } = await supabase.from('quote_suggestions').delete().eq('id', id);
      if (error) throw error;
    }

    await refreshAll();
  } catch (error) {
    console.error('admin action:', error);
    setMessage(els.adminMessage, normalizeError(error), 'error');
  } finally {
    button.disabled = false;
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

async function init() {
  initTheme();
  bindModalEvents();

  els.adminThemeBtn.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
  els.refreshAdminBtn.addEventListener('click', refreshAll);
  els.addQuoteBtn.addEventListener('click', addQuote);
  els.quotesList.addEventListener('click', handleAdminAction);
  els.suggestionsList.addEventListener('click', handleAdminAction);
  els.saveQuoteBtn.addEventListener('click', saveEditedQuote);
  els.editQuoteForm.addEventListener('submit', (e) => e.preventDefault());

  const ok = await checkAccess();
  if (!ok) return;

  await refreshAll();
  window.setInterval(refreshAll, 15000);
}

document.addEventListener('DOMContentLoaded', init);
