import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import 'doctor/doctor_dashboard_screen.dart';
import 'driver/ambulance_driver_dashboard.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, this.required = false});
  final bool required;
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _old = TextEditingController(),
      _next = TextEditingController(),
      _confirm = TextEditingController();
  bool _busy = false, _showOld = false, _showNew = false, _showConfirm = false;
  @override
  void dispose() {
    _old.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  bool get _strong =>
      _next.text.length >= 10 &&
      RegExp(r'[a-z]').hasMatch(_next.text) &&
      RegExp(r'[A-Z]').hasMatch(_next.text) &&
      RegExp(r'[0-9]').hasMatch(_next.text) &&
      RegExp(r'[!@#\$%^&*(),.?":{}|<>_\-]').hasMatch(_next.text);
  Future<void> _submit() async {
    if (!_form.currentState!.validate()) {
      return;
    }
    setState(() => _busy = true);
    final result =
        await ApiService.changePassword(_old.text, _next.text, _confirm.text);
    if (!mounted) {
      return;
    }
    setState(() => _busy = false);
    if (result['success'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(result['message'] ?? 'Unable to change password')));
      return;
    }
    SocketService.instance.disconnect();
    await SocketService.instance.connect();
    if (!mounted) {
      return;
    }
    final user = Provider.of<AuthProvider>(context, listen: false).currentUser;
    ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password changed successfully.')));
    if (user?.userType == 'ambulance_driver') {
      Navigator.pushReplacement(context,
          MaterialPageRoute(builder: (_) => const AmbulanceDriverDashboard()));
    } else if (user?.userType == 'doctor') {
      Navigator.pushReplacement(context,
          MaterialPageRoute(builder: (_) => const DoctorDashboardScreen()));
    } else {
      Navigator.pop(context);
    }
  }

  Widget _field(TextEditingController c, String label, bool visible,
          VoidCallback toggle, {String? Function(String?)? validator}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: TextFormField(
              controller: c,
              obscureText: !visible,
              onChanged: (_) => setState(() {}),
              validator: validator ??
                  (v) => v == null || v.isEmpty ? 'Required' : null,
              decoration: InputDecoration(
                  labelText: label,
                  suffixIcon: IconButton(
                      tooltip: visible ? 'Hide password' : 'Show password',
                      onPressed: toggle,
                      icon: Icon(visible
                          ? Icons.visibility_off
                          : Icons.visibility)))));
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          title: Text(
              widget.required ? 'Change initial password' : 'Change password'),
          automaticallyImplyLeading: !widget.required),
      body: Center(
          child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Card(
                      child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Form(
                              key: _form,
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                        widget.required
                                            ? 'Set a new password to continue'
                                            : 'Change your password',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleLarge),
                                    const SizedBox(height: 8),
                                    const Text(
                                        'Use at least 10 characters with uppercase and lowercase letters, a number, and a symbol.'),
                                    const SizedBox(height: 20),
                                    _field(
                                        _old,
                                        'Current or initial password',
                                        _showOld,
                                        () => setState(
                                            () => _showOld = !_showOld)),
                                    _field(
                                        _next,
                                        'New password',
                                        _showNew,
                                        () => setState(
                                            () => _showNew = !_showNew),
                                        validator: (_) => _strong
                                            ? null
                                            : 'Password does not meet the requirements.'),
                                    _field(
                                        _confirm,
                                        'Confirm new password',
                                        _showConfirm,
                                        () => setState(
                                            () => _showConfirm = !_showConfirm),
                                        validator: (v) => v == _next.text
                                            ? null
                                            : 'Passwords do not match.'),
                                    LinearProgressIndicator(
                                        value: _next.text.isEmpty
                                            ? 0
                                            : _strong
                                                ? 1
                                                : .35,
                                        color: _strong
                                            ? AppColors.success
                                            : AppColors.warning),
                                    const SizedBox(height: 20),
                                    SizedBox(
                                        width: double.infinity,
                                        child: FilledButton(
                                            onPressed: _busy ? null : _submit,
                                            child: _busy
                                                ? const CircularProgressIndicator()
                                                : const Text('Save password')))
                                  ]))))))));
}
