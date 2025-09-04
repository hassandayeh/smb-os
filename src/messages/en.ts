import type { Messages } from '@/lib/i18n';

export const en: Messages = {
  // Generic actions
  'actions.save': 'Save',
  "savedBanner.saved": "Saved.",
  'actions.cancel': 'Cancel',
  'actions.close': 'Close',
  'actions.delete': 'Delete',
  'actions.edit': 'Edit',
  'actions.manage': 'Manage',
  'actions.preview': 'Preview as',
  'actions.clearPreview': 'Clear preview',

  "language.label": "Language",
  "language.english": "English",
  "language.arabic": "Arabic",

  // Status
  'status.active': 'Active',
  'status.inactive': 'Inactive',

  // SubmitButton (Phase 0 ready)
  'submit.saving': 'Saving…',

  // Audit quick filter labels (Phase 1 will wire these)
  'audit.filters.action': 'Action',
  'audit.actions.user.create': 'User created',
  'audit.actions.user.role.changed': 'User role changed',
  'audit.actions.user.status.changed': 'User status changed',
  'audit.actions.user.delete': 'User deleted',
  'audit.actions.user.supervisor.set': 'Supervisor set',
  'audit.actions.user.supervisor.unset': 'Supervisor unset',
  'audit.actions.entitlement.update': 'Entitlement updated',
  'audit.actions.user.entitlement.update': 'User entitlement updated',

  // Settings (Horizon polish, upcoming)
  'settings.saved': 'Settings saved',
  'settings.saveFailed': 'Could not save settings',

    // Header (impersonation)
  "header.previewAs": "Previewing as",
  "header.clearPreview": "Clear",
  "header.signedInAs": "Signed in as",
    "banner.returnToAdmin": "Return to admin",
  "banner.viewingAs": "Viewing as",


  // src/messages/en.ts
  "errors.params.required": "Missing or invalid parameters.",
  "errors.auth": "Forbidden (auth).",
  "errors.self_delete": "You cannot delete your own account.",
  "errors.user.not_found_in_tenant": "User not found in tenant.",
  "errors.membership.not_found_or_deleted": "Membership not found or already deleted.",
  "errors.user.delete_failed": "Failed to delete user.",
  "errors.membership.lastL3.forbidden": "You cannot remove the last active Tenant Admin.",
  "errors.membership.demote_lastL3.forbidden": "You cannot demote the last active Tenant Admin.",

  "users.manager.label": "Manager",
  "users.manager.none": "No manager",
  "users.manager.assign.success": "Manager updated.",
  "users.manager.assign.error": "Couldn't update manager.",





};



