package calculator

import (
	"errors"
	"math"
	"testing"
)

const epsilon = 1e-9

func TestCalculate(t *testing.T) {
	tests := []struct {
		name string
		op   Operation
		a, b float64
		want float64
	}{
		{"adds two numbers", OpAdd, 2, 3, 5},
		{"adds negative numbers", OpAdd, -2, -3, -5},
		{"adds fractions precisely", OpAdd, 0.1, 0.2, 0.3},
		{"subtracts two numbers", OpSubtract, 10, 4, 6},
		{"subtracts into negative", OpSubtract, 4, 10, -6},
		{"multiplies two numbers", OpMultiply, 6, 7, 42},
		{"multiplies by zero", OpMultiply, 6, 0, 0},
		{"divides two numbers", OpDivide, 10, 4, 2.5},
		{"divides negative numerator", OpDivide, -9, 3, -3},
		{"raises to a power", OpPower, 2, 10, 1024},
		{"raises to a negative power", OpPower, 2, -2, 0.25},
		{"square root", OpSqrt, 9, 0, 3},
		{"square root of zero", OpSqrt, 0, 0, 0},
		{"percentage: a percent of b", OpPercentage, 25, 200, 50},
		{"percentage of zero", OpPercentage, 25, 0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if err != nil {
				t.Fatalf("Calculate(%q, %v, %v) returned error: %v", tt.op, tt.a, tt.b, err)
			}
			if math.Abs(got-tt.want) > epsilon {
				t.Errorf("Calculate(%q, %v, %v) = %v, want %v", tt.op, tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name    string
		op      Operation
		a, b    float64
		wantErr error
	}{
		{"division by zero", OpDivide, 10, 0, ErrDivisionByZero},
		{"square root of negative", OpSqrt, -4, 0, ErrNegativeSqrt},
		{"unknown operation", Operation("modulo"), 10, 3, ErrUnknownOperation},
		{"empty operation", Operation(""), 1, 2, ErrUnknownOperation},
		{"overflow to infinity", OpPower, 1e308, 2, ErrNotFinite},
		{"nan result", OpPower, -1, 0.5, ErrNotFinite},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Calculate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Errorf("Calculate(%q, %v, %v) error = %v, want %v", tt.op, tt.a, tt.b, err, tt.wantErr)
			}
		})
	}
}

func TestArity(t *testing.T) {
	tests := []struct {
		op   Operation
		want int
		ok   bool
	}{
		{OpAdd, 2, true},
		{OpSubtract, 2, true},
		{OpMultiply, 2, true},
		{OpDivide, 2, true},
		{OpPower, 2, true},
		{OpPercentage, 2, true},
		{OpSqrt, 1, true},
		{Operation("modulo"), 0, false},
	}
	for _, tt := range tests {
		t.Run(string(tt.op), func(t *testing.T) {
			got, ok := Arity(tt.op)
			if got != tt.want || ok != tt.ok {
				t.Errorf("Arity(%q) = (%d, %v), want (%d, %v)", tt.op, got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestOperations(t *testing.T) {
	ops := Operations()
	if len(ops) != 7 {
		t.Fatalf("Operations() returned %d ops, want 7", len(ops))
	}
	seen := map[Operation]bool{}
	for _, o := range ops {
		if _, ok := Arity(o.Name); !ok {
			t.Errorf("Operations() includes %q which has no arity", o.Name)
		}
		if seen[o.Name] {
			t.Errorf("Operations() includes duplicate %q", o.Name)
		}
		seen[o.Name] = true
	}
}
