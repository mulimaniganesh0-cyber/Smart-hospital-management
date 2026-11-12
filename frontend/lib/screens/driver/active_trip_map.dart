import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

/// Embedded map for one authorized assignment. Coordinates are always supplied
/// by the assignment API or its authenticated location events; this widget
/// never asks the device for a substitute position.
class ActiveTripMap extends StatefulWidget {
  const ActiveTripMap({
    super.key,
    required this.status,
    this.pickupLatitude,
    this.pickupLongitude,
    this.pickupAddress,
    this.pickupUpdatedAt,
    this.pickupAccuracy,
    this.ambulanceLatitude,
    this.ambulanceLongitude,
    this.ambulanceUpdatedAt,
    this.destinationLatitude,
    this.destinationLongitude,
    this.destinationLabel,
    this.destinationVerified = false,
    this.onNavigate,
    this.loadTiles = true,
  });

  final String status;
  final double? pickupLatitude;
  final double? pickupLongitude;
  final String? pickupAddress;
  final DateTime? pickupUpdatedAt;
  final double? pickupAccuracy;
  final double? ambulanceLatitude;
  final double? ambulanceLongitude;
  final DateTime? ambulanceUpdatedAt;
  final double? destinationLatitude;
  final double? destinationLongitude;
  final String? destinationLabel;
  final bool destinationVerified;
  final VoidCallback? onNavigate;
  final bool loadTiles;

  @override
  State<ActiveTripMap> createState() => _ActiveTripMapState();
}

class _ActiveTripMapState extends State<ActiveTripMap> {
  static const _tileUrl = String.fromEnvironment(
    'MAP_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );
  // Exact trip coordinates are not sent to a third-party routing service by
  // default. Configure a private OSRM-compatible endpoint to draw route lines.
  static const _routingBaseUrl = String.fromEnvironment('MAP_ROUTING_BASE_URL');
  final MapController _controller = MapController();
  List<LatLng> _route = const [];
  bool _routeLoading = false;
  bool _tileError = false;
  String? _routeError;
  Timer? _routeDebounce;

  LatLng? _point(double? lat, double? lng) {
    if (lat == null ||
        lng == null ||
        !lat.isFinite ||
        !lng.isFinite ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180) {
      return null;
    }
    return LatLng(lat, lng);
  }

  LatLng? get _pickup => _point(widget.pickupLatitude, widget.pickupLongitude);
  LatLng? get _ambulance =>
      _point(widget.ambulanceLatitude, widget.ambulanceLongitude);
  LatLng? get _destination => widget.destinationVerified
      ? _point(widget.destinationLatitude, widget.destinationLongitude)
      : null;

  bool get _headingToDestination => const {
        'patient_picked_up',
        'en_route_to_hospital',
        'arrived_at_hospital',
      }.contains(widget.status.toLowerCase());

  LatLng? get _routeStart => _ambulance ?? _pickup;
  LatLng? get _routeEnd => _headingToDestination ? _destination : _pickup;
  LatLng? get _center => _headingToDestination
      ? (_ambulance ?? _destination ?? _pickup)
      : (_ambulance ?? _pickup ?? _destination);

  @override
  void initState() {
    super.initState();
    _scheduleRoute();
  }

  @override
  void didUpdateWidget(covariant ActiveTripMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.pickupLatitude != widget.pickupLatitude ||
        oldWidget.pickupLongitude != widget.pickupLongitude ||
        oldWidget.ambulanceLatitude != widget.ambulanceLatitude ||
        oldWidget.ambulanceLongitude != widget.ambulanceLongitude ||
        oldWidget.destinationLatitude != widget.destinationLatitude ||
        oldWidget.destinationLongitude != widget.destinationLongitude ||
        oldWidget.destinationVerified != widget.destinationVerified ||
        oldWidget.status != widget.status) {
      _scheduleRoute();
    }
  }

  void _scheduleRoute() {
    _routeDebounce?.cancel();
    _routeDebounce = Timer(const Duration(milliseconds: 450), _loadRoute);
  }

