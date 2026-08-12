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
	"raperonzolo/character-sheet/pkg/statblock"
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

func newStatblockTestRepository(t *testing.T, statblocks []statblock.Statblock) statblock.Repository {
	t.Helper()

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "campaign"), 0o755); err != nil {
		t.Fatalf("create campaign dir: %v", err)
	}
	statblockData, err := json.Marshal(statblocks)
	if err != nil {
		t.Fatalf("marshal statblocks: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "campaign", "custom-statblocks.json"), statblockData, 0o644); err != nil {
		t.Fatalf("write statblocks: %v", err)
	}
	s, err := storage.New(dir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	repo, err := statblock.NewRepository(context.Background(), s)
	if err != nil {
		t.Fatalf("new statblock repository: %v", err)
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

func TestGetLoginRendersLoginPage(t *testing.T) {
	chdirRepoRoot(t)
	req := httptest.NewRequest(http.MethodGet, "/login", nil)
	w := httptest.NewRecorder()

	GetLogin().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Crew Login") {
		t.Fatalf("expected login page in response")
	}
}

func TestGetRegistrationRendersRegistrationPage(t *testing.T) {
	chdirRepoRoot(t)
	req := httptest.NewRequest(http.MethodGet, "/register", nil)
	w := httptest.NewRecorder()

	GetRegistration().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Create Account") {
		t.Fatalf("expected registration page in response")
	}
}

func TestPostLoginSetsCookieAndRedirects(t *testing.T) {
	users := newUserTestRepository(t, nil)
	if err := users.Create(context.Background(), user.User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!", Enabled: true}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"username":"ada@example.com","password":"Encrypted1!"}`))
	w := httptest.NewRecorder()

	PostLogin(users).ServeHTTP(w, req)

	if w.Code != http.StatusSeeOther {
		t.Fatalf("expected status 303, got %d", w.Code)
	}
	if location := w.Header().Get("Location"); location != "/" {
		t.Fatalf("expected redirect to /, got %q", location)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "user" || cookies[0].Value != "ada@example.com" {
		t.Fatalf("expected user cookie, got %#v", cookies)
	}
}

func TestPostLoginRejectsInvalidPassword(t *testing.T) {
	users := newUserTestRepository(t, nil)
	if err := users.Create(context.Background(), user.User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!", Enabled: true}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"username":"ada@example.com","password":"wrong"}`))
	w := httptest.NewRecorder()

	PostLogin(users).ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", w.Code)
	}
}

func TestPostLoginRejectsDisabledUser(t *testing.T) {
	users := newUserTestRepository(t, nil)
	if err := users.Create(context.Background(), user.User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!"}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	created, err := users.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if _, err := users.UpdateByID(context.Background(), created.ID.String(), user.User{Name: "Ada Storm", Email: "ada@example.com", Enabled: false}); err != nil {
		t.Fatalf("disable user: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"username":"ada@example.com","password":"Encrypted1!"}`))
	w := httptest.NewRecorder()

	PostLogin(users).ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", w.Code)
	}
}

func TestPutCurrentUserUpdatesName(t *testing.T) {
	users := newUserTestRepository(t, nil)
	if err := users.Create(context.Background(), user.User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!", Enabled: true}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	req := httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(`{"name":"Captain Ada"}`))
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	PutCurrentUser(users).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	updated, err := users.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatalf("get updated user: %v", err)
	}
	if updated.Name != "Captain Ada" || !updated.ValidatePassword("Encrypted1!") {
		t.Fatalf("expected name-only update, got %#v", updated)
	}
}

func TestPutCurrentUserUpdatesPasswordWithCurrentPassword(t *testing.T) {
	users := newUserTestRepository(t, nil)
	if err := users.Create(context.Background(), user.User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!", Enabled: true}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	req := httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(`{"name":"Ada Storm","currentPassword":"Encrypted1!","newPassword":"Changed1!"}`))
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	PutCurrentUser(users).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	updated, err := users.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatalf("get updated user: %v", err)
	}
	if !updated.ValidatePassword("Changed1!") || updated.ValidatePassword("Encrypted1!") {
		t.Fatalf("expected changed password")
	}
}

func TestPutCurrentUserRejectsPasswordChangeWithoutCurrentPassword(t *testing.T) {
	users := newUserTestRepository(t, nil)
	if err := users.Create(context.Background(), user.User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!", Enabled: true}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	req := httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(`{"name":"Ada Storm","newPassword":"Changed1!"}`))
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	PutCurrentUser(users).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", w.Code)
	}
}

func TestPutCurrentUserRejectsUnauthenticatedUser(t *testing.T) {
	users := newUserTestRepository(t, nil)
	req := httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(`{"name":"Captain Ada"}`))
	w := httptest.NewRecorder()

	PutCurrentUser(users).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", w.Code)
	}
}

func TestGetAdminUsersDataReturnsUsersForAdminUser(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetAdminUsersData(users).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var response adminUsersPageData
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.CurrentUser.Email != "admin@example.com" || response.UserCount != 1 || len(response.Users) != 1 {
		t.Fatalf("expected admin users data, got %#v", response)
	}
}

func TestGetAdminUsersRejectsNonAdminUser(t *testing.T) {
	repo := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Ada", Email: "ada@example.com", Password: "hash", IsAdmin: false}})
	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	GetAdminUsersData(repo).ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", w.Code)
	}
}

func TestPutAdminUserUpdatesDetailsAndPassword(t *testing.T) {
	t.Setenv("USER_SECRET", "secret")
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	if err := users.Create(context.Background(), user.User{Name: "Ada Storm", Email: "ada@example.com", Password: "Encrypted1!"}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	ada, err := users.GetByUsername("ada@example.com")
	if err != nil {
		t.Fatalf("get ada: %v", err)
	}
	req := httptest.NewRequest(http.MethodPut, "/admin/users/"+ada.ID.String(), strings.NewReader(`{"name":"Captain Ada","email":"captain@example.com","password":"Changed1!","isAdmin":true,"enabled":true}`))
	req.SetPathValue("id", ada.ID.String())
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	PutAdminUser(users).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	updated, err := users.GetByUsername("captain@example.com")
	if err != nil {
		t.Fatalf("get updated user: %v", err)
	}
	if updated.Name != "Captain Ada" || !updated.IsAdmin || !updated.Enabled || !updated.ValidatePassword("Changed1!") {
		t.Fatalf("expected updated user, got %#v", updated)
	}
}

func TestPutAdminUserRejectsNonAdmin(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Ada", Email: "ada@example.com", Password: "hash"}})
	req := httptest.NewRequest(http.MethodPut, "/admin/users/018fe68a-01a8-70b1-8ea3-2d0b819a2d29", strings.NewReader(`{"name":"Ada","email":"ada@example.com"}`))
	req.SetPathValue("id", "018fe68a-01a8-70b1-8ea3-2d0b819a2d29")
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	PutAdminUser(users).ServeHTTP(w, req)

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
	dataReq := httptest.NewRequest(http.MethodGet, "/api/admin/characters", nil)
	dataReq.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	dataW := httptest.NewRecorder()
	GetAdminCharactersData(users, characters).ServeHTTP(dataW, dataReq)
	if dataW.Code != http.StatusOK {
		t.Fatalf("expected data status 200, got %d", dataW.Code)
	}
	var data adminCharactersPageData
	if err := json.NewDecoder(dataW.Body).Decode(&data); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(data.Characters) != 1 || data.Characters[0].Name != "Ada Storm" || data.Characters[0].UserID != "018fe68a-01a8-70b1-8ea3-2d0b819a2d29" || data.Characters[0].UserName != "Admin User" {
		t.Fatalf("expected admin character data, got %#v", data)
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

func TestPostAdminCharacterAssignmentCanUnassign(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:     "ada-character",
		UserID: "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
		Summary: character.Summary{
			Name: "Ada Storm",
		},
	}})
	req := httptest.NewRequest(http.MethodPost, "/admin/characters/ada-character/assignment", bytes.NewBufferString(`{"userId":""}`))
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
	if updated.UserID != "" {
		t.Fatalf("expected unassigned character, got %q", updated.UserID)
	}
}

func TestDeleteAdminCharacterRemovesCharacter(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	characters := newCharacterTestRepository(t, []character.Character{{ID: "ada-character", Summary: character.Summary{Name: "Ada Storm"}}})
	req := httptest.NewRequest(http.MethodDelete, "/admin/characters/ada-character", nil)
	req.SetPathValue("id", "ada-character")
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	DeleteAdminCharacter(users, characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	idx, err := characters.List(context.Background())
	if err != nil {
		t.Fatalf("list characters: %v", err)
	}
	if len(idx) != 0 {
		t.Fatalf("expected empty character index, got %#v", idx)
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

func TestGetCharactersReturnsCharacterIndex(t *testing.T) {
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:         "ada-character",
		CampaignID: "campaign-1",
		Summary:    character.Summary{Name: "Ada Storm", ArmorClass: "17", HpCurrent: "21", HpMax: "30"},
	}})
	req := httptest.NewRequest(http.MethodGet, "/api/characters", nil)
	w := httptest.NewRecorder()

	GetCharacters(characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var idx []character.Index
	if err := json.NewDecoder(w.Body).Decode(&idx); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(idx) != 1 || idx[0].ID != "ada-character" || idx[0].Name != "Ada Storm" {
		t.Fatalf("expected character index, got %#v", idx)
	}
}

func TestGetCharactersMineReturnsOnlyCurrentUsersCharacters(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Ada Storm", Email: "ada@example.com", Password: "hash"}})
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:     "ada-character",
		UserID: "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
		Summary: character.Summary{
			Name: "Ada Storm",
		},
	}, {
		ID:     "other-character",
		UserID: "018fe68a-01a8-70b1-8ea3-2d0b819a2d30",
		Summary: character.Summary{
			Name: "Other Sailor",
		},
	}})
	req := httptest.NewRequest(http.MethodGet, "/api/characters?mine=1", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	GetCharacters(characters, users).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var idx []character.Index
	if err := json.NewDecoder(w.Body).Decode(&idx); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(idx) != 1 || idx[0].ID != "ada-character" {
		t.Fatalf("expected only current user's character, got %#v", idx)
	}
}

