import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import '../services/api_service.dart';

class PrivateAmbulanceRegistrationScreen extends StatefulWidget {
  const PrivateAmbulanceRegistrationScreen({super.key});
  @override
  State<PrivateAmbulanceRegistrationScreen> createState() =>
      _PrivateAmbulanceRegistrationScreenState();
}

class _PrivateAmbulanceRegistrationScreenState
    extends State<PrivateAmbulanceRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _controllers = {
    for (final key in const [
      'name',
      'email',
      'phone',
      'password',
      'license_number',
      'license_expiry',
      'vehicle_number',
      'vehicle_type',
      'vehicle_make',
      'vehicle_model',
      'service_area',
      'operating_location',
      'documents'
    ])
      key: TextEditingController()
  };
  bool _busy = false, _submitted = false;
  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'Required' : null;
  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final rawDate = _controllers['license_expiry']!.text.trim();
    final date = DateTime.tryParse(rawDate);
    if (date == null || !date.isAfter(DateTime.now())) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Enter a future license expiry date as YYYY-MM-DD')));
      return;
    }
    setState(() => _busy = true);
    final response = await ApiService.registerPrivateDriver({
      'name': _controllers['name']!.text.trim(),
      'email': _controllers['email']!.text.trim(),
      'phone': _controllers['phone']!.text.trim(),
      'password': _controllers['password']!.text,
      'license_number': _controllers['license_number']!.text.trim(),
      'license_expiry': rawDate,
      'vehicle_number': _controllers['vehicle_number']!.text.trim(),
      'vehicle_type': _controllers['vehicle_type']!.text.trim(),
      'vehicle_make': _controllers['vehicle_make']!.text.trim(),
      'vehicle_model': _controllers['vehicle_model']!.text.trim(),
      'service_area': _controllers['service_area']!.text.trim(),
      'operating_location': _controllers['operating_location']!.text.trim(),
      'documents': _controllers['documents']!
          .text
          .split('\n')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList(),
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (response['success'] == true) {
      setState(() => _submitted = true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              response['message'] ?? 'Registration could not be submitted')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Private Ambulance Registration')),
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: _submitted
                      ? _success()
                      : Form(
                          key: _formKey,
                          child: ListView(children: [
                            const Text(
                                'Register as an independent ambulance operator. Your account and vehicle will remain unavailable until an administrator verifies your identity, license, and vehicle.',
                                style: TextStyle(color: Colors.black54)),
                            const SizedBox(height: 18),
                            _field('name', 'Driver full name',
                                validator: _required),
                            _field('email', 'Email address',
                                keyboard: TextInputType.emailAddress,
                                validator: (v) => v != null && v.contains('@')
                                    ? null
                                    : 'Enter a valid email'),
                            _field('phone', 'Phone number',
                                keyboard: TextInputType.phone,
                                validator: _required),
                            _field(
                                'password', 'Password (10 characters minimum)',
                                secret: true,
                                validator: (v) => v != null && v.length >= 10
                                    ? null
                                    : 'Use at least 10 characters'),
                            const Divider(height: 32),
                            _field('license_number', 'Driving license number',
                                validator: _required),
                            _field(
                                'license_expiry', 'License expiry (YYYY-MM-DD)',
                                validator: _required),
                            const Divider(height: 32),
                            _field('vehicle_number',
                                'Ambulance registration number',
                                validator: _required),
                            _field('vehicle_type', 'Ambulance type',
                                validator: _required),
                            _field('vehicle_make', 'Vehicle make'),
                            _field('vehicle_model', 'Vehicle model'),
                            _field('service_area', 'Service area',
                                validator: _required),
                            _field('operating_location', 'Operating location',
                                validator: _required),
                            _field('documents',
                                'Verification document links (one per line, optional)',
                                lines: 3),
                            const SizedBox(height: 8),
                            const Text(
                                'Location is shared with an assigned patient only while an active trip is in progress. Document links are reviewed by an administrator; upload them only to a private, access-controlled service.',
                                style: TextStyle(
                                    fontSize: 12, color: Colors.black54)),
                            const SizedBox(height: 16),
                            FilledButton.icon(
                                onPressed: _busy ? null : _submit,
                                icon: _busy
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2))
                                    : const Icon(Icons.send),
                                label: Text(_busy
                                    ? 'Submitting…'
                                    : 'Submit for verification')),
                          ]))))));
  Widget _field(String key, String label,
          {String? Function(String?)? validator,
          TextInputType? keyboard,
          bool secret = false,
          int lines = 1}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextFormField(
              controller: _controllers[key],
              validator: validator,
              keyboardType: keyboard,
              obscureText: secret,
              maxLines: secret ? 1 : lines,
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder())));
  Widget _success() => Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.hourglass_top_rounded,
            size: 54, color: AppColors.warning),
        const SizedBox(height: 12),
        Text('Application received',
            style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        const Text(
            'Your driver and ambulance records are pending verification. You cannot sign in to operational driver services until an administrator approves the application.',
            textAlign: TextAlign.center),
        const SizedBox(height: 18),
        FilledButton(
            onPressed: () => Navigator.pop(context), child: const Text('Done'))
      ]);
}
