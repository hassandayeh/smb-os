"use client";

export default function ConfirmDeleteButton({
  action,
  redirectTo,
  label = "Delete user (remove from tenant)",
  message = "Are you sure you want to remove this user from the tenant? This frees a seat.",
}: {
  action: string;
  redirectTo: string;
  label?: string;
  message?: string;
}) {
  return (
    <form
      action={action}
      method="POST"
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button className="inline-flex h-8 items-center rounded-md border px-3 text-xs text-rose-700 border-rose-300 hover:bg-rose-50">
        {label}
      </button>
    </form>
  );
}
