// lib/providers/hospital_provider.dart

import 'package:flutter/material.dart';
import '../services/api_service.dart';

class HospitalProvider extends ChangeNotifier {
  Map<String, dynamic>? _hospitalData;
  List<Map<String, dynamic>> _staff = [];
  List<Map<String, dynamic>> _appointments = [];
  List<Map<String, dynamic>> _emergencies = [];
  List<Map<String, dynamic>> _bloodStock = [];
  List<Map<String, dynamic>> _bloodRequests = [];
  List<Map<String, dynamic>> _resourceRequests = [];
  List<Map<String, dynamic>> _allRequests = [];
  bool _isLoading = false;
  String? _errorMessage;
  bool _isInitialized = false;

  Map<String, dynamic>? get hospitalData => _hospitalData;
  List<Map<String, dynamic>> get staff => _staff;
  List<Map<String, dynamic>> get appointments => _appointments;
  List<Map<String, dynamic>> get emergencies => _emergencies;
  List<Map<String, dynamic>> get bloodStock => _bloodStock;
  List<Map<String, dynamic>> get bloodRequests => _bloodRequests;
  List<Map<String, dynamic>> get resourceRequests => _resourceRequests;
  List<Map<String, dynamic>> get allRequests => _allRequests;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isInitialized => _isInitialized;

  HospitalProvider() {
    // Don't call loadHospitalData immediately - let the UI trigger it
  }

  Future<void> loadHospitalData() async {
    if (_isLoading) return;

    _isLoading = true;
    _errorMessage = null;
    _notify();

    try {
      // Load hospital profile
      final profileResponse = await ApiService.getHospitalProfile();

      if (profileResponse['success'] == true &&
          profileResponse['data'] != null) {
        _hospitalData =
            Map<String, dynamic>.from(profileResponse['data'] as Map);
        debugPrint(
            'ðŸ¥ Hospital data loaded: ${_hospitalData?['name']} (ID: ${_hospitalData?['id']})');
      } else {
        debugPrint(
            'Failed to load hospital profile: ${profileResponse['message']}');
      }

      // Load staff
      try {
        final staffResponse = await ApiService.getHospitalStaff();
        if (staffResponse['success'] == true && staffResponse['data'] != null) {
          _staff = List<Map<String, dynamic>>.from(staffResponse['data']);
          debugPrint('ðŸ‘¥ Staff loaded: ${_staff.length} members');
        }
      } catch (e) {
        debugPrint('Error loading staff: $e');
        _staff = [];
      }

      final hospitalId = _hospitalData?['id'];
      if (hospitalId != null) {
        // Load blood stock - using the correct endpoint
        try {
          final bloodResponse =
              await ApiService.getBloodAvailability(hospitalId);
          if (bloodResponse['success'] == true &&
              bloodResponse['data'] != null) {
            _bloodStock =
                List<Map<String, dynamic>>.from(bloodResponse['data']);
            debugPrint(
                'ðŸ©¸ Blood stock loaded: ${_bloodStock.length} entries');
          } else {
            _bloodStock = [];
          }
        } catch (e) {
          debugPrint('Error loading blood stock: $e');
          _bloodStock = [];
        }

        // Load blood requests
        try {
          final bloodRequestsResponse =
              await ApiService.getHospitalBloodRequests();
          if (bloodRequestsResponse['success'] == true &&
              bloodRequestsResponse['data'] != null) {
            _bloodRequests =
                List<Map<String, dynamic>>.from(bloodRequestsResponse['data']);
            debugPrint(
                'Blood requests loaded: ${_bloodRequests.length} requests');
          }
        } catch (e) {
          debugPrint('Error loading blood requests: $e');
        }

        // Load resource requests
        try {
          final resourceRequestsResponse =
              await ApiService.getHospitalResourceRequests();
          if (resourceRequestsResponse['success'] == true &&
              resourceRequestsResponse['data'] != null) {
            _resourceRequests = List<Map<String, dynamic>>.from(
                resourceRequestsResponse['data']);
            debugPrint(
                'Resource requests loaded: ${_resourceRequests.length} requests');
          }
        } catch (e) {
          debugPrint('Error loading resource requests: $e');
        }

        _allRequests = [];
        _allRequests.addAll(_bloodRequests);
        _allRequests.addAll(_resourceRequests);
        _allRequests.sort((a, b) {
          final dateA = a['request_date'] ?? a['created_at'] ?? '';
          final dateB = b['request_date'] ?? b['created_at'] ?? '';
          return dateB.compareTo(dateA);
        });
      }

      try {
        final appointmentsResponse = await ApiService.getHospitalAppointments();
        if (appointmentsResponse['success'] == true &&
            appointmentsResponse['data'] != null) {
          _appointments =
              List<Map<String, dynamic>>.from(appointmentsResponse['data']);
        }
      } catch (e) {
        debugPrint('Error loading appointments: $e');
      }

      try {
        final emergenciesResponse = await ApiService.getHospitalEmergencies();
        if (emergenciesResponse['success'] == true &&
            emergenciesResponse['data'] != null) {
          _emergencies =
              List<Map<String, dynamic>>.from(emergenciesResponse['data']);
        }
      } catch (e) {
        debugPrint('Error loading emergencies: $e');
      }

      _isInitialized = true;
    } catch (e) {
      _errorMessage = 'Network error: $e';
      debugPrint('Error loading hospital data: $e');
    }

    _isLoading = false;
    _notify();
  }
  // ==================== STAFF MANAGEMENT ====================

