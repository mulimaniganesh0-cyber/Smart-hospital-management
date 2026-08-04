// lib/screens/patient/patient_emergency_request.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/api_service.dart';
import '../../services/socket_service.dart';

class PatientEmergencyRequest extends StatefulWidget {
  const PatientEmergencyRequest({super.key});

  @override
  State<PatientEmergencyRequest> createState() => _PatientEmergencyRequestState();
}

class _PatientEmergencyRequestState extends State<PatientEmergencyRequest> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _formKey = GlobalKey<FormState>();
  
  String _emergencyType = 'Medical';
  String _severity = 'High';
  String _description = '';
  bool _isRequesting = false;
  
  double? _currentLat;
  double? _currentLng;
  bool _isLocating = false;
  String _locationStatus = 'Fetching location...';

  int? _activeEmergencyId;
  Map<String, dynamic>? _activeEmergencyData;
  StreamSubscription<Position>? _positionSubscription;
  
  List<Map<String, dynamic>> _sosHistory = [];
  bool _isLoadingHistory = false;

  final List<String> _emergencyTypes = ['Medical', 'Accident', 'Cardiac', 'Stroke', 'Trauma', 'Other'];
  final List<String> _severityLevels = ['High', 'Medium', 'Low'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _checkLocationPermissionAndFetch();
    _processOfflineQueue();
    _loadSosHistory();
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  // Handle location permissions gracefully
  Future<void> _checkLocationPermissionAndFetch() async {
    setState(() {
      _isLocating = true;
      _locationStatus = 'Checking permissions...';
    });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _isLocating = false;
          _locationStatus = 'Location services disabled. Please turn on GPS.';
        });
        _showLocationServiceDialog();
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _isLocating = false;
          _locationStatus = 'Location permissions permanently denied.';
        });
        _showPermanentlyDeniedDialog();
        return;
      }

      if (permission == LocationPermission.denied) {
        setState(() {
          _isLocating = false;
          _locationStatus = 'Location permission denied.';
        });
        return;
      }

      // High accuracy current position
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      if (mounted) {
        setState(() {
          _currentLat = position.latitude;
          _currentLng = position.longitude;
          _isLocating = false;
          _locationStatus = 'Live GPS Location Acquired';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLocating = false;
          _locationStatus = 'Error getting location: $e';
        });
      }
    }
  }

  void _showLocationServiceDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Location Services Disabled'),
        content: const Text('Please enable GPS location services to pinpoint your location during emergencies.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              Geolocator.openLocationSettings();
            },
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
  }

  void _showPermanentlyDeniedDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Location Permission Required'),
        content: const Text('Location permission is permanently denied. Please enable it in App Settings to allow emergency SOS location sharing.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              openAppSettings();
            },
            child: const Text('Open App Settings'),
          ),
        ],
      ),
    );
  }

  // Start continuous location stream when SOS is active
  void _startContinuousLocationStream(int emergencyId) {
    _positionSubscription?.cancel();

    const LocationSettings locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 5,
    );

    _positionSubscription = Geolocator.getPositionStream(locationSettings: locationSettings).listen(
      (Position position) {
        if (mounted) {
          setState(() {
            _currentLat = position.latitude;
            _currentLng = position.longitude;
          });
        }

        // Send to backend via REST
        ApiService.updateEmergencyLiveLocation(
          emergencyId: emergencyId,
          latitude: position.latitude,
          longitude: position.longitude,
        );

        // Send via Socket.io
        SocketService.instance.socket.emit('emergency-location-update', {
          'emergencyId': emergencyId,
          'latitude': position.latitude,
          'longitude': position.longitude,
          'timestamp': DateTime.now().toIso8601String(),
        });
      },
      onError: (err) {
        debugPrint('Location stream error: $err');
      },
    );
  }

  Future<void> _sendEmergencyRequest() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isRequesting = true);

    final payload = {
      'emergency_type': _emergencyType,
      'severity': _severity.toLowerCase(),
      'description': _description,
      'location_lat': _currentLat,
      'location_lng': _currentLng,
      'timestamp': DateTime.now().toIso8601String(),
    };

    try {
      final response = await ApiService.triggerEmergencySos(payload);

      if (response['success'] == true && response['data'] != null) {
        final data = response['data'];
        final emergencyId = data['id'];

        setState(() {
          _activeEmergencyId = emergencyId;
          _activeEmergencyData = data;
          _isRequesting = false;
        });

        // Start real-time stream
        _startContinuousLocationStream(emergencyId);

        // Also emit Socket alert
        SocketService.instance.emitEmergencyAlert({
          'emergencyId': emergencyId,
          'hospitalId': data['hospital_id'],
          'emergency_type': _emergencyType,
          'severity': _severity,
          'lat': _currentLat,
          'lng': _currentLng,
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('🚨 Emergency SOS Broadcasted! Nearest hospital and caregivers notified.'),
              backgroundColor: Colors.green,
              duration: Duration(seconds: 4),
            ),
          );
        }
        _loadSosHistory();
      } else {
        // Handle failure / store offline
        await _queueOfflinePayload(payload);
        if (mounted) {
          setState(() => _isRequesting = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(response['message'] ?? 'Request queued offline. Will retry automatically.'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } catch (e) {
      await _queueOfflinePayload(payload);
      if (mounted) {
        setState(() => _isRequesting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Network unavailable. SOS request saved offline & will retry when connected.'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    }
  }

  Future<void> _queueOfflinePayload(Map<String, dynamic> payload) async {
    final prefs = await SharedPreferences.getInstance();
    final queued = prefs.getStringList('offline_sos_queue') ?? [];
    queued.add(jsonEncode(payload));
    await prefs.setStringList('offline_sos_queue', queued);
  }

  Future<void> _processOfflineQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final queued = prefs.getStringList('offline_sos_queue') ?? [];
    if (queued.isEmpty) return;

    final remaining = <String>[];
    for (String item in queued) {
      try {
        final payload = jsonDecode(item);
        final res = await ApiService.triggerEmergencySos(payload);
        if (res['success'] != true) {
          remaining.add(item);
        }
      } catch (_) {
        remaining.add(item);
      }
    }
    await prefs.setStringList('offline_sos_queue', remaining);
  }

  Future<void> _stopEmergency() async {
    if (_activeEmergencyId == null) return;

    try {
      await ApiService.endEmergency(_activeEmergencyId!, status: 'resolved');
      _positionSubscription?.cancel();

      setState(() {
        _activeEmergencyId = null;
        _activeEmergencyData = null;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Emergency ended. Live location sharing stopped.'),
            backgroundColor: Colors.blue,
          ),
        );
      }
      _loadSosHistory();
    } catch (e) {
      debugPrint('Error ending emergency: $e');
    }
  }

  Future<void> _loadSosHistory() async {
    setState(() => _isLoadingHistory = true);
    try {
      final res = await ApiService.getPatientSosHistory();
      if (res['success'] == true && res['data'] != null) {
        setState(() {
          _sosHistory = List<Map<String, dynamic>>.from(res['data']);
        });
      }
    } catch (e) {
      debugPrint('Error loading SOS history: $e');
    } finally {
      if (mounted) setState(() => _isLoadingHistory = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Emergency SOS Dashboard'),
        backgroundColor: Colors.red.shade700,
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(icon: Icon(Icons.sos), text: 'Active SOS'),
            Tab(icon: Icon(Icons.history), text: 'SOS History'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildActiveSosTab(),
          _buildSosHistoryTab(),
        ],
      ),
    );
  }

  Widget _buildActiveSosTab() {
    if (_activeEmergencyId != null) {
      return _buildActiveTrackingView();
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Warning banner
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [Colors.red.shade50, Colors.orange.shade50]),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(12)),
                    child: const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Triggering SOS instantly notifies the nearest hospital, dispatches available ambulances, and alerts family contacts.',
                      style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Emergency Type
            _buildDropdown('Emergency Type', _emergencyTypes, _emergencyType, (v) => setState(() => _emergencyType = v!), Icons.medical_services),
            const SizedBox(height: 16),

            // Severity Level
            _buildDropdown('Severity Level', _severityLevels, _severity, (v) => setState(() => _severity = v!), Icons.warning, isSeverity: true),
            const SizedBox(height: 16),

            // Description
            TextFormField(
              onChanged: (v) => _description = v,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Describe Emergency Details',
                prefixIcon: Icon(Icons.description),
                border: OutlineInputBorder(),
                hintText: 'Describe patient condition, symptoms, or location notes',
              ),
              validator: (v) => v == null || v.isEmpty ? 'Please describe the emergency condition' : null,
            ),
            const SizedBox(height: 20),

            // Location status card
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: Row(
                children: [
                  Icon(
                    _currentLat == null ? Icons.location_searching : Icons.my_location,
                    color: _currentLat == null ? Colors.orange : Colors.green,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _locationStatus,
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: _currentLat == null ? Colors.orange.shade800 : Colors.green.shade800,
                          ),
                        ),
                        if (_currentLat != null)
                          Text(
                            'Lat: ${_currentLat!.toStringAsFixed(4)}, Lng: ${_currentLng!.toStringAsFixed(4)}',
                            style: TextStyle(fontSize: 11, color: Colors.grey[700]),
                          ),
                      ],
                    ),
                  ),
                  if (_isLocating)
                    const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  else
                    IconButton(
                      icon: const Icon(Icons.refresh, color: Colors.blue),
                      onPressed: _checkLocationPermissionAndFetch,
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Large SOS Button
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                onPressed: _isRequesting ? null : _sendEmergencyRequest,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: 4,
                ),
                icon: _isRequesting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.sos, size: 28),
                label: Text(
                  _isRequesting ? 'BROADCASTING SOS...' : 'SEND EMERGENCY SOS NOW',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 1),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveTrackingView() {
    final hospital = _activeEmergencyData?['hospital'];
    final ambulance = _activeEmergencyData?['ambulance'];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Active Alert Banner
          Card(
            color: Colors.red.shade900,
            child: const Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(Icons.radar, color: Colors.white, size: 36),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ACTIVE EMERGENCY BROADCAST', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                        SizedBox(height: 2),
                        Text('Continuously sharing live GPS location with emergency network...', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Assigned Hospital Card
          Card(
            child: ListTile(
              leading: const CircleAvatar(backgroundColor: Colors.blue, child: Icon(Icons.local_hospital, color: Colors.white)),
              title: Text(hospital?['name'] ?? 'Nearest Hospital Notified'),
              subtitle: Text(hospital?['phone'] != null ? 'Phone: ${hospital['phone']}' : 'Address: ${hospital?['address'] ?? 'Search in progress'}'),
              trailing: const Icon(Icons.check_circle, color: Colors.green),
            ),
          ),
          const SizedBox(height: 12),

          // Ambulance Tracking Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.airport_shuttle, color: Colors.red, size: 28),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ambulance != null ? 'Ambulance Dispatched (${ambulance['vehicle_number']})' : 'Searching for Available Ambulance...',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                            ),
                            Text(
                              ambulance != null ? 'Driver: ${ambulance['driver_name']} • ${ambulance['driver_phone'] ?? ''}' : 'Hospital dispatch team is assigning a vehicle',
                              style: TextStyle(color: Colors.grey[700], fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(color: Colors.red, backgroundColor: Colors.redAccent),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Live GPS Sync: Active', style: TextStyle(color: Colors.green.shade700, fontSize: 12, fontWeight: FontWeight.bold)),
                      const Text('Estimated ETA: ~8 mins', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Stop Emergency Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _stopEmergency,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.grey.shade800,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: const Icon(Icons.stop_circle),
              label: const Text('END EMERGENCY & STOP LOCATION SHARING'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSosHistoryTab() {
    if (_isLoadingHistory) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_sosHistory.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.history_outlined, size: 64, color: Colors.grey),
            const SizedBox(height: 12),
            const Text('No previous SOS emergency records'),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _loadSosHistory, child: const Text('Refresh')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadSosHistory,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _sosHistory.length,
        itemBuilder: (context, index) {
          final item = _sosHistory[index];
          final isResolved = item['status'] == 'completed' || item['status'] == 'resolved';

          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: isResolved ? Colors.green.shade100 : Colors.red.shade100,
                child: Icon(
                  isResolved ? Icons.check : Icons.warning,
                  color: isResolved ? Colors.green : Colors.red,
                ),
              ),
              title: Text(item['emergency_type'] ?? 'Emergency'),
              subtitle: Text(
                'Status: ${item['status']?.toString().toUpperCase()}\nHospital: ${item['hospital_name'] ?? 'Unassigned'}\nDate: ${item['created_at']?.toString().split('T')[0] ?? ''}',
              ),
              isThreeLine: true,
            ),
          );
        },
      ),
    );
  }

  Widget _buildDropdown(String label, List<String> items, String value, Function(String?) onChanged, IconData icon, {bool isSeverity = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(12)),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              isExpanded: true,
              items: items.map((e) => DropdownMenuItem(value: e, child: isSeverity ? Row(children: [Container(width: 12, height: 12, decoration: BoxDecoration(color: e == 'High' ? Colors.red : e == 'Medium' ? Colors.orange : Colors.green, shape: BoxShape.circle)), const SizedBox(width: 8), Text(e)]) : Text(e))).toList(),
              onChanged: onChanged,
            ),
          ),
        ),
      ],
    );
  }
}
