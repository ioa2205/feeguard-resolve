import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom'

// Every screen is loaded when it is opened (V2_PLAN W2): the landing page at `/` carries none
// of the product's code, and the product carries none of the landing page's.
const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
})

/** An address of the first version, sent on to where the screen lives now. */
function Moved({ to }: { to: (id: string) => string }) {
  const params = useParams()
  return <Navigate to={to(encodeURIComponent(Object.values(params)[0] ?? ''))} replace />
}

const router = createBrowserRouter([
  // The landing page at `/`, and in one language at /uz, /ru and /en: the address a shared link
  // carries (its preview is in that language). One route holds all four, so switching the
  // language keeps the page where it is.
  {
    ...page(() => import('./landing/Landing')),
    children: [{ index: true }, { path: '/uz' }, { path: '/ru' }, { path: '/en' }],
  },
  // The guided run comes with V2_PLAN W4; until then the demo opens the product.
  { path: '/demo', element: <Navigate to="/app" replace /> },
  // FeeGuard, the product: everything lives under /app (V2_PLAN W1.5).
  {
    ...page(() => import('./Product')),
    children: [
      { path: '/app', ...page(() => import('./product/Complaints')) },
      { path: '/app/case/:complaintId', ...page(() => import('./product/Case')) },
      { path: '/app/others/:findingId', ...page(() => import('./product/Others')) },
      { path: '/app/incidents', lazy: async () => ({ Component: (await import('./product/Incidents')).IncidentList }) },
      { path: '/app/incidents/:incidentId', lazy: async () => ({ Component: (await import('./product/Incidents')).IncidentPage }) },
      { path: '/app/report', ...page(() => import('./product/Report')) },
      { path: '/app/audit', ...page(() => import('./product/Audit')) },
      // The other side of the demo, and its tools
      { path: '/app/phone', ...page(() => import('./product/Phone')) },
      { path: '/app/demo', ...page(() => import('./product/Demo')) },
      { path: '/app/results', ...page(() => import('./product/Results')) },
      // The addresses of the first version still open the right screen.
      { path: '/case/:id', element: <Moved to={(id) => `/app/case/${id}`} /> },
      { path: '/case', element: <Navigate to="/app" replace /> },
      { path: '/scan/:id', element: <Moved to={(id) => `/app/others/${id}`} /> },
      { path: '/scan', element: <Navigate to="/app" replace /> },
      { path: '/reports', element: <Navigate to="/app/report" replace /> },
      { path: '/audit', element: <Navigate to="/app/audit" replace /> },
      { path: '/sandbox/customer', element: <Navigate to="/app/phone" replace /> },
      { path: '/sandbox/build', element: <Navigate to="/app/demo" replace /> },
      { path: '/sandbox/scoreboard', element: <Navigate to="/app/results" replace /> },
      { path: '*', lazy: async () => ({ Component: (await import('./product/Frame')).NotFound }) },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
