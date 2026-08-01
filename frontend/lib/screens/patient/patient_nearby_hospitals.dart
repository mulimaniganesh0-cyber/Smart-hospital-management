// lib/screens/patient/patient_nearby_hospitals.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../models/hospital_model.dart';

class PatientNearbyHospitals extends StatefulWidget {
  const PatientNearbyHospitals({super.key});

  @override
  State<PatientNearbyHospitals> createState() => _PatientNearbyHospitalsState();
}

class _PatientNearbyHospitalsState extends State<PatientNearbyHospitals> {
  bool _isLoading = true;
  List<Hospital> _hospitals = [];
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadHospitals();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadHospitals() async {
    if (!mounted) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final lat = 28.6139;
      final lng = 77.2090;

      print('Loading hospitals...');
      final response = await ApiService.getNearbyHospitals(lat, lng);
      print('Response received: ${response['success']}');

      if (!mounted) return;

      if (response['success'] == true && response['data'] != null) {
        final List<dynamic> hospitalsData = response['data'];
        print('Found ${hospitalsData.length} hospitals');
        
        _hospitals = [];
        for (var data in hospitalsData) {
          try {
            print('Parsing hospital: ${data['name']}');
            print('Raw data: $data');
            
            // Convert to proper Map
            final Map<String, dynamic> hospitalMap = Map<String, dynamic>.from(data);
            final hospital = Hospital.fromJson(hospitalMap);
            
            print('✅ Parsed resources - General: ${hospital.availableBeds}/${hospital.totalBeds}, ICU: ${hospital.availableIcu}/${hospital.icuBeds}');
            _hospitals.add(hospital);
          } catch (e) {
            print('Error parsing hospital: $e');
            print('Data that caused error: $data');
          }
        }
        
        print('Successfully parsed ${_hospitals.length} hospitals');
      } else {
        _errorMessage = response['message'] ?? 'Failed to load hospitals';
        print('Error: $_errorMessage');
      }
    } catch (e) {
      print('Network error: $e');
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nearby Hospitals'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadHospitals,
            tooltip: 'Refresh',
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
                      const Icon(Icons.error_outline,
                          size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_errorMessage!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadHospitals,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _hospitals.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.local_hospital_outlined,
                              size: 64, color: Colors.grey),
                          const SizedBox(height: 16),
                          const Text(
                            'No hospitals found nearby',
                            style: TextStyle(fontSize: 16),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Try refreshing or check your location',
                            style: TextStyle(color: Colors.grey[600]),
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: _loadHospitals,
                            child: const Text('Refresh'),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadHospitals,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _hospitals.length,
                        itemBuilder: (context, index) {
                          return _buildHospitalCard(_hospitals[index]);
                        },
                      ),
                    ),
    );
  }

  Widget _buildHospitalCard(Hospital hospital) {
    // Calculate occupancy percentage
    final occupancyPercent = hospital.totalBeds > 0
        ? ((hospital.totalBeds - hospital.availableBeds) / hospital.totalBeds * 100)
        : 0.0;
    
    // Determine color based on availability
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
                  Row(
                    children: [
                      const Icon(Icons.star, color: Colors.amber, size: 16),
                      Text(' ${hospital.rating}'),
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
              
              // Location and Emergency
              Row(
                children: [
                  const Icon(Icons.location_on, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(hospital.distance),
                  const SizedBox(width: 12),
                  const Icon(Icons.king_bed, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text('${hospital.availableBeds} beds avail'),
                  if (hospital.emergencyServices) ...[
                    const SizedBox(width: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        '24/7 Emergency',
                        style: TextStyle(fontSize: 10, color: Colors.red),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              
              // Specialties
              Wrap(
                spacing: 4,
                children: hospital.specialties.take(3).map((specialty) {
                  return Chip(
                    label:
                        Text(specialty, style: const TextStyle(fontSize: 10)),
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
class HospitalDetailScreen extends StatelessWidget {
  final Hospital hospital;

  const HospitalDetailScreen({
    super.key,
    required this.hospital,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(hospital.name),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Verified Badge
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: hospital.isVerified ? Colors.green.shade50 : Colors.orange.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: hospital.isVerified ? Colors.green.shade200 : Colors.orange.shade200,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    hospital.isVerified ? Icons.verified : Icons.pending,
                    color: hospital.isVerified ? Colors.green : Colors.orange,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    hospital.isVerified
                        ? 'Verified Hospital'
                        : 'Pending Verification',
                    style: TextStyle(
                      color: hospital.isVerified ? Colors.green[700] : Colors.orange[700],
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            
            // Resources Section
            Text(
              'Resources Available',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            
            // Resource Grid
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.5,
              children: [
                _buildResourceCard(
                  icon: Icons.king_bed,
                  label: 'General Beds',
                  available: hospital.availableBeds,
                  total: hospital.totalBeds,
                  color: Colors.blue,
                ),
                _buildResourceCard(
                  icon: Icons.local_hospital,
                  label: 'ICU Beds',
                  available: hospital.availableIcu,
                  total: hospital.icuBeds,
                  color: Colors.red,
                ),
                _buildResourceCard(
                  icon: Icons.air,
                  label: 'Ventilators',
                  available: hospital.availableVentilators,
                  total: hospital.ventilatorCount,
                  color: Colors.green,
                ),
                _buildResourceCard(
                  icon: Icons.medical_services,
                  label: 'Oxygen Beds',
                  available: hospital.oxygenBedsAvailable,
                  total: hospital.oxygenBedsTotal,
                  color: Colors.orange,
                ),
                _buildResourceCard(
                  icon: Icons.water_drop,
                  label: 'Blood Units',
                  available: hospital.bloodUnits,
                  total: null,
                  color: Colors.purple,
                ),
              ],
            ),
            const SizedBox(height: 20),
            
            // Specialties
            const Text(
              'Specialties',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: hospital.specialties.isNotEmpty
                  ? hospital.specialties.map((specialty) {
                      return Chip(
                        label: Text(specialty),
                        backgroundColor: const Color(0xFF0A4D68).withOpacity(0.1),
                      );
                    }).toList()
                  : [
                      Chip(
                        label: const Text('General Medicine'),
                        backgroundColor: Colors.grey.shade200,
                      ),
                    ],
            ),
            const SizedBox(height: 20),
            
            // Last Updated
            Text(
              'Last Updated: ${_formatDate(hospital.lastUpdated)}',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
                fontStyle: FontStyle.italic,
              ),
            ),
            const SizedBox(height: 20),
            
            // Book Appointment Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => BookingScreen(hospital: hospital),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0A4D68),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: const Text('Book Appointment'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }

  Widget _buildResourceCard({
    required IconData icon,
    required String label,
    required int available,
    int? total,
    required Color color,
  }) {
    // Determine status color
    Color getStatusColor() {
      if (total == null) {
        return available > 10 ? Colors.green : Colors.orange;
      }
      if (total == 0) return Colors.grey;
      final ratio = available / total;
      if (ratio > 0.5) return Colors.green;
      if (ratio > 0.2) return Colors.orange;
      return Colors.red;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade100,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 24),
              const Spacer(),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: getStatusColor(),
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: Colors.grey),
          ),
          const SizedBox(height: 4),
          Text(
            total != null ? '$available / $total' : '$available units',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: getStatusColor(),
            ),
          ),
        ],
      ),
    );
  }
}

// ==================== BOOKING SCREEN ====================
class BookingScreen extends StatefulWidget {
  final Hospital hospital;

  const BookingScreen({
    super.key,
    required this.hospital,
  });

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  DateTime _selectedDate = DateTime.now();
  TimeOfDay _selectedTime = TimeOfDay.now();
  String? _selectedDoctorId;
  String? _selectedDepartment;
  final TextEditingController _symptomsController = TextEditingController();
  bool _isBooking = false;
  bool _isLoadingDoctors = false;
  List<Map<String, dynamic>> _doctors = [];
  List<String> _departments = [];

  @override
  void initState() {
    super.initState();
    _loadDoctors();
  }

  Future<void> _loadDoctors() async {
    setState(() => _isLoadingDoctors = true);

    try {
      final response = await ApiService.getHospitalDoctors(widget.hospital.id);
      if (response['success'] && response['data'] != null) {
        _doctors = List<Map<String, dynamic>>.from(response['data']);

        // Extract unique departments
        final departments = _doctors
            .map((d) => d['department'] ?? d['specialization'] ?? 'General')
            .where((d) => d.isNotEmpty)
            .toSet()
            .toList();
        _departments = ['All Departments', ...departments];

        // Set initial selection
        if (_doctors.isNotEmpty) {
          _selectedDoctorId = _doctors[0]['id'].toString();
        }
      }
    } catch (e) {
      print('Error loading doctors: $e');
    } finally {
      setState(() => _isLoadingDoctors = false);
    }
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
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
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
    }
  }

  Future<void> _selectTime(BuildContext context) async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
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
    if (picked != null && picked != _selectedTime) {
      setState(() {
        _selectedTime = picked;
      });
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

            // Time Picker
            InkWell(
              onTap: () => _selectTime(context),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
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
                          Text(
                            _selectedTime.format(context),
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
                onPressed: _isBooking || _selectedDoctorId == null
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
      final formattedTime =
          '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}:00';
      final formattedDate =
          '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

      final appointmentData = {
        'hospital_id': widget.hospital.id,
        'doctor_id': int.parse(_selectedDoctorId!),
        'appointment_date': formattedDate,
        'appointment_time': formattedTime,
        'symptoms': _symptomsController.text,
      };

      print('Creating appointment with data: $appointmentData');
      print('Hospital ID: ${widget.hospital.id}');
      print('Hospital Name: ${widget.hospital.name}');

      final response = await ApiService.createAppointment(appointmentData);

      print('Appointment response: $response');

      if (response['success'] && mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Booking Confirmed'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Appointment booked at ${widget.hospital.name}'),
                const SizedBox(height: 8),
                Text('Date: $formattedDate'),
                Text('Time: ${_selectedTime.format(context)}'),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.shade200),
                  ),
                  child: const Text(
                    '✅ You will receive a confirmation SMS/Email shortly.',
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response['message'] ?? 'Booking failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      print('Booking error: $e');
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