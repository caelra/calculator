package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func rateLimitedServer(t *testing.T, rps float64, burst int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(NewHandler(Config{
		CORSOrigin:     "http://localhost:5173",
		RateLimitRPS:   rps,
		RateLimitBurst: burst,
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestRateLimitExceededReturns429(t *testing.T) {
	srv := rateLimitedServer(t, 1, 2)
	statuses := make([]int, 0, 3)
	for range 3 {
		resp := postCalculate(t, srv, `{"operation":"add","a":1,"b":2}`)
		statuses = append(statuses, resp.StatusCode)
		if resp.StatusCode == http.StatusTooManyRequests {
			got := decodeJSON[errorBody](t, resp)
			if got.Error.Code != "rate_limited" {
				t.Errorf("error code = %q, want rate_limited", got.Error.Code)
			}
		}
	}
	want := []int{http.StatusOK, http.StatusOK, http.StatusTooManyRequests}
	if fmt.Sprint(statuses) != fmt.Sprint(want) {
		t.Errorf("statuses = %v, want %v", statuses, want)
	}
}

func TestRateLimitDisabledByDefaultConfig(t *testing.T) {
	srv := rateLimitedServer(t, 0, 0) // zero rps disables limiting
	for range 10 {
		resp := postCalculate(t, srv, `{"operation":"add","a":1,"b":2}`)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200 with limiter disabled", resp.StatusCode)
		}
	}
}

func TestRateLimitIsPerClientIP(t *testing.T) {
	rl := newRateLimiter(1, 1)
	h := withRateLimit(rl, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	send := func(remoteAddr string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", strings.NewReader("{}"))
		req.RemoteAddr = remoteAddr
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if got := send("10.0.0.1:1000"); got != http.StatusOK {
		t.Fatalf("first request from A = %d, want 200", got)
	}
	if got := send("10.0.0.1:1001"); got != http.StatusTooManyRequests {
		t.Errorf("second request from A = %d, want 429", got)
	}
	if got := send("10.0.0.2:1000"); got != http.StatusOK {
		t.Errorf("first request from B = %d, want 200 (independent bucket)", got)
	}
}

func TestRateLimitExemptsHealthz(t *testing.T) {
	srv := rateLimitedServer(t, 1, 1)
	for range 5 {
		resp, err := http.Get(srv.URL + "/healthz")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("healthz status = %d, want 200 (exempt from limiting)", resp.StatusCode)
		}
	}
}

func TestRateLimiterConcurrentAccess(t *testing.T) {
	rl := newRateLimiter(1000, 1000)
	var wg sync.WaitGroup
	for i := range 50 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for range 20 {
				rl.allow(fmt.Sprintf("10.0.0.%d", n%5))
			}
		}(i)
	}
	wg.Wait() // must be race-free under go test -race
}
