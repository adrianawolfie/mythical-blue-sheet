package user

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"raperonzolo/character-sheet/pkg/config"
	"raperonzolo/character-sheet/pkg/storage"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	usersFilename      = "users.jsonl"
	maxUserLimit       = 50
	resetTokenTTL      = 30 * time.Minute
	resetTokenCooldown = time.Minute
)

type Repository struct {
	*sync.RWMutex
	users   map[string]User
	storage storage.Storage
}

func NewRepository(ctx context.Context, s storage.Storage) (Repository, error) {
	repo := Repository{
		RWMutex: new(sync.RWMutex),
		users:   make(map[string]User),
		storage: s,
	}

	reader, err := repo.storage.Reader(ctx, usersFilename)
	if err != nil {
		return repo, err
	}
	defer reader.Close()

	decoder := json.NewDecoder(reader)
	for {
		var user User
		if err := decoder.Decode(&user); err == io.EOF {
			break
		} else if err != nil {
			return repo, err
		}
		repo.users[user.Email] = user
	}

	return repo, nil
}

func (l *Repository) GetByUsername(email string) (User, error) {
	l.RLock()
	defer l.RUnlock()

	user, ok := l.users[email]
	if !ok {
		return User{}, ErrUserNotFound
	}

	return user, nil
}

func (l *Repository) List(ctx context.Context) []User {
	l.RLock()
	defer l.RUnlock()

	users := make([]User, 0, len(l.users))
	for _, user := range l.users {
		users = append(users, user)
	}
	sort.Slice(users, func(i, j int) bool {
		return users[i].Email < users[j].Email
	})
	return users
}

func (l *Repository) IsAdmin(ctx context.Context, email string) bool {
	user, err := l.GetByUsername(email)
	return err == nil && user.IsAdmin
}

func (l *Repository) RequireAdmin(ctx context.Context, email string) (User, error) {
	user, err := l.GetByUsername(email)
	if err != nil {
		return User{}, err
	}
	if !user.IsAdmin {
		return User{}, ErrForbidden
	}
	return user, nil
}

func (l *Repository) ListAdmin(ctx context.Context) []AdminView {
	users := l.List(ctx)
	views := make([]AdminView, 0, len(users))
	for _, u := range users {
		views = append(views, adminView(u))
	}
	return views
}

func (l *Repository) AdminUsersPage(ctx context.Context, email string) (AdminView, []AdminView, error) {
	currentUser, err := l.RequireAdmin(ctx, email)
	if err != nil {
		return AdminView{}, nil, err
	}
	return adminView(currentUser), l.ListAdmin(ctx), nil
}

func (l *Repository) Authenticate(ctx context.Context, email string, password string) (User, bool, error) {
	user, err := l.GetByUsername(email)
	if err != nil {
		return User{}, false, err
	}
	if !user.Enabled {
		return User{}, false, ErrUserDisabled
	}
	return user, user.ValidatePassword(password), nil
}

