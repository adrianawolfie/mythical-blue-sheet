package server

import (
	"encoding/json"
	"html/template"
	"net/http"
	"raperonzolo/character-sheet/pkg/character"
	"raperonzolo/character-sheet/pkg/user"
	"time"
)

type characterDetailPageData struct {
	CharacterJSON template.JS
}

type characterListPageData struct {
	Characters []characterListView
}

type characterListView struct {
	ID       string
	Name     string
	Class    string
	Species  string
	Subclass string
	Level    string
}

func GetCharacters(c character.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idx, err := c.List(r.Context())
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

		currentUser, err := users.GetByUsername(cookie.Value)
		if err != nil {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		idx, err := repo.List(r.Context())
		if err != nil {
			renderErrorPage(w, err)
			return
		}

		filtered := make([]characterListView, 0, len(idx))
		for _, item := range idx {
			c, err := repo.GetByID(r.Context(), item.ID)
			if err != nil {
				renderErrorPage(w, err)
				return
			}
			if c.UserID == currentUser.ID.String() {
				filtered = append(filtered, characterListView{
					ID:       item.ID,
					Name:     item.Name,
					Class:    c.Fields["class"],
					Species:  c.Fields["speciesRace"],
					Subclass: c.Fields["subclass"],
					Level:    c.Fields["level"],
				})
			}
		}

		if err := tmpl.Execute(w, characterListPageData{Characters: filtered}); err != nil {
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

		c.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

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
		c, err := repo.GetByID(r.Context(), r.PathValue("id"))
		if err != nil {
			writeError(w, err)
			return
		}

		var u character.Update
		if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
			writeError(w, err)
			return
		}

		c.Summary.HpCurrent = u.HpCurrent
		c.Summary.HpMax = u.HpMax
		c.Summary.TempHp = u.TempHp
		c.Summary.ArmorClass = u.ArmorClass
		c.Summary.CurrentConditions = u.CurrentConditions

		if c.Fields == nil {
			c.Fields = character.Fields{}
		}
		c.Fields["hpCurrent"] = u.HpCurrent
		c.Fields["hpMax"] = u.HpMax
		c.Fields["tempHp"] = u.TempHp
		c.Fields["armorClass"] = u.ArmorClass
		c.Fields["currentConditions"] = u.CurrentConditions

		if u.ArmorClassState != nil {
			c.CustomLists.ArmorClass = *u.ArmorClassState
		}

		c.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

		if err := repo.CreateOrReplace(r.Context(), c); err != nil {
			writeError(w, err)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}
