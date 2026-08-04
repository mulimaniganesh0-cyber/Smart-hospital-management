// lib/providers/patient_provider.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class PatientProvider extends ChangeNotifier {
  Map<String, dynamic>? _patientData;
  List<Map<String, dynamic>> _bookings = [];
  List<Map<String, dynamic>> _medicalHistory = [];
  bool _isLoading = false;
  String? _errorMessage;

  Map<String, dynamic>? get patientData => _patientData;
  List<Map<String, dynamic>> get bookings => _bookings;
  List<Map<String, dynamic>> get medicalHistory => _medicalHistory;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  PatientProvider() {
    loadPatientData();
  }

  // lib/providers/patient_provider.dart
// Only update the loadPatientData method

Future<void> loadPatientData() async {
  // Don't reload if already loading
  if (_isLoading) return;
  
  _isLoading = true;
  _errorMessage = null;
  notifyListeners();

  try {
    final response = await ApiService.getPatientProfile();
    if (response['success'] && response['data'] != null) {
      _patientData = response['data'];
      _bookings = List<Map<String, dynamic>>.from(_patientData?['bookings'] ?? []);
      _medicalHistory = List<Map<String, dynamic>>.from(_patientData?['medical_history'] ?? []);
    } else {
      _errorMessage = response['message'] ?? 'Failed to load patient data';
    }
  } catch (e) {
    _errorMessage = 'Network error: $e';
    debugPrint('Error loading patient data: $e');
  }

  _isLoading = false;
  notifyListeners();
}
  Future<bool> updateProfile({
    String? name,
    String? phone,
    String? bloodGroup,
    String? emergencyContact,
  }) async {
    _isLoading = true;
    notifyListeners();

    try {
      final updates = <String, dynamic>{};
      if (name != null) updates['name'] = name;
      if (phone != null) updates['phone'] = phone;
      if (bloodGroup != null) updates['blood_group'] = bloodGroup;
      if (emergencyContact != null) updates['emergency_contact'] = emergencyContact;

      final response = await ApiService.updatePatientProfile(updates);
      
      if (response['success'] == true) {
        await loadPatientData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Update profile error: $e');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> addBooking(Map<String, dynamic> booking) async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await ApiService.createAppointment(booking);
      debugPrint('Create appointment response: $response');
      
      if (response['success'] == true) {
        await loadPatientData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Add booking error: $e');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> cancelBooking(int appointmentId) async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await ApiService.cancelAppointment(appointmentId);
      
      if (response['success'] == true) {
        await loadPatientData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Cancel booking error: $e');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
 // lib/providers/patient_provider.dart

// Remove or comment out any incorrect updateBloodStock calls
// If you need to update blood stock, use the correct signature:
Future<bool> updateBloodStock(String bloodGroup, int units, String expiryDate) async {
  try {
    final response = await ApiService.updateBloodStock(
      bloodGroup: bloodGroup,
      units: units,
      expiryDate: expiryDate,
    );
    return response['success'] == true;
  } catch (e) {
    return false;
  }
}

Future<List<Map<String, dynamic>>> getResourceRequests() async {
  try {
    final response = await ApiService.getPatientResourceRequests();
    if (response['success'] && response['data'] != null) {
      return List<Map<String, dynamic>>.from(response['data']);
    }
    return [];
  } catch (e) {
    debugPrint('Error getting resource requests: $e');
    return [];
  }
}
}
