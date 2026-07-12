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

const statePath = "campaign/campaign-state.json"

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

func (repo Repository) Get(ctx context.Context) (State, error) {
	repo.RLock()
	defer repo.RUnlock()

	r, err := repo.storage.Reader(ctx, statePath)
	if err != nil {
		return DefaultState(), nil
	}
	defer r.Close()

	var state State
	if err := json.NewDecoder(r).Decode(&state); err != nil {
		if err == io.EOF {
			return DefaultState(), nil
		}
		return DefaultState(), nil
	}

	return normalize(state), nil
}

func (repo Repository) Save(ctx context.Context, state State) (State, error) {
	repo.Lock()
	defer repo.Unlock()

	next, err := validateAndNormalize(state)
	if err != nil {
		return State{}, err
	}

	w, err := repo.storage.Writer(ctx, path.Clean(statePath))
	if err != nil {
		return State{}, fmt.Errorf("failed to write campaign state: %w", err)
	}
	defer w.Close()

	if err := json.NewEncoder(w).Encode(next); err != nil {
		return State{}, fmt.Errorf("failed to encode campaign state: %w", err)
	}

	return next, nil
}

func validateAndNormalize(state State) (State, error) {
	if state.CalendarDate.Year < 1 {
		return State{}, fmt.Errorf("campaign year is invalid")
	}

	if state.CalendarDate.Special != nil {
		if *state.CalendarDate.Special != "intercalis" && *state.CalendarDate.Special != "aenaris" {
			return State{}, fmt.Errorf("campaign special day is invalid")
		}
	} else if state.CalendarDate.Month == nil || state.CalendarDate.Day == nil ||
		*state.CalendarDate.Month < 1 || *state.CalendarDate.Month > 13 ||
		*state.CalendarDate.Day < 1 || *state.CalendarDate.Day > 28 {
		return State{}, fmt.Errorf("campaign calendar date is invalid")
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

func normalize(state State) State {
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
