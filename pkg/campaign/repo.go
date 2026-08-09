package campaign

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"raperonzolo/character-sheet/pkg/storage"
	"sync"
	"time"
)

const (
	campaignIndexPath = "campaign/index.json"
	campaignRootPath  = "campaign"
	statePath         = "campaign/campaign-state.json"
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

func (repo Repository) Get(ctx context.Context) (Campaign, error) {
	repo.RLock()
	defer repo.RUnlock()

	r, err := repo.storage.Reader(ctx, statePath)
	if err != nil {
		return DefaultState(), nil
	}
	defer r.Close()

	var state Campaign
	if err := json.NewDecoder(r).Decode(&state); err != nil {
		if err == io.EOF {
			return DefaultState(), nil
		}
		return DefaultState(), nil
	}

	return normalize(state), nil
}

func (repo Repository) List(ctx context.Context) ([]Campaign, error) {
	repo.RLock()
	defer repo.RUnlock()

	r, err := repo.storage.Reader(ctx, campaignIndexPath)
	if err != nil {
		return []Campaign{}, nil
	}
	defer r.Close()

	var idx []Index
	if err := json.NewDecoder(r).Decode(&idx); err != nil {
		if err == io.EOF {
			return []Campaign{}, nil
		}
		return nil, fmt.Errorf("failed to decode campaign index: %w", err)
	}

	campaigns := make([]Campaign, 0, len(idx))
	for _, item := range idx {
		campaign, err := repo.getByID(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		campaigns = append(campaigns, campaign)
	}

	return campaigns, nil
}

func (repo Repository) Save(ctx context.Context, state Campaign) (Campaign, error) {
	repo.Lock()
	defer repo.Unlock()

	next, err := validateAndNormalize(state)
	if err != nil {
		return Campaign{}, err
	}

	w, err := repo.storage.Writer(ctx, path.Clean(statePath))
	if err != nil {
		return Campaign{}, fmt.Errorf("failed to write campaign state: %w", err)
	}

	if err := json.NewEncoder(w).Encode(next); err != nil {
		_ = w.Close()
		return Campaign{}, fmt.Errorf("failed to encode campaign state: %w", err)
	}
	if err := w.Close(); err != nil {
		return Campaign{}, fmt.Errorf("failed to close campaign state: %w", err)
	}

	return next, nil
}

func (repo Repository) getByID(ctx context.Context, id string) (Campaign, error) {
	r, err := repo.storage.Reader(ctx, path.Join(campaignRootPath, id+".json"))
	if err != nil {
		return Campaign{}, fmt.Errorf("failed to read campaign: %w", err)
	}
	defer r.Close()

	var campaign Campaign
	if err := json.NewDecoder(r).Decode(&campaign); err != nil {
		return Campaign{}, fmt.Errorf("failed to decode campaign: %w", err)
	}

	return normalize(campaign), nil
}

func validateAndNormalize(state Campaign) (Campaign, error) {
	if state.CalendarDate.Year < 1 {
		return Campaign{}, fmt.Errorf("campaign year is invalid")
	}

	if state.CalendarDate.Special != nil {
		if *state.CalendarDate.Special != "intercalis" && *state.CalendarDate.Special != "aenaris" {
			return Campaign{}, fmt.Errorf("campaign special day is invalid")
		}
	} else if state.CalendarDate.Month == nil || state.CalendarDate.Day == nil ||
		*state.CalendarDate.Month < 1 || *state.CalendarDate.Month > 13 ||
		*state.CalendarDate.Day < 1 || *state.CalendarDate.Day > 28 {
		return Campaign{}, fmt.Errorf("campaign calendar date is invalid")
	}

	updatedAt := time.Now().UTC().Format(time.RFC3339Nano)
	state.SchemaVersion = 1
	state.UpdatedAt = &updatedAt
	if state.DaysTraveled < 0 {
		state.DaysTraveled = 0
	}
	if state.CalendarDate.Special != nil {
		state.CalendarDate.Month = nil
		state.CalendarDate.Day = nil
	}

	return state, nil
}

func normalize(state Campaign) Campaign {
	if state.SchemaVersion == 0 {
		state.SchemaVersion = 1
	}
	if state.CalendarDate.Year < 1 {
		state.CalendarDate.Year = DefaultState().CalendarDate.Year
	}
	if state.DaysTraveled < 0 {
		state.DaysTraveled = 0
	}
	return state
}
