package user

import (
	"context"
	"errors"
	"raperonzolo/character-sheet/pkg/config"
	"raperonzolo/character-sheet/pkg/storage"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLocalCreateAppendsUserToJSONL(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	config.Load()
	ctx := context.Background()

	s, err := storage.New(t.TempDir())
	assert.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)

	user := User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!"}
	expected := User{Name: user.Name, Email: user.Email, Password: encryptPassword(user.Password + "secret")}

	if err := repo.Create(ctx, user); err != nil {
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

	reloaded, err := NewRepository(ctx, s)
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
	t.Setenv("USER_SECRET", "secret")
	ctx := context.Background()

	s, err := storage.New(t.TempDir())
	assert.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)

	user := User{Email: "ada@example.com", Password: "Encrypted1!"}

	if err := repo.Create(ctx, user); err != nil {
		t.Fatal(err)
	}

	if err := repo.Create(ctx, user); !errors.Is(err, ErrUserAlreadyExists) {
		t.Fatalf("expected ErrUserAlreadyExists, got %v", err)
	}
}

func TestLocalCreateRejectsShortPassword(t *testing.T) {
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	assert.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	assert.NoError(t, err)

	err = repo.Create(ctx, User{Email: "ada@example.com", Password: "Ab1!xyz"})
	if !errors.Is(err, ErrPasswordInvalid) {
		t.Fatalf("expected ErrPasswordTooShort, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutNumber(t *testing.T) {
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	assert.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	assert.NoError(t, err)

	err = repo.Create(ctx, User{Email: "ada@example.com", Password: "Abcdefg!"})
	if !errors.Is(err, ErrPasswordInvalid) {
		t.Fatalf("expected ErrPasswordNoNumber, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutSpecialCharacter(t *testing.T) {
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	assert.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	assert.NoError(t, err)

	err = repo.Create(ctx, User{Email: "ada@example.com", Password: "Abcdefg1"})
	if !errors.Is(err, ErrPasswordInvalid) {
		t.Fatalf("expected ErrPasswordNoSpecial, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutUppercase(t *testing.T) {
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	assert.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	assert.NoError(t, err)

	err = repo.Create(ctx, User{Email: "ada@example.com", Password: "abcdefg1!"})
	if !errors.Is(err, ErrPasswordInvalid) {
		t.Fatalf("expected ErrPasswordNoCaseMix, got %v", err)
	}
}

func TestLocalCreateRejectsPasswordWithoutLowercase(t *testing.T) {
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	assert.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	assert.NoError(t, err)

	err = repo.Create(ctx, User{Email: "ada@example.com", Password: "ABCDEFG1!"})
	if !errors.Is(err, ErrPasswordInvalid) {
		t.Fatalf("expected ErrPasswordNoCaseMix, got %v", err)
	}
}

func TestListReturnsUsersSortedByEmail(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	config.Load()
	ctx := context.Background()

	s, err := storage.New(t.TempDir())
	require.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)
	require.NoError(t, repo.Create(ctx, User{Email: "zelda@example.com", Password: "Encrypted1!"}))
	require.NoError(t, repo.Create(ctx, User{Email: "ada@example.com", Password: "Encrypted1!"}))

	users := repo.List(ctx)
	require.Len(t, users, 2)
	assert.Equal(t, "ada@example.com", users[0].Email)
	assert.Equal(t, "zelda@example.com", users[1].Email)
	assert.False(t, users[0].IsAdmin)
}

func TestIsAdminReturnsTrueOnlyForAdminUsers(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	config.Load()
	ctx := context.Background()

	s, err := storage.New(t.TempDir())
	require.NoError(t, err)

	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)
	require.NoError(t, repo.Create(ctx, User{Email: "ada@example.com", Password: "Encrypted1!"}))

	ada := repo.users["ada@example.com"]
	ada.IsAdmin = true
	repo.users["ada@example.com"] = ada

	assert.True(t, repo.IsAdmin(ctx, "ada@example.com"))
	assert.False(t, repo.IsAdmin(ctx, "missing@example.com"))
}

func TestUpdateProfileUpdatesNameWithoutCurrentPassword(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	config.Load()
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	require.NoError(t, err)
	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)
	require.NoError(t, repo.Create(ctx, User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!"}))

	updated, err := repo.UpdateProfile(ctx, "ada@example.com", "Captain Ada", "", "")
	require.NoError(t, err)
	assert.Equal(t, "Captain Ada", updated.Name)
	assert.True(t, updated.ValidatePassword("Encrypted1!"))

	reloaded, err := NewRepository(ctx, s)
	require.NoError(t, err)
	reloadedUser, err := reloaded.GetByUsername("ada@example.com")
	require.NoError(t, err)
	assert.Equal(t, "Captain Ada", reloadedUser.Name)
}

func TestUpdateProfileUpdatesPasswordWithCurrentPassword(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	config.Load()
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	require.NoError(t, err)
	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)
	require.NoError(t, repo.Create(ctx, User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!"}))

	updated, err := repo.UpdateProfile(ctx, "ada@example.com", "Ada Storm", "Encrypted1!", "Changed1!")
	require.NoError(t, err)
	assert.True(t, updated.ValidatePassword("Changed1!"))
	assert.False(t, updated.ValidatePassword("Encrypted1!"))
}

func TestUpdateProfileRejectsWrongCurrentPassword(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	config.Load()
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	require.NoError(t, err)
	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)
	require.NoError(t, repo.Create(ctx, User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!"}))

	_, err = repo.UpdateProfile(ctx, "ada@example.com", "Ada Storm", "wrong", "Changed1!")
	assert.ErrorIs(t, err, ErrPasswordMismatch)
}

func TestUpdateProfileRejectsInvalidNewPassword(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	config.Load()
	ctx := context.Background()
	s, err := storage.New(t.TempDir())
	require.NoError(t, err)
	repo, err := NewRepository(ctx, s)
	require.NoError(t, err)
	require.NoError(t, repo.Create(ctx, User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!"}))

	_, err = repo.UpdateProfile(ctx, "ada@example.com", "Ada Storm", "Encrypted1!", "short")
	assert.ErrorIs(t, err, ErrPasswordInvalid)
}
