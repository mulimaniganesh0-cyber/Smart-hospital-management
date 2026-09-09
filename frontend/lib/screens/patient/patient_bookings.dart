// lib/screens/patient/patient_bookings.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/patient_provider.dart';
import '../../services/api_service.dart';
import 'patient_nearby_hospitals.dart';
import '../../widgets/app_ui.dart';

class PatientBookings extends StatelessWidget {
  const PatientBookings({super.key});

  @override
  Widget build(BuildContext context) {
    final patientProvider = Provider.of<PatientProvider>(context);
    final bookings = patientProvider.bookings;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My appointments'),
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
                ? CareGuideEmptyState(
                    icon: Icons.calendar_month_outlined,
                    title: 'No appointments yet',
                    message: 'When you book a doctor visit, its details will appear here.',
                    action: ElevatedButton.icon(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const PatientNearbyHospitals())),
                      icon: const Icon(Icons.local_hospital_outlined),
                      label: const Text('Find a hospital'),
                    ),
                  )
                : CareGuidePage(
                    child: ListView.builder(
                    padding: const EdgeInsets.only(bottom: 24),
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
                  )),
      ),
    );
    // lib/screens/patient/patient_bookings.dart
// Add this to the widget class

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

  Future<void> _showRescheduleDialog(BuildContext context, Map<String, dynamic> booking) async {
    final rawId = booking['id'];
    final appointmentId = rawId is num ? rawId.toInt() : int.tryParse('$rawId');
    if (appointmentId == null) return;
    final initial = DateTime.tryParse('${booking['appointment_date']}') ?? DateTime.now().add(const Duration(days: 1));
    final date = await showDatePicker(context: context, initialDate: initial.isAfter(DateTime.now()) ? initial : DateTime.now().add(const Duration(days: 1)), firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)));
    if (date == null || !context.mounted) return;
    final formatted = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    final slotResult = await ApiService.getAppointmentSlots(appointmentId, formatted);
    if (!context.mounted) return;
    final slots = slotResult['success'] == true ? List<Map<String, dynamic>>.from(slotResult['data'] ?? []) : <Map<String, dynamic>>[];
    if (slots.isEmpty) { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(slotResult['message'] ?? 'No available slots on this date'))); return; }
    final selected = await showModalBottomSheet<String>(context: context, builder: (sheetContext) => SafeArea(child: ListView(
      shrinkWrap: true,
      children: [const ListTile(title: Text('Select an available time')), ...slots.map((slot) => ListTile(title: Text('${slot['time']}'), trailing: const Icon(Icons.chevron_right), onTap: () => Navigator.pop(sheetContext, '${slot['time']}')))],
    )));
    if (selected == null || !context.mounted) return;
    final result = await ApiService.rescheduleAppointment(appointmentId, formatted, selected);
    if (!context.mounted) return;
    if (result['success'] == true) {
      await Provider.of<PatientProvider>(context, listen: false).loadPatientData();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Appointment rescheduled')));
    } else { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result['message'] ?? 'Unable to reschedule appointment'))); }
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

  CareGuideStatusTone get _statusTone {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return CareGuideStatusTone.success;
      case 'pending':
        return CareGuideStatusTone.warning;
      case 'completed':
        return CareGuideStatusTone.info;
      case 'cancelled':
        return CareGuideStatusTone.danger;
      default:
        return CareGuideStatusTone.neutral;
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
                CareGuideStatusBadge(label: status, tone: _statusTone),
              ],
            ),
            const SizedBox(height: 8),
            Text('Dr. $doctorName', style: const TextStyle(color: CareGuideColors.ink, fontWeight: FontWeight.w600)),
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
