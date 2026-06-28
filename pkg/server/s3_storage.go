package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	spaces "raperonzolo/character-sheet/pkg/s3"
)

const (
	s3CharacterIndexKey = "character/character-index.json"
	s3CampaignStateKey  = "campaign/campaign-state.json"
	s3CustomStatsKey    = "campaign/custom-statblocks.json"
	s3CharacterPrefix   = "character/"
)

func (h apiHandler) handleListCharactersS3(w http.ResponseWriter) {
	entries, err := h.loadCharacterIndex(context.Background())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func (h apiHandler) handleGetCharacterS3(w http.ResponseWriter, characterID string) {
	raw, err := h.spaces.Get(context.Background(), s3CharacterKey(characterID))
	if err != nil {
		if errors.Is(err, spaces.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, apiError{Error: "Character not found."})
			return
		}
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	character, err := readCharacterBytes(raw)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	if character.ID != characterID {
		writeJSON(w, http.StatusConflict, apiError{Error: "Character file mismatch: the filename and internal ID do not match."})
		return
	}

	writeRawJSON(w, http.StatusOK, raw)
}

func (h apiHandler) handleSaveCharacterS3(w http.ResponseWriter, r *http.Request) {
	body, err := readJSONBody(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
		return
	}

	characterID, ok := stringField(body, "id")
	if !ok {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "Character ID is missing."})
		return
	}
	if !safeID.MatchString(characterID) {
		writeJSON(w, http.StatusBadRequest, apiError{Error: "Character ID contains invalid characters."})
		return
	}

	entries, err := h.loadCharacterIndex(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	characterPath := s3CharacterKey(characterID)
	_, inIndex := findCharacterIndex(entries, characterID)
	creatingNewCharacter := !inIndex
	if creatingNewCharacter && len(entries) >= maxCharacterCount {
		writeJSON(w, http.StatusTooManyRequests, apiError{Error: "Character limit reached."})
		return
	}

	_, getErr := h.spaces.Get(r.Context(), characterPath)
	if getErr != nil && !errors.Is(getErr, spaces.ErrNotFound) {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: getErr.Error()})
		return
	}

	if !creatingNewCharacter {
		current, err := h.loadCharacterS3(r.Context(), characterID)
		if err != nil {
			if errors.Is(err, spaces.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, apiError{Error: "Character not found."})
				return
			}
			writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
			return
		}

		expectedUpdatedAt := stringValue(body, "expectedUpdatedAt")
		if expectedUpdatedAt == "" {
			writeJSON(w, http.StatusConflict, apiError{Error: "Save blocked: this character already exists, but the browser does not have a valid edit version. Return to the index, reopen the character, and try again."})
			return
		}
		if current.UpdatedAt != "" && expectedUpdatedAt != current.UpdatedAt {
			writeJSON(w, http.StatusConflict, apiError{Error: "Save blocked: someone else updated this character after you opened it. Copy any important changes, reopen the character from the index, and try again."})
			return
		}
	}

	delete(body, "expectedUpdatedAt")
	body["updatedAt"] = currentTimestamp()
	characterBytes, err := marshalLimitedJSON(body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	if err := h.spaces.Put(r.Context(), characterPath, characterBytes); err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	character, err := readCharacterBytes(characterBytes)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	entries = upsertCharacterIndex(entries, character)
	if err := h.saveCharacterIndex(r.Context(), entries); err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true, "updatedAt": body["updatedAt"]})
}

