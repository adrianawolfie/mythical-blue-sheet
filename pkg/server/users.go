package server

import (
	_ "embed"
	"encoding/json"
	"errors"
	"html/template"
	"net/http"
	"raperonzolo/character-sheet/pkg/user"
)

type adminPageData struct {
	CurrentUser adminUserView
	Users       []adminUserView
	UserCount   int
}

type adminUserView struct {
	ID      string
	Email   string
	IsAdmin bool
}

func GetLogin() http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/login.html"))
	return func(w http.ResponseWriter, r *http.Request) {
		if err := tmpl.Execute(w, nil); err != nil {
			renderErrorPage(w, err)
		}
	}
}

func GetRegistration() http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/register.html"))
	return func(w http.ResponseWriter, r *http.Request) {
		if err := tmpl.Execute(w, nil); err != nil {
			renderErrorPage(w, err)
		}
	}
}

func GetAdmin(repo user.Repository) http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/admin.html"))
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("user")
		if err != nil || cookie.Value == "" {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		currentUser, err := repo.GetByUsername(cookie.Value)
		if err != nil {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}
		if !currentUser.IsAdmin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		users := repo.List(r.Context())
		views := make([]adminUserView, 0, len(users))
		for _, u := range users {
			views = append(views, adminUserView{
				ID:      u.ID.String(),
				Email:   u.Email,
				IsAdmin: u.IsAdmin,
			})
		}

		data := adminPageData{
			CurrentUser: adminUserView{ID: currentUser.ID.String(), Email: currentUser.Email, IsAdmin: currentUser.IsAdmin},
			Users:       views,
			UserCount:   len(views),
		}
		if err := tmpl.Execute(w, data); err != nil {
			renderErrorPage(w, err)
		}
	}
}

func PostUser(repo user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var u user.User
		if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
			renderErrorPage(w, err)
			return
		}
		if err := repo.Create(r.Context(), u); err != nil {
			if errors.Is(err, user.ErrPasswordInvalid) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			renderErrorPage(w, err)
			return
		}
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	}
}

func PostLogin(u user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var login struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&login); err != nil {
			renderErrorPage(w, err)
			return
		}
		user, err := u.GetByUsername(login.Username)
		if err != nil {
			renderErrorPage(w, err)
			return
		}
		if user.ValidatePassword(login.Password) {
			http.SetCookie(w, &http.Cookie{
				Name:     "user",
				Value:    user.Email,
				HttpOnly: true,
			})
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}
}
