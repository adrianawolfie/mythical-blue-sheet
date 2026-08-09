package server

import (
	"encoding/json"
	"net/http"
	"raperonzolo/character-sheet/pkg/campaign"
)

func GetCampaign(repo campaign.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		state, err := repo.Get(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(state); err != nil {
			writeError(w, err)
			return
		}
	}
}

func PostCampaign(repo campaign.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var state campaign.Campaign
		if err := json.NewDecoder(r.Body).Decode(&state); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		saved, err := repo.Save(r.Context(), state)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		if err := json.NewEncoder(w).Encode(saved); err != nil {
			writeError(w, err)
			return
		}
	}
}
