package character

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"raperonzolo/character-sheet/pkg/storage"
	"raperonzolo/character-sheet/pkg/user"

	"github.com/google/uuid"
)

type testUserReader struct {
	users []user.User
}

func (r testUserReader) List(ctx context.Context) []user.User {
	return r.users
}

func (r testUserReader) GetByUsername(email string) (user.User, error) {
	for _, u := range r.users {
		if u.Email == email {
			return u, nil
		}
	}
	return user.User{}, user.ErrUserNotFound
}

func newRequestedTestRepository(t *testing.T) (context.Context, Repository) {
	t.Helper()
	ctx, repo, _ := newRequestedTestRepositoryWithDir(t)
	return ctx, repo
}

func newRequestedTestRepositoryWithDir(t *testing.T) (context.Context, Repository, string) {
	t.Helper()

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "character"), 0o755); err != nil {
		t.Fatalf("create characters dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "character", "character-index.json"), []byte("[]"), 0o644); err != nil {
		t.Fatalf("seed character index: %v", err)
	}

	s, err := storage.New(dir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}

	ctx := context.Background()
	repo, err := NewRepository(ctx, s)
	if err != nil {
		t.Fatalf("new repository: %v", err)
	}

	return ctx, repo, dir
}

func TestCreateUsesCurrentLiveHistoryAndVersionPaths(t *testing.T) {
	ctx, repo, dir := newRequestedTestRepositoryWithDir(t)
	c := requestedTestCharacter("ada", "Ada")
	c.Summary.TempHp = "3"
	c.Summary.CurrentConditions = "Poisoned, Prone"
	c.Fields["hpCurrent"] = "12"
	c.Fields["tempHp"] = "3"
	c.Fields["currentConditions"] = "Poisoned, Prone"
	c.Fields["hitDiceSpent"] = "2"
	c.UIState.Inspiration = true
	c.CustomLists.ArmorClass.Modifiers = []ArmorClassModifier{{Name: "Shield", Value: "2", Active: true}}

	if err := repo.CreateOrReplace(ctx, c); err != nil {
		t.Fatalf("create character: %v", err)
	}

	currentData, err := os.ReadFile(filepath.Join(dir, "character", "ada", "current.json"))
	if err != nil {
		t.Fatalf("read current: %v", err)
	}
	for _, unwanted := range []string{`"hpCurrent"`, `"tempHp"`, `"currentConditions"`, `"hitDiceSpent"`, `"inspiration"`, `"deathSaves"`, `"exhaustion"`, `"live"`} {
		if strings.Contains(string(currentData), unwanted) {
			t.Fatalf("current contains live-owned field %s: %s", unwanted, currentData)
		}
	}
	if strings.Contains(string(currentData), `"active":true`) {
		t.Fatalf("current persisted an active AC modifier: %s", currentData)
	}

	var live map[string]json.RawMessage
	liveData, err := os.ReadFile(filepath.Join(dir, "character", "ada", "live.json"))
	if err != nil {
		t.Fatalf("read live: %v", err)
	}
	if err := json.Unmarshal(liveData, &live); err != nil {
		t.Fatalf("decode live: %v", err)
	}
	if _, exists := live["hpMax"]; exists {
		t.Fatalf("live.json must not persist effective hpMax: %s", liveData)
	}
	for _, unwanted := range []string{"characterId", "revision", "schemaVersion"} {
		if _, exists := live[unwanted]; exists {
			t.Fatalf("live.json must not contain %s: %s", unwanted, liveData)
		}
	}

	history, err := repo.ListHistory(ctx, "ada")
	if err != nil || len(history) != 1 {
		t.Fatalf("expected one history entry, got %#v, %v", history, err)
	}
	if uuid.MustParse(history[0].VersionID).Version() != 7 {
		t.Fatalf("expected UUIDv7 version, got %q", history[0].VersionID)
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(history[0].File))); err != nil {
		t.Fatalf("stat version: %v", err)
	}

	indexData, err := os.ReadFile(filepath.Join(dir, "character", "character-index.json"))
	if err != nil {
		t.Fatalf("read index: %v", err)
	}
	if !strings.Contains(string(indexData), `"file":"character/ada/current.json"`) || strings.Contains(string(indexData), `"hpCurrent"`) {
		t.Fatalf("unexpected persisted index: %s", indexData)
	}
}

