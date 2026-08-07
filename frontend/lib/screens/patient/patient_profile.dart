// lib/screens/patient/patient_profile.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/patient_provider.dart';
import '../login_screen.dart';

class PatientProfile extends StatelessWidget {
  const PatientProfile({super.key});

  @override
  Widget build(BuildContext context) {
    final patientProvider = Provider.of<PatientProvider>(context);
    final patientData = patientProvider.patientData;
    final authProvider = Provider.of<AuthProvider>(context, listen: false);

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Profile'),
        centerTitle: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF0A4D68), Color(0xFF088395)]),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 20, offset: const Offset(0, 10))]),
                    child: const Icon(Icons.person, size: 60, color: Color(0xFF0A4D68)),
                  ),
                  const SizedBox(height: 16),
                  Text(patientData?['name'] ?? 'Patient Name', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
                  Text(patientData?['email'] ?? 'email@example.com', style: const TextStyle(color: Colors.white70)),
                ],
              ),
            ),
            const SizedBox(height: 24),
            _buildInfoCard(
              title: 'Personal Information',
              icon: Icons.person_outline,
              children: [
                _buildInfoRow(Icons.phone, 'Phone Number', patientData?['phone'] ?? 'Not set', Colors.green, () => _showEditDialog(context, 'Phone Number', patientData?['phone'] ?? '', (v) => patientProvider.updateProfile(phone: v))),
                _buildInfoRow(Icons.water_drop, 'Blood Group', patientData?['blood_group'] ?? 'Not set', Colors.red, () => _showBloodGroupDialog(context, patientData?['blood_group'] ?? '', (v) => patientProvider.updateProfile(bloodGroup: v))),
                _buildInfoRow(Icons.emergency, 'Emergency Contact', patientData?['emergency_contact'] ?? 'Not set', Colors.orange, () => _showEditDialog(context, 'Emergency Contact', patientData?['emergency_contact'] ?? '', (v) => patientProvider.updateProfile(emergencyContact: v))),
              ],
            ),
            const SizedBox(height: 24),
            _buildInfoCard(
              title: 'Medical History',
              icon: Icons.history,
              children: [
                _buildInfoRow(Icons.medical_information, 'Allergies', 'None reported', Colors.purple, () {}),
                _buildInfoRow(Icons.medical_information, 'Chronic Conditions', 'None reported', Colors.blue, () {}),
                _buildInfoRow(Icons.medical_information, 'Recent Surgeries', 'None reported', Colors.teal, () {}),
              ],
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () async {
                  final shouldLogout = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      title: Row(
                        children: [
                          Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.logout, color: Colors.red)),
                          const SizedBox(width: 12),
                          const Text('Logout', style: TextStyle(fontWeight: FontWeight.bold)),
                        ],
                      ),
                      content: const Text('Are you sure you want to logout?'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                        ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: Colors.red), child: const Text('Logout')),
                      ],
                    ),
                  );
                  if (shouldLogout == true && context.mounted) {
                    await authProvider.logout();
                    if (context.mounted) Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (context) => const LoginScreen()), (route) => false);
                  }
                },
                icon: const Icon(Icons.logout),
                label: const Text('Logout'),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
              ),
            ),
          ],
        ),
      ),
    );
    
  }

  Widget _buildInfoCard({required String title, required IconData icon, required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: [BoxShadow(color: Colors.grey.shade100, blurRadius: 20, offset: const Offset(0, 4))]),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: const Color(0xFF0A4D68).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: const Color(0xFF0A4D68), size: 20)),
                const SizedBox(width: 12),
                Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value, Color color, VoidCallback onEdit) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 18, color: color)),
          const SizedBox(width: 12),
          SizedBox(width: 120, child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(child: Text(value, style: TextStyle(color: Colors.grey[700]))),
          IconButton(icon: const Icon(Icons.edit, size: 18), onPressed: onEdit, constraints: const BoxConstraints()),
        ],
      ),
    );
  }

  void _showEditDialog(BuildContext context, String field, String currentValue, Function(String) onSave) {
    final controller = TextEditingController(text: currentValue);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: const Color(0xFF0A4D68).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.edit, color: Color(0xFF0A4D68))),
            const SizedBox(width: 12),
            Text('Edit $field', style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: TextField(controller: controller, decoration: InputDecoration(labelText: field, border: const OutlineInputBorder())),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                onSave(controller.text);
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$field updated successfully'), backgroundColor: Colors.green));
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0A4D68)),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showBloodGroupDialog(BuildContext context, String currentValue, Function(String) onSave) {
    String selectedGroup = currentValue;
    final List<String> bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.water_drop, color: Colors.red)),
            const SizedBox(width: 12),
            const Text('Edit Blood Group', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: DropdownButtonFormField<String>(
          initialValue: selectedGroup.isNotEmpty ? selectedGroup : null,
          decoration: const InputDecoration(labelText: 'Blood Group', border: OutlineInputBorder()),
          items: bloodGroups.map((g) => DropdownMenuItem(value: g, child: Text(g))).toList(),
          onChanged: (v) => selectedGroup = v!,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              if (selectedGroup.isNotEmpty) {
                onSave(selectedGroup);
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Blood group updated successfully'), backgroundColor: Colors.green));
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}