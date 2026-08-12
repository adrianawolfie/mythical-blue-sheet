package server

import (
	"encoding/json"
	"net/http"
	"raperonzolo/character-sheet/pkg/campaign"
	"raperonzolo/character-sheet/pkg/user"
)

func GetCampaigns(users user.Repository, repo campaign.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var opts []campaign.ListOption
		if r.URL.Query().Get("mine") == "1" {
			currentUser, ok := currentUserFromCookie(w, r, users)
			if !ok {
				return
			}
			if !currentUser.IsAdmin {
				opts = append(opts, campaign.WithPlayerID(currentUser.ID.String()))
			}
		}

		campaigns, err := repo.List(r.Context(), opts...)
		if err != nil {
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(campaigns); err != nil {
			writeError(w, err)
			return
		}
	}
}

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
