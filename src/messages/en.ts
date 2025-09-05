// src/messages/en.ts
import type { Messages } from '@/lib/i18n';

export const en: Messages = {
  // Generic actions
  'actions.save': 'Save',
  'savedBanner.saved': 'Saved.',
  'actions.cancel': 'Cancel',
  'actions.close': 'Close',
  'actions.delete': 'Delete',
  'actions.edit': 'Edit',
  'actions.manage': 'Manage',
  'actions.preview': 'Preview as',
  'actions.clearPreview': 'Clear preview',

  // Language
  'language.label': 'Language',
  'language.english': 'English',
  'language.arabic': 'Arabic',

  // Status
  'status.active': 'Active',
  'status.inactive': 'Inactive',
  'status.suspended': 'Suspended',

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
  'header.previewAs': 'Previewing as',
  'header.clearPreview': 'Clear',
  'header.signedInAs': 'Signed in as',
  'banner.returnToAdmin': 'Return to admin',
  'banner.viewingAs': 'Viewing as',

  // Errors (existing)
  'errors.params.required': 'Missing or invalid parameters.',
  'errors.auth': 'Forbidden (auth).',
  'errors.self_delete': 'You cannot delete your own account.',
  'errors.user.not_found_in_tenant': 'User not found in tenant.',
  'errors.membership.not_found_or_deleted': 'Membership not found or already deleted.',
  'errors.user.delete_failed': 'Failed to delete user.',
  'errors.membership.lastL3.forbidden': 'You cannot remove the last active Tenant Admin.',
  'errors.membership.demote_lastL3.forbidden': 'You cannot demote the last active Tenant Admin.',

  // Users / Supervisor
  'users.manager.label': 'Manager',
  'users.manager.none': 'No manager',
  'users.manager.assign.success': 'Manager updated.',
  'users.manager.assign.error': "Couldn't update manager.",

  // === Tenants page (admin)
  'date.fallback': '—',
  'admin.tenants.title': 'Tenants',
  'admin.console': 'Admin Console',
  'tenants.word': 'tenants',
  'actions.exportCsv': 'Export CSV',
  'actions.entitlements': 'Entitlements',
  'actions.clearSearch': 'Clear search',
  'tenants.summary.noQuery': '{count} tenants',
  'tenants.summary.query': '{count} tenants for “{q}”',
  'tenants.empty.query': 'No tenants found for “{q}”.',
  'tenants.empty.noQuery': 'No tenants available.',
  'tenants.sort.newestFirst': 'Newest first',
  'tenants.sort.oldestFirst': 'Oldest first',
  'tenants.sort.activationLatest': 'Latest activation',
  'tenants.sort.activationEarliest': 'Earliest activation',
  'tenants.sort.nameAsc': 'Name (A → Z)',
  'tenants.sort.nameDesc': 'Name (Z → A)',
  'table.name': 'Name',
  'table.id': 'ID',
  'table.status': 'Status',
  'table.activatedUntil': 'Activated Until',
  'table.created': 'Created',
  'table.actions': 'Actions',
  'pagination.pageOf': 'Page {page} of {totalPages}',
  'pagination.first': 'First',
  'pagination.prev': 'Prev',
  'pagination.next': 'Next',
  'pagination.last': 'Last',
  'search.placeholder.tenants': 'Search tenants...',
  'actions.createTenant': 'Create tenant',
  'search.aria.searchTenants': 'Search tenants',
  'search.aria.sortBy': 'Sort by',

  // ===== Appendix (RBAC domains & ranks) — labels (platform fixed)
  'roles.platform.a1': 'Developer',
  'roles.platform.a2': 'Admin',

  // ===== Appendix validators — error/feedback messages (i18n keys only)
  // Used by src/lib/rbac/validators.ts and guard-route mapper
  'roles.singleL1Violation': 'Exactly one active L1 is required for tenant {tenantId}.\nCurrent count: {count}.',
  'roles.tenantL1Missing': 'No active L1 found for tenant {tenantId}.',
  'roles.supervisorRequired': 'A supervisor is required for rank {rank}.',
  'roles.supervisorSameTenant': 'Supervisor must belong to the same tenant.',
  'roles.supervisorMustBeHigher': 'Supervisor rank ({supervisorRank}) must be higher (a lower number) than rank {rank}.',
  'roles.supervisorNoCycles': 'Supervisor assignment creates a cycle.\nPlease choose a different manager.',
  'roles.reassignmentComplete': 'Reports were reassigned successfully.',

  // ===== API/guard standard error keys
  'errors.auth.required': 'Sign-in required.',
  'errors.module.forbidden': 'You do not have access to this module.',
  'errors.forbidden': 'Forbidden.',
  'errors.server': 'Something went wrong.',

  // ===== Additional API errors (appendix handover)
  'errors.role.invalid': 'Invalid role.',
  'errors.username.conflict.tenant': 'Username already exists in this tenant.',
  'errors.conflict.unique': 'Conflict: resource already exists.',
  'errors.user.name_required': 'Name is required.',
  'errors.user.username_required': 'Username is required.',
  'errors.tenant.required': 'Tenant is required.',
  'errors.user.create_failed': 'Failed to create user.',
};
