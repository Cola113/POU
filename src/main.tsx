import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

function syncViewportVars() {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const offsetTop = viewport?.offsetTop ?? 0
  const offsetLeft = viewport?.offsetLeft ?? 0
  const bottomGap = Math.max(0, window.innerHeight - height - offsetTop)

  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`)
  document.documentElement.style.setProperty('--visual-viewport-top', `${offsetTop}px`)
  document.documentElement.style.setProperty('--visual-viewport-left', `${offsetLeft}px`)
  document.documentElement.style.setProperty('--visual-viewport-bottom', `${bottomGap}px`)
}

syncViewportVars()
window.addEventListener('resize', syncViewportVars)
window.addEventListener('orientationchange', syncViewportVars)
window.visualViewport?.addEventListener('resize', syncViewportVars)
window.visualViewport?.addEventListener('scroll', syncViewportVars)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
