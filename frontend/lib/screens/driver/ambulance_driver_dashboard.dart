import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../services/socket_service.dart';
import '../../theme/app_colors.dart';
import 'active_trip_map.dart';
import '../change_password_screen.dart';

class AmbulanceDriverDashboard extends StatefulWidget {
  const AmbulanceDriverDashboard({super.key});
  @override
  State<AmbulanceDriverDashboard> createState() =>
      _AmbulanceDriverDashboardState();
}

class _AmbulanceDriverDashboardState extends State<AmbulanceDriverDashboard> {
  static const _navy = AppColors.primary;
  static const _emergencyRed = AppColors.error;
  static const _teal = AppColors.secondary;
  static const _labels = [
    'Dashboard',
    'Emergencies',
    'Active Trip',
    'Ambulance',
    'Trip History',
    'Notifications'
  ];
  static const _icons = [
    Icons.dashboard_outlined,
    Icons.emergency_outlined,
    Icons.route_outlined,
    Icons.local_taxi_outlined,
    Icons.history,
    Icons.notifications_outlined
  ];
  int _section = 0;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _historyError;
  String? _notificationError;
  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _assignments = [];
  List<Map<String, dynamic>> _history = [];
  List<Map<String, dynamic>> _notificationItems = [];
  int _historyPage = 1;
  int _historyTotal = 0;
  final ValueNotifier<Map<String, Map<String, dynamic>>> _livePatientLocations =
      ValueNotifier({});
  late final Function(dynamic) _patientLocationHandler;

  @override
  void initState() {
    super.initState();
    _patientLocationHandler = (event) {
      if (event is! Map) return;
      final update = Map<String, dynamic>.from(event);
      final type = update['bookingId'] != null ? 'booking' : 'emergency';
      final id =
          (update[type == 'booking' ? 'bookingId' : 'emergencyId'] as num?)
              ?.toInt();
      if (id == null) return;
      final isAssigned = _assignments.any((assignment) =>
          (assignment['assignment_type'] == 'booking'
                  ? 'booking'
                  : 'emergency') ==
              type &&
          (assignment['id'] as num?)?.toInt() == id &&
          !const {'completed', 'cancelled', 'resolved'}
              .contains((assignment['status'] ?? '').toString().toLowerCase()));
      if (!isAssigned) return;
      _livePatientLocations.value = {
        ..._livePatientLocations.value,
        '$type:$id': update,
      };
    };
    _load();
    _listenForUpdates();
  }

  @override
  void dispose() {
    SocketService.instance.offPatientLocation(_patientLocationHandler);
    _livePatientLocations.dispose();
    super.dispose();
  }

  Future<void> _listenForUpdates() async {
    final socket = SocketService.instance;
    await socket.connect();
    if (!mounted) return;
    socket.onEmergencyLifecycle((_) {
      if (mounted) _load(silent: true);
    });
    socket.onNotificationNew((_) {
      if (mounted) _load(silent: true);
    });
    socket.onReconnect((_) {
      if (mounted) _load(silent: true);
    });
    socket.onPatientLocation(_patientLocationHandler);
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final results = await Future.wait([
      ApiService.getDriverProfile(),
      ApiService.getDriverAssignments(),
      ApiService.getDriverTripHistory(limit: 20),
      ApiService.getNotifications(),
    ]);
    if (!mounted) return;
    if (results.any((result) => result['unauthorized'] == true)) {
      await context.read<AuthProvider>().logout();
      return;
    }
    if (results[0]['success'] != true || results[1]['success'] != true) {
      setState(() {
        _error = results[0]['message'] ??
            results[1]['message'] ??
            'Unable to load driver information.';
        _loading = false;
      });
      return;
    }
    setState(() {
      _profile = Map<String, dynamic>.from(results[0]['data'] as Map);
      _assignments = _maps(results[1]['data']);
      _history = _maps(results[2]['data']);
      _historyError = results[2]['success'] == true
          ? null
          : results[2]['message'] ?? 'Unable to load trip history.';
      _historyPage = 1;
      _historyTotal = (results[2]['pagination']?['total'] as num?)?.toInt() ??
          _history.length;
      _notificationItems =
          results[3]['success'] == true ? _maps(results[3]['data']) : [];
      _notificationError = results[3]['success'] == true
          ? null
          : results[3]['message'] ?? 'Unable to load notifications.';
      _loading = false;
      _error = null;
    });
    final socket = SocketService.instance;
    await socket.connect();
    for (final assignment in _assignments) {
      final id = (assignment['id'] as num?)?.toInt();
      if (id != null) {
        socket.subscribeAssignment(
            assignment['assignment_type'] == 'booking'
                ? 'booking'
                : 'emergency',
            id);
      }
    }
  }