func TestLegacyCharacterIsReadableAndMigratesOnSave(t *testing.T) {
	ctx, repo, dir := newRequestedTestRepositoryWithDir(t)
	legacy := requestedTestCharacter("ada", "Ada")
	data, _ := json.Marshal(legacy)
	if err := os.WriteFile(filepath.Join(dir, "character", "ada.json"), data, 0o644); err != nil {
		t.Fatalf("write legacy character: %v", err)
	}
	index := []Index{{ID: "ada", Name: "Ada", File: "character/ada.json"}}
	indexData, _ := json.Marshal(index)
	if err := os.WriteFile(filepath.Join(dir, "character", "character-index.json"), indexData, 0o644); err != nil {
		t.Fatalf("write legacy index: %v", err)
	}

	if _, err := repo.GetByID(ctx, "ada"); err != nil {
		t.Fatalf("read legacy character: %v", err)
	}
	if err := repo.CreateOrReplace(ctx, legacy); err != nil {
		t.Fatalf("legacy save: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "character", "ada", "current.json")); err != nil {
		t.Fatalf("save did not migrate legacy character: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "character", "ada.json")); err != nil {
		t.Fatalf("legacy file should remain in place: %v", err)
	}
}

func TestCreateOrReplaceRejectsStaleCharacterSave(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)
	c := requestedTestCharacter("ada", "Ada")
	if err := repo.CreateOrReplace(ctx, c); err != nil {
		t.Fatalf("create character: %v", err)
	}
	loaded, err := repo.GetByID(ctx, "ada")
	if err != nil {
		t.Fatalf("load character: %v", err)
	}

	newer := loaded
	newer.Summary.Name = "Ada Storm"
	newer.ExpectedAt = loaded.UpdatedAt
	if err := repo.CreateOrReplace(ctx, newer); err != nil {
		t.Fatalf("save newer character: %v", err)
	}

	loaded.Summary.Name = "Stale Ada"
	loaded.ExpectedAt = loaded.UpdatedAt
	if err := repo.CreateOrReplace(ctx, loaded); !errors.Is(err, ErrCharacterConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
}

func TestCreateOrReplaceAcceptsRetryOfCompletedSave(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)
	c := requestedTestCharacter("ada", "Ada")
	if err := repo.CreateOrReplace(ctx, c); err != nil {
		t.Fatalf("create character: %v", err)
	}
	update, err := repo.GetByID(ctx, "ada")
	if err != nil {
		t.Fatalf("load character: %v", err)
	}
	update.ExpectedAt = update.UpdatedAt
	update.Summary.Name = "Ada Storm"
	if err := repo.CreateOrReplace(ctx, update); err != nil {
		t.Fatalf("save character: %v", err)
	}
	if err := repo.CreateOrReplace(ctx, update); err != nil {
		t.Fatalf("retry completed save: %v", err)
	}
	history, err := repo.ListHistory(ctx, "ada")
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("retry created another version: %#v", history)
	}
}

