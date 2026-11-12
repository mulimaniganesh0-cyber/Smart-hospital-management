import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import '../../services/api_service.dart';

class PrivateDriverVerificationScreen extends StatefulWidget {
  const PrivateDriverVerificationScreen({super.key});
  @override
  State<PrivateDriverVerificationScreen> createState() =>
      _PrivateDriverVerificationScreenState();
}

class _PrivateDriverVerificationScreenState
    extends State<PrivateDriverVerificationScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _applications = [];
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final r = await ApiService.getPrivateDriverApplications();
    if (!mounted) return;
    setState(() => _loading = false);
    if (r['success'] == true) {
      setState(() =>
          _applications = List<Map<String, dynamic>>.from(r['data'] ?? []));
      _error = null;
    } else {
      setState(() => _error = r['message'] ?? 'Unable to load applications');
    }
  }

  Future<void> _review(Map<String, dynamic> item, String action) async {
    final id = (item['id'] as num).toInt();
    final notes = TextEditingController();
    if (action != 'approve') {
      final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
                  title: Text(
                      '${action[0].toUpperCase()}${action.substring(1)} application'),
                  content: TextField(
                      controller: notes,
                      maxLines: 3,
                      decoration:
                          const InputDecoration(labelText: 'Review notes')),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Submit review'))
                  ]));
      if (ok != true) {
        notes.dispose();
        return;
      }
    }
    final r =
        await ApiService.reviewPrivateDriver(id, action, notes: notes.text);
    notes.dispose();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(r['success'] == true
            ? 'Application $action${action == 'approve' ? '; driver may now sign in' : ''}'
            : r['message'] ?? 'Review failed')));
    if (r['success'] == true) _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          title: const Text('Private Driver Verification'),
          actions: [
            IconButton(onPressed: _load, icon: const Icon(Icons.refresh))
          ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_error!),
                  ElevatedButton(onPressed: _load, child: const Text('Retry'))
                ]))
              : _applications.isEmpty
                  ? const Center(
                      child: Text(
                          'No private driver applications are waiting for review.'))
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _applications.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final d = _applications[index];
                        final vehicle = d['driver_vehicle_details'] is Map
                            ? Map<String, dynamic>.from(
                                d['driver_vehicle_details'])
                            : <String, dynamic>{};
                        final status =
                            d['driver_status'] ?? 'pending_verification';
                        return Card(
                            child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(children: [
                                        Expanded(
                                            child: Text(d['name'] ?? 'Driver',
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .titleMedium)),
                                        Chip(
                                            label: Text(status
                                                .toString()
                                                .replaceAll('_', ' ')))
                                      ]),
                                      Text(
                                          '${d['email'] ?? ''} · ${d['phone'] ?? ''}'),
                                      Text(
                                          'License: ${d['driver_license_number'] ?? '—'} · expires ${d['driver_license_expiry'] ?? '—'}'),
                                      Text(
                                          'Vehicle: ${vehicle['registration_number'] ?? '—'} · ${vehicle['type'] ?? ''} ${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}'),
                                      Text(
                                          'Service: ${d['driver_service_area'] ?? '—'} · ${d['driver_operating_location'] ?? '—'}'),
                                      if (d['driver_verification_documents']
                                          is List)
                                        ...(d['driver_verification_documents']
                                                as List)
                                            .map((url) => SelectableText(
                                                'Document: $url',
                                                style: const TextStyle(
                                                    color: AppColors.primary))),
                                      if (status == 'pending_verification' ||
                                          status == 'suspended')
                                        Wrap(spacing: 8, children: [
                                          FilledButton.icon(
                                              onPressed: () =>
                                                  _review(d, 'approve'),
                                              icon: const Icon(Icons.verified),
                                              label: const Text('Approve')),
                                          TextButton.icon(
                                              onPressed: () =>
                                                  _review(d, 'reject'),
                                              icon: const Icon(Icons.close),
                                              label: const Text('Reject'))
                                        ])
                                    ])));
                      }));
}
