// lib/screens/patient/hospital_resource_availability.dart
import 'package:flutter/material.dart';
import '../../models/hospital_model.dart';

class HospitalResourceAvailability extends StatelessWidget {
  final Hospital hospital;

  const HospitalResourceAvailability({
    super.key,
    required this.hospital,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${hospital.name} - Resources'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _buildResourceSection(
              title: 'Bed Availability',
              icon: Icons.king_bed,
              resources: [
                _buildResourceItem(
                  label: 'General Beds',
                  available: hospital.availableBeds,
                  total: hospital.totalBeds,
                ),
                _buildResourceItem(
                  label: 'ICU Beds',
                  available: hospital.availableIcu,
                  total: hospital.icuBeds,
                ),
                _buildResourceItem(
                  label: 'Oxygen Beds',
                  available: hospital.oxygenBedsAvailable,
                  total: hospital.oxygenBedsTotal,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildResourceSection(
              title: 'Medical Equipment',
              icon: Icons.medical_services,
              resources: [
                _buildResourceItem(
                  label: 'Ventilators',
                  available: hospital.availableVentilators,
                  total: hospital.ventilatorCount,
                ),
                _buildResourceItem(
                  label: 'Blood Units',
                  available: hospital.bloodUnits,
                  total: 100,
                ),
              ],
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A4D68),
                padding: const EdgeInsets.symmetric(vertical: 16),
                minimumSize: const Size(double.infinity, 50),
              ),
              child: const Text('Request Resources'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResourceSection({
    required String title,
    required IconData icon,
    required List<Widget> resources,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: const Color(0xFF0A4D68)),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(),
            ...resources,
          ],
        ),
      ),
    );
  }

  Widget _buildResourceItem({
    required String label,
    required int available,
    required int total,
  }) {
    final ratio = total > 0 ? available / total : 0;
    Color getColor() {
      if (total == 0) return Colors.grey;
      if (ratio > 0.5) return Colors.green;
      if (ratio > 0.2) return Colors.orange;
      return Colors.red;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LinearProgressIndicator(
                  value: total > 0 ? available / total : 0,
                  backgroundColor: Colors.grey.shade200,
                  valueColor: AlwaysStoppedAnimation<Color>(getColor()),
                  minHeight: 6,
                ),
                const SizedBox(height: 4),
                Text(
                  '$available / $total available',
                  style: TextStyle(
                    fontSize: 12,
                    color: getColor(),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}