func TestUpdateLivePatchPreservesOmittedFieldsAndSupportsNullOverride(t *testing.T) {
	ctx, repo, dir := newRequestedTestRepositoryWithDir(t)
	c := requestedTestCharacter("ada", "Ada")
	if err := repo.CreateOrReplace(ctx, c); err != nil {
		t.Fatalf("create character: %v", err)
	}
	conditions := []string{"Prone"}
	override := "30"
	inspiration := true
	if err := repo.UpdateLive(ctx, "ada", LiveUpdate{HpOverride: &override, Conditions: &conditions, Inspiration: &inspiration}); err != nil {
		t.Fatalf("first live patch: %v", err)
	}
	temp := "4"
	if err := repo.UpdateLive(ctx, "ada", LiveUpdate{TempHp: &temp}); err != nil {
		t.Fatalf("second live patch: %v", err)
	}

	got, err := repo.GetByID(ctx, "ada")
	if err != nil {
		t.Fatalf("get character: %v", err)
	}
	if got.Live.HpMax != "30" || got.Live.TempHp != "4" || len(got.Live.Conditions) != 1 || !got.Live.Inspiration {
		t.Fatalf("patch did not preserve live values: %#v", got.Live)
	}

	var clear LiveUpdate
	if err := json.Unmarshal([]byte(`{"hpOverride":null}`), &clear); err != nil {
		t.Fatalf("decode null override: %v", err)
	}
	if err := repo.UpdateLive(ctx, "ada", clear); err != nil {
		t.Fatalf("clear override: %v", err)
	}
	got, _ = repo.GetByID(ctx, "ada")
	if got.Live.HpOverride != nil || got.Live.HpMax != "20" {
		t.Fatalf("expected configured max HP after clearing override: %#v", got.Live)
	}

	historyDataBefore, _ := os.ReadFile(filepath.Join(dir, "character", "ada", "history.json"))
	currentDataBefore, _ := os.ReadFile(filepath.Join(dir, "character", "ada", "current.json"))
	hp := "8"
	if err := repo.UpdateLive(ctx, "ada", LiveUpdate{HpCurrent: &hp}); err != nil {
		t.Fatalf("third live patch: %v", err)
	}
	historyDataAfter, _ := os.ReadFile(filepath.Join(dir, "character", "ada", "history.json"))
	currentDataAfter, _ := os.ReadFile(filepath.Join(dir, "character", "ada", "current.json"))
	if string(historyDataBefore) != string(historyDataAfter) || string(currentDataBefore) != string(currentDataAfter) {
		t.Fatal("live patch changed current or history storage")
	}
}

func TestRestoreCreatesVersionAndDoesNotChangeLive(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)
	c := requestedTestCharacter("ada", "Ada")
	if err := repo.CreateOrReplace(ctx, c); err != nil {
		t.Fatalf("create: %v", err)
	}
	firstHistory, _ := repo.ListHistory(ctx, "ada")
	c.Summary.Name = "Ada Storm"
	if err := repo.CreateOrReplace(ctx, c); err != nil {
		t.Fatalf("replace: %v", err)
	}
	hp := "1"
	if err := repo.UpdateLive(ctx, "ada", LiveUpdate{HpCurrent: &hp}); err != nil {
		t.Fatalf("update live: %v", err)
	}
	if err := repo.RestoreHistory(ctx, "ada", firstHistory[0].VersionID); err != nil {
		t.Fatalf("restore: %v", err)
	}
	got, _ := repo.GetByID(ctx, "ada")
	if got.Summary.Name != "Ada" || got.Live.HpCurrent != "1" {
		t.Fatalf("unexpected restored character: %#v", got)
	}
	history, _ := repo.ListHistory(ctx, "ada")
	if len(history) != 3 {
		t.Fatalf("restore should create a version, got %d entries", len(history))
	}
}

func TestDeleteIsSoftAndDeletedCharactersDoNotCountTowardLimit(t *testing.T) {
	ctx, repo, dir := newRequestedTestRepositoryWithDir(t)
	if err := repo.CreateOrReplace(ctx, requestedTestCharacter("deleted", "Deleted")); err != nil {
		t.Fatalf("create deleted candidate: %v", err)
	}
	if err := repo.Delete(ctx, "deleted"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := repo.GetByID(ctx, "deleted"); err == nil {
		t.Fatal("deleted character remained readable")
	}
	if _, err := os.Stat(filepath.Join(dir, "character", "deleted", "current.json")); err != nil {
		t.Fatalf("soft delete removed current file: %v", err)
	}
	for i := 0; i < 50; i++ {
		id := fmt.Sprintf("active-%d", i)
		if err := repo.CreateOrReplace(ctx, requestedTestCharacter(id, id)); err != nil {
			t.Fatalf("create active character %d: %v", i, err)
		}
	}
}

func TestRepositoryRejectsUnsafeIDs(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)
	for _, id := range []string{"../ada", "ada/bob", `ada\\bob`, ".", ".."} {
		if err := repo.CreateOrReplace(ctx, requestedTestCharacter(id, id)); err == nil {
			t.Fatalf("expected unsafe ID %q to be rejected", id)
		}
	}
}

func requestedTestCharacter(id, name string) Character {
	return Character{
		SchemaVersion: 2,
		ID:            id,
		Summary: Summary{
			Name:              name,
			ArmorClass:        "16",
			HpCurrent:         "12",
			HpMax:             "20",
			PassivePerception: "14",
		},
		Fields: Fields{
			"characterName": name,
		},
		CustomLists: CustomLists{},
		UIState:     UIState{},
		UpdatedAt:   "2026-07-12T10:00:00Z",
	}
}

