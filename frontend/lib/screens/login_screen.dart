// lib/screens/login_screen.dart - Fix the navigation

import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'driver/ambulance_driver_dashboard.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'signup_screen.dart';
import 'private_ambulance_registration_screen.dart';
import 'forgot_password_screen.dart';
import 'patient/patient_home_screen.dart' as patient;
import 'hospital/hospital_home_screen.dart' as hospital;
import 'admin/admin_home_screen.dart' as admin;
import 'doctor/doctor_dashboard_screen.dart';
import 'change_password_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isPasswordVisible = false;
  String _selectedRole = 'patient';

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(builder: (context, constraints) {
          final wide = constraints.maxWidth >= 900;
          final form = ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 500),
            child: Card(
              child: Padding(
                padding: EdgeInsets.all(wide ? 32 : 24),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Welcome back',
                          style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 6),
                      Text('Sign in to continue to your authorized portal.',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: colors.onSurfaceVariant)),
                      const SizedBox(height: 24),
                      Text('Select portal',
                          style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: 10),
                      LayoutBuilder(
                        builder: (context, constraints) => Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: const [
                            ('patient', 'Patient Portal', Icons.person_outline),
                            (
                              'hospital',
                              'Hospital Portal',
                              Icons.local_hospital_outlined
                            ),
                            (
                              'doctor',
                              'Doctor Portal',
                              Icons.medical_services_outlined
                            ),
                            (
                              'ambulance_driver',
                              'Ambulance Driver Portal',
                              Icons.local_taxi_outlined
                            ),
                            (
                              'admin',
                              'Admin Portal',
                              Icons.admin_panel_settings_outlined
                            ),
                          ]
                              .map((portal) => ConstrainedBox(
                                    constraints: BoxConstraints(
                                        maxWidth: constraints.maxWidth),
                                    child: ChoiceChip(
                                      avatar: Icon(portal.$3, size: 18),
                                      label: Text(portal.$2,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis),
                                      selected: _selectedRole == portal.$1,
                                      onSelected: (_) => setState(
                                          () => _selectedRole = portal.$1),
                                    ),
                                  ))
                              .toList(),
                        ),
                      ),
                      const SizedBox(height: 22),
                      TextField(
                          controller: _emailController,
                          keyboardType: TextInputType.text,
                          decoration: const InputDecoration(
                              labelText: 'Email or mobile number',
                              prefixIcon: Icon(Icons.person_outline),
                              hintText: 'Enter your email or mobile number')),
                      const SizedBox(height: 14),
                      TextField(
                          controller: _passwordController,
                          obscureText: !_isPasswordVisible,
                          decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: const Icon(Icons.lock_outline),
                              suffixIcon: IconButton(
                                  tooltip: _isPasswordVisible
                                      ? 'Hide password'
                                      : 'Show password',
                                  icon: Icon(_isPasswordVisible
                                      ? Icons.visibility_off
                                      : Icons.visibility),
                                  onPressed: () => setState(() =>
                                      _isPasswordVisible =
                                          !_isPasswordVisible)),
                              hintText: 'Enter your password')),
                      Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                              onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) =>
                                          const ForgotPasswordScreen(
                                              userType: 'account'))),
                              child: const Text('Forgot password?'))),
                      const SizedBox(height: 6),
                      SizedBox(
                          width: double.infinity,
                          child: Consumer<AuthProvider>(
                              builder: (context, auth, child) => ElevatedButton(
                                  onPressed:
                                      auth.isLoading ? null : _handleLogin,
                                  child: auth.isLoading
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white))
                                      : const Text('Sign in')))),
                      const SizedBox(height: 12),
                      Center(child: _buildOnboardingLinks()),
                    ]),
              ),
            ),
          );
          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: wide
                  ? ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1120),
                      child: Row(children: [
                        Expanded(
                            child: Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(24, 24, 56, 24),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                          width: 60,
                                          height: 60,
                                          decoration: BoxDecoration(
                                              color: colors.primary,
                                              borderRadius:
                                                  BorderRadius.circular(18)),
                                          child: const Icon(
                                              Icons.health_and_safety_outlined,
                                              size: 32,
                                              color: Colors.white)),
                                      const SizedBox(height: 24),
                                      Text('CareSync',
                                          style: Theme.of(context)
                                              .textTheme
                                              .headlineLarge
                                              ?.copyWith(
                                                  color: colors.primary)),
                                      const SizedBox(height: 12),
                                      Text(
                                          'Connected care, coordinated with confidence.',
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleLarge
                                              ?.copyWith(
                                                  color:
                                                      colors.onSurfaceVariant)),
                                      const SizedBox(height: 20),
                                      Text(
                                          'A secure workspace for patients, hospitals, clinicians and emergency teams.',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodyLarge
                                              ?.copyWith(
                                                  height: 1.6,
                                                  color:
                                                      colors.onSurfaceVariant)),
                                    ]))),
                        form,
                      ]))
                  : form,
            ),
          );
        }),
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Widget _buildOnboardingLinks() {
    switch (_selectedRole) {
      case 'patient':
      case 'hospital':
        final isPatient = _selectedRole == 'patient';
        return Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(isPatient ? "New patient? " : 'Register your facility '),
            TextButton(
              onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => SignupScreen(
                          userType: isPatient ? 'Patient' : 'Hospital'))),
              child: Text(isPatient ? 'Sign Up' : 'Hospital Sign Up'),
            ),
          ],
        );
      case 'doctor':
        return const Padding(
          padding: EdgeInsets.all(8),
          child: Text(
              'Doctor accounts are created or activated by an authorized hospital or administrator. Contact your hospital for access.',
              textAlign: TextAlign.center),
        );
      case 'ambulance_driver':
        return Column(mainAxisSize: MainAxisSize.min, children: [
          const Padding(
              padding: EdgeInsets.all(8),
              child: Text(
                  'Hospital drivers sign in with their mobile number and the initial password provided by their hospital.',
                  textAlign: TextAlign.center)),
          TextButton.icon(
            onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) =>
                        const PrivateAmbulanceRegistrationScreen())),
            icon: const Icon(Icons.local_taxi_outlined),
            label: const Text('Private Ambulance Registration'),
          ),
        ]);
      case 'admin':
        return const Padding(
          padding: EdgeInsets.all(8),
          child: Text(
              'Administrator accounts are provisioned securely by the system owner.',
              textAlign: TextAlign.center),
        );
      default:
        return const SizedBox.shrink();
    }
  }

  Future<void> _handleLogin() async {
    if (_emailController.text.trim().isEmpty) {
      _showError('Please enter your email or mobile number');
      return;
    }

    if (_passwordController.text.trim().isEmpty) {
      _showError('Please enter your password');
      return;
    }

    final auth = Provider.of<AuthProvider>(context, listen: false);

    final success = await auth.login(
      _emailController.text.trim(),
      _passwordController.text.trim(),
    );

    if (success && mounted) {
      final userType = auth.currentUser?.userType;
      if (auth.currentUser?.additionalData?['password_reset_required'] ==
          true) {
        Navigator.pushReplacement(
            context,
            MaterialPageRoute(
                builder: (_) => const ChangePasswordScreen(required: true)));
        return;
      }
      if (userType != null && userType != _selectedRole) {
        final portal = switch (userType) {
          'patient' => 'Patient Portal',
          'hospital' => 'Hospital Portal',
          'doctor' => 'Doctor Portal',
          'ambulance_driver' => 'Ambulance Driver Portal',
          'admin' => 'Admin Portal',
          _ => 'the portal assigned to your account',
        };
        _showError('Your account belongs to $portal. Opening that portal.');
      }
      if (userType == 'patient') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => const patient.PatientHomeScreen(),
          ),
        );
      } else if (userType == 'hospital') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => const hospital.HospitalHomeScreen(),
          ),
        );
      } else if (userType == 'doctor') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => const DoctorDashboardScreen(),
          ),
        );
      } else if (userType == 'admin') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => const admin.AdminHomeScreen(),
          ),
        );
      } else if (userType == 'ambulance_driver') {
        Navigator.pushReplacement(
            context,
            MaterialPageRoute(
                builder: (context) => const AmbulanceDriverDashboard()));
      } else {
        _showError('This account has no supported portal role.');
      }
    } else {
      _showError(auth.errorMessage ?? 'Invalid credentials. Please try again.');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
        duration: const Duration(seconds: 3),
      ),
    );
  }
}
