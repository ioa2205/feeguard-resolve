import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { Frame } from './components/Frame'
import { NotBuilt } from './components/NotBuilt'
import Audit from './pages/Audit'
import Case from './pages/Case'
import CustomerView from './pages/CustomerView'
import Inbox from './pages/Inbox'
import JuryPanel from './pages/JuryPanel'
import Reports from './pages/Reports'
import Scan from './pages/Scan'
import Scoreboard from './pages/Scoreboard'

const router = createBrowserRouter([
  {
    element: <Frame />,
    children: [
      // FeeGuard, the product
      { path: '/', element: <Inbox /> },
      { path: '/case/:complaintId?', element: <Case /> },
      { path: '/scan/:findingId?', element: <Scan /> },
      { path: '/reports', element: <Reports /> },
      { path: '/audit', element: <Audit /> },
      // Sandbox Bank, the demo
      { path: '/sandbox/customer', element: <CustomerView /> },
      { path: '/sandbox/build', element: <JuryPanel /> },
      { path: '/sandbox/scoreboard', element: <Scoreboard /> },
      {
        path: '*',
        element: (
          <NotBuilt
            title="No such screen"
            sentence="This address does not belong to FeeGuard."
            will="Choose a screen from the menu above."
            task="C1"
          />
        ),
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
