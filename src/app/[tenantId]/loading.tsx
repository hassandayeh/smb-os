// src/app/[tenantId]/loading.tsx
export default function TenantSegmentLoading() {
  return (
    <div className="p-4 animate-pulse">
      <div className="h-9 w-64 rounded-md bg-gray-200 dark:bg-gray-800 mb-4" />
      <div className="space-y-3">
        <div className="h-6 w-1/2 rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="h-6 w-2/3 rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="h-6 w-1/3 rounded-md bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}