func TestGetCharactersMineReturnsAllForAdmin(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:     "ada-character",
		UserID: "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
		Summary: character.Summary{
			Name: "Ada Storm",
		},
	}, {
		ID: "unassigned-character",
		Summary: character.Summary{
			Name: "Unassigned Sailor",
		},
	}})
	req := httptest.NewRequest(http.MethodGet, "/api/characters?mine=1", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetCharacters(characters, users).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var idx []character.Index
	if err := json.NewDecoder(w.Body).Decode(&idx); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(idx) != 2 {
		t.Fatalf("expected all characters for admin, got %#v", idx)
	}
}

func TestGetCharacterReturnsCharacter(t *testing.T) {
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:      "ada-character",
		Summary: character.Summary{Name: "Ada Storm"},
	}})
	req := httptest.NewRequest(http.MethodGet, "/api/characters/ada-character", nil)
	req.SetPathValue("id", "ada-character")
	w := httptest.NewRecorder()

	GetCharacter(characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var c character.Character
	if err := json.NewDecoder(w.Body).Decode(&c); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if c.ID != "ada-character" || c.Summary.Name != "Ada Storm" {
		t.Fatalf("expected character, got %#v", c)
	}
}

func TestPostCharactersPersistsCharacter(t *testing.T) {
	characters := newCharacterTestRepository(t, nil)
	body := `{"id":"ada-character","summary":{"name":"Ada Storm","armorClass":"17","hpCurrent":"21","hpMax":"30"},"fields":{"class":"Wizard"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/characters", strings.NewReader(body))
	w := httptest.NewRecorder()

	PostCharacters(characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	c, err := characters.GetByID(context.Background(), "ada-character")
	if err != nil {
		t.Fatalf("get character: %v", err)
	}
	if c.Summary.Name != "Ada Storm" || c.Fields["class"] != "Wizard" || c.UpdatedAt == "" {
		t.Fatalf("expected persisted character, got %#v", c)
	}
}

func TestDeleteCharacterRemovesCharacter(t *testing.T) {
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:      "ada-character",
		Summary: character.Summary{Name: "Ada Storm"},
	}})
	req := httptest.NewRequest(http.MethodDelete, "/api/characters/ada-character", nil)
	req.SetPathValue("id", "ada-character")
	w := httptest.NewRecorder()

	DeleteCharacter(characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	idx, err := characters.List(context.Background())
	if err != nil {
		t.Fatalf("list characters: %v", err)
	}
	if len(idx) != 0 {
		t.Fatalf("expected empty character index, got %#v", idx)
	}
}

func TestPostStatusUpdatesCharacterStatus(t *testing.T) {
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:      "ada-character",
		Summary: character.Summary{Name: "Ada Storm"},
		Fields:  character.Fields{},
	}})
	body := `{"hpCurrent":"12","hpMax":"30","tempHp":"5","armorClass":"18","currentConditions":"Poisoned","armorClassState":{"base":"13","modifiers":[{"name":"Shield","value":"5","active":true}]}}`
	req := httptest.NewRequest(http.MethodPost, "/api/characters/ada-character/status", strings.NewReader(body))
	req.SetPathValue("id", "ada-character")
	w := httptest.NewRecorder()

	PostStatus(characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	c, err := characters.GetByID(context.Background(), "ada-character")
	if err != nil {
		t.Fatalf("get character: %v", err)
	}
	if c.Summary.HpCurrent != "12" || c.Summary.HpMax != "30" || c.Summary.TempHp != "5" || c.Summary.ArmorClass != "18" || c.Summary.CurrentConditions != "Poisoned" {
		t.Fatalf("expected updated summary, got %#v", c.Summary)
	}
	if c.Fields["hpCurrent"] != "12" || c.Fields["armorClass"] != "18" || c.CustomLists.ArmorClass.Base != "13" || c.UpdatedAt == "" {
		t.Fatalf("expected updated fields and armor class state, got %#v", c)
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

	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Ada Storm", Email: "ada@example.com", Password: "hash"}})
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
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
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

func TestGetCharacterListPageShowsAllCharactersForAdmin(t *testing.T) {
	chdirRepoRoot(t)
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	characters := newCharacterTestRepository(t, []character.Character{{
		ID:      "ada-character",
		UserID:  "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
		Summary: character.Summary{Name: "Ada Storm"},
	}, {
		ID:      "unassigned-character",
		Summary: character.Summary{Name: "Unassigned Sailor"},
	}})
	req := httptest.NewRequest(http.MethodGet, "/characters", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetCharacterListPage(users, characters).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Ada Storm") || !strings.Contains(w.Body.String(), "Unassigned Sailor") {
		t.Fatalf("expected all characters for admin, got %s", w.Body.String())
	}
}

func TestGetAdminRedirectsToUsers(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	w := httptest.NewRecorder()

	GetAdmin().ServeHTTP(w, req)

	if w.Code != http.StatusSeeOther {
		t.Fatalf("expected status 303, got %d", w.Code)
	}
	if location := w.Header().Get("Location"); location != "/admin/users.html" {
		t.Fatalf("expected redirect to /admin/users.html, got %q", location)
	}
}

func TestGetCampaignReturnsCampaignState(t *testing.T) {
	campaigns := newCampaignTestRepository(t, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/campaign-state", nil)
	w := httptest.NewRecorder()

	GetCampaign(campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var state campaign.Campaign
	if err := json.NewDecoder(w.Body).Decode(&state); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if state.CalendarDate.Year != 4520 || state.DaysTraveled != 0 {
		t.Fatalf("expected default campaign state, got %#v", state)
	}
}

func TestGetCampaignsMineReturnsOnlyCurrentUsersCampaigns(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Ada Storm", Email: "ada@example.com", Password: "hash"}})
	month := 4
	day := 1
	campaigns := newCampaignTestRepository(t, []campaign.Campaign{{
		ID:           "campaign-1",
		Name:         "Adriana",
		CalendarDate: campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
		Players:      []string{"018fe68a-01a8-70b1-8ea3-2d0b819a2d29"},
	}, {
		ID:           "campaign-2",
		Name:         "DM Waters",
		CalendarDate: campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
		DM:           "018fe68a-01a8-70b1-8ea3-2d0b819a2d29",
	}, {
		ID:           "campaign-3",
		Name:         "Other Waters",
		CalendarDate: campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
		Players:      []string{"018fe68a-01a8-70b1-8ea3-2d0b819a2d30"},
	}})
	req := httptest.NewRequest(http.MethodGet, "/api/campaigns?mine=1", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	GetCampaigns(users, campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var response []campaign.Campaign
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response) != 1 || response[0].ID != "campaign-1" {
		t.Fatalf("expected only current user's player campaign, got %#v", response)
	}
}

func TestGetCampaignsMineReturnsAllForAdmin(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	month := 4
	day := 1
	campaigns := newCampaignTestRepository(t, []campaign.Campaign{{
		ID:           "campaign-1",
		Name:         "Adriana",
		CalendarDate: campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
	}, {
		ID:           "campaign-2",
		Name:         "Other Waters",
		CalendarDate: campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
	}})
	req := httptest.NewRequest(http.MethodGet, "/api/campaigns?mine=1", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	GetCampaigns(users, campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var response []campaign.Campaign
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response) != 2 {
		t.Fatalf("expected all campaigns for admin, got %#v", response)
	}
}

func TestGetCurrentUserReturnsCookieUser(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Ada Storm", Email: "ada@example.com", Password: "hash"}})
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.AddCookie(&http.Cookie{Name: "user", Value: "ada@example.com"})
	w := httptest.NewRecorder()

	GetCurrentUser(users).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var response struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.ID != "018fe68a-01a8-70b1-8ea3-2d0b819a2d29" || response.Email != "ada@example.com" {
		t.Fatalf("expected current user, got %#v", response)
	}
}

func TestPostCampaignSavesCampaignState(t *testing.T) {
	campaigns := newCampaignTestRepository(t, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/campaign-state", strings.NewReader(`{"calendarDate":{"year":4521,"month":4,"day":2},"daysTraveled":7,"players":["ada"]}`))
	w := httptest.NewRecorder()

	PostCampaign(campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var response campaign.Campaign
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.CalendarDate.Year != 4521 || response.DaysTraveled != 7 || response.UpdatedAt == nil {
		t.Fatalf("expected saved campaign response, got %#v", response)
	}
	saved, err := campaigns.Get(context.Background())
	if err != nil {
		t.Fatalf("get campaign state: %v", err)
	}
	if saved.CalendarDate.Year != 4521 || saved.DaysTraveled != 7 || len(saved.Players) != 1 || saved.Players[0] != "ada" {
		t.Fatalf("expected persisted campaign state, got %#v", saved)
	}
}

func TestGetCustomStatblocksReturnsStatblocks(t *testing.T) {
	statblocks := newStatblockTestRepository(t, []statblock.Statblock{{ID: "goblin", Name: "Goblin", Size: "Small", Type: "Humanoid"}})
	req := httptest.NewRequest(http.MethodGet, "/api/custom-statblocks", nil)
	w := httptest.NewRecorder()

	GetCustomStatblocks(statblocks).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var response []statblock.Statblock
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response) != 1 || response[0].ID != "goblin" || response[0].Name != "Goblin" || response[0].Section != "Custom Monsters" {
		t.Fatalf("expected custom statblocks, got %#v", response)
	}
}

func TestPostCustomStatblocksSavesStatblocks(t *testing.T) {
	statblocks := newStatblockTestRepository(t, nil)
	body := `{"statblocks":[{"id":"goblin","name":" Goblin ","size":"Small","type":"Humanoid","legendaryResistanceMax":-1}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/custom-statblocks", strings.NewReader(body))
	w := httptest.NewRecorder()

	PostCustomStatblocks(statblocks).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var response customStatblocksResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !response.Success || len(response.Statblocks) != 1 || response.Statblocks[0].Name != "Goblin" || response.Statblocks[0].LegendaryResistanceMax != 0 {
		t.Fatalf("expected saved statblocks response, got %#v", response)
	}
	saved, err := statblocks.List(context.Background())
	if err != nil {
		t.Fatalf("list statblocks: %v", err)
	}
	if len(saved) != 1 || saved[0].ID != "goblin" {
		t.Fatalf("expected persisted statblock, got %#v", saved)
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
	dataReq := httptest.NewRequest(http.MethodGet, "/api/admin/campaigns", nil)
	dataReq.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	dataW := httptest.NewRecorder()
	GetAdminCampaignsData(users, campaigns).ServeHTTP(dataW, dataReq)
	if dataW.Code != http.StatusOK {
		t.Fatalf("expected data status 200, got %d", dataW.Code)
	}
	var data adminCampaignsPageData
	if err := json.NewDecoder(dataW.Body).Decode(&data); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if data.CampaignCount != 1 || len(data.Campaigns) != 1 || data.Campaigns[0].Name != "Adriana" || data.Campaigns[0].Calendar != "Year 4520, Month 4, Day 1" || len(data.Campaigns[0].Players) != 2 {
		t.Fatalf("expected admin campaign data, got %#v", data)
	}
}

func TestPostAdminCampaignPlayerPersistsUserID(t *testing.T) {
	users := newUserTestRepository(t, []user.User{
		{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true},
		{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d30"), Name: "Ada Storm", Email: "ada@example.com", Password: "hash", IsAdmin: false},
	})
	month := 4
	day := 1
	campaigns := newCampaignTestRepository(t, []campaign.Campaign{{
		ID:            "campaign-1",
		Name:          "Adriana",
		SchemaVersion: 1,
		CalendarDate:  campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
		Players:       []string{"018fe68a-01a8-70b1-8ea3-2d0b819a2d29"},
	}})
	req := httptest.NewRequest(http.MethodPost, "/admin/campaigns/campaign-1/players", bytes.NewBufferString(`{"userId":"018fe68a-01a8-70b1-8ea3-2d0b819a2d30"}`))
	req.SetPathValue("id", "campaign-1")
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	PostAdminCampaignPlayer(users, campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	updated, err := campaigns.GetByID(context.Background(), "campaign-1")
	if err != nil {
		t.Fatalf("get updated campaign: %v", err)
	}
	if len(updated.Players) != 2 || updated.Players[1] != "018fe68a-01a8-70b1-8ea3-2d0b819a2d30" {
		t.Fatalf("expected added player, got %#v", updated.Players)
	}
}

func TestPostAdminCampaignPlayerDoesNotDuplicateUserID(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	month := 4
	day := 1
	campaigns := newCampaignTestRepository(t, []campaign.Campaign{{
		ID:            "campaign-1",
		Name:          "Adriana",
		SchemaVersion: 1,
		CalendarDate:  campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
		Players:       []string{"018fe68a-01a8-70b1-8ea3-2d0b819a2d29"},
	}})
	req := httptest.NewRequest(http.MethodPost, "/admin/campaigns/campaign-1/players", bytes.NewBufferString(`{"userId":"018fe68a-01a8-70b1-8ea3-2d0b819a2d29"}`))
	req.SetPathValue("id", "campaign-1")
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	PostAdminCampaignPlayer(users, campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	updated, err := campaigns.GetByID(context.Background(), "campaign-1")
	if err != nil {
		t.Fatalf("get updated campaign: %v", err)
	}
	if len(updated.Players) != 1 {
		t.Fatalf("expected no duplicate players, got %#v", updated.Players)
	}
}

func TestDeleteAdminCampaignPlayerPersistsRemoval(t *testing.T) {
	users := newUserTestRepository(t, []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Name: "Admin User", Email: "admin@example.com", Password: "hash", IsAdmin: true}})
	month := 4
	day := 1
	campaigns := newCampaignTestRepository(t, []campaign.Campaign{{
		ID:            "campaign-1",
		Name:          "Adriana",
		SchemaVersion: 1,
		CalendarDate:  campaign.CalendarDate{Year: 4520, Month: &month, Day: &day},
		Players:       []string{"018fe68a-01a8-70b1-8ea3-2d0b819a2d29", "018fe68a-01a8-70b1-8ea3-2d0b819a2d30"},
	}})
	req := httptest.NewRequest(http.MethodDelete, "/admin/campaigns/campaign-1/players/018fe68a-01a8-70b1-8ea3-2d0b819a2d30", nil)
	req.SetPathValue("id", "campaign-1")
	req.SetPathValue("userId", "018fe68a-01a8-70b1-8ea3-2d0b819a2d30")
	req.AddCookie(&http.Cookie{Name: "user", Value: "admin@example.com"})
	w := httptest.NewRecorder()

	DeleteAdminCampaignPlayer(users, campaigns).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	updated, err := campaigns.GetByID(context.Background(), "campaign-1")
	if err != nil {
		t.Fatalf("get updated campaign: %v", err)
	}
	if len(updated.Players) != 1 || updated.Players[0] != "018fe68a-01a8-70b1-8ea3-2d0b819a2d29" {
		t.Fatalf("expected removed player, got %#v", updated.Players)
	}
}
