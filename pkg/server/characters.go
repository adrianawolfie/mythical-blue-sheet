package server

import (
	"encoding/json"
	"html/template"
	"net/http"
	"raperonzolo/character-sheet/pkg/character"
	"raperonzolo/character-sheet/pkg/user"
)

type characterDetailPageData struct {
	CharacterJSON template.JS
}

type characterListPageData struct {
	Characters []character.ListView
}

func GetCharacters(c character.Repository, users ...user.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var opts []character.ListOption
		if r.URL.Query().Get("mine") == "1" || r.URL.Query().Get("owned") == "1" {
			if len(users) == 0 {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			currentUser, ok := currentUserFromCookie(w, r, users[0])
			if !ok {
				return
			}
			if r.URL.Query().Get("owned") == "1" || !currentUser.IsAdmin {
				opts = append(opts, character.WithUserID(currentUser.ID.String()))
			}
		}

		idx, err := c.List(r.Context(), opts...)
		if err != nil {
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(idx); err != nil {
			writeError(w, err)
			return
		}
	}
}

func GetCharacter(c character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := c.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, err)
			return
		}

		if err := json.NewEncoder(w).Encode(c); err != nil {
			writeError(w, err)
			return
		}
	}
}

func GetCharacterListPage(users user.Repository, repo character.Repository) http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/characters/list.html"))

	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("user")
		if err != nil || cookie.Value == "" {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		characters, err := repo.ListForUser(r.Context(), &users, cookie.Value)
		if err != nil {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		if err := tmpl.Execute(w, characterListPageData{Characters: characters}); err != nil {
			renderErrorPage(w, err)
		}
	}
}

func GetCharacterDetail(repo character.Repository) http.HandlerFunc {
	tmpl := template.Must(template.ParseFiles("public/characters/detail.html"))

	return func(w http.ResponseWriter, r *http.Request) {
		c, err := repo.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			renderErrorPage(w, err)
			return
		}

		data, err := json.Marshal(c)
		if err != nil {
			renderErrorPage(w, err)
			return
		}

		if err := tmpl.Execute(w, characterDetailPageData{CharacterJSON: template.JS(data)}); err != nil {
			renderErrorPage(w, err)
		}
	}
}

func PostCharacters(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var c character.Character
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			writeError(w, err)
			return
		}

		if err := repo.CreateOrReplace(r.Context(), c); err != nil {
			writeError(w, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func DeleteCharacter(c character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := c.Delete(r.Context(), r.PathValue("id")); err != nil {
			writeError(w, err)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func PostStatus(repo character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var u character.Update
		if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
			writeError(w, err)
			return
		}

		if err := repo.UpdateStatus(r.Context(), r.PathValue("id"), u); err != nil {
			writeError(w, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}
