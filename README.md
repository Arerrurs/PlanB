# Мудрость дня — обновлённая сборка

## Что уже исправлено
- тема работает и на главной, и в админке
- в админке есть редактирование опубликованных цитат
- в админке видно лайки/дизлайки по каждой цитате и общую статистику
- обычные пользователи могут отправлять цитаты на модерацию
- в админке виден список пользователей
- кнопка «Поделиться» отправляет текст цитаты вместе со ссылкой

## Если у тебя уже есть проект в Supabase
Выполни файл `fix_existing_project.sql` в SQL Editor.

## Если запускаешь с нуля
Выполни файл `schema.sql` в SQL Editor.

## Файлы конфигурации
В `js/config.js` должны быть:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

## Как выдать себе админку
```sql
update profiles
set role = 'admin'
where email = 'твоя_почта';
```

## Supabase: что ещё важно вручную
1. Authentication → URL Configuration
   - Site URL: `https://arerrurs.github.io/PlanB/`
   - Redirect URLs:
     - `https://arerrurs.github.io/PlanB/`
     - `https://arerrurs.github.io/PlanB/index.html`
     - `https://arerrurs.github.io/PlanB/admin.html`

2. Authentication → Providers → Email
   - если не хочешь письмо подтверждения — выключи `Confirm Email`

## Загрузка на GitHub Pages
Залей все файлы в репозиторий и включи GitHub Pages для ветки с проектом.


## Что исправлено в v3
- главная страница больше не должна зависать для обычных аккаунтов, даже если какой-то запрос к Supabase тормозит
- выход из аккаунта теперь выполняется в локальном режиме и очищает браузерную сессию
- отправка предложения цитаты не должна навсегда висеть на «Отправляем...»
- загрузка профиля и голоса теперь не блокирует загрузку самой цитаты


Обновление v5:
- для уже существующего проекта выполни `fix_existing_project.sql`, чтобы добавить настройку `show_only_liked` в `profiles`.


## Что обязательно сделать в Supabase для регистрации без подтверждения почты

1. Открой **Authentication → Providers → Email**.
2. Выключи **Confirm email**.
3. В **Authentication → URL Configuration** поставь:
   - **Site URL**: `https://arerrurs.github.io/PlanB/`
   - **Redirect URLs**: `https://arerrurs.github.io/PlanB/*`

Пока Confirm email включён, пользователь не сможет зарегистрироваться и сразу войти без письма.

## После обновления существующего проекта

Если проект уже создан, выполни `fix_existing_project.sql` в SQL Editor.
