import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

abstract final class AppTheme {
  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.secondary,
      secondary: AppColors.secondary,
      surface: AppColors.surface,
      error: AppColors.error,
      brightness: Brightness.light,
    );
    final text = GoogleFonts.poppinsTextTheme().apply(
      bodyColor: AppColors.text,
      displayColor: AppColors.text,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      primaryColor: AppColors.primary,
      scaffoldBackgroundColor: AppColors.background,
      textTheme: text.copyWith(
        headlineLarge: text.headlineLarge
            ?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.8),
        headlineMedium: text.headlineMedium
            ?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5),
        headlineSmall:
            text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
        titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
        titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        bodySmall: text.bodySmall?.copyWith(color: AppColors.muted),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      dataTableTheme: DataTableThemeData(
        headingRowColor: const WidgetStatePropertyAll(AppColors.background),
        headingTextStyle: text.bodyMedium?.copyWith(
          color: AppColors.muted,
          fontWeight: FontWeight.w700,
        ),
        dataTextStyle: text.bodyMedium?.copyWith(color: AppColors.text),
        headingRowHeight: 48,
        dataRowMinHeight: 56,
        dataRowMaxHeight: 72,
        horizontalMargin: 16,
        columnSpacing: 24,
        dividerThickness: 1,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.text,
      ),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStateProperty.resolveWith((states) =>
              states.contains(WidgetState.disabled)
                  ? AppColors.muted.withValues(alpha: .55)
                  : AppColors.primary),
          backgroundColor:
              const WidgetStatePropertyAll(AppColors.secondarySurface),
          overlayColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.pressed)) {
              return AppColors.secondary.withValues(alpha: .30);
            }
            if (states.contains(WidgetState.hovered)) {
              return AppColors.secondary.withValues(alpha: .18);
            }
            return null;
          }),
          shape: WidgetStatePropertyAll(
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.secondary,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle:
              GoogleFonts.poppins(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.secondary,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(0, 44),
          side: const BorderSide(color: AppColors.border),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        labelStyle: const TextStyle(color: AppColors.muted),
        hintStyle: const TextStyle(color: AppColors.muted),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide:
                const BorderSide(color: AppColors.secondary, width: 1.5)),
        errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.error)),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.secondarySurface,
        disabledColor: AppColors.background,
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        labelStyle:
            const TextStyle(color: AppColors.text, fontWeight: FontWeight.w500),
        secondaryLabelStyle: const TextStyle(
            color: AppColors.primary, fontWeight: FontWeight.w600),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      ),
      navigationRailTheme: const NavigationRailThemeData(
        backgroundColor: AppColors.surface,
        selectedIconTheme: IconThemeData(color: AppColors.secondary),
        unselectedIconTheme: IconThemeData(color: AppColors.muted),
        selectedLabelTextStyle:
            TextStyle(color: AppColors.secondary, fontWeight: FontWeight.w600),
        unselectedLabelTextStyle: TextStyle(color: AppColors.muted),
        indicatorColor: AppColors.secondarySurface,
      ),
      navigationBarTheme: const NavigationBarThemeData(
        height: 68,
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.secondarySurface,
        labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
        labelTextStyle: WidgetStatePropertyAll(
            TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
      ),
      dividerTheme: const DividerThemeData(
          color: AppColors.border, thickness: 1, space: 1),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(8),
        ),
        textStyle: const TextStyle(color: Colors.white, fontSize: 12),
        waitDuration: const Duration(milliseconds: 500),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.secondary,
        linearTrackColor: AppColors.secondarySurface,
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: AppColors.muted,
        textColor: AppColors.text,
        minVerticalPadding: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(12)),
        ),
      ),
    );
  }
}
