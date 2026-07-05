package users

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLocalCreateAppendsUserToJSONL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "users.jsonl")

	repo, err := New(WithLocal(path))
	require.NoError(t, err)

	user := User{Email: "ada@example.com", Password: "encrypted-ada"}

	if err := repo.Create(user); err != nil {
		t.Fatal(err)
	}

	created, err := repo.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if created != user {
		t.Fatalf("expected created user %#v, got %#v", user, created)
	}

	reloaded, err := New(WithLocal(path))
	require.NoError(t, err)

	reloadedUser, err := reloaded.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if reloadedUser != user {
		t.Fatalf("expected reloaded user %#v, got %#v", user, reloadedUser)
	}
}

func TestLocalCreateRejectsDuplicateUser(t *testing.T) {
	path := filepath.Join(t.TempDir(), "users.jsonl")

	repo, err := New(WithLocal(path))
	require.NoError(t, err)

	user := User{Email: "ada@example.com", Password: "encrypted-ada"}

	if err := repo.Create(user); err != nil {
		t.Fatal(err)
	}

	if err := repo.Create(user); !errors.Is(err, ErrUserAlreadyExists) {
		t.Fatalf("expected ErrUserAlreadyExists, got %v", err)
	}
}
