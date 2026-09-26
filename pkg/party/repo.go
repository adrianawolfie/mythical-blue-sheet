package party

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"raperonzolo/character-sheet/pkg/storage"
	"strings"
	"sync"
	"time"
)

const (
	partyRootPath = "party"
	maxItems      = 500
	maxContainers = 50
)

type Repository struct {
	*sync.RWMutex
	storage storage.Storage
}

func NewRepository(ctx context.Context, s storage.Storage) (Repository, error) {
	return Repository{
		RWMutex: new(sync.RWMutex),
		storage: s,
	}, nil
}

// Get returns the party inventory of a campaign, or an empty inventory when
// nothing has been saved yet.
func (repo Repository) Get(ctx context.Context, campaignID string) (Inventory, error) {
	if !validID(campaignID) {
		return Inventory{}, ErrInvalidCampaignID
	}

	repo.RLock()
	defer repo.RUnlock()

	return repo.read(ctx, campaignID), nil
}

// Save validates, normalizes, timestamps, and persists a party inventory. A
// non-empty ExpectedUpdatedAt that no longer matches the stored inventory is
// rejected so one player's save cannot silently overwrite another's.
func (repo Repository) Save(ctx context.Context, inventory Inventory) (Inventory, error) {
	if !validID(inventory.CampaignID) {
		return Inventory{}, ErrInvalidCampaignID
	}
	if len(inventory.Items) > maxItems {
		return Inventory{}, fmt.Errorf("too many party items")
	}
	if len(inventory.Containers) > maxContainers {
		return Inventory{}, fmt.Errorf("too many party containers")
	}

	repo.Lock()
	defer repo.Unlock()

	current := repo.read(ctx, inventory.CampaignID)
	if inventory.ExpectedUpdatedAt != "" && current.UpdatedAt != "" && inventory.ExpectedUpdatedAt != current.UpdatedAt {
		return Inventory{}, ErrInventoryConflict
	}

	next := normalize(inventory)
	next.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)

	w, err := repo.storage.Writer(ctx, filePath(next.CampaignID))
	if err != nil {
		return Inventory{}, fmt.Errorf("failed to write party inventory: %w", err)
	}
	if err := json.NewEncoder(w).Encode(next); err != nil {
		_ = w.Close()
		return Inventory{}, fmt.Errorf("failed to encode party inventory: %w", err)
	}
	if err := w.Close(); err != nil {
		return Inventory{}, fmt.Errorf("failed to close party inventory: %w", err)
	}

	return next, nil
}

func (repo Repository) read(ctx context.Context, campaignID string) Inventory {
	empty := normalize(Inventory{CampaignID: campaignID})

	r, err := repo.storage.Reader(ctx, filePath(campaignID))
	if err != nil {
		return empty
	}
	defer r.Close()

	var inventory Inventory
	if err := json.NewDecoder(r).Decode(&inventory); err != nil {
		return empty
	}
	inventory.CampaignID = campaignID
	updatedAt := inventory.UpdatedAt
	inventory = normalize(inventory)
	inventory.UpdatedAt = updatedAt
	return inventory
}

func filePath(campaignID string) string {
	return path.Join(partyRootPath, campaignID+".json")
}

func normalize(inventory Inventory) Inventory {
	inventory.ExpectedUpdatedAt = ""
	inventory.Coins = Coins{
		CP: cleanString(inventory.Coins.CP, 20),
		SP: cleanString(inventory.Coins.SP, 20),
		EP: cleanString(inventory.Coins.EP, 20),
		GP: cleanString(inventory.Coins.GP, 20),
		PP: cleanString(inventory.Coins.PP, 20),
	}

	containers := make([]Container, 0, len(inventory.Containers))
	containerIDs := map[string]bool{}
	for i, container := range inventory.Containers {
		container.ID = cleanID(container.ID, fmt.Sprintf("party-container-%d-%d", time.Now().UnixMilli(), i))
		container.Name = cleanString(container.Name, 120)
		container.CarriedBy = cleanString(container.CarriedBy, 80)
		container.Notes = cleanString(container.Notes, 1000)
		if container.Name == "" && container.Notes == "" {
			continue
		}
		containerIDs[container.ID] = true
		containers = append(containers, container)
	}
	inventory.Containers = containers

	items := make([]Item, 0, len(inventory.Items))
	for i, item := range inventory.Items {
		item.ID = cleanID(item.ID, fmt.Sprintf("party-item-%d-%d", time.Now().UnixMilli(), i))
		item.Name = cleanString(item.Name, 160)
		if item.Category != "loot" {
			item.Category = "party"
		}
		item.Type = cleanString(item.Type, 40)
		item.Rarity = cleanString(item.Rarity, 40)
		item.Qty = cleanString(item.Qty, 20)
		item.Value = cleanString(item.Value, 60)
		item.Container = cleanString(item.Container, 80)
		if !containerIDs[item.Container] {
			item.Container = ""
		}
		item.ClaimedBy = cleanString(item.ClaimedBy, 80)
		if item.Category != "loot" {
			item.ClaimedBy = ""
		}
		item.Notes = cleanString(item.Notes, 4000)
		if item.Name == "" && item.Notes == "" {
			continue
		}
		items = append(items, item)
	}
	inventory.Items = items

	return inventory
}

func validID(value string) bool {
	return value != "" && cleanID(value, "") == value && len(value) <= 80
}

func cleanID(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 80 {
		return fallback
	}
	for _, r := range value {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '_' && r != '-' {
			return fallback
		}
	}
	return value
}

func cleanString(value string, maxLength int) string {
	value = strings.TrimSpace(value)
	if len(value) > maxLength {
		return value[:maxLength]
	}
	return value
}