func (l *Repository) Create(ctx context.Context, user User) error {
	if user.Email == "" {
		return ErrUserEmailRequired
	}
	if err := validatePassword(user.Password); err != nil {
		return err
	}

	l.Lock()
	defer l.Unlock()

	if len(l.users) >= maxUserLimit {
		return ErrUserLimitReached
	}

	if _, ok := l.users[user.Email]; ok {
		return ErrUserAlreadyExists
	}

	user.ID = uuid.Must(uuid.NewV7())
	user.Password = encryptPassword(user.Password + config.UserSecret)

	writer, err := l.storage.Writer(ctx, usersFilename)
	if err != nil {
		return fmt.Errorf("failed to open user file, %w", err)
	}

	l.users[user.Email] = user

	encoder := json.NewEncoder(writer)
	for _, u := range l.users {
		if err := encoder.Encode(u); err != nil {
			_ = writer.Close()
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close user file, %w", err)
	}

	return nil
}

func (l *Repository) UpdateProfile(ctx context.Context, email string, name string, currentPassword string, newPassword string) (User, error) {
	l.Lock()
	defer l.Unlock()

	u, ok := l.users[email]
	if !ok {
		return User{}, ErrUserNotFound
	}
	if newPassword != "" {
		if !u.ValidatePassword(currentPassword) {
			return User{}, ErrPasswordMismatch
		}
		if err := validatePassword(newPassword); err != nil {
			return User{}, err
		}
		u.Password = encryptPassword(newPassword + config.UserSecret)
		u.ResetTokenHash = ""
		u.ResetTokenExpiresAt = time.Time{}
	}
	u.Name = name

	writer, err := l.storage.Writer(ctx, usersFilename)
	if err != nil {
		return User{}, fmt.Errorf("failed to open user file, %w", err)
	}
	l.users[email] = u
	encoder := json.NewEncoder(writer)
	for _, user := range l.users {
		if err := encoder.Encode(user); err != nil {
			_ = writer.Close()
			return User{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return User{}, fmt.Errorf("failed to close user file, %w", err)
	}

	return u, nil
}

func (l *Repository) UpdateByID(ctx context.Context, id string, next User) (User, error) {
	if id == "" {
		return User{}, ErrUserIDRequired
	}
	if next.Email == "" {
		return User{}, ErrUserEmailRequired
	}
	if next.Password != "" {
		if err := validatePassword(next.Password); err != nil {
			return User{}, err
		}
	}

	l.Lock()
	defer l.Unlock()

	var existingEmail string
	var existing User
	for email, u := range l.users {
		if u.ID.String() == id {
			existingEmail = email
			existing = u
			break
		}
	}
	if existingEmail == "" {
		return User{}, ErrUserNotFound
	}
	if existingEmail != next.Email {
		if _, ok := l.users[next.Email]; ok {
			return User{}, ErrUserAlreadyExists
		}
	}

	existing.Name = next.Name
	existing.Email = next.Email
	existing.IsAdmin = next.IsAdmin
	existing.Enabled = next.Enabled
	if next.Password != "" {
		existing.Password = encryptPassword(next.Password + config.UserSecret)
		existing.ResetTokenHash = ""
		existing.ResetTokenExpiresAt = time.Time{}
	}

	writer, err := l.storage.Writer(ctx, usersFilename)
	if err != nil {
		return User{}, fmt.Errorf("failed to open user file, %w", err)
	}
	delete(l.users, existingEmail)
	l.users[existing.Email] = existing
	encoder := json.NewEncoder(writer)
	for _, user := range l.users {
		if err := encoder.Encode(user); err != nil {
			_ = writer.Close()
			return User{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return User{}, fmt.Errorf("failed to close user file, %w", err)
	}

	return existing, nil
}

func (l *Repository) CreatePasswordResetToken(ctx context.Context, email string) (string, error) {
	l.Lock()
	defer l.Unlock()

	u, ok := l.users[email]
	if !ok {
		return "", ErrUserNotFound
	}
	now := time.Now().UTC()
	if u.ResetTokenHash != "" && now.Before(u.ResetTokenExpiresAt) && now.Sub(u.ResetTokenExpiresAt.Add(-resetTokenTTL)) < resetTokenCooldown {
		return "", ErrPasswordResetRateLimited
	}

	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", err
	}
	token := u.ID.String() + "." + base64.RawURLEncoding.EncodeToString(secret)
	hash := sha256.Sum256(secret)
	u.ResetTokenHash = hex.EncodeToString(hash[:])
	u.ResetTokenExpiresAt = now.Add(resetTokenTTL)
	l.users[email] = u
	if err := l.saveUsers(ctx); err != nil {
		return "", err
	}
	return token, nil
}

func (l *Repository) PasswordResetTokenValid(token string) bool {
	id, secret, ok := parsePasswordResetToken(token)
	if !ok {
		return false
	}
	hash := sha256.Sum256(secret)
	want := hex.EncodeToString(hash[:])

	l.RLock()
	defer l.RUnlock()
	for _, u := range l.users {
		if u.ID == id && u.ResetTokenHash != "" && time.Now().Before(u.ResetTokenExpiresAt) {
			return subtle.ConstantTimeCompare([]byte(want), []byte(u.ResetTokenHash)) == 1
		}
	}
	return false
}

func (l *Repository) ResetPassword(ctx context.Context, token string, password string) error {
	if err := validatePassword(password); err != nil {
		return err
	}
	id, secret, ok := parsePasswordResetToken(token)
	if !ok {
		return ErrResetTokenInvalid
	}
	hash := sha256.Sum256(secret)
	want := hex.EncodeToString(hash[:])

	l.Lock()
	defer l.Unlock()
	for email, u := range l.users {
		if u.ID != id || u.ResetTokenHash == "" || !time.Now().Before(u.ResetTokenExpiresAt) || subtle.ConstantTimeCompare([]byte(want), []byte(u.ResetTokenHash)) != 1 {
			continue
		}
		u.Password = encryptPassword(password + config.UserSecret)
		u.ResetTokenHash = ""
		u.ResetTokenExpiresAt = time.Time{}
		l.users[email] = u
		return l.saveUsers(ctx)
	}
	return ErrResetTokenInvalid
}

func parsePasswordResetToken(token string) (uuid.UUID, []byte, bool) {
	idText, secretText, ok := strings.Cut(token, ".")
	if !ok {
		return uuid.Nil, nil, false
	}
	id, err := uuid.Parse(idText)
	if err != nil {
		return uuid.Nil, nil, false
	}
	secret, err := base64.RawURLEncoding.DecodeString(secretText)
	if err != nil || len(secret) != 32 {
		return uuid.Nil, nil, false
	}
	return id, secret, true
}

func (l *Repository) saveUsers(ctx context.Context) error {
	writer, err := l.storage.Writer(ctx, usersFilename)
	if err != nil {
		return fmt.Errorf("failed to open user file, %w", err)
	}
	encoder := json.NewEncoder(writer)
	for _, u := range l.users {
		if err := encoder.Encode(u); err != nil {
			_ = writer.Close()
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close user file, %w", err)
	}
	return nil
}

func adminView(u User) AdminView {
	return AdminView{ID: u.ID.String(), Name: u.Name, Email: u.Email, IsAdmin: u.IsAdmin, Enabled: u.Enabled}
}
