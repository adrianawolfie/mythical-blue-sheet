package statblock

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"raperonzolo/character-sheet/pkg/storage"
	"sort"
	"strings"
	"sync"
	"time"
)

const customStatblocksPath = "campaign/custom-statblocks.json"
const maxCustomStatblocks = 250

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

func (repo Repository) List(ctx context.Context) ([]Statblock, error) {
	repo.RLock()
	defer repo.RUnlock()

	r, err := repo.storage.Reader(ctx, customStatblocksPath)
	if err != nil {
		return []Statblock{}, nil
	}
	defer r.Close()

	var statblocks []Statblock
	if err := json.NewDecoder(r).Decode(&statblocks); err != nil {
		if err == io.EOF {
			return []Statblock{}, nil
		}
		return []Statblock{}, nil
	}

	return normalizeAll(statblocks), nil
}

func (repo Repository) Save(ctx context.Context, statblocks []Statblock) ([]Statblock, error) {
	repo.Lock()
	defer repo.Unlock()

	if len(statblocks) > maxCustomStatblocks {
		return nil, fmt.Errorf("too many custom statblocks")
	}

	normalized := normalizeAll(statblocks)
	w, err := repo.storage.Writer(ctx, path.Clean(customStatblocksPath))
	if err != nil {
		return nil, fmt.Errorf("failed to write custom statblocks: %w", err)
	}

	if err := json.NewEncoder(w).Encode(normalized); err != nil {
		_ = w.Close()
		return nil, fmt.Errorf("failed to encode custom statblocks: %w", err)
	}
	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("failed to close custom statblocks: %w", err)
	}

	return normalized, nil
}

func normalizeAll(statblocks []Statblock) []Statblock {
	normalized := make([]Statblock, 0, len(statblocks))
	for i, statblock := range statblocks {
		normalized = append(normalized, normalize(statblock, i))
	}

	sort.Slice(normalized, func(i, j int) bool {
		return strings.ToLower(normalized[i].Name) < strings.ToLower(normalized[j].Name)
	})
	return normalized
}

func normalize(statblock Statblock, index int) Statblock {
	fallbackID := fmt.Sprintf("custom-statblock-%d-%d", time.Now().UnixMilli(), index)
	statblock.ID = cleanID(statblock.ID, fallbackID)
	statblock.Name = cleanString(statblock.Name, 160, "Custom Monster")
	statblock.Section = "Custom Monsters"
	statblock.Size = cleanString(statblock.Size, 80, "Medium")
	statblock.Type = cleanString(statblock.Type, 120, "Creature")
	statblock.Alignment = cleanString(statblock.Alignment, 120, "Unaligned")
	statblock.ArmorClass = cleanString(statblock.ArmorClass, 80, "")
	statblock.Initiative = cleanString(statblock.Initiative, 80, "")
	statblock.HP = cleanString(statblock.HP, 80, "")
	statblock.HPFormula = cleanString(statblock.HPFormula, 160, "")
	statblock.Speed = cleanString(statblock.Speed, 200, "")
	statblock.ChallengeRating = cleanString(statblock.ChallengeRating, 80, "")
	statblock.ProficiencyBonus = cleanString(statblock.ProficiencyBonus, 20, "")
	statblock.Description = cleanString(statblock.Description, 1600, "")
	statblock.Text = cleanString(statblock.Text, 24000, "")
	statblock.Source = "Custom Monster"
	statblock.SaveProficiencies = cleanList(statblock.SaveProficiencies)
	statblock.SkillProficiencies = cleanList(statblock.SkillProficiencies)
	statblock.SkillExpertise = cleanList(statblock.SkillExpertise)
	if statblock.LegendaryResistanceMax < 0 {
		statblock.LegendaryResistanceMax = 0
	}
	if statblock.LegendaryActionMax < 0 {
		statblock.LegendaryActionMax = 0
	}
	return statblock
}

func cleanID(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	for _, r := range value {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '_' && r != '-' {
			return fallback
		}
	}
	return value
}

func cleanString(value string, maxLength int, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	if len(value) > maxLength {
		return value[:maxLength]
	}
	return value
}

func cleanList(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = cleanString(value, 80, "")
		if value != "" {
			result = append(result, value)
		}
		if len(result) >= 40 {
			break
		}
	}
	return result
}