func TestCreateOrReplaceReturnsErrorWhenCreatingMoreThan50Characters(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)

	for i := 0; i < 50; i++ {
		id := "character-" + string(rune('a'+i%26)) + string(rune('a'+i/26))
		if err := repo.CreateOrReplace(ctx, requestedTestCharacter(id, id)); err != nil {
			t.Fatalf("create character %d: %v", i, err)
		}
	}

	err := repo.CreateOrReplace(ctx, requestedTestCharacter("character-over-limit", "Over Limit"))
	if err == nil || !strings.Contains(err.Error(), "maximum number of characters reached") {
		t.Fatalf("expected maximum character count error, got %v", err)
	}
}

func TestCreateOrReplaceChangesCharacterDetails(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)

	character := requestedTestCharacter("ada", "Ada")
	if err := repo.CreateOrReplace(ctx, character); err != nil {
		t.Fatalf("create character: %v", err)
	}

	character.Summary.Name = "Ada Storm"
	character.Summary.ArmorClass = "18"
	character.Summary.HpCurrent = "22"
	character.Fields["characterName"] = "Ada Storm"

	if err := repo.CreateOrReplace(ctx, character); err != nil {
		t.Fatalf("replace character: %v", err)
	}

	updated, err := repo.GetByID(ctx, "ada")
	if err != nil {
		t.Fatalf("get updated character: %v", err)
	}
	if updated.Summary.Name != "Ada Storm" || updated.Summary.ArmorClass != "18" || updated.Summary.HpCurrent != "" {
		t.Fatalf("expected updated character details, got %#v", updated.Summary)
	}
	if updated.Fields["characterName"] != "Ada Storm" {
		t.Fatalf("expected updated character name field, got %#v", updated.Fields["characterName"])
	}
}

func TestCreateOrReplaceUpdatesIndexForExistingCharacter(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)

	character := requestedTestCharacter("ada", "Ada")
	character.CampaignID = "campaign-1"
	if err := repo.CreateOrReplace(ctx, character); err != nil {
		t.Fatalf("create character: %v", err)
	}

	character.Summary.Name = "Ada Storm"
	character.Summary.ArmorClass = "18"
	character.Summary.HpCurrent = "10"
	character.Summary.HpMax = "25"
	character.Summary.CurrentConditions = "Poisoned"
	character.UpdatedAt = "2026-07-12T11:00:00Z"
	if err := repo.CreateOrReplace(ctx, character); err != nil {
		t.Fatalf("replace character: %v", err)
	}

	idx, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("list characters: %v", err)
	}
	if len(idx) != 1 {
		t.Fatalf("expected one index entry, got %d", len(idx))
	}
	if idx[0].Name != "Ada Storm" || idx[0].CampaignID != "campaign-1" || idx[0].ArmorClass != "18" || idx[0].HpCurrent != "12" || idx[0].HpMax != "25" || idx[0].CurrentConditions != "" || idx[0].UpdatedAt == "" {
		t.Fatalf("expected updated index entry, got %#v", idx[0])
	}
}

func TestAssignToUserAllowsUnassign(t *testing.T) {
	ctx, repo := newRequestedTestRepository(t)
	users := testUserReader{users: []user.User{{ID: uuid.MustParse("018fe68a-01a8-70b1-8ea3-2d0b819a2d29"), Email: "ada@example.com"}}}
	character := requestedTestCharacter("ada", "Ada")
	character.UserID = "018fe68a-01a8-70b1-8ea3-2d0b819a2d29"
	if err := repo.CreateOrReplace(ctx, character); err != nil {
		t.Fatalf("create character: %v", err)
	}

	if err := repo.AssignToUser(ctx, users, "ada", ""); err != nil {
		t.Fatalf("unassign character: %v", err)
	}
	updated, err := repo.GetByID(ctx, "ada")
	if err != nil {
		t.Fatalf("get updated character: %v", err)
	}
	if updated.UserID != "" {
		t.Fatalf("expected unassigned character, got %q", updated.UserID)
	}
}