  Future<void> _loadRoute() async {
    final start = _routeStart;
    final end = _routeEnd;
    if (start == null ||
        end == null ||
        start == end ||
        _routingBaseUrl.trim().isEmpty) {
      if (mounted) {
        setState(() {
          _route = const [];
          _routeLoading = false;
          _routeError = start != null &&
                  end != null &&
                  _routingBaseUrl.trim().isEmpty
              ? 'Route line is not configured; use directions for turn-by-turn navigation.'
              : null;
        });
      }
      return;
    }
    setState(() {
      _routeLoading = true;
      _routeError = null;
    });
    try {
      final base = Uri.parse(_routingBaseUrl);
      if (base.scheme != 'https' &&
          base.host != 'localhost' &&
          base.host != '127.0.0.1') {
        throw const FormatException('Routing endpoint must use HTTPS');
      }
      final routePath =
          'route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}';
      final uri = base.replace(
        path: '${base.path.replaceFirst(RegExp(r'/+$'), '')}/$routePath',
        queryParameters: const {'overview': 'full', 'geometries': 'geojson'},
      );
      final response = await http.get(uri).timeout(const Duration(seconds: 7));
      if (response.statusCode != 200) {
        throw const FormatException('Routing service unavailable');
      }
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final routes = decoded['routes'] as List<dynamic>? ?? const [];
      final coordinates = routes.isEmpty
          ? const <dynamic>[]
          : ((routes.first as Map<String, dynamic>)['geometry']
                  as Map<String, dynamic>)['coordinates'] as List<dynamic>? ??
              const [];
      final points = coordinates
          .map((entry) {
            final pair = entry as List<dynamic>;
            return LatLng(
                (pair[1] as num).toDouble(), (pair[0] as num).toDouble());
          })
          .where((point) => _point(point.latitude, point.longitude) != null)
          .toList();
      if (!mounted) return;
      setState(() {
        _route = points;
        _routeLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _route = const [];
        _routeLoading = false;
        _routeError = 'Route unavailable; map markers are still shown.';
      });
    }
  }

  void _recenter() {
    final center = _center;
    if (center == null) return;
    _controller.move(center, 15);
  }

  DateTime? _freshnessTime(DateTime? time) => time?.toLocal();

