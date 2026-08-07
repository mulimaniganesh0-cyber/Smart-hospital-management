// lib/screens/forgot_password_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class ForgotPasswordScreen extends StatefulWidget {
  final String userType;
  const ForgotPasswordScreen({super.key, required this.userType});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  String _newPassword = '';
  String _confirmPassword = '';
  int _currentStep = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reset Password'),
        centerTitle: false,
        elevation: 0,
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.white, const Color(0xFF0A4D68).withValues(alpha: 0.05)],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 20),
              // Progress Stepper
              _buildProgressStepper(),
              const SizedBox(height: 32),
              if (_currentStep == 0) ...[
                _buildStepContent(
                  title: 'Enter your email to reset password',
                  subtitle: 'We\'ll send a verification code to your registered email',
                  child: Column(
                    children: [
                      if (widget.userType == 'admin')
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: [Colors.blue.shade50, Colors.blue.shade100]),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.blue.shade200),
                          ),
                          child: Row(
                            children: [
                              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.blue, borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.info, color: Colors.white, size: 18)),
                              const SizedBox(width: 12),
                              const Expanded(child: Text('Admin password reset requires contacting system administrator.', style: TextStyle(fontSize: 12, color: Colors.blue))),
                            ],
                          ),
                        ),
                      const SizedBox(height: 24),
                      TextField(
                        controller: _emailController,
                        decoration: InputDecoration(
                          labelText: 'Email Address',
                          prefixIcon: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFF0A4D68).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.email_outlined, color: Color(0xFF0A4D68), size: 20),
                          ),
                          hintText: 'Enter your registered email',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        keyboardType: TextInputType.emailAddress,
                      ),
                    ],
                  ),
                ),
              ] else if (_currentStep == 1) ...[
                _buildStepContent(
                  title: 'Enter verification code',
                  subtitle: 'We sent a 6-digit code to your email',
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: [Colors.green.shade50, Colors.green.shade100]),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.green.shade200),
                        ),
                        child: Row(
                          children: [
                            Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.green, borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.email, color: Colors.white, size: 18)),
                            const SizedBox(width: 12),
                            Expanded(child: Text('Code sent to: ${_emailController.text}', style: TextStyle(color: Colors.green.shade800))),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      TextField(
                        decoration: InputDecoration(
                          labelText: 'Verification Code',
                          prefixIcon: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFF0A4D68).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.security, color: Color(0xFF0A4D68), size: 20),
                          ),
                          hintText: 'Enter 6-digit code',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                      ),
                    ],
                  ),
                ),
              ] else ...[
                _buildStepContent(
                  title: 'Set new password',
                  subtitle: 'Create a strong password for your account',
                  child: Column(
                    children: [
                      if (widget.userType == 'admin')
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: [Colors.orange.shade50, Colors.orange.shade100]),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.orange.shade200),
                          ),
                          child: Row(
                            children: [
                              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.lock, color: Colors.white, size: 18)),
                              const SizedBox(width: 12),
                              const Expanded(child: Text('Admin password reset requires administrator approval.', style: TextStyle(fontSize: 12, color: Colors.orange))),
                            ],
                          ),
                        ),
                      const SizedBox(height: 24),
                      TextField(
                        onChanged: (value) => _newPassword = value,
                        obscureText: true,
                        decoration: InputDecoration(
                          labelText: 'New Password',
                          prefixIcon: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFF0A4D68).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.lock_outline, color: Color(0xFF0A4D68), size: 20),
                          ),
                          hintText: 'Enter new password',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        onChanged: (value) => _confirmPassword = value,
                        obscureText: true,
                        decoration: InputDecoration(
                          labelText: 'Confirm Password',
                          prefixIcon: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFF0A4D68).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.lock_outline, color: Color(0xFF0A4D68), size: 20),
                          ),
                          hintText: 'Confirm your new password',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProgressStepper() {
    return Row(
      children: [
        _buildStepIndicator(0, 'Email', _currentStep >= 0),
        Expanded(child: Container(height: 2, color: _currentStep >= 1 ? const Color(0xFF0A4D68) : Colors.grey.shade300)),
        _buildStepIndicator(1, 'Verify', _currentStep >= 1),
        Expanded(child: Container(height: 2, color: _currentStep >= 2 ? const Color(0xFF0A4D68) : Colors.grey.shade300)),
        _buildStepIndicator(2, 'Reset', _currentStep >= 2),
      ],
    );
  }

  Widget _buildStepIndicator(int step, String label, bool isActive) {
    return Column(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: isActive ? const LinearGradient(colors: [Color(0xFF0A4D68), Color(0xFF088395)]) : LinearGradient(colors: [Colors.grey.shade300, Colors.grey.shade400]),
          ),
          child: Center(
            child: Text(
              (step + 1).toString(),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 10, color: isActive ? const Color(0xFF0A4D68) : Colors.grey)),
      ],
    );
  }

  Widget _buildStepContent({required String title, required String subtitle, required Widget child}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(subtitle, style: TextStyle(color: Colors.grey[600])),
        const SizedBox(height: 24),
        child,
        const SizedBox(height: 32),
        if (_currentStep == 0)
          Consumer<AuthProvider>(
            builder: (context, auth, child) => SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: auth.isLoading ? null : _sendVerificationCode,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0A4D68),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: auth.isLoading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Send Verification Code', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
          ),
        if (_currentStep == 1)
          SizedBox(
            width: double.infinity,
            child: Column(
              children: [
                ElevatedButton(
                  onPressed: () => setState(() => _currentStep = 2),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A4D68),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('Verify Code', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: _sendVerificationCode,
                  child: const Text('Resend Code'),
                ),
              ],
            ),
          ),
        if (_currentStep == 2)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _resetPassword,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A4D68),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: const Text('Reset Password', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
          ),
      ],
    );
  }

  Future<void> _sendVerificationCode() async {
    if (_emailController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your email'), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
      );
      return;
    }
    await Future.delayed(const Duration(seconds: 1));
    setState(() {
      _currentStep = 1;
    });
    if (!context.mounted) return;
    if (!context.mounted) return;
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Verification code sent to your email'), backgroundColor: Colors.green, behavior: SnackBarBehavior.floating),
    );
  }

  void _resetPassword() {
    if (_newPassword.isEmpty || _confirmPassword.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter and confirm your new password'), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
      );
      return;
    }
    if (_newPassword != _confirmPassword) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Passwords do not match'), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
      );
      return;
    }
    if (_newPassword.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password must be at least 6 characters'), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
      );
      return;
    }
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.green.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.check_circle, color: Colors.green)),
            const SizedBox(width: 12),
            const Text('Success', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(
          widget.userType == 'admin'
              ? 'Password reset request submitted. You will be notified once approved.'
              : 'Password reset successfully. Please login with new password.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.pop(context);
            },
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF0A4D68)),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }
}
