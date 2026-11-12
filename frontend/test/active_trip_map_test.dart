import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_resource_management/screens/driver/active_trip_map.dart';

void main() {
  Widget host(ActiveTripMap map) => MaterialApp(
        home: Scaffold(body: SingleChildScrollView(child: map)),
      );

  testWidgets(
      'shows distinct pickup, ambulance, and verified destination markers',
      (tester) async {
    await tester.pumpWidget(host(ActiveTripMap(
      loadTiles: false,
      status: 'en_route_to_hospital',
      pickupLatitude: 12.9,
      pickupLongitude: 77.6,
      pickupUpdatedAt: DateTime.now().toUtc(),
      pickupAccuracy: 25,
      ambulanceLatitude: 12.9005,
      ambulanceLongitude: 77.6005,
      destinationLatitude: 12.901,
      destinationLongitude: 77.601,
      destinationVerified: true,
      destinationLabel: 'Central Hospital',
    )));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byKey(const ValueKey('pickup-marker')), findsOneWidget);
    expect(find.byKey(const ValueKey('ambulance-marker')), findsOneWidget);
    expect(find.byKey(const ValueKey('destination-marker')), findsOneWidget);
    expect(find.textContaining('±25 m'), findsOneWidget);
  });

  testWidgets(
      'does not fabricate a pickup marker when coordinates are unavailable',
      (tester) async {
    await tester.pumpWidget(host(const ActiveTripMap(
      loadTiles: false,
      status: 'assigned',
      pickupAddress: '12 Example Street',
    )));
    await tester.pump();

    expect(
        find.textContaining('Patient coordinates unavailable'), findsOneWidget);
    expect(find.textContaining('12 Example Street'), findsOneWidget);
    expect(find.byKey(const ValueKey('pickup-marker')), findsNothing);
    expect(
        find.textContaining('Map unavailable until a real assignment location'),
        findsOneWidget);
  });

  testWidgets('flags a stale pickup location while retaining its real marker',
      (tester) async {
    await tester.pumpWidget(host(ActiveTripMap(
      loadTiles: false,
      status: 'assigned',
      pickupLatitude: 12.9,
      pickupLongitude: 77.6,
      pickupUpdatedAt:
          DateTime.now().toUtc().subtract(const Duration(minutes: 5)),
    )));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.textContaining('may be stale'), findsOneWidget);
    expect(find.byKey(const ValueKey('pickup-marker')), findsOneWidget);
  });

  testWidgets('moves the pickup marker when a newer authorized fix arrives',
      (tester) async {
    final now = DateTime.now().toUtc();
    await tester.pumpWidget(host(ActiveTripMap(
      key: const ValueKey('active-map'),
      loadTiles: false,
      status: 'en_route_to_patient',
      pickupLatitude: 12.9,
      pickupLongitude: 77.6,
      pickupUpdatedAt: now.subtract(const Duration(seconds: 15)),
    )));
    await tester.pump(const Duration(milliseconds: 500));

    expect(
      tester
          .widget<MarkerLayer>(find.byType(MarkerLayer))
          .markers
          .first
          .point
          .latitude,
      12.9,
    );

    await tester.pumpWidget(host(ActiveTripMap(
      key: const ValueKey('active-map'),
      loadTiles: false,
      status: 'en_route_to_patient',
      pickupLatitude: 12.901,
      pickupLongitude: 77.601,
      pickupUpdatedAt: now,
    )));
    await tester.pump(const Duration(milliseconds: 500));

    expect(
      tester
          .widget<MarkerLayer>(find.byType(MarkerLayer))
          .markers
          .first
          .point
          .latitude,
      12.901,
    );
    expect(find.textContaining('updated'), findsOneWidget);
  });
}
