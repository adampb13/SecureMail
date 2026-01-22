# SecureMail

Lekka skrzynka pocztowa z 2FA (TOTP) i szyfrowaniem dla treści/załączników.

## Stos
- Backend: FastAPI + SQLAlchemy, Argon2 dla haseł, JWT na sesje, TOTP (pyotp)
- Frontend: statyczny (HTML/CSS/JS) serwowany przez Nginx
- Nginx: reverse proxy + TLS (samopodpisany cert w obrazie)
- Baza: Postgres w docker-compose

## Uruchomienie
```bash
docker compose up -d --build
```
- Frontend: `https://localhost:8443` (samopodpisany cert – zaakceptuj w przeglądarce) lub redirect z `http://localhost:8080`.
- Backend nie jest wystawiony na hosta (port 8000 tylko w sieci Compose).

## Rejestracja i logowanie
1. Zarejestruj się podając email i hasło.
2. Odbierz TOTP URI, dodaj do aplikacji 2FA.
3. Logowanie wymaga hasła + kodu TOTP.

### Polityka haseł
- Min. 8 znaków, co najmniej: jedna wielka litera, jedna mała, jedna cyfra, jeden znak specjalny.

## Wiadomości
- Treść i załączniki szyfrowane per wiadomość; weryfikacja podpisu nadawcy.
- Pobieranie załączników przez `/api/attachments/{id}` (wymaga tokenu).
