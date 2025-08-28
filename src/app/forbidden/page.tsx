// src/app/forbidden/page.tsx
'use client';

import Link from 'next/link';
import { ArrowLeftCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <Card className="rounded-2xl shadow">
        <CardContent className="p-6 space-y-4">
          <div className="text-2xl font-semibold">403 — Forbidden</div>
          <p className="text-sm text-muted-foreground">
            You don’t have access to this feature. If you believe this is a mistake,
            ask the admin to enable the module for your tenant.
          </p>
          <div className="pt-2">
            <Button
              onClick={() => {
                window.history.back();
              }}
              className="rounded-2xl"
            >
              <ArrowLeftCircle className="me-2 h-4 w-4 rtl:rotate-180" />
              Go back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
