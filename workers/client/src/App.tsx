import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import GameList from './pages/GameList';
import GameDetail from './pages/GameDetail';
import AdminGames from './pages/admin/Games';
import AdminAddGame from './pages/admin/AddGame';
import AdminManualAddGame from './pages/admin/ManualAddGame';
import AdminEditGame from './pages/admin/EditGame';
import AdminGameResources from './pages/admin/GameResources';
import AdminResourceDetail from './pages/admin/ResourceDetail';
import AdminEditAttachment from './pages/admin/EditAttachment';
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/games" replace />} />
        <Route path="/games" element={<GameList />} />
        <Route path="/games/:gameId" element={<GameDetail />} />
        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <AdminGames />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin/add-game"
          element={
            <ProtectedAdminRoute>
              <AdminAddGame />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin/add-game/manual"
          element={
            <ProtectedAdminRoute>
              <AdminManualAddGame />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin/games/:gameId/edit"
          element={
            <ProtectedAdminRoute>
              <AdminEditGame />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin/games/:gameId/resources/:resourceId/attachments/:attachmentId"
          element={
            <ProtectedAdminRoute>
              <AdminEditAttachment />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin/games/:gameId/resources/:resourceId"
          element={
            <ProtectedAdminRoute>
              <AdminResourceDetail />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin/games/:gameId"
          element={
            <ProtectedAdminRoute>
              <AdminGameResources />
            </ProtectedAdminRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/login/verify" element={<LoginVerify />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
