// lib/screens/patient/patient_nearby_hospitals.dart
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../models/hospital_model.dart';
import 'patient_resource_request.dart';

class PatientNearbyHospitals extends StatefulWidget {
  const PatientNearbyHospitals({super.key});

  @override
  State<PatientNearbyHospitals> createState() => _PatientNearbyHospitalsState();
}

class _PatientNearbyHospitalsState extends State<PatientNearbyHospitals> {
  bool _isLoading = true;
  List<Hospital> _hospitals = [];
  List<Map<String, dynamic>> _rawHospitals = [];
  String? _errorMessage;

  double? _userLat;
  double? _userLng;
  double _selectedRadius = 10.0;
  String _selectedSort = 'distance';
  bool _nearbyOnly = false;
  String _search = '';
  List<String> _specialties = [];
  String? _selectedSpecialty;

  final Map<String, String> _sortOptions = {
    'distance': 'Distance (Nearest)',
    'travel_time': 'Travel Time (Fastest)',
    'beds': 'Bed Availability',
    'icu': 'ICU Availability',
    'emergency': 'Emergency / Ventilators',
    'doctors': 'Doctor Availability',
    'waiting_time': 'Shortest Waiting Time',
    'rating': 'Hospital Rating',
  };

  @override
  void initState() {
    super.initState();
    _loadSpecialties();
    _initLocationAndLoad();
  }

  Future<void> _loadSpecialties() async {
    final response = await ApiService.getSpecialties();
    if (!mounted || response['success'] != true || response['data'] is! List) return;
    setState(() {
      _specialties = (response['data'] as List)
          .whereType<Map>()
          .map((item) => item['name']?.toString() ?? '')
          .where((name) => name.isNotEmpty)
          .toList();
    });
  }

  Future<void> _initLocationAndLoad() async {
    final position = await LocationService.getCurrentLocation();
    if (position != null) {
      _userLat = position.latitude;
      _userLng = position.longitude;
    }
    _loadHospitals();
  }

