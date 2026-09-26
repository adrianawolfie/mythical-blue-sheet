package config

import (
	"os"

	"github.com/joho/godotenv"
)

var (
	Storage           = os.Getenv("STORAGE")
	UserSecret        = os.Getenv("USER_SECRET")
	S3Key             = os.Getenv("S3_KEY")
	S3Secret          = os.Getenv("S3_SECRET")
	GmailClientID     = os.Getenv("GMAIL_CLIENT_ID")
	GmailClientSecret = os.Getenv("GMAIL_CLIENT_SECRET")
	GmailRefreshToken = os.Getenv("GMAIL_REFRESH_TOKEN")
	GmailSender       = os.Getenv("GMAIL_SENDER")
	AppBaseURL        = os.Getenv("APP_BASE_URL")
)

func Load() {
	_ = godotenv.Load()
	Storage = os.Getenv("STORAGE")
	UserSecret = os.Getenv("USER_SECRET")
	S3Key = os.Getenv("S3_KEY")
	S3Secret = os.Getenv("S3_SECRET")
	GmailClientID = os.Getenv("GMAIL_CLIENT_ID")
	GmailClientSecret = os.Getenv("GMAIL_CLIENT_SECRET")
	GmailRefreshToken = os.Getenv("GMAIL_REFRESH_TOKEN")
	GmailSender = os.Getenv("GMAIL_SENDER")
	AppBaseURL = os.Getenv("APP_BASE_URL")
	if AppBaseURL == "" {
		AppBaseURL = "https://raperonzolo.com"
	}
}
