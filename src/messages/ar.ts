// src/messages/ar.ts
import type { Messages } from "@/lib/i18n";

export const ar: Messages = {
  // الإجراءات العامة
  "actions.save": "حفظ",
  "savedBanner.saved": "تم الحفظ.",
  "actions.cancel": "إلغاء",
  "actions.close": "إغلاق",
  "actions.delete": "حذف",
  "actions.edit": "تعديل",
  "actions.manage": "إدارة",
  "actions.preview": "المعاينة باسم",
  "actions.clearPreview": "مسح المعاينة",

  // اللغة
  "language.label": "اللغة",
  "language.english": "الإنجليزية",
  "language.arabic": "العربية",

  // الحالة
  "status.active": "نشط",
  "status.inactive": "غير نشط",
  "status.suspended": "موقوف",

  // زر الإرسال
  "submit.saving": "جارٍ الحفظ…",

  // السجل (التدقيق) — عوامل التصفية والإجراءات
  "audit.filters.action": "الإجراء",
  "audit.actions.user.create": "تم إنشاء مستخدم",
  "audit.actions.user.role.changed": "تم تغيير دور المستخدم",
  "audit.actions.user.status.changed": "تم تغيير حالة المستخدم",
  "audit.actions.user.delete": "تم حذف المستخدم (حذف منطقي)",
  "audit.actions.user.supervisor.set": "تم تعيين مشرف",
  "audit.actions.user.supervisor.unset": "تم إلغاء تعيين مشرف",
  "audit.actions.entitlement.update": "تم تحديث الصلاحية",
  "audit.actions.user.entitlement.update": "تم تحديث صلاحية المستخدم",

  // الإعدادات
  "settings.saved": "تم حفظ الإعدادات",
  "settings.saveFailed": "تعذر حفظ الإعدادات",

  // التقمص (المعاينة باسم)
  "header.previewAs": "المعاينة كـ",
  "header.clearPreview": "إلغاء",
  "header.signedInAs": "تسجيل الدخول باسم",
  "banner.returnToAdmin": "العودة إلى المشرف",
  "banner.viewingAs": "تسجيل العرض باسم",

  // الأخطاء (قائمة موجودة)
  "errors.params.required": "معلمات مفقودة أو غير صالحة.",
  "errors.auth": "ممنوع (المصادقة).",
  "errors.self_delete": "لا يمكنك حذف حسابك الخاص.",
  "errors.user.not_found_in_tenant": "المستخدم غير موجود في المستأجر.",
  "errors.membership.not_found_or_deleted": "العضوية غير موجودة أو محذوفة بالفعل.",
  "errors.user.delete_failed": "فشل حذف المستخدم.",
  "errors.membership.lastL3.forbidden": "لا يمكنك إزالة آخر مشرف مستأجر نشط.",
  "errors.membership.demote_lastL3.forbidden":
    "لا يمكنك خفض رتبة آخر مشرف مستأجر نشط.",

  // المستخدمون / المدير المباشر
  "users.manager.label": "المدير",
  "users.manager.none": "لا يوجد مدير",
  "users.manager.assign.success": "تم تحديث المدير.",
  "users.manager.assign.error": "تعذر تحديث المدير.",

  // === صفحة المستأجرين (لوحة الإدارة)
  "date.fallback": "—",
  "admin.tenants.title": "المستأجرون",
  "admin.console": "لوحة التحكم",
  "tenants.word": "المستأجرين",
  "actions.exportCsv": "تصدير CSV",
  "actions.entitlements": "الصلاحيات",
  "actions.clearSearch": "مسح البحث",
  "tenants.summary.noQuery": "{count} المستأجرين",
  "tenants.summary.query": "{count} من المستأجرين لِـ “{q}”",
  "tenants.empty.query": "لا يوجد مستأجرون لـ “{q}”.",
  "tenants.empty.noQuery": "لا يوجد مستأجرون.",
  "tenants.sort.newestFirst": "الأحدث أولًا",
  "tenants.sort.oldestFirst": "الأقدم أولًا",
  "tenants.sort.activationLatest": "أحدث تفعيل",
  "tenants.sort.activationEarliest": "أقدم تفعيل",
  "tenants.sort.nameAsc": "الاسم (أ → ي)",
  "tenants.sort.nameDesc": "الاسم (ي → أ)",
  "table.name": "الاسم",
  "table.id": "المعرّف",
  "table.status": "الحالة",
  "table.activatedUntil": "تاريخ التفعيل",
  "table.created": "تاريخ الإنشاء",
  "table.actions": "الإجراءات",
  "pagination.pageOf": "الصفحة {page} من {totalPages}",
  "pagination.first": "الأولى",
  "pagination.prev": "السابق",
  "pagination.next": "التالي",
  "pagination.last": "الأخيرة",
  "search.placeholder.tenants": "ابحث عن مستأجرين...",
  "actions.createTenant": "إنشاء جهة",
  "search.aria.searchTenants": "بحث في الجهات",
  "search.aria.sortBy": "ترتيب حسب",

  // ===== الملحق (نطاقات وأرقام الرتب) — تسميات المنصّة (ثابتة)
  "roles.platform.a1": "مطوّر النظام",
  "roles.platform.a2": "مسؤول المنصة",

  // ===== رسائل التحقق/الأخطاء الخاصة بالملحق (تستخدمها validators + حارس المسارات)
  "roles.singleL1Violation":
    "يجب أن يكون هناك مسؤول L1 واحد نشط فقط للجهة {tenantId}. العدد الحالي: {count}.",
  "roles.tenantL1Missing": "لا يوجد مسؤول L1 نشط للجهة {tenantId}.",
  "roles.supervisorRequired": "يلزم تعيين مدير للرتبة {rank}.",
  "roles.supervisorSameTenant": "يجب أن يكون المدير من نفس الجهة.",
  "roles.supervisorMustBeHigher":
    "رتبة المدير ({supervisorRank}) يجب أن تكون أعلى (رقم أقل) من الرتبة {rank}.",
  "roles.supervisorNoCycles":
    "تعيين المدير يؤدي إلى حلقة. يرجى اختيار مدير آخر.",
  "roles.reassignmentComplete": "تم إعادة إسناد المرؤوسين بنجاح.",

  // ===== مفاتيح أخطاء قياسية لحارس واجهات البرمجة (API)
  "errors.auth.required": "يلزم تسجيل الدخول.",
  "errors.module.forbidden": "ليست لديك صلاحية الوصول إلى هذه الوحدة.",
  "errors.forbidden": "ممنوع.",
  "errors.server": "حدث خطأ ما.",
};