  Future<void> _loadHospitals() async {
    if (!mounted) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = _nearbyOnly
          ? (_userLat == null || _userLng == null
              ? {'success': false, 'message': 'Location permission is needed for nearby hospitals. You can still browse all hospitals.'}
              : await ApiService.getNearbyHospitals(_userLat!, _userLng!, radius: _selectedRadius, sortBy: _selectedSort, specialty: _selectedSpecialty))
          : await ApiService.getAllHospitals(search: _search, specialty: _selectedSpecialty);

      if (!mounted) return;

      if (response['success'] == true && response['data'] != null) {
        final List<dynamic> hospitalsData = response['data'];
        
        _hospitals = [];
        _rawHospitals = [];
        for (var data in hospitalsData) {
          try {
            final Map<String, dynamic> hospitalMap = Map<String, dynamic>.from(data);
            final hospital = Hospital.fromJson(hospitalMap);
            _hospitals.add(hospital);
            _rawHospitals.add(hospitalMap);
          } catch (e) {
            debugPrint('Error parsing hospital: $e');
          }
        }
      } else {
        _errorMessage = response['message'] ?? 'Failed to load hospitals';
      }
    } catch (e) {
      if (mounted) {
        _errorMessage = 'Network error: $e';
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _launchGoogleMapsNavigation(Hospital hospital) async {
    try {
      // Navigation must always use a fresh GPS fix, never the location fetched
      // when this screen opened or an origin inferred by Google Maps.
      final patientPosition = await LocationService.getFreshPatientLocation();
      if (!mounted) return;
      setState(() {
        _userLat = patientPosition.latitude;
        _userLng = patientPosition.longitude;
      });
      debugPrint('PATIENT LIVE LOCATION latitude: ${patientPosition.latitude}, longitude: ${patientPosition.longitude}, accuracy: ${patientPosition.accuracy}, timestamp: ${patientPosition.timestamp}');
      final hasEntrance = hospital.entranceLatitude != null &&
          hospital.entranceLongitude != null &&
          hospital.entranceLatitude! >= -90 && hospital.entranceLatitude! <= 90 &&
          hospital.entranceLongitude! >= -180 && hospital.entranceLongitude! <= 180;
      final hasHospitalCoordinates = hospital.latitude != null &&
          hospital.longitude != null &&
          hospital.latitude! >= -90 && hospital.latitude! <= 90 &&
          hospital.longitude! >= -180 && hospital.longitude! <= 180;
      if (!hasEntrance && !hasHospitalCoordinates) {
        _showLocationMessage('Directions are not available for this hospital because its location has not been recorded.');
        return;
      }
      final destinationLat = hasEntrance ? hospital.entranceLatitude! : hospital.latitude!;
      final destinationLng = hasEntrance ? hospital.entranceLongitude! : hospital.longitude!;
      debugPrint('HOSPITAL DESTINATION hospital: ${hospital.name}, latitude: $destinationLat, longitude: $destinationLng; using=${hasEntrance ? 'main entrance' : 'hospital coordinates'}');
      debugPrint('NAVIGATION origin: ${patientPosition.latitude},${patientPosition.longitude}; destination: $destinationLat,$destinationLng');

      final uri = Uri.https('www.google.com', '/maps/dir/', {
        'api': '1',
        'origin': '${patientPosition.latitude},${patientPosition.longitude}',
        'destination': '$destinationLat,$destinationLng',
        'travelmode': 'driving',
      });
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
        _showLocationMessage('Unable to open Google Maps.');
      }
    } on PatientLocationException catch (error) {
      if (mounted) _showLocationMessage(error.message);
    } catch (_) {
      if (mounted) _showLocationMessage('Unable to get your current location. Please enable GPS/location permission and try again.');
    }
  }

  void _showLocationMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_nearbyOnly ? 'Nearby Hospitals' : 'Hospital Directory'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadHospitals,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter & Sort Toolbar
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.blue.shade50,
            child: Column(
              children: [
                if (_userLat != null && _userLng != null)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                    child: Text('📍 Your current location\n${_userLat!.toStringAsFixed(6)}, ${_userLng!.toStringAsFixed(6)} • Location updated just now', style: const TextStyle(fontSize: 12)),
                  ),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Nearby hospitals only'),
                  subtitle: Text(_nearbyOnly ? 'Showing hospitals within the selected radius' : 'Showing all approved hospitals on the platform'),
                  value: _nearbyOnly,
                  onChanged: (value) { setState(() => _nearbyOnly = value); _loadHospitals(); },
                ),
                if (!_nearbyOnly) TextField(
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search name, city, specialty or doctor'),
                  onSubmitted: (value) { setState(() => _search = value); _loadHospitals(); },
                ),
                if (!_nearbyOnly) const SizedBox(height: 8),
                if (_specialties.isNotEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: _selectedSpecialty,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.medical_services),
                      labelText: 'Find healthcare by specialty',
                    ),
                    items: [
                      const DropdownMenuItem<String>(value: null, child: Text('All specialties')),
                      ..._specialties.map((specialty) => DropdownMenuItem(value: specialty, child: Text(specialty))),
                    ],
                    onChanged: (value) { setState(() => _selectedSpecialty = value); _loadHospitals(); },
                  ),
                if (_specialties.isNotEmpty) const SizedBox(height: 8),
                // Radius selection
                if (_nearbyOnly) Row(
                  children: [
                    const Text('Distance:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    const SizedBox(width: 8),
                    ...[5.0, 10.0, 20.0].map((r) => Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text('${r.toInt()} km', style: const TextStyle(fontSize: 11)),
                        selected: _selectedRadius == r,
                        onSelected: (sel) {
                          if (sel) {
                            setState(() => _selectedRadius = r);
                            _loadHospitals();
                          }
                        },
                        selectedColor: const Color(0xFF0A4D68),
                        labelStyle: TextStyle(color: _selectedRadius == r ? Colors.white : Colors.black),
                      ),
                    )),
                  ],
                ),
                if (_nearbyOnly) const SizedBox(height: 8),

                // Sort selection
                if (_nearbyOnly) Row(
                  children: [
                    const Text('Sort by:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _selectedSort,
                            isExpanded: true,
                            isDense: true,
                            items: _sortOptions.entries.map((e) => DropdownMenuItem(
                              value: e.key,
                              child: Text(e.value, style: const TextStyle(fontSize: 12)),
                            )).toList(),
                            onChanged: (val) {
                              if (val != null) {
                                setState(() => _selectedSort = val);
                                _loadHospitals();
                              }
                            },
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Main body content
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.error_outline, size: 64, color: Colors.red),
                            const SizedBox(height: 16),
                            Text(_errorMessage!),
                            const SizedBox(height: 16),
                            ElevatedButton(onPressed: _loadHospitals, child: const Text('Retry')),
                          ],
                        ),
                      )
                    : _hospitals.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.local_hospital_outlined, size: 64, color: Colors.grey),
                                const SizedBox(height: 16),
                                Text(_nearbyOnly ? 'No hospitals found in this radius' : 'No approved hospitals found', style: const TextStyle(fontSize: 16)),
                                const SizedBox(height: 16),
                                ElevatedButton(onPressed: _loadHospitals, child: const Text('Refresh')),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _loadHospitals,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _hospitals.length,
                              itemBuilder: (context, index) {
                                return _buildHospitalCard(_hospitals[index], index);
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildHospitalCard(Hospital hospital, int index) {
    final raw = index < _rawHospitals.length ? _rawHospitals[index] : {};
    final travelTime = raw['travel_time'] ?? math.max(2, (hospital.availableBeds % 15) + 3);
    final waitingTime = raw['waiting_time'] ?? 15;
    final doctorCount = raw['doctor_count'] ?? 4;
    double? parseCoordinate(dynamic value) {
      if (value is num) return value.toDouble();
      return double.tryParse(value?.toString() ?? '');
    }
    final lat = parseCoordinate(raw['latitude']);
    final lng = parseCoordinate(raw['longitude']);

    // Calculate occupancy percentage
    final occupancyPercent = hospital.totalBeds > 0
        ? ((hospital.totalBeds - hospital.availableBeds) / hospital.totalBeds * 100)
        : 0.0;
    
    Color getAvailabilityColor(int available, int total) {
      if (total == 0) return Colors.grey;
      final ratio = available / total;
      if (ratio > 0.5) return Colors.green;
      if (ratio > 0.2) return Colors.orange;
      return Colors.red;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => HospitalDetailScreen(hospital: hospital),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Hospital Name and Rating
              Row(
                children: [
                  Expanded(
                    child: Text(
                      hospital.name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (hospital.isVerified)
                    const Icon(Icons.verified, color: Colors.green, size: 16),
                  const SizedBox(width: 4),
                  if (hospital.ratingVerified && hospital.googleRating != null) Row(
                    children: [
                      const Icon(Icons.star, color: Colors.amber, size: 16),
                      Text(' ${hospital.googleRating!.toStringAsFixed(1)}${hospital.googleReviewCount == null ? '' : ' (${hospital.googleReviewCount})'}'),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                hospital.address,
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 8),

              // Location, ETA, Waiting Time, Doctors
              Wrap(
                spacing: 12,
                runSpacing: 4,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.location_on, size: 14, color: Colors.blue),
                      const SizedBox(width: 4),
                      Text(hospital.distance, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    ],
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.directions_car, size: 14, color: Colors.green),
                      const SizedBox(width: 4),
                      Text('$travelTime mins ETA', style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.access_time, size: 14, color: Colors.orange),
                      const SizedBox(width: 4),
                      Text('Wait: ${waitingTime}m', style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.person, size: 14, color: Colors.purple),
                      const SizedBox(width: 4),
                      Text('$doctorCount Docs', style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              
              // One-Tap Navigation Button & Emergency tag
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (hospital.emergencyServices)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.emergency, color: Colors.red, size: 12),
                          SizedBox(width: 4),
                          Text('24/7 Emergency', style: TextStyle(fontSize: 10, color: Colors.red, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  if (lat != null && lng != null) ElevatedButton.icon(
                    onPressed: () => _launchGoogleMapsNavigation(hospital),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      visualDensity: VisualDensity.compact,
                    ),
                    icon: const Icon(Icons.navigation, size: 14),
                    label: const Text('NAVIGATE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              
              // Specialties
              Wrap(
                spacing: 4,
                children: hospital.specialties.take(3).map((specialty) {
                  return Chip(
                    label: Text(specialty, style: const TextStyle(fontSize: 10)),
                    padding: EdgeInsets.zero,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  );
                }).toList(),
              ),
              const SizedBox(height: 8),
              
              // Bed Occupancy Bar
              LinearProgressIndicator(
                value: hospital.totalBeds > 0
                    ? (hospital.totalBeds - hospital.availableBeds) /
                        hospital.totalBeds
                    : 0,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  occupancyPercent > 80 ? Colors.red :
                  occupancyPercent > 50 ? Colors.orange : Colors.green
                ),
                minHeight: 4,
              ),
              const SizedBox(height: 4),
              Text(
                'Bed Occupancy: ${occupancyPercent.toStringAsFixed(0)}%',
                style: const TextStyle(fontSize: 10, color: Colors.grey),
              ),
              
              // Resource Quick View
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildResourceChip(
                      icon: Icons.local_hospital,
                      label: 'ICU',
                      available: hospital.availableIcu,
                      total: hospital.icuBeds,
                      color: getAvailabilityColor(hospital.availableIcu, hospital.icuBeds),
                    ),
                    _buildResourceChip(
                      icon: Icons.air,
                      label: 'Vent',
                      available: hospital.availableVentilators,
                      total: hospital.ventilatorCount,
                      color: getAvailabilityColor(hospital.availableVentilators, hospital.ventilatorCount),
                    ),
                    _buildResourceChip(
                      icon: Icons.water_drop,
                      label: 'Blood',
                      available: hospital.bloodUnits,
                      total: 100, // Max blood units reference
                      color: hospital.bloodUnits > 20 ? Colors.green : Colors.red,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildResourceChip({
    required IconData icon,
    required String label,
    required int available,
    required int total,
    required Color color,
  }) {
    return Row(
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Text(
          '$label: $available${total > 0 ? '/$total' : ''}',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: color,
          ),
        ),
      ],
    );
  }
}

// ==================== HOSPITAL DETAIL SCREEN ====================
class HospitalDetailScreen extends StatefulWidget {
  final Hospital hospital;

  const HospitalDetailScreen({
    super.key,
    required this.hospital,
  });

  @override
  State<HospitalDetailScreen> createState() => _HospitalDetailScreenState();
}

class _HospitalDetailScreenState extends State<HospitalDetailScreen> {
  static const _bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  late Future<_HospitalDetailData> _detailFuture;
  String? _selectedBloodGroup;

  Hospital get hospital => widget.hospital;

  @override
  void initState() {
    super.initState();
    _detailFuture = _loadDetails();
  }

  Future<_HospitalDetailData> _loadDetails() async {
    final responses = await Future.wait([
      ApiService.getHospitalResources(hospital.id),
      ApiService.getBloodAvailability(hospital.id),
    ]);
    final resourceResponse = responses[0];
    final bloodResponse = responses[1];
    final resources = resourceResponse['success'] == true && resourceResponse['data'] is Map
        ? Map<String, dynamic>.from(resourceResponse['data'] as Map)
        : <String, dynamic>{};
    final bloodFailed = bloodResponse['success'] != true || bloodResponse['data'] is! List;
    final bloodStock = <String, int>{};
    if (!bloodFailed) {
      for (final entry in bloodResponse['data'] as List) {
        if (entry is! Map) continue;
        final group = _normaliseBloodGroup(entry['blood_group']?.toString());
        if (group == null) continue;
        final rawUnits = entry['units_available'];
        final units = rawUnits is num
            ? rawUnits.round()
            : num.tryParse(rawUnits?.toString() ?? '')?.round() ?? 0;
        bloodStock[group] = (bloodStock[group] ?? 0) + units;
      }
    }
    debugPrint('[BLOOD BANK] Hospital ID: ${hospital.id}');
    debugPrint('[BLOOD BANK] API response: $bloodResponse');
    debugPrint('[BLOOD BANK] Parsed stock: $bloodStock');
    return _HospitalDetailData(resources: resources, bloodStock: bloodStock, bloodFailed: bloodFailed);
  }

  static String? _normaliseBloodGroup(String? value) {
    final raw = value?.trim().toUpperCase() ?? '';
    if (_bloodGroups.contains(raw)) return raw;
    final valueKey = raw.replaceAll(RegExp('[ _-]+'), '');
    const aliases = {
      'A+': 'A+', 'APOSITIVE': 'A+', 'APOS': 'A+',
      'A-': 'A-', 'ANEGATIVE': 'A-', 'ANEG': 'A-',
      'B+': 'B+', 'BPOSITIVE': 'B+', 'BPOS': 'B+',
      'B-': 'B-', 'BNEGATIVE': 'B-', 'BNEG': 'B-',
      'O+': 'O+', 'OPOSITIVE': 'O+', 'OPOS': 'O+',
      'O-': 'O-', 'ONEGATIVE': 'O-', 'ONEG': 'O-',
      'AB+': 'AB+', 'ABPOSITIVE': 'AB+', 'ABPOS': 'AB+',
      'AB-': 'AB-', 'ABNEGATIVE': 'AB-', 'ABNEG': 'AB-',
    };
    return aliases[valueKey];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(hospital.name),
      ),
      body: FutureBuilder<_HospitalDetailData>(
        future: _detailFuture,
        builder: (context, snapshot) {
          final data = snapshot.data ?? const _HospitalDetailData();
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _buildHospitalHeader(),
              const SizedBox(height: 18),
              const Text('RESOURCE AVAILABILITY', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: .5)),
              const SizedBox(height: 8),
              _buildResourceGrid(data.resources),
              const SizedBox(height: 18),
              Row(children: [
                const Text('BLOOD BANK', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: .5)),
                const Spacer(),
                if (snapshot.connectionState == ConnectionState.waiting) const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
              ]),
              const SizedBox(height: 8),
              if (data.bloodFailed && snapshot.connectionState != ConnectionState.waiting)
                _buildBloodUnavailable()
              else ...[
                if (data.bloodStock.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Text(
                      'No blood stock is currently recorded for this hospital.',
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                _buildBloodGrid(data.bloodStock),
              ],
              const SizedBox(height: 12),
              SizedBox(width: double.infinity, child: OutlinedButton.icon(
                onPressed: data.bloodFailed || _selectedBloodGroup == null ? null : () => _requestBlood(data.bloodStock, _selectedBloodGroup!),
                icon: const Icon(Icons.water_drop_outlined), label: const Text('Request Blood'),
              )),
              const SizedBox(height: 12),
              _HospitalDoctorsSection(hospital: hospital),
              const SizedBox(height: 12),
              SizedBox(width: double.infinity, child: ElevatedButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BookingScreen(hospital: hospital))),
                child: const Text('Book Appointment'),
              )),
            ]),
          );
        },
      ),
    );
  }

  Widget _buildHospitalHeader() => Card(
    margin: EdgeInsets.zero,
    child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(hospital.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
        if (hospital.isVerified) const Icon(Icons.verified, color: Colors.green, size: 20),
      ]),
      if (hospital.ratingVerified && hospital.googleRating != null) ...[
        const SizedBox(height: 4),
        Row(children: [const Icon(Icons.star, size: 17, color: Colors.amber), const SizedBox(width: 4), Text('${hospital.googleRating!.toStringAsFixed(1)} Google${hospital.googleReviewCount == null ? '' : ' · ${hospital.googleReviewCount} reviews'}')]),
      ],
      const SizedBox(height: 6),
      _headerLine(Icons.location_on_outlined, hospital.address),
      if (hospital.phone.isNotEmpty) _headerLine(Icons.phone_outlined, hospital.phone),
    ])),
  );

  Widget _headerLine(IconData icon, String label) => Padding(padding: const EdgeInsets.only(top: 3), child: Row(children: [Icon(icon, size: 16, color: Colors.grey.shade700), const SizedBox(width: 6), Expanded(child: Text(label, style: const TextStyle(fontSize: 13)))]));

  Widget _buildResourceGrid(Map<String, dynamic> values) {
    final resources = [
      ('General Beds', Icons.king_bed_outlined, _number(values['general_beds_available'], hospital.availableBeds), _number(values['general_beds_total'], hospital.totalBeds)),
      ('ICU Beds', Icons.local_hospital_outlined, _number(values['icu_beds_available'], hospital.availableIcu), _number(values['icu_beds_total'], hospital.icuBeds)),
      ('Oxygen Beds', Icons.air_outlined, _number(values['oxygen_beds_available'], hospital.oxygenBedsAvailable), _number(values['oxygen_beds_total'], hospital.oxygenBedsTotal)),
      ('Ventilators', Icons.monitor_heart_outlined, _number(values['ventilators_available'], hospital.availableVentilators), _number(values['ventilators_total'], hospital.ventilatorCount)),
    ];
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 820 ? 4 : constraints.maxWidth >= 460 ? 2 : 1;
      return GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: columns, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: columns == 1 ? 3.8 : 1.75, children: resources.map((item) => _resourceTile(item.$1, item.$2, item.$3, item.$4)).toList());
    });
  }

  int _number(dynamic value, int fallback) => value is num ? value.round() : int.tryParse(value?.toString() ?? '') ?? fallback;

  Widget _resourceTile(String name, IconData icon, int available, int total) {
    final status = available == 0 ? 'Full' : total > 0 && available / total <= .2 ? 'Limited' : 'Available';
    final color = status == 'Available' ? Colors.green : status == 'Limited' ? Colors.orange : Colors.red;
    return Card(margin: EdgeInsets.zero, child: Padding(padding: const EdgeInsets.all(10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
      Row(children: [Icon(icon, size: 18, color: const Color(0xFF0A4D68)), const SizedBox(width: 5), Expanded(child: Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)))]),
      const SizedBox(height: 5), Text('$available / $total', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
      Text('$available available', style: const TextStyle(fontSize: 11, color: Colors.grey)),
      const SizedBox(height: 2), Row(children: [Icon(Icons.circle, size: 8, color: color), const SizedBox(width: 4), Text(status, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600))]),
    ])));
  }

  Widget _buildBloodGrid(Map<String, int> stock) => LayoutBuilder(builder: (context, constraints) {
    final columns = constraints.maxWidth >= 720 ? 4 : 2;
    return GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: columns, mainAxisSpacing: 7, crossAxisSpacing: 7, childAspectRatio: 3.1, children: _bloodGroups.map((group) {
      final units = stock[group];
      final text = units == null ? 'Not recorded' : '$units ${units == 1 ? 'unit' : 'units'}';
      final color = units == null ? Colors.grey : units == 0 ? Colors.red : units <= 5 ? Colors.orange : Colors.green;
      final isSelected = group == _selectedBloodGroup;
      return InkWell(onTap: units == null ? null : () => setState(() => _selectedBloodGroup = group), borderRadius: BorderRadius.circular(8), child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7), decoration: BoxDecoration(color: color.withValues(alpha: .08), borderRadius: BorderRadius.circular(8), border: Border.all(color: isSelected ? const Color(0xFF0A4D68) : color.withValues(alpha: .25), width: isSelected ? 2 : 1)), child: Row(children: [Text(group, style: const TextStyle(fontWeight: FontWeight.bold)), const SizedBox(width: 8), Expanded(child: Text(text, textAlign: TextAlign.right, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)))])));
    }).toList());
  });

  Widget _buildBloodUnavailable() => Row(children: [const Icon(Icons.cloud_off_outlined, color: Colors.orange), const SizedBox(width: 8), const Expanded(child: Text('Blood availability unavailable')), TextButton(onPressed: () => setState(() => _detailFuture = _loadDetails()), child: const Text('Retry'))]);

  void _requestBlood(Map<String, int> stock, String selected) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => PatientResourceRequest(hospitalId: hospital.id, hospitalName: hospital.name, resourceType: 'blood', bloodGroup: selected, availableQuantity: stock[selected])));
  }
}

