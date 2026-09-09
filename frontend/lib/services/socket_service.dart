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
  Future<void>? _connectFuture;

  SocketService._();

  Future<void> connect() {
    if (_isInitialized) return Future.value();
    return _connectFuture ??= _connect();
  }

  Future<void> _connect() async {
    try {
    final prefs = await SharedPreferences.getInstance();
    final userJson = prefs.getString('user');
    final token = prefs.getString('token');
    if (userJson == null || token == null) return;

    socket = io.io(ApiService.socketUrl, <String, dynamic>{
      'transports': ['websocket'],
      // Start exactly once below. This prevents a second connection attempt
      // when authentication and a dashboard both request the singleton.
      'autoConnect': false,
      'reconnection': true,
      'reconnectionAttempts': 5,
      'reconnectionDelay': 1000,
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

    socket.onConnectError((error) {
      debugPrint('Socket connection error: $error');
    });

    socket.connect();
    } finally {
      _connectFuture = null;
    }
  }

  void disconnect() {
    if (_isInitialized) {
      socket.disconnect();
      socket.dispose();
      isConnected = false;
      _isInitialized = false;
      _connectFuture = null;
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

  void onEmergencyCreated(Function(dynamic) callback) {
    if (_isInitialized) socket.on('emergency:sos_created', callback);
  }

  void onEmergencyLifecycle(Function(dynamic) callback) {
    if (!_isInitialized) return;
    for (final event in const ['emergency:accepted', 'emergency:responding', 'emergency:ambulance_assigned', 'emergency:dispatched', 'emergency:arrived', 'emergency:resolved', 'emergency:completed', 'emergency:cancelled']) {
      socket.on(event, callback);
    }
  }

  void onAmbulanceBooking(Function(dynamic) callback) {
    if (_isInitialized) socket.on('ambulance:booking_created', callback);
  }

  void onNotificationNew(Function(dynamic) callback) {
    if (_isInitialized) socket.on('notification:new', callback);
  }

  void onNotificationRead(Function(dynamic) callback) {
    if (_isInitialized) socket.on('notification:read', callback);
  }

  /// Queue events are emitted only by the API after its transaction commits.
  void onQueueChanged(Function(dynamic) callback) {
    if (_isInitialized) socket.on('queue:changed', callback);
  }

  /// Consumers use this to reconcile persistent data after Socket.IO restores
  /// a connection. Live events are delivery only; the API remains authoritative.
  void onReconnect(void Function(dynamic) callback) {
    if (_isInitialized) socket.onReconnect(callback);
  }

  void emitEmergencyAlert(Map<String, dynamic> data) {
    if (_isInitialized) socket.emit('emergency-alert', data);
  }

  void emitEmergencyLocation(Map<String, dynamic> data) {
    if (_isInitialized) socket.emit('emergency-location-update', data);
  }

  void emitResourceUpdate(Map<String, dynamic> data) {
    if (_isInitialized) socket.emit('resource-update', data);
  }
}
