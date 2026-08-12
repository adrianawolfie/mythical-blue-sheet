# User Domain

Package: `pkg/user`

The User domain stores users for login, registration, character ownership, and admin access. Password validation and password hashing belong to this domain.

## Repository Behavior

- `GetByUsername` loads a user by email.
- `List` returns users sorted by email.
- `IsAdmin` checks admin access.
- `Authenticate` validates login credentials.
- `Create` validates and persists a new user.
- `UpdateProfile` updates the logged-in user's name and optionally updates their password. Name-only updates do not require the current password; password updates require the current password and validate the new password with the same rules as registration.

## HTTP Routes

- `GET /api/me` returns the current user ID, name, and email from the `user` cookie, or `401` when no valid user cookie is present.
- `PUT /api/me` updates the logged-in user's name and optionally password. Password changes require `currentPassword` and `newPassword`; name-only changes require only a valid login cookie.
- `GET /api/admin/users` returns the current admin user, registered users, and user count for the static admin users page.

- `GET /login` renders the login page.
- `POST /login` authenticates a user and sets the `user` cookie.
- `GET /register` renders the registration page.
- `POST /users` creates a user and redirects to login.
- `GET /admin` redirects to `/admin/users`.
- `GET /admin/users` is served from `public/admin/users.html` by the static file server; admin data is protected by `/api/admin/users`.
- `GET /admin/characters` is served from `public/admin/characters.html` by the static file server; admin data is protected by `/api/admin/characters`.
- `POST /admin/characters/{id}/assignment` assigns a character to a user.
- `GET /admin/campaigns` is served from `public/admin/campaigns.html` by the static file server; admin data is protected by `/api/admin/campaigns`.
