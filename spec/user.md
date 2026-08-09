# User Domain

Package: `pkg/user`

The User domain stores users for login, registration, character ownership, and admin access. Password validation and password hashing belong to this domain.

## Repository Behavior

- `GetByUsername` loads a user by email.
- `List` returns users sorted by email.
- `IsAdmin` checks admin access.
- `Create` validates and persists a new user.

## HTTP Routes

- `GET /login` renders the login page.
- `POST /login` authenticates a user and sets the `user` cookie.
- `GET /register` renders the registration page.
- `POST /users` creates a user and redirects to login.
- `GET /admin` redirects to `/admin/users`.
- `GET /admin/users` renders the admin users page.
- `GET /admin/characters` renders the admin character assignment page.
- `POST /admin/characters/{id}/assignment` assigns a character to a user.
- `GET /admin/campaigns` renders the admin campaign state page.
