// lib/screens/hospital/hospital_appointments.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/hospital_provider.dart';
import '../../services/api_service.dart';

class HospitalAppointments extends StatefulWidget {
  const HospitalAppointments({super.key});

  @override
  State<HospitalAppointments> createState() => _HospitalAppointmentsState();
}

class _HospitalAppointmentsState extends State<HospitalAppointments> {
  String _selectedFilter = 'all';
  bool _isLoading = true;
  List<Map<String, dynamic>> _appointments = [];
  String? _errorMessage;

  final List<String> _filters = [
    'all',
    'pending',
    'confirmed',
    'completed',
    'cancelled'
  ];

  final Map<String, Color> _filterColors = {
    'all': const Color(0xFF0A4D68),
    'pending': Colors.orange,
    'confirmed': Colors.green,
    'completed': Colors.blue,
    'cancelled': Colors.red,
  };

  @override
  void initState() {
    super.initState();
    _loadAppointments();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Also listen to provider changes
    final provider = Provider.of<HospitalProvider>(context, listen: false);
    if (provider.appointments.isNotEmpty && _appointments.isEmpty) {
      _loadAppointments();
    }
  }

  Future<void> _loadAppointments() async {
    if (!mounted) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // Try to get from provider first
      final provider = Provider.of<HospitalProvider>(context, listen: false);
      if (provider.appointments.isNotEmpty) {
        _appointments = List<Map<String, dynamic>>.from(provider.appointments);
        print('Loaded ${_appointments.length} appointments from provider');
        setState(() => _isLoading = false);
        return;
      }

      // Fallback to API call
      final response = await ApiService.getHospitalAppointments();
      print('Hospital appointments response: $response');

      if (response['success'] == true) {
        _appointments = List<Map<String, dynamic>>.from(response['data'] ?? []);
        print('Loaded ${_appointments.length} appointments from API');
      } else {
        _errorMessage = response['message'] ?? 'Failed to load appointments';
        print('Error: $_errorMessage');
      }
    } catch (e) {
      _errorMessage = 'Network error: $e';
      print('Error loading appointments: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> get _filteredAppointments {
    if (_selectedFilter == 'all') return _appointments;
    return _appointments
        .where((a) => (a['status'] ?? '').toLowerCase() == _selectedFilter)
        .toList();
  }

  Future<void> _updateStatus(int appointmentId, String status) async {
    // Show loading indicator
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    try {
      final response =
          await ApiService.updateAppointmentStatus(appointmentId, status);
      Navigator.pop(context); // Close loading dialog

      if (response['success'] == true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Appointment ${status.toUpperCase()}'),
            backgroundColor: status == 'confirmed'
                ? Colors.green
                : status == 'completed'
                    ? Colors.blue
                    : status == 'cancelled'
                        ? Colors.red
                        : Colors.orange,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 2),
          ),
        );

        // Refresh appointments
        await _loadAppointments();

        // Also refresh the provider
        final provider = Provider.of<HospitalProvider>(context, listen: false);
        await provider.loadHospitalData();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response['message'] ?? 'Failed to update status'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      Navigator.pop(context); // Close loading dialog
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Network error: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredAppointments = _filteredAppointments;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Appointments'),
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAppointments,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadAppointments,
        color: const Color(0xFF0A4D68),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _errorMessage != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.error_outline,
                            size: 80, color: Colors.grey[400]),
                        const SizedBox(height: 16),
                        Text(_errorMessage!,
                            style: TextStyle(color: Colors.grey[600])),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadAppointments,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF0A4D68),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : Column(
                    children: [
                      _buildFilterChips(),
                      Expanded(
                        child: filteredAppointments.isEmpty
                            ? Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.calendar_today,
                                        size: 80, color: Colors.grey[400]),
                                    const SizedBox(height: 16),
                                    Text(
                                      'No appointments found',
                                      style: TextStyle(
                                          color: Colors.grey[600],
                                          fontSize: 16),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      'Appointments will appear here when patients book',
                                      style: TextStyle(
                                          color: Colors.grey[500],
                                          fontSize: 12),
                                    ),
                                    const SizedBox(height: 16),
                                    ElevatedButton.icon(
                                      onPressed: () {
                                        // Navigate to appointments or refresh
                                        _loadAppointments();
                                      },
                                      icon: const Icon(Icons.refresh),
                                      label: const Text('Refresh'),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor:
                                            const Color(0xFF0A4D68),
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.all(16),
                                itemCount: filteredAppointments.length,
                                itemBuilder: (context, index) {
                                  final appointment =
                                      filteredAppointments[index];
                                  return _buildAppointmentCard(appointment);
                                },
                              ),
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _buildFilterChips() {
    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _filters.length,
        itemBuilder: (context, index) {
          final filter = _filters[index];
          final isSelected = _selectedFilter == filter;
          final color = _filterColors[filter] ?? const Color(0xFF0A4D68);

          return Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilterChip(
              label: Text(filter.toUpperCase()),
              selected: isSelected,
              onSelected: (selected) {
                setState(() => _selectedFilter = filter);
              },
              backgroundColor: Colors.grey.shade50,
              selectedColor: color.withOpacity(0.2),
              labelStyle: TextStyle(
                color: isSelected ? color : Colors.grey[600],
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                fontSize: 12,
              ),
              shape: StadiumBorder(
                side: BorderSide(
                  color: isSelected ? color : Colors.grey.shade300,
                ),
              ),
              avatar:
                  isSelected ? Icon(Icons.check, size: 16, color: color) : null,
            ),
          );
        },
      ),
    );
  }

  Widget _buildAppointmentCard(Map<String, dynamic> appointment) {
    final status = appointment['status'] ?? 'pending';
    final isPending = status.toLowerCase() == 'pending';
    final patientName = appointment['patient_name'] ?? 'Unknown Patient';
    final doctorName = appointment['doctor_name'] ?? 'Not Assigned';
    final appointmentDate = appointment['appointment_date'] ?? 'Date not set';
    final appointmentTime = appointment['appointment_time'] ?? 'Time not set';
    final symptoms = appointment['symptoms'] ?? 'No symptoms provided';
    final createdAt = appointment['created_at'];

    // Format date for better display
    String formattedDate = appointmentDate;
    if (appointmentDate != 'Date not set' && appointmentDate.contains('-')) {
      final parts = appointmentDate.split('-');
      if (parts.length == 3) {
        formattedDate = '${parts[2]}/${parts[1]}/${parts[0]}';
      }
    }

    Color statusColor;
    IconData statusIcon;
    String statusText;

    switch (status.toLowerCase()) {
      case 'confirmed':
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        statusText = 'CONFIRMED';
        break;
      case 'completed':
        statusColor = Colors.blue;
        statusIcon = Icons.done_all;
        statusText = 'COMPLETED';
        break;
      case 'cancelled':
        statusColor = Colors.red;
        statusIcon = Icons.cancel;
        statusText = 'CANCELLED';
        break;
      default:
        statusColor = Colors.orange;
        statusIcon = Icons.pending;
        statusText = 'PENDING';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white, statusColor.withOpacity(0.05)],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header with patient info and status
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                const Color(0xFF0A4D68),
                                const Color(0xFF088395)
                              ],
                            ),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: const Icon(Icons.person,
                              color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                patientName,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'ID: #APT${appointment['id'] ?? '000'}',
                                style: TextStyle(
                                    fontSize: 11, color: Colors.grey[500]),
                              ),
                              if (createdAt != null) ...[
                                Text(
                                  'Requested: ${_formatDate(createdAt)}',
                                  style: TextStyle(
                                      fontSize: 10, color: Colors.grey[400]),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: statusColor.withOpacity(0.3)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(statusIcon, size: 14, color: statusColor),
                        const SizedBox(width: 6),
                        Text(
                          statusText,
                          style: TextStyle(
                            color: statusColor,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // Appointment Details
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _buildDetailItem(
                            icon: Icons.calendar_today,
                            label: 'Date',
                            value: formattedDate,
                            color: Colors.blue,
                          ),
                        ),
                        Expanded(
                          child: _buildDetailItem(
                            icon: Icons.access_time,
                            label: 'Time',
                            value: appointmentTime,
                            color: Colors.orange,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: _buildDetailItem(
                            icon: Icons.medical_services,
                            label: 'Doctor',
                            value: doctorName,
                            color: Colors.purple,
                          ),
                        ),
                        Expanded(
                          child: _buildDetailItem(
                            icon: Icons.phone,
                            label: 'Contact',
                            value: appointment['patient_phone'] ?? 'N/A',
                            color: Colors.teal,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Symptoms Section
              if (symptoms.isNotEmpty &&
                  symptoms != 'No symptoms provided') ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.amber.shade200),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.description,
                          size: 18, color: Colors.amber.shade700),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Symptoms / Reason',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: Colors.amber.shade800,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              symptoms,
                              style: TextStyle(
                                  fontSize: 13, color: Colors.amber.shade900),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // Action Buttons for Pending Appointments
              if (isPending) ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () =>
                            _updateStatus(appointment['id'], 'cancelled'),
                        icon: const Icon(Icons.close, size: 18),
                        label: const Text('Cancel'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () =>
                            _updateStatus(appointment['id'], 'confirmed'),
                        icon: const Icon(Icons.check, size: 18),
                        label: const Text('Confirm'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                  ],
                ),
              ] else if (status.toLowerCase() == 'confirmed') ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () =>
                        _updateStatus(appointment['id'], 'completed'),
                    icon: const Icon(Icons.done_all, size: 18),
                    label: const Text('Mark as Completed'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailItem({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(fontSize: 10, color: Colors.grey[500]),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _formatDate(String dateTimeStr) {
    try {
      final date = DateTime.parse(dateTimeStr);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inDays > 7) {
        return '${date.day}/${date.month}/${date.year}';
      } else if (diff.inDays > 0) {
        return '${diff.inDays} days ago';
      } else if (diff.inHours > 0) {
        return '${diff.inHours} hours ago';
      } else if (diff.inMinutes > 0) {
        return '${diff.inMinutes} minutes ago';
      } else {
        return 'Just now';
      }
    } catch (e) {
      return dateTimeStr.split('T')[0];
    }
  }
}
