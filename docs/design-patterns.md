# Design Patterns

This document outlines common design patterns and component usage across the GameGame application.

## Layout Patterns

### Two-Column Layout with Sidebar

Use this pattern for detail pages where the main content is on the left and actions/metadata are in a sidebar on the right.

**Structure (Preferred - Flexbox):**
```tsx
<div className="flex flex-col lg:flex-row gap-8">
  {/* Left column - Main content */}
  <div className="flex-1">
    {/* Forms, lists, or other content */}
  </div>

  {/* Right column - Sidebar */}
  <div className="lg:w-[380px]">
    {/* Action buttons, metadata, etc. */}
  </div>
</div>
```

**Key features:**
- Prefer flexbox over grid for two-column layouts (simpler and more flexible)
- Stacks vertically on mobile/tablet (`flex-col`)
- Side-by-side on large screens (`lg:flex-row`)
- Left column grows to fill available space (`flex-1`)
- Right sidebar is 380px wide on desktop (`lg:w-[380px]`)
- `gap-8` provides spacing between columns

**Examples:**
- Game details page: `/admin/games/[gameId]/page.tsx` + `layout.tsx`
- Resource details page: `/admin/games/[gameId]/resources/[resourceId]/page.tsx`

### Responsive Grid for Cards

Use responsive grid layouts for card-based content:

```tsx
{/* 2-5 columns based on screen size */}
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

**Breakpoints:**
- `sm`: 640px (mobile landscape, small tablets)
- `md`: 768px (tablets)
- `lg`: 1024px (laptops, small desktops)
- `xl`: 1280px (desktops)
- `2xl`: 1536px (large desktops)

**Examples:**
- Attachments grid: `/admin/games/[gameId]/attachments/page.tsx`

## Form Patterns

### Form Inputs

**Input Styling:**
- Default: Muted border (`border-border`)
- Focus: Brighter border (`border-input`) + focus ring
- Smooth transitions with `transition-colors`

```tsx
<div className="grid gap-2">
  <Label htmlFor="name">Name</Label>
  <Input
    id="name"
    type="text"
    name="name"
    placeholder="Example"
    required
  />
</div>
```

**Standard form field structure:**
```tsx
<div className="grid gap-2">
  <Label htmlFor="fieldId">Field Label</Label>
  <Input id="fieldId" name="fieldName" />
</div>
```

**Form container:**
```tsx
<form className="grid gap-4">
  {/* Form fields */}
</form>
```

### Textarea

Same styling as Input but with minimum height:

```tsx
<div className="grid gap-2">
  <Label htmlFor="description">Description</Label>
  <Textarea
    id="description"
    name="description"
    placeholder="Enter description"
    rows={3}
  />
</div>
```

## Component Patterns

### Empty States

Use the `EmptyState` component for consistent "no data" displays:

```tsx
<EmptyState
  title="No items found"
  description="Get started by creating your first item."
  action={{ label: "Create Item", href: "/create" }}
/>
```

**Features:**
- Consistent dashed border container
- Icon support (optional)
- Primary action button
- Responsive min-height

### Action Buttons (Sidebar)

Use `ActionButton` for sidebar actions:

```tsx
<ActionButton
  icon={RefreshCw}
  title="Reprocess Resource"
  description="Re-extract PDF and re-embed content"
  onClick={handleReprocess}
/>

{/* Danger variant */}
<ActionButton
  icon={Trash2}
  title="Delete Game"
  description="Permanently delete this game"
  onClick={handleDelete}
  variant="danger"
/>
```

**Variants:**
- `default`: Standard button (border with hover)
- `danger`: Red accent for destructive actions

### Page Headers

Use `PageHeader` for consistent page titles with breadcrumbs:

```tsx
<PageHeader
  breadcrumbs={[
    { label: "Admin", href: "/admin" },
    { label: "Games", href: "/admin" },
    { label: gameName },
  ]}
  title="Game Details"
  description="Manage game settings and resources"
  stats="3 resources • 45 pages"
  actions={
    <Button asChild>
      <Link href="/admin/add-game">Add Game</Link>
    </Button>
  }
/>
```

### Tabs Navigation

URL-based tabs for shareable links:

```tsx
<Tabs>
  <TabsList>
    <Link href="/admin/games/abc/details">
      <TabsTrigger active={activeTab === "details"}>Details</TabsTrigger>
    </Link>
    <Link href="/admin/games/abc/resources">
      <TabsTrigger active={activeTab === "resources"}>Resources</TabsTrigger>
    </Link>
  </TabsList>

  <TabsContent>{children}</TabsContent>
</Tabs>
```

**Active tab detection:**
```tsx
const pathname = usePathname();
const activeTab = pathname.endsWith("/resources") ? "resources" : "details";
```

## Loading & Feedback

### Loading States

Use `SaveButton` for form submissions with automatic state management:

```tsx
<SaveButton
  state={saveState} // "idle" | "saving" | "success" | "error"
  onTimeout={() => setSaveState("idle")}
