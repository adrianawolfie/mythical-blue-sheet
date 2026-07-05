package users

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"os"
	"unicode"

	"github.com/google/uuid"
)

type User struct {
	ID       uuid.UUID `json:"id"`
	Email    string    `json:"email"`
	Password string    `json:"password"`
}

func (u User) ValidatePassword(p string) bool {
	salt := os.Getenv("USERS_SECRET")
	given := encryptPassword(p + salt)
	return subtle.ConstantTimeCompare([]byte(given), []byte(u.Password)) == 1
}

func encryptPassword(p string) string {
	sum := sha256.Sum256([]byte(p))
	return hex.EncodeToString(sum[:])
}

func validatePassword(p string) error {
	if len([]rune(p)) < 8 {
		return fmt.Errorf("password must be at least 8 characters long")
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
		return fmt.Errorf("password must contain at least one number")
	}
	if !hasSpecial {
		return fmt.Errorf("password must contain at least one special character")
	}
	if !hasLower || !hasUpper {
		return fmt.Errorf("password must contain at least one uppercase and one lowercase letter")
	}

	return nil
}
