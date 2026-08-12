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

func GetCurrentUser(repo user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		currentUser, ok := currentUserFromCookie(w, r, repo)
		if !ok {
			return
		}

		if err := json.NewEncoder(w).Encode(struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Email string `json:"email"`
		}{ID: currentUser.ID.String(), Name: currentUser.Name, Email: currentUser.Email}); err != nil {
			writeError(w, err)
			return
		}
	}
}

func PutCurrentUser(repo user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		currentUser, ok := currentUserFromCookie(w, r, repo)
		if !ok {
			return
		}

		var request struct {
			Name            string `json:"name"`
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeError(w, err)
			return
		}
		updated, err := repo.UpdateProfile(r.Context(), currentUser.Email, request.Name, request.CurrentPassword, request.NewPassword)
		if err != nil {
			if errors.Is(err, user.ErrPasswordInvalid) || errors.Is(err, user.ErrPasswordMismatch) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Email string `json:"email"`
		}{ID: updated.ID.String(), Name: updated.Name, Email: updated.Email})
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
		currentUser, ok, err := u.Authenticate(r.Context(), login.Username, login.Password)
		if err != nil {
			if errors.Is(err, user.ErrUserDisabled) {
				http.Error(w, "disabled", http.StatusForbidden)
				return
			}
			renderErrorPage(w, err)
			return
		}
		if ok {
			http.SetCookie(w, &http.Cookie{
				Name:     "user",
				Value:    currentUser.Email,
				HttpOnly: true,
			})
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}
}
