import { useEffect } from 'react'
import { initDuckDB } from './lib/duckdb'
import { useChartStore } from './store/chartStore'
import Dashboard from './pages/Dashboard'

function App() {
  const { setDuckDBStatus } = useChartStore()

  useEffect(() => {
    initDuckDB()
      .then(() => setDuckDBStatus('ready'))
      .catch((err) => {
        console.error('DuckDB init failed:', err)
        setDuckDBStatus('error')
      })
  }, [setDuckDBStatus])

  return <Dashboard />
}

export default App
