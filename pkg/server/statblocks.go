package server

import (
	"encoding/json"
	"net/http"
	"raperonzolo/character-sheet/pkg/statblock"
)

type customStatblocksRequest struct {
	Statblocks []statblock.Statblock `json:"statblocks"`
}

type customStatblocksResponse struct {
	Success    bool                  `json:"success"`
	Statblocks []statblock.Statblock `json:"statblocks"`
}

func GetCustomStatblocks(repo statblock.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		statblocks, err := repo.List(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(statblocks); err != nil {
			writeError(w, err)
			return
		}
	}
}

func PostCustomStatblocks(repo statblock.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req customStatblocksRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		statblocks, err := repo.Save(r.Context(), req.Statblocks)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		if err := json.NewEncoder(w).Encode(customStatblocksResponse{Success: true, Statblocks: statblocks}); err != nil {
			writeError(w, err)
			return
		}
	}
}
