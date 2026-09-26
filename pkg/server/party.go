package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"raperonzolo/character-sheet/pkg/party"
)

func GetPartyInventory(repo party.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inventory, err := repo.Get(r.Context(), r.URL.Query().Get("campaignId"))
		if err != nil {
			if errors.Is(err, party.ErrInvalidCampaignID) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(inventory); err != nil {
			writeError(w, err)
			return
		}
	}
}

func PostPartyInventory(repo party.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var inventory party.Inventory
		if err := json.NewDecoder(r.Body).Decode(&inventory); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		saved, err := repo.Save(r.Context(), inventory)
		if err != nil {
			if errors.Is(err, party.ErrInventoryConflict) {
				writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		if err := json.NewEncoder(w).Encode(saved); err != nil {
			writeError(w, err)
			return
		}
	}
}