func (h apiHandler) handleSaveCharacterStatusS3(w http.ResponseWriter, r *http.Request, characterID string) {
	body, err := readJSONBody(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
		return
	}

	character, err := h.loadCharacterS3(r.Context(), characterID)
	if err != nil {
		if errors.Is(err, spaces.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, apiError{Error: "Character not found."})
			return
		}
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	character.Summary.HpCurrent = stringValue(body, "hpCurrent")
	character.Summary.HpMax = stringValue(body, "hpMax")
	character.Summary.TempHp = stringValue(body, "tempHp")
	character.Summary.ArmorClass = stringValue(body, "armorClass")
	character.Summary.CurrentConditions = stringValue(body, "currentConditions")
	fields := ensureMap(character.Fields)
	fields["hpCurrent"] = stringValue(body, "hpCurrent")
	fields["hpMax"] = stringValue(body, "hpMax")
	fields["tempHp"] = stringValue(body, "tempHp")
	fields["armorClass"] = stringValue(body, "armorClass")
	fields["currentConditions"] = stringValue(body, "currentConditions")
	character.Fields = fields

	if acState, ok := body["armorClassState"].(map[string]any); ok {
		customLists := ensureMap(character.CustomLists)
		customLists["armorClass"] = acState
		character.CustomLists = customLists
	}

	character.UpdatedAt = currentTimestamp()
	characterBytes, err := marshalLimitedJSON(character)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	if err := h.spaces.Put(r.Context(), s3CharacterKey(characterID), characterBytes); err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	entries, err := h.loadCharacterIndex(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	entries = upsertCharacterIndex(entries, character)
	if err := h.saveCharacterIndex(r.Context(), entries); err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true, "updatedAt": character.UpdatedAt})
}

func (h apiHandler) handleDeleteCharacterS3(w http.ResponseWriter, r *http.Request, characterID string) {
	body, err := readJSONBody(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
		return
	}

	character, err := h.loadCharacterS3(r.Context(), characterID)
	if err != nil {
		if errors.Is(err, spaces.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, apiError{Error: "Character file was not found."})
			return
		}
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	if character.ID != characterID {
		writeJSON(w, http.StatusConflict, apiError{Error: "Delete blocked: the filename and internal character ID do not match."})
		return
	}

	if expectedUpdatedAt, _ := body["expectedUpdatedAt"].(string); expectedUpdatedAt != "" && character.UpdatedAt != "" && expectedUpdatedAt != character.UpdatedAt {
		writeJSON(w, http.StatusConflict, apiError{Error: "Delete blocked: someone else updated this character after you opened it. Return to the index and reopen the character before deleting it."})
		return
	}

	if err := h.spaces.Delete(r.Context(), s3CharacterKey(characterID)); err != nil && !errors.Is(err, spaces.ErrNotFound) {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	entries, err := h.loadCharacterIndex(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}
	entries = removeCharacterIndex(entries, characterID)
	if err := h.saveCharacterIndex(r.Context(), entries); err != nil {
		writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (h apiHandler) handleCampaignStateS3(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		raw, err := h.spaces.Get(r.Context(), s3CampaignStateKey)
		if err != nil {
			if errors.Is(err, spaces.ErrNotFound) {
				writeJSON(w, http.StatusOK, defaultCampaignState())
				return
			}
			writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
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
			writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
			return
		}

		date, _ := body["calendarDate"].(map[string]any)
		year := intValue(date, "year")
		if year < 1 {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "Campaign year is invalid."})
			return
		}

		special := stringValue(date, "special")
		if special != "" && special != "intercalis" && special != "aenaris" {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "Campaign special day is invalid."})
			return
		}

		month := intValue(date, "month")
		day := intValue(date, "day")
		if special == "" && (month < 1 || month > 13 || day < 1 || day > 28) {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "Campaign calendar date is invalid."})
			return
		}

		nextState := map[string]any{
			"schemaVersion": 1,
			"updatedAt":     currentTimestamp(),
			"calendarDate": map[string]any{
				"year":    year,
				"month":   nilIfSpecial(special, month),
				"day":     nilIfSpecial(special, day),
				"special": nilIfEmpty(special),
			},
			"daysTraveled": maxInt(0, intValue(body, "daysTraveled")),
		}

		data, err := marshalLimitedJSON(nextState)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
			return
		}
		if err := h.spaces.Put(r.Context(), s3CampaignStateKey, data); err != nil {
			writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, nextState)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "Method not allowed."})
	}
}

