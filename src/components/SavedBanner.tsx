"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function SavedBanner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [visible, setVisible] = useState(sp.get("saved") === "1");

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      setVisible(false);
      // Remove ?saved=1 from the URL to avoid the banner on reload
      const params = new URLSearchParams(sp.toString());
      params.delete("saved");
      router.replace(`?${params.toString()}`, { scroll: false });
    }, 1800);
    return () => clearTimeout(t);
  }, [visible, sp, router]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="rounded-md border p-3 text-sm bg-green-50 border-green-200"
    >
      Changes saved successfully.
    </div>
  );
}
