package character

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"path/filepath"
	"raperonzolo/character-sheet/pkg/storage"
	"sync"
)

const (
	characterIndexPath = "character/character-index.json"
	characterRootPath  = "character"
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

func (repo Repository) CreateOrReplace(ctx context.Context, c Character) error {
	idx, err := repo.List(ctx)
	if err != nil {
		return fmt.Errorf("failed to list characters: %w", err)
	}

	if len(idx) >= 50 {
		return fmt.Errorf("maximum number of characters reached")
	}

	if c.ID == "" {
		return fmt.Errorf("character ID is required")
	}

	if err := repo.saveCharacter(ctx, c); err != nil {
		return fmt.Errorf("failed to save character: %w", err)
	}

	if err := repo.addCharacter(ctx, idx, c); err != nil {
		return fmt.Errorf("failed to add character to index: %w", err)
	}

	return nil
}

func (repo Repository) List(ctx context.Context) ([]Index, error) {
	repo.RLock()
	defer repo.RUnlock()

	r, err := repo.storage.Reader(ctx, characterIndexPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read character: %w", err)
	}

	var idx []Index
	if err := json.NewDecoder(r).Decode(&idx); err != nil {
		return nil, fmt.Errorf("failed to decode character: %w", err)
	}

	return idx, nil
}

func (repo Repository) GetByID(ctx context.Context, id string) (Character, error) {
	repo.RLock()
	defer repo.RUnlock()

	r, err := repo.storage.Reader(ctx, filepath.Join(characterRootPath, id+".json"))
	if err != nil {
		return Character{}, fmt.Errorf("failed to read character: %w", err)
	}

	var c Character
	if err := json.NewDecoder(r).Decode(&c); err != nil {
		return Character{}, fmt.Errorf("failed to decode character: %w", err)
	}

	return c, nil
}

func (repo Repository) Delete(ctx context.Context, id string) error {
	repo.Lock()
	defer repo.Unlock()

	idx, err := repo.List(ctx)
	if err != nil {
		return fmt.Errorf("failed to list characters: %w", err)
	}

	updatedIdx := make([]Index, 0, len(idx))
	for _, c := range idx {
		if c.ID != id {
			updatedIdx = append(updatedIdx, c)
		}
	}

	if err := repo.storage.Delete(ctx, filepath.Join(characterRootPath, id+".json")); err != nil {
		return fmt.Errorf("failed to delete character: %w", err)
	}

	w, err := repo.storage.Writer(ctx, characterIndexPath)
	if err != nil {
		return fmt.Errorf("failed to write character index: %w", err)
	}

	if err := json.NewEncoder(w).Encode(updatedIdx); err != nil {
		_ = w.Close()
		return fmt.Errorf("failed to encode character index: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("failed to close character index: %w", err)
	}

	return nil
}

func (repo Repository) saveCharacter(ctx context.Context, c Character) error {
	repo.Lock()
	defer repo.Unlock()

	if c.ID == "" {
		return fmt.Errorf("character ID is required")
	}

	w, err := repo.storage.Writer(ctx, path.Join(characterRootPath, c.ID+".json"))
	if err != nil {
		return err
	}

	if err := json.NewEncoder(w).Encode(c); err != nil {
		_ = w.Close()
		return fmt.Errorf("failed to write character: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("failed to close character: %w", err)
	}

	return nil
}

func (repo Repository) addCharacter(ctx context.Context, idx []Index, c Character) error {
	idx = append(idx, Index{
		ID:                c.ID,
		Name:              c.Summary.Name,
		ArmorClass:        c.Summary.ArmorClass,
		HpCurrent:         c.Summary.HpCurrent,
		HpMax:             c.Summary.HpMax,
		PassivePerception: c.Summary.PassivePerception,
		CurrentConditions: c.Summary.CurrentConditions,
		File:              filepath.Join(characterRootPath, c.ID+".json"),
		UpdatedAt:         c.UpdatedAt,
	})

	w, err := repo.storage.Writer(ctx, characterIndexPath)
	if err != nil {
		return fmt.Errorf("failed to write character index: %w", err)
	}

	if err := json.NewEncoder(w).Encode(idx); err != nil {
		_ = w.Close()
		return fmt.Errorf("failed to encode character index: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("failed to close character index: %w", err)
	}

	return nil
}
