// lib/screens/patient/ambulance_booking.dart
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:hospital_resource_management/providers/auth_provider.dart' show AuthProvider;
import 'package:provider/provider.dart' show Provider;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import '../../services/api_service.dart';
import '../../widgets/app_ui.dart';

class AmbulanceBookingScreen extends StatefulWidget {
  const AmbulanceBookingScreen({super.key});

  @override
  State<AmbulanceBookingScreen> createState() => _AmbulanceBookingScreenState();
}

class _AmbulanceBookingScreenState extends State<AmbulanceBookingScreen> {
  String? _selectedAmbulanceType;
  String? _selectedLocationType;
  String _patientCondition = '';
  String _specialRequirements = '';
  String _customAddress = '';
  bool _isBooking = false;
  bool _isLoading = true;
  List<Map<String, dynamic>> _nearbyAmbulances = [];
  String? _errorMessage;

  // Live Location Data
  Position? _currentPosition;
  String _currentAddress = 'Fetching location...';
  bool _isLocationLoading = true;

  final List<String> _ambulanceTypes = [
    'All Types',
    'Basic Life Support (BLS)',
    'Advanced Life Support (ALS)',
    'Cardiac Ambulance',
    'Neonatal Ambulance',
    'Air Ambulance',
  ];

  final List<Map<String, dynamic>> _locationTypes = [
    {'label': 'Live location', 'value': 'live'},
    {'label': 'Home', 'value': 'home'},
    {'label': 'Work', 'value': 'work'},
    {'label': 'Custom address', 'value': 'custom'},
  ];

  final List<String> _ambulanceSources = [
    'All Ambulances',
    'Hospital Ambulances',
    'Private Ambulances',
  ];

  String _selectedSource = 'All Ambulances';

  @override
  void initState() {
    super.initState();
    _selectedAmbulanceType = _ambulanceTypes.first;
    _selectedLocationType = 'live';
    _getCurrentLocation();
  }