  @override
  void dispose() {
    _routeDebounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pickup = _pickup;
    final ambulance = _ambulance;
    final destination = _destination;
    final center = _center;
    final pickupIsStale = widget.pickupUpdatedAt == null ||
        DateTime.now().toUtc().difference(widget.pickupUpdatedAt!.toUtc()) >
            const Duration(minutes: 2);
    final ambulanceIsStale = widget.ambulanceUpdatedAt == null ||
        DateTime.now().toUtc().difference(widget.ambulanceUpdatedAt!.toUtc()) >
            const Duration(minutes: 2);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 10, 10),
          child: Row(children: [
            const Icon(Icons.map_outlined),
            const SizedBox(width: 8),
            const Expanded(
                child: Text('Live trip map',
                    style: TextStyle(fontWeight: FontWeight.w700))),
            if (widget.onNavigate != null)
              IconButton(
                  tooltip: 'Open directions',
                  onPressed: widget.onNavigate,
                  icon: const Icon(Icons.directions_outlined)),
          ]),
        ),
        Wrap(spacing: 8, runSpacing: 6, children: [
          _legend('Pickup', AppColors.error, pickup != null),
          _legend('Ambulance', AppColors.primary, ambulance != null),
          _legend(
              widget.destinationLabel?.trim().isNotEmpty == true
                  ? widget.destinationLabel!.trim()
                  : 'Destination',
              AppColors.success,
              destination != null),
        ]),
        if (pickup == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
            child: Text(
              widget.pickupAddress?.trim().isNotEmpty == true
                  ? 'Patient coordinates unavailable. Pickup address: ${widget.pickupAddress}'
                  : 'Patient pickup coordinates are unavailable. No pickup marker is shown.',
              style: const TextStyle(color: Colors.deepOrange),
            ),
          ),
        if (pickup != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
            child: Text(
              'Patient location ${pickupIsStale ? 'may be stale' : 'updated'}${widget.pickupUpdatedAt == null ? '' : ' ${_freshnessTime(widget.pickupUpdatedAt)}'}${widget.pickupAccuracy == null ? '' : ' · ±${widget.pickupAccuracy!.round()} m'}',
              style: TextStyle(
                  color: pickupIsStale ? Colors.deepOrange : Colors.black54),
            ),
          ),
        if (destination == null &&
            widget.destinationLabel?.trim().isNotEmpty == true)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Text(
              'Destination coordinates are not verified. Destination: ${widget.destinationLabel}',
              style: const TextStyle(color: Colors.black54),
            ),
          ),
        if (ambulance == null)
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Text('Ambulance location is not currently available.',
                style: TextStyle(color: Colors.black54)),
          ),
        if (ambulance != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Text(
              'Ambulance location ${ambulanceIsStale ? 'may be stale' : 'updated'}${widget.ambulanceUpdatedAt == null ? '' : ' ${_freshnessTime(widget.ambulanceUpdatedAt)}'}',
              style: TextStyle(
                  color: ambulanceIsStale ? Colors.deepOrange : Colors.black54),
            ),
          ),
        SizedBox(
          height: 300,
          child: center == null
              ? const Center(
                  child: Text(
                      'Map unavailable until a real assignment location is available.'))
              : Stack(children: [
                  FlutterMap(
                    mapController: _controller,
                    options: MapOptions(initialCenter: center, initialZoom: 14),
                    children: [
                      if (widget.loadTiles)
                        TileLayer(
                          urlTemplate: _tileUrl,
                          userAgentPackageName: 'com.example.major',
                          errorTileCallback: (_, __, ___) {
                            if (mounted && !_tileError) {
                              setState(() => _tileError = true);
                            }
                          },
                        ),
                      if (_route.length > 1)
                        PolylineLayer(polylines: [
                          Polyline(
                              points: _route,
                              strokeWidth: 5,
                              color: AppColors.primary)
                        ]),
                      MarkerLayer(markers: [
                        if (pickup != null)
                          Marker(
                              point: pickup,
                              width: 54,
                              height: 54,
                              child: const _MapPin(
                                  color: AppColors.error,
                                  icon: Icons.person_pin_circle,
                                  label: 'Pickup')),
                        if (ambulance != null)
                          Marker(
                              point: ambulance,
                              width: 54,
                              height: 54,
                              child: const _MapPin(
                                  color: AppColors.primary,
                                  icon: Icons.local_taxi,
                                  label: 'Ambulance')),
                        if (destination != null)
                          Marker(
                              point: destination,
                              width: 54,
                              height: 54,
                              child: const _MapPin(
                                  color: AppColors.success,
                                  icon: Icons.local_hospital,
                                  label: 'Destination')),
                      ]),
                      if (widget.loadTiles)
                        SimpleAttributionWidget(
                          source: const Text('OpenStreetMap contributors'),
                          onTap: () => launchUrl(
                              Uri.https('www.openstreetmap.org', '/copyright'),
                              mode: LaunchMode.externalApplication),
                        ),
                    ],
                  ),
                  Positioned(
                    right: 10,
                    top: 10,
                    child: Column(children: [
                      FloatingActionButton.small(
                          heroTag: 'trip-map-zoom-in',
                          tooltip: 'Zoom in',
                          onPressed: () => _controller.move(
                              _controller.camera.center,
                              _controller.camera.zoom + 1),
                          child: const Icon(Icons.add)),
                      const SizedBox(height: 6),
                      FloatingActionButton.small(
                          heroTag: 'trip-map-zoom-out',
                          tooltip: 'Zoom out',
                          onPressed: () => _controller.move(
                              _controller.camera.center,
                              _controller.camera.zoom - 1),
                          child: const Icon(Icons.remove)),
                      const SizedBox(height: 6),
                      FloatingActionButton.small(
                          heroTag: 'trip-map-recenter',
                          tooltip: 'Recenter on trip',
                          onPressed: _recenter,
                          child: const Icon(Icons.my_location)),
                    ]),
                  ),
                  if (_tileError)
                    Positioned(
                        left: 8,
                        right: 8,
                        top: 8,
                        child: Material(
                            color: AppColors.warning.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                            child: const Padding(
                                padding: EdgeInsets.all(8),
                                child: Text(
                                    'Map tiles could not load. Check your connection; location markers remain available when tiles recover.')))),
                  if (_routeLoading)
                    const Positioned(
                        left: 10,
                        bottom: 10,
                        child: Chip(
                            avatar: SizedBox(
                                width: 14,
                                height: 14,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2)),
                            label: Text('Finding route…'))),
                  if (_routeError != null)
                    Positioned(
                        left: 10,
                        bottom: 10,
                        child: Chip(label: Text(_routeError!))),
                ]),
        ),
      ]),
    );
  }

  Widget _legend(String label, Color color, bool available) => Padding(
        padding: const EdgeInsets.only(left: 12, bottom: 4),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.circle, size: 11, color: available ? color : Colors.grey),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(color: available ? null : Colors.grey)),
        ]),
      );
}

class _MapPin extends StatelessWidget {
  const _MapPin({required this.color, required this.icon, required this.label});
  final Color color;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: Container(
          key: ValueKey('${label.toLowerCase()}-marker'),
          decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: const [
                BoxShadow(color: Colors.black26, blurRadius: 5)
              ]),
          child: Icon(icon, color: Colors.white, size: 34),
        ),
      );
}
