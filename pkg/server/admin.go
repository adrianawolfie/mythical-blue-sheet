package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"raperonzolo/character-sheet/pkg/campaign"
	"raperonzolo/character-sheet/pkg/character"
	"raperonzolo/character-sheet/pkg/user"
)

type adminUsersPageData struct {
	CurrentUser user.AdminView
	Users       []user.AdminView
	UserCount   int
}

type adminCharactersPageData struct {
	CurrentUser user.AdminView
	Characters  []character.AdminView
	Users       []character.AdminUserView
	Count       int
}

type adminAssignCharacterRequest struct {
	UserID string `json:"userId"`
}

type adminUpdateUserRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	IsAdmin  bool   `json:"isAdmin"`
	Enabled  bool   `json:"enabled"`
}

type adminCampaignsPageData struct {
	CurrentUser   user.AdminView
	Campaigns     []campaign.AdminView
	CampaignCount int
}

type adminCampaignPlayerRequest struct {
	UserID string `json:"userId"`
}

type adminCampaignDMRequest struct {
	UserID string `json:"userId"`
}

func GetAdminUsersData(repo user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, ok := requireCookie(w, r)
		if !ok {
			return
		}
		currentUser, users, err := repo.AdminUsersPage(r.Context(), cookie)
		if err != nil {
			handleAdminError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, adminUsersPageData{CurrentUser: currentUser, Users: users, UserCount: len(users)})
	}
}

func PutAdminUser(repo user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, repo); !ok {
			return
		}

		var req adminUpdateUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}
		updated, err := repo.UpdateByID(r.Context(), r.PathValue("id"), user.User{Name: req.Name, Email: req.Email, Password: req.Password, IsAdmin: req.IsAdmin, Enabled: req.Enabled})
		if err != nil {
			if errors.Is(err, user.ErrUserAlreadyExists) || errors.Is(err, user.ErrUserEmailRequired) || errors.Is(err, user.ErrUserIDRequired) || errors.Is(err, user.ErrPasswordInvalid) || errors.Is(err, user.ErrUserNotFound) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, user.AdminView{ID: updated.ID.String(), Name: updated.Name, Email: updated.Email, IsAdmin: updated.IsAdmin, Enabled: updated.Enabled})
	}
}

func GetAdminCharactersData(users user.Repository, characters character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		currentUser, ok := requireAdmin(w, r, users)
		if !ok {
			return
		}
		views, userViews, err := characters.ListAdmin(r.Context(), &users)
		if err != nil {
			renderErrorPage(w, err)
			return
		}
		writeJSON(w, http.StatusOK, adminCharactersPageData{
			CurrentUser: user.AdminView{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
			Characters:  views,
			Users:       userViews,
			Count:       len(views),
		})
	}
}

func PostAdminCharacterAssignment(users user.Repository, characters character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, users); !ok {
			return
		}

		var req adminAssignCharacterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}
		if err := characters.AssignToUser(r.Context(), &users, r.PathValue("id"), req.UserID); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func DeleteAdminCharacter(users user.Repository, characters character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, users); !ok {
			return
		}
		if err := characters.Delete(r.Context(), r.PathValue("id")); err != nil {
			writeError(w, err)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func GetAdminCampaignsData(users user.Repository, campaigns campaign.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		currentUser, ok := requireAdmin(w, r, users)
		if !ok {
			return
		}
		views, err := campaigns.ListAdmin(r.Context(), &users)
		if err != nil {
			renderErrorPage(w, err)
			return
		}
		writeJSON(w, http.StatusOK, adminCampaignsPageData{
			CurrentUser:   user.AdminView{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
			Campaigns:     views,
			CampaignCount: len(views),
		})
	}
}

func PostAdminCampaignPlayer(users user.Repository, campaigns campaign.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, users); !ok {
			return
		}

		var req adminCampaignPlayerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}
		if err := campaigns.AddPlayer(r.Context(), &users, r.PathValue("id"), req.UserID); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func DeleteAdminCampaignPlayer(users user.Repository, campaigns campaign.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, users); !ok {
			return
		}

		if err := campaigns.RemovePlayer(r.Context(), r.PathValue("id"), r.PathValue("userId")); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func PutAdminCampaignDM(users user.Repository, campaigns campaign.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireAdmin(w, r, users); !ok {
			return
		}

		var req adminCampaignDMRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}
		if err := campaigns.AssignDM(r.Context(), &users, r.PathValue("id"), req.UserID); err != nil {
			writeJSON(w, http.StatusBadRequest, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func requireAdmin(w http.ResponseWriter, r *http.Request, repo user.Repository) (user.User, bool) {
	cookie, ok := requireCookie(w, r)
	if !ok {
		return user.User{}, false
	}

	currentUser, err := repo.RequireAdmin(r.Context(), cookie)
	if err != nil {
		handleAdminError(w, r, err)
		return user.User{}, false
	}

	return currentUser, true
}

func requireCookie(w http.ResponseWriter, r *http.Request) (string, bool) {
	cookie, err := r.Cookie("user")
	if err != nil || cookie.Value == "" {
		http.Redirect(w, r, "/login.html", http.StatusSeeOther)
		return "", false
	}
	return cookie.Value, true
}

func currentUserFromCookie(w http.ResponseWriter, r *http.Request, repo user.Repository) (user.User, bool) {
	cookie, err := r.Cookie("user")
	if err != nil || cookie.Value == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return user.User{}, false
	}

	currentUser, err := repo.GetByUsername(cookie.Value)
	if err != nil {
		if err == user.ErrUserNotFound {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return user.User{}, false
		}
		renderErrorPage(w, err)
		return user.User{}, false
	}

	return currentUser, true
}

func handleAdminError(w http.ResponseWriter, r *http.Request, err error) {
	if err == user.ErrForbidden {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if err == user.ErrUserNotFound {
		http.Redirect(w, r, "/login.html", http.StatusSeeOther)
		return
	}
	renderErrorPage(w, err)
}
