package campaign

type Campaign struct {
	SchemaVersion int          `json:"schemaVersion"`
	UpdatedAt     *string      `json:"updatedAt"`
	CalendarDate  CalendarDate `json:"calendarDate"`
	DaysTraveled  int          `json:"daysTraveled"`
	Players       []string     `json:"players"`
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
