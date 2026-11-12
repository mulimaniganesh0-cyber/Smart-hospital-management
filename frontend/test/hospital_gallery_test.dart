import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_resource_management/models/hospital_model.dart';
import 'package:hospital_resource_management/screens/hospital/hospital_gallery.dart';
import 'package:hospital_resource_management/screens/patient/patient_nearby_hospitals.dart';
import 'package:hospital_resource_management/services/api_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Map<String, dynamic> value) => http.Response(
      jsonEncode(value),
      200,
      headers: {'content-type': 'application/json'},
    );

Hospital _hospital() => Hospital.fromJson({
      'id': 5,
      'name': 'CareSync Test Hospital',
      'address': '10 Health Road',
      'city': 'Bengaluru',
      'is_verified': true,
      'total_beds': 10,
      'available_beds': 2,
      'icu_beds': 2,
      'available_icu': 1,
      'ventilator_count': 1,
      'available_ventilators': 1,
      'oxygen_beds_total': 1,
      'oxygen_beds_available': 1,
      'blood_units': 0,
      'specialties': <String>[],
      'emergency_services': true,
    });

http.Client _patientClient({required List<Map<String, dynamic>> photos}) =>
    MockClient((request) async {
      if (request.url.path.endsWith('/hospitals/5/photos')) {
        return _json({'success': true, 'data': photos});
      }
      if (request.url.path.endsWith('/resources/hospital/5/resources')) {
        return _json({'success': true, 'data': {}});
      }
      if (request.url.path.endsWith('/blood-bank/5')) {
        return _json({'success': true, 'data': []});
      }
      if (request.url.path.endsWith('/hospitals/5/doctors')) {
        return _json({'success': true, 'data': []});
      }
      return _json({'success': false, 'data': []});
    });

Future<void> _pumpAsyncWork(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('patient sees a clear empty gallery when no photos are published',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await http.runWithClient(() async {
      await tester.pumpWidget(
          MaterialApp(home: HospitalDetailScreen(hospital: _hospital())));
      await _pumpAsyncWork(tester);
      expect(find.text('Hospital photos'), findsOneWidget);
      expect(find.text('No hospital photos have been published yet.'),
          findsOneWidget);
      expect(find.text('RESOURCE AVAILABILITY'), findsOneWidget);
      expect(find.text('Book Appointment'), findsOneWidget);
    }, () => _patientClient(photos: []));
  });

  testWidgets('patient can open and swipe the full-size published photo viewer',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final photos = [
      {
        'id': 2,
        'hospital_id': 5,
        'caption': 'Main entrance',
        'category': 'entrance',
        'image_url': '/api/hospitals/5/photos/2/image',
        'thumbnail_url': '/api/hospitals/5/photos/2/image?size=thumbnail'
      },
      {
        'id': 3,
        'hospital_id': 5,
        'caption': 'General ward',
        'category': 'ward',
        'image_url': '/api/hospitals/5/photos/3/image',
        'thumbnail_url': '/api/hospitals/5/photos/3/image?size=thumbnail'
      },
    ];
    await http.runWithClient(() async {
      await tester.pumpWidget(
          MaterialApp(home: HospitalDetailScreen(hospital: _hospital())));
      await _pumpAsyncWork(tester);
      expect(find.text('Main entrance'), findsOneWidget);
      await tester.ensureVisible(find.text('Main entrance'));
      await tester.tap(find.text('Main entrance'));
      await _pumpAsyncWork(tester);
      expect(find.text('CareSync Test Hospital'), findsOneWidget);
      expect(find.text('1 / 2'), findsOneWidget);
      await tester.drag(find.byType(PageView), const Offset(-500, 0));
      await _pumpAsyncWork(tester);
      expect(find.text('2 / 2'), findsOneWidget);
      expect(find.text('General ward'), findsOneWidget);
    }, () => _patientClient(photos: photos));
  });

  testWidgets('hospital staff can preview gallery controls and publish a draft',
      (tester) async {
    SharedPreferences.setMockInitialValues({'token': 'test-token'});
    var published = false;
    var photoGets = 0;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/hospitals/gallery/manage')) {
        photoGets++;
        return _json({
          'success': true,
          'max_photos': 100,
          'data': [
            {
              'id': 8,
              'hospital_id': 5,
              'caption': 'ICU',
              'category': 'icu',
              'display_order': 0,
              'is_cover': false,
              'is_published': published,
              'thumbnail_url': '/api/hospitals/5/photos/8/image?size=thumbnail',
              'image_url': '/api/hospitals/5/photos/8/image'
            },
          ]
        });
      }
      if (request.url.path.endsWith('/hospitals/gallery/photos/8') &&
          request.method == 'PUT') {
        published = jsonDecode(request.body)['is_published'] == true;
        return _json({'success': true});
      }
      return _json({'success': false, 'message': 'Unexpected request'});
    });
    await http.runWithClient(() async {
      tester.view.physicalSize = const Size(1100, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const MaterialApp(home: HospitalGallery()));
      await _pumpAsyncWork(tester);
      expect(find.text('Choose photos'), findsOneWidget);
      expect(find.text('Upload drafts'), findsOneWidget);
      expect(find.text('ICU'), findsOneWidget);
      expect(find.text('Unpublished'), findsOneWidget);
      await tester.tap(find.byType(SwitchListTile).first);
      await _pumpAsyncWork(tester);
      expect(published, isTrue);
      expect(photoGets, greaterThanOrEqualTo(2));
      expect(find.text('Published'), findsOneWidget);
    }, () => client);
  });

  testWidgets('hospital manager shows retry when the gallery endpoint fails',
      (tester) async {
    await http.runWithClient(() async {
      await tester.pumpWidget(const MaterialApp(home: HospitalGallery()));
      await _pumpAsyncWork(tester);
      expect(find.text('Retry'), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_outlined), findsOneWidget);
    },
        () => MockClient(
            (_) async => _json({'success': false, 'message': 'Unavailable'})));
  });

  test('gallery URL resolver respects the configured API base path', () {
    final uri =
        ApiService.resolveHospitalPhotoUrl('/api/hospitals/5/photos/8/image');
    expect(uri.path, endsWith('/api/hospitals/5/photos/8/image'));
  });
}
