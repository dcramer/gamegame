import { Navigate, useParams } from 'react-router';

export default function EditGame() {
  const { gameId } = useParams<{ gameId: string }>();

  if (!gameId) {
    return <Navigate to="/admin/games" replace />;
  }

  return <Navigate to={`/admin/games/${gameId}`} replace />;
}