class _HospitalDetailData {
  const _HospitalDetailData({this.resources = const {}, this.bloodStock = const {}, this.bloodFailed = false});
  final Map<String, dynamic> resources;
  final Map<String, int> bloodStock;
  final bool bloodFailed;
}

class _HospitalDoctorsSection extends StatelessWidget {
  const _HospitalDoctorsSection({required this.hospital});
  final Hospital hospital;

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: ApiService.getHospitalDoctors(hospital.id),
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()));
      }
      final data = snapshot.data;
      final doctors = data?['data'] is List ? List<Map<String, dynamic>>.from((data!['data'] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item))) : <Map<String, dynamic>>[];
      if (doctors.isEmpty) return const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Doctors', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), SizedBox(height: 8), Text('Doctor information is not currently provided.')]);
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Doctors at ${hospital.name}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        ...doctors.map((doctor) => Card(child: ListTile(
          leading: const CircleAvatar(child: Icon(Icons.person_outline)),
          title: Text(doctor['name']?.toString() ?? 'Doctor'),
          subtitle: Text([doctor['designation'], doctor['specialization'], doctor['qualification'], doctor['experience_display']].where((value) => value != null && value.toString().isNotEmpty).join('\n')),
          isThreeLine: true,
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DoctorProfileScreen(hospital: hospital, doctor: doctor))),
          trailing: const Icon(Icons.chevron_right),
        ))),
      ]);
    },
  );
}

