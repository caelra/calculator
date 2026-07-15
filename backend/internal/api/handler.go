// Package api exposes the calculator domain over HTTP/JSON.
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/sudtho/fullstack-calculator/backend/internal/calculator"
)

// maxBodyBytes caps request bodies; calculate requests are tiny.
const maxBodyBytes = 1 << 10

// Config wires the HTTP handler.
type Config struct {
	// CORSOrigin is the single origin allowed for cross-origin browser
	// calls (dev server); same-origin deployments (nginx proxy) never
	// send preflights.
	CORSOrigin string
	// RateLimitRPS/RateLimitBurst bound each client IP's request budget.
	// RateLimitRPS <= 0 disables limiting.
	RateLimitRPS   float64
	RateLimitBurst int
}

// NewHandler returns the fully wired HTTP handler.
func NewHandler(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", handleCalculate)
	mux.HandleFunc("GET /api/v1/operations", handleListOperations)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	var rl *rateLimiter
	if cfg.RateLimitRPS > 0 {
		rl = newRateLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst)
	}
	return withRecovery(withLogging(withRateLimit(rl, withCORS(cfg.CORSOrigin, mux))))
}

type calculateRequest struct {
	Operation calculator.Operation `json:"operation"`
	// Pointers distinguish "missing" from a legitimate 0.
	A *float64 `json:"a"`
	B *float64 `json:"b"`
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var req calculateRequest
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "request body must be valid JSON: "+err.Error())
		return
	}
	if req.Operation == "" {
		writeError(w, http.StatusBadRequest, "bad_request", `"operation" is required`)
		return
	}
	arity, known := calculator.Arity(req.Operation)
	if !known {
		writeError(w, http.StatusBadRequest, "unknown_operation", `unsupported operation: "`+string(req.Operation)+`"`)
		return
	}
	if req.A == nil {
		writeError(w, http.StatusBadRequest, "bad_request", `operand "a" is required`)
		return
	}
	var b float64
	if arity == 2 {
		if req.B == nil {
			writeError(w, http.StatusBadRequest, "bad_request", `operand "b" is required for operation "`+string(req.Operation)+`"`)
			return
		}
		b = *req.B
	}

	result, err := calculator.Calculate(req.Operation, *req.A, b)
	if err != nil {
		writeDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]float64{"result": result})
}

func handleListOperations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"operations": calculator.Operations()})
}

// writeDomainError maps calculator sentinel errors onto HTTP status + code.
func writeDomainError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, calculator.ErrDivisionByZero):
		writeError(w, http.StatusUnprocessableEntity, "division_by_zero", err.Error())
	case errors.Is(err, calculator.ErrNegativeSqrt):
		writeError(w, http.StatusUnprocessableEntity, "negative_sqrt", err.Error())
	case errors.Is(err, calculator.ErrNotFinite):
		writeError(w, http.StatusUnprocessableEntity, "not_finite", err.Error())
	case errors.Is(err, calculator.ErrUnknownOperation):
		writeError(w, http.StatusBadRequest, "unknown_operation", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
	}
}

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: errorDetail{Code: code, Message: message}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Encoding a map/struct of primitives cannot fail; ignore the error.
	_ = json.NewEncoder(w).Encode(v)
}
