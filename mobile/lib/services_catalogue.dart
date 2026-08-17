/// كتالوج الخدمات التعاقدية.
///
/// A port of the descriptive half of `src/lib/services.ts`. It carries what a
/// service *is* — its unit, which side of production it serves, and how its
/// billable quantity is derived — and deliberately not what it costs, because
/// prices belong to individual providers and live in the database.
///
/// Duplicated rather than fetched for the same reason agronomy.dart is: someone
/// deciding whether to hire a drone survey is often standing in the field with
/// no signal, and a catalogue that needs a connection is no catalogue for them.
/// The cost of duplication is drift, and `test/services_catalogue_test.dart`
/// pins the two copies together so a change on either side fails the build
/// rather than quietly telling two users two different things.
library;

enum ProductionKind { plant, livestock, both }

enum QuantityBasis { feddans, waterM3, head, months, fixed }

class ServiceDefinition {
  const ServiceDefinition({
    required this.key,
    required this.name,
    required this.kindLabel,
    required this.unitLabel,
    required this.production,
    required this.basis,
    required this.isPrecondition,
    required this.note,
  });

  final String key;
  final String name;
  final String kindLabel;
  final String unitLabel;
  final ProductionKind production;
  final QuantityBasis basis;

  /// True for work that must be finished before anything in the field starts.
  /// A refused permit ends a project where a late survey only delays one, so
  /// these are shown first — the same order the web app schedules them in.
  final bool isPrecondition;

  final String note;
}

