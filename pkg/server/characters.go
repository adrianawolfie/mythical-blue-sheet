package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"raperonzolo/character-sheet/pkg/character"
	"raperonzolo/character-sheet/pkg/user"
)

func GetCharacters(c character.Repository, users ...user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var opts []character.ListOption
		if r.URL.Query().Get("mine") == "1" || r.URL.Query().Get("owned") == "1" {
			if len(users) == 0 {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			currentUser, ok := currentUserFromCookie(w, r, users[0])
			if !ok {
				return
			}
			if r.URL.Query().Get("owned") == "1" || !currentUser.IsAdmin {
				opts = append(opts, character.WithUserID(currentUser.ID.String()))
			}
		}

		idx, err := c.List(r.Context(), opts...)
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
		if current, err := repo.GetByID(r.Context(), c.ID); err == nil {
			c.UserID = current.UserID
		} else if !errors.Is(err, character.ErrCharacterNotFound) {
			writeError(w, err)
			return
		}

		if err := repo.CreateOrReplace(r.Context(), c); err != nil {
			if errors.Is(err, character.ErrCharacterConflict) {
				w.WriteHeader(http.StatusConflict)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
			writeError(w, err)
			return
		}
		saved, err := repo.GetByID(r.Context(), c.ID)
		if err != nil {
			writeError(w, err)
			return
		}
		if err := json.NewEncoder(w).Encode(saved); err != nil {
			writeError(w, err)
		}
	}
}

func PostCharacterCopy(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		copied, err := repo.Copy(r.Context(), r.PathValue("id"), r.URL.Query().Get("version"))
		if err != nil {
			writeError(w, err)
			return
		}
		if err := json.NewEncoder(w).Encode(copied); err != nil {
			writeError(w, err)
		}
	}
}

func DeleteCharacter(c character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := c.Delete(r.Context(), r.PathValue("id")); err != nil {
			writeError(w, err)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func GetCharacterLive(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		live, err := repo.GetLive(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, err)
			return
		}
		if err := json.NewEncoder(w).Encode(live); err != nil {
			writeError(w, err)
		}
	}
}

func PatchCharacterLive(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var update character.LiveUpdate
		if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
			writeError(w, err)
			return
		}
		id := r.PathValue("id")
		if err := repo.UpdateLive(r.Context(), id, update); err != nil {
			writeError(w, err)
			return
		}
		live, err := repo.GetLive(r.Context(), id)
		if err != nil {
			writeError(w, err)
			return
		}
		if err := json.NewEncoder(w).Encode(live); err != nil {
			writeError(w, err)
		}
	}
}

func GetCharacterHistory(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		history, err := repo.ListHistory(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, err)
			return
		}
		if err := json.NewEncoder(w).Encode(history); err != nil {
			writeError(w, err)
		}
	}
}

func GetCharacterHistoryVersion(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		version, err := repo.GetHistory(r.Context(), r.PathValue("id"), r.PathValue("version"))
		if err != nil {
			writeError(w, err)
			return
		}
		if err := json.NewEncoder(w).Encode(version); err != nil {
			writeError(w, err)
		}
	}
}

func RestoreCharacterHistoryVersion(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := repo.RestoreHistory(r.Context(), r.PathValue("id"), r.PathValue("version")); err != nil {
			writeError(w, err)
			return
		}
		c, err := repo.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, err)
			return
		}
		if err := json.NewEncoder(w).Encode(c); err != nil {
			writeError(w, err)
		}
	}
}
