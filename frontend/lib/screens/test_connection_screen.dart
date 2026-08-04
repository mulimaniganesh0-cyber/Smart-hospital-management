// lib/screens/test_connection_screen.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class TestConnectionScreen extends StatefulWidget {
  const TestConnectionScreen({super.key});

  @override
  State<TestConnectionScreen> createState() => _TestConnectionScreenState();
}

class _TestConnectionScreenState extends State<TestConnectionScreen> with SingleTickerProviderStateMixin {
  String _status = 'Testing...';
  bool _isLoading = true;
  late AnimationController _animationController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(vsync: this, duration: const Duration(seconds: 1), reverseDuration: const Duration(seconds: 1));
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.3).animate(CurvedAnimation(parent: _animationController, curve: Curves.easeInOut));
    _animationController.repeat(reverse: true);
    _testConnection();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    try {
      final result = await ApiService.getNearbyHospitals(28.6139, 77.2090);
      setState(() {
        _status = 'âœ… Backend connection successful!\n\nFound ${result['count'] ?? 0} nearby hospitals.\n\nYou can now use the app with backend integration.';
        _isLoading = false;
      });
      _animationController.stop();
    } catch (e) {
      setState(() {
        _status = 'âŒ Connection failed: $e\n\nMake sure:\n1. Backend server is running on port 5000\n2. Database is connected\n3. No firewall blocking the connection';
        _isLoading = false;
      });
      _animationController.stop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Backend Connection Test'),
        centerTitle: false,
        elevation: 0,
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.white, const Color(0xFF0A4D68).withValues(alpha: 0.1)],
          ),
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_isLoading) ...[
                  ScaleTransition(
                    scale: _pulseAnimation,
                    child: Container(
                      padding: const EdgeInsets.all(25),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(colors: [Color(0xFF0A4D68), Color(0xFF088395)]),
                        boxShadow: [BoxShadow(color: const Color(0xFF0A4D68).withValues(alpha: 0.3), blurRadius: 20)],
                      ),
                      child: const Icon(Icons.network_check, size: 60, color: Colors.white),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text('Testing Connection...', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0A4D68))),
                  const SizedBox(height: 12),
                  const CircularProgressIndicator(color: Color(0xFF0A4D68)),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: _status.contains('âœ…') ? LinearGradient(colors: [Colors.green.shade50, Colors.green.shade100]) : LinearGradient(colors: [Colors.red.shade50, Colors.red.shade100]),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: _status.contains('âœ…') ? Colors.green.shade200 : Colors.red.shade200),
                    ),
                    child: Column(
                      children: [
                        Icon(_status.contains('âœ…') ? Icons.check_circle : Icons.error, size: 80, color: _status.contains('âœ…') ? Colors.green : Colors.red),
                        const SizedBox(height: 16),
                        Text(
                          _status,
                          style: TextStyle(fontSize: 14, color: _status.contains('âœ…') ? Colors.green.shade800 : Colors.red.shade800),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 40),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0A4D68),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('Back to Login', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}