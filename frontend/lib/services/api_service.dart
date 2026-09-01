// lib/services/api_service.dart
// lib/services/api_service.dart
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  // Override at build time, for example:
  // --dart-define=API_BASE_URL=http://10.0.2.2:5001/api
  static const String _configuredBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static const String _configuredSocketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: '',
  );

  // Android's localhost is the device/emulator, not this Windows machine.
  // An explicit --dart-define always wins (and is required for physical phones).
  static String get baseUrl {
    if (_configuredBaseUrl.isNotEmpty) return _configuredBaseUrl;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:5001/api';
    }
    return 'http://localhost:5001/api';
  }

  static String get socketUrl {
    if (_configuredSocketUrl.isNotEmpty) return _configuredSocketUrl;
    return baseUrl.replaceFirst(RegExp(r'/api$'), '');
  }

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

  // ==================== MEDICAL RECORDS ====================

  static Future<Map<String, dynamic>> getMedicalOnboardingStatus() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/medical/onboarding-status'), headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> saveMedicalProfile(Map<String, dynamic> profile) async {
    try {
      final response = await http.put(Uri.parse('$baseUrl/medical/profile'), headers: await _getHeaders(), body: json.encode(profile));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getMedicalTimeline(int patientId) async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/medical/patients/$patientId/timeline'), headers: await _getHeaders());
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> createMedicalRecord(Map<String, dynamic> record) async {
    try {
      final response = await http.post(Uri.parse('$baseUrl/medical/records'), headers: await _getHeaders(), body: json.encode(record));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> updateHealthRecord(int recordId, Map<String, dynamic> record) async {
    try { final response = await http.put(Uri.parse('$baseUrl/health-records/$recordId'), headers: await _getHeaders(), body: json.encode(record)); return json.decode(response.body); }
    catch (e) { return {'success': false, 'message': 'Network error: $e'}; }
  }

  static Future<Map<String, dynamic>> removeHealthRecord(int recordId, {String? reason}) async {
    try { final response = await http.delete(Uri.parse('$baseUrl/health-records/$recordId'), headers: await _getHeaders(), body: json.encode({'reason': reason})); return json.decode(response.body); }
    catch (e) { return {'success': false, 'message': 'Network error: $e'}; }
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
      String email, String password, String userType) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'email': email,
          'password': password,
          'user_type': userType,
        }),
      );

      final data = json.decode(response.body);
      if (response.statusCode == 200 && data['success'] == true) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('token', data['token']);
        await prefs.setString('user', json.encode(data['user']));
      }
      return data;
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

  static Future<Map<String, dynamic>> updateHospitalResources(
      Map<String, dynamic> resources) async {
    try {
      debugPrint('Updating resources: $resources');

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

      debugPrint('Sending payload: $payload');

      final response = await http.put(
        Uri.parse('$baseUrl/hospitals/resources'),
        headers: await _getHeaders(),
        body: json.encode(payload),
      );

      debugPrint('Update resources response: ${response.statusCode}');
      debugPrint('Update resources body: ${response.body}');

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
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/emergency/location-update'),
        headers: await _getHeaders(),
        body: json.encode({
          'emergencyId': emergencyId,
          'location_lat': latitude,
          'location_lng': longitude,
        }),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
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

  static Future<Map<String, dynamic>> endEmergency(int emergencyId, {String status = 'completed'}) async {
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
      debugPrint('Get all users response body: ${response.body}');

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
      debugPrint('Book ambulance body: ${response.body}');

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
        body: json.encode(data),
      );
      debugPrint('Create blood request response: ${response.statusCode}');
      debugPrint('Create blood request body: ${response.body}');
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
      debugPrint('Hospital profile response body: ${response.body}');

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
      debugPrint('[CHATBOT REQUEST] POST $endpoint');
      debugPrint('[CHATBOT REQUEST] messageLength=${'${query['message'] ?? ''}'.length}; hasToken=${(await SharedPreferences.getInstance()).getString('token')?.isNotEmpty == true}');
      final response = await http.post(
        endpoint,
        headers: await _getHeaders(),
        body: json.encode(query),
      ).timeout(const Duration(seconds: 50));
      debugPrint('[CHATBOT] Response status: ${response.statusCode}');
      debugPrint('[CHATBOT] Response body: ${response.body.length > 2000 ? '${response.body.substring(0, 2000)}…' : response.body}');
      final decoded = json.decode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Chatbot response must be a JSON object.');
      }
      return decoded;
    } catch (error, stackTrace) {
      debugPrint('[FLUTTER PARSE ERROR] $error');
      debugPrintStack(stackTrace: stackTrace);
      return {'success': false, 'error': 'CHATBOT_NETWORK_OR_PARSE_ERROR', 'message': 'Network or response error: $error'};
    }
  }

  static Future<Map<String, dynamic>> requestBlood(
      Map<String, dynamic> requestData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/resources/blood/request'),
        headers: await _getHeaders(),
        body: json.encode(requestData),
      );
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> getAllHospitals(
      {String? city, String? verified, String? search, String? specialty, bool? emergency, bool? icu, bool? beds, bool? bloodBank, int page = 1, int limit = 50}) async {
    try {
      final query = <String, String>{'page': '$page', 'limit': '$limit'};
      if (city?.isNotEmpty == true) query['city'] = city!;
      if (search?.isNotEmpty == true) query['search'] = search!;
      if (specialty?.isNotEmpty == true) query['specialty'] = specialty!;
      if (emergency == true) query['emergency'] = 'true';
      if (icu == true) query['icu'] = 'true';
      if (beds == true) query['beds'] = 'true';
      if (bloodBank == true) query['bloodBank'] = 'true';
      final response = await http.get(Uri.parse('$baseUrl/hospitals').replace(queryParameters: query));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> getAppointmentSlots(int appointmentId, String date) async {
    try { final response = await http.get(Uri.parse('$baseUrl/appointments/$appointmentId/available-slots?date=$date'), headers: await _getHeaders()); return json.decode(response.body); }
    catch (e) { return {'success': false, 'message': 'Network error: $e'}; }
  }

  static Future<Map<String, dynamic>> rescheduleAppointment(int appointmentId, String date, String time) async {
    try { final response = await http.put(Uri.parse('$baseUrl/appointments/$appointmentId/reschedule'), headers: await _getHeaders(), body: json.encode({'date': date, 'time': time})); return json.decode(response.body); }
    catch (e) { return {'success': false, 'message': 'Network error: $e'}; }
  }

  static Future<Map<String, dynamic>> getSpecialties() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/specialties'));
      return json.decode(response.body);
    } catch (_) {
      return {'success': false, 'data': []};
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

      debugPrint('Sending resource request: $requestData');

      final response = await http.post(
        Uri.parse('$baseUrl/resources/request'),
        headers: await _getHeaders(),
        body: json.encode(requestData),
      );

      debugPrint('Resource request response status: ${response.statusCode}');
      debugPrint('Resource request response body: ${response.body}');

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
      debugPrint('Get hospital requests response status: ${response.statusCode}');
      debugPrint('Get hospital requests response body: ${response.body}');
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
      debugPrint('Get my requests response body: ${response.body}');
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
      final response = await http.post(
        Uri.parse('$baseUrl/hospitals/resources/add'),
        headers: await _getHeaders(),
        body: json.encode({
          'resource_type': resourceType,
          'total': total,
          'available': available,
        }),
      );
      debugPrint('Add resource response: ${response.body}');
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

      debugPrint('Free resource response: ${response.body}');
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
      debugPrint('Get doctors response: ${response.body}');
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get doctors error: $e');
      return {'success': false, 'data': []};
    }
  }

  static Future<Map<String, dynamic>> addHospitalStaff(
      Map<String, dynamic> staffData) async {
    try {
      debugPrint('Adding staff: $staffData');

      final response = await http.post(
        Uri.parse('$baseUrl/hospitals/staff'),
        headers: await _getHeaders(),
        body: json.encode(staffData),
      );

      debugPrint('Add staff response status: ${response.statusCode}');
      debugPrint('Add staff response body: ${response.body}');

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
// lib/services/api_service.dart - Add these methods

// ==================== ADMIN HOSPITAL MANAGEMENT ====================

  static Future<Map<String, dynamic>> getAdminHospitalResources(
      int hospitalId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/admin/hospitals/$hospitalId/resources'),
        headers: await _getHeaders(),
      );
      debugPrint('Get admin hospital resources response: ${response.body}');
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
      debugPrint('Update admin hospital resources response: ${response.body}');
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
      debugPrint('Get admin hospital blood bank response: ${response.body}');
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
          'blood_group': bloodGroup,
          'units_available': units,
        }),
      );
      debugPrint('Update admin blood bank response: ${response.body}');
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
        body: json.encode(data),
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
        body: json.encode(data),
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
      debugPrint('ðŸŸ¢ Creating appointment with data: $appointmentData');
      debugPrint('ðŸŸ¢ Hospital ID being sent: ${appointmentData['hospital_id']}');

      final response = await http.post(
        Uri.parse('$baseUrl/appointments/create'),
        headers: await _getHeaders(),
        body: json.encode(appointmentData),
      );

      debugPrint('ðŸŸ¢ Appointment response status: ${response.statusCode}');
      debugPrint('ðŸŸ¢ Appointment response body: ${response.body}');

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
      debugPrint('Create campaign response: ${response.body}');
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
      debugPrint('Update campaign status response: ${response.body}');
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
      debugPrint('Approve campaign response: ${response.body}');
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
      debugPrint('Reject campaign response: ${response.body}');
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
      debugPrint('Record donation response: ${response.body}');
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
      final response = await http.get(
        Uri.parse('$baseUrl/hospitals/staff'),
        headers: await _getHeaders(),
      );
      debugPrint('Get staff response status: ${response.statusCode}');
      return json.decode(response.body);
    } catch (e) {
      debugPrint('Get staff error: $e');
      return {'success': false, 'data': []};
    }
  }

