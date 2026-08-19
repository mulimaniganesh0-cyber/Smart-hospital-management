import 'dart:async';

import 'package:geolocator/geolocator.dart';

/// An actionable failure while requesting the physical device GPS position.
class PatientLocationException implements Exception {
  const PatientLocationException(this.message);
  final String message;

  @override
  String toString() => message;
}

class LocationService {
  static const _languages = ['English', 'Hindi', 'Kannada'];

  static List<String> getSupportedLanguages() => _languages;

  static String getLanguageCode(String language) {
    return switch (language) {
      'Hindi' => 'hi',
      'Kannada' => 'kn',
      _ => 'en',
    };
  }

  static Future<Position?> getCurrentLocation() async {
    try {
      return await getFreshPatientLocation();
    } on PatientLocationException {
      return null;
    }
  }

  /// Gets a new device GPS fix. This deliberately never falls back to a
  /// cached, server, IP-derived, or default location.
  static Future<Position> getFreshPatientLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const PatientLocationException(
        'Please enable location services and try again.',
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      throw const PatientLocationException(
        'Location permission is permanently denied. Please enable it from App Settings.',
      );
    }
    if (permission == LocationPermission.denied) {
      throw const PatientLocationException(
        'Location permission is required to use your current location.',
      );
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 20),
      );
      if (position.accuracy > 200) {
        throw const PatientLocationException(
          'Your location accuracy is low. Please move outdoors or enable high-accuracy location, then try again.',
        );
      }
      return position;
    } on TimeoutException {
      throw const PatientLocationException(
        'Unable to get your current location. Please enable GPS/location permission and try again.',
      );
    } on LocationServiceDisabledException {
      throw const PatientLocationException(
        'Please enable location services and try again.',
      );
    }
  }
}