  List<Map<String, dynamic>> _maps(dynamic value) => value is List
      ? value
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList()
      : <Map<String, dynamic>>[];

  Map<String, dynamic>? get _active =>
      _assignments.isEmpty ? null : _assignments.first;

  Future<void> _loadMoreHistory() async {
    if (_history.length >= _historyTotal || _busy) return;
    setState(() => _busy = true);
    final page = _historyPage + 1;
    final result = await ApiService.getDriverTripHistory(page: page, limit: 20);
    if (!mounted) return;
    if (result['unauthorized'] == true) {
      await context.read<AuthProvider>().logout();
      return;
    }
    setState(() {
      if (result['success'] == true) {
        _history.addAll(_maps(result['data']));
        _historyPage = page;
        _historyTotal =
            (result['pagination']?['total'] as num?)?.toInt() ?? _historyTotal;
        _historyError = null;
      } else {
        _historyError =
            result['message'] ?? 'Unable to load more trip history.';
      }
      _busy = false;
    });
  }

  String? _nextStatus(Map<String, dynamic> item) => const {
        'assigned': 'driver_accepted',
        'dispatched': 'driver_accepted',
        'driver_accepted': 'en_route_to_patient',
        'en_route_to_patient': 'arrived_at_patient',
        'arrived_at_patient': 'patient_picked_up',
        'patient_picked_up': 'en_route_to_hospital',
        'en_route_to_hospital': 'arrived_at_hospital',
        'arrived_at_hospital': 'completed',
      }[(item['status'] ?? '').toString().toLowerCase()];

  String _actionLabel(String status) =>
      const {
        'driver_accepted': 'Accept assignment',
        'en_route_to_patient': 'Start response',
        'arrived_at_patient': 'Mark arrived at pickup',
        'patient_picked_up': 'Confirm patient picked up',
        'en_route_to_hospital': 'Start transport',
        'arrived_at_hospital': 'Mark arrived at hospital',
        'completed': 'Complete trip',
      }[status] ??
      'Continue trip';

