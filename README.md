# Мудрость дня

Готовый статический фронт для GitHub Pages + Supabase.

## Что уже есть
- главная страница с цитатой
- вход и регистрация в модальном окне
- личный кабинет в модальном окне
- предложение цитаты в модальном окне
- лайк / дизлайк без текста и счетчиков
- админка
- светлая и тёмная тема

## Что проверить перед публикацией
1. В Supabase выполни `schema.sql`.
2. Зарегистрируй первый аккаунт через сайт.
3. Выполни в SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'ТВОЯ_ПОЧТА';
```

4. В Supabase -> Authentication -> URL Configuration укажи:
- Site URL: `https://arerrurs.github.io/PlanB/`
- Redirect URLs:
  - `https://arerrurs.github.io/PlanB/`
  - `https://arerrurs.github.io/PlanB/index.html`
  - `https://arerrurs.github.io/PlanB/admin.html`

## Структура
- `index.html` — главная
- `admin.html` — админка
- `styles.css` — общие стили
- `js/app.js` — логика главной страницы
- `js/admin.js` — логика админки
- `js/config.js` — подключение Supabase
- `schema.sql` — схема базы

## Публикация на GitHub Pages
Загрузи файлы в репозиторий и включи GitHub Pages на ветке с этими файлами.
