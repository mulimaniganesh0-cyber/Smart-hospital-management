// lib/screens/patient/patient_bookings.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/patient_provider.dart';
import 'patient_nearby_hospitals.dart';

class PatientBookings extends StatelessWidget {
  const PatientBookings({super.key});

  @override
  Widget build(BuildContext context) {
    final patientProvider = Provider.of<PatientProvider>(context);
    final bookings = patientProvider.bookings;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Bookings'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              patientProvider.loadPatientData();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => patientProvider.loadPatientData(),
        child: patientProvider.isLoading
            ? const Center(child: CircularProgressIndicator())
            : bookings.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.bookmark_border, size: 64, color: Colors.grey[400]),
                        const SizedBox(height: 16),
                        Text(
                          'No bookings yet',
                          style: TextStyle(color: Colors.grey[600], fontSize: 16),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Book your first appointment',
                          style: TextStyle(color: Colors.grey[500], fontSize: 14),
                        ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => const PatientNearbyHospitals(),
                              ),
                            );
                          },
                          child: const Text('Browse Hospitals'),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: bookings.length,
                    itemBuilder: (context, index) {
                      final booking = bookings[index];
                      return BookingCard(
                        hospitalName: booking['hospital_name'] ?? 'Hospital',
                        doctorName: booking['doctor_name'] ?? 'Doctor',
                        date: booking['appointment_date'] ?? '',
                        time: booking['appointment_time'] ?? '',
                        status: booking['status'] ?? 'Pending',
                        appointmentId: booking['id'] ?? index,
                        onCancel: () => _showCancelDialog(context, booking['id'], patientProvider),
                        onReschedule: () => _showRescheduleDialog(context, booking),
                      );
                    },
                  ),
      ),
    );
    // lib/screens/patient/patient_bookings.dart
// Add this to the widget class

  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'completed':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  void _showCancelDialog(BuildContext context, int? appointmentId, PatientProvider provider) {
    if (appointmentId == null) return;
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel Appointment'),
        content: const Text('Are you sure you want to cancel this appointment?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('No'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              final success = await provider.cancelBooking(appointmentId);
              if (success && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Appointment cancelled successfully')),
                );
              } else if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Failed to cancel appointment')),
                );
              }
            },
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );
  }

  void _showRescheduleDialog(BuildContext context, Map<String, dynamic> booking) {
    final newDate = TextEditingController(text: booking['appointment_date']);
    final newTime = TextEditingController(text: booking['appointment_time']);
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reschedule Appointment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: newDate,
              decoration: const InputDecoration(
                labelText: 'New Date',
                prefixIcon: Icon(Icons.calendar_today),
                hintText: 'YYYY-MM-DD',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: newTime,
              decoration: const InputDecoration(
                labelText: 'New Time',
                prefixIcon: Icon(Icons.access_time),
                hintText: 'HH:MM AM/PM',
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
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Reschedule request submitted')),
              );
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }
}

class BookingCard extends StatelessWidget {
  final String hospitalName;
  final String doctorName;
  final String date;
  final String time;
  final String status;
  final int appointmentId;
  final VoidCallback onCancel;
  final VoidCallback onReschedule;

  const BookingCard({
    super.key,
    required this.hospitalName,
    required this.doctorName,
    required this.date,
    required this.time,
    required this.status,
    required this.appointmentId,
    required this.onCancel,
    required this.onReschedule,
  });

  Color get _statusColor {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'completed':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    hospitalName,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: _statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    status,
                    style: TextStyle(color: _statusColor, fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(doctorName),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.calendar_today, size: 16, color: Colors.grey),
                const SizedBox(width: 8),
                Text(date),
                const SizedBox(width: 16),
                const Icon(Icons.access_time, size: 16, color: Colors.grey),
                const SizedBox(width: 8),
                Text(time),
              ],
            ),
            if (status.toLowerCase() == 'confirmed' || status.toLowerCase() == 'pending') ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onCancel,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: onReschedule,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0A4D68),
                      ),
                      child: const Text('Reschedule'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}