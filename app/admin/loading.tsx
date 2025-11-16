export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">Verifying admin access...</p>
      </div>
    </div>
  );
}
