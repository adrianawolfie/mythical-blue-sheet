package user

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"raperonzolo/character-sheet/pkg/config"
	"raperonzolo/character-sheet/pkg/storage"
	"sort"
	"sync"

	"github.com/google/uuid"
)

const (
	usersFilename = "users.jsonl"
	maxUserLimit  = 50
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
