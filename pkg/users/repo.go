package users

import (
	"encoding/json"
	"fmt"
	"io"
	"raperonzolo/character-sheet/pkg/config"
	"raperonzolo/character-sheet/pkg/storage"
	"sync"

	"github.com/google/uuid"
)

const (
	usersFilename = "users.jsonl"
	maxUserLimit  = 50
)

type Repository struct {
	mu      *sync.RWMutex
	users   map[string]User
	storage storage.Storage
}

type Option func(*Repository) error

func WithStorage(s storage.Storage) Option {
	return func(r *Repository) error {
		r.storage = s
		return nil
	}
}

func New(options ...Option) (Repository, error) {
	repo := Repository{
		mu:    new(sync.RWMutex),
		users: make(map[string]User),
	}

	for _, opt := range options {
		if err := opt(&repo); err != nil {
			return repo, err
		}
	}

	if repo.storage == nil {
		return repo, fmt.Errorf("storage is required")
	}

	reader, err := repo.storage.Reader(usersFilename)
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
	l.mu.RLock()
	defer l.mu.RUnlock()

	user, ok := l.users[email]
	if !ok {
		return User{}, ErrUserNotFound
	}

	return user, nil
}

func (l *Repository) Create(user User) error {
	if user.Email == "" {
		return ErrUserEmailRequired
	}
	if err := validatePassword(user.Password); err != nil {
		return err
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.users) >= maxUserLimit {
		return ErrUserLimitReached
	}

	if _, ok := l.users[user.Email]; ok {
		return ErrUserAlreadyExists
	}

	user.ID = uuid.Must(uuid.NewV7())
	user.Password = encryptPassword(user.Password + config.UserSecret)

	writer, err := l.storage.Writer(usersFilename)
	if err != nil {
		return fmt.Errorf("failed to open user file, %w", err)
	}
	defer writer.Close()

	l.users[user.Email] = user

	encoder := json.NewEncoder(writer)
	for _, u := range l.users {
		if err := encoder.Encode(u); err != nil {
			return err
		}
	}

	return nil
}