const List<ServiceDefinition> serviceCatalogue = [
  // ── التنظيمية: شروط مسبقة ────────────────────────────────────────────────
  ServiceDefinition(
    key: 'land_permit',
    name: 'تصريح استخدام الأرض',
    kindLabel: 'التوثيق والتصاريح',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: true,
    note: 'يُستخرَج مرة للمشروع لا لكل فدان. بدونه لا يبدأ عمل ميداني أصلاً.',
  ),
  ServiceDefinition(
    key: 'local_clearance',
    name: 'إجراءات المحلية والإدارة الأهلية',
    kindLabel: 'التوثيق والتصاريح',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: true,
    note: 'تختلف من ولاية لأخرى، ومعرفة المسار المحلي هي الخدمة نفسها.',
  ),
  ServiceDefinition(
    key: 'water_permit',
    name: 'تصريح استخدام المياه',
    kindLabel: 'التوثيق والتصاريح',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: true,
    note: 'سحب المياه من النيل أو الآبار يحتاج تصريحاً مستقلاً عن تصريح الأرض.',
  ),
  ServiceDefinition(
    key: 'contract_notarization',
    name: 'توثيق العقد',
    kindLabel: 'التوثيق والتصاريح',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: true,
    note: 'يجعل العقد نافذاً أمام جهة قضائية — وهو ما يحمي الطرفين إن اختلفا.',
  ),
  ServiceDefinition(
    key: 'feasibility_study',
    name: 'دراسة جدوى لمرحلة',
    kindLabel: 'مكتب هندسة زراعية',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: true,
    note: 'دراسة لكل مرحلة، تسبق التعاقد عليها.',
  ),

  // ── التوريد والتخليص ──────────────────────────────────────────────────────
  ServiceDefinition(
    key: 'machinery_procurement',
    name: 'وساطة شراء أو استيراد آلية',
    kindLabel: 'التوريد والتخليص',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: true,
    note: 'أتعاب الوساطة فقط. ثمن الآلية أصل رأسمالي يتجاوز الموسم ولا يُدرَج في عقد خدمات.',
  ),
  ServiceDefinition(
    key: 'customs_clearance',
    name: 'التخليص الجمركي',
    kindLabel: 'التوريد والتخليص',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: true,
    note: 'تُسعَّر بالإرسالية. الرسوم الجمركية نفسها تُدفع للدولة لا للمخلّص.',
  ),
  ServiceDefinition(
    key: 'transport',
    name: 'نقل',
    kindLabel: 'النقل والتخزين',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: false,
    note: 'يُسعَّر بالرحلة حسب المسافة؛ مقطوعية في العقد.',
  ),

  // ── إعداد الأرض ───────────────────────────────────────────────────────────
  ServiceDefinition(
    key: 'drone_survey',
    name: 'مسح ورفع مساحي بالدرون',
    kindLabel: 'خدمات الطائرات المسيّرة',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'المساحة الممسوحة هي مساحة الموسم نفسها، فالكمية تُشتق لا تُقدَّر.',
  ),
  ServiceDefinition(
    key: 'topo_survey',
    name: 'رفع طوبوغرافي',
    kindLabel: 'مكتب هندسة زراعية',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'يسبق التسوية ويحدّد ميولها؛ يقاس بالمساحة.',
  ),
  ServiceDefinition(
    key: 'soil_test',
    name: 'تحليل تربة',
    kindLabel: 'تحاليل التربة والمياه',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: false,
    note: 'عدد العيّنات لا يتناسب طردياً مع المساحة؛ مقطوعية للموسم.',
  ),
  ServiceDefinition(
    key: 'water_test',
    name: 'تحليل مياه',
    kindLabel: 'تحاليل التربة والمياه',
    unitLabel: 'مقطوعية',
    production: ProductionKind.both,
    basis: QuantityBasis.fixed,
    isPrecondition: false,
    note: 'عيّنة من المصدر تكفي الموسم ما لم يتغيّر المصدر.',
  ),
  ServiceDefinition(
    key: 'land_clearing',
    name: 'إزالة وتنظيف',
    kindLabel: 'الميكنة وإعداد الأرض',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'عمل ميكانيكي يقاس بالمساحة مباشرة.',
  ),
  ServiceDefinition(
    key: 'land_leveling',
    name: 'تسوية بالليزر',
    kindLabel: 'الميكنة وإعداد الأرض',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'التسوية شرط كفاءة الري؛ تقاس بالمساحة.',
  ),
  ServiceDefinition(
    key: 'machinery_rental',
    name: 'تأجير آلية بمشغّل',
    kindLabel: 'الميكنة وإعداد الأرض',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'استئجار جرار أو حصادة مع مشغّلها — عمل ميداني يقاس بالمساحة، لا إجراء إداري.',
  ),

  // ── الري ──────────────────────────────────────────────────────────────────
  ServiceDefinition(
    key: 'irrigation_design',
    name: 'تصميم شبكة ري',
    kindLabel: 'مكتب هندسة زراعية',
    unitLabel: 'مقطوعية',
    production: ProductionKind.plant,
    basis: QuantityBasis.fixed,
    isPrecondition: false,
    note: 'تصميم واحد للمشروع مهما اتّسع؛ التنفيذ هو ما يتوسّع لا التصميم.',
  ),
  ServiceDefinition(
    key: 'irrigation_install',
    name: 'تنفيذ شبكة ري',
    kindLabel: 'الري الحديث',
    unitLabel: 'م³',
    production: ProductionKind.plant,
    basis: QuantityBasis.waterM3,
    isPrecondition: false,
    note: 'تُحجَّم بالطلب المائي الموسمي المحسوب بمعادلة FAO-56، لا بالمساحة وحدها — '
        'فدان بالتنقيط غير فدان بالغمر.',
  ),

  // ── العمليات الزراعية ─────────────────────────────────────────────────────
  ServiceDefinition(
    key: 'mechanized_planting',
    name: 'زراعة ميكانيكية',
    kindLabel: 'الميكنة وإعداد الأرض',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'تقاس بالمساحة المزروعة.',
  ),
  ServiceDefinition(
    key: 'crop_protection',
    name: 'مكافحة',
    kindLabel: 'الإرشاد ونقل المعرفة',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'الرش يقاس بالمساحة المعالَجة.',
  ),
  ServiceDefinition(
    key: 'fertigation',
    name: 'تسميد',
    kindLabel: 'الإرشاد ونقل المعرفة',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'تقاس بالمساحة؛ الجرعة تتبع تحليل التربة.',
  ),
  ServiceDefinition(
    key: 'harvest_service',
    name: 'حصاد',
    kindLabel: 'الميكنة وإعداد الأرض',
    unitLabel: 'فدان',
    production: ProductionKind.plant,
    basis: QuantityBasis.feddans,
    isPrecondition: false,
    note: 'تقاس بالمساحة المحصودة.',
  ),
  ServiceDefinition(
    key: 'extension_visit',
    name: 'زيارة إرشادية',
    kindLabel: 'الإرشاد ونقل المعرفة',
    unitLabel: 'زيارة',
    production: ProductionKind.both,
    basis: QuantityBasis.months,
    isPrecondition: false,
    note: 'زيارة شهرية طوال دورة الإنتاج — تقليل المخاطر يحتاج انتظاماً لا زيارة واحدة.',
  ),

  // ── الإنتاج الحيواني ──────────────────────────────────────────────────────
  ServiceDefinition(
    key: 'vet_program',
    name: 'برنامج بيطري',
    kindLabel: 'الخدمات البيطرية',
    unitLabel: 'رأس',
    production: ProductionKind.livestock,
    basis: QuantityBasis.head,
    isPrecondition: false,
    note: 'التحصين والعلاج يقاسان بالرأس.',
  ),
  ServiceDefinition(
    key: 'feed_plan',
    name: 'برنامج تغذية',
    kindLabel: 'الإرشاد ونقل المعرفة',
    unitLabel: 'رأس',
    production: ProductionKind.livestock,
    basis: QuantityBasis.head,
    isPrecondition: false,
    note: 'العلف هو ما يقابل الماء في الإنتاج النباتي: أكبر بند في الميزانية، ويقاس بالرأس.',
  ),
  ServiceDefinition(
    key: 'herd_health',
    name: 'متابعة صحة القطيع',
    kindLabel: 'الخدمات البيطرية',
    unitLabel: 'زيارة',
    production: ProductionKind.livestock,
    basis: QuantityBasis.months,
    isPrecondition: false,
    note: 'متابعة دورية شهرية طوال الدورة.',
  ),
];

/// How the billable quantity is described to a reader, per basis.
const Map<QuantityBasis, String> basisLabel = {
  QuantityBasis.feddans: 'يُحسب من مساحة الموسم',
  QuantityBasis.waterM3: 'يُحسب من الاحتياج المائي (FAO-56)',
  QuantityBasis.head: 'يُحسب من عدد الرؤوس',
  QuantityBasis.months: 'يُحسب من طول الدورة',
  QuantityBasis.fixed: 'مقطوعية للموسم',
};
