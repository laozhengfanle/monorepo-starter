import { Route, Routes } from 'react-router-dom';
import './app.css';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">monorepo-starter</h1>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<p>Workspace skeleton ready.</p>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
