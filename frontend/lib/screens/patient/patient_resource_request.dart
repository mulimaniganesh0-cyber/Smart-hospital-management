// lib/screens/patient/patient_resource_request.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../providers/auth_provider.dart';
import 'patient_my_requests.dart';

class PatientResourceRequest extends StatefulWidget {
  const PatientResourceRequest(
      {super.key,
      this.hospitalId,
      this.hospitalName,
      this.resourceType,
      this.bloodGroup,
      this.availableQuantity,
      this.onBackToDashboard});
  final VoidCallback? onBackToDashboard;
  final int? hospitalId;
  final String? hospitalName;
  final String? resourceType;
  final String? bloodGroup;
  final int? availableQuantity;

  @override
  State<PatientResourceRequest> createState() => _PatientResourceRequestState();
}

class _PatientResourceRequestState extends State<PatientResourceRequest> {
  bool _isLoading = true;
  bool _isSubmitting = false;
  List<Map<String, dynamic>> _hospitals = [];
  String? _selectedHospitalId;
  String? _selectedResourceType;
  String _quantity = '1';
  String _description = '';
  String? _selectedBloodGroup;
  String _patientName = '';
  String _patientPhone = '';
  String _hospitalAddress = '';

  // Blood availability cache
  Map<String, Map<String, dynamic>> _bloodAvailability = {};
  Map<String, dynamic> _hospitalResources = {};
  bool _isLoadingResources = false;
  String? _resourceError;

  final List<String> _resourceTypes = [
    'General Bed',
    'ICU Bed',
    'Ventilator',
    'Oxygen Supported Bed',
    'Blood',
  ];

  final List<String> _bloodGroups = [
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-',
  ];

  final Map<String, String> _resourceTypeMap = {
    'General Bed': 'general_bed',
    'ICU Bed': 'icu_bed',
    'Ventilator': 'ventilator',
    'Oxygen Supported Bed': 'oxygen_bed',
    'Blood': 'blood',
  };

  @override
  void initState() {
    super.initState();
    _selectedHospitalId = widget.hospitalId?.toString();
    _selectedResourceType = _resourceLabel(widget.resourceType);
    _selectedBloodGroup = widget.bloodGroup;
    // Preserve the live, group-specific quantity supplied by the selected
    // chatbot card. The hospital endpoint remains the source of truth and
    // replaces this value when it returns current stock.
    if (widget.bloodGroup != null && widget.availableQuantity != null) {
      _bloodAvailability = {
        widget.bloodGroup!: {
          'available': widget.availableQuantity!,
          'threshold': 0,
        },
      };
    }
    _loadPatientData();
    _loadHospitals();
  }

  String? _resourceLabel(String? value) {
    switch (value?.toLowerCase()) {
      case 'blood':
        return 'Blood';
      case 'icu_beds':
        return 'ICU Bed';
      case 'oxygen_beds':
        return 'Oxygen Supported Bed';
      case 'ventilators':
        return 'Ventilator';
      case 'beds':
      case 'general_bed':
        return 'General Bed';
      default:
        return null;
    }
  }

