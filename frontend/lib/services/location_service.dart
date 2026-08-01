import 'package:geolocator/geolocator.dart';

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
    if (!await Geolocator.isLocationServiceEnabled()) return null;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    return Geolocator.getCurrentPosition();
  }
}
