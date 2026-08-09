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

func (repo Repository) List(ctx context.Context, opts ...ListOption) ([]Campaign, error) {
	repo.RLock()
	defer repo.RUnlock()

	options := ListOptions{}
	for _, opt := range opts {
		opt(&options)
	}

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
		if !campaignMatchesListOptions(campaign, options) {
			continue
		}
		campaigns = append(campaigns, campaign)
	}

	return campaigns, nil
}

func campaignMatchesListOptions(campaign Campaign, options ListOptions) bool {
	if options.DM != "" && campaign.DM != options.DM {
		return false
	}
	if options.PlayerID != "" && !campaignHasPlayer(campaign, options.PlayerID) {
		return false
	}
	return true
}

func campaignHasPlayer(campaign Campaign, playerID string) bool {
	for _, existing := range campaign.Players {
		if existing == playerID {
			return true
		}
	}
	return false
}

func (repo Repository) GetByID(ctx context.Context, id string) (Campaign, error) {
	repo.RLock()
	defer repo.RUnlock()

	return repo.getByID(ctx, id)
}

func (repo Repository) ListAdmin(ctx context.Context, users UserReader) ([]AdminView, error) {
	campaigns, err := repo.List(ctx)
	if err != nil {
		return nil, err
	}
	allUsers := users.List(ctx)
	userNamesByID := make(map[string]string)
	for _, u := range allUsers {
		userNamesByID[u.ID.String()] = adminUserName(u.Name, u.Email)
	}

	views := make([]AdminView, 0, len(campaigns))
	for _, campaign := range campaigns {
		players := make([]AdminPlayerView, 0, len(campaign.Players))
		playerIDs := make(map[string]bool)
		for _, playerID := range campaign.Players {
			name := userNamesByID[playerID]
			if name == "" {
				name = "Unknown user"
			}
			playerIDs[playerID] = true
			players = append(players, AdminPlayerView{ID: playerID, Name: name})
		}

		availableUsers := make([]AdminUserView, 0, len(allUsers))
		for _, u := range allUsers {
			if playerIDs[u.ID.String()] {
				continue
			}
			availableUsers = append(availableUsers, AdminUserView{ID: u.ID.String(), Name: u.Name, Email: u.Email, IsAdmin: u.IsAdmin})
		}
		views = append(views, AdminView{
			ID:             campaign.ID,
			Name:           campaign.Name,
			Calendar:       formatAdminCalendarDate(campaign.CalendarDate),
			DaysTraveled:   campaign.DaysTraveled,
			Players:        players,
			AvailableUsers: availableUsers,
			UpdatedAt:      formatAdminTimestamp(campaign.UpdatedAt),
		})
	}

	return views, nil
}

func (repo Repository) AddPlayer(ctx context.Context, users UserReader, campaignID string, userID string) error {
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

	campaign, err := repo.GetByID(ctx, campaignID)
	if err != nil {
		return err
	}
	for _, playerID := range campaign.Players {
		if playerID == userID {
			return nil
		}
	}
	campaign.Players = append(campaign.Players, userID)

	_, err = repo.SaveCampaign(ctx, campaign)
	return err
}

func (repo Repository) RemovePlayer(ctx context.Context, campaignID string, userID string) error {
	campaign, err := repo.GetByID(ctx, campaignID)
	if err != nil {
		return err
	}

	players := make([]string, 0, len(campaign.Players))
	for _, existing := range campaign.Players {
		if existing != userID {
			players = append(players, existing)
		}
	}
	campaign.Players = players

	_, err = repo.SaveCampaign(ctx, campaign)
	return err
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

func (repo Repository) SaveCampaign(ctx context.Context, campaign Campaign) (Campaign, error) {
	repo.Lock()
	defer repo.Unlock()

	if campaign.ID == "" {
		return Campaign{}, fmt.Errorf("campaign ID is required")
	}
	next, err := validateAndNormalize(campaign)
	if err != nil {
		return Campaign{}, err
	}

	w, err := repo.storage.Writer(ctx, path.Join(campaignRootPath, next.ID+".json"))
	if err != nil {
		return Campaign{}, fmt.Errorf("failed to write campaign: %w", err)
	}

	if err := json.NewEncoder(w).Encode(next); err != nil {
		_ = w.Close()
		return Campaign{}, fmt.Errorf("failed to encode campaign: %w", err)
	}
	if err := w.Close(); err != nil {
		return Campaign{}, fmt.Errorf("failed to close campaign: %w", err)
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

func formatAdminCalendarDate(date CalendarDate) string {
	if date.Special != nil {
		return *date.Special
	}
	if date.Month == nil || date.Day == nil {
		return "Unknown"
	}
	return fmt.Sprintf("Year %d, Month %d, Day %d", date.Year, *date.Month, *date.Day)
}

func adminUserName(name string, email string) string {
	if name != "" {
		return name
	}
	return email
}

func formatAdminTimestamp(value *string) string {
	if value == nil || *value == "" {
		return ""
	}
	parsed, err := time.Parse(time.RFC3339Nano, *value)
	if err != nil {
		return *value
	}
	return parsed.UTC().Format("Jan 2, 2006 15:04 UTC")
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
