// lib/screens/patient/patient_emergency_request.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';

class PatientEmergencyRequest extends StatefulWidget {
  const PatientEmergencyRequest({super.key});

  @override
  State<PatientEmergencyRequest> createState() => _PatientEmergencyRequestState();
}

class _PatientEmergencyRequestState extends State<PatientEmergencyRequest> {
  final _formKey = GlobalKey<FormState>();
  String _emergencyType = 'Medical';
  String _severity = 'High';
  String _description = '';
  bool _isRequesting = false;
  double? _currentLat;
  double? _currentLng;
  bool _isLocating = false;

  final List<String> _emergencyTypes = ['Medical', 'Accident', 'Cardiac', 'Stroke', 'Trauma', 'Other'];
  final List<String> _severityLevels = ['High', 'Medium', 'Low'];

  @override
  void initState() {
    super.initState();
    _getCurrentLocation();
  }

  Future<void> _getCurrentLocation() async {
    setState(() => _isLocating = true);
    final position = await LocationService.getCurrentLocation();
    if (!mounted) return;
    setState(() {
      _isLocating = false;
      _currentLat = position?.latitude;
      _currentLng = position?.longitude;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Emergency Request'),
        backgroundColor: Colors.red,
        centerTitle: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFFFFF3E0), Color(0xFFFFE0B2)]),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Row(
                  children: [
                    Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.warning_amber_rounded, color: Colors.white)),
                    const SizedBox(width: 12),
                    const Expanded(child: Text('In case of life-threatening emergency, please call 108 immediately', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red))),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              _buildDropdown('Emergency Type', _emergencyTypes, _emergencyType, (v) => setState(() => _emergencyType = v!), Icons.medical_services),
              const SizedBox(height: 16),
              _buildDropdown('Severity Level', _severityLevels, _severity, (v) => setState(() => _severity = v!), Icons.warning, isSeverity: true),
              const SizedBox(height: 16),
              TextFormField(
                onChanged: (v) => _description = v,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Describe Emergency', prefixIcon: Icon(Icons.description), border: OutlineInputBorder(), hintText: 'Describe the situation, symptoms, or medical condition'),
                validator: (v) => v == null || v.isEmpty ? 'Please describe the emergency' : null,
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Icon(_currentLat == null ? Icons.location_off : Icons.location_on, color: _currentLat == null ? Colors.orange : Colors.green),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_isLocating ? 'Getting your live location…' : _currentLat == null ? 'Location unavailable. You can still send the request.' : 'Live location ready to share with the hospital.')),
                    if (!_isLocating && _currentLat == null) TextButton(onPressed: _getCurrentLocation, child: const Text('Retry')),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isRequesting ? null : _sendEmergencyRequest,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: _isRequesting ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Send Emergency Request', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDropdown(String label, List<String> items, String value, Function(String?) onChanged, IconData icon, {bool isSeverity = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(12)),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              isExpanded: true,
              items: items.map((e) => DropdownMenuItem(value: e, child: isSeverity ? Row(children: [Container(width: 12, height: 12, decoration: BoxDecoration(color: e == 'High' ? Colors.red : e == 'Medium' ? Colors.orange : Colors.green, shape: BoxShape.circle)), const SizedBox(width: 8), Text(e)]) : Text(e))).toList(),
              onChanged: onChanged,
            ),
          ),
        ),
      ],
    );
  }

  void _sendEmergencyRequest() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isRequesting = true);
      try {
        final response = await ApiService.createEmergencyRequest({'emergency_type': _emergencyType, 'severity': _severity.toLowerCase(), 'description': _description, 'location_lat': _currentLat, 'location_lng': _currentLng});
        if (response['success'] && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Emergency request sent successfully'), backgroundColor: Colors.green));
          Navigator.pop(context);
        } else if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(response['message'] ?? 'Failed to send request'), backgroundColor: Colors.red));
        }
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error. Please try again.'), backgroundColor: Colors.red));
      } finally {
        if (mounted) setState(() => _isRequesting = false);
      }
    }
  }
}
