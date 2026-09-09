import 'package:flutter/foundation.dart';

/// Environment-specific endpoints for the Flutter client.
///
/// Supply both values with `--dart-define` for a physical device and for every
/// release build.  A release binary deliberately has no localhost/emulator
/// fallback, so a development endpoint cannot be shipped by accident.
class AppConfig {
  AppConfig._();

  static const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const _socketUrl = String.fromEnvironment('SOCKET_URL');

  static String get apiBaseUrl {
    if (_apiBaseUrl.isNotEmpty) return _stripTrailingSlash(_apiBaseUrl);

    if (kReleaseMode) {
      // This invalid host produces a clear network error instead of sending
      // real patients to a developer machine if a release is misconfigured.
      return 'https://api.invalid/api';
    }
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:5001/api';
    }
    return 'http://localhost:5001/api';
  }

  static String get socketUrl {
    if (_socketUrl.isNotEmpty) return _stripTrailingSlash(_socketUrl);
    return apiBaseUrl.replaceFirst(RegExp(r'/api$'), '');
  }

  static String _stripTrailingSlash(String value) =>
      value.replaceFirst(RegExp(r'/+$'), '');
}
