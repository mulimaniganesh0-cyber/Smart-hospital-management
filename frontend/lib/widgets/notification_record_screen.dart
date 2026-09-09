import 'package:flutter/material.dart';

import '../services/api_service.dart';

/// A detail view used only where an existing workflow has no detail page.
/// Data is fetched from an authorization-protected endpoint, never from the
/// notification body.
class NotificationRecordScreen extends StatefulWidget {
  const NotificationRecordScreen({super.key, required this.entityType, required this.entityId, required this.title});

  final String entityType;
  final int entityId;
  final String title;

  @override
  State<NotificationRecordScreen> createState() => _NotificationRecordScreenState();
}

class _NotificationRecordScreenState extends State<NotificationRecordScreen> {
  Map<String, dynamic>? _record;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final response = switch (widget.entityType) {
      'resource_request' => await ApiService.getResourceRequestDetails(widget.entityId),
      'blood_request' => await ApiService.getBloodRequestDetails(widget.entityId),
      'ambulance_booking' => await ApiService.getAmbulanceBookingDetails(widget.entityId),
      'emergency' => await ApiService.getEmergencyDetails(widget.entityId),
      _ => {'success': false, 'message': 'This item is no longer available.'},
    };
    if (!mounted) return;
    setState(() {
      _record = response['success'] == true && response['data'] is Map ? Map<String, dynamic>.from(response['data']) : null;
      _error = _record == null ? (response['message']?.toString() ?? 'This item is no longer available.') : null;
    });
  }

  String _label(String key) => key.replaceAll('_', ' ').split(' ').map((part) => part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}').join(' ');

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title)),
    body: _record == null && _error == null
      ? const Center(child: CircularProgressIndicator())
      : _record == null
        ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.info_outline, size: 40), const SizedBox(height: 12), Text(_error!, textAlign: TextAlign.center), const SizedBox(height: 12), OutlinedButton(onPressed: _load, child: const Text('Try again'))])))
        : ListView(padding: const EdgeInsets.all(16), children: _record!.entries.where((entry) => entry.value != null && entry.value.toString().isNotEmpty).map((entry) => Card(child: ListTile(title: Text(_label(entry.key)), subtitle: Text('${entry.value}')))).toList()),
  );
}
