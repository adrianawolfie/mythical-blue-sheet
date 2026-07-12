package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"raperonzolo/character-sheet/pkg/storage"
	"raperonzolo/character-sheet/pkg/storage/s3"
	"regexp"
	"sort"
	"strings"
	"time"
)

var safeID = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

const maxJSONBytes int64 = 5 * 1024 * 1024
const maxCharacterCount = 50

type apiHandler struct {
	storage storage.Storage
	spaces  *s3.Client
}

func NewAPIHandler(client storage.Storage) http.Handler {
	return apiHandler{storage: client}
}

func (h apiHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	switch {
	case r.URL.Path == "/api/campaign-state":
		h.handleCampaignState(w, r)
	case r.URL.Path == "/api/custom-statblocks":
		h.handleCustomStatblocks(w, r)
	default:
		writeJSON(w, http.StatusNotFound, fmt.Errorf("Not found."))
	}
}

func (h apiHandler) handleCampaignState(w http.ResponseWriter, r *http.Request) {
	// if h.storageMode == "s3" {
	// 	h.handleCampaignStateS3(w, r)
	// 	return
	// }

	path := filepath.Join("data", "campaign", "campaign-state.json")

	switch r.Method {
	case http.MethodGet:
		raw, err := os.ReadFile(path)
		if err != nil {
			writeJSON(w, http.StatusOK, defaultCampaignState())
			return
		}

		if !json.Valid(raw) {
			writeJSON(w, http.StatusOK, defaultCampaignState())
			return
		}

		writeRawJSON(w, http.StatusOK, raw)
	case http.MethodPost:
		body, err := readJSONBody(w, r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		date, _ := body["calendarDate"].(map[string]any)
		year := intValue(date, "year")
		if year < 1 {
			writeJSON(w, http.StatusBadRequest, fmt.Errorf("Campaign year is invalid."))
			return
		}

		special := stringValue(date, "special")
		if special != "" && special != "intercalis" && special != "aenaris" {
			writeJSON(w, http.StatusBadRequest, fmt.Errorf("Campaign special day is invalid."))
			return
		}

		month := intValue(date, "month")
		day := intValue(date, "day")
		if special == "" && (month < 1 || month > 13 || day < 1 || day > 28) {
			writeJSON(w, http.StatusBadRequest, fmt.Errorf("Campaign calendar date is invalid."))
			return
		}

		nextState := map[string]any{
			"schemaVersion": 1,
			"updatedAt":     time.Now().UTC().Format(time.RFC3339Nano),
			"calendarDate": map[string]any{
				"year":    year,
				"month":   nilIfSpecial(special, month),
				"day":     nilIfSpecial(special, day),
				"special": nilIfEmpty(special),
			},
			"daysTraveled": maxInt(0, intValue(body, "daysTraveled")),
		}

		if err := writeJSONObject(path, nextState); err != nil {
			writeJSON(w, http.StatusInternalServerError, err)
			return
		}

		writeJSON(w, http.StatusOK, nextState)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, fmt.Errorf("Method not allowed."))
	}
}

func (h apiHandler) handleCustomStatblocks(w http.ResponseWriter, r *http.Request) {
	// if h.storageMode == "s3" {
	// 	h.handleCustomStatblocksS3(w, r)
	// 	return
	// }

	path := filepath.Join("data", "campaign", "custom-statblocks.json")

	switch r.Method {
	case http.MethodGet:
		raw, err := os.ReadFile(path)
		if err != nil || !json.Valid(raw) {
			writeJSON(w, http.StatusOK, map[string]any{"statblocks": []any{}})
			return
		}

		writeRawJSON(w, http.StatusOK, raw)
	case http.MethodPost:
		body, err := readJSONBody(w, r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		incoming, ok := body["statblocks"].([]any)
		if !ok {
			writeJSON(w, http.StatusBadRequest, fmt.Errorf("Custom statblocks payload must be a list."))
			return
		}

		if len(incoming) > 250 {
			writeJSON(w, http.StatusBadRequest, fmt.Errorf("Too many custom statblocks."))
			return
		}

		normalized := make([]map[string]any, 0, len(incoming))
		for i, item := range incoming {
			statblock, ok := item.(map[string]any)
			if !ok {
				continue
			}
			normalized = append(normalized, normalizeStatblock(statblock, i))
		}

		sort.Slice(normalized, func(i, j int) bool {
			return strings.ToLower(stringValue(normalized[i], "name")) < strings.ToLower(stringValue(normalized[j], "name"))
		})

		if err := writeJSONObject(path, normalized); err != nil {
			writeJSON(w, http.StatusInternalServerError, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"success": true, "statblocks": normalized})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, fmt.Errorf("Method not allowed."))
	}
}

