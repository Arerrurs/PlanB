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
  adminStatus: $('adminStatus'),
  accessDenied: $('accessDenied'),
  adminContent: $('adminContent'),

  quotesList: $('quotesList'),
  suggestionsList: $('suggestionsList'),

  totalQuotes: $('totalQuotes'),
  totalPending: $('totalPending'),
  totalLikes: $('totalLikes'),
  totalDislikes: $('totalDislikes'),

  newQuoteText: $('newQuoteText'),
  addQuoteBtn: $('addQuoteBtn'),
  addQuoteMessage: $('addQuoteMessage'),

  refreshAdminBtn: $('refreshAdminBtn'),
};

let adminUser = null;

function setText(el, text) {
  if (el) el.textContent = text ?? '';
}

function setMessage(el, text, type = 'info') {
  if (!el) return;
  el.textContent = text || '';
  const colors = {
    info: '#5f6368',
    success: '#188038',
    error: '#d93025',
  };
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

async function checkAccess() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Session error:', sessionError);
    setText(els.adminStatus, 'Ошибка чтения сессии.');
    els.accessDenied?.classList.remove('hidden');
    els.adminContent?.classList.add('hidden');
    return false;
  }

  const user = session?.user;

  if (!user) {
    setText(els.adminStatus, 'Сначала войди на главной странице.');
    els.accessDenied?.classList.remove('hidden');
    els.adminContent?.classList.add('hidden');
    return false;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', user.id)
    .maybeSingle();

  console.log('ADMIN SESSION USER:', user);
  console.log('ADMIN PROFILE:', data);
  console.log('ADMIN PROFILE ERROR:', error);

  if (error) {
    setText(els.adminStatus, `Ошибка доступа к profiles: ${error.message}`);
    els.accessDenied?.classList.remove('hidden');
    els.adminContent?.classList.add('hidden');
    return false;
  }

  if (!data) {
    setText(els.adminStatus, 'Профиль не найден.');
    els.accessDenied?.classList.remove('hidden');
    els.adminContent?.classList.add('hidden');
    return false;
  }

  if (data.role !== 'admin') {
    setText(els.adminStatus, `Нет доступа. Текущая роль: ${data.role || 'не задана'}`);
    els.accessDenied?.classList.remove('hidden');
    els.adminContent?.classList.add('hidden');
    return false;
  }

  adminUser = data;
  setText(els.adminStatus, `Администратор: ${data.email}`);
  els.accessDenied?.classList.add('hidden');
  els.adminContent?.classList.remove('hidden');
  return true;
}

async function loadStats() {
  const { count: quotesCount } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true });

  const { count: pendingCount } = await supabase
    .from('quote_suggestions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { count: likesCount } = await supabase
    .from('quote_votes')
    .select('*', { count: 'exact', head: true })
    .eq('vote', 'like');

  const { count: dislikesCount } = await supabase
    .from('quote_votes')
    .select('*', { count: 'exact', head: true })
    .eq('vote', 'dislike');

  setText(els.totalQuotes, String(quotesCount || 0));
  setText(els.totalPending, String(pendingCount || 0));
  setText(els.totalLikes, String(likesCount || 0));
  setText(els.totalDislikes, String(dislikesCount || 0));
}

async function loadQuotes() {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, text, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Quotes load error:', error);
    if (els.quotesList) {
      els.quotesList.innerHTML = `<div class="admin-empty">Не удалось загрузить цитаты.</div>`;
    }
    return;
  }

  if (!data || data.length === 0) {
    if (els.quotesList) {
      els.quotesList.innerHTML = `<div class="admin-empty">Цитат пока нет.</div>`;
    }
    return;
  }

  if (els.quotesList) {
    els.quotesList.innerHTML = data.map((quote) => `
      <div class="admin-item" data-id="${quote.id}">
        <div class="admin-item__main">
          <div class="admin-item__text">${escapeHtml(quote.text)}</div>
          <div class="admin-item__meta">
            <span class="chip">${escapeHtml(quote.status)}</span>
            <span>${new Date(quote.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div class="admin-item__actions">
          <button class="admin-btn" data-action="approve" data-id="${quote.id}">Опубликовать</button>
          <button class="admin-btn" data-action="delete-quote" data-id="${quote.id}">Удалить</button>
        </div>
      </div>
    `).join('');
  }
}