  Future<bool> addStaffMember(Map<String, dynamic> staffData) async {
    _isLoading = true;
    _notify();

    try {
      debugPrint('Adding staff via provider: $staffData');

      final response = await ApiService.addHospitalStaff(staffData);
      debugPrint('Add staff response: ${response['success']}');

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Add staff error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  /// Replaces the local staff record with the database row returned by the
  /// hospital-scoped update endpoint. This prevents a stale status badge.
  Future<Map<String, dynamic>> updateStaffMember(
      int staffId, Map<String, dynamic> updates) async {
    final response = await ApiService.updateHospitalStaff(staffId, updates);
    if (response['success'] == true && response['data'] is Map) {
      final updated = Map<String, dynamic>.from(response['data'] as Map);
      final index = _staff.indexWhere((staff) => staff['id'] == staffId);
      if (index >= 0) {
        _staff[index] = updated;
        _notify();
      }
    }
    return response;
  }

  Future<Map<String, dynamic>> deactivateStaffMember(int staffId) async {
    final response = await ApiService.deleteHospitalStaff(staffId);
    if (response['success'] == true) {
      final index = _staff.indexWhere((staff) => staff['id'] == staffId);
      if (index >= 0) {
        _staff[index] = {
          ..._staff[index],
          'is_available': false,
          'is_active': false,
          'availability_status': false,
        };
        _notify();
      }
    }
    return response;
  }

  // ==================== RESOURCE MANAGEMENT ====================

  Future<bool> updateResource(
      String resourceType, String field, int value) async {
    _isLoading = true;
    _notify();

    try {
      final response = await ApiService.updateHospitalResources({
        '${resourceType}_$field': value,
      });

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Update resource error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  // lib/providers/hospital_provider.dart

  Future<bool> fulfillResourceRequest(int requestId) async {
    _isLoading = true;
    _notify();

    try {
      debugPrint('Fulfilling resource request: $requestId');

      final response = await ApiService.fulfillResourceRequest(requestId);
      debugPrint('Fulfill resource request response: ${response['success']}');

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      } else {
        _errorMessage = response['message'] ?? 'Failed to fulfill request';
        return false;
      }
    } catch (e) {
      debugPrint('Fulfill resource request error: $e');
      _errorMessage = 'Network error: $e';
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  Future<bool> rejectResourceRequest(int requestId) async {
    _isLoading = true;
    _notify();

    try {
      debugPrint('Rejecting resource request: $requestId');

      final response = await ApiService.rejectResourceRequest(requestId);
      debugPrint('Reject resource request response: ${response['success']}');

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Reject resource request error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  Future<bool> fulfillBloodRequest(int requestId) async {
    _isLoading = true;
    _notify();

    try {
      debugPrint('Fulfilling blood request: $requestId');

      final response = await ApiService.fulfillBloodRequest(requestId);
      debugPrint('Fulfill blood request response: ${response['success']}');

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Fulfill blood request error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  Future<bool> rejectBloodRequest(int requestId) async {
    _isLoading = true;
    _notify();

    try {
      debugPrint('Rejecting blood request: $requestId');

      final response = await ApiService.rejectBloodRequest(requestId);
      debugPrint('Reject blood request response: ${response['success']}');

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Reject blood request error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  Future<bool> updateAppointmentStatus(int appointmentId, String status) async {
    _isLoading = true;
    _notify();

    try {
      final response =
          await ApiService.updateAppointmentStatus(appointmentId, status);
      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }
  // In hospital_provider.dart - Fix the addBloodStock method

  Future<bool> addBloodStock(
      String bloodGroup, int units, String expiryDate) async {
    _isLoading = true;
    _notify();

    try {
      final response = await ApiService.addBloodStock(
        bloodGroup: bloodGroup,
        units: units,
        expiryDate: expiryDate,
      );

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      _errorMessage = response['message'] ?? 'Failed to add blood stock';
      return false;
    } catch (e) {
      debugPrint('Add blood stock error: $e');
      _errorMessage = 'Network error: $e';
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

// Also add the updateBloodStock method if missing
  Future<bool> updateBloodStock(
      String bloodGroup, int units, String expiryDate) async {
    _isLoading = true;
    _notify();

    try {
      final response = await ApiService.updateBloodStock(
        bloodGroup: bloodGroup,
        units: units,
        expiryDate: expiryDate,
      );

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Update blood stock error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

// Add deleteBloodStock method if missing
  Future<bool> deleteBloodStock(String bloodGroup) async {
    _isLoading = true;
    _notify();

    try {
      final response = await ApiService.deleteBloodStock(bloodGroup);

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Delete blood stock error: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  Future<bool> addNewResource(
      String resourceType, int total, int available) async {
    _isLoading = true;
    _notify();

    try {
      final Map<String, String> fieldMapping = {
        'generalBeds': 'general_beds',
        'icuBeds': 'icu_beds',
        'ventilators': 'ventilators',
        'oxygenBeds': 'oxygen_beds',
      };

      final String apiField = fieldMapping[resourceType] ?? resourceType;

      final response = await ApiService.addHospitalResource(
        apiField,
        total,
        available,
      );

      if (response['success'] == true) {
        await loadHospitalData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Error adding new resource: $e');
      return false;
    } finally {
      _isLoading = false;
      _notify();
    }
  }

  // Helper method to safely notify listeners
  void _notify() {
    if (!_isLoading || _isInitialized) {
      try {
        notifyListeners();
      } catch (e) {
        // If notifyListeners fails during build, schedule it for later
        WidgetsBinding.instance.addPostFrameCallback((_) {
          try {
            notifyListeners();
          } catch (_) {}
        });
      }
    }
  }
}
