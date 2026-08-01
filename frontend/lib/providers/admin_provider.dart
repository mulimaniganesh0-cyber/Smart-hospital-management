// lib/providers/admin_provider.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class AdminProvider extends ChangeNotifier {
  List<Map<String, dynamic>> _hospitals = [];
  bool _isLoading = false;
  String? _errorMessage;
  Map<String, dynamic>? _stats;

  List<Map<String, dynamic>> get hospitals => _hospitals;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  Map<String, dynamic>? get stats => _stats;

  Future<void> loadHospitals() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await ApiService.getAllHospitalsWithResources();
      if (response['success'] == true) {
        _hospitals = List<Map<String, dynamic>>.from(response['data'] ?? []);
      } else {
        _errorMessage = response['message'] ?? 'Failed to load hospitals';
      }
    } catch (e) {
      _errorMessage = 'Network error: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> deleteHospital(int hospitalId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await ApiService.deleteHospital(hospitalId);
      
      if (response['success'] == true) {
        _hospitals.removeWhere((h) => h['id'] == hospitalId);
        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _errorMessage = response['message'] ?? 'Failed to delete hospital';
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      _errorMessage = 'Network error: $e';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  void clearData() {
    _hospitals = [];
    _stats = null;
    _errorMessage = null;
    notifyListeners();
  }
}