// src/app/[tenantId]/loading.tsx
// Next.js App Router note: loading.tsx does NOT receive props/params.
// Keep this as a pure UI skeleton. All access checks live in layout.tsx.

export default function Loading() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-7 w-40 rounded-md bg-slate-200 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    </div>
  );
}
