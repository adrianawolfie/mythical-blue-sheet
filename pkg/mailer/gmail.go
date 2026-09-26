package mailer

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/quotedprintable"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
)

type Gmail struct {
	ClientID     string
	ClientSecret string
	RefreshToken string
	Sender       string
	client       *http.Client
	tokenURL     string
	sendURL      string
}

func NewGmail(clientID, clientSecret, refreshToken, sender string) *Gmail {
	return &Gmail{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RefreshToken: refreshToken,
		Sender:       sender,
		client:       &http.Client{Timeout: 20 * time.Second},
		tokenURL:     "https://oauth2.googleapis.com/token",
		sendURL:      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
	}
}

func (g *Gmail) Send(to, subject, body string) error {
	if g.ClientID == "" || g.ClientSecret == "" || g.RefreshToken == "" || g.Sender == "" {
		return fmt.Errorf("gmail sender is not configured")
	}
	sender, err := mail.ParseAddress(g.Sender)
	if err != nil {
		return fmt.Errorf("invalid gmail sender address: %w", err)
	}
	recipient, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("invalid recipient address: %w", err)
	}

	accessToken, err := g.accessToken()
	if err != nil {
		return err
	}
	message, err := encodeMessage(sender, recipient, subject, body)
	if err != nil {
		return err
	}
	requestBody, err := json.Marshal(struct {
		Raw string `json:"raw"`
	}{Raw: base64.RawURLEncoding.EncodeToString(message)})
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, g.sendURL, bytes.NewReader(requestBody))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Content-Type", "application/json")
	response, err := g.client.Do(request)
	if err != nil {
		return fmt.Errorf("send gmail message: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("gmail API returned %s: %s", response.Status, strings.TrimSpace(string(payload)))
	}
	return nil
}

func (g *Gmail) accessToken() (string, error) {
	values := url.Values{
		"client_id":     {g.ClientID},
		"client_secret": {g.ClientSecret},
		"refresh_token": {g.RefreshToken},
		"grant_type":    {"refresh_token"},
	}
	request, err := http.NewRequest(http.MethodPost, g.tokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := g.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("refresh gmail access token: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return "", fmt.Errorf("google OAuth returned %s: %s", response.Status, strings.TrimSpace(string(payload)))
	}
	var token struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(response.Body).Decode(&token); err != nil {
		return "", fmt.Errorf("decode google OAuth response: %w", err)
	}
	if token.AccessToken == "" {
		return "", fmt.Errorf("google OAuth response did not include an access token")
	}
	return token.AccessToken, nil
}

func encodeMessage(sender, recipient *mail.Address, subject, body string) ([]byte, error) {
	var encodedBody bytes.Buffer
	writer := quotedprintable.NewWriter(&encodedBody)
	if _, err := writer.Write([]byte(body)); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n%s", sender.String(), recipient.String(), subject, encodedBody.String())), nil
}
