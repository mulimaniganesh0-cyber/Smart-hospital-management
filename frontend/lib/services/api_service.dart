import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class ApiService {
  // Override at build time, for example:
  // --dart-define=API_BASE_URL=http://10.0.2.2:5001/api
  static String get baseUrl => AppConfig.apiBaseUrl;

  static String get socketUrl => AppConfig.socketUrl;

  static String canonicalBloodGroup(String value) {
    final compact =
        value.trim().toUpperCase().replaceAll(RegExp(r'[\s._]'), '');
    const bases = ['A', 'B', 'AB', 'O'];
    for (final base in bases) {
      if (!compact.startsWith(base)) continue;
      final suffix = compact.substring(base.length);
      if (['+', '+VE', 'PLUS', 'POS', 'POSITIVE'].contains(suffix)) {
        return '$base+';
      }
      if (['-', '-VE', 'MINUS', 'NEG', 'NEGATIVE'].contains(suffix)) {
        return '$base-';
      }
    }
    return value.trim();
  }

  static Map<String, dynamic> _canonicalBloodPayload(
      Map<String, dynamic> payload) {
    final result = Map<String, dynamic>.from(payload);
    if (result['blood_group'] is String) {
      result['blood_group'] =
          canonicalBloodGroup(result['blood_group'] as String);
    }
    return result;
  }

  // A missing local backend otherwise lets the platform socket wait for a long
  // time before failing, which makes the sign-in button appear frozen.
  static const Duration _authenticationTimeout = Duration(seconds: 12);
  static const Duration _referenceCacheTtl = Duration(minutes: 10);
  static Map<String, dynamic>? _specialtiesCache;
  static DateTime? _specialtiesCachedAt;
  static Future<Map<String, dynamic>>? _specialtiesRequest;

  static Future<Map<String, String>> _getHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    // Do not send the literal value "Bearer null". Authenticated endpoints
    // will correctly return 401 when there is no signed-in user.
    if (token?.isNotEmpty == true) headers['Authorization'] = 'Bearer $token';
    return headers;
  }

  // ==================== DIGITAL QUEUES ====================
  // Token numbers are assigned by the server inside a database transaction.
  // The app never calculates a token number locally.
  static Future<Map<String, dynamic>> getMyQueueTokens() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/queues/my-tokens'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> joinHospitalQueue(
      Map<String, dynamic> queue) async {
    try {
      final created = await http.post(Uri.parse('$baseUrl/queues'),
          headers: await _getHeaders(), body: json.encode(queue));
      final data = json.decode(created.body) as Map<String, dynamic>;
      if (data['success'] != true) return data;
      final queueId = (data['data'] as Map<String, dynamic>)['id'];
      final token = await http.post(
          Uri.parse('$baseUrl/queues/$queueId/tokens'),
          headers: await _getHeaders(),
          body: json.encode({'source': 'ONLINE'}));
      return json.decode(token.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateQueueToken(
      int tokenId, String status) async {
    try {
      final response = await http.post(
          Uri.parse('$baseUrl/queues/tokens/$tokenId/transition'),
          headers: await _getHeaders(),
          body: json.encode({'status': status}));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> validateHospitalQr(String payload) async {
    try {
      final response = await http.post(Uri.parse('$baseUrl/queues/validate-qr'),
          headers: await _getHeaders(),
          body: json.encode({'payload': payload}));
      return json.decode(response.body);
    } catch (_) {
      return {
        'success': false,
        'message': 'Unable to connect to the hospital server.'
      };
    }
  }

  static Future<Map<String, dynamic>> bookScannedQueueToken(
      int queueId, String qrPayload) async {
    try {
      final response = await http.post(
          Uri.parse('$baseUrl/queues/$queueId/tokens'),
          headers: await _getHeaders(),
          body: json.encode({'source': 'QR', 'qr_payload': qrPayload}));
      return json.decode(response.body);
    } catch (_) {
      return {
        'success': false,
        'message': 'Unable to connect to the hospital server.'
      };
    }
  }

  static Future<Map<String, dynamic>> getTodayHospitalQr() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/hospitals/daily-qr'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getHospitalQueues() async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/queues/hospital/current'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> callNextQueueToken(int queueId) async {
    try {
      final response = await http.post(
          Uri.parse('$baseUrl/queues/$queueId/call-next'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> queueStaffAction(
      int tokenId, String action) async {
    try {
      final response = await http.post(
          Uri.parse('$baseUrl/queues/tokens/$tokenId/action'),
          headers: await _getHeaders(),
          body: json.encode({'action': action}));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== MEDICAL RECORDS ====================

  static Future<Map<String, dynamic>> getMedicalOnboardingStatus() async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/medical/onboarding-status'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> saveMedicalProfile(
      Map<String, dynamic> profile) async {
    try {
      final response = await http.put(Uri.parse('$baseUrl/medical/profile'),
          headers: await _getHeaders(), body: json.encode(profile));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getMedicalTimeline(int patientId,
      {String? type, String? search}) async {
    try {
      final query = <String, String>{};
      if (type?.isNotEmpty == true) query['type'] = type!;
      if (search?.isNotEmpty == true) query['search'] = search!;
      final response = await http.get(
          Uri.parse('$baseUrl/medical/patients/$patientId/timeline')
              .replace(queryParameters: query.isEmpty ? null : query),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getHealthSummary() async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/medical/health-summary'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> createMedicalRecord(
      Map<String, dynamic> record) async {
    try {
      final response = await http.post(Uri.parse('$baseUrl/medical/records'),
          headers: await _getHeaders(), body: json.encode(record));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateHealthRecord(
      int recordId, Map<String, dynamic> record) async {
    try {
      final response = await http.put(
          Uri.parse('$baseUrl/medical/health-records/$recordId'),
          headers: await _getHeaders(),
          body: json.encode(record));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> removeHealthRecord(int recordId,
      {String? reason}) async {
    try {
      final response = await http.delete(
          Uri.parse('$baseUrl/medical/health-records/$recordId'),
          headers: await _getHeaders(),
          body: json.encode({'reason': reason}));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== AUTH ENDPOINTS ====================
  static Future<Map<String, dynamic>> register(
      Map<String, dynamic> userData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(userData),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> login(
      String email, String password) async {
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({
              'email': email,
              'password': password,
            }),
          )
          .timeout(_authenticationTimeout);

      final data = json.decode(response.body);
      if (response.statusCode == 200 && data['success'] == true) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('token', data['token']);
        await prefs.setString('user', json.encode(data['user']));
      }
      return data;
    } on TimeoutException {
      return {
        'success': false,
        'message':
            'Unable to reach the server. Check that the backend is running and the API address is correct.',
      };
    } on http.ClientException catch (_) {
      return {
        'success': false,
        'message':
            'Unable to connect to the server. Check your network and API address.',
      };
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getProfile() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/auth/profile'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== DOCTOR PORTAL ====================
  static Future<Map<String, dynamic>> getDoctorProfile() =>
      _doctorGet('/profile');
  static Future<Map<String, dynamic>> getDoctorAppointments(
          {int offset = 0, int limit = 25}) =>
      _doctorGet('/appointments?offset=$offset&limit=$limit');
  static Future<Map<String, dynamic>> getDoctorPatients() =>
      _doctorGet('/patients');
  static Future<Map<String, dynamic>> getDoctorReports() =>
      _doctorGet('/reports');
  static Future<Map<String, dynamic>> setDoctorAvailability(bool available) =>
      _doctorPut('/availability', {'is_available': available});
  static Future<Map<String, dynamic>> getDoctorAppointmentSchedule() =>
      _doctorGet('/appointment-schedule');
  static Future<Map<String, dynamic>> updateDoctorAppointment(
          int id, String status) =>
      _doctorPut('/appointments/$id/status', {'status': status});
  static Future<Map<String, dynamic>> startDoctorConsultation(int id) async {
    try {
      final r = await http
          .post(
              Uri.parse('$baseUrl/doctor/appointments/$id/consultation/start'),
              headers: await _getHeaders())
          .timeout(_authenticationTimeout);
      return json.decode(r.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getDoctorConsultationContext(
          int appointmentId) =>
      _doctorGet('/appointments/$appointmentId/consultation-context');

  static Future<Map<String, dynamic>> getHospitalDoctorSchedule(
      int doctorId) async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/appointments/doctor-schedules/$doctorId'),
              headers: await _getHeaders())
          .timeout(_authenticationTimeout);
      debugPrint(
          '[AVAILABILITY] GET doctor-schedules/$doctorId status=${response.statusCode} body=${response.body}');
      final decoded = json.decode(response.body);
      if (decoded is Map<String, dynamic>) return decoded;
      return {
        'success': false,
        'message': 'Unexpected appointment schedule response'
      };
    } catch (e) {
      debugPrint('[AVAILABILITY] GET doctor-schedules/$doctorId failed: $e');
      return {
        'success': false,
        'message': 'Unable to load appointment schedule: $e'
      };
    }
  }

  static Future<Map<String, dynamic>> saveHospitalDoctorSchedule(
      int doctorId, List<Map<String, dynamic>> schedules) async {
    try {
      final response = await http
          .put(Uri.parse('$baseUrl/appointments/doctor-schedules/$doctorId'),
              headers: await _getHeaders(),
              body: json.encode({'schedules': schedules}))
          .timeout(_authenticationTimeout);
      debugPrint(
          '[AVAILABILITY] PUT doctor-schedules/$doctorId status=${response.statusCode} body=${response.body}');
      final decoded = json.decode(response.body);
      if (decoded is Map<String, dynamic>) return decoded;
      return {
        'success': false,
        'message': 'Unexpected appointment schedule response'
      };
    } catch (e) {
      debugPrint('[AVAILABILITY] PUT doctor-schedules/$doctorId failed: $e');
      return {
        'success': false,
        'message': 'Unable to save appointment schedule: $e'
      };
    }
  }

  static Future<Map<String, dynamic>> createPrescription(
      int appointmentId, List<Map<String, dynamic>> medications,
      {String? instructions}) async {
    try {
      final r = await http
          .post(Uri.parse('$baseUrl/medical/prescriptions'),
              headers: await _getHeaders(),
              body: json.encode({
                'appointment_id': appointmentId,
                'medications': medications,
                'instructions': instructions,
              }))
          .timeout(_authenticationTimeout);
      return json.decode(r.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> _doctorGet(String path) async {
    try {
      final r = await http
          .get(Uri.parse('$baseUrl/doctor$path'), headers: await _getHeaders())
          .timeout(_authenticationTimeout);
      return json.decode(r.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> _doctorPut(
      String path, Map<String, dynamic> body) async {
    try {
      final r = await http
          .put(Uri.parse('$baseUrl/doctor$path'),
              headers: await _getHeaders(), body: json.encode(body))
          .timeout(_authenticationTimeout);
      return json.decode(r.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> saveDoctorReport(
          int appointmentId, Map<String, dynamic> report,
          {bool publish = false}) =>
      _doctorPut('/appointments/$appointmentId/report',
          {...report, 'publish': publish});
  static Future<Map<String, dynamic>> saveDoctorPrescription(
          int appointmentId, List<Map<String, dynamic>> medications,
          {String? instructions, bool publish = false}) =>
      _doctorPut('/appointments/$appointmentId/prescription', {
        'medications': medications,
        'instructions': instructions,
        'publish': publish
      });

  static Future<Map<String, dynamic>> getFamilyMembers() async {
    try {
      final r = await http.get(Uri.parse('$baseUrl/family'),
          headers: await _getHeaders());
      return json.decode(r.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> addFamilyMember(
      int patientId, String relationship,
      {String permission = 'VIEW'}) async {
    try {
      final r = await http.post(Uri.parse('$baseUrl/family'),
          headers: await _getHeaders(),
          body: json.encode({
            'member_patient_id': patientId,
            'relationship': relationship,
            'permission': permission
          }));
      return json.decode(r.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> respondToFamilyRequest(
      int id, bool accept) async {
    try {
      final r = await http.put(Uri.parse('$baseUrl/family/$id/respond'),
          headers: await _getHeaders(), body: json.encode({'accept': accept}));
      return json.decode(r.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateProfile(
      Map<String, dynamic> updates) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/auth/profile'),
        headers: await _getHeaders(),
        body: json.encode(updates),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('user');
  }

  static Future<bool> forgotPassword(String email) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/forgot-password'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'email': email}),
      );
      final data = json.decode(response.body);
      return data['success'] ?? false;
    } catch (e) {
      return false;
    }
  }

  // ==================== HOSPITAL ENDPOINTS ====================

  static Future<Map<String, dynamic>> updateHospitalEntrance(
      int hospitalId, Map<String, dynamic> data) async {
    try {
      final response = await http.put(
          Uri.parse('$baseUrl/hospitals/$hospitalId'),
          headers: await _getHeaders(),
          body: json.encode(data));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateHospitalProfile(
      Map<String, dynamic> data) async {
    try {
      final response = await http
          .put(
            Uri.parse('$baseUrl/hospitals/profile'),
            headers: await _getHeaders(),
            body: json.encode(data),
          )
          .timeout(_authenticationTimeout);
      final decoded = json.decode(response.body);
      return decoded is Map<String, dynamic>
          ? decoded
          : {'success': false, 'message': 'Unexpected profile response'};
    } catch (error) {
      return {'success': false, 'message': 'Unable to update profile: $error'};
    }
  }

  static Future<Map<String, dynamic>> updateHospitalResources(
      Map<String, dynamic> resources) async {
    try {
      final payload = {};
      final fieldMap = {
        'generalBeds_total': 'generalBeds_total',
        'generalBeds_available': 'generalBeds_available',
        'icuBeds_total': 'icuBeds_total',
        'icuBeds_available': 'icuBeds_available',
        'ventilators_total': 'ventilators_total',
        'ventilators_available': 'ventilators_available',
      };

      for (final entry in resources.entries) {
        final key = entry.key;
        final value = entry.value;
        final mappedKey = fieldMap[key] ?? key;
        payload[mappedKey] = value;
      }

      final response = await http.put(
        Uri.parse('$baseUrl/hospitals/resources'),
        headers: await _getHeaders(),
        body: json.encode(payload),
      );

      debugPrint('Update resources response: ${response.statusCode}');

      final data = json.decode(response.body);
      return {
        'success': response.statusCode == 200 && (data['success'] ?? false),
        'message': data['message'] ?? 'Update completed',
        'data': data['data'],
      };
    } catch (e) {
      debugPrint('Update resources error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== PATIENT ENDPOINTS ====================
  static Future<Map<String, dynamic>> getPatientProfile() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/patients/profile'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updatePatientProfile(
      Map<String, dynamic> updates) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/patients/profile'),
        headers: await _getHeaders(),
        body: json.encode(updates),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getEmergencyContact() async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/patients/profile/emergency-contact'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateEmergencyContact(
      Map<String, dynamic> contact) async {
    try {
      final response = await http.put(
          Uri.parse('$baseUrl/patients/profile/emergency-contact'),
          headers: await _getHeaders(),
          body: json.encode(contact));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getNotifications(
      {bool unreadOnly = false}) async {
    try {
      final response = await http.get(
          Uri.parse(
              '$baseUrl/notifications${unreadOnly ? '?unread=true' : ''}'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e', 'data': []};
    }
  }

  static Future<Map<String, dynamic>> markNotificationRead(
      int notificationId) async {
    try {
      final response = await http.put(
          Uri.parse('$baseUrl/notifications/$notificationId/read'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getMedicalHistory() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/patients/medical-history'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getMyAppointments() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/appointments/my-appointments'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getHospitalAppointments() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/appointments/hospital-appointments'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> updateAppointmentStatus(
      int appointmentId, String status) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/appointments/$appointmentId/status'),
        headers: await _getHeaders(),
        body: json.encode({'status': status}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> cancelAppointment(
      int appointmentId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/appointments/$appointmentId/cancel'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== EMERGENCY ENDPOINTS ====================
  static Future<Map<String, dynamic>> createEmergencyRequest(
      Map<String, dynamic> emergencyData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/emergency/create'),
        headers: await _getHeaders(),
        body: json.encode(emergencyData),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> triggerEmergencySos(
      Map<String, dynamic> sosData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/emergency/sos'),
        headers: await _getHeaders(),
        body: json.encode(sosData),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateEmergencyLiveLocation({
    required int emergencyId,
    required double latitude,
    required double longitude,
    double? accuracy,
    DateTime? timestamp,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/emergency/location-update'),
        headers: await _getHeaders(),
        body: json.encode({
          'emergencyId': emergencyId,
          'location_lat': latitude,
          'location_lng': longitude,
          'location_accuracy': accuracy,
          'location_timestamp':
              (timestamp ?? DateTime.now()).toUtc().toIso8601String(),
        }),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateBookingPatientLocation(
      {required int bookingId,
      required double latitude,
      required double longitude,
      double? accuracy,
      DateTime? timestamp}) async {
    try {
      final response = await http
          .post(Uri.parse('$baseUrl/ambulance/booking/location-update'),
              headers: await _getHeaders(),
              body: json.encode({
                'booking_id': bookingId,
                'latitude': latitude,
                'longitude': longitude,
                'accuracy': accuracy,
                'timestamp': (timestamp ?? DateTime.now()).toIso8601String()
              }))
          .timeout(_authenticationTimeout);
      return json.decode(response.body) as Map<String, dynamic>;
    } catch (error) {
      return {'success': false, 'message': 'Network error: $error'};
    }
  }

  static Future<Map<String, dynamic>> registerPrivateDriver(
      Map<String, dynamic> data) async {
    try {
      final response = await http
          .post(Uri.parse('$baseUrl/auth/drivers/private-registration'),
              headers: await _getHeaders(), body: json.encode(data))
          .timeout(_authenticationTimeout);
      return json.decode(response.body) as Map<String, dynamic>;
    } catch (error) {
      return {'success': false, 'message': 'Network error: $error'};
    }
  }

  static Future<Map<String, dynamic>> createHospitalDriver(
          Map<String, dynamic> data) async =>
      _onboardingRequest('POST', '$baseUrl/roles/drivers', data);
  static Future<Map<String, dynamic>> getHospitalDrivers() async =>
      _onboardingRequest('GET', '$baseUrl/roles/drivers');
  static Future<Map<String, dynamic>> updateHospitalDriverDetails(
          int id, Map<String, dynamic> data) async =>
      _onboardingRequest('PUT', '$baseUrl/roles/drivers/$id', data);
  static Future<Map<String, dynamic>> updateHospitalDriver(
          int id, String status) async =>
      _onboardingRequest(
          'PUT', '$baseUrl/roles/drivers/$id/status', {'status': status});
  static Future<Map<String, dynamic>> resetHospitalDriverPassword(
          int id) async =>
      _onboardingRequest(
          'POST', '$baseUrl/roles/drivers/$id/password-reset', {});
  static Future<Map<String, dynamic>> reassignHospitalDriver(
          int id, int ambulanceId) async =>
      _onboardingRequest('PUT', '$baseUrl/roles/drivers/$id/ambulance',
          {'ambulance_id': ambulanceId});
  static Future<Map<String, dynamic>> getPrivateDriverApplications() async =>
      _onboardingRequest('GET', '$baseUrl/admin/drivers/private-applications');
  static Future<Map<String, dynamic>> reviewPrivateDriver(int id, String action,
          {String? notes}) async =>
      _onboardingRequest(
          'PUT',
          '$baseUrl/admin/drivers/private-applications/$id/review',
          {'action': action, 'notes': notes});

  static Future<Map<String, dynamic>> _onboardingRequest(
      String method, String url,
      [Map<String, dynamic>? data]) async {
    try {
      final headers = await _getHeaders();
      late http.Response response;
      final uri = Uri.parse(url);
      if (method == 'GET') {
        response = await http
            .get(uri, headers: headers)
            .timeout(_authenticationTimeout);
      } else if (method == 'PUT') {
        response = await http
            .put(uri, headers: headers, body: json.encode(data ?? {}))
            .timeout(_authenticationTimeout);
      } else {
        response = await http
            .post(uri, headers: headers, body: json.encode(data ?? {}))
            .timeout(_authenticationTimeout);
      }
      return json.decode(response.body) as Map<String, dynamic>;
    } catch (error) {
      return {'success': false, 'message': 'Network error: $error'};
    }
  }

  static Future<Map<String, dynamic>> getPatientSosHistory() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/emergency/patient-history'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> endEmergency(int emergencyId,
      {String status = 'completed'}) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/emergency/$emergencyId/end'),
        headers: await _getHeaders(),
        body: json.encode({'status': status}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getNearbyEmergencies(
      double lat, double lng,
      {double radius = 5}) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/emergency/nearby?lat=$lat&lng=$lng&radius=$radius'),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getHospitalEmergencies() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/emergency/hospital'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> updateEmergencyStatus(
      int emergencyId, String status) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/emergency/$emergencyId/status'),
        headers: await _getHeaders(),
        body: json.encode({'status': status}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> respondToSosDispatch(
      int emergencyId, String action,
      {String? rejectionReason}) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/emergency/$emergencyId/dispatch-response'),
        headers: await _getHeaders(),
        body: json.encode({
          'action': action,
          if (rejectionReason != null) 'rejection_reason': rejectionReason
        }),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getEmergencyDetails(
      int emergencyId) async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/emergency/$emergencyId'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> assignEmergencyAmbulance(
      int emergencyId, int ambulanceId) async {
    try {
      final response = await http.put(
          Uri.parse('$baseUrl/emergency/$emergencyId/ambulance'),
          headers: await _getHeaders(),
          body: json.encode({'ambulance_id': ambulanceId}));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== BLOOD BANK ENDPOINTS ====================

  static Future<Map<String, dynamic>> getAllBloodBanks({String? city}) async {
    try {
      String url = '$baseUrl/blood-bank/all';
      if (city != null) url += '?city=$city';

      final response = await http.get(Uri.parse(url));
      final data = json.decode(response.body);

      if (data['success'] && data['data'] != null) {
        final allBanks = <Map<String, dynamic>>[];
        final grouped = <String, List<Map<String, dynamic>>>{};

        data['data'].forEach((bloodGroup, banks) {
          grouped[bloodGroup] = List<Map<String, dynamic>>.from(banks);
          allBanks.addAll(List<Map<String, dynamic>>.from(banks));
        });

        return {
          'success': true,
          'data': grouped,
          'all_banks': allBanks,
        };
      }

      return data;
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== AMBULANCE ENDPOINTS ====================

  static Future<Map<String, dynamic>> registerAmbulance(
      Map<String, dynamic> ambulanceData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/ambulance/register'),
        headers: await _getHeaders(),
        body: json.encode(ambulanceData),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== ADMIN ENDPOINTS ====================
  static Future<Map<String, dynamic>> getDashboardStats() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/admin/dashboard/stats'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getAllUsers(
      {int page = 1, String? userType}) async {
    try {
      String url = '$baseUrl/admin/users?page=$page';
      if (userType != null) url += '&userType=$userType';

      final response = await http.get(
        Uri.parse(url),
        headers: await _getHeaders(),
      );

      debugPrint('Get all users response status: ${response.statusCode}');

      final data = json.decode(response.body);

      if (data['success'] == true && data['data'] != null) {
        return data;
      }

      return {
        'success': false,
        'data': [],
        'message': data['message'] ?? 'No data found'
      };
    } catch (e) {
      debugPrint('Get all users error: $e');
      return {'success': false, 'data': [], 'message': 'Network error: $e'};
    }
  }

  // ==================== RESOURCE REQUEST ENDPOINTS ====================

  static Future<Map<String, dynamic>> bookAmbulance(
      Map<String, dynamic> bookingData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/ambulance/book'),
        headers: await _getHeaders(),
        body: json.encode(bookingData),
      );

      debugPrint('Book ambulance response: ${response.statusCode}');

      final data = json.decode(response.body);

      if (data['success'] == true) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('ambulance_booking', json.encode(bookingData));
      }

      return data;
    } catch (e) {
      debugPrint('Book ambulance error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getNearbyAmbulances(
    double lat,
    double lng, {
    String? source,
    String? type,
    double radius = 10,
  }) async {
    try {
      String url = '$baseUrl/ambulance/nearby?lat=$lat&lng=$lng&radius=$radius';
      if (source != null) url += '&source=$source';
      if (type != null && type != 'All Types') url += '&type=$type';

      final response = await http.get(Uri.parse(url));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getResourceRequestStats() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/stats'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getPatientResourceRequests() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/my-requests'),
        headers: await _getHeaders(),
      );
      debugPrint('Get patient requests response: ${response.statusCode}');
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get patient requests error: $e');
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getResourceTypes() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/types'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> createBloodRequest(
      Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/resources/blood/request'),
        headers: await _getHeaders(),
        body: json.encode(_canonicalBloodPayload(data)),
      );
      debugPrint('Create blood request response: ${response.statusCode}');
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Create blood request error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getHospitalProfile() async {
    try {
      final headers = await _getHeaders();
      debugPrint('Requesting hospital profile with headers: ${headers.keys}');

      final response = await http.get(
        Uri.parse('$baseUrl/hospitals/profile'),
        headers: headers,
      );

      debugPrint('Hospital profile response status: ${response.statusCode}');

      if (response.statusCode == 401) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('token');
        await prefs.remove('user');
        return {
          'success': false,
          'message': 'Unauthorized. Please login again.'
        };
      }

      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get hospital profile error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getHospitalDashboardStats() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('$baseUrl/hospitals/dashboard-stats'),
        headers: headers,
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get hospital dashboard stats error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // ==================== CAREGUIDE CHATBOT ====================

  static Future<Map<String, dynamic>> queryChatbot(
      Map<String, dynamic> query) async {
    try {
      final endpoint = Uri.parse('$baseUrl/chatbot/query');
      final response = await http
          .post(
            endpoint,
            headers: await _getHeaders(),
            body: json.encode(query),
          )
          .timeout(const Duration(seconds: 50));
      final decoded = json.decode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Chatbot response must be a JSON object.');
      }
      return decoded;
    } catch (_) {
      return {
        'success': false,
        'error': 'CHATBOT_NETWORK_OR_PARSE_ERROR',
        'message': 'Network or response error. Please try again.'
      };
    }
  }

  static Future<Map<String, dynamic>> requestBlood(
      Map<String, dynamic> requestData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/resources/blood/request'),
        headers: await _getHeaders(),
        body: json.encode(_canonicalBloodPayload(requestData)),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getAllHospitals(
      {String? city,
      String? verified,
      String? search,
      String? specialty,
      bool? emergency,
      bool? icu,
      bool? beds,
      bool? bloodBank,
      int page = 1,
      int limit = 50}) async {
    try {
      final query = <String, String>{'page': '$page', 'limit': '$limit'};
      if (city?.isNotEmpty == true) query['city'] = city!;
      if (search?.isNotEmpty == true) query['search'] = search!;
      if (specialty?.isNotEmpty == true) query['specialty'] = specialty!;
      if (emergency == true) query['emergency'] = 'true';
      if (icu == true) query['icu'] = 'true';
      if (beds == true) query['beds'] = 'true';
      if (bloodBank == true) query['bloodBank'] = 'true';
      final response = await http
          .get(Uri.parse('$baseUrl/hospitals').replace(queryParameters: query));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getAppointmentSlots(
      int appointmentId, String date) async {
    try {
      final response = await http.get(
          Uri.parse(
              '$baseUrl/appointments/$appointmentId/available-slots?date=$date'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getDoctorAvailableSlots(
      int hospitalId, int doctorId, String date) async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/appointments/available-slots').replace(
              queryParameters: {
                'hospital_id': '$hospitalId',
                'doctor_id': '$doctorId',
                'date': date
              }),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {
        'success': false,
        'message': 'Unable to load available appointment times'
      };
    }
  }

  static Future<Map<String, dynamic>> rescheduleAppointment(
      int appointmentId, String date, String time) async {
    try {
      final response = await http.put(
          Uri.parse('$baseUrl/appointments/$appointmentId/reschedule'),
          headers: await _getHeaders(),
          body: json.encode({'date': date, 'time': time}));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getSpecialties() async {
    final cached = _specialtiesCache;
    final cachedAt = _specialtiesCachedAt;
    if (cached != null &&
        cachedAt != null &&
        DateTime.now().difference(cachedAt) < _referenceCacheTtl) {
      return cached;
    }
    return _specialtiesRequest ??= _fetchSpecialties();
  }

  static Future<Map<String, dynamic>> _fetchSpecialties() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/specialties'));
      final data = Map<String, dynamic>.from(json.decode(response.body) as Map);
      if (data['success'] == true) {
        _specialtiesCache = data;
        _specialtiesCachedAt = DateTime.now();
      }
      return data;
    } catch (_) {
      return {'success': false, 'data': []};
    } finally {
      _specialtiesRequest = null;
    }
  }

  static Future<Map<String, dynamic>> getBloodRequestDetails(
      int requestId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/blood/request/$requestId'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getResourceRequestDetails(
      int requestId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/request/$requestId'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getMyBloodRequests() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/blood/my-requests'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> createResourceRequest(
      Map<String, dynamic> requestData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/resources/request'),
        headers: await _getHeaders(),
        body: json.encode(requestData),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> requestResource(
      Map<String, dynamic> requestData) async {
    try {
      final resourceTypeMap = {
        'General Bed': 'general_bed',
        'ICU Bed': 'icu_bed',
        'Ventilator': 'ventilator',
        'Oxygen Supported Bed': 'oxygen_bed',
      };

      if (requestData['resource_type'] != null) {
        final originalType = requestData['resource_type'];
        if (resourceTypeMap.containsKey(originalType)) {
          requestData['resource_type'] = resourceTypeMap[originalType];
        }
      }

      final response = await http.post(
        Uri.parse('$baseUrl/resources/request'),
        headers: await _getHeaders(),
        body: json.encode(requestData),
      );

      debugPrint('Resource request response status: ${response.statusCode}');

      return json.decode(response.body);
    } catch (e) {
      debugPrint('Error requesting resource: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getHospitalResourceRequests() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/hospital-requests'),
        headers: await _getHeaders(),
      );
      debugPrint(
          'Get hospital requests response status: ${response.statusCode}');
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Error getting hospital requests: $e');
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getMyResourceRequests() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/resources/my-requests'),
        headers: await _getHeaders(),
      );
      debugPrint('Get my requests response status: ${response.statusCode}');
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Error getting my requests: $e');
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> addHospitalResource(
    String resourceType,
    int total,
    int available,
  ) async {
    try {
      final fieldPrefixes = {
        'general_beds': 'generalBeds',
        'icu_beds': 'icuBeds',
        'ventilators': 'ventilators',
        'oxygen_beds': 'oxygenBeds',
      };
      final prefix = fieldPrefixes[resourceType];
      if (prefix == null) {
        return {'success': false, 'message': 'Unsupported resource type'};
      }
      final response = await http.put(
        Uri.parse('$baseUrl/hospitals/resources'),
        headers: await _getHeaders(),
        body: json.encode({
          '${prefix}_total': total,
          '${prefix}_available': available,
        }),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Add resource error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  // lib/services/api_service.dart
  static Future<Map<String, dynamic>> freeResource(
      String resourceType, int quantity) async {
    try {
      // Map resource type to API expected format
      final typeMap = {
        'generalBeds': 'bed',
        'icuBeds': 'icu',
        'ventilators': 'ventilator',
        'oxygenBeds': 'oxygen',
      };

      final apiType = typeMap[resourceType] ?? resourceType;

      final response = await http.put(
        Uri.parse('$baseUrl/resources/free-resource'),
        headers: await _getHeaders(),
        body: json.encode({
          'resource_type': apiType,
          'quantity': quantity,
        }),
      );

      return json.decode(response.body);
    } catch (e) {
      debugPrint('Free resource error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add these methods

  static Future<Map<String, dynamic>> getHospitalDoctors(int hospitalId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/hospitals/$hospitalId/doctors'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get doctors error: $e');
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> addHospitalStaff(
      Map<String, dynamic> staffData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/hospitals/staff'),
        headers: await _getHeaders(),
        body: json.encode(staffData),
      );

      debugPrint('Add staff response status: ${response.statusCode}');

      if (response.statusCode == 201) {
        return json.decode(response.body);
      }

      final data = json.decode(response.body);
      return {
        'success': false,
        'message': data['message'] ?? 'Failed to add staff',
      };
    } catch (e) {
      debugPrint('Add staff error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add these methods

  static Future<Map<String, dynamic>> updateHospitalStaff(
      int staffId, Map<String, dynamic> updates) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/hospitals/staff/$staffId'),
        headers: await _getHeaders(),
        body: json.encode(updates),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> deleteHospitalStaff(int staffId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/hospitals/staff/$staffId'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateHospitalDoctorStatus(
      int id, String status) async {
    try {
      final response = await http.put(
          Uri.parse('$baseUrl/hospitals/staff/$id/status'),
          headers: await _getHeaders(),
          body: json.encode({'status': status}));
      return json.decode(response.body) as Map<String, dynamic>;
    } catch (error) {
      return {
        'success': false,
        'message': 'Unable to update doctor account: $error'
      };
    }
  }
// lib/services/api_service.dart - Add these methods

// ==================== ADMIN HOSPITAL MANAGEMENT ====================

  static Future<Map<String, dynamic>> getAdminHospitalResources(
      int hospitalId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/admin/hospitals/$hospitalId/resources'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get admin hospital resources error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateAdminHospitalResources(
    int hospitalId,
    Map<String, dynamic> resources,
  ) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/admin/hospitals/$hospitalId/resources'),
        headers: await _getHeaders(),
        body: json.encode(resources),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Update admin hospital resources error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getAdminHospitalBloodBank(
      int hospitalId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/admin/hospitals/$hospitalId/blood-bank'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get admin hospital blood bank error: $e');
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> updateAdminBloodBank(
    int hospitalId,
    String bloodGroup,
    int units,
  ) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/admin/hospitals/$hospitalId/blood-bank'),
        headers: await _getHeaders(),
        body: json.encode({
          'blood_group': canonicalBloodGroup(bloodGroup),
          'units_available': units,
        }),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Update admin blood bank error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// ==================== REPORT ENDPOINTS ====================

  static Future<Map<String, dynamic>> getHospitalPerformanceReport() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/reports/hospital-performance'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getResourceUtilizationReport() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/reports/resource-utilization'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getEmergencyResponseReport() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/reports/emergency-response'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getUserRegistrationReport() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/reports/user-registration'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> downloadReport(String reportType) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/reports/download/$reportType?format=json'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add these methods

  static Future<Map<String, dynamic>> checkBloodExpiry() async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/blood-bank/check-expiry'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getDonationHistory() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/blood-bank/donation-history'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> addBloodWithExpiry(
      Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/blood-bank/add-expiry'),
        headers: await _getHeaders(),
        body: json.encode(_canonicalBloodPayload(data)),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> useBloodUnits(
      Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/blood-bank/use'),
        headers: await _getHeaders(),
        body: json.encode(_canonicalBloodPayload(data)),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> markAllNotificationsRead() async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/blood-bank/notifications/read-all'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Update createAppointment method

  static Future<Map<String, dynamic>> createAppointment(
      Map<String, dynamic> appointmentData) async {
    try {
      debugPrint(
          'ðŸŸ¢ Hospital ID being sent: ${appointmentData['hospital_id']}');

      final response = await http.post(
        Uri.parse('$baseUrl/appointments/create'),
        headers: await _getHeaders(),
        body: json.encode(appointmentData),
      );

      debugPrint('ðŸŸ¢ Appointment response status: ${response.statusCode}');

      return json.decode(response.body);
    } catch (e) {
      debugPrint('ðŸ”´ Appointment error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add these methods

// Hospital Campaign APIs

// lib/services/api_service.dart - Add these methods

// ==================== CAMPAIGN APIS ====================

  static Future<Map<String, dynamic>> createCampaign(
      Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/campaigns/create'),
        headers: await _getHeaders(),
        body: json.encode(data),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Create campaign error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateCampaignStatus(
      int campaignId, String status) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/campaigns/$campaignId/status'),
        headers: await _getHeaders(),
        body: json.encode({'status': status}),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Update campaign status error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> approveCampaign(int campaignId) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/campaigns/$campaignId/approve'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Approve campaign error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> rejectCampaign(int campaignId) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/campaigns/$campaignId/reject'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Reject campaign error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add these methods

// ==================== CAMPAIGN APIS ====================

  static Future<Map<String, dynamic>> getAllCampaigns() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/campaigns/all'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getMyRegistrations() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/campaigns/my-registrations'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> registerForCampaign(
      Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/campaigns/register'),
        headers: await _getHeaders(),
        body: json.encode(data),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// lib/services/api_service.dart - Add these methods

  static Future<Map<String, dynamic>> getCampaignDetails(int campaignId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/campaigns/$campaignId'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getCampaignRegistrations(
      int campaignId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/campaigns/$campaignId/registrations'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getCampaignDonations(
      int campaignId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/campaigns/$campaignId/donations'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> recordDonation(
      Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/campaigns/donation'),
        headers: await _getHeaders(),
        body: json.encode(data),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Record donation error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add this method

  static Future<Map<String, dynamic>> getAdminCampaignStats() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/campaigns/admin/stats'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add these methods

// ==================== ROLE & STAFF MANAGEMENT APIS ====================

  static Future<Map<String, dynamic>> getRoles() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/roles/roles'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> createStaffUser(
      Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/roles/staff'),
        headers: await _getHeaders(),
        body: json.encode(data),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateStaffRole(
      int staffId, String role) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/roles/staff/$staffId/role'),
        headers: await _getHeaders(),
        body: json.encode({'role': role}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> resetStaffPassword(
      int staffId, String password) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/roles/staff/$staffId/password'),
        headers: await _getHeaders(),
        body: json.encode({'password': password}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> changePassword(
      String oldPassword, String newPassword, String confirmation) async {
    try {
      final response = await http
          .post(Uri.parse('$baseUrl/auth/change-password'),
              headers: await _getHeaders(),
              body: json.encode({
                'old_password': oldPassword,
                'new_password': newPassword,
                'confirm_password': confirmation
              }))
          .timeout(_authenticationTimeout);
      final data = json.decode(response.body) as Map<String, dynamic>;
      if (data['success'] == true && data['token'] is String) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('token', data['token']);
      }
      return data;
    } catch (error) {
      return {'success': false, 'message': 'Unable to change password: $error'};
    }
  }

  static Future<Map<String, dynamic>> deleteStaffUser(int staffId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/roles/staff/$staffId'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// lib/services/api_service.dart - Update error handling
  static Future<Map<String, dynamic>> getHospitalCampaigns() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/campaigns/hospital'),
        headers: await _getHeaders(),
      );

      if (response.statusCode == 404) {
        return {'success': true, 'data': []};
      }

      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get hospital campaigns error: $e');
      return {'success': true, 'data': []};
    }
  }
// lib/services/api_service.dart - Add these missing methods

// ==================== AMBULANCE MANAGEMENT ====================

  static Future<Map<String, dynamic>> getHospitalAmbulances() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/ambulance/hospital'),
        headers: await _getHeaders(),
      );

      if (response.statusCode == 404) {
        return {'success': true, 'data': []};
      }

      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get hospital ambulances error: $e');
      return {'success': true, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getHospitalAmbulanceBookings() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/ambulance/hospital/bookings'),
        headers: await _getHeaders(),
      );

      if (response.statusCode == 404) {
        return {'success': true, 'data': []};
      }

      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get hospital ambulance bookings error: $e');
      return {'success': true, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getAmbulanceBookingDetails(
      int bookingId) async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/ambulance/booking/$bookingId'),
          headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> registerHospitalAmbulance(
      Map<String, dynamic> ambulanceData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/ambulance/register'),
        headers: await _getHeaders(),
        body: json.encode(ambulanceData),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateHospitalAmbulance(
      int ambulanceId, Map<String, dynamic> updates) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/ambulance/$ambulanceId'),
        headers: await _getHeaders(),
        body: json.encode(updates),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateAmbulanceAvailability(
      int ambulanceId, bool isAvailable) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/ambulance/$ambulanceId/availability'),
        headers: await _getHeaders(),
        body: json.encode({'is_available': isAvailable}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> assignAmbulanceToBooking(
      int bookingId, int ambulanceId) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/ambulance/assign/$bookingId'),
        headers: await _getHeaders(),
        body: json.encode({'ambulance_id': ambulanceId}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateBookingStatus(
      int bookingId, String status) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/ambulance/booking/$bookingId/status'),
        headers: await _getHeaders(),
        body: json.encode({'status': status}),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// lib/services/api_service.dart
  static Future<Map<String, dynamic>> getHospitalStaff() async {
    try {
      final response = await http
          .get(
            Uri.parse('$baseUrl/hospitals/staff'),
            headers: await _getHeaders(),
          )
          .timeout(_authenticationTimeout);
      debugPrint('Get staff response status: ${response.statusCode}');
      final decoded = json.decode(response.body);
      if (decoded is Map<String, dynamic>) return decoded;
      return {
        'success': false,
        'message': 'Unexpected staff response from the server',
      };
    } catch (e) {
      debugPrint('Get staff error: $e');
      return {'success': false, 'message': 'Unable to load staff: $e'};
    }
  }

// KEEP ONLY THIS ONE - DELETE ALL OTHERS

// ==================== RESOURCE REQUESTS ====================

  static Future<Map<String, dynamic>> fulfillResourceRequest(
      int requestId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/resources/request/$requestId/fulfill'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> rejectResourceRequest(
      int requestId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/resources/request/$requestId/reject'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// ==================== HOSPITAL RESOURCES ====================

  static Uri hospitalPhotoImageUri(int hospitalId, int photoId,
      {bool thumbnail = false}) {
    return Uri.parse('$baseUrl/hospitals/$hospitalId/photos/$photoId/image')
        .replace(queryParameters: thumbnail ? {'size': 'thumbnail'} : null);
  }

  static Uri resolveHospitalPhotoUrl(String imagePath) {
    final parsed = Uri.parse(imagePath);
    if (parsed.hasScheme) return parsed;
    var path = parsed.path;
    if (path.startsWith('/api/')) path = path.substring(4);
    if (!path.startsWith('/')) path = '/$path';
    return Uri.parse('$baseUrl$path')
        .replace(query: parsed.hasQuery ? parsed.query : null);
  }

  static Future<Map<String, dynamic>> getHospitalPhotos(int hospitalId,
      {int limit = 24, int offset = 0}) async {
    try {
      final response = await http.get(
        Uri.parse(
            '$baseUrl/hospitals/$hospitalId/photos?limit=$limit&offset=$offset'),
        headers: await _getHeaders(),
      );
      return Map<String, dynamic>.from(json.decode(response.body));
    } catch (error) {
      return {'success': false, 'message': 'Unable to load hospital photos.'};
    }
  }

  static Future<Map<String, dynamic>> getManagedHospitalPhotos() async {
    try {
      final response = await http.get(
          Uri.parse('$baseUrl/hospitals/gallery/manage'),
          headers: await _getHeaders());
      return Map<String, dynamic>.from(json.decode(response.body));
    } catch (error) {
      return {'success': false, 'message': 'Unable to load hospital photos.'};
    }
  }

  static Future<Uint8List?> getManagedHospitalPhotoBytes(int photoId,
      {bool thumbnail = true}) async {
    try {
      final uri = Uri.parse('$baseUrl/hospitals/gallery/photos/$photoId/image')
          .replace(queryParameters: thumbnail ? {'size': 'thumbnail'} : null);
      final response = await http.get(uri, headers: await _getHeaders());
      if (response.statusCode < 200 || response.statusCode >= 300) return null;
      return response.bodyBytes;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>> uploadHospitalPhoto({
    required Uint8List bytes,
    required String caption,
    required String category,
  }) async =>
      _sendHospitalPhoto(bytes, '$baseUrl/hospitals/gallery/photos',
          {'caption': caption, 'category': category},
          method: 'POST');

  static Future<Map<String, dynamic>> replaceHospitalPhoto({
    required int photoId,
    required Uint8List bytes,
  }) async =>
      _sendHospitalPhoto(
          bytes, '$baseUrl/hospitals/gallery/photos/$photoId/image', const {},
          method: 'PUT');

  static Future<Map<String, dynamic>> _sendHospitalPhoto(
      Uint8List bytes, String url, Map<String, String> fields,
      {required String method}) async {
    try {
      final headers = await _getHeaders();
      headers.remove('Content-Type');
      final request = http.MultipartRequest(method, Uri.parse(url))
        ..headers.addAll(headers)
        ..fields.addAll(fields)
        ..files.add(http.MultipartFile.fromBytes('photo', bytes,
            filename: 'hospital-photo.bin'));
      final response = await http.Response.fromStream(await request.send());
      return Map<String, dynamic>.from(json.decode(response.body));
    } catch (error) {
      return {
        'success': false,
        'message': 'Photo upload failed. Check your connection and try again.'
      };
    }
  }

  static Future<Map<String, dynamic>> updateHospitalPhoto(
      int photoId, Map<String, dynamic> changes) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/hospitals/gallery/photos/$photoId'),
        headers: await _getHeaders(),
        body: json.encode(changes),
      );
      return Map<String, dynamic>.from(json.decode(response.body));
    } catch (error) {
      return {'success': false, 'message': 'Unable to update photo.'};
    }
  }

  static Future<Map<String, dynamic>> reorderHospitalPhotos(
      List<int> photoIds) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/hospitals/gallery/photos/reorder'),
        headers: await _getHeaders(),
        body: json.encode({'photo_ids': photoIds}),
      );
      return Map<String, dynamic>.from(json.decode(response.body));
    } catch (error) {
      return {'success': false, 'message': 'Unable to reorder photos.'};
    }
  }

  static Future<Map<String, dynamic>> deleteHospitalPhoto(int photoId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/hospitals/gallery/photos/$photoId'),
        headers: await _getHeaders(),
      );
      return Map<String, dynamic>.from(json.decode(response.body));
    } catch (error) {
      return {'success': false, 'message': 'Unable to delete photo.'};
    }
  }

  static Future<Map<String, dynamic>> getHospitalResources(
      int hospitalId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('$baseUrl/resources/hospital/$hospitalId/resources'),
        headers: headers,
      );

      final data = json.decode(response.body);

      if (data['success'] == true && data['data'] != null) {
        return {
          'success': true,
          'data': Map<String, dynamic>.from(data['data']),
        };
      }
      return data;
    } catch (e) {
      debugPrint('Error getting hospital resources: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateResourceRequestStatus(
      int requestId, String status, hospitalId) async {
    if (status != 'fulfill' && status != 'reject') {
      return {'success': false, 'message': 'Unsupported request status'};
    }
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/resources/request/$requestId/$status'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error updating resource request status: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getAllHospitalsWithResources({
    int page = 1,
    int limit = 20,
    String? city,
    bool? verified,
  }) async {
    try {
      String url = '$baseUrl/admin/hospitals?page=$page&limit=$limit';
      if (city != null) url += '&city=$city';
      if (verified != null) url += '&verified=$verified';

      final response = await http.get(
        Uri.parse(url),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get all hospitals with resources error: $e');
      return {'success': false, 'data': []};
    }
  }
// lib/services/api_service.dart

  static Future<Map<String, dynamic>> getNearbyHospitals(
    double lat,
    double lng, {
    double radius = 20,
    String sortBy = 'distance',
    String? specialty,
    bool? emergency,
    bool? icu,
    bool? beds,
    bool? bloodBank,
  }) async {
    try {
      final headers = await _getHeaders();

      final query = Uri(queryParameters: {
        'lat': '$lat',
        'lng': '$lng',
        'radius': '$radius',
        'sortBy': sortBy,
        if (specialty?.isNotEmpty == true) 'specialty': specialty!,
        if (emergency == true) 'emergency': 'true',
        if (icu == true) 'icu': 'true',
        if (beds == true) 'beds': 'true',
        if (bloodBank == true) 'bloodBank': 'true',
      }).query;
      String url = '$baseUrl/hospitals/nearby?$query';

      debugPrint('Fetching nearby hospitals from: $url');

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      debugPrint('Response status: ${response.statusCode}');

      final Map<String, dynamic> data = json.decode(response.body);
      debugPrint('Nearby hospitals response: ${data['success']}');

      if (data['success'] == true && data['data'] != null) {
        final List<dynamic> hospitals = data['data'];
        debugPrint('Found ${hospitals.length} hospitals');

        // Process each hospital to ensure proper resource mapping
        final processedHospitals = hospitals.map((hospital) {
          return {
            ...hospital,
            'total_beds':
                hospital['total_beds'] ?? hospital['general_beds_total'] ?? 0,
            'available_beds': hospital['available_beds'] ??
                hospital['general_beds_available'] ??
                0,
            'icu_beds': hospital['icu_beds'] ?? hospital['icu_beds_total'] ?? 0,
            'available_icu': hospital['available_icu'] ??
                hospital['icu_beds_available'] ??
                0,
            'ventilator_count': hospital['ventilator_count'] ??
                hospital['ventilators_total'] ??
                0,
            'available_ventilators': hospital['available_ventilators'] ??
                hospital['ventilators_available'] ??
                0,
            'oxygen_beds_total': hospital['oxygen_beds_total'] ??
                hospital['oxygen_supported_beds_total'] ??
                0,
            'oxygen_beds_available': hospital['oxygen_beds_available'] ??
                hospital['oxygen_supported_beds_available'] ??
                0,
            'blood_units': hospital['blood_units'] ?? 0,
          };
        }).toList();

        return {
          'success': true,
          'data': processedHospitals,
          'count': processedHospitals.length,
        };
      }

      // Backward-compatible fallback for older backends.
      if (response.statusCode == 404) {
        debugPrint('Trying alternative endpoint...');
        final altResponse = await http.get(
          Uri.parse('$baseUrl/resources/nearby?lat=$lat&lng=$lng'),
          headers: headers,
        );
        final altData = json.decode(altResponse.body);
        return altData;
      }

      return data;
    } catch (e) {
      debugPrint('Error fetching nearby hospitals: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getHospitalNavigation(
      int hospitalId) async {
    try {
      final response = await http
          .get(
            Uri.parse('$baseUrl/hospitals/$hospitalId/navigation'),
            headers: await _getHeaders(),
          )
          .timeout(_authenticationTimeout);
      final decoded = json.decode(response.body);
      return decoded is Map<String, dynamic>
          ? decoded
          : {'success': false, 'message': 'Unexpected navigation response'};
    } catch (error) {
      return {
        'success': false,
        'message': 'Unable to load hospital navigation: $error'
      };
    }
  }

  static Future<Map<String, dynamic>> getDriverProfile() =>
      _driverGet('/profile');
  static Future<Map<String, dynamic>> getDriverAssignments() =>
      _driverGet('/assignments');
  static Future<Map<String, dynamic>> getDriverTripHistory(
          {int page = 1, int limit = 20}) =>
      _driverGet('/history?page=$page&limit=$limit');
  static Future<Map<String, dynamic>> updateDriverEmergencyStatus(
          int emergencyId, String status) =>
      _driverPut('/assignments/$emergencyId/status', {'status': status});
  static Future<Map<String, dynamic>> updateDriverBookingStatus(
          int bookingId, String status) =>
      _driverPut('/bookings/$bookingId/status', {'status': status});
  static Future<Map<String, dynamic>> updateDriverLocation(
          double latitude, double longitude,
          {double? accuracy, DateTime? timestamp}) =>
      _driverPost('/location', {
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': accuracy,
        'timestamp': (timestamp ?? DateTime.now()).toIso8601String()
      });
  static Future<Map<String, dynamic>> _driverGet(String path) async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/driver$path'), headers: await _getHeaders())
          .timeout(_authenticationTimeout);
      final data = json.decode(response.body);
      if (response.statusCode == 401) {
        return {
          'success': false,
          'unauthorized': true,
          'message': 'Your session has expired. Please sign in again.'
        };
      }
      return data is Map<String, dynamic>
          ? data
          : {'success': false, 'message': 'Unexpected driver response'};
    } catch (error) {
      return {'success': false, 'message': 'Network error: $error'};
    }
  }

  static Future<Map<String, dynamic>> _driverPut(
      String path, Map<String, dynamic> data) async {
    try {
      final response = await http
          .put(Uri.parse('$baseUrl/driver$path'),
              headers: await _getHeaders(), body: json.encode(data))
          .timeout(_authenticationTimeout);
      final decoded = json.decode(response.body);
      if (response.statusCode == 401) {
        return {
          'success': false,
          'unauthorized': true,
          'message': 'Your session has expired. Please sign in again.'
        };
      }
      return decoded is Map<String, dynamic>
          ? decoded
          : {'success': false, 'message': 'Unexpected driver response'};
    } catch (error) {
      return {'success': false, 'message': 'Network error: $error'};
    }
  }

  static Future<Map<String, dynamic>> _driverPost(
      String path, Map<String, dynamic> data) async {
    try {
      final response = await http
          .post(Uri.parse('$baseUrl/driver$path'),
              headers: await _getHeaders(), body: json.encode(data))
          .timeout(_authenticationTimeout);
      final decoded = json.decode(response.body);
      if (response.statusCode == 401) {
        return {
          'success': false,
          'unauthorized': true,
          'message': 'Your session has expired. Please sign in again.'
        };
      }
      return decoded is Map<String, dynamic>
          ? decoded
          : {'success': false, 'message': 'Unexpected driver response'};
    } catch (error) {
      return {'success': false, 'message': 'Network error: $error'};
    }
  }

  static Future<Map<String, dynamic>> getHospitalRoute(
      int hospitalId, double latitude, double longitude) async {
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/hospitals/$hospitalId/route'),
            headers: await _getHeaders(),
            body: json.encode({
              'origin': {'latitude': latitude, 'longitude': longitude}
            }),
          )
          .timeout(_authenticationTimeout);
      final decoded = json.decode(response.body);
      return decoded is Map<String, dynamic>
          ? decoded
          : {'success': false, 'message': 'Unexpected route response'};
    } catch (error) {
      return {'success': false, 'message': 'Unable to calculate route: $error'};
    }
  }
// lib/services/api_service.dart

// ==================== ADMIN HOSPITAL MANAGEMENT ====================

  static Future<Map<String, dynamic>> verifyHospital(
      int hospitalId, String status) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/admin/hospitals/$hospitalId/verify'),
        headers: headers,
        body: json.encode({'status': status}),
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Verify hospital error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> deleteHospital(int hospitalId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.delete(
        Uri.parse('$baseUrl/admin/hospitals/$hospitalId'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Delete hospital error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add this method

  static Future<Map<String, dynamic>> deactivateHospitalAmbulance(
      int ambulanceId) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/ambulance/$ambulanceId/deactivate'),
        headers: await _getHeaders(),
      );
      return json.decode(response.body);
    } catch (_) {
      return {'success': false, 'message': 'Unable to reach the server.'};
    }
  }

  static Future<Map<String, dynamic>> useBlood(
      int hospitalId, String bloodGroup, int units) async {
    try {
      final headers = await _getHeaders();
      final response = await http.post(
        Uri.parse('$baseUrl/blood-bank/use'),
        headers: headers,
        body: json.encode({
          'blood_group': canonicalBloodGroup(bloodGroup),
          'units_required': units,
        }),
      );

      final data = json.decode(response.body);
      debugPrint('Use blood response: ${data['success']}');
      return data;
    } catch (e) {
      debugPrint('Use blood error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// ==================== BLOOD REQUESTS (Existing) ====================

// ==================== BLOOD BANK MANAGEMENT ====================

  static Future<Map<String, dynamic>> getBloodBank(int hospitalId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('$baseUrl/blood-bank/$hospitalId'),
        headers: headers,
      );

      final data = json.decode(response.body);
      debugPrint('Blood bank response: ${data['success']}');
      return data;
    } catch (e) {
      debugPrint('Get blood bank error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// In lib/services/api_service.dart

  static Future<Map<String, dynamic>> getBloodStockWithExpiry() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/blood-bank/stock/expiry'),
        headers: await _getHeaders(),
      );

      final data = json.decode(response.body);
      debugPrint('Blood stock with expiry response: ${data['success']}');

      if (data['success'] == true && data['data'] != null) {
        if (data['data'] is Map) {
          return Map<String, dynamic>.from(data);
        } else if (data['data'] is List) {
          final stock = (data['data'] as List)
              .map((item) => {
                    ...Map<String, dynamic>.from(item as Map),
                    'units': item['units'] ?? item['units_available'] ?? 0,
                    'batch_number': item['batch_number'] ??
                        'BATCH-${item['id']?.toString() ?? ''}',
                  })
              .toList();

          return {
            'success': true,
            'data': {
              'blood_stock': stock,
              'notifications': [],
              'summary': {},
            },
            'count': stock.length,
          };
        }
      }
      return data;
    } catch (e) {
      debugPrint('Get blood stock with expiry error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> addBloodStock({
    required String bloodGroup,
    required int units,
    required String expiryDate,
  }) async {
    try {
      final headers = await _getHeaders();
      final response = await http.post(
        Uri.parse('$baseUrl/blood-bank/add-expiry'),
        headers: headers,
        body: json.encode({
          'blood_group': canonicalBloodGroup(bloodGroup),
          'units': units,
          'expiry_date': expiryDate,
        }),
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error adding blood stock: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// In api_service.dart - Add these methods

// Get blood availability for a hospital
  static Future<Map<String, dynamic>> getBloodAvailability(
      int hospitalId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('$baseUrl/blood-bank/$hospitalId'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error getting blood availability: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// Get hospital blood requests
  static Future<Map<String, dynamic>> getHospitalBloodRequests() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('$baseUrl/blood-bank/requests/hospital'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error getting hospital blood requests: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// Get hospital blood bank
  static Future<Map<String, dynamic>> getHospitalBloodBank() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('$baseUrl/blood-bank/stock'),
        headers: headers,
      );

      final data = json.decode(response.body);

      if (data['success'] == true) {
        // The backend returns all eight groups. Do not substitute an API or
        // parsing failure with zero stock: the caller must show its error UI.
        final rawStock = data['bloodStock'] ?? data['data']?['blood_stock'];
        if (rawStock is! List) {
          return {'success': false, 'message': 'Malformed blood-bank response'};
        }
        final rawSummary = Map<String, dynamic>.from(
          data['data']?['summary'] as Map? ?? const {},
        );
        final expiringSoon = rawSummary['expiring_soon'];
        final expiringSoonUnits = expiringSoon is List
            ? expiringSoon.fold<int>(0, (total, item) {
                final units = item is Map ? item['units'] : 0;
                return total + (units is num ? units.toInt() : 0);
              })
            : (expiringSoon is num ? expiringSoon.toInt() : 0);
        final byStatus = rawSummary['by_status'];
        final expiredUnits = byStatus is Map && byStatus['expired'] is num
            ? (byStatus['expired'] as num).toInt()
            : (rawSummary['expired'] is num
                ? (rawSummary['expired'] as num).toInt()
                : 0);

        return {
          'success': true,
          'data': {
            'blood_stock': rawStock,
            'summary': {
              'total_units': rawSummary['total_units'] ?? 0,
              'expiring_soon': expiringSoonUnits,
              'expired': expiredUnits,
            },
          }
        };
      }
      return data;
    } catch (e) {
      debugPrint('Error getting hospital blood bank: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// Update blood stock
  static Future<Map<String, dynamic>> updateBloodStock({
    required String bloodGroup,
    required int units,
    required String expiryDate,
    int? batchId,
  }) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/blood-bank/stock'),
        headers: headers,
        body: json.encode({
          'blood_group': canonicalBloodGroup(bloodGroup),
          'units': units,
          'expiry_date': expiryDate,
          if (batchId != null) 'batch_id': batchId,
        }),
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error updating blood stock: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// Delete blood stock
  static Future<Map<String, dynamic>> deleteBloodStock(
      String bloodGroup) async {
    try {
      final headers = await _getHeaders();
      final response = await http.delete(
        Uri.parse(
            '$baseUrl/blood-bank/stock/${Uri.encodeComponent(canonicalBloodGroup(bloodGroup))}'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error deleting blood stock: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// Fulfill blood request
  static Future<Map<String, dynamic>> fulfillBloodRequest(int requestId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/blood-bank/requests/$requestId/fulfill'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error fulfilling blood request: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// Reject blood request
  static Future<Map<String, dynamic>> rejectBloodRequest(int requestId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/blood-bank/requests/$requestId/reject'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      debugPrint('Error rejecting blood request: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
}
