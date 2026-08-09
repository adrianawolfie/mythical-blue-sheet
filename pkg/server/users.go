package server

import (
	_ "embed"
	"encoding/json"
	"errors"
	"html/template"
	"net/http"
	"raperonzolo/character-sheet/pkg/user"
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
		user, ok, err := u.Authenticate(r.Context(), login.Username, login.Password)
		if err != nil {
			renderErrorPage(w, err)
			return
		}
		if ok {
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
