package server

import (
	"encoding/json"
	"html/template"
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

type adminCampaignsPageData struct {
	CurrentUser   user.AdminView
	Campaigns     []campaign.AdminView
	CampaignCount int
}

type adminCampaignPlayerRequest struct {
	UserID string `json:"userId"`
}

func GetAdmin() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin/users", http.StatusSeeOther)
	}
}

func GetAdminUsers(repo user.Repository) http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/admin/users.html"))
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

		data := adminUsersPageData{
			CurrentUser: currentUser,
			Users:       users,
			UserCount:   len(users),
		}
		if err := tmpl.Execute(w, data); err != nil {
			renderErrorPage(w, err)
		}
	}
}

func GetAdminCharacters(users user.Repository, characters character.Repository) http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/admin/characters.html"))
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

		data := adminCharactersPageData{
			CurrentUser: user.AdminView{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
			Characters:  views,
			Users:       userViews,
			Count:       len(views),
		}
		if err := tmpl.Execute(w, data); err != nil {
			renderErrorPage(w, err)
		}
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

func GetAdminCampaigns(users user.Repository, campaigns campaign.Repository) http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/admin/campaigns.html"))
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

		data := adminCampaignsPageData{
			CurrentUser:   user.AdminView{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
			Campaigns:     views,
			CampaignCount: len(views),
		}
		if err := tmpl.Execute(w, data); err != nil {
			renderErrorPage(w, err)
		}
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
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return "", false
	}
	return cookie.Value, true
}

func handleAdminError(w http.ResponseWriter, r *http.Request, err error) {
	if err == user.ErrForbidden {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if err == user.ErrUserNotFound {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}
	renderErrorPage(w, err)
}
