package character

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"raperonzolo/character-sheet/pkg/storage"
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
	return Repository{RWMutex: new(sync.RWMutex), storage: s}, nil
}

func (repo Repository) CreateOrReplace(ctx context.Context, c Character) error {
	if err := validateID(c.ID); err != nil {
		return err
	}

	repo.Lock()
	defer repo.Unlock()

	idx, err := repo.readIndex(ctx)
	if err != nil {
		return fmt.Errorf("failed to list characters: %w", err)
	}
	active, existing := false, false
	for _, item := range idx {
		if item.ID == c.ID {
			existing = true
			active = item.DeletedAt == ""
		}
	}
	if !active {
		count := 0
		for _, item := range idx {
			if item.DeletedAt == "" {
				count++
			}
		}
		if count >= 50 {
			return fmt.Errorf("maximum number of characters reached")
		}
	}

	old, currentExists, err := repo.readCurrent(ctx, c.ID)
	if err != nil {
		return err
	}
	if !currentExists {
		old, _, err = repo.readCharacterFile(ctx, legacyPath(c.ID))
		if err != nil {
			return err
		}
	}
	prepared, live := prepareForStorage(c)
	if c.ExpectedAt != "" && old.UpdatedAt != "" && c.ExpectedAt != old.UpdatedAt {
		oldPrepared, _ := prepareForStorage(old)
		if active && sameConfiguration(oldPrepared, prepared) && indexMatchesCurrent(idx, oldPrepared) {
			return nil
		}
		return ErrCharacterConflict
	}
	c.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	prepared.UpdatedAt = c.UpdatedAt
	version, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("failed to create character version: %w", err)
	}
	versionID := version.String()
	versionFile := versionPath(c.ID, versionID)
	if err := repo.writeJSON(ctx, versionFile, prepared); err != nil {
		return fmt.Errorf("failed to save character version: %w", err)
	}
	history, err := repo.readHistory(ctx, c.ID)
	if err != nil {
		return err
	}
	history = append(history, History{VersionID: versionID, File: versionFile, UpdatedAt: prepared.UpdatedAt})
	if err := repo.writeJSON(ctx, historyPath(c.ID), history); err != nil {
		return fmt.Errorf("failed to save character history: %w", err)
	}

	// Seed live state once from formerly embedded fields. Full-sheet saves never
	// replace an independently updated live document, including on retries.
	_, liveExists, err := repo.readLive(ctx, c.ID)
	if err != nil {
		return fmt.Errorf("failed to read character live state: %w", err)
	}
	if !liveExists {
		live.HpMax = ""
		live.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		if err := repo.writeJSON(ctx, livePath(c.ID), live); err != nil {
			return fmt.Errorf("failed to save character live state: %w", err)
		}
	}
	if err := repo.writeJSON(ctx, currentPath(c.ID), prepared); err != nil {
		return fmt.Errorf("failed to save character: %w", err)
	}

	next := indexFromCharacter(prepared)
	for n, item := range idx {
		if item.ID == c.ID {
			idx[n] = next
			existing = true
			break
		}
	}
	if !existing {
		idx = append(idx, next)
	}
	if err := repo.writeJSON(ctx, characterIndexPath, idx); err != nil {
		return fmt.Errorf("failed to save character index: %w", err)
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
	idx, err := repo.readIndex(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to read character index: %w", err)
	}
	result := make([]Index, 0, len(idx))
	for _, item := range idx {
		if item.DeletedAt != "" {
			continue
		}
		c, err := repo.getByID(ctx, item.ID, false)
		if err != nil {
			return nil, err
		}
		if options.UserID != "" && c.UserID != options.UserID {
			continue
		}
		item.HpCurrent = c.Live.HpCurrent
		item.HpMax = c.Live.HpMax
		item.TempHp = c.Live.TempHp
		item.ArmorClass = effectiveArmorClass(c)
		item.CurrentConditions = strings.Join(c.Live.Conditions, ", ")
		result = append(result, item)
	}
	return result, nil
}