  Future<void> _advance(Map<String, dynamic> item) async {
    final id = (item['id'] as num?)?.toInt();
    final next = _nextStatus(item);
    if (id == null || next == null || _busy) return;
    setState(() => _busy = true);
    final response = item['assignment_type'] == 'booking'
        ? await ApiService.updateDriverBookingStatus(id, next)
        : await ApiService.updateDriverEmergencyStatus(id, next);
    if (!mounted) return;
    if (response['unauthorized'] == true) {
      await context.read<AuthProvider>().logout();
      return;
    }
    if (response['success'] == true) {
      _message('Trip updated: ${_statusLabel(next)}');
      await _load(silent: true);
    } else {
      _message(
          response['message'] ?? 'Trip update failed. Refresh and try again.');
      await _load(silent: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _shareLocation(Map<String, dynamic> item) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final position = await LocationService.getBestAvailableLocation();
      if (DateTime.now().difference(position.timestamp) >
          const Duration(minutes: 2)) {
        throw const PatientLocationException(
            'The available GPS fix is more than two minutes old. Refresh location and try again.');
      }
      final result = await ApiService.updateDriverLocation(
          position.latitude, position.longitude,
          accuracy: position.accuracy, timestamp: position.timestamp);
      if (!mounted) return;
      if (result['unauthorized'] == true) {
        await context.read<AuthProvider>().logout();
        return;
      }
      if (result['success'] == true) {
        _message('Location shared with the assigned hospital and patient.');
        await _load(silent: true);
      } else {
        _message(result['message'] ?? 'Unable to share location.');
      }
    } on PatientLocationException catch (error) {
      if (mounted) _message(error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _navigate(Map<String, dynamic> item,
      {bool toHospital = false}) async {
    final assignmentType =
        item['assignment_type'] == 'booking' ? 'booking' : 'emergency';
    final assignmentId = (item['id'] as num?)?.toInt();
    final live = assignmentId == null
        ? null
        : _livePatientLocations.value['$assignmentType:$assignmentId'];
    final patientLat = live?['latitude'] ??
        (item['patient_location_lat'] ?? item['location_lat']);
    final patientLng = live?['longitude'] ??
        (item['patient_location_lng'] ?? item['location_lng']);
    final lat = _number(toHospital ? item['destination_latitude'] : patientLat);
    final lng =
        _number(toHospital ? item['destination_longitude'] : patientLng);
    final destinationText = toHospital
        ? (item['dropoff_location'] ?? item['hospital_name'])?.toString().trim()
        : (item['pickup_location'] ??
                item['location_address'] ??
                item['pickup_address'])
            ?.toString()
            .trim();
    if ((lat == null ||
            lng == null ||
            (toHospital && item['destination_verified'] != true)) &&
        (destinationText == null || destinationText.isEmpty)) {
      _message(toHospital
          ? 'A verified hospital entrance is not available for navigation.'
          : 'Pickup coordinates are unavailable.');
      return;
    }
    final destination = lat != null &&
            lng != null &&
            (!toHospital || item['destination_verified'] == true)
        ? '$lat,$lng'
        : destinationText!;
    final uri = Uri.https('www.google.com', '/maps/dir/',
        {'api': '1', 'destination': destination, 'travelmode': 'driving'});
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        mounted) {
      _message('Unable to open Google Maps.');
    }
  }

  double? _number(dynamic value) => value is num
      ? value.toDouble()
      : double.tryParse(value?.toString() ?? '');

  Future<void> _logout() async {
    await context.read<AuthProvider>().logout();
  }

  Future<void> _markRead(Map<String, dynamic> item) async {
    final id = (item['id'] as num?)?.toInt();
    if (id == null || item['is_read'] == true) return;
    await ApiService.markNotificationRead(id);
    if (mounted) {
      setState(() {
        final index = _notificationItems.indexWhere((n) => n['id'] == id);
        if (index >= 0) _notificationItems[index]['is_read'] = true;
      });
    }
  }

  String _statusLabel(dynamic raw) => (raw ?? 'unknown')
      .toString()
      .replaceAll('_', ' ')
      .split(' ')
      .map((part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
  void _message(String value) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(value)));

  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, constraints) {
        final wide = constraints.maxWidth >= 900;
        final compact = constraints.maxWidth < 650;
        return Scaffold(
          appBar: AppBar(
            title: const Text('Ambulance Driver Portal'),
            backgroundColor: _navy,
            foregroundColor: Colors.white,
            iconTheme: const IconThemeData(color: Colors.white),
            actions: [
              IconButton(
                  onPressed: _loading ? null : () => _load(),
                  tooltip: 'Refresh',
                  icon: const Icon(Icons.refresh)),
              PopupMenuButton<String>(
                  tooltip: 'Profile and settings',
                  icon: const Icon(Icons.account_circle_outlined),
                  onSelected: (value) {
                    if (value == 'profile') setState(() => _section = 6);
                    if (value == 'logout') _logout();
                  },
                  itemBuilder: (_) => const [
                        PopupMenuItem(
                            value: 'profile',
                            child: Text('Profile and settings')),
                        PopupMenuItem(value: 'logout', child: Text('Sign out'))
                      ])
            ],
          ),
          body: Row(children: [
            if (wide)
              NavigationRail(
                backgroundColor: Colors.white,
                selectedIconTheme: const IconThemeData(color: _navy),
                selectedLabelTextStyle:
                    const TextStyle(color: _navy, fontWeight: FontWeight.w700),
                indicatorColor: const Color(0xFFE7F4F5),
                selectedIndex: _section.clamp(0, 5).toInt(),
                onDestinationSelected: (index) =>
                    setState(() => _section = index),
                labelType: NavigationRailLabelType.all,
                groupAlignment: -0.8,
                destinations: List.generate(
                    _labels.length,
                    (index) => NavigationRailDestination(
                        icon: Icon(_icons[index]),
                        selectedIcon: Icon(_icons[index]),
                        label: Text(_labels[index]))),
              ),
            Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? _errorState()
                        : RefreshIndicator(
                            onRefresh: () => _load(),
                            child: _content(compact))),
          ]),
          bottomNavigationBar: wide
              ? null
              : NavigationBar(
                  selectedIndex: _section == 0
                      ? 0
                      : _section == 1
                          ? 1
                          : _section == 2
                              ? 2
                              : 3,
                  onDestinationSelected: (index) {
                    if (index < 3) {
                      setState(() => _section = index);
                    } else {
                      _showMore(context);
                    }
                  },
                  destinations: const [
                    NavigationDestination(
                        icon: Icon(Icons.dashboard_outlined), label: 'Home'),
                    NavigationDestination(
                        icon: Icon(Icons.emergency_outlined),
                        label: 'Emergencies'),
                    NavigationDestination(
                        icon: Icon(Icons.route_outlined), label: 'Active trip'),
                    NavigationDestination(icon: Icon(Icons.menu), label: 'More')
                  ],
                ),
        );
      });

