import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { Download, ArrowLeft } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
import { SaveButton } from '../components/ui/save-button';
import Heading from '../components/Heading';
import AttachmentList from '../components/AttachmentList';
import { resourceSchema, type Attachment, attachmentsListSchema } from '../lib/schemas';
import { z } from 'zod';

// Extended Resource schema with additional UI fields
const extendedResourceSchema = resourceSchema.extend({
  originalFilename: z.string().optional(),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().nullable().optional(),
  content: z.string().optional(),
  // createdAt and updatedAt already defined in base schema as coerced numbers
});

type Resource = z.infer<typeof extendedResourceSchema>;

export default function AdminResourceDetail() {
  const { gameId, resourceId } = useParams<{ gameId: string; resourceId: string }>();
  const [resource, setResource] = useState<Resource | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [attributionUrl, setAttributionUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!resourceId) return;

    const loadResourceData = async () => {
      try {
        const [resourceRes, attachmentsRes] = await Promise.all([
          fetch(`/api/resources/${resourceId}`),
          fetch(`/api/resources/${resourceId}/attachments`),
        ]);

        if (!resourceRes.ok) throw new Error('Resource not found');
        if (!attachmentsRes.ok) throw new Error('Failed to load attachments');

        const [resourceJson, attachmentsJson] = await Promise.all([
          resourceRes.json(),
          attachmentsRes.json(),
        ]);

        const resourceData = extendedResourceSchema.parse(resourceJson);
        const attachmentsData = attachmentsListSchema.parse(attachmentsJson);
        setResource(resourceData);
        setName(resourceData.name || '');
        setContent(resourceData.content || '');
        setDescription(resourceData.description || '');
        setAuthor(resourceData.author || '');
        setAttributionUrl(resourceData.attributionUrl || '');
        setAttachments(attachmentsData);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load resource:', err);
        setResource(null);
        setLoading(false);
      }
    };

    loadResourceData();
  }, [resourceId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceId) return;

    setSaving(true);
    setSaveStatus('idle');
    try {
      const payload = {
        name,
        content,
        description: description.trim() ? description : null,
        author: author.trim() ? author : null,
        attributionUrl: attributionUrl.trim() ? attributionUrl : null,
      };

      const response = await fetch(`/api/resources/${resourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updatedResource = extendedResourceSchema.parse(await response.json());
        setResource((prev) => (prev ? { ...prev, ...updatedResource } : updatedResource));
        setName(updatedResource.name || '');
        setContent(updatedResource.content || '');
        setDescription(updatedResource.description || '');
        setAuthor(updatedResource.author || '');
        setAttributionUrl(updatedResource.attributionUrl || '');
        setSaveStatus('success');
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Update error:', error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  if (!resource) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-xl mb-4">Resource not found</p>
          <Button asChild>
            <Link to={`/admin/games/${gameId}`}>Back to Game</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const stats = [
    typeof resource.fragmentCount === 'number' ? `${resource.fragmentCount.toLocaleString()} chunks` : null,
    typeof resource.pageCount === 'number' ? `${resource.pageCount} pages` : null,
    resource.imageCount > 0 ? `${resource.imageCount} images` : null,
    resource.wordCount > 0 ? `${(resource.wordCount / 1000).toFixed(1)}k words` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <AdminLayout>
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to={`/admin/games/${gameId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Game
          </Link>
        </Button>

        <div className="flex items-center gap-4 mb-2">
          <Heading className="mb-0">{resource.name}</Heading>
          <Button asChild size="sm" variant="ghost">
            <a href={resource.url} target="_blank" rel="noopener noreferrer">
              <Download className="h-5 w-5" />
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{stats}</p>
      </div>

      <form onSubmit={handleSave} className="grid gap-4 mb-8">
        <div className="grid gap-2">
          <Label htmlFor="name">Document Title</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Game Manual.pdf"
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="originalFilename">Original Filename</Label>
          <Input id="originalFilename" type="text" value={resource.originalFilename} readOnly className="font-mono" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Summary</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Short summary of this resource"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="author">Author / Creator</Label>
          <Input
            id="author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. Fantasy Flight Games"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="attributionUrl">Attribution URL</Label>
          <Input
            id="attributionUrl"
            type="url"
            value={attributionUrl}
            onChange={(e) => setAttributionUrl(e.target.value)}
            placeholder="https://publisher.com/rulebook"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="content">Markdown Content</Label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            placeholder="Markdown Content"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
            required
          />
        </div>

        <SaveButton
          type="submit"
          status={saveStatus}
          isLoading={saving}
          successText="Changes saved."
          errorText="Failed to save changes. Please try again."
          onStatusTimeout={() => setSaveStatus('idle')}
          wrapperClassName="mr-auto"
        />
      </form>

      <div className="mt-8">
        <h4 className="text-lg font-semibold mb-4">Media Attachments</h4>
        <AttachmentList attachments={attachments} gameId={gameId!} resourceId={resourceId!} />
      </div>
    </AdminLayout>
  );
}