func (repo Repository) GetByID(ctx context.Context, id string) (Character, error) {
	if err := validateID(id); err != nil {
		return Character{}, err
	}
	repo.RLock()
	defer repo.RUnlock()
	return repo.getByID(ctx, id, true)
}

func (repo Repository) getByID(ctx context.Context, id string, checkDeleted bool) (Character, error) {
	if checkDeleted {
		idx, err := repo.readIndex(ctx)
		if err != nil {
			return Character{}, err
		}
		found := false
		for _, item := range idx {
			if item.ID == id && item.DeletedAt == "" {
				found = true
				break
			}
		}
		if !found {
			return Character{}, fmt.Errorf("character not found")
		}
	}
	c, currentExists, err := repo.readCurrent(ctx, id)
	if err != nil {
		return Character{}, err
	}
	exists := currentExists
	if !currentExists {
		c, exists, err = repo.readCharacterFile(ctx, legacyPath(id))
		if err != nil {
			return Character{}, err
		}
	}
	if !exists {
		return Character{}, fmt.Errorf("character not found")
	}
	var legacyLive Live
	if !currentExists {
		prepared, live := prepareForStorage(c)
		c = prepared.character()
		legacyLive = live
	}
	live, liveExists, err := repo.readLive(ctx, id)
	if err != nil {
		return Character{}, err
	}
	if !liveExists {
		live = legacyLive
		if live.HitDiceSpent == nil {
			_, live = prepareForStorage(c)
		}
	}
	live.HpMax = c.Summary.HpMax
	if live.HpOverride != nil {
		live.HpMax = *live.HpOverride
	}
	c.Live = live
	return c, nil
}

func (repo Repository) UpdateLive(ctx context.Context, id string, update LiveUpdate) error {
	if err := validateID(id); err != nil {
		return err
	}
	repo.Lock()
	defer repo.Unlock()
	c, err := repo.getByID(ctx, id, true)
	if err != nil {
		return err
	}
	live, exists, err := repo.readLive(ctx, id)
	if err != nil {
		return err
	}
	if !exists {
		_, live = prepareForStorage(c)
	}
	if update.HpCurrent != nil {
		live.HpCurrent = *update.HpCurrent
	}
	if update.HpOverrideSet || update.HpOverride != nil {
		live.HpOverride = update.HpOverride
	}
	if update.TempHp != nil {
		live.TempHp = *update.TempHp
	}
	if update.Conditions != nil {
		live.Conditions = *update.Conditions
	}
	if update.Inspiration != nil {
		live.Inspiration = *update.Inspiration
	}
	if update.ExhaustionLevel != nil {
		live.ExhaustionLevel = *update.ExhaustionLevel
	}
	if update.DeathSaves != nil {
		live.DeathSaves = *update.DeathSaves
	}
	if update.HitDiceSpent != nil {
		live.HitDiceSpent = *update.HitDiceSpent
	}
	if update.ActiveArmorClassModifiers != nil {
		live.ActiveArmorClassModifiers = *update.ActiveArmorClassModifiers
	}
	live.HpMax = ""
	live.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if err := repo.writeJSON(ctx, livePath(id), live); err != nil {
		return fmt.Errorf("failed to update character live state: %w", err)
	}
	return nil
}

func (repo Repository) GetLive(ctx context.Context, id string) (Live, error) {
	c, err := repo.GetByID(ctx, id)
	if err != nil {
		return Live{}, err
	}
	return c.Live, nil
}

func (repo Repository) ListHistory(ctx context.Context, id string) ([]History, error) {
	if err := validateID(id); err != nil {
		return nil, err
	}
	repo.RLock()
	defer repo.RUnlock()
	return repo.readHistory(ctx, id)
}

func (repo Repository) GetHistory(ctx context.Context, id, versionID string) (Character, error) {
	if err := validateID(id); err != nil {
		return Character{}, err
	}
	if err := validateVersionID(versionID); err != nil {
		return Character{}, err
	}
	repo.RLock()
	defer repo.RUnlock()
	c, exists, err := repo.readCharacterFile(ctx, versionPath(id, versionID))
	if err != nil {
		return Character{}, err
	}
	if !exists {
		return Character{}, fmt.Errorf("character version not found")
	}
	return c, nil
}

