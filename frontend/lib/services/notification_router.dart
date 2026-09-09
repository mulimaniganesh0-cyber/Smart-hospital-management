import 'package:flutter/material.dart';

import '../screens/admin/admin_hospital_detail.dart';
import '../screens/hospital/hospital_profile.dart';
import '../widgets/notification_record_screen.dart';

/// One router for notification-center and foreground Socket.IO actions.
/// It relies only on structured type/entity fields, never notification text.
class NotificationRouter {
  static Future<void> open(BuildContext context, Map<String, dynamic> notification) async {
    final type = notification['type']?.toString().toLowerCase();
    final entityType = notification['related_type']?.toString().toLowerCase();
    final rawId = notification['related_id'] ?? notification['emergency_id'] ?? notification['ambulance_id'];
    final entityId = rawId is num ? rawId.toInt() : int.tryParse('$rawId');
    if (entityId == null || entityType == null) {
      _unavailable(context);
      return;
    }
    final route = switch (entityType) {
      'resource_request' => ('resource_request', 'Resource request'),
      'blood_request' => ('blood_request', 'Blood request'),
      'ambulance_booking' => ('ambulance_booking', 'Ambulance booking'),
      'emergency' => ('emergency', 'Emergency details'),
      'hospital' when type == 'hospital_registration' || type == 'hospital_verified' || type == 'hospital_verification_rejected' => null,
      _ => null,
    };
    if (entityType == 'hospital') {
      if (type == 'hospital_registration') {
        await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(builder: (_) => AdminHospitalDetailScreen(hospitalId: entityId, hospitalName: notification['title']?.toString() ?? 'Hospital')));
      } else if (type == 'hospital_verified' || type == 'hospital_verification_rejected') {
        await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(builder: (_) => const HospitalProfile()));
      } else { _unavailable(context); }
      return;
    }
    if (route == null) { _unavailable(context); return; }
    await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(builder: (_) => NotificationRecordScreen(entityType: route.$1, entityId: entityId, title: route.$2)));
  }

  static void _unavailable(BuildContext context) => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('This item is no longer available.')));
}