/>
```

### Flash Messages

For user feedback after actions:

```tsx
const { flash } = useFlashMessages();

// Success
flash("Game created successfully", "success", { removeAfter: 3000 });

// Error
flash("Failed to delete resource", "error", { removeAfter: 5000 });

// Persistent message
const message = flash("Processing...", "info", { removeAfter: null });
message.update("Completed!", "success", { removeAfter: 3000 });
```

## Color Tokens

**Borders:**
- `border-border`: Default muted border (lighter)
- `border-input`: Brighter border for focused inputs
- `border-primary`: Accent color for active states

**Text:**
- `text-foreground`: Primary text color
- `text-muted-foreground`: Secondary/hint text
- `text-destructive`: Error text

**Background:**
- `bg-background`: Main background
- `bg-muted`: Subtle background for cards/sections
- `bg-primary`: Accent background

**Always use design tokens instead of hard-coded colors** for consistency and theme support.

## Accessibility

### Focus States

All interactive elements must have visible focus states:

```tsx
// Buttons
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// Inputs
"focus-visible:outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring"
```

### Labels

Always associate labels with form inputs:

```tsx
{/* Good */}
<Label htmlFor="email">Email</Label>
<Input id="email" name="email" type="email" />

{/* Bad - missing association */}
<Label>Email</Label>
<Input name="email" type="email" />
```

## Responsive Design

### Mobile-First Approach

Start with mobile layout, then enhance for larger screens:

```tsx
{/* Stack on mobile, side-by-side on desktop */}
<div className="flex flex-col lg:flex-row gap-4">
  <div className="flex-1">Content</div>
  <div className="lg:w-64">Sidebar</div>
</div>
```

### Common Responsive Patterns

**Hide on mobile:**
```tsx
<div className="hidden lg:block">Desktop only</div>
```

**Show on mobile:**
```tsx
<div className="lg:hidden">Mobile only</div>
```

**Responsive spacing:**
```tsx
<div className="p-4 lg:p-8">
  {/* More padding on desktop */}
</div>
```

## Performance

### Image Optimization

Always use Next.js Image component for images:

```tsx
import Image from "next/image";

<Image
  src={game.imageUrl}
  alt={game.name}
  width={200}
  height={200}
  className="rounded"
/>
```

### Code Splitting

Use dynamic imports for heavy components:

```tsx
import dynamic from "next/dynamic";

const HeavyComponent = dynamic(() => import("./HeavyComponent"), {
  loading: () => <Spinner />,
});
```

## File Upload Patterns

### Using the FileUpload Component

For standard document/resource uploads with both click and drag-and-drop support:

```tsx
import { FileUpload } from "@/components/file-upload";

// Dropzone variant (larger area for drag-and-drop)
<FileUpload
  accept=".pdf"
  multiple
  onFilesSelected={(files) => handleUpload(files)}
  buttonText="Add Resource"
  dropzoneText="Drop PDF files here or click to browse"
  variant="dropzone"
/>

// Button variant (compact button)
<FileUpload
  accept=".pdf"
  multiple
  onFilesSelected={(files) => handleUpload(files)}
  buttonText="Add Resource"
  variant="button"
/>
```

**Common Props:**
- `accept`: File type restrictions (`.pdf`, `image/*`, etc.)
- `multiple`: Allow multiple file selection
- `maxSize`: Maximum file size in bytes
- `maxFiles`: Maximum number of files
- `onFilesSelected`: Callback when files are selected
- `validate`: Custom validation function

### Using the useFileInput Hook

For custom file upload UI (e.g., image previews):

```tsx
import { useFileInput } from "@/lib/hooks/useFileInput";

const { triggerFileInput } = useFileInput({
  accept: "image/*",
  multiple: false,
  onSelect: (files) => {
    const file = files[0];
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  },
});

// Custom clickable UI
<Card onClick={triggerFileInput} className="cursor-pointer">
  {imageUrl ? (
    <Image src={imageUrl} alt="Preview" />
  ) : (
    <div>Click to upload an image</div>
  )}
</Card>
```

**When to use each approach:**
- Use `FileUpload` component for standard document/PDF uploads
- Use `useFileInput` hook for custom UI (image previews, avatar uploads, etc.)

**Best Practices:**
- Always validate file types both client-side and server-side
- Show clear error messages for invalid files
- Provide visual feedback during upload
- Support both click and drag-and-drop when possible
- Clean up object URLs with `URL.revokeObjectURL()` when done

## Related Documentation

- [Testing Patterns](./testing.md) - Testing guidelines and examples
- [CLAUDE.md](../CLAUDE.md) - Project architecture and setup