func (repo Repository) RestoreHistory(ctx context.Context, id, versionID string) error {
	c, err := repo.GetHistory(ctx, id, versionID)
	if err != nil {
		return err
	}
	c.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return repo.CreateOrReplace(ctx, c)
}

func (repo Repository) GetVersion(ctx context.Context, id, versionID string) (Character, error) {
	return repo.GetHistory(ctx, id, versionID)
}

func (repo Repository) RestoreVersion(ctx context.Context, id, versionID string) error {
	return repo.RestoreHistory(ctx, id, versionID)
}

func (repo Repository) Delete(ctx context.Context, id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	repo.Lock()
	defer repo.Unlock()
	idx, err := repo.readIndex(ctx)
	if err != nil {
		return err
	}
	found := false
	for n := range idx {
		if idx[n].ID == id && idx[n].DeletedAt == "" {
			idx[n].DeletedAt = time.Now().UTC().Format(time.RFC3339Nano)
			found = true
		}
	}
	if !found {
		return fmt.Errorf("character not found")
	}
	return repo.writeJSON(ctx, characterIndexPath, idx)
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
		views = append(views, ListView{ID: item.ID, Name: item.Name, Class: c.Fields["class"], Species: c.Fields["speciesRace"], Subclass: c.Fields["subclass"], Level: c.Fields["level"]})
	}
	return views, nil
}

func (repo Repository) ListForUser(ctx context.Context, users UserReader, email string) ([]ListView, error) {
	u, err := users.GetByUsername(email)
	if err != nil {
		return nil, err
	}
	if u.IsAdmin {
		return repo.ListViews(ctx)
	}
	return repo.ListViews(ctx, WithUserID(u.ID.String()))
}

func (repo Repository) ListAdmin(ctx context.Context, users UserReader) ([]AdminView, []AdminUserView, error) {
	idx, err := repo.List(ctx)
	if err != nil {
		return nil, nil, err
	}
	allUsers := users.List(ctx)
	userViews := make([]AdminUserView, 0, len(allUsers))
	names := map[string]string{}
	for _, u := range allUsers {
		names[u.ID.String()] = adminUserName(u.Name, u.Email)
		userViews = append(userViews, AdminUserView{ID: u.ID.String(), Name: u.Name, Email: u.Email, IsAdmin: u.IsAdmin})
	}
	views := make([]AdminView, 0, len(idx))
	for _, item := range idx {
		c, err := repo.GetByID(ctx, item.ID)
		if err != nil {
			return nil, nil, err
		}
		name := "Unassigned"
		if c.UserID != "" {
			name = names[c.UserID]
			if name == "" {
				name = "Unknown user"
			}
		}
		views = append(views, AdminView{ID: c.ID, Name: c.Summary.Name, Class: c.Fields["class"], Level: c.Fields["level"], UserID: c.UserID, UserName: name, Assigned: c.UserID != ""})
	}
	return views, userViews, nil
}

func (repo Repository) AssignToUser(ctx context.Context, users UserReader, characterID, userID string) error {
	if userID != "" {
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
	}
	c, err := repo.GetByID(ctx, characterID)
	if err != nil {
		return err
	}
	c.UserID = userID
	return repo.CreateOrReplace(ctx, c)
}

type currentDocument struct {
	SchemaVersion int              `json:"schemaVersion"`
	ID            string           `json:"id"`
	UserID        string           `json:"userId"`
	CampaignID    string           `json:"campaignId"`
	Summary       persistedSummary `json:"summary"`
	Fields        Fields           `json:"fields"`
	CustomLists   CustomLists      `json:"customLists"`
	UIState       persistedUIState `json:"uiState"`
	UpdatedAt     string           `json:"updatedAt"`
}

type persistedSummary struct {
	Name              string `json:"name"`
	ArmorClass        string `json:"armorClass"`
	HpMax             string `json:"hpMax"`
	HitDice           string `json:"hitDice"`
	PassivePerception string `json:"passivePerception"`
}

type persistedUIState struct {
	SkillProficiencies []bool `json:"skillProficiencies"`
}

