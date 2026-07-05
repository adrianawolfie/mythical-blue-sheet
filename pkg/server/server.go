package server

import "raperonzolo/character-sheet/pkg/users"

type Server struct {
	users users.Repository
}

type Option func(*Server)

func WithUsers(u users.Repository) Option {
	return func(s *Server) {
		s.users = u
	}
}

func NewServer(options ...Option) Server {
	s := Server{}
	for _, option := range options {
		option(&s)
	}
	return s
}
