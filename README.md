# Мудрость дня

Статический фронт для GitHub Pages + Supabase для базы и авторизации.

## Что внутри
- `index.html` — главная страница
- `admin.html` — админка
- `styles.css` — общие стили
- `js/app.js` — логика сайта
- `js/admin.js` — логика админки
- `js/config.js` — сюда вставляются ключи Supabase
- `schema.sql` — SQL для таблиц, триггеров и политик

## Как запустить
1. Создай проект в Supabase.
2. В SQL Editor выполни `schema.sql`.
3. В `Authentication > Providers` оставь Email auth включённым.
4. В `Project Settings > API` скопируй `Project URL` и `anon public` key.
5. Вставь их в `js/config.js`.
6. Зарегистрируй первый аккаунт через сайт.
7. В Supabase SQL Editor выполни:
   ```sql
   update public.profiles set role = 'admin' where email = 'твой@email';
   ```
8. Залей файлы в репозиторий GitHub.
9. Включи GitHub Pages для ветки `main`.

## Важно
- В браузере используй только `anon` key.
- `service_role` key в браузер класть нельзя.
- Без настроенных RLS-политик данные будут плохо защищены.
