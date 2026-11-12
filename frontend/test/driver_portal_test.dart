import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_resource_management/providers/auth_provider.dart';
import 'package:hospital_resource_management/screens/driver/ambulance_driver_dashboard.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Map<String, dynamic> value, {int status = 200}) =>
    http.Response(jsonEncode(value), status,
        headers: {'content-type': 'application/json'});

http.Client _successfulDriverApi() => MockClient((request) async {
      if (request.url.path.endsWith('/driver/profile')) {
        return _json({
          'success': true,
          'data': {
            'id': 8,
            'name': 'Test Driver',
            'email': 'driver@example.test',
            'phone': '9000000000',
            'hospital_name': 'Test Hospital',
            'ambulance_id': 5,
            'vehicle_number': 'KA-01-AB-1234',
            'ambulance_type': 'Advanced Life Support',
            'ambulance_status': 'AVAILABLE',
            'is_available': true,
            'active_assignment_count': 0,
            'completed_trips_today': 0,
          }
        });
      }
      if (request.url.path.endsWith('/driver/assignments')) {
        return _json({'success': true, 'data': []});
      }
      if (request.url.path.endsWith('/driver/history')) {
        return _json({
          'success': true,
          'data': [],
          'pagination': {'page': 1, 'limit': 20, 'total': 0}
        });
      }
      if (request.url.path.endsWith('/notifications')) {
        return _json({'success': true, 'data': [], 'unread_count': 0});
      }
      return _json({'success': false, 'message': 'Unexpected test request'},
          status: 404);
    });

Future<void> _pumpDriverPortal(WidgetTester tester) async {
  final auth = AuthProvider();
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: const MaterialApp(home: AmbulanceDriverDashboard()),
    ),
  );
  await tester.pumpAndSettle();
  addTearDown(auth.dispose);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('driver can open all portal sections and profile',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1200, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await http.runWithClient(() async {
      await _pumpDriverPortal(tester);
      expect(find.textContaining('Test Driver'), findsOneWidget);

      await tester.tap(find.text('Emergencies'));
      await tester.pumpAndSettle();
      expect(find.text('No assignments right now'), findsOneWidget);

      await tester.tap(find.text('Active Trip'));
      await tester.pumpAndSettle();
      expect(find.text('No active trip'), findsOneWidget);

      await tester.tap(find.text('Ambulance'));
      await tester.pumpAndSettle();
      expect(find.text('KA-01-AB-1234'), findsOneWidget);

      await tester.tap(find.text('Trip History'));
      await tester.pumpAndSettle();
      expect(find.text('No trip history yet'), findsOneWidget);

      await tester.tap(find.text('Notifications'));
      await tester.pumpAndSettle();
      expect(find.text('No notifications'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.account_circle_outlined));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Profile and settings').last);
      await tester.pumpAndSettle();
      expect(find.text('Your driver account is managed by your hospital.'),
          findsOneWidget);
    }, _successfulDriverApi);
  });

  testWidgets('driver portal shows a retry state when the backend is offline',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await http.runWithClient(() async {
      await tester.pumpWidget(
        ChangeNotifierProvider<AuthProvider>.value(
          value: AuthProvider(),
          child: const MaterialApp(home: AmbulanceDriverDashboard()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_outlined), findsOneWidget);
    },
        () => MockClient((_) async => _json(
            {'success': false, 'message': 'Network unavailable'},
            status: 503)));
  });
}
