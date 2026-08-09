package campaign

import (
	"context"
	"raperonzolo/character-sheet/pkg/user"
)

type Campaign struct {
	ID            string       `json:"id"`
	Name          string       `json:"name"`
	SchemaVersion int          `json:"schemaVersion"`
	UpdatedAt     *string      `json:"updatedAt"`
	CalendarDate  CalendarDate `json:"calendarDate"`
	DaysTraveled  int          `json:"daysTraveled"`
	Players       []string     `json:"players"`
	DM            string       `json:"dm"`
}

type Index struct {
	ID string `json:"id"`
}

type ListOptions struct {
	PlayerID string
	DM       string
}

type ListOption func(*ListOptions)

func WithPlayerID(playerID string) ListOption {
	return func(options *ListOptions) {
		options.PlayerID = playerID
	}
}

func WithDM(dm string) ListOption {
	return func(options *ListOptions) {
		options.DM = dm
	}
}

type UserReader interface {
	List(ctx context.Context) []user.User
}

type AdminUserView struct {
	ID      string
	Name    string
	Email   string
	IsAdmin bool
}

type AdminPlayerView struct {
	ID   string
	Name string
}

type AdminView struct {
	ID             string
	Name           string
	Calendar       string
	DaysTraveled   int
	Players        []AdminPlayerView
	AvailableUsers []AdminUserView
	UpdatedAt      string
}

type CalendarDate struct {
	Year    int     `json:"year"`
	Month   *int    `json:"month"`
	Day     *int    `json:"day"`
	Special *string `json:"special"`
}

func DefaultState() Campaign {
	month := 3
	day := 28

	return Campaign{
		SchemaVersion: 1,
		UpdatedAt:     nil,
		CalendarDate: CalendarDate{
			Year:    4520,
			Month:   &month,
			Day:     &day,
			Special: nil,
		},
		DaysTraveled: 0,
		Players:      make([]string, 10),
	}
}
