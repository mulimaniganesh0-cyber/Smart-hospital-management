// lib/providers/auth_provider.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user_model.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';

class AuthProvider extends ChangeNotifier {
  UserModel? _currentUser;
  bool _isLoading = false;
  String? _errorMessage;

  UserModel? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _currentUser != null;
  String? get errorMessage => _errorMessage;

  AuthProvider() {
    _loadUser();
  }

  Future<void> _loadUser() async {
    final prefs = await SharedPreferences.getInstance();
    final userJson = prefs.getString('user');
    final token = prefs.getString('token');
    if (userJson != null && token != null && token.isNotEmpty) {
      try {
        _currentUser = UserModel.fromJson(json.decode(userJson));
        await SocketService.instance.connect();
        notifyListeners();
      } catch (e) {
        debugPrint('Error loading user: $e');
        await prefs.remove('user');
        await prefs.remove('token');
      }
    } else if (userJson != null || token != null) {
      await prefs.remove('user');
      await prefs.remove('token');
    }
  }

  Future<bool> signup({
    required String name,
    required String email,
    required String phone,
    required String password,
    required String userType,
    Map<String, dynamic>? additionalData,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await ApiService.register({
        'name': name,
        'email': email,
        'phone': phone,
        'password': password,
        'user_type': userType,
        'additional_data': additionalData,
      });

      if (response['success'] == true) {
        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _errorMessage = response['message'] ?? 'Registration failed';
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      debugPrint('Signup exception: $e');
      _errorMessage = 'Network error: $e';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await ApiService.login(email, password);

      if (response['success'] == true) {
        final userData = response['user'];

        // Ensure userData has all required fields
        final user = UserModel(
          id: userData['id'].toString(),
          name: userData['name'] ?? '',
          email: userData['email'] ?? '',
          phone: userData['phone'] ?? '',
          userType: userData['user_type'] ?? '',
          additionalData: {
            'password_reset_required':
                userData['password_reset_required'] == true
          },
        );

        _currentUser = user;

        // Save to shared preferences
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('user', json.encode(user.toJson()));
        await SocketService.instance.connect();

        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _errorMessage = response['message'] ?? 'Invalid credentials';
        debugPrint('Login failed: $_errorMessage');
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      debugPrint('Login exception: $e');
      _errorMessage = 'Network error: $e';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> forgotPassword(String email) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final success = await ApiService.forgotPassword(email);
      _isLoading = false;
      notifyListeners();
      return success;
    } catch (e) {
      _errorMessage = 'Network error: $e';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    SocketService.instance.disconnect();
    await ApiService.logout();
    _currentUser = null;
    notifyListeners();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
