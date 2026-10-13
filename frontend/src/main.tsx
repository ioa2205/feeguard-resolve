import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { LangProvider } from './i18n'

// Only the language is shared by the landing page and the product. The product's faces, styles
// and demo-bank session load with its own screens (`Product.tsx`).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
)
