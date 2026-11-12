import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_resource_management/providers/auth_provider.dart';
import 'package:hospital_resource_management/providers/hospital_provider.dart';
import 'package:hospital_resource_management/providers/patient_provider.dart';
import 'package:hospital_resource_management/screens/admin/admin_home_screen.dart';
import 'package:hospital_resource_management/screens/doctor/doctor_dashboard_screen.dart';
import 'package:hospital_resource_management/screens/driver/ambulance_driver_dashboard.dart';
import 'package:hospital_resource_management/screens/hospital/hospital_home_screen.dart';
import 'package:hospital_resource_management/screens/hospital/hospital_resources.dart';
import 'package:hospital_resource_management/screens/patient/patient_home_screen.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Map<String, dynamic> body) => http.Response(
      jsonEncode(body),
      200,
      headers: const {'content-type': 'application/json'},
    );

http.Client _client() => MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/medical/health-summary')) {
        return _json({
          'success': true,
          'data': {'record_counts': <dynamic>[]}
        });
      }
      if (path.endsWith('/hospitals/dashboard-stats')) {
        return _json({'success': true, 'data': <String, dynamic>{}});
      }
      if (path.endsWith('/patients/profile')) {
        return _json({
          'success': true,
          'data': {
            'id': 12,
            'name': 'Test Patient',
            'bookings': [],
            'medical_history': []
          }
        });
      }
      if (path.endsWith('/hospitals/profile')) {
        return _json({
          'success': true,
          'data': {
            'id': 15,
            'name': 'Test Hospital',
            'resources': {
              'generalBeds': {'total': 100, 'available': 79},
              'icuBeds': {'total': 10, 'available': 0},
              'ventilators': {'total': 4, 'available': 1},
              'oxygenBeds': {'total': 24, 'available': 19},
            }
          }
        });
      }
      if (path.endsWith('/doctor/profile') ||
          path.endsWith('/driver/profile')) {
        return _json({
          'success': true,
          'data': <String, dynamic>{
            'name': 'Test User',
            'availability_status': true
          }
        });
      }
      if (path.endsWith('/doctor/appointment-schedule')) {
        return _json({'success': true, 'schedules': <dynamic>[]});
      }
      if (path.endsWith('/admin/dashboard/stats')) {
        return _json({
          'success': true,
          'data': <String, dynamic>{
            'total_hospitals': 1,
            'pending_verification': 0,
            'total_users': 1,
            'active_emergencies': 0
          }
        });
      }
      return _json({
        'success': true,
        'data': <dynamic>[],
        'stats': <String, dynamic>{},
        'schedules': <dynamic>[],
        'assignments': <dynamic>[],
        'notifications': <dynamic>[],
        'qr': null,
      });
    });

Widget _app(Widget screen) => MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => PatientProvider()),
        ChangeNotifierProvider(create: (_) => HospitalProvider()),
      ],
      child: MaterialApp(home: screen),
    );

Future<void> _pumpAt(
  WidgetTester tester,
  Widget screen,
  double width,
  double height,
) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  await tester.pumpWidget(_app(screen));
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  final exception = tester.takeException();
  if (exception != null) {
    debugPrint(exception is FlutterError
        ? exception.toStringDeep()
        : exception.toString());
  }
  expect(exception, isNull);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'patient portal initializes and lays out at mobile, tablet, and desktop sizes',
      (tester) async {
    await http.runWithClient(() async {
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
        await _pumpAt(
            tester, const PatientHomeScreen(), size.width, size.height);
        expect(find.text('Latest appointment'), findsOneWidget,
            reason: 'patient dashboard at ${size.width}x${size.height}');
      }
    }, _client);
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  testWidgets(
      'hospital navigation stays within short desktop heights and keeps all destinations',
      (tester) async {
    await http.runWithClient(() async {
      for (final size in const [
        Size(1024, 768),
        Size(1366, 768),
        Size(1440, 900),
        Size(1920, 1080)
      ]) {
        await _pumpAt(
            tester, const HospitalHomeScreen(), size.width, size.height);
        for (final destination in const [
          'Dashboard',
          'Resources',
          'Appointments',
          'Staff',
          'Ambulances',
          'Blood bank',
          'Campaigns',
          'Requests',
          'Profile',
          'Gallery',
        ]) {
          expect(find.text(destination), findsWidgets,
              reason: 'hospital destination "$destination" at '
                  '${size.width}x${size.height}');
        }
      }
      for (final size in const [
        Size(360, 800),
        Size(390, 844),
        Size(430, 932),
        Size(768, 1024)
      ]) {
        await _pumpAt(
            tester, const HospitalHomeScreen(), size.width, size.height);
        await tester.tap(find.text('More'));
        await tester.pumpAndSettle();
        for (final destination in const [
          'Staff',
          'Ambulances',
          'Blood bank',
          'Campaigns',
          'Hospital profile',
          'Gallery',
        ]) {
          expect(find.text(destination), findsWidgets,
              reason: 'hospital More destination "$destination" at '
                  '${size.width}x${size.height}');
        }
        await tester.tap(find.text('Gallery'));
        await tester.pump(const Duration(milliseconds: 100));
        final exception = tester.takeException();
        if (exception != null) {
          debugPrint(exception is FlutterError
              ? exception.toStringDeep()
              : exception.toString());
        }
        expect(exception, isNull);
      }
    }, _client);
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  testWidgets(
      'hospital resource cards lay out once with zero and nonzero availability',
      (tester) async {
    await http.runWithClient(() async {
      for (final size in const [
        Size(360, 800),
        Size(390, 844),
        Size(430, 932),
        Size(768, 1024),
        Size(1024, 768),
        Size(1366, 768),
        Size(1440, 900),
        Size(1920, 1080)
      ]) {
        await _pumpAt(
            tester, const HospitalResources(), size.width, size.height);
        expect(find.text('General Beds'), findsOneWidget);
        expect(find.text('ICU Beds'), findsOneWidget);
        expect(find.text('Ventilators'), findsOneWidget);
        expect(find.text('Oxygen Supported Beds'), findsOneWidget);
        expect(find.text('0'), findsWidgets);
      }
    }, _client);
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  testWidgets(
      'doctor, driver, and admin dashboards perform layout at desktop and mobile sizes',
      (tester) async {
    await http.runWithClient(() async {
      final screens = <Widget>[
        const DoctorDashboardScreen(),
        const AmbulanceDriverDashboard(),
        const AdminHomeScreen(),
      ];
      for (final screen in screens) {
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
          await _pumpAt(tester, screen, size.width, size.height);
        }
      }
    }, _client);
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}
