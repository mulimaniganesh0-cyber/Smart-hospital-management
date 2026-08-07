// lib/screens/hospital/simple_location_picker.dart
import 'package:flutter/material.dart';

class SimpleLocationPicker extends StatefulWidget {
  final Function(double, double, String) onLocationSelected;
  final double? initialLatitude;
  final double? initialLongitude;
  final String? initialAddress;

  const SimpleLocationPicker({
    super.key,
    required this.onLocationSelected,
    this.initialLatitude,
    this.initialLongitude,
    this.initialAddress,
  });

  @override
  State<SimpleLocationPicker> createState() => _SimpleLocationPickerState();
}

class _SimpleLocationPickerState extends State<SimpleLocationPicker> {
  final TextEditingController _latitudeController = TextEditingController();
  final TextEditingController _longitudeController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.initialLatitude != null) {
      _latitudeController.text = widget.initialLatitude!.toString();
    }
    if (widget.initialLongitude != null) {
      _longitudeController.text = widget.initialLongitude!.toString();
    }
    if (widget.initialAddress != null) {
      _addressController.text = widget.initialAddress!;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Enter Location'),
        actions: [
          TextButton(
            onPressed: _saveLocation,
            child: const Text('Save', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter Location Details',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            
            // Address Field
            TextField(
              controller: _addressController,
              decoration: const InputDecoration(
                labelText: 'Address',
                prefixIcon: Icon(Icons.location_on),
                border: OutlineInputBorder(),
                hintText: 'Enter full address',
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 16),
            
            // Latitude Field
            TextField(
              controller: _latitudeController,
              decoration: const InputDecoration(
                labelText: 'Latitude',
                prefixIcon: Icon(Icons.pin_drop),
                border: OutlineInputBorder(),
                hintText: 'e.g., 28.6139',
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 16),
            
            // Longitude Field
            TextField(
              controller: _longitudeController,
              decoration: const InputDecoration(
                labelText: 'Longitude',
                prefixIcon: Icon(Icons.pin_drop),
                border: OutlineInputBorder(),
                hintText: 'e.g., 77.2090',
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 24),
            
            // Help Text
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.blue.shade700),
                      const SizedBox(width: 8),
                      Text(
                        'How to find coordinates:',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.blue.shade700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '1. Open Google Maps on your phone\n'
                    '2. Long press on the hospital location\n'
                    '3. Copy the coordinates that appear\n'
                    '4. Paste them above',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ),
            
            const Spacer(),
            
            // Preview
            if (_latitudeController.text.isNotEmpty && _longitudeController.text.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.check_circle, color: Colors.green),
                    const SizedBox(height: 8),
                    Text(
                      'Location ready to save',
                      style: TextStyle(color: Colors.green.shade700),
                    ),
                    Text(
                      'Lat: ${_latitudeController.text}, Lng: ${_longitudeController.text}',
                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _saveLocation() {
    if (_latitudeController.text.isEmpty || _longitudeController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter both latitude and longitude'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final double? lat = double.tryParse(_latitudeController.text);
    final double? lng = double.tryParse(_longitudeController.text);

    if (lat == null || lng == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter valid numbers for latitude and longitude'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final address = _addressController.text.isNotEmpty 
        ? _addressController.text 
        : 'Location at $lat, $lng';

    widget.onLocationSelected(lat, lng, address);
    Navigator.pop(context);
  }
}
