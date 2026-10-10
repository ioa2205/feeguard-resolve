import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// The three faces and weights of DESIGN section 5, bundled into our own build.
import '@fontsource/fira-sans/400.css'
import '@fontsource/fira-sans/600.css'
import '@fontsource/fira-sans-condensed/600.css'
import '@fontsource/fira-sans-condensed/700.css'
import '@fontsource/charis-sil/400.css'
import './index.css'

import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
