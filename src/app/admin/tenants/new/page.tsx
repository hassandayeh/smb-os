'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NewTenantPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [activatedUntil, setActivatedUntil] = useState<string>('');
  const [defaultLocale, setDefaultLocale] = useState<'en' | 'ar' | 'de'>('en');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          activatedUntil: activatedUntil || null, // yyyy-mm-dd or null
          defaultLocale,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to create tenant');
      }

      router.push('/admin/tenants');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="container mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4">
        <Button variant="outline" asChild>
          <Link href="/admin/tenants">← Back to Tenants</Link>
        </Button>
      </div>

      <div className="rounded-2xl border bg-card text-card-foreground p-6">
        <h2 className="text-xl font-semibold">New Tenant</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Create a customer company. You can enable modules later in “Manage Entitlements”.
        </p>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-2">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input
              id="name"
              type="text"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g., Blue Bakery LLC"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="activatedUntil" className="text-sm font-medium">Activated Until</label>
            <input
              id="activatedUntil"
              type="date"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              value={activatedUntil}
              onChange={(e) => setActivatedUntil(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to set later. If set, the tenant is considered active until this date.
            </p>
          </div>

          <div className="grid gap-2">
            <label htmlFor="defaultLocale" className="text-sm font-medium">Default Locale</label>
            <select
              id="defaultLocale"
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              value={defaultLocale}
              onChange={(e) => setDefaultLocale(e.target.value as 'en' | 'ar' | 'de')}
            >
              <option value="en">English (en)</option>
              <option value="ar">العربية (ar)</option>
              <option value="de">Deutsch (de)</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Tenant'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/admin/tenants">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
