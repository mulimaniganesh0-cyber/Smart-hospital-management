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
  // Session-only cache. A browser may have a perfectly usable Wi-Fi position
  // indoors, then fail to produce a new fix on the following request.
  static Position? _lastValidPosition;

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
    }
  }

  static bool isUsablePosition(Position position) =>
      position.latitude.isFinite &&
      position.longitude.isFinite &&
      position.latitude >= -90 &&
      position.latitude <= 90 &&
      position.longitude >= -180 &&
      position.longitude <= 180;

  static void _cache(Position position) {
    _lastValidPosition = position;
    developer.log(
      'Cached valid location; latitude=${position.latitude}; '
      'longitude=${position.longitude}; accuracy=${position.accuracy}m',
      name: 'Location',
    );
  }

  /// Gets one current browser position and falls back to the browser's last
  /// known position or this CareGuide session's cached position. Accuracy is
  /// informational: indoor Chrome positions remain useful for nearby search.
  static Future<Position> getBestAvailableLocation() async {
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
      developer.log('Permission requested; status: $permission', name: 'Location');
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
      developer.log('[Location] Requesting current browser location...', name: 'Location');
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 20),
      );
      if (isUsablePosition(position)) {
        developer.log(
          '[Location] Position received; latitude=${position.latitude}; '
          'longitude=${position.longitude}; accuracy=${position.accuracy}m'
          '${position.accuracy > 200 ? '; accuracy is low but position is usable' : ''}',
          name: 'Location',
        );
        _cache(position);
        return position;
      }
      developer.log('[Location] Browser returned invalid coordinates', name: 'Location');
    } on LocationServiceDisabledException {
      throw const PatientLocationException(
        'Please enable location services and try again.',
      );
    } on PermissionDeniedException {
      throw const PatientLocationException(
        'Location permission is required to use your current location.',
      );
    } on TimeoutException catch (_) {
      developer.log('[Location] Current location timed out; trying fallbacks', name: 'Location');
    } catch (error) {
      developer.log('[Location] Current location failed; trying fallbacks: $error', name: 'Location');
    }

    try {
      developer.log('[Location] Trying last known browser location...', name: 'Location');
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null && isUsablePosition(lastKnown)) {
        _cache(lastKnown);
        developer.log('[Location] Using last known browser location', name: 'Location');
        return lastKnown;
      }
    } catch (error) {
      developer.log('[Location] Last known location unavailable: $error', name: 'Location');
    }
    if (_lastValidPosition != null && isUsablePosition(_lastValidPosition!)) {
      developer.log('[Location] Using cached CareGuide session location', name: 'Location');
      return _lastValidPosition!;
    }
    developer.log('[Location] No usable location available', name: 'Location');
    throw const PatientLocationException(
      'Unable to determine your current location. Please try again.',
    );
  }

  /// Compatibility entry point for existing screens. It now uses the same
  /// controlled fallback strategy as CareGuide instead of creating retries.
  static Future<Position> getFreshPatientLocation() => getBestAvailableLocation();
}
