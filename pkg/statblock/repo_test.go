package statblock

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"raperonzolo/character-sheet/pkg/storage"
)

func newTestRepository(t *testing.T) (context.Context, Repository, string) {
	t.Helper()

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "campaign"), 0o755); err != nil {
		t.Fatalf("create campaign dir: %v", err)
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

func TestListReturnsEmptyWhenFileMissing(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)

	statblocks, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("list statblocks: %v", err)
	}
	if len(statblocks) != 0 {
		t.Fatalf("expected no statblocks, got %#v", statblocks)
	}
}

func TestListReturnsEmptyWhenFileInvalid(t *testing.T) {
	ctx, repo, dir := newTestRepository(t)
	if err := os.WriteFile(filepath.Join(dir, customStatblocksPath), []byte("{"), 0o644); err != nil {
		t.Fatalf("write invalid statblocks: %v", err)
	}

	statblocks, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("list statblocks: %v", err)
	}
	if len(statblocks) != 0 {
		t.Fatalf("expected no statblocks, got %#v", statblocks)
	}
}

func TestSavePersistsNormalizedStatblocks(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)

	saved, err := repo.Save(ctx, []Statblock{
		{ID: "kraken-spawn", Name: "Kraken Spawn", HP: "44", SaveProficiencies: []string{" STR ", ""}},
		{ID: "reef-imp", Name: "Reef Imp", Size: "Small"},
	})
	if err != nil {
		t.Fatalf("save statblocks: %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("expected 2 saved statblocks, got %d", len(saved))
	}
	if saved[0].Name != "Kraken Spawn" || saved[0].Section != "Custom Monsters" || saved[0].Source != "Custom Monster" {
		t.Fatalf("expected normalized statblock, got %#v", saved[0])
	}
	if len(saved[0].SaveProficiencies) != 1 || saved[0].SaveProficiencies[0] != "STR" {
		t.Fatalf("expected cleaned save proficiencies, got %#v", saved[0].SaveProficiencies)
	}

	loaded, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("list statblocks: %v", err)
	}
	if len(loaded) != 2 || loaded[0].Name != "Kraken Spawn" || loaded[1].Name != "Reef Imp" {
		t.Fatalf("expected persisted statblocks, got %#v", loaded)
	}
}

func TestSaveRejectsTooManyCustomStatblocks(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)
	statblocks := make([]Statblock, 251)
	for i := range statblocks {
		statblocks[i] = Statblock{ID: "monster-" + string(rune('a'+i%26)) + string(rune('a'+i/26)), Name: "Monster"}
	}

	_, err := repo.Save(ctx, statblocks)
	if err == nil || !strings.Contains(err.Error(), "too many custom statblocks") {
		t.Fatalf("expected too many custom statblocks error, got %v", err)
	}
}

func TestSaveReplacesInvalidIDWithFallback(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)

	saved, err := repo.Save(ctx, []Statblock{{ID: "bad id", Name: "Bad ID"}})
	if err != nil {
		t.Fatalf("save statblocks: %v", err)
	}
	if len(saved) != 1 || saved[0].ID == "bad id" || !strings.HasPrefix(saved[0].ID, "custom-statblock-") {
		t.Fatalf("expected fallback ID, got %#v", saved)
	}
}
