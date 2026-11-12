import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_resource_management/providers/auth_provider.dart';
import 'package:hospital_resource_management/screens/landing_screen.dart';
import 'package:hospital_resource_management/screens/login_screen.dart';
import 'package:hospital_resource_management/theme/app_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('CareSync portal selector offers all five roles responsively',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1280, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final auth = AuthProvider();
    addTearDown(auth.dispose);

    await tester.pumpWidget(ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: const MaterialApp(home: LandingScreen()),
    ));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.text('Access Dashboard'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 900));

    for (final label in [
      'Patient Portal',
      'Hospital Portal',
      'Doctor Portal',
      'Ambulance Driver Portal',
      'Admin Portal',
    ]) {
      expect(find.text(label), findsOneWidget);
    }

    await tester.tap(find.text('Doctor Portal'));
    await tester.pump();
    expect(find.textContaining('authorized hospital or administrator'),
        findsOneWidget);

    await tester.tap(find.text('Ambulance Driver Portal'));
    await tester.pump();
    expect(find.textContaining('mobile number and the initial password'),
        findsOneWidget);
    expect(find.text('Activate invitation'), findsNothing);
    expect(find.text('Private Ambulance Registration'), findsOneWidget);

    await tester.tap(find.text('Admin Portal'));
    await tester.pump();
    expect(find.textContaining('provisioned securely'), findsOneWidget);
  });

  testWidgets('standalone login uses the same role-aware onboarding paths',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthProvider();
    addTearDown(auth.dispose);
    await tester.pumpWidget(ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: const MaterialApp(home: LoginScreen()),
    ));
    await tester.pump();

    for (final label in [
      'Patient Portal',
      'Hospital Portal',
      'Doctor Portal',
      'Ambulance Driver Portal',
      'Admin Portal',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('Sign Up'), findsOneWidget);

    await tester.tap(find.text('Doctor Portal'));
    await tester.pump();
    expect(find.textContaining('authorized hospital or administrator'),
        findsOneWidget);

    await tester.tap(find.text('Ambulance Driver Portal'));
    await tester.pump();
    expect(find.textContaining('mobile number and the initial password'),
        findsOneWidget);
    expect(find.text('Activate hospital driver invitation'), findsNothing);
    expect(find.text('Private Ambulance Registration'), findsOneWidget);

    await tester.tap(find.text('Admin Portal'));
    await tester.pump();
    expect(find.textContaining('provisioned securely'), findsOneWidget);
    expect(find.text('Sign Up'), findsNothing);
  });

  testWidgets(
      'redesigned login stays within mobile through wide desktop widths',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthProvider();
    addTearDown(auth.dispose);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;

    for (final size in const [
      Size(360, 800),
      Size(390, 844),
      Size(430, 932),
      Size(768, 1024),
      Size(1024, 768),
      Size(1366, 768),
      Size(1440, 900),
      Size(1920, 1080),
    ]) {
      tester.view.physicalSize = size;
      await tester.pumpWidget(ChangeNotifierProvider<AuthProvider>.value(
        value: auth,
        child: MaterialApp(theme: AppTheme.light, home: const LoginScreen()),
      ));
      await tester.pump();
      expect(find.text('Welcome back'), findsOneWidget,
          reason: 'viewport: $size');
      final layoutError = tester.takeException();
      if (layoutError != null) debugPrint('$layoutError');
      expect(layoutError, isNull, reason: 'viewport: $size');
    }
  });

  testWidgets(
      'landing portal sign-in section adapts to the full viewport matrix',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthProvider();
    addTearDown(auth.dispose);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;

    for (final size in const [
      Size(360, 800),
      Size(390, 844),
      Size(430, 932),
      Size(768, 1024),
      Size(1024, 768),
      Size(1366, 768),
      Size(1440, 900),
      Size(1920, 1080),
    ]) {
      tester.view.physicalSize = size;
      await tester.pumpWidget(ChangeNotifierProvider<AuthProvider>.value(
        value: auth,
        child: MaterialApp(theme: AppTheme.light, home: const LandingScreen()),
      ));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(size.width < 600
          ? find.byTooltip('Access Dashboard')
          : find.text('Access Dashboard'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 900));
      expect(find.text('Sign In'), findsOneWidget, reason: 'viewport: $size');
      final layoutError = tester.takeException();
      if (layoutError != null) debugPrint('$layoutError');
      expect(layoutError, isNull, reason: 'viewport: $size');
    }
  });
}
