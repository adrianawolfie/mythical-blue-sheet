package campaign

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"raperonzolo/character-sheet/pkg/storage"
)

func newTestRepository(t *testing.T) (context.Context, Repository, string) {
	t.Helper()

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "campaign"), 0o755); err != nil {
		t.Fatalf("create campaign dir: %v", err)
	}

	s, err := storage.New(dir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}

	ctx := context.Background()
	repo, err := NewRepository(ctx, s)
	if err != nil {
		t.Fatalf("new repository: %v", err)
	}

	return ctx, repo, dir
}

func TestGetReturnsDefaultWhenStateFileMissing(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)

	state, err := repo.Get(ctx)
	if err != nil {
		t.Fatalf("get state: %v", err)
	}

	if state.SchemaVersion != 1 || state.CalendarDate.Year != 4520 || state.DaysTraveled != 0 {
		t.Fatalf("expected default state, got %#v", state)
	}
	if state.CalendarDate.Month == nil || *state.CalendarDate.Month != 3 {
		t.Fatalf("expected default month, got %#v", state.CalendarDate.Month)
	}
	if state.CalendarDate.Day == nil || *state.CalendarDate.Day != 28 {
		t.Fatalf("expected default day, got %#v", state.CalendarDate.Day)
	}
}

func TestGetReturnsDefaultWhenStateFileInvalid(t *testing.T) {
	ctx, repo, dir := newTestRepository(t)
	if err := os.WriteFile(filepath.Join(dir, statePath), []byte("{"), 0o644); err != nil {
		t.Fatalf("write invalid state: %v", err)
	}

	state, err := repo.Get(ctx)
	if err != nil {
		t.Fatalf("get state: %v", err)
	}
	if state.CalendarDate.Year != 4520 {
		t.Fatalf("expected default state, got %#v", state)
	}
}

func TestSavePersistsCampaignState(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)
	month := 4
	day := 12

	saved, err := repo.Save(ctx, State{
		CalendarDate: CalendarDate{
			Year:  4521,
			Month: &month,
			Day:   &day,
		},
		DaysTraveled: 7,
	})
	if err != nil {
		t.Fatalf("save state: %v", err)
	}
	if saved.UpdatedAt == nil || *saved.UpdatedAt == "" {
		t.Fatalf("expected updatedAt to be set, got %#v", saved.UpdatedAt)
	}

	loaded, err := repo.Get(ctx)
	if err != nil {
		t.Fatalf("get state: %v", err)
	}
	if loaded.CalendarDate.Year != 4521 || loaded.CalendarDate.Month == nil || *loaded.CalendarDate.Month != 4 || loaded.CalendarDate.Day == nil || *loaded.CalendarDate.Day != 12 || loaded.DaysTraveled != 7 {
		t.Fatalf("expected persisted state, got %#v", loaded)
	}
}

func TestSaveRejectsInvalidYear(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)
	month := 4
	day := 12

	_, err := repo.Save(ctx, State{CalendarDate: CalendarDate{Year: 0, Month: &month, Day: &day}})
	if err == nil || !strings.Contains(err.Error(), "campaign year is invalid") {
		t.Fatalf("expected invalid year error, got %v", err)
	}
}

func TestSaveRejectsInvalidSpecialDay(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)
	special := "not-special"

	_, err := repo.Save(ctx, State{CalendarDate: CalendarDate{Year: 4521, Special: &special}})
	if err == nil || !strings.Contains(err.Error(), "campaign special day is invalid") {
		t.Fatalf("expected invalid special day error, got %v", err)
	}
}

func TestSaveRejectsInvalidMonthDay(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)
	month := 14
	day := 1

	_, err := repo.Save(ctx, State{CalendarDate: CalendarDate{Year: 4521, Month: &month, Day: &day}})
	if err == nil || !strings.Contains(err.Error(), "campaign calendar date is invalid") {
		t.Fatalf("expected invalid calendar date error, got %v", err)
	}
}

func TestSaveClampsNegativeDaysTraveled(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)
	month := 4
	day := 12

	saved, err := repo.Save(ctx, State{CalendarDate: CalendarDate{Year: 4521, Month: &month, Day: &day}, DaysTraveled: -5})
	if err != nil {
		t.Fatalf("save state: %v", err)
	}
	if saved.DaysTraveled != 0 {
		t.Fatalf("expected days traveled to clamp to 0, got %d", saved.DaysTraveled)
	}
}

func TestSaveNullsMonthAndDayForSpecialDay(t *testing.T) {
	ctx, repo, _ := newTestRepository(t)
	month := 4
	day := 12
	special := "intercalis"

	saved, err := repo.Save(ctx, State{CalendarDate: CalendarDate{Year: 4521, Month: &month, Day: &day, Special: &special}})
	if err != nil {
		t.Fatalf("save state: %v", err)
	}
	if saved.CalendarDate.Month != nil || saved.CalendarDate.Day != nil {
		t.Fatalf("expected special day month/day to be nil, got %#v", saved.CalendarDate)
	}
}
