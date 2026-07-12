package user

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"raperonzolo/character-sheet/pkg/config"
	"unicode"

	"github.com/google/uuid"
)

type User struct {
	ID       uuid.UUID `json:"id"`
	Email    string    `json:"email"`
	Password string    `json:"password"`
	IsAdmin  bool      `json:"isAdmin"`
}

func (u User) ValidatePassword(p string) bool {
	given := encryptPassword(p + config.UserSecret)
	return subtle.ConstantTimeCompare([]byte(given), []byte(u.Password)) == 1
}

func encryptPassword(p string) string {
	sum := sha256.Sum256([]byte(p))
	return hex.EncodeToString(sum[:])
}

func validatePassword(p string) error {
	if len([]rune(p)) < 8 {
		return fmt.Errorf("%w, password must be at least 8 characters long", ErrPasswordInvalid)
	}

	var (
		hasLower   bool
		hasUpper   bool
		hasNumber  bool
		hasSpecial bool
	)

	for _, r := range p {
		switch {
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsDigit(r):
			hasNumber = true
		default:
			hasSpecial = true
		}
	}

	if !hasNumber {
		return fmt.Errorf("%w, password must contain at least one number", ErrPasswordInvalid)
	}
	if !hasSpecial {
		return fmt.Errorf("%w, password must contain at least one special character", ErrPasswordInvalid)
	}
	if !hasLower || !hasUpper {
		return fmt.Errorf("%w, password must contain at least one uppercase and one lowercase letter", ErrPasswordInvalid)
	}

	return nil
}
