package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"time"

	"raperonzolo/character-sheet/pkg/campaign"
	"raperonzolo/character-sheet/pkg/character"
	"raperonzolo/character-sheet/pkg/user"
)

type adminUserView struct {
	ID      string
	Name    string
	Email   string
	IsAdmin bool
}

type adminUsersPageData struct {
	CurrentUser adminUserView
	Users       []adminUserView
	UserCount   int
}

type adminCharactersPageData struct {
	CurrentUser adminUserView
	Characters  []adminCharacterView
	Users       []adminUserView
	Count       int
}

type adminCharacterView struct {
	ID       string
	Name     string
	Class    string
	Level    string
	UserName string
	Assigned bool
}

type adminAssignCharacterRequest struct {
	UserID string `json:"userId"`
}

type adminCampaignsPageData struct {
	CurrentUser   adminUserView
	Campaigns     []adminCampaignView
	CampaignCount int
}

type adminCampaignPlayerView struct {
	ID   string
	Name string
}

type adminCampaignView struct {
	ID             string
	Name           string
	Calendar       string
	DaysTraveled   int
	Players        []adminCampaignPlayerView
	AvailableUsers []adminUserView
	UpdatedAt      string
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
		currentUser, ok := requireAdmin(w, r, repo)
		if !ok {
			return
		}

		users := repo.List(r.Context())
		views := make([]adminUserView, 0, len(users))
		for _, u := range users {
			views = append(views, adminUserView{
				ID:      u.ID.String(),
				Name:    u.Name,
				Email:   u.Email,
				IsAdmin: u.IsAdmin,
			})
		}

		data := adminUsersPageData{
			CurrentUser: adminUserView{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
			Users:       views,
			UserCount:   len(views),
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

		idx, err := characters.List(r.Context())
		if err != nil {
			renderErrorPage(w, err)
			return
		}

		allUsers := users.List(r.Context())
		userViews := make([]adminUserView, 0, len(allUsers))
		userNamesByID := make(map[string]string)
		for _, u := range allUsers {
			name := u.Name
			if name == "" {
				name = u.Email
			}
			userNamesByID[u.ID.String()] = name
			userViews = append(userViews, adminUserView{
				ID:      u.ID.String(),
				Name:    u.Name,
				Email:   u.Email,
				IsAdmin: u.IsAdmin,
			})
		}

		views := make([]adminCharacterView, 0, len(idx))
		for _, item := range idx {
			c, err := characters.GetByID(r.Context(), item.ID)
			if err != nil {
				renderErrorPage(w, err)
				return
			}

			userName := "Unassigned"
			if c.UserID != "" {
				userName = userNamesByID[c.UserID]
				if userName == "" {
					userName = "Unknown user"
				}
			}

			views = append(views, adminCharacterView{
				ID:       c.ID,
				Name:     c.Summary.Name,
				Class:    c.Fields["class"],
				Level:    c.Fields["level"],
				UserName: userName,
				Assigned: c.UserID != "",
			})
		}

		data := adminCharactersPageData{
			CurrentUser: adminUserView{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
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
		if req.UserID == "" {
			http.Error(w, "userId is required", http.StatusBadRequest)
			return
		}

		found := false
		for _, u := range users.List(r.Context()) {
			if u.ID.String() == req.UserID {
				found = true
				break
			}
		}
		if !found {
			http.Error(w, "user not found", http.StatusBadRequest)
			return
		}

		c, err := characters.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			renderErrorPage(w, err)
			return
		}
		c.UserID = req.UserID

		if err := characters.CreateOrReplace(r.Context(), c); err != nil {
			renderErrorPage(w, err)
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

		campaignList, err := campaigns.List(r.Context())
		if err != nil {
			renderErrorPage(w, err)
			return
		}
		allUsers := users.List(r.Context())
		userNamesByID := make(map[string]string)
		for _, u := range allUsers {
			userNamesByID[u.ID.String()] = adminUserName(u)
		}

		views := make([]adminCampaignView, 0, len(campaignList))
		for _, campaign := range campaignList {
			updatedAt := formatAdminTimestamp(campaign.UpdatedAt)
			players := make([]adminCampaignPlayerView, 0, len(campaign.Players))
			playerIDs := make(map[string]bool)
			for _, playerID := range campaign.Players {
				name := userNamesByID[playerID]
				if name == "" {
					name = "Unknown user"
				}
				playerIDs[playerID] = true
				players = append(players, adminCampaignPlayerView{ID: playerID, Name: name})
			}

			availableUsers := make([]adminUserView, 0, len(allUsers))
			for _, u := range allUsers {
				if playerIDs[u.ID.String()] {
					continue
				}
				availableUsers = append(availableUsers, adminUserView{ID: u.ID.String(), Name: u.Name, Email: u.Email, IsAdmin: u.IsAdmin})
			}
			views = append(views, adminCampaignView{
				ID:             campaign.ID,
				Name:           campaign.Name,
				Calendar:       formatAdminCalendarDate(campaign.CalendarDate),
				DaysTraveled:   campaign.DaysTraveled,
				Players:        players,
				AvailableUsers: availableUsers,
				UpdatedAt:      updatedAt,
			})
		}

		data := adminCampaignsPageData{
			CurrentUser:   adminUserView{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
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
		if req.UserID == "" {
			http.Error(w, "userId is required", http.StatusBadRequest)
			return
		}

		found := false
		for _, u := range users.List(r.Context()) {
			if u.ID.String() == req.UserID {
				found = true
				break
			}
		}
		if !found {
			http.Error(w, "user not found", http.StatusBadRequest)
			return
		}

		campaign, err := campaigns.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			renderErrorPage(w, err)
			return
		}
		for _, playerID := range campaign.Players {
			if playerID == req.UserID {
				w.WriteHeader(http.StatusOK)
				return
			}
		}
		campaign.Players = append(campaign.Players, req.UserID)

		if _, err := campaigns.SaveCampaign(r.Context(), campaign); err != nil {
			renderErrorPage(w, err)
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

		campaign, err := campaigns.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			renderErrorPage(w, err)
			return
		}

		playerID := r.PathValue("userId")
		players := make([]string, 0, len(campaign.Players))
		for _, existing := range campaign.Players {
			if existing != playerID {
				players = append(players, existing)
			}
		}
		campaign.Players = players

		if _, err := campaigns.SaveCampaign(r.Context(), campaign); err != nil {
			renderErrorPage(w, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func requireAdmin(w http.ResponseWriter, r *http.Request, repo user.Repository) (user.User, bool) {
	cookie, err := r.Cookie("user")
	if err != nil || cookie.Value == "" {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return user.User{}, false
	}

	currentUser, err := repo.GetByUsername(cookie.Value)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return user.User{}, false
	}
	if !currentUser.IsAdmin {
		http.Error(w, "forbidden", http.StatusForbidden)
		return user.User{}, false
	}

	return currentUser, true
}

func formatAdminCalendarDate(date campaign.CalendarDate) string {
	if date.Special != nil {
		return *date.Special
	}
	if date.Month == nil || date.Day == nil {
		return "Unknown"
	}
	return fmt.Sprintf("Year %d, Month %d, Day %d", date.Year, *date.Month, *date.Day)
}

func adminUserName(u user.User) string {
	if u.Name != "" {
		return u.Name
	}
	return u.Email
}

func formatAdminTimestamp(value *string) string {
	if value == nil || *value == "" {
		return ""
	}
	parsed, err := time.Parse(time.RFC3339Nano, *value)
	if err != nil {
		return *value
	}
	return parsed.UTC().Format("Jan 2, 2006 15:04 UTC")
}
