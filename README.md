
# Мудрость дня — v17

## Что внутри
- Раздельные модалки входа и регистрации
- Вход по `почте или логину + пароль`
- Таймер автообновления цитаты раз в минуту с чекбоксом `Не использовать таймер`
- Личный кабинет с любимыми/не любимыми цитатами
- Настройки: логин, почта, пароль, акценты светлой/тёмной темы
- Админка: поиск, сортировка, список пользователей, авторы предложений, список тех, кто лайкнул/дизлайкнул

## Как обновить уже существующий проект
1. Замените файлы сайта.
2. Выполните `fix_existing_project.sql` в Supabase SQL Editor.
3. Откройте `js/config.js` и вставьте свои ключи.
4. Сделайте жёсткое обновление страницы.

## Важно про смену почты
Supabase меняет email через письмо-подтверждение. Для статического сайта это нормально и безопасно.

## Важно про удаление пользователя
Удалять нужно в `Authentication -> Users`, а не только в `profiles`.

## URL Configuration
В Supabase:
- Site URL: `https://YOUR_LOGIN.github.io/YOUR_REPO/`
- Redirect URLs: `https://YOUR_LOGIN.github.io/YOUR_REPO/*`

## Отключение подтверждения почты при регистрации
Supabase:
- Authentication -> Sign In / Providers -> Email
- выключить `Confirm email`

## Конфиг
В `js/config.js`:
```js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_PUBLISHABLE_KEY';
```
