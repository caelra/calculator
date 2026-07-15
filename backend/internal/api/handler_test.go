package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(NewHandler("http://localhost:5173"))
	t.Cleanup(srv.Close)
	return srv
}

func postCalculate(t *testing.T, srv *httptest.Server, body string) *http.Response {
	t.Helper()
	resp, err := http.Post(srv.URL+"/api/v1/calculate", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/v1/calculate: %v", err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func decodeJSON[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		t.Fatalf("decoding response body: %v", err)
	}
	return v
}

type resultBody struct {
	Result float64 `json:"result"`
}

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func TestCalculateSuccess(t *testing.T) {
	srv := newTestServer(t)
	tests := []struct {
		name string
		body string
		want float64
	}{
		{"add", `{"operation":"add","a":2,"b":3}`, 5},
		{"subtract", `{"operation":"subtract","a":10,"b":4}`, 6},
		{"multiply", `{"operation":"multiply","a":6,"b":7}`, 42},
		{"divide", `{"operation":"divide","a":10,"b":4}`, 2.5},
		{"power", `{"operation":"power","a":2,"b":10}`, 1024},
		{"sqrt without b", `{"operation":"sqrt","a":9}`, 3},
		{"percentage", `{"operation":"percentage","a":25,"b":200}`, 50},
		{"zero operand b", `{"operation":"add","a":5,"b":0}`, 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := postCalculate(t, srv, tt.body)
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, want 200", resp.StatusCode)
			}
			if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
			got := decodeJSON[resultBody](t, resp)
			if got.Result != tt.want {
				t.Errorf("result = %v, want %v", got.Result, tt.want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	srv := newTestServer(t)
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{"malformed json", `{"operation":`, http.StatusBadRequest, "bad_request"},
		{"empty body", ``, http.StatusBadRequest, "bad_request"},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`, http.StatusBadRequest, "bad_request"},
		{"missing operation", `{"a":1,"b":2}`, http.StatusBadRequest, "bad_request"},
		{"missing operand a", `{"operation":"add","b":2}`, http.StatusBadRequest, "bad_request"},
		{"missing operand b for binary op", `{"operation":"add","a":1}`, http.StatusBadRequest, "bad_request"},
		{"non-numeric operand", `{"operation":"add","a":"one","b":2}`, http.StatusBadRequest, "bad_request"},
		{"unknown operation", `{"operation":"modulo","a":1,"b":2}`, http.StatusBadRequest, "unknown_operation"},
		{"division by zero", `{"operation":"divide","a":10,"b":0}`, http.StatusUnprocessableEntity, "division_by_zero"},
		{"negative sqrt", `{"operation":"sqrt","a":-4}`, http.StatusUnprocessableEntity, "negative_sqrt"},
		{"overflow", `{"operation":"power","a":1e308,"b":2}`, http.StatusUnprocessableEntity, "not_finite"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := postCalculate(t, srv, tt.body)
			if resp.StatusCode != tt.wantStatus {
				t.Fatalf("status = %d, want %d", resp.StatusCode, tt.wantStatus)
			}
			got := decodeJSON[errorBody](t, resp)
			if got.Error.Code != tt.wantCode {
				t.Errorf("error code = %q, want %q", got.Error.Code, tt.wantCode)
			}
			if got.Error.Message == "" {
				t.Error("error message is empty")
			}
		})
	}
}

func TestCalculateMethodNotAllowed(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/api/v1/calculate")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", resp.StatusCode)
	}
}

func TestOversizedBodyRejected(t *testing.T) {
	srv := newTestServer(t)
	big := `{"operation":"add","a":1,"b":` + strings.Repeat("9", 2000) + `}`
	resp := postCalculate(t, srv, big)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestListOperations(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/api/v1/operations")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	got := decodeJSON[struct {
		Operations []struct {
			Name  string `json:"name"`
			Arity int    `json:"arity"`
		} `json:"operations"`
	}](t, resp)
	if len(got.Operations) != 7 {
		t.Errorf("got %d operations, want 7", len(got.Operations))
	}
}

func TestHealthz(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestCORSPreflight(t *testing.T) {
	srv := newTestServer(t)
	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/v1/calculate", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("preflight status = %d, want 204", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("Allow-Origin = %q, want http://localhost:5173", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Methods"); !strings.Contains(got, "POST") {
		t.Errorf("Allow-Methods = %q, want to contain POST", got)
	}
}

func TestPanicRecovery(t *testing.T) {
	// Wrap a deliberately panicking handler in the middleware chain used by NewHandler.
	h := withRecovery(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
}
