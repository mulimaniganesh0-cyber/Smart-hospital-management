// lib/screens/patient/patient_home_screen.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/screens/patient/patient_campaigns.dart';
import 'package:provider/provider.dart';
import '../../providers/patient_provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import 'patient_nearby_hospitals.dart';
import 'patient_bookings.dart';
import 'patient_profile.dart';
import 'ambulance_booking.dart';
import 'blood_bank_screen.dart';
import 'chatbot_screen.dart';
import 'patient_resource_request.dart';
import 'patient_care_hub.dart';

class PatientHomeScreen extends StatefulWidget {
  const PatientHomeScreen({super.key});

  @override
  State<PatientHomeScreen> createState() => _PatientHomeScreenState();
}

class _PatientHomeScreenState extends State<PatientHomeScreen> {
  int _selectedIndex = 0;

  final List<Widget> _screens = [
    const PatientDashboard(),
    const PatientNearbyHospitals(),
    const PatientResourceRequest(),
    const PatientCampaigns(),
    const PatientBookings(),
    const PatientProfile(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: _screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.local_hospital_outlined),
            selectedIcon: Icon(Icons.local_hospital),
            label: 'Hospitals',
          ),
          NavigationDestination(
            icon: Icon(Icons.request_page_outlined),
            selectedIcon: Icon(Icons.request_page),
            label: 'Requests',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign),
            label: 'Camps',
          ),
          NavigationDestination(
            icon: Icon(Icons.bookmark_outline),
            selectedIcon: Icon(Icons.bookmark),
            label: 'Bookings',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'careguide_fab',
        backgroundColor: const Color(0xFF0A4D68),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.health_and_safety_outlined),
        label: const Text('CareGuide'),
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ChatbotScreen()),
        ),
      ),
    );
  }
}

class PatientDashboard extends StatefulWidget {
  const PatientDashboard({super.key});

  @override
  State<PatientDashboard> createState() => _PatientDashboardState();
}

class _PatientDashboardState extends State<PatientDashboard> {
  Map<String, dynamic> _stats = {
    'nearby_hospitals': 0,
    'available_icus': 0,
    'blood_units': 0,
  };
  bool _isRequesting = false;

