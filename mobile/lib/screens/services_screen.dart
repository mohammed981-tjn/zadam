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

import '../i18n.dart';
import '../services_catalogue.dart';
import '../theme.dart';
import '../ui.dart';

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
      appBar: AppBar(title: Text(tr('الخدمات التعاقدية', 'Contract services'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          IntroNote(
            tr('خدمات يقدّمها مكاتب هندسة زراعية ومزوّدون موثّقون، تُتعاقد '
            'بالمراحل: لكل مرحلة جدول ومبلغ ودفعة لا تُفرَج إلا بإثبات تنفيذ. '
            'الكمية في كل بند تُشتق من موسمك أو قطيعك ولا تُكتب يدوياً.', 'Services provided by agricultural engineering offices and verified providers, contracted in phases: each phase has a schedule, an amount and a payment released only on proof of work. The quantity in each item is derived from your season or herd and is not typed by hand.'),
            icon: Icons.handshake_outlined,
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            children: [
              _Chip(
                label: tr('الكل', 'All'),
                selected: _filter == null,
                onTap: () => setState(() => _filter = null),
              ),
              _Chip(
                label: tr('نباتي', 'Crops'),
                selected: _filter == ProductionKind.plant,
                onTap: () => setState(() => _filter = ProductionKind.plant),
              ),
              _Chip(
                label: tr('حيواني', 'Livestock'),
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
                        IconChip(
                          s.production == ProductionKind.livestock
                              ? Icons.pets_outlined
                              : s.isPrecondition
                              ? Icons.assignment_turned_in_outlined
                              : Icons.agriculture_outlined,
                          size: 38,
                        ),
                        const SizedBox(width: 10),
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
                              color: leafTintOn(context),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              tr('شرط مسبق', 'Precondition'),
                              style: TextStyle(
                                fontSize: 11,
                                color: inkOn(context),
                                fontWeight: FontWeight.w700,
                              ),
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
                      tr('الوحدة: ${s.unitLabel} — ${basisLabel[s.basis]}', 'Unit: ${s.unitLabel} — ${basisLabel[s.basis]}'),
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
            tr('الأسعار غير معروضة هنا لأنها تخصّ كل مزوّد وتتغيّر. اطلب عرضاً '
            'من الموقع لترى سعر مزوّد موثّق وخطة عقد محسوبة على موسمك.', 'Prices are not shown here because they belong to each provider and change. Ask for a quote on the website to see a verified provider\'s price and a contract plan worked out on your season.'),
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
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    );
  }
}
