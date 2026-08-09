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

	"raperonzolo/character-sheet/pkg/campaign"
	"raperonzolo/character-sheet/pkg/character"
	"raperonzolo/character-sheet/pkg/storage"
	"raperonzolo/character-sheet/pkg/user"

	"github.com/google/uuid"
)

func newUserTestRepository(t *testing.T, users []user.User) user.Repository {
	t.Helper()

	dir := t.TempDir()
	usersFile, err := os.OpenFile(filepath.Join(dir, "users.jsonl"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		t.Fatalf("open users: %v", err)
	}
	encoder := json.NewEncoder(usersFile)
	for _, u := range users {
		if err := encoder.Encode(u); err != nil {
			_ = usersFile.Close()
			t.Fatalf("encode user: %v", err)
		}
	}
	if err := usersFile.Close(); err != nil {
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

func newCharacterTestRepository(t *testing.T, characters []character.Character) character.Repository {
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

func newCampaignTestRepository(t *testing.T, campaigns []campaign.Campaign) campaign.Repository {
	t.Helper()

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "campaign"), 0o755); err != nil {
		t.Fatalf("create campaign dir: %v", err)
	}
	idx := make([]campaign.Index, 0, len(campaigns))
	for _, c := range campaigns {
		idx = append(idx, campaign.Index{ID: c.ID})
	}
	idxData, err := json.Marshal(idx)
	if err != nil {
		t.Fatalf("marshal campaign index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "campaign", "index.json"), idxData, 0o644); err != nil {
		t.Fatalf("write campaign index: %v", err)
	}
	for _, c := range campaigns {
		cData, err := json.Marshal(c)
		if err != nil {
			t.Fatalf("marshal campaign: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dir, "campaign", c.ID+".json"), cData, 0o644); err != nil {
			t.Fatalf("write campaign: %v", err)
		}
	}
	s, err := storage.New(dir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	repo, err := campaign.NewRepository(context.Background(), s)
	if err != nil {
		t.Fatalf("new campaign repository: %v", err)
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

	repo := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
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

	repo := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Ada", Email: "ada@example.com", Password: "hash", IsAdmin: false}})
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

	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:     "ada-character",
		UserID: "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
		Summary: character.Summary{
			Name: "Ada Storm",
		},
		Fields: character.Fields{
			"class": "Wizard",
			"level": "7",
		},
	}})
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

	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	characters := newCharacterTestRepository(t, []character.Character{{
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
	}})
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
	users := newUserTestRepository(t, nil)
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

	characters := newCharacterTestRepository(t, []character.Character{{
		ID:         "ada-character",
		CampaignID: "campaign-1",
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
	}})
	req := httptest.NewRequest(http.MethodGet, "/characters/ada-character", nil)
	req.SetPathValue("id", "ada-character")
	w := httptest.NewRecorder()

	GetCharacterDetail(characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	body := w.Body.String()
	for _, expected := range []string{`<base href="/">`, "window.__MYTHICAL_BLUE_CHARACTER__", "Ada Storm", `"campaignId":"campaign-1"`, `"prepared":true`, `"name":"Shield"`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected response to contain %q", expected)
		}
	}
}

func TestGetCharacterListPageShowsOnlyCurrentUsersCharacters(t *testing.T) {
	chdirRepoRoot(t)

	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	characters := newCharacterTestRepository(t,
		[]character.Character{{
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
		}, {
			ID: "unassigned-character",
			Summary: character.Summary{
				Name: "Unassigned Sailor",
			},
		}},
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

func TestGetAdminCampaignsListsCampaigns(t *testing.T) {
	chdirRepoRoot(t)

	month := 4
	day := 1
	updatedAt := "2026-07-12T16:06:07Z"
	users := newUserTestRepository(t, []user.User{
		{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true},
		{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d30"), Name: "Ada Storm", Email: "ada@example.com", Password: "hash", IsAdmin: false},
	})
	campaigns := newCampaignTestRepository(t, []campaign.Campaign{{
		ID:            "campaign-1",
		Name:          "Adriana",
		SchemaVersion: 1,
		UpdatedAt:     &updatedAt,
		CalendarDate: campaign.CalendarDate{
			Year:  4520,
			Month: &month,
			Day:   &day,
		},
		DaysTraveled: 2,
		Players:      []string{"018fe68a-01a8-70b1-8ea3-2d0b819a2d29", "018fe68a-01a8-70b1-8ea3-2d0b819a2d30"},
	}})
	req := httptest.NewRequest(http.MethodGet, "/admin/campaigns", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetAdminCampaigns(users, campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	body := w.Body.String()
	for _, expected := range []string{"Adriana", "campaign-1", "Year 4520, Month 4, Day 1", ">2</td>", "Admin User, Ada Storm", "Jul 12, 2026 16:06 UTC"} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected response to contain %q", expected)
		}
	}
}
