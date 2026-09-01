// lib/screens/patient/blood_bank_screen.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class BloodBankScreen extends StatefulWidget {
  const BloodBankScreen({super.key});

  @override
  State<BloodBankScreen> createState() => _BloodBankScreenState();
}

class _BloodBankScreenState extends State<BloodBankScreen> {
  String _selectedBloodGroup = 'All';
  bool _isLoading = true;
  List<Map<String, dynamic>> _hospitals = [];
  List<Map<String, dynamic>> _filteredHospitals = [];
  String? _errorMessage;

  final List<String> _bloodGroups = [
    'All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
  ];

  /// Normalizes PostgreSQL numeric values, which may be encoded as strings.
  int _parseInt(dynamic value, {int fallback = 0}) {
    if (value == null) return fallback;
    if (value is int) return value;
    if (value is num) return value.toInt();

    return int.tryParse(value.toString()) ??
        double.tryParse(value.toString())?.toInt() ??
        fallback;
  }

  @override
  void initState() {
    super.initState();
    _loadBloodBanks();
  }

  Future<void> _loadBloodBanks() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await ApiService.getAllBloodBanks();
      if (!mounted) return;
      
      if (response['success'] == true) {
        final allBanks = response['all_banks'] ?? [];
        
        // Group by hospital
        final Map<int, Map<String, dynamic>> hospitalMap = {};
        for (var bank in allBanks) {
          final hospitalId = _parseInt(bank['hospital_id']);
          if (!hospitalMap.containsKey(hospitalId)) {
            hospitalMap[hospitalId] = {
              'id': hospitalId,
              'name': bank['hospital_name'] ?? 'Hospital',
              'address': bank['address'] ?? '',
              'city': bank['city'] ?? '',
              'phone': bank['phone'] ?? '',
              'blood_groups': <Map<String, dynamic>>[],
            };
          }
          final bloodGroups = hospitalMap[hospitalId]!['blood_groups'] as List<Map<String, dynamic>>;
          bloodGroups.add({
            'blood_group': bank['blood_group'] ?? '',
            'units_available': _parseInt(bank['units_available']),
            'minimum_threshold': _parseInt(bank['minimum_threshold'], fallback: 10),
          });
        }
        
        _hospitals = hospitalMap.values.toList();
        _applyFilter();
      } else {
        _errorMessage = response['message'] ?? 'Failed to load blood banks';
      }
    } catch (e) {
      if (!mounted) return;
      _errorMessage = 'Network error: $e';
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _applyFilter() {
    if (_selectedBloodGroup == 'All') {
      _filteredHospitals = _hospitals;
    } else {
      _filteredHospitals = _hospitals.where((hospital) {
        final bloodGroups = hospital['blood_groups'] as List<Map<String, dynamic>>;
        return bloodGroups.any((bg) => 
          bg['blood_group'] == _selectedBloodGroup && _parseInt(bg['units_available']) > 0
        );
      }).toList();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Blood Bank Availability'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadBloodBanks,
          ),
        ],
      ),
      body: _isLoading
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
                      ElevatedButton(
                        onPressed: _loadBloodBanks,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    _buildSearchFilters(),
                    Expanded(
                      child: _filteredHospitals.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.bloodtype, size: 64, color: Colors.grey[400]),
                                  const SizedBox(height: 16),
                                  Text(
                                    _selectedBloodGroup == 'All' 
                                        ? 'No hospitals with blood bank available'
                                        : 'No hospitals with $_selectedBloodGroup blood available',
                                    style: TextStyle(color: Colors.grey[600]),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filteredHospitals.length,
                              itemBuilder: (context, index) {
                                return _buildHospitalCard(_filteredHospitals[index]);
                              },
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildSearchFilters() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade200,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            const Text('Blood Group: ', style: TextStyle(fontWeight: FontWeight.bold)),
            ..._bloodGroups.map((group) {
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(group),
                  selected: _selectedBloodGroup == group,
                  onSelected: (selected) {
                    setState(() {
                      _selectedBloodGroup = group;
                    });
                    _applyFilter();
                  },
                  selectedColor: Colors.red.shade100,
                  checkmarkColor: Colors.red,
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildHospitalCard(Map<String, dynamic> hospital) {
    final bloodGroups = hospital['blood_groups'] as List<Map<String, dynamic>>;
    final totalUnits = bloodGroups.fold<int>(0, (sum, bg) {
      final units = _parseInt(bg['units_available']);
      return sum + units;
    });
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.local_hospital, color: Colors.red, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hospital['name'] ?? 'Hospital',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        hospital['address'] ?? '',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.red.shade100,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '$totalUnits units',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.red,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: bloodGroups.map((bg) {
                final units = _parseInt(bg['units_available']);
                final minThreshold = _parseInt(bg['minimum_threshold'], fallback: 10);
                final isLow = units < minThreshold;
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isLow ? Colors.red.shade100 : Colors.green.shade100,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '${bg['blood_group']}: $units units',
                    style: TextStyle(
                      fontSize: 12,
                      color: isLow ? Colors.red.shade800 : Colors.green.shade800,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.phone, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(hospital['phone'] ?? 'N/A', style: const TextStyle(fontSize: 12)),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _showRequestBloodDialog(context, hospital),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      minimumSize: const Size(100, 36),
                    ),
                    child: const Text('Request Blood'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showRequestBloodDialog(BuildContext context, Map<String, dynamic> hospital) {
    String selectedGroup = 'A+';
    int requiredUnits = 1;
    final TextEditingController patientNameController = TextEditingController();
    final TextEditingController hospitalAddressController = TextEditingController();
    final bloodGroups = hospital['blood_groups'] as List<Map<String, dynamic>>;

    // Set initial selected group
    if (bloodGroups.isNotEmpty) {
      selectedGroup = bloodGroups[0]['blood_group'] ?? 'A+';
    }

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            title: Text('Request Blood from ${hospital['name']}'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: selectedGroup,
                  decoration: const InputDecoration(
                    labelText: 'Blood Group *',
                    border: OutlineInputBorder(),
                  ),
                  items: bloodGroups.map<DropdownMenuItem<String>>((bg) {
                    return DropdownMenuItem<String>(
                      value: bg['blood_group'] as String? ?? '',
                      child: Text('${bg['blood_group']} (${bg['units_available']} units)'),
                    );
                  }).toList(),
                  onChanged: (value) {
                    setDialogState(() {
                      selectedGroup = value!;
                    });
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: patientNameController,
                  decoration: const InputDecoration(
                    labelText: 'Patient Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: hospitalAddressController,
                  decoration: const InputDecoration(
                    labelText: 'Hospital/Address *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: TextEditingController(text: '1'),
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Number of Units *',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) {
                    requiredUnits = int.tryParse(value) ?? 1;
                  },
                ),
                // Show selected hospital info
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.local_hospital, color: Colors.blue, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Requesting from: ${hospital['name']}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: Colors.blue,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () async {
                  // Validate inputs
                  if (patientNameController.text.isEmpty || hospitalAddressController.text.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Please fill all required fields')),
                    );
                    return;
                  }
                  
                  // Close dialog
                  Navigator.pop(context);
                  
                  // Send request to the specific hospital only
                  final response = await ApiService.requestBlood({
                    'hospital_id': hospital['id'],
                    'blood_group': selectedGroup,
                    'units_required': requiredUnits,
                    'patient_name': patientNameController.text,
                    'hospital_address': hospitalAddressController.text,
                  });
                  
                  if (response['success'] == true && mounted) {
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Blood request submitted successfully to the selected hospital'),
                        backgroundColor: Colors.green,
                      ),
                    );
                    _loadBloodBanks();
                  } else if (mounted) {
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(response['message'] ?? 'Request failed. Please try again.'),
                        backgroundColor: Colors.red,
                      ),
                    );
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                ),
                child: const Text('Submit Request'),
              ),
            ],
          );
        },
      ),
    );
  }
}