  @override
  void initState() {
    super.initState();
    _loadDashboardStats();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadDashboardStats() async {
    if (!context.mounted) return;

    try {
      final response = await ApiService.getNearbyHospitals(28.6139, 77.2090);
      if (!context.mounted) return;

      if (response['success'] && response['data'] != null) {
        final hospitals = response['data'];
        int totalIcus = 0;
        int totalBloodUnits = 0;

        for (var hospital in hospitals) {
          totalIcus += (hospital['available_icu'] ?? 0) as int;
          totalBloodUnits += (hospital['blood_units'] ?? 0) as int;
        }

        if (mounted) {
          setState(() {
            _stats = {
              'nearby_hospitals': hospitals.length,
              'available_icus': totalIcus,
              'blood_units': totalBloodUnits,
            };
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading stats: $e');
    }
  }

  // Updated method to handle blood request with blood group selection
  Future<void> _showResourceRequestDialog(
      BuildContext context, String resourceType) async {
    if (_isRequesting) return;

    setState(() => _isRequesting = true);

    try {
      String selectedHospital = '';
      int quantity = 1;
      String selectedBloodGroup = 'A+';
      final descriptionController = TextEditingController();
      List<Map<String, dynamic>> hospitals = [];
      List<String> bloodGroups = [
        'A+',
        'A-',
        'B+',
        'B-',
        'AB+',
        'AB-',
        'O+',
        'O-'
      ];
      Map<String, int> bloodAvailability = {};
      bool loadingHospitals = true;

      // Load hospitals
      final response = await ApiService.getAllHospitals(verified: '');
      if (response['success'] && mounted) {
        hospitals = List<Map<String, dynamic>>.from(response['data'] ?? []);
        loadingHospitals = false;
      }

      if (!mounted) {
        setState(() => _isRequesting = false);
        return;
      }

      if (!context.mounted) return;
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Row(
                children: [
                  Icon(
                    resourceType == 'General Bed'
                        ? Icons.king_bed
                        : resourceType == 'ICU Bed'
                            ? Icons.local_hospital
                            : resourceType == 'Ventilator'
                                ? Icons.air
                                : resourceType == 'Blood Unit'
                                    ? Icons.bloodtype
                                    : Icons.medical_services,
                    color: Colors.red,
                  ),
                  const SizedBox(width: 8),
                  Text('Request $resourceType'),
                ],
              ),
              content: SizedBox(
                width: double.maxFinite,
                child: loadingHospitals
                    ? const Center(child: CircularProgressIndicator())
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Hospital Dropdown
                          DropdownButtonFormField<String>(
                            decoration: const InputDecoration(
                              labelText: 'Select Hospital *',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.local_hospital),
                            ),
                            items: [
                              const DropdownMenuItem(
                                value: '',
                                child: Text('Select a hospital...'),
                              ),
                              ...hospitals.map((hospital) {
                                return DropdownMenuItem(
                                  value: hospital['id'].toString(),
                                  child: Text(hospital['name'] ?? 'Hospital'),
                                );
                              }),
                            ],
                            onChanged: (value) {
                              setDialogState(() {
                                selectedHospital = value!;
                              });
                              // Load blood availability when hospital is selected
                              if (value != null && value.isNotEmpty) {
                                _loadBloodAvailability(int.parse(value),
                                    (availability) {
                                  setDialogState(() {
                                    bloodAvailability = availability;
                                  });
                                });
                              }
                            },
                          ),
                          const SizedBox(height: 12),

                          // Blood Group Selection (only for Blood Unit request)
                          if (resourceType == 'Blood Unit') ...[
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.red.shade50,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.red.shade200),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Blood Availability',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.red,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: bloodGroups.map((group) {
                                      int available =
                                          bloodAvailability[group] ?? 0;
                                      bool isAvailable = available > 0 &&
                                          selectedHospital.isNotEmpty;
                                      return GestureDetector(
                                        onTap: () {
                                          if (isAvailable) {
                                            setDialogState(() {
                                              selectedBloodGroup = group;
                                            });
                                          }
                                        },
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 6,
                                          ),
                                          decoration: BoxDecoration(
                                            color: selectedBloodGroup == group
                                                ? Colors.red
                                                : isAvailable
                                                    ? Colors.white
                                                    : Colors.grey.shade200,
                                            borderRadius:
                                                BorderRadius.circular(20),
                                            border: Border.all(
                                              color: selectedBloodGroup == group
                                                  ? Colors.red
                                                  : isAvailable
                                                      ? Colors.green
                                                      : Colors.grey.shade300,
                                              width: selectedBloodGroup == group
                                                  ? 2
                                                  : 1,
                                            ),
                                          ),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Text(
                                                group,
                                                style: TextStyle(
                                                  color: selectedBloodGroup ==
                                                          group
                                                      ? Colors.white
                                                      : isAvailable
                                                          ? Colors.black
                                                          : Colors.grey,
                                                  fontWeight:
                                                      selectedBloodGroup ==
                                                              group
                                                          ? FontWeight.bold
                                                          : FontWeight.normal,
                                                ),
                                              ),
                                              const SizedBox(width: 4),
                                              if (selectedHospital.isNotEmpty)
                                                Text(
                                                  '($available)',
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    color: isAvailable
                                                        ? Colors.green
                                                        : Colors.red,
                                                  ),
                                                ),
                                              if (!isAvailable &&
                                                  selectedHospital.isNotEmpty)
                                                const Icon(
                                                  Icons.close,
                                                  size: 14,
                                                  color: Colors.red,
                                                ),
                                            ],
                                          ),
                                        ),
                                      );
                                    }).toList(),
                                  ),
                                  if (selectedHospital.isEmpty)
                                    const Padding(
                                      padding: EdgeInsets.only(top: 8),
                                      child: Text(
                                        'Please select a hospital first to check blood availability',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.orange,
                                        ),
                                      ),
                                    ),
                                  if (selectedHospital.isNotEmpty &&
                                      bloodAvailability.values
                                          .every((v) => v == 0))
                                    const Padding(
                                      padding: EdgeInsets.only(top: 8),
                                      child: Text(
                                        'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â No blood units available in this hospital',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.red,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            // Selected blood group display
                            if (selectedBloodGroup.isNotEmpty &&
                                selectedHospital.isNotEmpty)
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.green.shade50,
                                  borderRadius: BorderRadius.circular(8),
                                  border:
                                      Border.all(color: Colors.green.shade200),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.check_circle,
                                        color: Colors.green, size: 16),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Selected: $selectedBloodGroup (${bloodAvailability[selectedBloodGroup] ?? 0} units available)',
                                      style: TextStyle(
                                        color: Colors.green.shade700,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            const SizedBox(height: 12),
                          ],

                          // Quantity
                          TextFormField(
                            initialValue: '1',
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Quantity *',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.numbers),
                            ),
                            onChanged: (value) {
                              quantity = int.tryParse(value) ?? 1;
                            },
                          ),
                          const SizedBox(height: 12),

                          // Description
                          TextField(
                            controller: descriptionController,
                            decoration: const InputDecoration(
                              labelText: 'Description / Reason',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.description),
                            ),
                            maxLines: 3,
                          ),
                        ],
                      ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(context);
                    setState(() => _isRequesting = false);
                  },
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () {
                    // Validation
                    if (selectedHospital.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Please select a hospital'),
                          backgroundColor: Colors.red,
                        ),
                      );
                      return;
                    }

                    if (resourceType == 'Blood Unit' &&
                        selectedBloodGroup.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Please select a blood group'),
                          backgroundColor: Colors.red,
                        ),
                      );
                      return;
                    }

                    // Check if enough blood available
                    if (resourceType == 'Blood Unit') {
                      int available =
                          bloodAvailability[selectedBloodGroup] ?? 0;
                      if (available < quantity) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                                'Not enough $selectedBloodGroup blood. Available: $available, Requested: $quantity'),
                            backgroundColor: Colors.red,
                          ),
                        );
                        return;
                      }
                    }

                    Navigator.pop(context);
                    _submitResourceRequest(
                      context,
                      selectedHospital,
                      resourceType,
                      quantity,
                      descriptionController.text,
                      selectedBloodGroup,
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A4D68),
                  ),
                  child: const Text('Submit Request'),
                ),
              ],
            );
          },
        ),
      );
    } catch (e) {
      setState(() => _isRequesting = false);
      if (mounted) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Network error. Please try again.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _loadBloodAvailability(
      int hospitalId, Function(Map<String, int>) onLoaded) async {
    try {
      final response = await ApiService.getBloodAvailability(hospitalId);
      if (response['success'] && response['data'] != null) {
        Map<String, int> availability = {};
        for (var stock in response['data']) {
          availability[stock['blood_group']] = stock['units_available'] ?? 0;
        }
        onLoaded(availability);
      }
    } catch (e) {
      debugPrint('Error loading blood availability: $e');
    }
  }

  Future<void> _submitResourceRequest(
    BuildContext context,
    String hospitalId,
    String resourceType,
    int quantity,
    String description,
    String bloodGroup,
  ) async {
    try {
      final resourceTypeMap = {
        'General Bed': 'bed',
        'ICU Bed': 'icu',
        'Ventilator': 'ventilator',
        'Blood Unit': 'blood',
      };

      Map<String, dynamic> requestData = {
        'hospital_id': int.parse(hospitalId),
        'resource_type':
            resourceTypeMap[resourceType] ?? resourceType.toLowerCase(),
        'quantity': quantity,
        'description': description,
      };

      // Add blood group for blood requests
      if (resourceType == 'Blood Unit') {
        requestData['blood_group'] = bloodGroup;
      }

      final requestResponse =
          await ApiService.createResourceRequest(requestData);

      setState(() => _isRequesting = false);

      if (requestResponse['success'] && mounted) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$resourceType request sent successfully'),
            backgroundColor: Colors.green,
          ),
        );
      } else if (mounted) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(requestResponse['message'] ?? 'Request failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      setState(() => _isRequesting = false);
      if (mounted) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Network error. Please try again.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final patientProvider = Provider.of<PatientProvider>(context);
    final patientData = patientProvider.patientData;
    final authProvider = Provider.of<AuthProvider>(context);

    final String patientName =
        patientData?['name'] ?? authProvider.currentUser?.name ?? 'Patient';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Patient Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _loadDashboardStats();
              patientProvider.loadPatientData();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _loadDashboardStats();
          await patientProvider.loadPatientData();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome Card
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF0A4D68), Color(0xFF088395)],
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Welcome back,',
                      style: TextStyle(color: Colors.white, fontSize: 14),
                    ),
                    Text(
                      patientName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildEmergencyMetric(
                          context,
                          icon: Icons.local_hospital,
                          label: 'Nearby\nHospitals',
                          value: _stats['nearby_hospitals'].toString(),
                        ),
                        _buildEmergencyMetric(
                          context,
                          icon: Icons.air,
                          label: 'Available\nICUs',
                          value: _stats['available_icus'].toString(),
                        ),
                        _buildEmergencyMetric(
                          context,
                          icon: Icons.water_drop,
                          label: 'Blood\nUnits',
                          value: _stats['blood_units'].toString(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Quick Services
              const Text(
                'Quick Services',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: QuickActionCard(
                      icon: Icons.medical_services,
                      title: 'Book\nAmbulance',
                      color: Colors.red,
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) =>
                                const AmbulanceBookingScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: QuickActionCard(
                      icon: Icons.bloodtype,
                      title: 'Blood\nBank',
                      color: Colors.red,
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const BloodBankScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: QuickActionCard(
                      icon: Icons.local_hospital,
                      title: 'Find\nHospitals',
                      color: const Color(0xFF0A4D68),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) =>
                                const PatientNearbyHospitals(),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Ongoing care tools
              InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const PatientCareHub()),
                ),
                child: Ink(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEAF7F8),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: Color(0xFF0A4D68),
                        child: Icon(Icons.favorite_outline, color: Colors.white),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('My Care Hub', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            SizedBox(height: 2),
                            Text('Reminders, records, family access and payments'),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Request Resources
              const Text(
                'Request Resources',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ResourceRequestCard(
                      icon: Icons.king_bed,
                      label: 'General Bed',
                      color: Colors.blue,
                      onTap: () =>
                          _showResourceRequestDialog(context, 'General Bed'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ResourceRequestCard(
                      icon: Icons.local_hospital,
                      label: 'ICU Bed',
                      color: Colors.red,
                      onTap: () =>
                          _showResourceRequestDialog(context, 'ICU Bed'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: ResourceRequestCard(
                      icon: Icons.air,
                      label: 'Ventilator',
                      color: Colors.green,
                      onTap: () =>
                          _showResourceRequestDialog(context, 'Ventilator'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ResourceRequestCard(
                      icon: Icons.bloodtype,
                      label: 'Blood Unit',
                      color: Colors.purple,
                      onTap: () =>
                          _showResourceRequestDialog(context, 'Blood Unit'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Recent Bookings
              const Text(
                'Recent Bookings',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              if (patientProvider.bookings.isNotEmpty)
                ...patientProvider.bookings.take(3).map((booking) {
                  return RecentHospitalCard(
                    name: booking['hospital_name'] ?? 'Hospital',
                    date: booking['appointment_date'] ?? '',
                    doctor: booking['doctor_name'] ?? 'Doctor',
                    status: booking['status'] ?? 'Pending',
                    onTap: () {
                      _showBookingDetails(context, booking);
                    },
                  );
                })
              else
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        const Icon(Icons.bookmark_border,
                            size: 48, color: Colors.grey),
                        const SizedBox(height: 8),
                        Text(
                          'No recent bookings',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        const SizedBox(height: 8),
                        ElevatedButton(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) =>
                                    const PatientNearbyHospitals(),
                              ),
                            );
                          },
                          child: const Text('Book Appointment'),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmergencyMetric(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: Colors.white, size: 24),
        ),
        const SizedBox(height: 8),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 12),
        ),
      ],
    );
  }

  void _showBookingDetails(BuildContext context, Map<String, dynamic> booking) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(booking['hospital_name'] ?? 'Hospital'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Doctor: ${booking['doctor_name'] ?? 'N/A'}'),
            const SizedBox(height: 8),
            Text('Date: ${booking['appointment_date'] ?? 'N/A'}'),
            const SizedBox(height: 8),
            Text('Time: ${booking['appointment_time'] ?? 'N/A'}'),
            const SizedBox(height: 8),
            Text('Status: ${booking['status'] ?? 'Pending'}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

class QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;
  final VoidCallback onTap;

  const QuickActionCard({
    super.key,
    required this.icon,
    required this.title,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(color: color, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class ResourceRequestCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const ResourceRequestCard({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class RecentHospitalCard extends StatelessWidget {
  final String name;
  final String date;
  final String doctor;
  final String status;
  final VoidCallback onTap;

  const RecentHospitalCard({
    super.key,
    required this.name,
    required this.date,
    required this.doctor,
    required this.status,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    switch (status) {
      case 'Confirmed':
        statusColor = Colors.green;
        break;
      case 'Pending':
        statusColor = Colors.orange;
        break;
      case 'Completed':
        statusColor = Colors.blue;
        break;
      default:
        statusColor = Colors.grey;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
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
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      status,
                      style: TextStyle(color: statusColor, fontSize: 12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(doctor, style: const TextStyle(fontSize: 14)),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.calendar_today,
                      size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(date,
                      style: const TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
