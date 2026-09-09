import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../services/api_service.dart';
import '../../models/hospital_model.dart';
import 'patient_nearby_hospitals.dart' show BookingScreen;

class PatientQrScanner extends StatefulWidget {
  const PatientQrScanner({super.key});
  @override State<PatientQrScanner> createState() => _PatientQrScannerState();
}

class _PatientQrScannerState extends State<PatientQrScanner> {
  final MobileScannerController _camera = MobileScannerController();
  String? _error;
  bool _processing = false;

  Future<void> _scan(String raw) async {
    if (_processing) {
      return;
    }
    setState(() { _processing = true; _error = null; });
    final result = await ApiService.validateHospitalQr(raw);
    if (!mounted) {
      return;
    }
    if (result['success'] == true && result['valid'] == true && result['data'] is Map) {
      await _camera.stop();
      if (!mounted) {
        return;
      }
      final data = Map<String, dynamic>.from(result['data']);
      final hospitalData = data['hospital'] is Map
          ? Map<String, dynamic>.from(data['hospital'])
          : <String, dynamic>{};
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => BookingScreen(
            hospital: Hospital.fromJson(hospitalData),
            qrPayload: raw,
            qrDate: data['qrDate']?.toString(),
          ),
        ),
      );
      if (mounted) {
        setState(() => _processing = false);
        await _camera.start();
      }
    } else {
      setState(() { _error = result['message'] ?? 'Invalid hospital QR code.'; _processing = false; });
    }
  }

  @override void dispose() { _camera.dispose(); super.dispose(); }

  @override Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('Scan Hospital QR')), body: Stack(children: [
      MobileScanner(controller: _camera, onDetect: (capture) { final raw = capture.barcodes.isEmpty ? null : capture.barcodes.first.rawValue; if (raw != null) { _scan(raw); } }),
      Center(child: Container(width: 240, height: 240, decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 3), borderRadius: BorderRadius.circular(18)))),
      Positioned(left: 16, right: 16, bottom: 32, child: Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(_error ?? (_processing ? 'Validating hospital QR…' : 'Point your camera at today\'s hospital booking QR code.'), textAlign: TextAlign.center))))
    ]));
  }
}
