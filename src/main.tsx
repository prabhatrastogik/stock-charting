import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode removed: DuckDB-Wasm doesn't tolerate double-init in dev mode
createRoot(document.getElementById('root')!).render(<App />)
