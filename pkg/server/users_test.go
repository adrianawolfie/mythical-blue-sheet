package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"raperonzolo/character-sheet/pkg/character"
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

func newCharacterTestRepository(t *testing.T, characters ...character.Character) character.Repository {
	t.Helper()

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "character"), 0o755); err != nil {
		t.Fatalf("create character dir: %v", err)
	}
	idx := make([]character.Index, 0, len(characters))
	for _, c := range characters {
		idx = append(idx, character.Index{ID: c.ID, Name: c.Summary.Name})
	}
	idxData, err := json.Marshal(idx)
	if err != nil {
		t.Fatalf("marshal index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "character", "character-index.json"), idxData, 0o644); err != nil {
		t.Fatalf("write character index: %v", err)
	}
	for _, c := range characters {
		cData, err := json.Marshal(c)
		if err != nil {
			t.Fatalf("marshal character: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dir, "character", c.ID+".json"), cData, 0o644); err != nil {
			t.Fatalf("write character: %v", err)
		}
	}
	s, err := storage.New(dir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	repo, err := character.NewRepository(context.Background(), s)
	if err != nil {
		t.Fatalf("new character repository: %v", err)
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

func TestGetAdminUsersRendersForAdminUser(t *testing.T) {
	chdirRepoRoot(t)

	repo := newUserTestRepository(t, `{"id":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29","name":"Admin User","email":"admin@example.com","password":"hash","isAdmin":true}`+"\n")
	req := httptest.NewRequest(http.MethodGet, "/admin/users", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetAdminUsers(repo).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "admin@example.com") {
		t.Fatalf("expected admin email in response")
	}
}

func TestGetAdminUsersRejectsNonAdminUser(t *testing.T) {
	chdirRepoRoot(t)

	repo := newUserTestRepository(t, `{"id":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29","name":"Ada","email":"ada@example.com","password":"hash","isAdmin":false}`+"\n")
	req := httptest.NewRequest(http.MethodGet, "/admin/users", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	GetAdminUsers(repo).ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", w.Code)
	}
}

func TestGetAdminCharactersShowsClassLevelAndUserName(t *testing.T) {
	chdirRepoRoot(t)

	users := newUserTestRepository(t, `{"id":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29","name":"Admin User","email":"admin@example.com","password":"hash","isAdmin":true}`+"\n")
	characters := newCharacterTestRepository(t, character.Character{
		ID:     "ada-character",
		UserID: "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
		Summary: character.Summary{
			Name: "Ada Storm",
		},
		Fields: character.Fields{
			"class": "Wizard",
			"level": "7",
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/admin/characters", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetAdminCharacters(users, characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	body := w.Body.String()
	for _, expected := range []string{"Ada Storm", "Wizard", "7", "Admin User"} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected response to contain %q", expected)
		}
	}
}

func TestPostAdminCharacterAssignmentPersistsUserID(t *testing.T) {
	chdirRepoRoot(t)

	users := newUserTestRepository(t, `{"id":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29","name":"Admin User","email":"admin@example.com","password":"hash","isAdmin":true}`+"\n")
	characters := newCharacterTestRepository(t, character.Character{
		ID: "ada-character",
		Summary: character.Summary{
			Name: "Ada Storm",
		},
		CustomLists: character.CustomLists{
			Spells: []character.SpellRow{{
				Name:     "Shield",
				Level:    "1",
				Prepared: true,
				School:   "Abjuration",
			}},
		},
		Fields: character.Fields{
			"class": "Wizard",
			"level": "7",
		},
	})
	req := httptest.NewRequest(
		http.MethodPost,
		"/admin/characters/ada-character/assignment",
		bytes.NewBufferString(`{"userId":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29"}`),
	)
	req.SetPathValue("id", "ada-character")
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	PostAdminCharacterAssignment(users, characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	updated, err := characters.GetByID(context.Background(), "ada-character")
	if err != nil {
		t.Fatalf("get updated character: %v", err)
	}
	if updated.UserID != "018fe68a-01a8-70b1-8ea3-2d0b819a2d29" {
		t.Fatalf("expected assigned user id, got %q", updated.UserID)
	}
}

func TestPostUserPersistsName(t *testing.T) {
	chdirRepoRoot(t)

	t.Setenv("USER_SECRET", "secret")
	users := newUserTestRepository(t, "")
	req := httptest.NewRequest(http.MethodPost, "/users", strings.NewReader(`{"name":"Ada Storm","email":"ada@example.com","password":"Encrypted1!"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	PostUser(users).ServeHTTP(w, req)

	if w.Code != http.StatusSeeOther {
		t.Fatalf("expected status 303, got %d", w.Code)
	}
	created, err := users.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatalf("get created user: %v", err)
	}
	if created.Name != "Ada Storm" {
		t.Fatalf("expected created user name %q, got %q", "Ada Storm", created.Name)
	}
	if location := w.Header().Get("Location"); location != "/login" {
		t.Fatalf("expected redirect to /login, got %q", location)
	}
}

func TestGetCharacterDetailBootstrapsCharacter(t *testing.T) {
	chdirRepoRoot(t)

	characters := newCharacterTestRepository(t, character.Character{
		ID: "ada-character",
		Summary: character.Summary{
			Name: "Ada Storm",
		},
		CustomLists: character.CustomLists{
			Spells: []character.SpellRow{{
				Name:     "Shield",
				Level:    "1",
				School:   "Abjuration",
				Prepared: true,
			}},
		},
		Fields: character.Fields{
			"class": "Wizard",
			"level": "7",
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/characters/ada-character", nil)
	req.SetPathValue("id", "ada-character")
	w := httptest.NewRecorder()

	GetCharacterDetail(characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	body := w.Body.String()
	for _, expected := range []string{`<base href="/">`, "window.__MYTHICAL_BLUE_CHARACTER__", "Ada Storm", `"prepared":true`, `"name":"Shield"`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected response to contain %q", expected)
		}
	}
}

func TestGetCharacterListPageShowsOnlyCurrentUsersCharacters(t *testing.T) {
	chdirRepoRoot(t)

	users := newUserTestRepository(t, `{"id":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29","name":"Admin User","email":"admin@example.com","password":"hash","isAdmin":true}`+"\n")
	characters := newCharacterTestRepository(t,
		character.Character{
			ID:     "ada-character",
			UserID: "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
			Summary: character.Summary{
				Name: "Ada Storm",
			},
			Fields: character.Fields{
				"class":       "Wizard",
				"speciesRace": "Human",
				"subclass":    "Bladesinger",
				"level":       "7",
			},
		},
		character.Character{
			ID: "unassigned-character",
			Summary: character.Summary{
				Name: "Unassigned Sailor",
			},
		},
	)
	req := httptest.NewRequest(http.MethodGet, "/characters", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetCharacterListPage(users, characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	body := w.Body.String()
	for _, expected := range []string{"/characters/ada-character", "Ada Storm", "Class: Wizard", "Species: Human", "Subclass: Bladesinger", "Level: 7"} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected response to contain %q", expected)
		}
	}
	if strings.Contains(body, "Unassigned Sailor") {
		t.Fatal("expected unassigned character to be hidden")
	}
}

func TestGetAdminRedirectsToUsers(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	w := httptest.NewRecorder()

	GetAdmin().ServeHTTP(w, req)

	if w.Code != http.StatusSeeOther {
		t.Fatalf("expected status 303, got %d", w.Code)
	}
	if location := w.Header().Get("Location"); location != "/admin/users" {
		t.Fatalf("expected redirect to /admin/users, got %q", location)
	}
}
