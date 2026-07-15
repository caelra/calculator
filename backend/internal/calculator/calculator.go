// Package calculator implements the arithmetic domain logic. It has no
// knowledge of HTTP; the api package maps its errors onto status codes.
package calculator

import (
	"errors"
	"fmt"
	"math"
)

// Operation identifies an arithmetic operation by its wire name.
type Operation string

const (
	OpAdd        Operation = "add"
	OpSubtract   Operation = "subtract"
	OpMultiply   Operation = "multiply"
	OpDivide     Operation = "divide"
	OpPower      Operation = "power"
	OpSqrt       Operation = "sqrt"
	OpPercentage Operation = "percentage"
)

var (
	ErrUnknownOperation = errors.New("unknown operation")
	ErrDivisionByZero   = errors.New("cannot divide by zero")
	ErrNegativeSqrt     = errors.New("cannot take square root of a negative number")
	// ErrNotFinite covers results outside float64 range (overflow) and
	// undefined results such as (-1)^0.5.
	ErrNotFinite = errors.New("result is not a finite number")
)

type opSpec struct {
	arity int
	apply func(a, b float64) (float64, error)
}

var registry = map[Operation]opSpec{
	OpAdd:      {2, func(a, b float64) (float64, error) { return a + b, nil }},
	OpSubtract: {2, func(a, b float64) (float64, error) { return a - b, nil }},
	OpMultiply: {2, func(a, b float64) (float64, error) { return a * b, nil }},
	OpDivide: {2, func(a, b float64) (float64, error) {
		if b == 0 {
			return 0, ErrDivisionByZero
		}
		return a / b, nil
	}},
	OpPower: {2, func(a, b float64) (float64, error) { return math.Pow(a, b), nil }},
	OpSqrt: {1, func(a, _ float64) (float64, error) {
		if a < 0 {
			return 0, ErrNegativeSqrt
		}
		return math.Sqrt(a), nil
	}},
	// percentage(a, b) = "a percent of b".
	OpPercentage: {2, func(a, b float64) (float64, error) { return a * b / 100, nil }},
}

// Calculate applies op to the operands. Unary operations use only a.
func Calculate(op Operation, a, b float64) (float64, error) {
	spec, ok := registry[op]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}
	result, err := spec.apply(a, b)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(result) || math.IsInf(result, 0) {
		return 0, ErrNotFinite
	}
	return result, nil
}

// Arity reports how many operands op takes, and whether op exists.
func Arity(op Operation) (int, bool) {
	spec, ok := registry[op]
	if !ok {
		return 0, false
	}
	return spec.arity, true
}

// OpInfo describes one supported operation for API discovery.
type OpInfo struct {
	Name  Operation `json:"name"`
	Arity int       `json:"arity"`
}

// Operations lists every supported operation in stable order.
func Operations() []OpInfo {
	ordered := []Operation{OpAdd, OpSubtract, OpMultiply, OpDivide, OpPower, OpSqrt, OpPercentage}
	infos := make([]OpInfo, 0, len(ordered))
	for _, op := range ordered {
		infos = append(infos, OpInfo{Name: op, Arity: registry[op].arity})
	}
	return infos
}