async function loadSuggestions() {
  const { data, error } = await supabase
    .from('quote_suggestions')
    .select('id, text, status, created_at, user_id')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Suggestions load error:', error);
    if (els.suggestionsList) {
      els.suggestionsList.innerHTML = `<div class="admin-empty">Не удалось загрузить предложения.</div>`;
    }
    return;
  }

  if (!data || data.length === 0) {
    if (els.suggestionsList) {
      els.suggestionsList.innerHTML = `<div class="admin-empty">Предложений пока нет.</div>`;
    }
    return;
  }

  if (els.suggestionsList) {
    els.suggestionsList.innerHTML = data.map((item) => `
      <div class="admin-item" data-id="${item.id}">
        <div class="admin-item__main">
          <div class="admin-item__text">${escapeHtml(item.text)}</div>
          <div class="admin-item__meta">
            <span class="chip">${escapeHtml(item.status)}</span>
            <span>${new Date(item.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div class="admin-item__actions">
          <button class="admin-btn" data-action="approve-suggestion" data-id="${item.id}">Принять</button>
          <button class="admin-btn" data-action="reject-suggestion" data-id="${item.id}">Отклонить</button>
          <button class="admin-btn" data-action="delete-suggestion" data-id="${item.id}">Удалить</button>
        </div>
      </div>
    `).join('');
  }
}

async function addQuote() {
  const text = els.newQuoteText?.value?.trim();

  if (!text) {
    setMessage(els.addQuoteMessage, 'Напиши текст цитаты.', 'error');
    return;
  }

  setMessage(els.addQuoteMessage, 'Добавляем...', 'info');
  els.addQuoteBtn && (els.addQuoteBtn.disabled = true);

  const { error } = await supabase
    .from('quotes')
    .insert({
      text,
      status: 'approved',
      created_by: adminUser?.id ?? null,
    });

  els.addQuoteBtn && (els.addQuoteBtn.disabled = false);

  if (error) {
    console.error('Add quote error:', error);
    setMessage(els.addQuoteMessage, error.message, 'error');
    return;
  }

  if (els.newQuoteText) els.newQuoteText.value = '';
  setMessage(els.addQuoteMessage, 'Цитата добавлена.', 'success');
  await refreshAdminData();
}

async function approveQuote(id) {
  const { error } = await supabase
    .from('quotes')
    .update({ status: 'approved' })
    .eq('id', id);

  if (error) {
    alert(`Ошибка: ${error.message}`);
    return;
  }

  await refreshAdminData();
}

async function deleteQuote(id) {
  const ok = confirm('Удалить цитату?');
  if (!ok) return;

  const { error } = await supabase
    .from('quotes')
    .delete()
    .eq('id', id);

  if (error) {
    alert(`Ошибка: ${error.message}`);
    return;
  }

  await refreshAdminData();
}

async function approveSuggestion(id) {
  const { data, error } = await supabase
    .from('quote_suggestions')
    .select('id, text')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    alert(`Ошибка чтения предложения: ${error?.message || 'не найдено'}`);
    return;
  }

  const { error: insertError } = await supabase
    .from('quotes')
    .insert({
      text: data.text,
      status: 'approved',
      created_by: adminUser?.id ?? null,
    });

  if (insertError) {
    alert(`Ошибка добавления цитаты: ${insertError.message}`);
    return;
  }

  const { error: updateError } = await supabase
    .from('quote_suggestions')
    .update({
      status: 'approved',
      reviewed_by: adminUser?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    alert(`Ошибка обновления предложения: ${updateError.message}`);
    return;
  }

  await refreshAdminData();
}

async function rejectSuggestion(id) {
  const { error } = await supabase
    .from('quote_suggestions')
    .update({
      status: 'rejected',
      reviewed_by: adminUser?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    alert(`Ошибка: ${error.message}`);
    return;
  }

  await refreshAdminData();
}

async function deleteSuggestion(id) {
  const ok = confirm('Удалить предложение?');
  if (!ok) return;

  const { error } = await supabase
    .from('quote_suggestions')
    .delete()
    .eq('id', id);

  if (error) {
    alert(`Ошибка: ${error.message}`);
    return;
  }

  await refreshAdminData();
}

async function refreshAdminData() {
  await Promise.all([
    loadStats(),
    loadQuotes(),
    loadSuggestions(),
  ]);
}

function bindAdminActions() {
  els.addQuoteBtn?.addEventListener('click', addQuote);
  els.refreshAdminBtn?.addEventListener('click', refreshAdminData);

  els.quotesList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'approve') await approveQuote(id);
    if (action === 'delete-quote') await deleteQuote(id);
  });

  els.suggestionsList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'approve-suggestion') await approveSuggestion(id);
    if (action === 'reject-suggestion') await rejectSuggestion(id);
    if (action === 'delete-suggestion') await deleteSuggestion(id);
  });
}

async function init() {
  bindAdminActions();

  const access = await checkAccess();
  if (!access) return;

  await refreshAdminData();
}

document.addEventListener('DOMContentLoaded', init);