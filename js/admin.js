import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const themeBtn = document.getElementById('themeBtn');
const quotesList = document.getElementById('quotesList');
const suggestionsList = document.getElementById('suggestionsList');
const searchInput = document.getElementById('searchInput');
const adminStatus = document.getElementById('adminStatus');
const newQuoteForm = document.getElementById('newQuoteForm');
const newQuoteText = document.getElementById('newQuoteText');
const newQuoteStatus = document.getElementById('newQuoteStatus');
const newQuoteStatusText = document.getElementById('newQuoteStatusText');

const statQuotes = document.getElementById('statQuotes');
const statApproved = document.getElementById('statApproved');
const statPending = document.getElementById('statPending');
const statLikes = document.getElementById('statLikes');
const statDislikes = document.getElementById('statDislikes');

let allQuotes = [];
let allSuggestions = [];

function setStatus(el, text = '', isError = false) {
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return applyTheme(saved);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

async function ensureAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.href = './index.html';
    return false;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (profile?.role !== 'admin') {
    window.location.href = './index.html';
    return false;
  }

  return true;
}

async function loadDashboard() {
  setStatus(adminStatus, 'Загружаем данные...');

  const [quotesRes, suggestionsRes] = await Promise.all([
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('quote_suggestions').select('*').order('created_at', { ascending: false }),
  ]);

  if (quotesRes.error || suggestionsRes.error) {
    setStatus(adminStatus, quotesRes.error?.message || suggestionsRes.error?.message || 'Ошибка загрузки.', true);
    return;
  }

  allQuotes = quotesRes.data || [];
  allSuggestions = suggestionsRes.data || [];

  renderStats();
  renderQuotes();
  renderSuggestions();
  setStatus(adminStatus, '');
}

function renderStats() {
  const approved = allQuotes.filter(q => q.status === 'approved');
  const pending = allQuotes.filter(q => q.status === 'pending');
  statQuotes.textContent = String(allQuotes.length);
  statApproved.textContent = String(approved.length);
  statPending.textContent = String(pending.length + allSuggestions.filter(s => s.status === 'pending').length);
  statLikes.textContent = String(allQuotes.reduce((sum, q) => sum + (q.like_count || 0), 0));
  statDislikes.textContent = String(allQuotes.reduce((sum, q) => sum + (q.dislike_count || 0), 0));
}

function quoteCardTemplate(quote) {
  return `
    <article class="admin-item">
      <textarea data-role="text">${escapeHtml(quote.text)}</textarea>
      <div class="admin-item-meta">
        <span>ID: ${quote.id}</span>
        <span>👍 ${quote.like_count || 0}</span>
        <span>👎 ${quote.dislike_count || 0}</span>
      </div>
      <div class="admin-actions">
        <select data-role="status">
          <option value="approved" ${quote.status === 'approved' ? 'selected' : ''}>Опубликована</option>
          <option value="pending" ${quote.status === 'pending' ? 'selected' : ''}>На модерации</option>
          <option value="rejected" ${quote.status === 'rejected' ? 'selected' : ''}>Отклонена</option>
        </select>
        <button class="secondary-btn" data-action="save">Сохранить</button>
        <button class="danger-btn" data-action="delete">Удалить</button>
      </div>
    </article>
  `;
}

function suggestionCardTemplate(item) {
  return `
    <article class="admin-item suggestion-item">
      <p>${escapeHtml(item.text)}</p>
      <div class="admin-item-meta">
        <span>${item.user_id ? `Пользователь: ${item.user_id}` : 'Гость'}</span>
        <span>Статус: ${item.status}</span>
      </div>
      <div class="admin-actions">
        <button class="secondary-btn" data-action="approve">Одобрить</button>
        <button class="danger-btn" data-action="reject">Отклонить</button>
      </div>
    </article>
  `;
}

function renderQuotes() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = query
    ? allQuotes.filter(q => q.text.toLowerCase().includes(query))
    : allQuotes;

  quotesList.innerHTML = filtered.length
    ? filtered.map((quote) => `<div class="admin-row" data-id="${quote.id}">${quoteCardTemplate(quote)}</div>`).join('')
    : '<p class="status">Ничего не найдено.</p>';
}

function renderSuggestions() {
  const pending = allSuggestions.filter(item => item.status === 'pending');
  suggestionsList.innerHTML = pending.length
    ? pending.map((item) => `<div class="admin-row" data-id="${item.id}">${suggestionCardTemplate(item)}</div>`).join('')
    : '<p class="status">Новых предложений нет.</p>';
}

async function saveQuote(id, row) {
  const text = row.querySelector('[data-role="text"]').value.trim();
  const status = row.querySelector('[data-role="status"]').value;

  const { error } = await supabase.from('quotes').update({ text, status }).eq('id', id);
  if (error) return setStatus(adminStatus, error.message, true);
  await loadDashboard();
}

async function deleteQuote(id) {
  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) return setStatus(adminStatus, error.message, true);
  await loadDashboard();
}

async function approveSuggestion(id) {
  const item = allSuggestions.find(s => s.id === id);
  if (!item) return;

  const { error: insertError } = await supabase.from('quotes').insert({
    text: item.text,
    status: 'approved',
    created_by: item.user_id,
  });
  if (insertError) return setStatus(adminStatus, insertError.message, true);

  const { error: updateError } = await supabase
    .from('quote_suggestions')
    .update({ status: 'approved' })
    .eq('id', id);

  if (updateError) return setStatus(adminStatus, updateError.message, true);
  await loadDashboard();
}

async function rejectSuggestion(id) {
  const { error } = await supabase
    .from('quote_suggestions')
    .update({ status: 'rejected' })
    .eq('id', id);
  if (error) return setStatus(adminStatus, error.message, true);
  await loadDashboard();
}

async function createQuote(event) {
  event.preventDefault();
  const text = newQuoteText.value.trim();
  if (!text) return;

  const { error } = await supabase.from('quotes').insert({
    text,
    status: newQuoteStatus.value,
  });

  if (error) {
    setStatus(newQuoteStatusText, error.message, true);
    return;
  }

  newQuoteText.value = '';
  newQuoteStatus.value = 'approved';
  setStatus(newQuoteStatusText, 'Цитата добавлена.');
  await loadDashboard();
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

themeBtn.addEventListener('click', () => {
  applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
});
searchInput.addEventListener('input', renderQuotes);
newQuoteForm.addEventListener('submit', createQuote);

quotesList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const row = event.target.closest('.admin-row');
  const id = row?.dataset.id;
  if (!id) return;

  if (button.dataset.action === 'save') await saveQuote(id, row);
  if (button.dataset.action === 'delete') await deleteQuote(id);
});

suggestionsList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const row = event.target.closest('.admin-row');
  const id = row?.dataset.id;
  if (!id) return;

  if (button.dataset.action === 'approve') await approveSuggestion(id);
  if (button.dataset.action === 'reject') await rejectSuggestion(id);
});

initTheme();
if (await ensureAdmin()) {
  await loadDashboard();
}
