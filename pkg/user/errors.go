package user

import "errors"

var (
	ErrUserEmailRequired = errors.New("user email required")
	ErrUserAlreadyExists = errors.New("user already exists")
	ErrUserNotFound      = errors.New("user not found")
	ErrUserLimitReached  = errors.New("user limit reached")
	ErrPasswordMismatch  = errors.New("current password is incorrect")
	ErrPasswordInvalid   = errors.New("invalid password")
	ErrForbidden         = errors.New("forbidden")
)
