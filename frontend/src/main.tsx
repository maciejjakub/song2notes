import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Side-effect import: registers the <midi-player> and <midi-visualizer> custom
// elements. Done here at the entry point so they exist before any component
// renders them. (Previously loaded via a CDN <script> tag in index.html.)
import 'html-midi-player'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
