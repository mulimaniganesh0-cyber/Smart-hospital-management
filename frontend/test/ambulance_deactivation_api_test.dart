import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_resource_management/services/api_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('hospital deactivation calls the guarded PUT endpoint', () async {
    SharedPreferences.setMockInitialValues({'token': 'test-token'});
    http.Request? captured;

    final result = await http.runWithClient(() async {
      return ApiService.deactivateHospitalAmbulance(36);
    },
        () => MockClient((request) async {
              captured = request;
              return http.Response(
                jsonEncode({'success': true}),
                200,
                headers: const {'content-type': 'application/json'},
              );
            }));

    expect(result['success'], isTrue);
    expect(captured?.method, 'PUT');
    expect(
      captured?.url.path,
      '${Uri.parse(ApiService.baseUrl).path}/ambulance/36/deactivate',
    );
    expect(captured?.headers.keys, contains('Authorization'));
  });
}
