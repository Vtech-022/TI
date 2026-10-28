import type { RouteObject } from 'react-router-dom';
import App from './App';
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
import Team from './pages/Team';
import Users from './pages/Users';
import Waiting from './pages/Waiting';


export const routes: RouteObject[] = [
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
      { path: 'equipe', element: <Team /> },
      { path: 'arquivos', element: <Documents /> },
      { path: 'historico', element: <HistoryPage /> },
      { path: 'relatorios', element: <Reports /> },
      { path: 'configuracoes', element: <SettingsPage /> },
      { path: 'usuarios', element: <Users /> },
      { path: '*', element: <Overview /> }
    ]
  }
];
