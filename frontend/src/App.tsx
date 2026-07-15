import { Calculator } from './components/Calculator'
import './App.css'

export default function App() {
  return (
    <main className="app">
      <h1 className="app-title">Calculator</h1>
      <Calculator />
      <p className="app-hint">Keyboard works too: digits, + − * / ^ %, Enter, Esc, ⌫</p>
    </main>
  )
}