func (h apiHandler) handleCustomStatblocksS3(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		raw, err := h.spaces.Get(r.Context(), s3CustomStatsKey)
		if err != nil {
			if errors.Is(err, spaces.ErrNotFound) {
				writeJSON(w, http.StatusOK, map[string]any{"statblocks": []any{}})
				return
			}
			writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
			return
		}
		if !json.Valid(raw) {
			writeJSON(w, http.StatusOK, map[string]any{"statblocks": []any{}})
			return
		}
		writeRawJSON(w, http.StatusOK, raw)
	case http.MethodPost:
		body, err := readJSONBody(w, r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, apiError{Error: err.Error()})
			return
		}

		incoming, ok := body["statblocks"].([]any)
		if !ok {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "Custom statblocks payload must be a list."})
			return
		}

		if len(incoming) > 250 {
			writeJSON(w, http.StatusBadRequest, apiError{Error: "Too many custom statblocks."})
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

		data, err := marshalLimitedJSON(normalized)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
			return
		}
		if err := h.spaces.Put(r.Context(), s3CustomStatsKey, data); err != nil {
			writeJSON(w, http.StatusInternalServerError, apiError{Error: err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"success": true, "statblocks": normalized})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, apiError{Error: "Method not allowed."})
	}
}

func (h apiHandler) loadCharacterIndex(ctx context.Context) ([]characterIndexEntry, error) {
	raw, err := h.spaces.Get(ctx, s3CharacterIndexKey)
	if err != nil {
		if errors.Is(err, spaces.ErrNotFound) {
			return []characterIndexEntry{}, nil
		}
		return nil, err
	}

	var entries []characterIndexEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func (h apiHandler) saveCharacterIndex(ctx context.Context, entries []characterIndexEntry) error {
	data, err := marshalLimitedJSON(entries)
	if err != nil {
		return err
	}
	return h.spaces.Put(ctx, s3CharacterIndexKey, data)
}

func (h apiHandler) loadCharacterS3(ctx context.Context, characterID string) (characterFile, error) {
	raw, err := h.spaces.Get(ctx, s3CharacterKey(characterID))
	if err != nil {
		if errors.Is(err, spaces.ErrNotFound) {
			return characterFile{}, err
		}
		return characterFile{}, err
	}
	return readCharacterBytes(raw)
}

func s3CharacterKey(characterID string) string {
	return s3CharacterPrefix + characterID + ".json"
}

func upsertCharacterIndex(entries []characterIndexEntry, character characterFile) []characterIndexEntry {
	entry := characterIndexEntry{
		ID:                character.ID,
		Name:              fallback(character.Summary.Name, "Unnamed Character"),
		ArmorClass:        character.Summary.ArmorClass,
		HpCurrent:         character.Summary.HpCurrent,
		HpMax:             character.Summary.HpMax,
		PassivePerception: character.Summary.PassivePerception,
		CurrentConditions: character.Summary.CurrentConditions,
		File:              s3CharacterKey(character.ID),
		UpdatedAt:         character.UpdatedAt,
	}

	for i := range entries {
		if entries[i].ID == character.ID {
			entries[i] = entry
			return sortCharacterEntries(entries)
		}
	}

	entries = append(entries, entry)
	return sortCharacterEntries(entries)
}

func removeCharacterIndex(entries []characterIndexEntry, characterID string) []characterIndexEntry {
	filtered := entries[:0]
	for _, entry := range entries {
		if entry.ID != characterID {
			filtered = append(filtered, entry)
		}
	}
	return sortCharacterEntries(filtered)
}

func findCharacterIndex(entries []characterIndexEntry, characterID string) (characterIndexEntry, bool) {
	for _, entry := range entries {
		if entry.ID == characterID {
			return entry, true
		}
	}
	return characterIndexEntry{}, false
}

func sortCharacterEntries(entries []characterIndexEntry) []characterIndexEntry {
	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	return entries
}

func marshalLimitedJSON(value any) ([]byte, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxJSONBytes {
		return nil, fmt.Errorf("JSON payload exceeds 5MB limit.")
	}
	data = append(data, '\n')
	return data, nil
}

func currentTimestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