type characterIndexEntry struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	ArmorClass        string `json:"armorClass"`
	HpCurrent         string `json:"hpCurrent"`
	HpMax             string `json:"hpMax"`
	PassivePerception string `json:"passivePerception"`
	CurrentConditions string `json:"currentConditions"`
	File              string `json:"file"`
	UpdatedAt         string `json:"updatedAt"`
}

type characterFile struct {
	ID          string           `json:"id"`
	Summary     characterSummary `json:"summary"`
	Fields      map[string]any   `json:"fields"`
	CustomLists map[string]any   `json:"customLists"`
	UpdatedAt   string           `json:"updatedAt"`
}

type characterSummary struct {
	Name              string `json:"name"`
	ArmorClass        string `json:"armorClass"`
	HpCurrent         string `json:"hpCurrent"`
	HpMax             string `json:"hpMax"`
	TempHp            string `json:"tempHp"`
	PassivePerception string `json:"passivePerception"`
	CurrentConditions string `json:"currentConditions"`
}

func readJSONBody(w http.ResponseWriter, r *http.Request) (map[string]any, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			return nil, fmt.Errorf("Request body exceeds 5MB limit.")
		}
		return nil, err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return map[string]any{}, nil
	}

	var body map[string]any
	if err := json.Unmarshal(data, &body); err != nil {
		return nil, fmt.Errorf("Invalid JSON payload.")
	}
	return body, nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeRawJSON(w http.ResponseWriter, status int, raw []byte) {
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

func readCharacterBytes(raw []byte) (characterFile, error) {
	var character characterFile
	if err := json.Unmarshal(raw, &character); err != nil {
		return character, err
	}
	if character.Fields == nil {
		character.Fields = map[string]any{}
	}
	if character.CustomLists == nil {
		character.CustomLists = map[string]any{}
	}
	return character, nil
}

func readCharacterFile(path string) (characterFile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return characterFile{}, err
	}
	return readCharacterBytes(raw)
}

func writeJSONObject(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if int64(len(data)) > maxJSONBytes {
		return fmt.Errorf("JSON payload exceeds 5MB limit.")
	}
	data = append(data, '\n')

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func normalizeStatblock(statblock map[string]any, index int) map[string]any {
	fallbackID := fmt.Sprintf("custom-statblock-%d-%d", time.Now().UnixMilli(), index)
	rawID := strings.TrimSpace(cleanString(statblock["id"], 120, ""))
	safeIDValue := rawID
	if !safeID.MatchString(rawID) {
		safeIDValue = fallbackID
	}

	return map[string]any{
		"id":                     safeIDValue,
		"name":                   cleanString(statblock["name"], 160, "Custom Monster"),
		"section":                "Custom Monsters",
		"size":                   cleanString(statblock["size"], 80, "Medium"),
		"type":                   cleanString(statblock["type"], 120, "Creature"),
		"alignment":              cleanString(statblock["alignment"], 120, "Unaligned"),
		"armorClass":             cleanString(statblock["armorClass"], 80, ""),
		"initiative":             cleanString(statblock["initiative"], 80, ""),
		"hp":                     cleanString(statblock["hp"], 80, ""),
		"hpFormula":              cleanString(statblock["hpFormula"], 160, ""),
		"speed":                  cleanString(statblock["speed"], 200, ""),
		"challengeRating":        cleanString(statblock["challengeRating"], 80, ""),
		"proficiencyBonus":       cleanString(statblock["proficiencyBonus"], 20, ""),
		"description":            cleanString(statblock["description"], 1600, ""),
		"text":                   cleanString(statblock["text"], 24000, ""),
		"source":                 "Custom Monster",
		"legendaryResistanceMax": cleanNumber(statblock["legendaryResistanceMax"]),
		"legendaryActionMax":     cleanNumber(statblock["legendaryActionMax"]),
		"saveProficiencies":      cleanList(statblock["saveProficiencies"]),
		"skillProficiencies":     cleanList(statblock["skillProficiencies"]),
		"skillExpertise":         cleanList(statblock["skillExpertise"]),
	}
}

func cleanString(value any, maxLength int, fallback string) string {
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "<nil>" || text == "" {
		return fallback
	}
	if len(text) > maxLength {
		return text[:maxLength]
	}
	return text
}

func cleanNumber(value any) int {
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "<nil>" || text == "" {
		return 0
	}
	var n int
	_, err := fmt.Sscanf(text, "%d", &n)
	if err != nil || n <= 0 {
		return 0
	}
	return n
}

func cleanList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return []string{}
	}

	result := make([]string, 0, len(items))
	for _, item := range items {
		text := strings.TrimSpace(cleanString(item, 80, ""))
		if text != "" {
			result = append(result, text)
		}
		if len(result) >= 40 {
			break
		}
	}
	return result
}

