import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Shared, presentation-only building blocks for CareGuide screens.  These
/// widgets intentionally contain no network or business logic.
class CareGuideColors {
  static const navy = AppColors.primary;
  static const teal = AppColors.secondary;
  static const mint = AppColors.secondarySurface;
  static const canvas = AppColors.background;
  static const ink = AppColors.text;
  static const muted = AppColors.muted;
  static const danger = AppColors.error;
  static const warning = AppColors.warning;
  static const success = AppColors.success;
}

class CareGuidePage extends StatelessWidget {
  const CareGuidePage(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(20)});
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, constraints) => Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                  maxWidth: constraints.maxWidth >= 1400
                      ? 1360
                      : constraints.maxWidth >= 900
                          ? 1200
                          : double.infinity),
              child: Padding(padding: padding, child: child),
            ),
          ),
        ),
      );
}

class CareGuideSectionHeader extends StatelessWidget {
  const CareGuideSectionHeader(
      {super.key, required this.title, this.subtitle, this.action});
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
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
  const CareGuideStatusBadge(
      {super.key,
      required this.label,
      this.tone = CareGuideStatusTone.neutral});
  final String label;
  final CareGuideStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      CareGuideStatusTone.success => (
          const Color(0xFFDCFCE7),
          CareGuideColors.success
        ),
      CareGuideStatusTone.warning => (
          const Color(0xFFFFEDD5),
          CareGuideColors.warning
        ),
      CareGuideStatusTone.danger => (
          const Color(0xFFFEE4E2),
          CareGuideColors.danger
        ),
      CareGuideStatusTone.info => (
          const Color(0xFFE0F2FE),
          const Color(0xFF0369A1)
        ),
      CareGuideStatusTone.neutral => (
          const Color(0xFFEFF3F5),
          CareGuideColors.muted
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
          color: background, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(
              color: foreground, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

enum CareGuideStatusTone { success, warning, danger, info, neutral }

class CareGuideEmptyState extends StatelessWidget {
  const CareGuideEmptyState(
      {super.key,
      required this.icon,
      required this.title,
      required this.message,
      this.action});
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CircleAvatar(
                radius: 30,
                backgroundColor: CareGuideColors.mint,
                child: Icon(icon, color: CareGuideColors.teal, size: 30)),
            const SizedBox(height: 14),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ]),
        ),
      );
}

class CareGuideActionTile extends StatelessWidget {
  const CareGuideActionTile(
      {super.key,
      required this.icon,
      required this.label,
      required this.description,
      required this.color,
      required this.onTap});
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
              constraints: const BoxConstraints(minHeight: 88),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                  borderRadius: BorderRadius.circular(16)),
              child: Row(children: [
                CircleAvatar(
                    radius: 18,
                    backgroundColor: color.withValues(alpha: .12),
                    child: Icon(icon, color: color, size: 20)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                        Text(description,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 11, color: CareGuideColors.muted)),
                      ]),
                ),
              ]),
            ),
          ),
        ),
      );
}

class CareGuideCard extends StatelessWidget {
  const CareGuideCard(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(20),
      this.onTap});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(padding: padding, child: child),
        ),
      );
}

class CareGuideStatCard extends StatelessWidget {
  const CareGuideStatCard(
      {super.key,
      required this.label,
      required this.value,
      required this.icon,
      this.tone = CareGuideColors.teal,
      this.caption});
  final String label;
  final String value;
  final IconData icon;
  final Color tone;
  final String? caption;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                  color: tone.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: tone),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall),
                    if (caption != null)
                      Text(caption!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(color: CareGuideColors.muted)),
                  ]),
            ),
          ]),
        ),
      );
}