class DoctorProfileScreen extends StatelessWidget {
  const DoctorProfileScreen({super.key, required this.hospital, required this.doctor});
  final Hospital hospital;
  final Map<String, dynamic> doctor;

  @override
  Widget build(BuildContext context) {
    final available = doctor['availability_status'] == true;
    final fields = <MapEntry<String, dynamic>>[
      MapEntry('Qualification', doctor['qualification']), MapEntry('Designation', doctor['designation']),
      MapEntry('Specialization', doctor['specialization']), MapEntry('Department', doctor['department']),
      MapEntry('Experience', doctor['experience_display'] ?? (doctor['experience_years'] == null ? null : '${doctor['experience_years']} years')),
      MapEntry('Availability', doctor['availability'] ?? (available ? 'Available' : 'Not currently provided')),
      MapEntry('Verification', doctor['verification_status']),
    ];
    return Scaffold(appBar: AppBar(title: const Text('Doctor Profile')), body: ListView(padding: const EdgeInsets.all(16), children: [
      Center(child: CircleAvatar(radius: 40, backgroundImage: doctor['profile_image'] == null ? null : NetworkImage(doctor['profile_image'].toString()), child: doctor['profile_image'] == null ? const Icon(Icons.person, size: 40) : null)),
      const SizedBox(height: 12), Center(child: Text(doctor['name']?.toString() ?? 'Doctor', style: Theme.of(context).textTheme.titleLarge)), const SizedBox(height: 18),
      ...fields.where((entry) => entry.value != null && entry.value.toString().isNotEmpty).map((entry) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('${entry.key}: ${entry.value}'))),
      if (doctor['bio'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(doctor['bio'].toString())),
      const Divider(height: 30), Text(hospital.name, style: const TextStyle(fontWeight: FontWeight.bold)), Text(hospital.address), const SizedBox(height: 18),
      SizedBox(width: double.infinity, child: ElevatedButton(onPressed: available ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => BookingScreen(hospital: hospital, initialDoctorId: doctor['id'] as int?))) : null, child: Text(available ? 'Book Appointment' : 'Availability not currently provided'))),
    ]));
  }
}

