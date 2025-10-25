import { useParams, useOutletContext } from 'react-router';
import AttachmentList from '../components/AttachmentList';
import type { Attachment } from '../lib/schemas';

export default function ResourceAttachmentsTab() {
  const { gameId, resourceId } = useParams<{ gameId: string; resourceId: string }>();
  const { attachments } = useOutletContext<{ attachments: Attachment[] }>();

  return (
    <div>
      <AttachmentList attachments={attachments} gameId={gameId!} resourceId={resourceId!} />
    </div>
  );
}
