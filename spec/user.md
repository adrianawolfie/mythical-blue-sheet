# User Domain

Package: `pkg/user`

The User domain stores users for login, registration, character ownership, admin access, and account enabled status. Password validation and password hashing belong to this domain. Newly registered users are disabled by default because `enabled` has a false zero value.

## Repository Behavior

- `GetByUsername` loads a user by email.
- `List` returns users sorted by email.
- `IsAdmin` checks admin access.
- `Authenticate` validates login credentials and rejects users whose `enabled` field is false.
- `Create` validates and persists a new user.
- `UpdateProfile` updates the logged-in user's name and optionally updates their password. Name-only updates do not require the current password; password updates require the current password and validate the new password with the same rules as registration.
- `UpdateByID` updates a user by ID for admin user management, including the enabled flag. Admin password updates do not require the user's current password; provided passwords use the same validation rules as registration.
- `CreatePasswordResetToken` creates a 30-minute reset token containing the user ID and a random secret. Only the secret hash and expiry are persisted; requests for the same account are limited to one per minute.
- `PasswordResetTokenValid` checks the token without consuming it, so reset pages can validate links without email security scanners using them up.
- `ResetPassword` validates the password and token, updates the password, and clears the token so it is single-use. Profile and admin password changes also invalidate pending reset tokens.

## HTTP Routes

- `GET /api/me` returns the current user ID, name, and email from the `user` cookie, or `401` when no valid user cookie is present.
- `PUT /api/me` updates the logged-in user's name and optionally password. Password changes require `currentPassword` and `newPassword`; name-only changes require only a valid login cookie.
- `POST /api/password-reset/request` accepts an email address and emails a reset link if an account exists. It always returns `204` to avoid revealing whether an account exists.
- `POST /api/password-reset/validate` checks a reset token without consuming it.
- `POST /api/password-reset/confirm` accepts a reset token and `newPassword`, then updates the account password.
- `GET /api/admin/users` returns the current admin user, registered users, and user count for the static admin users page.
- `PUT /api/admin/users/{id}` updates a user as an admin, including optional password changes and enabling or disabling login.

- `GET /login.html` is served from `public/login.html` by the static file server.
- `POST /api/login` authenticates a user and sets the `user` cookie.
- `GET /register.html` is served from `public/register.html` by the static file server.
- `POST /api/register` creates a user and redirects to `/login.html`.
- `GET /forgot-password.html` is served from `public/forgot-password.html`; its form submits to `POST /api/password-reset/request`.
- `GET /reset-password.html?token={token}` is served from `public/reset-password.html`; it validates and submits the token through the password-reset APIs.
- `GET /admin/users.html` is served from `public/admin/users.html` by the static file server; admin data is protected by `/api/admin/users`.
- `GET /admin/characters.html` is served from `public/admin/characters.html` by the static file server; admin data is protected by `/api/admin/characters`.
- `GET /admin/versions.html?id={id}` is served from `public/admin/versions.html`; character version metadata is protected by `/api/admin/characters/{id}/history`.
- `POST /api/admin/characters/{id}/assignment` assigns a character to a user.
- `GET /admin/campaigns.html` is served from `public/admin/campaigns.html` by the static file server; admin data is protected by `/api/admin/campaigns`.
