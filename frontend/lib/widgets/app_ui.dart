import 'package:flutter/material.dart';

/// Shared, presentation-only building blocks for CareGuide screens.  These
/// widgets intentionally contain no network or business logic.
class CareGuideColors {
  static const navy = Color(0xFF083344);
  static const teal = Color(0xFF0F766E);
  static const mint = Color(0xFFE6FFFB);
  static const canvas = Color(0xFFF6F8FA);
  static const ink = Color(0xFF17212B);
  static const muted = Color(0xFF637381);
  static const danger = Color(0xFFB42318);
  static const warning = Color(0xFFB54708);
  static const success = Color(0xFF087443);
}

class CareGuidePage extends StatelessWidget {
  const CareGuidePage({super.key, required this.child, this.padding = const EdgeInsets.all(20)});
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, constraints) => Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth >= 900 ? 1160 : double.infinity),
              child: Padding(padding: padding, child: child),
            ),
          ),
        ),
      );
}

class CareGuideSectionHeader extends StatelessWidget {
  const CareGuideSectionHeader({super.key, required this.title, this.subtitle, this.action});
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
              ],
            ]),
          ),
          if (action != null) action!,
        ],
      );
}

class CareGuideStatusBadge extends StatelessWidget {
  const CareGuideStatusBadge({super.key, required this.label, this.tone = CareGuideStatusTone.neutral});
  final String label;
  final CareGuideStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      CareGuideStatusTone.success => (const Color(0xFFDCFCE7), CareGuideColors.success),
      CareGuideStatusTone.warning => (const Color(0xFFFFEDD5), CareGuideColors.warning),
      CareGuideStatusTone.danger => (const Color(0xFFFEE4E2), CareGuideColors.danger),
      CareGuideStatusTone.info => (const Color(0xFFE0F2FE), const Color(0xFF0369A1)),
      CareGuideStatusTone.neutral => (const Color(0xFFEFF3F5), CareGuideColors.muted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: foreground, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

enum CareGuideStatusTone { success, warning, danger, info, neutral }

class CareGuideEmptyState extends StatelessWidget {
  const CareGuideEmptyState({super.key, required this.icon, required this.title, required this.message, this.action});
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CircleAvatar(radius: 30, backgroundColor: CareGuideColors.mint, child: Icon(icon, color: CareGuideColors.teal, size: 30)),
            const SizedBox(height: 14),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ]),
        ),
      );
}

class CareGuideActionTile extends StatelessWidget {
  const CareGuideActionTile({super.key, required this.icon, required this.label, required this.description, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final String description;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(16),
            child: Container(
              constraints: const BoxConstraints(minHeight: 112),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE2E8EE)), borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                CircleAvatar(radius: 18, backgroundColor: color.withValues(alpha: .12), child: Icon(icon, color: color, size: 20)),
                const Spacer(),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(description, style: const TextStyle(fontSize: 11, color: CareGuideColors.muted)),
              ]),
            ),
          ),
        ),
      );
}