// KEEP ONLY THIS ONE - DELETE ALL OTHERS

// ==================== RESOURCE REQUESTS ====================

  static Future<Map<String, dynamic>> fulfillResourceRequest(
      int requestId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/resources/requests/$requestId/fulfill'),
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
        Uri.parse('$baseUrl/resources/requests/$requestId/reject'),
        headers: headers,
      );

      final data = json.decode(response.body);
      return data;
    } catch (e) {
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

// ==================== HOSPITAL RESOURCES ====================

  static Future<Map<String, dynamic>> getHospitalResources(
      int hospitalId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('$baseUrl/resources/hospital/$hospitalId/resources'),
        headers: headers,
      );

      final data = json.decode(response.body);
      debugPrint('Hospital resources response: $data');

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
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/resources/request/$requestId/$status'),
        headers: headers,
      );

      final data = json.decode(response.body);
      debugPrint('Update resource request status response: $data');
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
      debugPrint('Get all hospitals with resources response: ${response.body}');
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
      debugPrint('Verify hospital response: $data');
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
      debugPrint('Delete hospital response: $data');
      return data;
    } catch (e) {
      debugPrint('Delete hospital error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }
// lib/services/api_service.dart - Add this method

  static Future<Map<String, dynamic>> deleteHospitalAmbulance(
      int ambulanceId) async {
    try {
      final headers = await _getHeaders();
      final response = await http.delete(
        Uri.parse('$baseUrl/ambulance/$ambulanceId'),
        headers: headers,
      );

      final data = json.decode(response.body);
      debugPrint('Delete ambulance response: $data');
      return data;
    } catch (e) {
      debugPrint('Delete ambulance error: $e');
      return {'success': false, 'message': 'Network error: $e'};
    }
  }

  static Future<Map<String, dynamic>> useBlood(
      int hospitalId, String bloodGroup, int units) async {
    try {
      final headers = await _getHeaders();
      final response = await http.post(
        Uri.parse('$baseUrl/resources/blood-bank/use'),
        headers: headers,
        body: json.encode({
          'hospital_id': hospitalId,
          'blood_group': bloodGroup,
          'units': units,
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
        Uri.parse('$baseUrl/resources/blood-bank/$hospitalId'),
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
          'blood_group': bloodGroup,
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

      // Ensure data has the expected structure
      if (data['success'] == true) {
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
            'blood_stock': data['data']?['blood_stock'] ?? [],
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
  }) async {
    try {
      final headers = await _getHeaders();
      final response = await http.put(
        Uri.parse('$baseUrl/blood-bank/stock'),
        headers: headers,
        body: json.encode({
          'blood_group': bloodGroup,
          'units': units,
          'expiry_date': expiryDate,
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
        Uri.parse('$baseUrl/blood-bank/stock/${Uri.encodeComponent(bloodGroup)}'),
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