func stringField(body map[string]any, key string) (string, bool) {
	value, ok := body[key]
	if !ok || value == nil {
		return "", false
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "<nil>" || text == "" {
		return "", false
	}
	return text, true
}

func stringValue(body map[string]any, key string) string {
	text, _ := stringField(body, key)
	return text
}

func intValue(body map[string]any, key string) int {
	switch value := body[key].(type) {
	case float64:
		return int(value)
	case int:
		return value
	case int64:
		return int(value)
	case json.Number:
		n, _ := value.Int64()
		return int(n)
	default:
		var n int
		_, _ = fmt.Sscanf(fmt.Sprint(value), "%d", &n)
		return n
	}
}

func nilIfSpecial(special string, value int) any {
	if special != "" {
		return nil
	}
	return value
}

func nilIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func maxInt(min, value int) int {
	if value < min {
		return min
	}
	return value
}

func fallback(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func ensureMap(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return value
}

func ensureMapValue(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	if valueMap, ok := value.(map[string]any); ok && valueMap != nil {
		return valueMap
	}
	return map[string]any{}
}

func updateCharacterStatusRecordToMap(raw []byte, body map[string]any, updatedAt string) (map[string]any, error) {
	var character map[string]any
	if err := json.Unmarshal(raw, &character); err != nil {
		return nil, err
	}
	if character == nil {
		character = map[string]any{}
	}

	summary := ensureMapValue(character["summary"])
	fields := ensureMapValue(character["fields"])
	customLists := ensureMapValue(character["customLists"])

	summary["hpCurrent"] = stringValue(body, "hpCurrent")
	summary["hpMax"] = stringValue(body, "hpMax")
	summary["tempHp"] = stringValue(body, "tempHp")
	summary["armorClass"] = stringValue(body, "armorClass")
	summary["currentConditions"] = stringValue(body, "currentConditions")
	character["summary"] = summary

	fields["hpCurrent"] = stringValue(body, "hpCurrent")
	fields["hpMax"] = stringValue(body, "hpMax")
	fields["tempHp"] = stringValue(body, "tempHp")
	fields["armorClass"] = stringValue(body, "armorClass")
	fields["currentConditions"] = stringValue(body, "currentConditions")
	character["fields"] = fields

	if acState, ok := body["armorClassState"].(map[string]any); ok {
		customLists["armorClass"] = acState
		character["customLists"] = customLists
	}

	character["updatedAt"] = updatedAt
	return character, nil
}

func (h apiHandler) countCharacters() (int, error) {
	entries, err := os.ReadDir(filepath.Join("data", "characters"))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	count := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		if entry.Name() == "character-index.json" || entry.Name() == "test-character-index.json" {
			continue
		}
		count++
	}
	return count, nil
}

func defaultCampaignState() map[string]any {
	return map[string]any{
		"schemaVersion": 1,
		"updatedAt":     nil,
		"calendarDate": map[string]any{
			"year":    4520,
			"month":   3,
			"day":     28,
			"special": nil,
		},
		"daysTraveled": 0,
	}
}
