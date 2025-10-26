import { Navigate, useParams } from 'react-router';

export async function loader({ context }: { context: { api: any } }) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);
  return {};
}

export default function EditGame() {
  const { gameId } = useParams<{ gameId: string }>();

  if (!gameId) {
    return <Navigate to="/admin/games" replace />;
  }

  return <Navigate to={`/admin/games/${gameId}`} replace />;
}
