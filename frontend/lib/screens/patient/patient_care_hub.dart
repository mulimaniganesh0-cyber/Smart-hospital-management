import 'package:flutter/material.dart';

import 'chatbot_screen.dart';
import 'patient_emergency_request.dart';
import 'patient_nearby_hospitals.dart';

/// A patient-facing workspace for care that happens between hospital visits.
/// Server-backed clinical records can be connected to the cards here without
/// changing the navigation structure.
class PatientCareHub extends StatefulWidget {
  const PatientCareHub({super.key});

  @override
  State<PatientCareHub> createState() => _PatientCareHubState();
}

class _PatientCareHubState extends State<PatientCareHub> {
  bool _largeText = false;
  final List<_Reminder> _reminders = [
    _Reminder('Metformin', 'After breakfast', '08:00 AM'),
    _Reminder('Vitamin D3', 'Every Sunday', '09:00 AM'),
  ];

  @override
  Widget build(BuildContext context) {
    final scale = _largeText ? 1.18 : 1.0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Care Hub'),
        actions: [
          IconButton(
            tooltip: 'Accessibility mode',
            onPressed: () => setState(() => _largeText = !_largeText),
            icon: Icon(_largeText ? Icons.text_decrease : Icons.text_increase),
          ),
        ],
      ),
      body: MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _emergencyBanner(),
            const SizedBox(height: 20),
            const Text('Today at a glance', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            _queueCard(),
            const SizedBox(height: 20),
            _section('Appointments & reminders', [
              _actionTile(Icons.calendar_month, Colors.blue, 'Appointments', 'Reminder and rescheduling options', _showAppointments),
              _actionTile(Icons.medication_outlined, Colors.deepPurple, 'Medicine reminders', '${_reminders.length} active reminders', _showReminders),
            ]),
            _section('Health records', [
              _actionTile(Icons.folder_shared_outlined, Colors.teal, 'Prescription & document vault', 'Prescriptions, discharge summaries and IDs', () => _showInfo('Document vault', 'Your secure vault keeps prescription and treatment documents in one place. Upload integration can be connected to your hospital record service.')),
              _actionTile(Icons.science_outlined, Colors.orange, 'Lab reports', 'Upload and view reports', () => _showInfo('Lab reports', 'No new reports to review. Ask your lab to share a digital report or upload a PDF from this screen when record upload is enabled.')),
              _actionTile(Icons.health_and_safety_outlined, Colors.red, 'Health profile', 'Blood group, allergies and emergency contacts', () => _showInfo('Health profile', 'Keep your blood group, allergies, conditions and emergency contacts current so care teams can act quickly.')),
            ]),
            _section('Find the right care', [
              _actionTile(Icons.compare_arrows, Colors.indigo, 'Compare hospitals', 'Distance, cost, specialties and live beds', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PatientNearbyHospitals()))),
              _actionTile(Icons.smart_toy_outlined, const Color(0xFF0A4D68), 'Ask CareGuide', 'Navigate hospitals and discover services', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatbotScreen()))),
            ]),
            _section('Family & payments', [
              _actionTile(Icons.family_restroom, Colors.pink, 'Caregiver access', 'Share access safely with family', _showCaregiver),
              _actionTile(Icons.receipt_long_outlined, Colors.green, 'Payments & insurance', 'Invoices, payments and claim status', _showPayments),
            ]),
            _section('Support', [
              _actionTile(Icons.feedback_outlined, Colors.amber.shade800, 'Feedback & issue reporting', 'Help us improve your care experience', _showFeedback),
              _actionTile(Icons.translate, Colors.cyan.shade800, 'Language & accessibility', _largeText ? 'Large text is on' : 'Choose language and display options', _showAccessibility),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _emergencyBanner() => InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PatientEmergencyRequest())),
        child: Ink(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFFFEBEE), borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.red.shade200)),
          child: const Row(children: [
            CircleAvatar(backgroundColor: Colors.red, child: Icon(Icons.sos, color: Colors.white)),
            SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Emergency SOS', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red)), SizedBox(height: 2), Text('Send your live location and alert your emergency contact')])) ,
            Icon(Icons.chevron_right, color: Colors.red),
          ]),
        ),
      );

  Widget _queueCard() => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Container(padding: const EdgeInsets.all(11), decoration: BoxDecoration(color: const Color(0xFFD9F0F3), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.confirmation_number_outlined, color: Color(0xFF0A4D68))),
            const SizedBox(width: 12),
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('No active queue token', style: TextStyle(fontWeight: FontWeight.bold)), SizedBox(height: 3), Text('Your next token and estimated wait will appear here.')])) ,
            TextButton(onPressed: _showAppointments, child: const Text('View')),
          ]),
        ),
      );

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Card(child: Column(children: children)),
        ]),
      );

  Widget _actionTile(IconData icon, Color color, String title, String subtitle, VoidCallback onTap) => ListTile(
        onTap: onTap,
        leading: Container(padding: const EdgeInsets.all(9), decoration: BoxDecoration(color: color.withOpacity(.11), borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: color)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
      );

  void _showAppointments() => _showInfo('Appointments', 'You have no upcoming appointments. When you book an appointment, its reminder, queue token and rescheduling choices will appear here.');

  void _showReminders() => showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => StatefulBuilder(builder: (sheetContext, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetContext).viewInsets.bottom + 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Medicine reminders', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            ..._reminders.map((r) => ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.medication, color: Colors.deepPurple), title: Text(r.name), subtitle: Text('${r.schedule} • ${r.time}'), trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () { setState(() => _reminders.remove(r)); setSheetState(() {}); }))),
            OutlinedButton.icon(onPressed: () { Navigator.pop(sheetContext); _addReminder(); }, icon: const Icon(Icons.add), label: const Text('Add reminder')),
          ]),
        )),
      );

  void _addReminder() {
    final name = TextEditingController();
    final time = TextEditingController(text: '08:00 AM');
    showDialog(context: context, builder: (dialogContext) => AlertDialog(title: const Text('New medicine reminder'), content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: name, decoration: const InputDecoration(labelText: 'Medicine name')), TextField(controller: time, decoration: const InputDecoration(labelText: 'Time'))]), actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')), FilledButton(onPressed: () { if (name.text.trim().isNotEmpty) setState(() => _reminders.add(_Reminder(name.text.trim(), 'Daily', time.text.trim()))); Navigator.pop(dialogContext); }, child: const Text('Save'))]));
  }

  void _showCaregiver() => _showInfo('Caregiver access', 'Invite a trusted family member to view appointments, reminders and shared records. They will need to accept your invitation before access is granted.');
  void _showPayments() => _showInfo('Payments & insurance', 'No outstanding invoices. Insurance claims linked to a hospital bill will show their submitted, in-review, approved or rejected status here.');

  void _showFeedback() {
    final feedback = TextEditingController();
    showDialog(context: context, builder: (dialogContext) => AlertDialog(title: const Text('Share feedback'), content: TextField(controller: feedback, maxLines: 4, decoration: const InputDecoration(hintText: 'Tell us what went well or report an issue')), actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')), FilledButton(onPressed: () { Navigator.pop(dialogContext); ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Thank you—your feedback has been recorded.'))); }, child: const Text('Submit'))]));
  }

  void _showAccessibility() => showDialog(context: context, builder: (dialogContext) => AlertDialog(title: const Text('Language & accessibility'), content: Column(mainAxisSize: MainAxisSize.min, children: [const ListTile(leading: Icon(Icons.language), title: Text('English'), subtitle: Text('More languages can be added in settings')), SwitchListTile(value: _largeText, onChanged: (value) { setState(() => _largeText = value); Navigator.pop(dialogContext); }, title: const Text('Large text'))]), actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done'))]));

  void _showInfo(String title, String content) => showDialog(context: context, builder: (dialogContext) => AlertDialog(title: Text(title), content: Text(content), actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))]));
}

class _Reminder {
  const _Reminder(this.name, this.schedule, this.time);
  final String name;
  final String schedule;
  final String time;
}
