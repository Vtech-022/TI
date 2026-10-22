import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/fraunces/600.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './lib/store';
import Agenda from './pages/Agenda';
import Capture from './pages/Capture';
import Documents from './pages/Documents';
import Focus from './pages/Focus';
import HistoryPage from './pages/History';
import Overview from './pages/Overview';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';
import Tasks from './pages/Tasks';
import Waiting from './pages/Waiting';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'foco', element: <Focus /> },
      { path: 'captura', element: <Capture /> },
      { path: 'pendencias', element: <Tasks /> },
      { path: 'projetos', element: <Projects /> },
      { path: 'projetos/:id', element: <ProjectDetail /> },
      { path: 'agenda', element: <Agenda /> },
      { path: 'terceiros', element: <Waiting /> },
      { path: 'arquivos', element: <Documents /> },
      { path: 'historico', element: <HistoryPage /> },
      { path: 'relatorios', element: <Reports /> },
      { path: 'configuracoes', element: <SettingsPage /> },
      { path: '*', element: <Overview /> }
    ]
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  </StrictMode>
);
