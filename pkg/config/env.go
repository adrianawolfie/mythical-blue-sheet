package config

import (
	"os"

	"github.com/joho/godotenv"
)

var (
	Storage    = os.Getenv("STORAGE")
	UserSecret = os.Getenv("USER_SECRET")
	S3Key      = os.Getenv("S3_KEY")
	S3Secret   = os.Getenv("S3_SECRET")
)

func Load() {
	_ = godotenv.Load()
	Storage = os.Getenv("STORAGE")
	UserSecret = os.Getenv("USER_SECRET")
	S3Key = os.Getenv("S3_KEY")
	S3Secret = os.Getenv("S3_SECRET")
}
