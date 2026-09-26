package party

import (
	"context"
	"errors"
	"testing"

	"raperonzolo/character-sheet/pkg/storage"
)

func newTestRepository(t *testing.T) (context.Context, Repository) {
	t.Helper()

	s, err := storage.New(t.TempDir())
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

func TestGetReturnsEmptyInventoryWhenNothingSaved(t *testing.T) {
	ctx, repo := newTestRepository(t)

	inventory, err := repo.Get(ctx, "campaign-1")
	if err != nil {
		t.Fatalf("get inventory: %v", err)
	}
	if inventory.CampaignID != "campaign-1" || len(inventory.Items) != 0 || len(inventory.Containers) != 0 || inventory.UpdatedAt != "" {
		t.Fatalf("expected empty inventory, got %#v", inventory)
	}
}

func TestGetRejectsInvalidCampaignID(t *testing.T) {
	ctx, repo := newTestRepository(t)

	for _, id := range []string{"", "../users", "a/b"} {
		if _, err := repo.Get(ctx, id); !errors.Is(err, ErrInvalidCampaignID) {
			t.Fatalf("expected invalid campaign ID error for %q, got %v", id, err)
		}
	}
}

func TestSaveNormalizesAndPersists(t *testing.T) {
	ctx, repo := newTestRepository(t)

	saved, err := repo.Save(ctx, Inventory{
		CampaignID: "campaign-1",
		Coins:      Coins{GP: " 120 "},
		Containers: []Container{{ID: "bag", Name: "Bag of Holding", CarriedBy: "char-1"}, {ID: "empty"}},
		Items: []Item{
			{ID: "rope", Name: "Rope", Category: "party", ClaimedBy: "char-1", Container: "bag"},
			{ID: "potion", Name: "Potion of Healing", Category: "loot", Qty: "3", ClaimedBy: "char-2", Container: "missing"},
			{ID: "blank"},
		},
		ExpectedUpdatedAt: "",
	})
	if err != nil {
		t.Fatalf("save inventory: %v", err)
	}
	if saved.UpdatedAt == "" || saved.Coins.GP != "120" {
		t.Fatalf("expected timestamp and trimmed coins, got %#v", saved)
	}
	if len(saved.Containers) != 1 || len(saved.Items) != 2 {
		t.Fatalf("expected empty rows dropped, got %#v", saved)
	}
	if saved.Items[0].ClaimedBy != "" || saved.Items[0].Container != "bag" {
		t.Fatalf("party items cannot be claimed and keep known containers, got %#v", saved.Items[0])
	}
	if saved.Items[1].ClaimedBy != "char-2" || saved.Items[1].Container != "" {
		t.Fatalf("loot keeps its claim and drops unknown containers, got %#v", saved.Items[1])
	}

	loaded, err := repo.Get(ctx, "campaign-1")
	if err != nil {
		t.Fatalf("get inventory: %v", err)
	}
	if loaded.UpdatedAt != saved.UpdatedAt || len(loaded.Items) != 2 {
		t.Fatalf("expected saved inventory, got %#v", loaded)
	}
}

func TestSaveRejectsStaleExpectedUpdatedAt(t *testing.T) {
	ctx, repo := newTestRepository(t)

	first, err := repo.Save(ctx, Inventory{CampaignID: "campaign-1", Items: []Item{{Name: "Tent"}}})
	if err != nil {
		t.Fatalf("save inventory: %v", err)
	}
	second, err := repo.Save(ctx, Inventory{CampaignID: "campaign-1", Items: []Item{{Name: "Cart"}}, ExpectedUpdatedAt: first.UpdatedAt})
	if err != nil {
		t.Fatalf("save with current timestamp: %v", err)
	}
	if _, err := repo.Save(ctx, Inventory{CampaignID: "campaign-1", Items: []Item{{Name: "Boat"}}, ExpectedUpdatedAt: first.UpdatedAt}); !errors.Is(err, ErrInventoryConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}

	loaded, _ := repo.Get(ctx, "campaign-1")
	if loaded.UpdatedAt != second.UpdatedAt || loaded.Items[0].Name != "Cart" {
		t.Fatalf("expected second save to remain, got %#v", loaded)
	}
}

func TestInventoriesAreSeparatePerCampaign(t *testing.T) {
	ctx, repo := newTestRepository(t)

	if _, err := repo.Save(ctx, Inventory{CampaignID: "campaign-1", Items: []Item{{Name: "Tent"}}}); err != nil {
		t.Fatalf("save inventory: %v", err)
	}
	other, err := repo.Get(ctx, "campaign-2")
	if err != nil {
		t.Fatalf("get inventory: %v", err)
	}
	if len(other.Items) != 0 {
		t.Fatalf("expected campaign-2 to be empty, got %#v", other)
	}
}
