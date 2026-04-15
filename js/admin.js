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
  quotesList: $('quotesList'),
  suggestionsList: $('suggestionsList'),
  reloadQuotesBtn: $('reloadQuotesBtn'),
  reloadSuggestionsBtn: $('reloadSuggestionsBtn'),
};

let adminUser = null;

function setMessage(el, text = '', type = 'info') {
  if (!el) return;
  el.textContent = text;
  const colors = { info: 'var(--muted)', success: 'var(--success)', error: 'var(--danger)' };
  el.style.color = colors[type] || colors.info;
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

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function checkAccess() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Ошибка session:', sessionError);
    els.adminStatus.textContent = 'Ошибка чтения сессии.';
    els.accessDenied.classList.remove('hidden');
    return false;
  }

  const user = session?.user;
  if (!user) {
    els.adminStatus.textContent = 'Сначала войди на главной странице.';
    els.accessDenied.classList.remove('hidden');
    return false;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role')
    .eq('id', user.id)
    .maybeSingle();

  console.log('SESSION USER ID:', user.id);
  console.log('PROFILE:', data);
  console.log('PROFILE ERROR:', error);

  if (error) {
    els.adminStatus.textContent = `Ошибка доступа к profiles: ${error.message}`;
    els.accessDenied.classList.remove('hidden');
    return false;
  }

  if (!data) {
    els.adminStatus.textContent = 'Профиль не найден.';
    els.accessDenied.classList.remove('hidden');
    return false;
  }

  if (data.role !== 'admin') {
    els.adminStatus.textContent = `Роль пользователя: ${data.role}`;
    els.accessDenied.classList.remove('hidden');
    return false;
  }

  adminUser = data;
  els.adminStatus.textContent = `Администратор: ${data.email}`;
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

function badgeClass(status) {
  if (status === 'pending') return 'badge pending';
  if (status === 'rejected') return 'badge rejected';
  return 'badge';
}

async function loadQuotes() {
  const { data, error } = await supabase
    .from('quotes')
    .select('id,text,status,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    els.quotesList.innerHTML = '<div class="admin-item"><p>Не удалось загрузить цитаты.</p></div>';
    return;
  }

  if (!data?.length) {
    els.quotesList.innerHTML = '<div class="admin-item"><p>Пока пусто.</p></div>';
    return;
  }

  els.quotesList.innerHTML = data.map((item) => `
    <article class="admin-item">
      <p>${escapeHtml(item.text)}</p>
      <div class="admin-item-meta">
        <span class="${badgeClass(item.status)}">${escapeHtml(item.status)}</span>
        <span>${new Date(item.created_at).toLocaleString('ru-RU')}</span>
      </div>
      <div class="admin-item-actions">
        <button class="text-btn" type="button" data-action="approve-quote" data-id="${item.id}">Опубликовать</button>
        <button class="text-btn" type="button" data-action="reject-quote" data-id="${item.id}">Скрыть</button>
        <button class="text-btn danger" type="button" data-action="delete-quote" data-id="${item.id}">Удалить</button>
      </div>
    </article>
  `).join('');
}

async function loadSuggestions() {
  const { data, error } = await supabase
    .from('quote_suggestions')
    .select('id,text,status,created_at,user_id')
    .order('created_at', { ascending: false });

  if (error) {
    els.suggestionsList.innerHTML = '<div class="admin-item"><p>Не удалось загрузить предложения.</p></div>';
    return;
  }

  if (!data?.length) {
    els.suggestionsList.innerHTML = '<div class="admin-item"><p>Пока нет предложений.</p></div>';
    return;
  }

  els.suggestionsList.innerHTML = data.map((item) => `
    <article class="admin-item">
      <p>${escapeHtml(item.text)}</p>
      <div class="admin-item-meta">
        <span class="${badgeClass(item.status)}">${escapeHtml(item.status)}</span>
        <span>${new Date(item.created_at).toLocaleString('ru-RU')}</span>
      </div>
      <div class="admin-item-actions">
        <button class="text-btn primary" type="button" data-action="approve-suggestion" data-id="${item.id}">Принять</button>
        <button class="text-btn" type="button" data-action="reject-suggestion" data-id="${item.id}">Отклонить</button>
        <button class="text-btn danger" type="button" data-action="delete-suggestion" data-id="${item.id}">Удалить</button>
      </div>
    </article>
  `).join('');
}

async function refreshAll() {
  await Promise.all([loadStats(), loadQuotes(), loadSuggestions()]);
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
    console.error(error);
    setMessage(els.adminMessage, error.message || 'Ошибка.', 'error');
  } finally {
    els.addQuoteBtn.disabled = false;
  }
}

async function handleAdminAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  button.disabled = true;
  try {
    if (action === 'approve-quote') {
      await supabase.from('quotes').update({ status: 'approved' }).eq('id', id);
    }
    if (action === 'reject-quote') {
      await supabase.from('quotes').update({ status: 'rejected' }).eq('id', id);
    }
    if (action === 'delete-quote') {
      await supabase.from('quotes').delete().eq('id', id);
    }
    if (action === 'approve-suggestion') {
      const { data: suggestion } = await supabase.from('quote_suggestions').select('text').eq('id', id).maybeSingle();
      if (suggestion?.text) {
        await supabase.from('quotes').insert({ text: suggestion.text, status: 'approved', created_by: adminUser.id });
      }
      await supabase.from('quote_suggestions').update({ status: 'approved', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    }
    if (action === 'reject-suggestion') {
      await supabase.from('quote_suggestions').update({ status: 'rejected', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    }
    if (action === 'delete-suggestion') {
      await supabase.from('quote_suggestions').delete().eq('id', id);
    }
    await refreshAll();
  } finally {
    button.disabled = false;
  }
}

async function init() {
  initTheme();
  els.adminThemeBtn.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
  els.addQuoteBtn.addEventListener('click', addQuote);
  els.reloadQuotesBtn.addEventListener('click', loadQuotes);
  els.reloadSuggestionsBtn.addEventListener('click', loadSuggestions);
  els.quotesList.addEventListener('click', handleAdminAction);
  els.suggestionsList.addEventListener('click', handleAdminAction);

  const ok = await checkAccess();
  if (!ok) return;
  await refreshAll();
}

document.addEventListener('DOMContentLoaded', init);