  Future<void> _getCurrentLocation() async {
    setState(() => _isLocationLoading = true);

    try {
      // Check permissions
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() {
            _isLocationLoading = false;
            _currentAddress = 'Location permission denied';
          });
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _isLocationLoading = false;
          _currentAddress = 'Location permanently denied';
        });
        return;
      }


      // Get current position
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      if (mounted) {
        setState(() {
          _currentPosition = position;
        });
        _loadNearbyAmbulances();

        // Get address from coordinates
        try {
          final placemarks = await placemarkFromCoordinates(
            position.latitude,
            position.longitude,
          );

          if (placemarks.isNotEmpty) {
            final place = placemarks.first;
            setState(() {
              _currentAddress =
                  '${place.subLocality ?? ''}, ${place.locality ?? ''}, ${place.country ?? ''}'
                      .replaceAll(RegExp(r'^,\s*'), '');
              if (_currentAddress.isEmpty) {
                _currentAddress =
                    '${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}';
              }
            });
          }
        } catch (e) {
          setState(() {
            _currentAddress =
                '${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}';
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _currentAddress = 'Location unavailable. Please enter manually.';
          _isLocationLoading = false;
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isLocationLoading = false);
      }
    }
  }

  String _getPickupAddress() {
    switch (_selectedLocationType) {
      case 'live':
        return _currentAddress;
      case 'home':
        return _customAddress.isNotEmpty ? _customAddress : _currentAddress;
      case 'work':
        return _customAddress.isNotEmpty ? _customAddress : _currentAddress;
      case 'custom':
        return _customAddress.isNotEmpty
            ? _customAddress
            : 'Enter custom address';
      default:
        return _currentAddress;
    }
  }

  Future<void> _loadNearbyAmbulances() async {
    if (_currentPosition == null) {
      setState(() {
        _errorMessage = 'Location not available. Please enable GPS.';
        _isLoading = false;
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await ApiService.getNearbyAmbulances(
        _currentPosition!.latitude,
        _currentPosition!.longitude,
        source: _selectedSource != 'All Ambulances' ? _selectedSource : null,
        type: _selectedAmbulanceType != 'All Types'
            ? _selectedAmbulanceType
            : null,
      );

      if (mounted) {
        if (response['success'] == true) {
          _nearbyAmbulances =
              List<Map<String, dynamic>>.from(response['data'] ?? []);
        } else {
          _errorMessage = 'Ambulance availability could not be loaded. Please try again.';
        }
      }
    } catch (e) {
      if (mounted) {
        _errorMessage = 'Ambulance availability could not be loaded. Please try again.';
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ambulance care'),
          backgroundColor: Colors.red,
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _getCurrentLocation,
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Book Now', icon: Icon(Icons.medical_services)),
              Tab(text: 'Nearby Ambulances', icon: Icon(Icons.location_on)),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildBookingForm(),
            _buildNearbyAmbulances(),
          ],
        ),
      ),
    );
  }

  Widget _buildBookingForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.red.shade200),
            ),
            child: const Row(
              children: [
                Icon(Icons.emergency, color: Colors.red),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Emergency? Call 108 for immediate assistance',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Current Location Display
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _currentPosition != null
                  ? Colors.blue.shade50
                  : Colors.red.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _currentPosition != null
                    ? Colors.blue.shade200
                    : Colors.red.shade200,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  _isLocationLoading
                      ? Icons.location_searching
                      : (_currentPosition != null
                          ? Icons.location_on
                          : Icons.location_off),
                  color: _currentPosition != null
                      ? Colors.blue.shade700
                      : Colors.red.shade700,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _currentPosition != null
                            ? 'Live Location'
                            : 'Location Unavailable',
                        style: TextStyle(
                          fontSize: 12,
                          color: _currentPosition != null
                              ? Colors.grey
                              : Colors.red,
                        ),
                      ),
                      Text(
                        _isLocationLoading
                            ? 'Fetching location...'
                            : _currentAddress,
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
                if (!_isLocationLoading)
                  IconButton(
                    icon: const Icon(Icons.refresh, size: 20),
                    onPressed: () {
                      _getCurrentLocation();
                      _loadNearbyAmbulances();
                    },
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Ambulance Type Filter
          const Text(
            'Ambulance Type',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(12),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _selectedAmbulanceType,
                isExpanded: true,
                items: _ambulanceTypes.map((String type) {
                  return DropdownMenuItem<String>(
                    value: type,
                    child: Text(type),
                  );
                }).toList(),
                onChanged: (String? value) {
                  setState(() {
                    _selectedAmbulanceType = value!;
                  });
                  _loadNearbyAmbulances();
                },
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Location Type
          const Text(
            'Pickup Location',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(12),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _selectedLocationType,
                isExpanded: true,
                items: _locationTypes.map((Map<String, dynamic> type) {
                  return DropdownMenuItem<String>(
                    value: type['value'],
                    child: Text(type['label']),
                  );
                }).toList(),
                onChanged: (String? value) {
                  setState(() {
                    _selectedLocationType = value!;
                    if (value != 'live' && _customAddress.isEmpty) {
                      _customAddress = _currentAddress;
                    }
                  });
                },
              ),
            ),
          ),
          const SizedBox(height: 8),

          // Custom Address Input
          if (_selectedLocationType != 'live') ...[
            TextField(
              onChanged: (value) => _customAddress = value,
              controller: TextEditingController(text: _customAddress),
              decoration: const InputDecoration(
                hintText: 'Enter full address',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.edit_location),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Selected Location Display
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.location_pin, size: 20, color: Colors.grey),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _getPickupAddress(),
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Patient Details
          const Text(
            'Patient Information',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          TextField(
            onChanged: (value) => _patientCondition = value,
            decoration: const InputDecoration(
              labelText: 'Patient Condition / Symptoms',
              hintText: 'Describe the medical condition',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.medical_information),
            ),
            maxLines: 3,
          ),
          const SizedBox(height: 12),
          TextField(
            onChanged: (value) => _specialRequirements = value,
            decoration: const InputDecoration(
              labelText: 'Special Requirements',
              hintText: 'Oxygen, stretcher, wheelchair, etc.',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.settings),
            ),
          ),
          const SizedBox(height: 24),

          // Book Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: (_currentPosition == null || _isBooking)
                  ? null
                  : _bookAmbulance,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
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
                  : const Text('Book Ambulance Now'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNearbyAmbulances() {
    return Column(
      children: [
        // Filter row
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              const Text('Source: ',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _selectedSource,
                      isExpanded: true,
                      items: _ambulanceSources.map((String source) {
                        return DropdownMenuItem<String>(
                          value: source,
                          child: Text(source),
                        );
                      }).toList(),
                      onChanged: (String? value) {
                        setState(() {
                          _selectedSource = value!;
                        });
                        _loadNearbyAmbulances();
                      },
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        // Location refresh button
        if (_currentPosition != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Icon(Icons.gps_fixed, size: 14, color: Colors.green),
                const SizedBox(width: 8),
                Text(
                  'Showing ambulances near: ${_currentAddress.split(',').take(2).join(',')}',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
          ),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _errorMessage != null
                  ? CareGuideEmptyState(
                      icon: Icons.local_taxi_outlined,
                      title: 'Ambulances are unavailable',
                      message: _errorMessage!,
                      action: ElevatedButton.icon(onPressed: _getCurrentLocation, icon: const Icon(Icons.refresh), label: const Text('Try again')),
                    )
                  : _nearbyAmbulances.isEmpty
                      ? CareGuideEmptyState(
                          icon: Icons.local_taxi_outlined,
                          title: 'No ambulances nearby',
                          message: 'Try refreshing your location or changing the service filter.',
                          action: OutlinedButton.icon(onPressed: _getCurrentLocation, icon: const Icon(Icons.my_location), label: const Text('Refresh location')),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _nearbyAmbulances.length,
                          itemBuilder: (context, index) {
                            final ambulance = _nearbyAmbulances[index];
                            return _buildAmbulanceCard(ambulance);
                          },
                        ),
        ),
      ],
    );
  }

  Widget _buildAmbulanceCard(Map<String, dynamic> ambulance) {
    final String name = ambulance['name']?.toString() ?? 'Ambulance Service';
    final String distance = ambulance['distance']?.toString() ?? 'N/A';
    final String eta = ambulance['eta']?.toString() ?? '10 mins';
    final String type = ambulance['type']?.toString() ?? 'Basic Life Support';
    final bool available = ambulance['is_available'] ?? true;
    final bool isPrivate = ambulance['is_private'] ?? false;
    final String hospitalName = ambulance['hospital_name']?.toString() ?? '';

    double rating = 4.5;
    final dynamic ratingValue = ambulance['rating'];
    if (ratingValue != null) {
      if (ratingValue is double) {
        rating = ratingValue;
      } else if (ratingValue is int) {
        rating = ratingValue.toDouble();
      } else if (ratingValue is String) {
        rating = double.tryParse(ratingValue) ?? 4.5;
      } else if (ratingValue is num) {
        rating = ratingValue.toDouble();
      }
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color:
                        available ? Colors.green.shade50 : Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    isPrivate ? Icons.car_repair : Icons.local_hospital,
                    color: available ? Colors.green : Colors.red,
                    size: 30,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              name,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: isPrivate
                                  ? Colors.purple.shade100
                                  : Colors.blue.shade100,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              isPrivate ? 'Private' : 'Hospital',
                              style: TextStyle(
                                fontSize: 10,
                                color: isPrivate ? Colors.purple : Colors.blue,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (hospitalName.isNotEmpty)
                        Text('Affiliated: $hospitalName',
                            style: const TextStyle(fontSize: 12)),
                      Text(type, style: const TextStyle(fontSize: 12)),
                      Row(
                        children: [
                          const Icon(Icons.star, size: 14, color: Colors.amber),
                          Text(' ${rating.toStringAsFixed(1)}'),
                          const SizedBox(width: 12),
                          const Icon(Icons.location_on, size: 14),
                          Text(' $distance'),
                        ],
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    CareGuideStatusBadge(label: available ? 'Available' : 'Busy', tone: available ? CareGuideStatusTone.success : CareGuideStatusTone.danger),
                    const SizedBox(height: 4),
                    Text(
                      'ETA: $eta',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            if (available) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _bookSpecificAmbulance(ambulance),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                      child: const Text('Book Now'),
                    ),
                  ),
                ],
              ),
            ] else ...[
              const SizedBox(height: 8),
              const Text(
                'Currently unavailable. Please try another service.',
                style: TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _bookAmbulance() {
    if (_currentPosition == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Location not available. Please enable GPS.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isBooking = true);

    // Get patient phone from SharedPreferences
    SharedPreferences.getInstance().then((prefs) {
      final userJson = prefs.getString('user');
      String patientPhone = '';
      if (userJson != null) {
        try {
          final user = Map<String, dynamic>.from(jsonDecode(userJson));
          patientPhone = user['phone'] ?? '';
        } catch (_) {
          // Keep the booking flow available when locally cached data is invalid.
        }
      }

      // Get patient name
      if (!context.mounted) return;
      if (!mounted) return;
      final user =
          Provider.of<AuthProvider>(context, listen: false).currentUser;
      final patientName = user?.name ?? 'Patient';

      final bookingData = {
        'ambulance_type': _selectedAmbulanceType,
        'pickup_lat': _currentPosition!.latitude,
        'pickup_lng': _currentPosition!.longitude,
        'pickup_address': _getPickupAddress(),
        'patient_condition': _patientCondition,
        'special_requirements': _specialRequirements,
        'patient_phone': patientPhone,
        'patient_name': patientName,
        'location_type': _selectedLocationType,
        'custom_address':
            _selectedLocationType != 'live' ? _customAddress : null,
      };

      ApiService.bookAmbulance(bookingData).then((response) {
        if (mounted) {
          setState(() => _isBooking = false);
          if (response['success']) {
            _showBookingConfirmation(response['tracking_id'] ??
                'AMB-${DateTime.now().millisecondsSinceEpoch}');
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(response['message'] ?? 'Booking failed'),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      });
    });
  }

  void _bookSpecificAmbulance(Map<String, dynamic> ambulance) {
    if (_currentPosition == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Location not available. Please enable GPS.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isBooking = true);

    SharedPreferences.getInstance().then((prefs) {
      final userJson = prefs.getString('user');
      String patientPhone = '';
      String patientName = 'Patient';
      if (userJson != null) {
        try {
          final user = Map<String, dynamic>.from(jsonDecode(userJson));
          patientPhone = user['phone'] ?? '';
          patientName = user['name'] ?? 'Patient';
        } catch (_) {
          // Fall back to the default contact details when locally cached data is invalid.
        }
      }

      final bookingData = {
        'ambulance_id': ambulance['id'],
        'pickup_lat': _currentPosition!.latitude,
        'pickup_lng': _currentPosition!.longitude,
        'pickup_address': _getPickupAddress(),
        'patient_condition': _patientCondition,
        'special_requirements': _specialRequirements,
        'patient_phone': patientPhone,
        'patient_name': patientName,
        'location_type': _selectedLocationType,
        'custom_address':
            _selectedLocationType != 'live' ? _customAddress : null,
      };

      ApiService.bookAmbulance(bookingData).then((response) {
        if (mounted) {
          setState(() => _isBooking = false);
          if (response['success']) {
            _showBookingConfirmation(response['tracking_id'] ??
                ambulance['id']?.toString() ??
                'AMB-${DateTime.now().millisecondsSinceEpoch}');
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(response['message'] ?? 'Booking failed'),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      });
    });
  }

  void _showBookingConfirmation(String trackingId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ã°Å¸Å¡â€˜ Ambulance Booked!'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Your ambulance has been dispatched successfully.'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Ã°Å¸â€œÂ Pickup Location:'),
                  const SizedBox(height: 4),
                  Text(
                    _getPickupAddress(),
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 8),
                  const Text('Ã¢ÂÂ±Ã¯Â¸Â Estimated Arrival: 5-7 minutes'),
                  const SizedBox(height: 4),
                  Text('Ã°Å¸â€ â€ Tracking ID: $trackingId'),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: Colors.orange),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Driver will contact you shortly at your registered phone number.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
            },
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}
