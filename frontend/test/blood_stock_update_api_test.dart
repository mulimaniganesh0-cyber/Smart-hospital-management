import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_resource_management/services/api_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('blood stock update replaces stock through the PUT endpoint', () async {
    SharedPreferences.setMockInitialValues({'token': 'test-token'});
    http.Request? captured;

    final result = await http.runWithClient(
      () => ApiService.updateBloodStock(
        bloodGroup: 'A+ve',
        units: 15,
        expiryDate: '2026-12-05',
        batchId: 51,
      ),
      () => MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({'success': true}),
          200,
          headers: const {'content-type': 'application/json'},
        );
      }),
    );

    expect(result['success'], isTrue);
    expect(captured?.method, 'PUT');
    expect(captured?.url.path,
        '${Uri.parse(ApiService.baseUrl).path}/blood-bank/stock');
    expect(jsonDecode(captured!.body), {
      'blood_group': 'A+',
      'units': 15,
      'expiry_date': '2026-12-05',
      'batch_id': 51,
    });
    expect(captured?.headers.keys, contains('Authorization'));
  });

  test('Add Stock uses a separate additive POST and canonical A+ spelling',
      () async {
    SharedPreferences.setMockInitialValues({'token': 'test-token'});
    http.Request? captured;

    final result = await http.runWithClient(
      () => ApiService.addBloodStock(
        bloodGroup: 'A+ve',
        units: 10,
        expiryDate: '2027-01-10',
      ),
      () => MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({'success': true}),
          201,
          headers: const {'content-type': 'application/json'},
        );
      }),
    );

    expect(result['success'], isTrue);
    expect(captured?.method, 'POST');
    expect(captured?.url.path,
        '${Uri.parse(ApiService.baseUrl).path}/blood-bank/add-expiry');
    expect(jsonDecode(captured!.body), {
      'blood_group': 'A+',
      'units': 10,
      'expiry_date': '2027-01-10',
    });
  });
}
