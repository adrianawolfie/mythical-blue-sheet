package character

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"raperonzolo/character-sheet/pkg/storage"
)

func newRequestedTestRepository(t *testing.T) (context.Context, Repository) {
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

	return ctx, repo
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
	if updated.Summary.Name != "Ada Storm" || updated.Summary.ArmorClass != "18" || updated.Summary.HpCurrent != "22" {
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
	if idx[0].Name != "Ada Storm" || idx[0].CampaignID != "campaign-1" || idx[0].ArmorClass != "18" || idx[0].HpCurrent != "10" || idx[0].HpMax != "25" || idx[0].CurrentConditions != "Poisoned" || idx[0].UpdatedAt != "2026-07-12T11:00:00Z" {
		t.Fatalf("expected updated index entry, got %#v", idx[0])
	}
}
