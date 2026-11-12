import 'dart:async';
import 'dart:developer' as developer;

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
  static const Duration maxFixAge = Duration(seconds: 30);
  static const double maxAcceptedAccuracyMeters = 1000;

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
      return await getBestAvailableLocation();
    } on PatientLocationException {
      return null;
    } catch (error) {
      developer.log('Location acquisition failed: $error', name: 'Location');
      return null;
    }
  }

  static bool isUsablePosition(Position position) =>
      position.latitude.isFinite &&
      position.longitude.isFinite &&
      position.latitude >= -90 &&
      position.latitude <= 90 &&
      position.longitude >= -180 &&
      position.longitude <= 180 &&
      position.accuracy.isFinite &&
      position.accuracy >= 0 &&
      position.accuracy <= maxAcceptedAccuracyMeters &&
      isRecent(position.timestamp);

  static bool isRecent(DateTime timestamp, {DateTime? now}) {
    final age = (now ?? DateTime.now()).difference(timestamp);
    return age >= const Duration(seconds: -5) && age <= maxFixAge;
  }

  /// Gets one fresh device/browser position. Never substitutes an old fix or
  /// a cached coordinate when the platform cannot provide a current reading.
  static Future<Position> getBestAvailableLocation() async {
    try {
      return await _acquireFreshLocation();
    } on PatientLocationException {
      rethrow;
    } catch (error) {
      developer.log('Location acquisition failed: $error', name: 'Location');
      throw const PatientLocationException(
        'Unable to determine your current location. Please check permissions and try again.',
      );
    }
  }

  static Future<Position> _acquireFreshLocation() async {
    developer.log('[Location] Checking service...', name: 'Location');
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    developer.log('Service enabled: $serviceEnabled', name: 'Location');
    if (!serviceEnabled) {
      throw const PatientLocationException(
        'Please enable location services and try again.',
      );
    }

    developer.log('[Location] Checking permission...', name: 'Location');
    var permission = await Geolocator.checkPermission();
    developer.log('Permission status: $permission', name: 'Location');
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      developer.log('Permission requested; status: $permission',
          name: 'Location');
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
      developer.log('[Location] Requesting a fresh high-accuracy position...',
          name: 'Location');
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 20),
      );
      if (isUsablePosition(position)) {
        developer.log(
          '[Location] Fresh position received; accuracy=${position.accuracy}m',
          name: 'Location',
        );
        return position;
      }
      throw const PatientLocationException(
        'The location fix is invalid, stale, or too inaccurate. Please retry with location services enabled.',
      );
    } on LocationServiceDisabledException {
      throw const PatientLocationException(
        'Please enable location services and try again.',
      );
    } on PermissionDeniedException {
      throw const PatientLocationException(
        'Location permission is required to use your current location.',
      );
    } on TimeoutException catch (_) {
      developer.log('[Location] Fresh location request timed out',
          name: 'Location');
    } catch (error) {
      if (error is PatientLocationException) rethrow;
      developer.log('[Location] Fresh location request failed: $error',
          name: 'Location');
    }
    developer.log('[Location] No usable location available', name: 'Location');
    throw const PatientLocationException(
      'Unable to determine your current location. Please try again.',
    );
  }

  /// Compatibility entry point for existing screens; it requires a fresh fix.
  static Future<Position> getFreshPatientLocation() =>
      getBestAvailableLocation();
}