func prepareForStorage(c Character) (currentDocument, Live) {
	fields := make(Fields, len(c.Fields))
	for key, value := range c.Fields {
		fields[key] = value
	}
	for _, key := range []string{"hpCurrent", "tempHp", "currentConditions", "hitDiceSpent"} {
		delete(fields, key)
	}
	live := c.Live
	if live.HpCurrent == "" {
		live.HpCurrent = first(c.Summary.HpCurrent, c.Fields["hpCurrent"])
		if live.HpCurrent == "" {
			live.HpCurrent = first(c.Summary.HpMax, c.Fields["hpMax"])
		}
	}
	if live.TempHp == "" {
		live.TempHp = first(c.Summary.TempHp, c.Fields["tempHp"])
	}
	if live.Conditions == nil {
		live.Conditions = splitConditions(first(c.Summary.CurrentConditions, c.Fields["currentConditions"]))
	}
	if live.HitDiceSpent == nil {
		live.HitDiceSpent = map[string]int{}
		if value := c.Fields["hitDiceSpent"]; value != "" {
			if spent, err := strconv.Atoi(value); err == nil {
				live.HitDiceSpent["default"] = spent
			}
		}
	}
	if !live.Inspiration {
		live.Inspiration = c.UIState.Inspiration
	}
	if live.ExhaustionLevel == 0 {
		for _, active := range c.UIState.Exhaustion {
			if active {
				live.ExhaustionLevel++
			}
		}
	}
	if live.DeathSaves == (DeathSaves{}) {
		for n, active := range c.UIState.DeathSaves {
			if active && n < 3 {
				live.DeathSaves.Successes++
			}
			if active && n >= 3 {
				live.DeathSaves.Failures++
			}
		}
	}
	activeModifiers := live.ActiveArmorClassModifiers
	armor := c.CustomLists.ArmorClass
	for n := range armor.Modifiers {
		if armor.Modifiers[n].Active {
			activeModifiers = append(activeModifiers, armor.Modifiers[n].Name)
		}
		armor.Modifiers[n].Active = false
	}
	live.ActiveArmorClassModifiers = activeModifiers
	c.CustomLists.ArmorClass = armor
	return currentDocument{SchemaVersion: c.SchemaVersion, ID: c.ID, UserID: c.UserID, CampaignID: c.CampaignID, Summary: persistedSummary{Name: c.Summary.Name, ArmorClass: c.Summary.ArmorClass, HpMax: first(c.Summary.HpMax, c.Fields["hpMax"]), HitDice: c.Summary.HitDice, PassivePerception: c.Summary.PassivePerception}, Fields: fields, CustomLists: c.CustomLists, UIState: persistedUIState{SkillProficiencies: c.UIState.SkillProficiencies}, UpdatedAt: c.UpdatedAt}, live
}

func (d currentDocument) character() Character {
	return Character{SchemaVersion: d.SchemaVersion, ID: d.ID, UserID: d.UserID, CampaignID: d.CampaignID, Summary: Summary{Name: d.Summary.Name, ArmorClass: d.Summary.ArmorClass, HpMax: d.Summary.HpMax, HitDice: d.Summary.HitDice, PassivePerception: d.Summary.PassivePerception}, Fields: d.Fields, CustomLists: d.CustomLists, UIState: UIState{SkillProficiencies: d.UIState.SkillProficiencies}, UpdatedAt: d.UpdatedAt}
}

func first(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func sameConfiguration(a, b currentDocument) bool {
	a.UpdatedAt = ""
	b.UpdatedAt = ""
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

func indexMatchesCurrent(index []Index, current currentDocument) bool {
	expected := indexFromCharacter(current)
	for _, item := range index {
		if item.ID != current.ID {
			continue
		}
		return item.DeletedAt == "" &&
			item.CampaignID == expected.CampaignID &&
			item.Name == expected.Name &&
			item.ArmorClass == expected.ArmorClass &&
			item.HpMax == expected.HpMax &&
			item.PassivePerception == expected.PassivePerception &&
			item.File == expected.File &&
			item.UpdatedAt == expected.UpdatedAt
	}
	return false
}
func splitConditions(value string) []string {
	if strings.TrimSpace(value) == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			result = append(result, part)
		}
	}
	return result
}