  Future<void> _loadPatientData() async {
    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final user = authProvider.currentUser;
      if (user != null) {
        setState(() {
          _patientName = user.name;
          _patientPhone = user.phone;
        });
      }
    } catch (e) {
      debugPrint('Error loading patient data: $e');
    }
  }

  Future<void> _loadHospitals() async {
    setState(() => _isLoading = true);

    try {
      final response = await ApiService.getAllHospitals(verified: 'true');
      if (response['success'] && response['data'] != null) {
        setState(() {
          _hospitals = List<Map<String, dynamic>>.from(response['data']);
          if (_hospitals.isNotEmpty) {
            final selected = _hospitals
                .where((hospital) =>
                    hospital['id'].toString() == _selectedHospitalId)
                .cast<Map<String, dynamic>>()
                .toList();
            final hospital =
                selected.isNotEmpty ? selected.first : _hospitals.first;
            _selectedHospitalId = hospital['id'].toString();
            _hospitalAddress = hospital['address'] ?? '';
            _loadHospitalResources(hospital['id']);
          }
        });
      }
    } catch (e) {
      if (mounted) {
        _showErrorDialog('Error loading hospitals: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _loadHospitalResources(dynamic hospitalId) async {
    if (hospitalId == null) return;

    setState(() {
      _isLoadingResources = true;
      _resourceError = null;
    });

    try {
      final hospitalIdInt = int.parse(hospitalId.toString());

      debugPrint('Loading resources for hospital: $hospitalIdInt');

      // Load blood availability
      final bloodResponse =
          await ApiService.getBloodAvailability(hospitalIdInt);
      if (!mounted) return;
      if (bloodResponse['success'] && bloodResponse['data'] != null) {
        final Map<String, Map<String, dynamic>> availability = {
          ..._bloodAvailability,
        };
        for (var stock in bloodResponse['data']) {
          final group = stock['blood_group']?.toString() ?? '';
          final rawUnits = stock['units_available'];
          final units = rawUnits is num
              ? rawUnits.toDouble()
              : double.tryParse('${rawUnits ?? 0}') ?? 0;
          availability[group] = {
            'available': units,
            'threshold': stock['minimum_threshold'] ?? 10,
          };
        }
        setState(() {
          _bloodAvailability = availability;
        });
        debugPrint('Blood availability loaded: $_bloodAvailability');
      }

      // Load hospital resources
      final hospitalResponse =
          await ApiService.getHospitalResources(hospitalIdInt);
      if (!mounted) return;

      if (hospitalResponse['success'] && hospitalResponse['data'] != null) {
        final data = hospitalResponse['data'];
        setState(() {
          _hospitalResources = {
            'general_beds': data['general_beds_available'] ?? 0,
            'icu_beds': data['icu_beds_available'] ?? 0,
            'ventilators': data['ventilators_available'] ?? 0,
            // The public resource endpoint uses oxygen_beds_available while
            // older hospital endpoints use oxygen_supported_beds_available.
            'oxygen_beds': data['oxygen_beds_available'] ??
                data['oxygen_supported_beds_available'] ??
                0,
          };
        });
        debugPrint('Hospital resources set: $_hospitalResources');
      } else {
        setState(() {
          _resourceError =
              hospitalResponse['message'] ?? 'Failed to load resources';
        });
      }
    } catch (e) {
      debugPrint('Error loading hospital resources: $e');
      setState(() {
        _resourceError = 'Error loading resources: $e';
      });
    } finally {
      if (mounted) {
        setState(() => _isLoadingResources = false);
      }
    }
  }

  bool _isBloodAvailable(String bloodGroup) {
    final stock = _bloodAvailability[bloodGroup];
    if (stock == null) return false;
    final available = stock['available'] ?? 0;
    final requiredUnits = int.tryParse(_quantity) ?? 1;
    return available >= requiredUnits;
  }

  int _getBloodUnits(String bloodGroup) {
    final stock = _bloodAvailability[bloodGroup];
    final value = stock?['available'];
    return value is num ? value.toInt() : int.tryParse('$value') ?? 0;
  }

  int _getResourceAvailability(String resourceType) {
    final mapping = {
      'General Bed': 'general_beds',
      'ICU Bed': 'icu_beds',
      'Ventilator': 'ventilators',
      'Oxygen Supported Bed': 'oxygen_beds',
    };
    final key = mapping[resourceType] ?? '';
    final available = _hospitalResources[key] ?? 0;
    debugPrint('Resource availability - $resourceType: $available (key: $key)');
    return available;
  }

  bool _isResourceAvailable(String resourceType) {
    final available = _getResourceAvailability(resourceType);
    final requiredUnits = int.tryParse(_quantity) ?? 1;
    return available >= requiredUnits;
  }

  // Error Dialog Method
  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.error, color: AppColors.error),
            SizedBox(width: 8),
            Text('âŒ Error'),
          ],
        ),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  // Success Dialog Method - Fixed to prevent blank screen
  void _showSuccessDialog(String message) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            SizedBox(width: 8),
            Text('âœ… Request Submitted'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'ðŸ“‹ The hospital will review your request and respond shortly. You can track the status in your bookings.',
                style: TextStyle(fontSize: 12, color: AppColors.primary),
              ),
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              // Close the dialog
              Navigator.pop(context);
              // Navigate to My Requests using pushReplacement
              // This ensures the current screen is replaced, preventing blank screen
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(
                  builder: (context) => const PatientMyRequests(),
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF142D4E),
            ),
            child: const Text('View My Requests'),
          ),
          TextButton(
            onPressed: () {
              // Close the dialog
              final navigator = Navigator.of(context);
              navigator.pop();
              // Return to the dashboard tab without importing PatientHomeScreen.
              if (widget.onBackToDashboard != null) {
                widget.onBackToDashboard!.call();
              } else if (navigator.canPop()) {
                navigator.pop();
              }
            },
            child: const Text('Back to Dashboard'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Request Resource'),
        backgroundColor: const Color(0xFF142D4E),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              if (_selectedHospitalId != null) {
                _loadHospitalResources(int.parse(_selectedHospitalId!));
              }
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _isLoadingResources
              ? const Center(child: CircularProgressIndicator())
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Patient Info Card
                      Card(
                        elevation: 2,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Patient Information',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF142D4E),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(Icons.person,
                                      size: 16, color: Colors.grey),
                                  const SizedBox(width: 8),
                                  Text('Name: $_patientName'),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  const Icon(Icons.phone,
                                      size: 16, color: Colors.grey),
                                  const SizedBox(width: 8),
                                  Text('Phone: $_patientPhone'),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Hospital Selection
                      const Text(
                        'Select Hospital',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF142D4E),
                        ),
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
                            value: _selectedHospitalId,
                            isExpanded: true,
                            hint: const Text('Select a hospital'),
                            items: _hospitals.map((hospital) {
                              return DropdownMenuItem(
                                value: hospital['id'].toString(),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      hospital['name'],
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    Text(
                                      hospital['city'] ?? '',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                _selectedHospitalId = value;
                                final hospital = _hospitals.firstWhere(
                                  (h) => h['id'].toString() == value,
                                  orElse: () => _hospitals.first,
                                );
                                _hospitalAddress = hospital['address'] ?? '';
                                _loadHospitalResources(hospital['id']);
                              });
                            },
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Show resource error if any
                      if (_resourceError != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.error.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: AppColors.error.withValues(alpha: 0.1)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error, color: AppColors.error),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _resourceError!,
                                  style:
                                      const TextStyle(color: AppColors.error),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Resource Type Selection
                      const Text(
                        'Resource Type',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF142D4E),
                        ),
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
                            value: _selectedResourceType,
                            isExpanded: true,
                            hint: const Text('Select Resource Type'),
                            items: _resourceTypes.map((type) {
                              final available = type == 'Blood'
                                  ? null
                                  : _getResourceAvailability(type);
                              final isAvailable = type == 'Blood'
                                  ? true
                                  : _isResourceAvailable(type);

                              return DropdownMenuItem(
                                value: type,
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(type),
                                          if (type != 'Blood')
                                            Text(
                                              '$available units available',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: isAvailable
                                                    ? AppColors.success
                                                    : AppColors.error,
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                    if (type != 'Blood' && !isAvailable)
                                      const Icon(
                                        Icons.warning,
                                        color: AppColors.error,
                                        size: 16,
                                      ),
                                  ],
                                ),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                _selectedResourceType = value;
                                if (value != 'Blood') {
                                  _selectedBloodGroup = null;
                                }
                              });
                            },
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Blood Group Selection (only for Blood requests)
                      if (_selectedResourceType == 'Blood') ...[
                        const Text(
                          'Blood Group',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF142D4E),
                          ),
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
                              value: _selectedBloodGroup,
                              isExpanded: true,
                              hint: const Text('Select Blood Group'),
                              items: _bloodGroups.map((group) {
                                final units = _getBloodUnits(group);
                                final isAvailable = _isBloodAvailable(group);
                                return DropdownMenuItem(
                                  value: group,
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              group,
                                              style: TextStyle(
                                                color: isAvailable
                                                    ? Colors.black
                                                    : AppColors.error,
                                                fontWeight: isAvailable
                                                    ? FontWeight.normal
                                                    : FontWeight.bold,
                                              ),
                                            ),
                                            Text(
                                              '$units units available',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: isAvailable
                                                    ? AppColors.success
                                                    : AppColors.error,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (!isAvailable)
                                        const Icon(
                                          Icons.warning,
                                          color: AppColors.error,
                                          size: 16,
                                        ),
                                    ],
                                  ),
                                );
                              }).toList(),
                              onChanged: (value) {
                                setState(() {
                                  _selectedBloodGroup = value;
                                });
                              },
                            ),
                          ),
                        ),

                        // Show availability message
                        if (_selectedBloodGroup != null) ...[
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: _isBloodAvailable(_selectedBloodGroup!)
                                  ? AppColors.success.withValues(alpha: 0.1)
                                  : AppColors.error.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: _isBloodAvailable(_selectedBloodGroup!)
                                    ? AppColors.success.withValues(alpha: 0.1)
                                    : AppColors.error.withValues(alpha: 0.1),
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  _isBloodAvailable(_selectedBloodGroup!)
                                      ? Icons.check_circle
                                      : Icons.warning,
                                  color: _isBloodAvailable(_selectedBloodGroup!)
                                      ? AppColors.success
                                      : AppColors.error,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _isBloodAvailable(_selectedBloodGroup!)
                                        ? 'âœ… Blood is available. Units: ${_getBloodUnits(_selectedBloodGroup!)}'
                                        : 'âš ï¸ Blood group unavailable or insufficient stock. Available: ${_getBloodUnits(_selectedBloodGroup!)} units',
                                    style: TextStyle(
                                      color: _isBloodAvailable(
                                              _selectedBloodGroup!)
                                          ? AppColors.success
                                          : AppColors.error,
                                      fontWeight: _isBloodAvailable(
                                              _selectedBloodGroup!)
                                          ? FontWeight.normal
                                          : FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                      ],

                      // Resource availability warning for non-blood resources
                      if (_selectedResourceType != null &&
                          _selectedResourceType != 'Blood') ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: _isResourceAvailable(_selectedResourceType!)
                                ? AppColors.success.withValues(alpha: 0.1)
                                : AppColors.warning.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color:
                                  _isResourceAvailable(_selectedResourceType!)
                                      ? AppColors.success.withValues(alpha: 0.1)
                                      : AppColors.warning
                                          .withValues(alpha: 0.1),
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                _isResourceAvailable(_selectedResourceType!)
                                    ? Icons.check_circle
                                    : Icons.warning,
                                color:
                                    _isResourceAvailable(_selectedResourceType!)
                                        ? AppColors.success
                                        : AppColors.warning,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _isResourceAvailable(_selectedResourceType!)
                                      ? 'âœ… Resource is available. Units: ${_getResourceAvailability(_selectedResourceType!)}'
                                      : 'âš ï¸ Resource unavailable or insufficient stock. Available: ${_getResourceAvailability(_selectedResourceType!)} units',
                                  style: TextStyle(
                                    color: _isResourceAvailable(
                                            _selectedResourceType!)
                                        ? AppColors.success
                                        : AppColors.warning,
                                    fontWeight: _isResourceAvailable(
                                            _selectedResourceType!)
                                        ? FontWeight.normal
                                        : FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Quantity
                      const Text(
                        'Quantity',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF142D4E),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          hintText: 'Enter quantity (1-10)',
                          prefixIcon: Icon(Icons.numbers),
                        ),
                        onChanged: (value) => _quantity = value,
                      ),
                      const SizedBox(height: 16),

                      // Description (for resources)
                      if (_selectedResourceType != 'Blood') ...[
                        const Text(
                          'Description / Reason',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF142D4E),
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          maxLines: 3,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            hintText:
                                'Describe the reason for request (e.g., emergency surgery, patient admission)',
                            prefixIcon: Icon(Icons.description),
                          ),
                          onChanged: (value) => _description = value,
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Hospital Address
                      const Text(
                        'Hospital Address',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF142D4E),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller:
                            TextEditingController(text: _hospitalAddress),
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          hintText: 'Hospital address',
                          prefixIcon: Icon(Icons.location_on),
                        ),
                        onChanged: (value) => _hospitalAddress = value,
                      ),
                      const SizedBox(height: 24),

                      // Submit Button
                      SizedBox(
                        width: double.infinity,
                        height: 55,
                        child: ElevatedButton(
                          onPressed: _isSubmitting ? null : _submitRequest,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF142D4E),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: _isSubmitting
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'Submit Request',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Future<void> _submitRequest() async {
    // Validation
    if (_selectedHospitalId == null || _selectedResourceType == null) {
      _showErrorDialog('Please select hospital and resource type');
      return;
    }

    final requiredUnits = int.tryParse(_quantity) ?? 1;
    if (requiredUnits < 1 || requiredUnits > 10) {
      _showErrorDialog('Please enter a valid quantity (1-10)');
      return;
    }

    // Check availability for non-blood resources
    if (_selectedResourceType != 'Blood') {
      final available = _getResourceAvailability(_selectedResourceType!);
      if (available < requiredUnits) {
        _showErrorDialog('Insufficient resources available.\n'
            'Available: $available units\n'
            'Requested: $requiredUnits units');
        return;
      }
    }

    // Check blood availability
    if (_selectedResourceType == 'Blood') {
      if (_selectedBloodGroup == null) {
        _showErrorDialog('Please select blood group');
        return;
      }

      if (!_isBloodAvailable(_selectedBloodGroup!)) {
        _showErrorDialog('Blood group unavailable.\n'
            'Available: ${_getBloodUnits(_selectedBloodGroup!)} units\n'
            'Requested: $requiredUnits units');
        return;
      }
    }

    setState(() => _isSubmitting = true);

    try {
      Map<String, dynamic> requestData;

      if (_selectedResourceType == 'Blood') {
        requestData = {
          'hospital_id': int.parse(_selectedHospitalId!),
          'blood_group': _selectedBloodGroup,
          'units_required': requiredUnits,
          'patient_name': _patientName,
          'patient_phone': _patientPhone,
          'hospital_address': _hospitalAddress,
        };

        final response = await ApiService.requestBlood(requestData);
        if (response['success'] && mounted) {
          _showSuccessDialog('Blood request submitted successfully');
        } else {
          _showErrorDialog(response['message'] ?? 'Blood request failed');
        }
      } else {
        requestData = {
          'hospital_id': int.parse(_selectedHospitalId!),
          'resource_type':
              _resourceTypeMap[_selectedResourceType] ?? 'general_bed',
          'quantity': requiredUnits,
          'description': _description,
          'patient_name': _patientName,
          'patient_phone': _patientPhone,
          'hospital_address': _hospitalAddress,
        };

        final response = await ApiService.requestResource(requestData);
        if (response['success'] && mounted) {
          _showSuccessDialog('Resource request submitted successfully');
        } else {
          _showErrorDialog(response['message'] ?? 'Resource request failed');
        }
      }
    } catch (e) {
      _showErrorDialog('Error submitting request: $e');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
