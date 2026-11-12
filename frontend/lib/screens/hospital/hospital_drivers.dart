import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../services/api_service.dart';

class HospitalDriversScreen extends StatefulWidget {
  const HospitalDriversScreen({super.key});
  @override
  State<HospitalDriversScreen> createState() => _HospitalDriversScreenState();
}

class _HospitalDriversScreenState extends State<HospitalDriversScreen> {
  bool _loading = true, _busy = false;
  String? _error;
  List<Map<String, dynamic>> _drivers = [], _ambulances = [];
  String _filter = '';
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final responses = await Future.wait(
        [ApiService.getHospitalDrivers(), ApiService.getHospitalAmbulances()]);
    if (!mounted) return;
    setState(() => _loading = false);
    if (responses[0]['success'] != true) {
      setState(
          () => _error = responses[0]['message'] ?? 'Unable to load drivers');
      return;
    }
    setState(() =>
        _drivers = List<Map<String, dynamic>>.from(responses[0]['data'] ?? []));
    if (responses[1]['success'] == true) {
      setState(() => _ambulances =
          List<Map<String, dynamic>>.from(responses[1]['data'] ?? []));
    }
  }

  Future<void> _add() async {
    final form = GlobalKey<FormState>();
    final name = TextEditingController();
    final email = TextEditingController();
    final phone = TextEditingController();
    final license = TextEditingController();
    final expiry = TextEditingController();
    final password = TextEditingController();
    int? ambulanceId;
    final available =
        _ambulances.where((a) => a['driver_user_id'] == null).toList();
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: const Text('Create hospital driver account'),
          content: SizedBox(
            width: 480,
            child: Form(
              key: form,
              child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  _input(name, 'Full name'),
                  _input(phone, 'Mobile number', keyboard: TextInputType.phone),
                  _input(email, 'Email (optional)'),
                  _input(license, 'Driving license number'),
                  _input(expiry, 'License expiry (YYYY-MM-DD)'),
                  _input(password, 'Initial password (10+ characters)',
                      obscure: true),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<int>(
                    decoration: const InputDecoration(
                        labelText: 'Assign ambulance',
                        border: OutlineInputBorder()),
                    items: available
                        .map((a) => DropdownMenuItem<int>(
                              value: (a['id'] as num).toInt(),
                              child: Text(
                                  '${a['vehicle_number']} · ${a['type'] ?? 'Ambulance'}'),
                            ))
                        .toList(),
                    onChanged: (value) => setDialog(() => ambulanceId = value),
                    validator: (value) => value == null
                        ? 'An unassigned ambulance is required'
                        : null,
                  ),
                  const SizedBox(height: 10),
                  const Text(
                      'The driver signs in with their mobile number and this initial password, then must change it.'),
                ]),
              ),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (form.currentState!.validate()) {
                  Navigator.pop(context, {
                    'name': name.text,
                    'email': email.text,
                    'phone': phone.text,
                    'license_number': license.text,
                    'license_expiry': expiry.text,
                    'ambulance_id': ambulanceId,
                    'initial_password': password.text,
                  });
                }
              },
              child: const Text('Send invitation'),
            ),
          ],
        ),
      ),
    );
    for (final controller in [name, email, phone, license, expiry, password]) {
      controller.dispose();
    }
    if (result == null) {
      return;
    }
    setState(() => _busy = true);
    final response = await ApiService.createHospitalDriver(result);
    if (!mounted) return;
    setState(() => _busy = false);
    if (response['success'] == true) {
      _load();
      await _showSecret(
          response['data']?['initial_password'], 'Initial password');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(response['message'] ?? 'Unable to create driver')));
    }
  }

  static Widget _input(TextEditingController c, String label,
          {TextInputType? keyboard, bool obscure = false}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: TextFormField(
              controller: c,
              keyboardType: keyboard,
              obscureText: obscure,
              validator: (v) {
                if (label == 'Email (optional)' &&
                    (v == null || v.trim().isEmpty)) {
                  return null;
                }
                if (v == null || v.trim().isEmpty) {
                  return 'Required';
                }
                if (label == 'Mobile number' &&
                    !RegExp(r'^\+?[0-9 ()-]{8,20}$').hasMatch(v.trim())) {
                  return 'Enter a valid mobile number';
                }
                if (label.startsWith('Initial password') && v.length < 10) {
                  return 'Use at least 10 characters';
                }
                if (label == 'License expiry (YYYY-MM-DD)' &&
                    !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v)) {
                  return 'Use YYYY-MM-DD';
                }
                return null;
              },
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder())));
  Future<void> _showSecret(dynamic secret, String title) async {
    if (secret is! String || secret.isEmpty) {
      return;
    }
    await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
                title: Text(title),
                content: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                          'Share securely with the driver. This password will not be available again.'),
                      const SizedBox(height: 12),
                      SelectableText(secret,
                          style: Theme.of(context).textTheme.titleMedium)
                    ]),
                actions: [
                  TextButton.icon(
                      onPressed: () =>
                          Clipboard.setData(ClipboardData(text: secret)),
                      icon: const Icon(Icons.copy),
                      label: const Text('Copy')),
                  FilledButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Done'))
                ]));
  }

  Future<void> _status(Map<String, dynamic> driver, String status) async {
    final response = await ApiService.updateHospitalDriver(
        (driver['id'] as num).toInt(), status);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(response['message'] ?? 'Unable to update driver')));
    if (response['success'] == true) _load();
  }

  Future<void> _reassign(Map<String, dynamic> driver) async {
    final available =
        _ambulances.where((a) => a['driver_user_id'] == null).toList();
    if (available.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('No unassigned ambulance is available')));
      return;
    }
    final id = await showDialog<int>(
        context: context,
        builder: (context) => SimpleDialog(
            title: const Text('Assign ambulance'),
            children: available
                .map((a) => SimpleDialogOption(
                    onPressed: () =>
                        Navigator.pop(context, (a['id'] as num).toInt()),
                    child: Text(
                        '${a['vehicle_number']} · ${a['type'] ?? 'Ambulance'}')))
                .toList()));
    if (id == null) return;
    final response = await ApiService.reassignHospitalDriver(
        (driver['id'] as num).toInt(), id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(response['message'] ??
            (response['success'] == true
                ? 'Ambulance reassigned'
                : 'Unable to reassign ambulance'))));
    if (response['success'] == true) _load();
  }

  Future<void> _reset(Map<String, dynamic> driver) async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('Reset driver password?'),
                content: Text(
                    'A new temporary password will replace the current password for ${driver['name']}. They must change it at next login.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('Reset password'))
                ]));
    if (ok != true) {
      return;
    }
    final r = await ApiService.resetHospitalDriverPassword(
        (driver['id'] as num).toInt());
    if (!mounted) {
      return;
    }
    if (r['success'] == true) {
      await _showSecret(r['data']?['temporary_password'], 'Temporary password');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(r['message'] ?? 'Unable to reset password')));
    }
    if (r['success'] == true) {
      _load();
    }
  }

  Future<void> _edit(Map<String, dynamic> d) async {
    final form = GlobalKey<FormState>();
    final name = TextEditingController(text: d['name']?.toString() ?? ''),
        phone = TextEditingController(text: d['phone']?.toString() ?? ''),
        email = TextEditingController(
            text: (d['email']?.toString() ?? '').endsWith('@driver.local')
                ? ''
                : d['email']?.toString() ?? ''),
        license = TextEditingController(
            text: d['driver_license_number']?.toString() ?? ''),
        expiry = TextEditingController(
            text:
                d['driver_license_expiry']?.toString().split('T').first ?? '');
    final data = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (ctx) => AlertDialog(
                title: const Text('Edit driver details'),
                content: SizedBox(
                    width: 480,
                    child: Form(
                        key: form,
                        child: SingleChildScrollView(
                            child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                              _input(name, 'Full name'),
                              _input(phone, 'Mobile number',
                                  keyboard: TextInputType.phone),
                              _input(email, 'Email (optional)'),
                              _input(license, 'Driving license number'),
                              _input(expiry, 'License expiry (YYYY-MM-DD)')
                            ])))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () {
                        if (form.currentState!.validate()) {
                          Navigator.pop(ctx, {
                            'name': name.text,
                            'phone': phone.text,
                            'email': email.text,
                            'license_number': license.text,
                            'license_expiry': expiry.text
                          });
                        }
                      },
                      child: const Text('Save'))
                ]));
    for (final c in [name, phone, email, license, expiry]) {
      c.dispose();
    }
    if (data == null) {
      return;
    }
    final r = await ApiService.updateHospitalDriverDetails(
        (d['id'] as num).toInt(), data);
    if (!mounted) {
      return;
    }
    if (r['success'] == true) {
      _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(r['message'] ?? 'Unable to update driver')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Hospital Drivers'), actions: [
        IconButton(
            onPressed: _loading ? null : _load,
            tooltip: 'Refresh drivers',
            icon: const Icon(Icons.refresh)),
        IconButton(
            onPressed: _busy ? null : _add,
            tooltip: 'Add driver',
            icon: const Icon(Icons.person_add_alt_1))
      ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_error!),
                  ElevatedButton(onPressed: _load, child: const Text('Retry'))
                ]))
              : Column(children: [
                  Padding(
                      padding: const EdgeInsets.all(16),
                      child: TextField(
                          decoration: const InputDecoration(
                              prefixIcon: Icon(Icons.search),
                              labelText:
                                  'Search drivers by name, mobile, license or ambulance'),
                          onChanged: (v) => setState(
                              () => _filter = v.trim().toLowerCase()))),
                  Expanded(
                      child: _drivers
                              .where((d) => [
                                    d['name'],
                                    d['phone'],
                                    d['driver_license_number'],
                                    d['vehicle_number']
                                  ].any((x) => (x ?? '')
                                      .toString()
                                      .toLowerCase()
                                      .contains(_filter)))
                              .isEmpty
                          ? const Center(
                              child: Text(
                                  'No hospital drivers match. Add a driver and assign an ambulance.'))
                          : ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: _drivers
                                  .where((d) => [
                                        d['name'],
                                        d['phone'],
                                        d['driver_license_number'],
                                        d['vehicle_number']
                                      ].any((x) => (x ?? '')
                                          .toString()
                                          .toLowerCase()
                                          .contains(_filter)))
                                  .length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                final d = _drivers
                                    .where((d) => [
                                          d['name'],
                                          d['phone'],
                                          d['driver_license_number'],
                                          d['vehicle_number']
                                        ].any((x) => (x ?? '')
                                            .toString()
                                            .toLowerCase()
                                            .contains(_filter)))
                                    .elementAt(index);
                                final active = d['driver_status'] == 'active';
                                return Card(
                                    child: Padding(
                                        padding: const EdgeInsets.all(14),
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Row(children: [
                                                Expanded(
                                                    child: Text(
                                                        d['name'] ?? 'Driver',
                                                        style: Theme.of(context)
                                                            .textTheme
                                                            .titleMedium)),
                                                Chip(
                                                    label: Text(
                                                        (d['driver_status'] ??
                                                                'unknown')
                                                            .toString()
                                                            .replaceAll(
                                                                '_', ' ')))
                                              ]),
                                              Text(
                                                  '${d['phone'] ?? 'No mobile'}${d['email'] == null || d['email'].toString().endsWith('@driver.local') ? '' : ' · ${d['email']}'}'),
                                              Text(
                                                  'License: ${d['driver_license_number'] ?? '—'} · expires ${d['driver_license_expiry'] ?? '—'}'),
                                              Text(
                                                  'Ambulance: ${d['vehicle_number'] ?? 'Not assigned'}'),
                                              Text(
                                                  'Availability: ${d['is_available'] == true ? 'Available' : d['has_active_trip'] == true ? 'On active trip' : 'Unavailable'} · Account: ${d['account_status'] ?? 'Unknown'}${d['password_reset_required'] == true ? ' · Password change required' : ''}'),
                                              Wrap(spacing: 8, children: [
                                                TextButton.icon(
                                                    onPressed: () => _edit(d),
                                                    icon: const Icon(
                                                        Icons.edit_outlined),
                                                    label: const Text(
                                                        'Edit details')),
                                                TextButton.icon(
                                                    onPressed: () => _reset(d),
                                                    icon: const Icon(
                                                        Icons.lock_reset),
                                                    label: const Text(
                                                        'Reset password')),
                                                TextButton.icon(
                                                    onPressed: () =>
                                                        _reassign(d),
                                                    icon: const Icon(
                                                        Icons.swap_horiz),
                                                    label: const Text(
                                                        'Reassign ambulance')),
                                                if (active)
                                                  TextButton.icon(
                                                      onPressed: () => _status(
                                                          d, 'suspended'),
                                                      icon: const Icon(Icons
                                                          .pause_circle_outline),
                                                      label:
                                                          const Text('Suspend'))
                                                else if (d['driver_status'] ==
                                                    'suspended')
                                                  TextButton.icon(
                                                      onPressed: () =>
                                                          _status(d, 'active'),
                                                      icon: const Icon(Icons
                                                          .play_circle_outline),
                                                      label: const Text(
                                                          'Activate')),
                                                if (d['driver_status'] !=
                                                    'deactivated')
                                                  TextButton.icon(
                                                      onPressed: () => _status(
                                                          d, 'deactivated'),
                                                      icon: const Icon(
                                                          Icons.block),
                                                      label: const Text(
                                                          'Deactivate'))
                                              ])
                                            ])));
                              }))
                ]));
}
