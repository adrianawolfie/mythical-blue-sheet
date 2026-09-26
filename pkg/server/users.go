package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"raperonzolo/character-sheet/pkg/user"
	"strings"
)

type EmailSender interface {
	Send(to, subject, body string) error
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

func PostRegister(repo user.Repository) http.HandlerFunc {
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
		w.WriteHeader(http.StatusNoContent)
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
			if errors.Is(err, user.ErrUserNotFound) {
				http.Error(w, "user not found", http.StatusNotFound)
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
				Secure:   true,
				SameSite: http.SameSiteNoneMode,
			})
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}
}

func PostPasswordResetRequest(repo *user.Repository, sender EmailSender, appBaseURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		var request struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		if account, err := repo.GetByUsername(request.Email); err == nil {
			token, err := repo.CreatePasswordResetToken(r.Context(), account.Email)
			if err != nil {
				if !errors.Is(err, user.ErrPasswordResetRateLimited) {
					log.Printf("create password reset token: %v", err)
				}
			} else {
				link := strings.TrimRight(appBaseURL, "/") + "/reset-password.html?token=" + url.QueryEscape(token)
				body := fmt.Sprintf("A request was made to reset the password for your Mythical Blue account.\n\nSet a new password using this link within 30 minutes:\n%s\n\nIf you did not request this, you can ignore this email.", link)
				if sender == nil {
					log.Printf("send password reset email: email sender is not configured")
				} else if err := sender.Send(account.Email, "Reset your Mythical Blue password", body); err != nil {
					log.Printf("send password reset email: %v", err)
				}
			}
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func PostPasswordResetValidate(repo *user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		var request struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || !repo.PasswordResetTokenValid(request.Token) {
			http.Error(w, "password reset link is invalid or expired", http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func PostPasswordResetConfirm(repo *user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		var request struct {
			Token       string `json:"token"`
			NewPassword string `json:"newPassword"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		if err := repo.ResetPassword(r.Context(), request.Token, request.NewPassword); err != nil {
			if errors.Is(err, user.ErrPasswordInvalid) || errors.Is(err, user.ErrResetTokenInvalid) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