// ==================== BOOKING SCREEN ====================
class BookingScreen extends StatefulWidget {
  final Hospital hospital;
  final int? initialDoctorId;
  final String? qrPayload;
  final String? qrDate;

  const BookingScreen({
    super.key,
    required this.hospital,
    this.initialDoctorId,
    this.qrPayload,
    this.qrDate,
  });

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  DateTime _selectedDate = DateTime.now();
  String? _selectedSlot;
  String? _selectedDoctorId;
  String? _selectedDepartment;
  final TextEditingController _symptomsController = TextEditingController();
  bool _isBooking = false;
  bool _isLoadingDoctors = false;
  bool _isLoadingSlots = false;
  List<String> _availableSlots = [];
  String? _availabilityReason;
  List<Map<String, dynamic>> _doctors = [];
  List<String> _departments = [];

  @override
  void initState() {
    super.initState();
    final qrDate = DateTime.tryParse(widget.qrDate ?? '');
    if (qrDate != null) _selectedDate = qrDate;
    _loadDoctors();
  }

  Future<void> _loadDoctors() async {
    setState(() => _isLoadingDoctors = true);

    try {
      final response = await ApiService.getHospitalDoctors(widget.hospital.id);
      if (response['success'] == true && response['data'] is List) {
        _doctors = (response['data'] as List)
            .whereType<Map>()
            .map((doctor) => Map<String, dynamic>.from(doctor))
            .toList();

        // Extract unique departments
        final departments = _doctors
            .map((d) => d['department'] ?? d['specialization'] ?? 'General')
            .where((d) => d.isNotEmpty)
            .toSet()
            .toList();
        _departments = ['All Departments', ...departments];

        // Set initial selection
        if (_doctors.isNotEmpty) {
          final requestedId = widget.initialDoctorId?.toString();
          _selectedDoctorId = _doctors.any((doctor) => doctor['id'].toString() == requestedId)
              ? requestedId
              : _doctors[0]['id'].toString();
          await _loadAvailableSlots();
        }
      }
    } catch (e) {
      debugPrint('Error loading doctors: $e');
    } finally {
      setState(() => _isLoadingDoctors = false);
    }
  }