  Widget _errorState() => Center(
      child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_outlined, size: 44),
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            ElevatedButton.icon(
                onPressed: () => _load(),
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'))
          ])));

  Widget _content(bool compact) {
    final children = switch (_section) {
      0 => _overview(compact),
      1 => _assignmentList(),
      2 => _activeTrip(),
      3 => _ambulanceDetails(),
      4 => _tripHistory(),
      5 => _notificationSection(),
      _ => _profileDetails(),
    };
    return ListView(
        padding: EdgeInsets.all(compact ? 16 : 24), children: children);
  }

  Widget _heading(String title, String subtitle,
          {IconData icon = Icons.local_taxi_outlined}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Row(children: [
            CircleAvatar(
                backgroundColor:
                    Theme.of(context).colorScheme.primary.withValues(alpha: .1),
                child: Icon(icon, color: _teal)),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(title,
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  Text(subtitle,
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: Colors.black54))
                ]))
          ]));

  List<Widget> _overview(bool compact) {
    final active = _active;
    final newlyAssigned = _assignments
        .where((a) => const {'assigned', 'dispatched'}
            .contains((a['status'] ?? '').toString().toLowerCase()))
        .length;
    final completed = _profile?['completed_trips_today']?.toString() ?? '—';
    return [
      Row(children: [
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
              'Good ${DateTime.now().hour < 12 ? 'morning' : DateTime.now().hour < 17 ? 'afternoon' : 'evening'}, ${_profile?['name'] ?? 'Driver'}',
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
              '${_profile?['hospital_name'] ?? 'Hospital not assigned'}  ·  ${_driverDateLabel()}',
              style: const TextStyle(color: AppColors.muted)),
        ])),
        CircleAvatar(
            radius: 24,
            backgroundColor: AppColors.secondarySurface,
            child: Text(_driverInitials(),
                style:
                    const TextStyle(color: _navy, fontWeight: FontWeight.w700)))
      ]),
      const SizedBox(height: 20),
      Wrap(spacing: 12, runSpacing: 12, children: [
        _metric('New assignments', '$newlyAssigned',
            Icons.notification_important_outlined, compact),
        _metric('Pending / active', '${_assignments.length}',
            Icons.emergency_outlined, compact),
        _metric('Active trip', active == null ? 'None' : '#${active['id']}',
            Icons.route_outlined, compact),
        _metric('Completed today', completed, Icons.task_alt, compact),
        _metric('Trip history', '$_historyTotal', Icons.history, compact),
      ]),
      const SizedBox(height: 16),
      Card(
          child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                        color: _profile?['is_available'] == true
                            ? AppColors.success
                            : AppColors.warning,
                        shape: BoxShape.circle)),
                const SizedBox(width: 10),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(
                          _profile?['is_available'] == true
                              ? 'Available for dispatch'
                              : 'Dispatch status managed by your hospital',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(
                          '${_profile?['vehicle_number'] ?? 'Ambulance not assigned'}  ·  ${_profile?['ambulance_type'] ?? 'Vehicle details unavailable'}',
                          style: const TextStyle(
                              color: AppColors.muted, fontSize: 12))
                    ])),
                TextButton(
                    onPressed: () => setState(() => _section = 3),
                    child: const Text('Details'))
              ]))),
      LayoutBuilder(builder: (context, constraints) {
        final tripPanel = Card(
            child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Active assignment',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      if (active == null)
                        _empty(
                            'Ready for dispatch',
                            'No active emergency assignment is linked to your account.',
                            Icons.task_alt)
                      else
                        _assignmentCard(active, detailed: true),
                    ])));
        final actionsPanel = Card(
            child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Operations',
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                              onPressed: () => setState(() => _section = 1),
                              icon: const Icon(Icons.emergency_outlined),
                              label: const Text('View assignments'))),
                      const SizedBox(height: 8),
                      SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                              onPressed: () => setState(() => _section = 3),
                              icon: const Icon(Icons.local_taxi_outlined),
                              label: const Text('Ambulance details'))),
                      const SizedBox(height: 8),
                      SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                              onPressed: () => setState(() => _section = 4),
                              icon: const Icon(Icons.history),
                              label: const Text('Trip history'))),
                    ])));
        if (constraints.maxWidth >= 1000) {
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(flex: 7, child: tripPanel),
            const SizedBox(width: 16),
            Expanded(flex: 3, child: actionsPanel)
          ]);
        }
        return Column(children: [tripPanel, actionsPanel]);
      }),
    ];
  }

  String _driverInitials() {
    final parts =
        (_profile?['name'] ?? 'Driver').toString().trim().split(RegExp(r'\s+'));
    return parts
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
  }

  String _driverDateLabel() {
    final d = DateTime.now();
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ];
    return '${days[d.weekday - 1]}, ${months[d.month - 1]} ${d.day}';
  }

  Widget _metric(String title, String value, IconData icon, bool compact) =>
      SizedBox(
          width: compact ? 155 : 205,
          child: Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                            color:
                                (title.toLowerCase().contains('assignment') ||
                                            title.toLowerCase().contains('trip')
                                        ? _emergencyRed
                                        : _teal)
                                    .withValues(alpha: .1),
                            borderRadius: BorderRadius.circular(12)),
                        child: Icon(icon,
                            color: title.toLowerCase().contains('assignment') ||
                                    title.toLowerCase().contains('trip')
                                ? _emergencyRed
                                : _teal,
                            size: 20)),
                    const SizedBox(width: 10),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text(value,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          Text(title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(
                                      color: AppColors.muted, fontSize: 11))
                        ]))
                  ]))));

  List<Widget> _assignmentList() => [
        _heading('Assigned emergencies',
            'Assignments are restricted to your authenticated driver account.',
            icon: Icons.emergency_outlined),
        if (_assignments.isEmpty)
          _empty(
              'No assignments right now',
              'New emergency assignments will appear here when dispatch links them to you.',
              Icons.inbox_outlined),
        ..._assignments.map((item) => _assignmentCard(item)),
      ];

  Widget _assignmentCard(Map<String, dynamic> item, {bool detailed = false}) {
    final status = (item['status'] ?? '').toString();
    final next = _nextStatus(item);
    final activeColor = status == 'completed'
        ? AppColors.success
        : status == 'cancelled'
            ? Colors.grey
            : status == 'assigned' || status == 'dispatched'
                ? _emergencyRed
                : _teal;
    final assignmentType =
        item['assignment_type'] == 'booking' ? 'booking' : 'emergency';
    final assignmentId = (item['id'] as num?)?.toInt();
    return Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
            padding: const EdgeInsets.all(18),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                    child: Text(
                        '${assignmentType == 'booking' ? 'Booking' : 'Emergency'} #${item['id']}',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700))),
                _statusBadge(status, activeColor)
              ]),
              const SizedBox(height: 10),
              Text(
                  '${item['emergency_type'] ?? 'Emergency'} · ${_statusLabel(item['severity'] ?? 'priority unavailable')}'),
              if (item['patient_name'] != null)
                Text('Patient: ${item['patient_name']}'),
              ValueListenableBuilder<Map<String, Map<String, dynamic>>>(
                valueListenable: _livePatientLocations,
                builder: (context, locations, _) {
                  final live = assignmentId == null
                      ? null
                      : locations['$assignmentType:$assignmentId'];
                  final latitude = live?['latitude'] ??
                      (item['patient_location_lat'] ?? item['location_lat']);
                  final longitude = live?['longitude'] ??
                      (item['patient_location_lng'] ?? item['location_lng']);
                  final pickup =
                      '${latitude ?? 'Unavailable'}, ${longitude ?? 'Unavailable'}';
                  final locationTime = live?['timestamp'] ??
                      item['patient_location_updated_at'] ??
                      item['location_timestamp'];
                  final accuracy = live?['accuracy'] ??
                      item['patient_location_accuracy'] ??
                      item['location_accuracy'];
                  final parsedTime =
                      DateTime.tryParse(locationTime?.toString() ?? '');
                  final stale = parsedTime == null ||
                      DateTime.now().difference(parsedTime) >
                          const Duration(minutes: 2);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Pickup coordinates: $pickup'),
                      if (latitude == null || longitude == null)
                        const Text(
                          'Patient location unavailable. Use the supplied pickup address or contact dispatch.',
                          style: TextStyle(color: AppColors.warning),
                        ),
                      if (locationTime != null)
                        Text(
                          'Patient location ${stale ? 'stale' : 'current'} · updated $locationTime${accuracy != null ? ' · ±$accuracy m accuracy' : ''}',
                          style: TextStyle(
                              color:
                                  stale ? AppColors.warning : Colors.black54),
                        ),
                    ],
                  );
                },
              ),
              if (assignmentType == 'booking' &&
                  item['pickup_location'] != null)
                Text('Pickup address: ${item['pickup_location']}'),
              Text(
                  'Destination: ${item['hospital_name'] ?? item['dropoff_location'] ?? 'Hospital not available'}'),
              Text(
                  'Ambulance: ${item['vehicle_number'] ?? _profile?['vehicle_number'] ?? 'Not assigned'}'),
              if (item['created_at'] != null)
                Text('Assigned/requested: ${item['created_at']}'),
              if (detailed &&
                  (item['description'] ?? '').toString().trim().isNotEmpty)
                Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('Instructions: ${item['description']}')),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton.icon(
                    onPressed: () => _navigate(item),
                    icon: const Icon(Icons.navigation_outlined),
                    label: const Text('Navigate to pickup')),
                if ((item['destination_verified'] == true &&
                        _number(item['destination_latitude']) != null &&
                        _number(item['destination_longitude']) != null) ||
                    (item['dropoff_location']?.toString().trim().isNotEmpty ??
                        false))
                  OutlinedButton.icon(
                      onPressed: () => _navigate(item, toHospital: true),
                      icon: const Icon(Icons.local_hospital_outlined),
                      label: const Text('Navigate to hospital')),
                if (detailed && _active != null)
                  OutlinedButton.icon(
                      onPressed: _busy ? null : () => _shareLocation(item),
                      icon: const Icon(Icons.my_location),
                      label: const Text('Share current location')),
                if (next != null)
                  ElevatedButton.icon(
                      onPressed: _busy ? null : () => _advance(item),
                      icon: _busy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.arrow_forward),
                      label: Text(_actionLabel(next))),
              ]),
              if (item['driver_location_timestamp'] != null)
                Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                        'Last GPS update: ${item['driver_location_timestamp']}',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: Colors.black54))),
            ])));
  }

  DateTime? _date(dynamic value) =>
      value == null ? null : DateTime.tryParse(value.toString());

  double? _coordinate(dynamic value) => value is num
      ? value.toDouble()
      : double.tryParse(value?.toString() ?? '');

  Widget _activeTripMap(Map<String, dynamic> item) {
    final type = item['assignment_type'] == 'booking' ? 'booking' : 'emergency';
    final id = (item['id'] as num?)?.toInt();
    return ValueListenableBuilder<Map<String, Map<String, dynamic>>>(
      valueListenable: _livePatientLocations,
      builder: (context, locations, _) {
        final live = id == null ? null : locations['$type:$id'];
        final pickupLat = _coordinate(live?['latitude'] ??
            item['patient_location_lat'] ??
            item['location_lat']);
        final pickupLng = _coordinate(live?['longitude'] ??
            item['patient_location_lng'] ??
            item['location_lng']);
        final locationTime = live?['timestamp'] ??
            item['patient_location_updated_at'] ??
            item['pickup_timestamp'] ??
            item['location_timestamp'];
        final accuracy = _coordinate(live?['accuracy'] ??
            item['patient_location_accuracy'] ??
            item['pickup_accuracy'] ??
            item['location_accuracy']);
        return ActiveTripMap(
          key: ValueKey('active-trip-map-$type-$id'),
          status: (item['status'] ?? '').toString(),
          pickupLatitude: pickupLat,
          pickupLongitude: pickupLng,
          pickupAddress: (item['pickup_location'] ??
                  item['location_address'] ??
                  item['pickup_address'])
              ?.toString(),
          pickupUpdatedAt: _date(locationTime),
          pickupAccuracy: accuracy,
          ambulanceLatitude: _coordinate(item['driver_location_lat']),
          ambulanceLongitude: _coordinate(item['driver_location_lng']),
          ambulanceUpdatedAt: _date(item['driver_location_timestamp']),
          destinationLatitude: _coordinate(item['destination_latitude']),
          destinationLongitude: _coordinate(item['destination_longitude']),
          destinationLabel:
              (item['hospital_name'] ?? item['dropoff_location'])?.toString(),
          destinationVerified: item['destination_verified'] == true,
          onNavigate: () => _navigate(item,
              toHospital: const {
                'patient_picked_up',
                'en_route_to_hospital',
                'arrived_at_hospital'
              }.contains((item['status'] ?? '').toString().toLowerCase())),
        );
      },
    );
  }

  List<Widget> _activeTrip() => [
        _heading('Active trip',
            'Follow the confirmed trip steps and keep dispatch updated.',
            icon: Icons.route_outlined),
        if (_active == null) ...[
          _empty(
              'No active trip',
              'When a hospital assigns an ambulance, the trip and next action will appear here.',
              Icons.route_outlined),
          const SizedBox(height: 12),
          OutlinedButton.icon(
              onPressed: () => setState(() => _section = 1),
              icon: const Icon(Icons.emergency),
              label: const Text('View assignments'))
        ] else ...[
          _activeTripMap(_active!),
          const SizedBox(height: 12),
          _assignmentCard(_active!, detailed: true),
        ],
      ];

  List<Widget> _ambulanceDetails() {
    final p = _profile ?? {};
    final active = _active;
    return [
      _heading(
          'Ambulance details', 'Vehicle information assigned by your hospital.',
          icon: Icons.local_taxi_outlined),
      if (p['ambulance_id'] == null)
        _empty(
            'No ambulance assigned',
            'Contact your hospital dispatch team to link an active ambulance to your driver account.',
            Icons.info_outline)
      else
        Card(
            child: Column(children: [
          _detail('Registration', p['vehicle_number'] ?? 'Not provided',
              Icons.confirmation_number_outlined),
          _detail('Ambulance ID', '#${p['ambulance_id']}', Icons.tag_outlined),
          _detail('Vehicle type', p['ambulance_type'] ?? 'Not provided',
              Icons.local_taxi_outlined),
          _detail(
              'Availability',
              p['ambulance_status'] ??
                  (p['is_available'] == true ? 'Available' : 'Assigned'),
              Icons.circle_outlined),
          _detail('Hospital', p['hospital_name'] ?? 'Not provided',
              Icons.local_hospital_outlined),
          if (active != null)
            _detail(
                'Current assignment',
                'Emergency #${active['id']} · ${_statusLabel(active['status'])}',
                Icons.emergency_outlined),
          if (p['driver_location_timestamp'] != null)
            _detail('Last location update', p['driver_location_timestamp'],
                Icons.my_location),
        ])),
    ];
  }

  List<Widget> _tripHistory() => [
        _heading('Trip history',
            'Completed and closed emergencies assigned to your account.',
            icon: Icons.history),
        if (_historyError != null)
          _sectionError(_historyError!, () => _load())
        else if (_history.isEmpty)
          _empty('No trip history yet', 'Completed trips will appear here.',
              Icons.history),
        ..._history.map(_historyCard),
        if (_history.length < _historyTotal)
          Center(
            child: OutlinedButton(
              onPressed: _busy ? null : _loadMoreHistory,
              child: Text(_busy ? 'Loading…' : 'Load more trips'),
            ),
          ),
      ];

  Widget _historyCard(Map<String, dynamic> item) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: ListTile(
          leading: const CircleAvatar(child: Icon(Icons.local_taxi_outlined)),
          title: Text(
              'Emergency #${item['id']} · ${item['hospital_name'] ?? 'Hospital'}'),
          subtitle: Text(
            '${_statusLabel(item['status'])} · ${item['created_at'] ?? 'Date unavailable'}\n'
            'Pickup: ${item['location_lat'] ?? '—'}, ${item['location_lng'] ?? '—'}',
          ),
          isThreeLine: true,
          trailing: const Icon(Icons.chevron_right),
          onTap: () => _showHistoryDetail(item),
        ),
      );

  Future<void> _showHistoryDetail(Map<String, dynamic> item) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: ListView(
            shrinkWrap: true,
            children: [
              Text('Emergency #${item['id']}',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              Text('Status: ${_statusLabel(item['status'])}'),
              Text('Hospital: ${item['hospital_name'] ?? 'Unknown'}'),
              Text('Ambulance: ${item['vehicle_number'] ?? 'Unknown'}'),
              Text('Created: ${item['created_at'] ?? 'Unknown'}'),
              Text('Updated: ${item['updated_at'] ?? 'Unknown'}'),
              const SizedBox(height: 12),
              TextButton(
                  onPressed: () => Navigator.pop(sheetContext),
                  child: const Text('Close')),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _notificationSection() => [
        _heading('Notifications',
            'Dispatch updates and important account notifications.',
            icon: Icons.notifications_outlined),
        if (_notificationError != null)
          _sectionError(_notificationError!, () => _load())
        else if (_notificationItems.isEmpty)
          _empty(
              'No notifications',
              'New assignments and updates will be listed here when available.',
              Icons.notifications_none),
        ..._notificationItems.map((item) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
                leading: Icon(
                    item['priority'] == 'critical'
                        ? Icons.priority_high
                        : Icons.notifications_outlined,
                    color: item['priority'] == 'critical'
                        ? AppColors.error
                        : null),
                title: Text(item['title'] ?? 'Notification',
                    style: TextStyle(
                        fontWeight: item['is_read'] == true
                            ? FontWeight.normal
                            : FontWeight.w700)),
                subtitle: Text(item['message'] ?? ''),
                trailing: item['is_read'] == true
                    ? null
                    : const Icon(Icons.circle,
                        size: 10, color: AppColors.error),
                onTap: () => _markRead(item)))),
      ];

  Widget _sectionError(String message, VoidCallback retry) => Card(
        child: ListTile(
          leading: const Icon(Icons.cloud_off_outlined),
          title: Text(message),
          trailing: TextButton(onPressed: retry, child: const Text('Retry')),
        ),
      );

  List<Widget> _profileDetails() {
    final p = _profile ?? {};
    return [
      _heading('Profile and settings',
          'Your driver account is managed by your hospital.',
          icon: Icons.account_circle_outlined),
      Card(
          child: Column(children: [
        _detail('Name', p['name'] ?? 'Driver', Icons.person_outline),
        _detail('Email', p['email'] ?? 'Not provided', Icons.email_outlined),
        _detail('Phone', p['phone'] ?? 'Not provided', Icons.phone_outlined),
        _detail('Hospital', p['hospital_name'] ?? 'Not assigned',
            Icons.local_hospital_outlined)
      ])),
      const SizedBox(height: 16),
      OutlinedButton.icon(
          onPressed: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => const ChangePasswordScreen())),
          icon: const Icon(Icons.lock_reset),
          label: const Text('Change password')),
      const SizedBox(height: 8),
      OutlinedButton.icon(
          onPressed: _logout,
          icon: const Icon(Icons.logout),
          label: const Text('Sign out'))
    ];
  }

  Widget _detail(String label, dynamic value, IconData icon) => ListTile(
      leading: Icon(icon),
      title: Text(label,
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(color: Colors.black54)),
      subtitle: Text(value?.toString() ?? 'Not provided',
          style: Theme.of(context).textTheme.titleSmall));
  Widget _statusBadge(String status, Color color) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
          color: color.withValues(alpha: .1),
          borderRadius: BorderRadius.circular(20)),
      child: Text(_statusLabel(status),
          style: TextStyle(
              color: color, fontWeight: FontWeight.w700, fontSize: 12)));
  Widget _empty(String title, String message, IconData icon) => Card(
      child: Padding(
          padding: const EdgeInsets.all(26),
          child: Column(children: [
            Icon(icon, size: 38, color: Colors.black38),
            const SizedBox(height: 10),
            Text(title,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 5),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54))
          ])));

  void _showMore(BuildContext context) {
    showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
              for (final index in [3, 4, 5, 6])
                ListTile(
                    leading: Icon(index == 6
                        ? Icons.account_circle_outlined
                        : _icons[index]),
                    title: Text(
                        index == 6 ? 'Profile and settings' : _labels[index]),
                    onTap: () {
                      Navigator.pop(sheetContext);
                      setState(() => _section = index);
                    })
            ])));
  }
}
