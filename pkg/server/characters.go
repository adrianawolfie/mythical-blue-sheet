package server

import (
	"encoding/json"
	"net/http"
	"raperonzolo/character-sheet/pkg/character"
	"time"
)

func GetCharacters(c character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idx, err := c.List(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(idx); err != nil {
			writeError(w, err)
			return
		}
	}
}

func GetCharacter(c character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := c.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(c); err != nil {
			writeError(w, err)
			return
		}
	}
}

func PostCharacters(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var c character.Character
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			writeError(w, err)
			return
		}

		c.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

		if err := repo.CreateOrReplace(r.Context(), c); err != nil {
			writeError(w, err)
			return
		}

		resp := map[string]any{"success": true, "updatedAt": c.UpdatedAt}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			writeError(w, err)
			return
		}
	}
}

func DeleteCharacter(c character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := c.Delete(r.Context(), r.PathValue("id")); err != nil {
			writeError(w, err)
			return
		}
		resp := map[string]any{"success": true}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			writeError(w, err)
			return
		}
	}
}

func PostStatus(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := repo.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, err)
			return
		}

		var u character.Update
		if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
			writeError(w, err)
			return
		}

		c.Summary.HpCurrent = u.HpCurrent
		c.Summary.HpMax = u.HpMax
		c.Summary.TempHp = u.TempHp
		c.Summary.ArmorClass = u.ArmorClass
		c.Summary.CurrentConditions = u.CurrentConditions

		c.Fields["hpCurrent"] = u.HpCurrent
		c.Fields["hpMax"] = u.HpMax
		c.Fields["tempHp"] = u.TempHp
		c.Fields["armorClass"] = u.ArmorClass
		c.Fields["currentConditions"] = u.CurrentConditions

		if u.ArmorClassState != nil {
			c.CustomLists["armorClass"] = u.ArmorClassState
		}

		c.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

		if err := repo.CreateOrReplace(r.Context(), c); err != nil {
			writeError(w, err)
			return
		}

		resp := map[string]any{"success": true, "updatedAt": c.UpdatedAt}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			writeError(w, err)
			return
		}
	}
}
