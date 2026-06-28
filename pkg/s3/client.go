package s3

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"
)

const (
	DefaultEndpoint = "https://raperonzolo.ams3.digitaloceanspaces.com"
	defaultRegion   = "ams3"
	service         = "s3"
)

var ErrNotFound = fmt.Errorf("s3 object not found")

type Client struct {
	endpoint   string
	accessKey  string
	secretKey  string
	httpClient *http.Client
}

func NewFromEnv() (*Client, error) {
	accessKey := strings.TrimSpace(os.Getenv("S3_KEY"))
	secretKey := strings.TrimSpace(os.Getenv("S3_SECRET"))
	if accessKey == "" || secretKey == "" {
		return nil, fmt.Errorf("S3_KEY and S3_SECRET are required for s3 storage mode")
	}

	return &Client{
		endpoint:   DefaultEndpoint,
		accessKey:  accessKey,
		secretKey:  secretKey,
		httpClient: http.DefaultClient,
	}, nil
}

func (c *Client) Get(ctx context.Context, key string) ([]byte, error) {
	response, err := c.do(ctx, http.MethodGet, key, nil)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, responseError(response)
	}

	return io.ReadAll(response.Body)
}

func (c *Client) Put(ctx context.Context, key string, body []byte) error {
	response, err := c.do(ctx, http.MethodPut, key, body)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return responseError(response)
	}
	return nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	response, err := c.do(ctx, http.MethodDelete, key, nil)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return responseError(response)
	}
	return nil
}

func (c *Client) do(ctx context.Context, method, key string, body []byte) (*http.Response, error) {
	endpoint, err := url.Parse(c.endpoint)
	if err != nil {
		return nil, err
	}
	endpoint.Path = "/" + strings.TrimLeft(key, "/")

	bodyHash := sha256Hex(body)
	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")

	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Host = endpoint.Host
	req.Header.Set("X-Amz-Content-Sha256", bodyHash)
	req.Header.Set("X-Amz-Date", amzDate)
	if method == http.MethodPut {
		req.Header.Set("Content-Type", "application/json")
	}

	headers := map[string]string{
		"host":                 endpoint.Host,
		"x-amz-content-sha256": bodyHash,
		"x-amz-date":           amzDate,
	}
	if method == http.MethodPut {
		headers["content-type"] = req.Header.Get("Content-Type")
	}
	canonicalHeadersString, signedHeaders := canonicalHeaders(headers)
	canonicalRequest := strings.Join([]string{
		method,
		endpoint.EscapedPath(),
		"",
		canonicalHeadersString,
		signedHeaders,
		bodyHash,
	}, "\n")

	credentialScope := strings.Join([]string{dateStamp, defaultRegion, service, "aws4_request"}, "/")
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := deriveSigningKey(c.secretKey, dateStamp, defaultRegion, service)
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))
	req.Header.Set("Authorization", fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		c.accessKey,
		credentialScope,
		signedHeaders,
		signature,
	))

	return c.httpClient.Do(req)
}

func canonicalHeaders(headers map[string]string) (string, string) {
	keys := make([]string, 0, len(headers))
	for key, value := range headers {
		if strings.TrimSpace(value) == "" {
			continue
		}
		keys = append(keys, strings.ToLower(key))
	}
	sort.Strings(keys)

	var canonical strings.Builder
	for _, key := range keys {
		canonical.WriteString(key)
		canonical.WriteString(":")
		canonical.WriteString(strings.TrimSpace(headers[key]))
		canonical.WriteString("\n")
	}

	return canonical.String(), strings.Join(keys, ";")
}

func deriveSigningKey(secretKey, dateStamp, region, serviceName string) []byte {
	dateKey := hmacSHA256([]byte("AWS4"+secretKey), dateStamp)
	dateRegionKey := hmacSHA256(dateKey, region)
	dateRegionServiceKey := hmacSHA256(dateRegionKey, serviceName)
	return hmacSHA256(dateRegionServiceKey, "aws4_request")
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func responseError(response *http.Response) error {
	body, _ := io.ReadAll(response.Body)
	return fmt.Errorf("s3 %s failed with %d: %s", response.Request.Method, response.StatusCode, strings.TrimSpace(string(body)))
}
