/// الخدمات التعاقدية، بلا شبكة.
///
/// The catalogue describes what each service is, what unit it is sold in, and
/// how its quantity follows from a season or a herd. All of that is fixed
/// information, so it ships with the app and needs no connection — which is the
/// point, because the person deciding whether a drone survey is worth it is
/// usually standing on the land in question.
///
/// Prices are absent on purpose. They belong to individual providers, change,
/// and need verification before anyone acts on them — so the app describes the
/// work and leaves the quoting to the website, rather than showing a number
/// that may be a season out of date.
library;

import 'package:flutter/material.dart';

import '../services_catalogue.dart';
import '../theme.dart';

class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key});

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  ProductionKind? _filter;

  @override
  Widget build(BuildContext context) {
    final muted = mutedOn(context);
    final scheme = Theme.of(context).colorScheme;

    final visible = serviceCatalogue.where((s) {
      if (_filter == null) return true;
      return s.production == _filter || s.production == ProductionKind.both;
    }).toList();

    // Preconditions first, matching the order a contract actually schedules
    // them in: a refused permit ends a project, a late survey only delays one.
    visible.sort((a, b) {
      if (a.isPrecondition == b.isPrecondition) return 0;
      return a.isPrecondition ? -1 : 1;
    });

    return Scaffold(
      appBar: AppBar(title: const Text('الخدمات التعاقدية')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'خدمات يقدّمها مكاتب هندسة زراعية ومزوّدون موثّقون، تُتعاقد '
            'بالمراحل: لكل مرحلة جدول ومبلغ ودفعة لا تُفرَج إلا بإثبات تنفيذ. '
            'الكمية في كل بند تُشتق من موسمك أو قطيعك ولا تُكتب يدوياً.',
            style: TextStyle(fontSize: 13, color: muted, height: 1.7),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            children: [
              _Chip(
                label: 'الكل',
                selected: _filter == null,
                onTap: () => setState(() => _filter = null),
              ),
              _Chip(
                label: 'نباتي',
                selected: _filter == ProductionKind.plant,
                onTap: () => setState(() => _filter = ProductionKind.plant),
              ),
              _Chip(
                label: 'حيواني',
                selected: _filter == ProductionKind.livestock,
                onTap: () => setState(() => _filter = ProductionKind.livestock),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (final s in visible) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            s.name,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 15),
                          ),
                        ),
                        if (s.isPrecondition)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: scheme.primary.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              'شرط مسبق',
                              style: TextStyle(
                                  fontSize: 11, color: scheme.primary),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(s.kindLabel,
                        style: TextStyle(fontSize: 12, color: muted)),
                    const SizedBox(height: 8),
                    Text(s.note,
                        style: TextStyle(fontSize: 13, height: 1.7)),
                    const SizedBox(height: 8),
                    Text(
                      'الوحدة: ${s.unitLabel} — ${basisLabel[s.basis]}',
                      style: TextStyle(fontSize: 12, color: muted),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
          ],
          const SizedBox(height: 8),
          Text(
            'الأسعار غير معروضة هنا لأنها تخصّ كل مزوّد وتتغيّر. اطلب عرضاً '
            'من الموقع لترى سعر مزوّد موثّق وخطة عقد محسوبة على موسمك.',
            style: TextStyle(fontSize: 12, color: muted, height: 1.7),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: scheme.primary.withValues(alpha: 0.15),
    );
  }
}
