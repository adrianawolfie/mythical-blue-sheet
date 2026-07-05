package users

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"os"
)

type User struct {
	Email    string `json:"email"`
	Password string `json:"password"`
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
