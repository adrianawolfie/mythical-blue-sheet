package campaign

type State struct {
	SchemaVersion int          `json:"schemaVersion"`
	UpdatedAt     *string      `json:"updatedAt"`
	CalendarDate  CalendarDate `json:"calendarDate"`
	DaysTraveled  int          `json:"daysTraveled"`
}

type CalendarDate struct {
	Year    int     `json:"year"`
	Month   *int    `json:"month"`
	Day     *int    `json:"day"`
	Special *string `json:"special"`
}

func DefaultState() State {
	month := 3
	day := 28

	return State{
		SchemaVersion: 1,
		UpdatedAt:     nil,
		CalendarDate: CalendarDate{
			Year:    4520,
			Month:   &month,
			Day:     &day,
			Special: nil,
		},
		DaysTraveled: 0,
	}
}
