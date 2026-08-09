package character

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"path/filepath"
	"raperonzolo/character-sheet/pkg/storage"
	"sync"
	"time"
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

	if c.ID == "" {
		return fmt.Errorf("character ID is required")
	}

	exists := false
	for _, i := range idx {
		if i.ID == c.ID {
			exists = true
			break
		}
	}

	if !exists && len(idx) >= 50 {
		return fmt.Errorf("maximum number of characters reached")
	}
	if c.UpdatedAt == "" {
		c.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}

	if err := repo.saveCharacter(ctx, c); err != nil {
		return fmt.Errorf("failed to save character: %w", err)
	}

	if err := repo.addCharacter(ctx, idx, c); err != nil {
		return fmt.Errorf("failed to add character to index: %w", err)
	}

	return nil
}

func (repo Repository) List(ctx context.Context, opts ...ListOption) ([]Index, error) {
	repo.RLock()
	defer repo.RUnlock()

	options := ListOptions{}
	for _, opt := range opts {
		opt(&options)
	}

	r, err := repo.storage.Reader(ctx, characterIndexPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read character: %w", err)
	}

	var idx []Index
	if err := json.NewDecoder(r).Decode(&idx); err != nil {
		return nil, fmt.Errorf("failed to decode character: %w", err)
	}

	if options.UserID == "" {
		return idx, nil
	}

	filtered := make([]Index, 0, len(idx))
	for _, item := range idx {
		c, err := repo.getByID(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		if c.UserID == options.UserID {
			filtered = append(filtered, item)
		}
	}

	return filtered, nil
}

func (repo Repository) GetByID(ctx context.Context, id string) (Character, error) {
	repo.RLock()
	defer repo.RUnlock()

	return repo.getByID(ctx, id)
}

func (repo Repository) getByID(ctx context.Context, id string) (Character, error) {

	r, err := repo.storage.Reader(ctx, filepath.Join(characterRootPath, id+".json"))
	if err != nil {
		return Character{}, fmt.Errorf("failed to read character: %w", err)
	}
	defer r.Close()

	var c Character
	if err := json.NewDecoder(r).Decode(&c); err != nil {
		return Character{}, fmt.Errorf("failed to decode character: %w", err)
	}

	return c, nil
}

func (repo Repository) ListViews(ctx context.Context, opts ...ListOption) ([]ListView, error) {
	idx, err := repo.List(ctx, opts...)
	if err != nil {
		return nil, err
	}

	views := make([]ListView, 0, len(idx))
	for _, item := range idx {
		c, err := repo.GetByID(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		views = append(views, ListView{
			ID:       item.ID,
			Name:     item.Name,
			Class:    c.Fields["class"],
			Species:  c.Fields["speciesRace"],
			Subclass: c.Fields["subclass"],
			Level:    c.Fields["level"],
		})
	}

	return views, nil
}

func (repo Repository) ListForUser(ctx context.Context, users UserReader, email string) ([]ListView, error) {
	currentUser, err := users.GetByUsername(email)
	if err != nil {
		return nil, err
	}

	idx, err := repo.List(ctx, WithUserID(currentUser.ID.String()))
	if err != nil {
		return nil, err
	}

	views := make([]ListView, 0, len(idx))
	for _, item := range idx {
		c, err := repo.GetByID(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		views = append(views, ListView{
			ID:       item.ID,
			Name:     item.Name,
			Class:    c.Fields["class"],
			Species:  c.Fields["speciesRace"],
			Subclass: c.Fields["subclass"],
			Level:    c.Fields["level"],
		})
	}

	return views, nil
}

func (repo Repository) ListAdmin(ctx context.Context, users UserReader) ([]AdminView, []AdminUserView, error) {
	idx, err := repo.List(ctx)
	if err != nil {
		return nil, nil, err
	}

	allUsers := users.List(ctx)
	userViews := make([]AdminUserView, 0, len(allUsers))
	userNamesByID := make(map[string]string)
	for _, u := range allUsers {
		name := adminUserName(u.Name, u.Email)
		userNamesByID[u.ID.String()] = name
		userViews = append(userViews, AdminUserView{ID: u.ID.String(), Name: u.Name, Email: u.Email, IsAdmin: u.IsAdmin})
	}

	views := make([]AdminView, 0, len(idx))
	for _, item := range idx {
		c, err := repo.GetByID(ctx, item.ID)
		if err != nil {
			return nil, nil, err
		}

		userName := "Unassigned"
		if c.UserID != "" {
			userName = userNamesByID[c.UserID]
			if userName == "" {
				userName = "Unknown user"
			}
		}

		views = append(views, AdminView{
			ID:       c.ID,
			Name:     c.Summary.Name,
			Class:    c.Fields["class"],
			Level:    c.Fields["level"],
			UserID:   c.UserID,
			UserName: userName,
			Assigned: c.UserID != "",
		})
	}

	return views, userViews, nil
}

func (repo Repository) AssignToUser(ctx context.Context, users UserReader, characterID string, userID string) error {
	if userID == "" {
		return fmt.Errorf("userId is required")
	}
	found := false
	for _, u := range users.List(ctx) {
		if u.ID.String() == userID {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("user not found")
	}

	c, err := repo.GetByID(ctx, characterID)
	if err != nil {
		return err
	}
	c.UserID = userID

	return repo.CreateOrReplace(ctx, c)
}

func (repo Repository) UpdateStatus(ctx context.Context, id string, u Update) error {
	c, err := repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	c.Summary.HpCurrent = u.HpCurrent
	c.Summary.HpMax = u.HpMax
	c.Summary.TempHp = u.TempHp
	c.Summary.ArmorClass = u.ArmorClass
	c.Summary.CurrentConditions = u.CurrentConditions

	if c.Fields == nil {
		c.Fields = Fields{}
	}
	c.Fields["hpCurrent"] = u.HpCurrent
	c.Fields["hpMax"] = u.HpMax
	c.Fields["tempHp"] = u.TempHp
	c.Fields["armorClass"] = u.ArmorClass
	c.Fields["currentConditions"] = u.CurrentConditions

	if u.ArmorClassState != nil {
		c.CustomLists.ArmorClass = *u.ArmorClassState
	}

	c.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	return repo.CreateOrReplace(ctx, c)
}

func (repo Repository) Delete(ctx context.Context, id string) error {
	repo.Lock()
	defer repo.Unlock()

	r, err := repo.storage.Reader(ctx, characterIndexPath)
	if err != nil {
		return fmt.Errorf("failed to read character: %w", err)
	}
	defer r.Close()
	var idx []Index
	if err := json.NewDecoder(r).Decode(&idx); err != nil {
		return fmt.Errorf("failed to decode character: %w", err)
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
	next := Index{
		ID:                c.ID,
		CampaignID:        c.CampaignID,
		Name:              c.Summary.Name,
		ArmorClass:        c.Summary.ArmorClass,
		HpCurrent:         c.Summary.HpCurrent,
		HpMax:             c.Summary.HpMax,
		PassivePerception: c.Summary.PassivePerception,
		CurrentConditions: c.Summary.CurrentConditions,
		File:              filepath.Join(characterRootPath, c.ID+".json"),
		UpdatedAt:         c.UpdatedAt,
	}

	for n, i := range idx {
		if i.ID == c.ID {
			idx[n] = next
			return repo.saveIndex(ctx, idx)
		}
	}

	idx = append(idx, next)
	return repo.saveIndex(ctx, idx)
}

func (repo Repository) saveIndex(ctx context.Context, idx []Index) error {
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

func adminUserName(name string, email string) string {
	if name != "" {
		return name
	}
	return email
}
