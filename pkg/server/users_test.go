package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"raperonzolo/character-sheet/pkg/storage"
	"raperonzolo/character-sheet/pkg/user"
)

func newUserTestRepository(t *testing.T, usersJSONL string) user.Repository {
	t.Helper()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "users.jsonl"), []byte(usersJSONL), 0o644); err != nil {
		t.Fatalf("write users: %v", err)
	}
	s, err := storage.New(dir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	repo, err := user.NewRepository(context.Background(), s)
	if err != nil {
		t.Fatalf("new repository: %v", err)
	}
	return repo
}

func chdirRepoRoot(t *testing.T) {
	t.Helper()

	oldDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	if err := os.Chdir("../.."); err != nil {
		t.Fatalf("change to repo root: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(oldDir); err != nil {
			t.Fatalf("restore working directory: %v", err)
		}
	})
}

func TestGetAdminRendersForAdminUser(t *testing.T) {
	chdirRepoRoot(t)

	repo := newUserTestRepository(t, `{"id":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29","email":"admin@example.com","password":"hash","isAdmin":true}`+"\n")
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetAdmin(repo).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "admin@example.com") {
		t.Fatalf("expected admin email in response")
	}
}

func TestGetAdminRejectsNonAdminUser(t *testing.T) {
	chdirRepoRoot(t)

	repo := newUserTestRepository(t, `{"id":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29","email":"ada@example.com","password":"hash","isAdmin":false}`+"\n")
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	GetAdmin(repo).ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", w.Code)
	}
}
