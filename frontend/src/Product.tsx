// The product's shell: its faces, its styles, the open demo bank and the frame of every screen.
// Loaded only when a product address is opened, so the landing page carries none of it (V2_PLAN W2).

import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/onest/700.css'
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/400-italic.css'
import './product/product.css'

import { Frame } from './product/Frame'
import { SessionProvider } from './session'

export default function Product() {
  return (
    <SessionProvider>
      <Frame />
    </SessionProvider>
  )
}
