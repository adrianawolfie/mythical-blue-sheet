package users

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func newTestRepo(t *testing.T) Repository {
	t.Helper()
	t.Setenv("USERS_SECRET", "secret")

	repo, err := New(WithLocal(filepath.Join(t.TempDir(), "users.jsonl")))
	require.NoError(t, err)
	return repo
}

func TestLocalCreateAppendsUserToJSONL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "users.jsonl")
	t.Setenv("USERS_SECRET", "secret")
	repo, err := New(WithLocal(path))
	require.NoError(t, err)

	user := User{Email: "ada@example.com", Password: "Encrypted1!"}
	expected := User{Email: user.Email, Password: encryptPassword(user.Password + "secret")}

	if err := repo.Create(user); err != nil {
		t.Fatal(err)
	}

	created, err := repo.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == uuid.Nil {
		t.Fatal("expected created user to have an ID")
	}
	expected.ID = created.ID
	if created != expected {
		t.Fatalf("expected created user %#v, got %#v", expected, created)
	}

	reloaded, err := New(WithLocal(path))
	require.NoError(t, err)

	reloadedUser, err := reloaded.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if reloadedUser != expected {
		t.Fatalf("expected reloaded user %#v, got %#v", expected, reloadedUser)
	}
}

func TestLocalCreateRejectsDuplicateUser(t *testing.T) {
	path := filepath.Join(t.TempDir(), "users.jsonl")
	t.Setenv("USERS_SECRET", "secret")
	repo, err := New(WithLocal(path))
	require.NoError(t, err)

	user := User{Email: "ada@example.com", Password: "Encrypted1!"}

	if err := repo.Create(user); err != nil {
		t.Fatal(err)
	}

	if err := repo.Create(user); !errors.Is(err, ErrUserAlreadyExists) {
		t.Fatalf("expected ErrUserAlreadyExists, got %v", err)
	}
}

func TestLocalCreateRejectsShortPassword(t *testing.T) {
	repo := newTestRepo(t)
	err := repo.Create(User{Email: "ada@example.com", Password: "Ab1!xyz"})
	if !errors.Is(err, ErrPasswordTooShort) {
		t.Fatalf("expected ErrPasswordTooShort, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutNumber(t *testing.T) {
	repo := newTestRepo(t)
	err := repo.Create(User{Email: "ada@example.com", Password: "Abcdefg!"})
	if !errors.Is(err, ErrPasswordNoNumber) {
		t.Fatalf("expected ErrPasswordNoNumber, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutSpecialCharacter(t *testing.T) {
	repo := newTestRepo(t)
	err := repo.Create(User{Email: "ada@example.com", Password: "Abcdefg1"})
	if !errors.Is(err, ErrPasswordNoSpecial) {
		t.Fatalf("expected ErrPasswordNoSpecial, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutUppercase(t *testing.T) {
	repo := newTestRepo(t)
	err := repo.Create(User{Email: "ada@example.com", Password: "abcdefg1!"})
	if !errors.Is(err, ErrPasswordNoCaseMix) {
		t.Fatalf("expected ErrPasswordNoCaseMix, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutLowercase(t *testing.T) {
	repo := newTestRepo(t)
	err := repo.Create(User{Email: "ada@example.com", Password: "ABCDEFG1!"})
	if !errors.Is(err, ErrPasswordNoCaseMix) {
		t.Fatalf("expected ErrPasswordNoCaseMix, got %v", err)
	}
}