func effectiveArmorClass(c Character) string {
	base, err := strconv.Atoi(c.CustomLists.ArmorClass.Base)
	if err != nil {
		return c.Summary.ArmorClass
	}
	active := make(map[string]bool, len(c.Live.ActiveArmorClassModifiers))
	for _, name := range c.Live.ActiveArmorClassModifiers {
		active[name] = true
	}
	for _, modifier := range c.CustomLists.ArmorClass.Modifiers {
		if !active[modifier.Name] {
			continue
		}
		value, err := strconv.Atoi(modifier.Value)
		if err != nil {
			continue
		}
		base += value
	}
	return strconv.Itoa(base)
}

func indexFromCharacter(c currentDocument) Index {
	return Index{ID: c.ID, CampaignID: c.CampaignID, Name: c.Summary.Name, ArmorClass: c.Summary.ArmorClass, HpMax: c.Summary.HpMax, PassivePerception: c.Summary.PassivePerception, File: currentPath(c.ID), UpdatedAt: c.UpdatedAt}
}
func currentPath(id string) string { return path.Join(characterRootPath, id, "current.json") }
func livePath(id string) string    { return path.Join(characterRootPath, id, "live.json") }
func historyPath(id string) string { return path.Join(characterRootPath, id, "history.json") }
func versionPath(id, version string) string {
	return path.Join(characterRootPath, id, "versions", version+".json")
}
func legacyPath(id string) string { return path.Join(characterRootPath, id+".json") }

func validateID(id string) error {
	if id == "" {
		return fmt.Errorf("character ID is required")
	}
	if id == "." || id == ".." || path.Base(id) != id {
		return fmt.Errorf("invalid character ID")
	}
	for _, char := range id {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') && char != '-' && char != '_' && char != '.' {
			return fmt.Errorf("invalid character ID")
		}
	}
	return nil
}
func validateVersionID(id string) error {
	parsed, err := uuid.Parse(id)
	if err != nil || parsed.Version() != 7 || parsed.String() != id {
		return fmt.Errorf("invalid character version ID")
	}
	return nil
}

func (repo Repository) readIndex(ctx context.Context) ([]Index, error) {
	var idx []Index
	exists, err := repo.readJSON(ctx, characterIndexPath, &idx)
	if err != nil {
		return nil, err
	}
	if !exists {
		return []Index{}, nil
	}
	return idx, nil
}
func (repo Repository) readHistory(ctx context.Context, id string) ([]History, error) {
	var history []History
	exists, err := repo.readJSON(ctx, historyPath(id), &history)
	if err != nil {
		return nil, err
	}
	if !exists {
		return []History{}, nil
	}
	return history, nil
}
func (repo Repository) readCurrent(ctx context.Context, id string) (Character, bool, error) {
	var d currentDocument
	exists, err := repo.readJSON(ctx, currentPath(id), &d)
	if err != nil {
		return Character{}, false, fmt.Errorf("failed to read character: %w", err)
	}
	return d.character(), exists, nil
}
func (repo Repository) readLive(ctx context.Context, id string) (Live, bool, error) {
	var live Live
	exists, err := repo.readJSON(ctx, livePath(id), &live)
	return live, exists, err
}
func (repo Repository) readCharacterFile(ctx context.Context, file string) (Character, bool, error) {
	var c Character
	exists, err := repo.readJSON(ctx, file, &c)
	if err != nil {
		return Character{}, false, fmt.Errorf("failed to read character: %w", err)
	}
	return c, exists, nil
}

func (repo Repository) readJSON(ctx context.Context, file string, target any) (bool, error) {
	r, err := repo.storage.Reader(ctx, file)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	defer r.Close()
	err = json.NewDecoder(r).Decode(target)
	if err == io.EOF {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (repo Repository) writeJSON(ctx context.Context, file string, value any) error {
	w, err := repo.storage.Writer(ctx, file)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		_ = w.Close()
		return err
	}
	return w.Close()
}

func adminUserName(name, email string) string {
	if name != "" {
		return name
	}
	return email
}
