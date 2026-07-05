package server

import (
	_ "embed"
	"encoding/json"
	"html/template"
	"net/http"
	"raperonzolo/character-sheet/pkg/users"
)

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

func PostUser(u users.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var user users.User
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			renderErrorPage(w, err)
			return
		}
		if err := u.Create(user); err != nil {
			renderErrorPage(w, err)
			return
		}
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	}
}

func PostLogin(u users.Repository) http.HandlerFunc {
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
		http.Redirect(w, r, "/register", http.StatusSeeOther)
	}
}
