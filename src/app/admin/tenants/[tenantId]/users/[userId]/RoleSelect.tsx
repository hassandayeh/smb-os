"use client";

import { useRef } from "react";

export default function RoleSelect({
  action,
  defaultValue,
  redirectTo,
}: {
  action: string;
  defaultValue: "TENANT_ADMIN" | "MANAGER" | "MEMBER";
  redirectTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={action} method="POST" ref={formRef} className="flex items-end gap-3">
      <div className="flex-1">
        <label className="block text-xs text-muted-foreground mb-1">Role</label>
        <select
          name="role"
          defaultValue={defaultValue}
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="TENANT_ADMIN">Tenant Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="MEMBER">Member</option>
        </select>
      </div>
      <input type="hidden" name="redirectTo" value={redirectTo} />
    </form>
  );
}