  String get _formattedDate => '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

  String get _availabilityMessage {
    switch (_availabilityReason) {
      case 'DOCTOR_ON_LEAVE': return 'Doctor unavailable on this date';
      case 'NO_SCHEDULE_CONFIGURED': return 'Appointment availability has not been configured for this doctor';
      case 'ALL_SLOTS_BOOKED': return 'All appointment slots are booked for this date';
      case 'NO_FUTURE_SLOTS': return 'No future appointment times remain today';
      case 'INVALID_DATE': return 'Please choose a future appointment date';
      case 'AVAILABILITY_ERROR': return 'Unable to load appointment availability. Please try again.';
      default: return 'No appointments available for this date';
    }
  }

  Future<void> _loadAvailableSlots() async {
    final doctorId = int.tryParse(_selectedDoctorId ?? '');
    if (doctorId == null) return;
    setState(() { _isLoadingSlots = true; _selectedSlot = null; _availableSlots = []; _availabilityReason = null; });
    final requestDate = _formattedDate;
    final response = await ApiService.getDoctorAvailableSlots(widget.hospital.id, doctorId, requestDate);
    if (!mounted) return;
    // Ignore an older response when a user changes doctor/date quickly.
    if (requestDate != _formattedDate || doctorId != int.tryParse(_selectedDoctorId ?? '')) return;
    final slots = response['slots'] is List ? (response['slots'] as List).whereType<Map>().where((slot) => slot['available'] == true).map((slot) => '${slot['time']}').toList() : <String>[];
    setState(() { _availableSlots = slots; _availabilityReason = response['success'] == true ? response['reason'] as String? : 'AVAILABILITY_ERROR'; _isLoadingSlots = false; });
  }

