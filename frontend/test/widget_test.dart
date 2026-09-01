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
  testWidgets('starts the hospital resource app', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const HospitalResourceApp());
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
  });

  test('chatbot request IDs stay within Dart Random bounds', () {
    final requestId = ChatbotService.generateRequestId();
    final suffix = requestId.split('-').last;

    expect(requestId, isNotEmpty);
    expect(suffix, isNotEmpty);
    expect(int.parse(suffix), inInclusiveRange(0, (1 << 31) - 1));
  });
}
