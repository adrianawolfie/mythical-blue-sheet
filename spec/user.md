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

## HTTP Routes

- `GET /api/me` returns the current user ID, name, and email from the `user` cookie, or `401` when no valid user cookie is present.
- `PUT /api/me` updates the logged-in user's name and optionally password. Password changes require `currentPassword` and `newPassword`; name-only changes require only a valid login cookie.
- `GET /api/admin/users` returns the current admin user, registered users, and user count for the static admin users page.
- `PUT /admin/users/{id}` updates a user as an admin, including optional password changes and enabling or disabling login.

- `GET /login` renders the login page.
- `POST /login` authenticates a user and sets the `user` cookie.
- `GET /register` renders the registration page.
- `POST /users` creates a user and redirects to login.
- `GET /admin` redirects to `/admin/users.html`.
- `GET /admin/users.html` is served from `public/admin/users.html` by the static file server; admin data is protected by `/api/admin/users`.
- `GET /admin/characters.html` is served from `public/admin/characters.html` by the static file server; admin data is protected by `/api/admin/characters`.
- `POST /admin/characters/{id}/assignment` assigns a character to a user.
- `GET /admin/campaigns.html` is served from `public/admin/campaigns.html` by the static file server; admin data is protected by `/api/admin/campaigns`.