  List<Map<String, dynamic>> get _filteredDoctors {
    if (_selectedDepartment == null ||
        _selectedDepartment == 'All Departments') {
      return _doctors;
    }
    return _doctors
        .where((d) =>
            (d['department'] ?? d['specialization'] ?? '') ==
            _selectedDepartment)
        .toList();
  }

  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: widget.qrDate == null ? DateTime.now() : _selectedDate,
      lastDate: widget.qrDate == null
          ? DateTime.now().add(const Duration(days: 365))
          : _selectedDate,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Color(0xFF0A4D68),
              onPrimary: Colors.white,
              onSurface: Color(0xFF0A4D68),
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
      await _loadAvailableSlots();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredDoctors = _filteredDoctors;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Book Appointment'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.hospital.name,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                     Text(widget.hospital.address),
                    if (widget.qrPayload != null) ...[
                      const SizedBox(height: 8),
                      const Text('Scan verified hospital QR',
                          style: TextStyle(color: Colors.green)),
                    ],
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 16),

            // Date Picker
            InkWell(
              onTap: () => _selectDate(context),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today, color: Color(0xFF0A4D68)),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Appointment Date',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_selectedDate.day}/${_selectedDate.month}/${_selectedDate.year}',
                            style: const TextStyle(fontSize: 16),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.arrow_drop_down, color: Colors.grey),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Times come only from the doctor-slot API; a device time picker
            // would permit arbitrary values such as 17:16.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.access_time, color: Color(0xFF0A4D68)),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Appointment Time',
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                        const SizedBox(height: 4),
                        _isLoadingSlots
                            ? const Text('Loading available times...')
                            : DropdownButtonHideUnderline(
                                child: DropdownButton<String>(
                                  value: _selectedSlot,
                                  isExpanded: true,
                                  hint: Text(
                                    _availableSlots.isEmpty
                                        ? _availabilityMessage
                                        : 'Select an available time',
                                  ),
                                  items: _availableSlots
                                      .map(
                                        (slot) => DropdownMenuItem(
                                          value: slot,
                                          child: Text(slot.substring(0, 5)),
                                        ),
                                      )
                                      .toList(),
                                  onChanged: (value) {
                                    setState(() => _selectedSlot = value);
                                  },
                                ),
                              ),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_drop_down, color: Colors.grey),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Department Filter
            if (_departments.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _selectedDepartment ?? 'All Departments',
                    isExpanded: true,
                    items: _departments.map((dept) {
                      return DropdownMenuItem(
                        value: dept,
                        child: Text(dept),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedDepartment = value;
                        if (_filteredDoctors.isNotEmpty) {
                          _selectedDoctorId =
                              _filteredDoctors[0]['id'].toString();
                        }
                      });
                      _loadAvailableSlots();
                    },
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Doctor Selection
            if (_isLoadingDoctors) ...[
              const Center(child: CircularProgressIndicator()),
              const SizedBox(height: 16),
            ] else if (filteredDoctors.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _selectedDoctorId,
                    isExpanded: true,
                    hint: const Text('Select Doctor'),
                    items: filteredDoctors.map((doctor) {
                      final name = doctor['name'] ?? 'Doctor';
                      final dept = doctor['department'] ??
                          doctor['specialization'] ??
                          '';
                      return DropdownMenuItem(
                        value: doctor['id'].toString(),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w500)),
                            if (dept.isNotEmpty)
                              Text(dept,
                                  style: const TextStyle(
                                      fontSize: 12, color: Colors.grey)),
                          ],
                        ),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedDoctorId = value;
                      });
                      _loadAvailableSlots();
                    },
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ] else ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning, color: Colors.orange),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'No doctors available in this department. Please select a different department.',
                        style: TextStyle(fontSize: 12, color: Colors.orange),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Symptoms
            TextField(
              controller: _symptomsController,
              decoration: const InputDecoration(
                labelText: 'Symptoms / Reason',
                prefixIcon: Icon(Icons.medical_services),
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 24),

            // Book Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isBooking || _selectedDoctorId == null || _selectedSlot == null
                    ? null
                    : _bookAppointment,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0A4D68),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: _isBooking
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Confirm Booking'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _bookAppointment() async {
    setState(() => _isBooking = true);

    try {
      final formattedTime = _selectedSlot!;
      final formattedDate = _formattedDate;

      final appointmentData = {
        'hospital_id': widget.hospital.id,
        'doctor_id': int.parse(_selectedDoctorId!),
        'appointment_date': formattedDate,
        'appointment_time': formattedTime,
        'symptoms': _symptomsController.text,
        if (widget.qrPayload != null) 'qr_payload': widget.qrPayload,
      };

      debugPrint('Creating appointment with data: $appointmentData');
      debugPrint('Hospital ID: ${widget.hospital.id}');
      debugPrint('Hospital Name: ${widget.hospital.name}');

      final response = await ApiService.createAppointment(appointmentData);

      debugPrint('Appointment response: $response');

      if (response['success'] == true && mounted) {
        final booking = response['data'] is Map
            ? Map<String, dynamic>.from(response['data'])
            : <String, dynamic>{};
        final token = booking['token'] is Map
            ? Map<String, dynamic>.from(booking['token'])
            : <String, dynamic>{};
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Appointment Confirmed'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Appointment booked at ${widget.hospital.name}'),
                const SizedBox(height: 8),
                Text('Date: $formattedDate'),
                Text('Time: ${formattedTime.substring(0, 5)}'),
                if (token['token_number'] != null)
                  Text('Token: ${token['token_number']}'),
                if (booking['id'] != null) Text('Booking ID: ${booking['id']}'),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.shade200),
                  ),
                  child: const Text(
                    'ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ You will receive a confirmation SMS/Email shortly.',
                    style: TextStyle(fontSize: 12, color: Colors.green),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  Navigator.pop(context);
                },
                child: const Text('OK'),
              ),
            ],
          ),
        );
      } else if (mounted) {
        if (response['code'] == 'SLOT_UNAVAILABLE') {
          await _loadAvailableSlots();
          if (!mounted) return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response['code'] == 'SLOT_UNAVAILABLE'
                ? 'This slot is no longer available. Please select another available time.'
                : (response['message'] ?? 'Booking failed')),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      debugPrint('Booking error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Network error. Please try again.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isBooking = false);
      }
    }
  }
}
