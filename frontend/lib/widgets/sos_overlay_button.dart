// lib/widgets/sos_overlay_button.dart
import 'package:flutter/material.dart';
import '../screens/patient/patient_emergency_request.dart';

class SosButtonWidget extends StatelessWidget {
  final bool isCompact;
  const SosButtonWidget({super.key, this.isCompact = false});

  void _triggerSos(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: const ClipRRect(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          child: PatientEmergencyRequest(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (isCompact) {
      return IconButton(
        onPressed: () => _triggerSos(context),
        icon: Container(
          padding: const EdgeInsets.all(6),
          decoration: const BoxDecoration(
            color: Colors.red,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.redAccent,
                blurRadius: 6,
                spreadRadius: 1,
              ),
            ],
          ),
          child: const Text(
            'SOS',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 10,
            ),
          ),
        ),
        tooltip: 'Emergency SOS',
      );
    }

    return FloatingActionButton.extended(
      onPressed: () => _triggerSos(context),
      backgroundColor: Colors.red,
      elevation: 6,
      icon: const Icon(Icons.sos, color: Colors.white, size: 28),
      label: const Text(
        'EMERGENCY SOS',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.1,
        ),
      ),
    );
  }
}
