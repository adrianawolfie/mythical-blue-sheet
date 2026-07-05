package users

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"raperonzolo/character-sheet/pkg/s3"
	"sync"
)

const (
	defaultLocalPath = "data/users.jsonl"
	maxUserLimit     = 50
)

type Repository struct {
	mu      *sync.RWMutex
	users   map[string]User
	storage io.ReadWriter
}

type Option func(*Repository) error

func WithLocal(path string) Option {
	return func(r *Repository) error {
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return fmt.Errorf("failed to create user data directory: %w", err)
		}

		file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0600)
		if err != nil {
			return fmt.Errorf("failed to open user data file: %w", err)
		}
		r.storage = file
		return nil
	}
}

func WithS3(client s3.Client, path string) Option {
	return func(r *Repository) error {
		r.storage = s3.NewReadWriter(&client, path)
		return nil
	}
}

func New(options ...Option) (Repository, error) {
	repo := Repository{
		mu:    new(sync.RWMutex),
		users: make(map[string]User),
	}

	if len(options) == 0 {
		options = []Option{WithLocal(defaultLocalPath)}
	}

	for _, opt := range options {
		if err := opt(&repo); err != nil {
			return repo, err
		}
	}

	decoder := json.NewDecoder(repo.storage)
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

	if len(l.users) >= maxUserLimit {
		return ErrUserLimitReached
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if _, ok := l.users[user.Email]; ok {
		return ErrUserAlreadyExists
	}

	user.Password = encryptPassword(user.Password + os.Getenv("USERS_SECRET"))

	if err := json.NewEncoder(l.storage).Encode(user); err != nil {
		return err
	}

	l.users[user.Email] = user
	return nil
}
