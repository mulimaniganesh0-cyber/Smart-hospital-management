// lib/services/socket_service.dart
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

class SocketService {
  static SocketService? _instance;
  static SocketService get instance => _instance ??= SocketService._();

  late io.Socket socket;
  bool isConnected = false;
  bool _isInitialized = false;

  SocketService._();

  Future<void> connect() async {
    if (_isInitialized) return;
    final prefs = await SharedPreferences.getInstance();
    final userJson = prefs.getString('user');
    final token = prefs.getString('token');
    if (userJson == null || token == null) return;

    socket = io.io(ApiService.socketUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
      'auth': {'token': token},
    });
    _isInitialized = true;

    socket.onConnect((_) {
      debugPrint('Socket connected');
      isConnected = true;

      // Join user-specific room
      final user = Map<String, dynamic>.from(jsonDecode(userJson));
      if (user['user_type'] == 'hospital') {
        socket.emit('join-hospital');
      } else if (user['user_type'] == 'patient') {
        socket.emit('join-patient');
      }
    });

    socket.onDisconnect((_) {
      debugPrint('Socket disconnected');
      isConnected = false;
    });

    socket.connect();
  }

  void disconnect() {
    if (_isInitialized) {
      socket.disconnect();
      socket.dispose();
      isConnected = false;
      _isInitialized = false;
    }
  }

  void onNewEmergency(Function(dynamic) callback) {
    if (_isInitialized) socket.on('new-emergency', callback);
  }

  void onResourcesChanged(Function(dynamic) callback) {
    if (_isInitialized) socket.on('resources-changed', callback);
  }

  void onDashboardStatsChanged(Function(dynamic) callback) {
    if (_isInitialized) socket.on('dashboard-stats-changed', callback);
  }

  void onBloodStockChanged(Function(dynamic) callback) {
    if (_isInitialized) socket.on('blood-stock-changed', callback);
  }

  void onEmergencyStatusUpdate(Function(dynamic) callback) {
    if (_isInitialized) socket.on('emergency-status-update', callback);
  }

  void emitEmergencyAlert(Map<String, dynamic> data) {
    if (_isInitialized) socket.emit('emergency-alert', data);
  }

  void emitResourceUpdate(Map<String, dynamic> data) {
    if (_isInitialized) socket.emit('resource-update', data);
  }
}
