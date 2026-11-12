// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:hospital_resource_management/main.dart';
import 'package:hospital_resource_management/services/chatbot_service.dart';

void main() {
  testWidgets('starts the hospital resource app without layout exceptions',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final previousErrorHandler = FlutterError.onError;
    FlutterError.onError = (details) {
      debugPrint(details.toString());
      previousErrorHandler?.call(details);
    };
    addTearDown(() => FlutterError.onError = previousErrorHandler);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;

    for (final size in const [
      Size(390, 844),
      Size(768, 1024),
      Size(1024, 768),
      Size(1366, 768),
      Size(1920, 1080),
    ]) {
      tester.view.physicalSize = size;
      await tester.pumpWidget(const HospitalResourceApp());
      for (var frame = 0; frame < 4; frame++) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      expect(find.byType(MaterialApp), findsOneWidget,
          reason: 'startup at ${size.width}x${size.height}');
      if (size.width < 600) {
        expect(find.byTooltip('Access Dashboard'), findsOneWidget);
      }
      final exception = tester.takeException();
      if (exception != null) {
        debugPrint(exception.toString());
      }
      expect(exception, isNull,
          reason: 'startup at ${size.width}x${size.height}');
    }
  });

  test('chatbot request IDs stay within Dart Random bounds', () {
    final requestId = ChatbotService.generateRequestId();
    final suffix = requestId.split('-').last;

    expect(requestId, isNotEmpty);
    expect(suffix, isNotEmpty);
    expect(int.parse(suffix), inInclusiveRange(0, (1 << 31) - 1));
  });
}
