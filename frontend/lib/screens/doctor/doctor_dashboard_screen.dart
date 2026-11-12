import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../widgets/app_ui.dart';
import '../../widgets/notification_center.dart';
import '../login_screen.dart';
import '../change_password_screen.dart';

class DoctorDashboardScreen extends StatefulWidget {
  const DoctorDashboardScreen({super.key});

  @override
  State<DoctorDashboardScreen> createState() => _DoctorDashboardScreenState();
}

class _DoctorDashboardScreenState extends State<DoctorDashboardScreen> {
  static const _filters = [
    'Today',
    'Upcoming',
    'Pending',
    'In progress',
    'Completed'
  ];
  String _appointmentFilter = 'Today';
  Map<String, dynamic>? profile;
  List<dynamic> appointments = [];
  List<dynamic> schedule = [];
  bool loading = true;
  String? loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      loadError = null;
    });
    final results = await Future.wait([
      ApiService.getDoctorProfile(),
      ApiService.getDoctorAppointments(),
      ApiService.getDoctorAppointmentSchedule(),
    ]);
    if (!mounted) return;
    if (results[0]['success'] != true || results[1]['success'] != true) {
      setState(() {
        loadError = results[0]['message'] ??
            results[1]['message'] ??
            'Unable to load doctor dashboard.';
        loading = false;
      });
      return;
    }
    setState(() {
      profile = results[0]['data'] as Map<String, dynamic>?;
      appointments = results[1]['data'] as List? ?? [];
      schedule = results[2]['schedules'] as List? ?? [];
      loading = false;
    });
  }

  Future<void> _availability(bool value) async {
    final r = await ApiService.setDoctorAvailability(value);
    if (r['success'] == true) {
      setState(() {
        profile = {...?profile, 'availability_status': value};
      });
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(r['message'] ?? 'Availability was not updated.')));
    }
  }

  Future<void> _status(int id, String status) async {
    final r = await ApiService.updateDoctorAppointment(id, status);
    if (r['success'] == true) {
      await _load();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(r['message'] ?? 'Appointment was not updated.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = profile;
    return LayoutBuilder(builder: (context, viewport) {
      final compact = viewport.maxWidth < 650;
      final filteredAppointments = appointments.where((raw) {
        final a = Map<String, dynamic>.from(raw as Map);
        final status = (a['status'] ?? '').toString().toLowerCase();
        switch (_appointmentFilter) {
          case 'Upcoming':
            return !_isToday(a['appointment_date']) &&
                !{'completed', 'rejected', 'cancelled'}.contains(status);
          case 'Pending':
            return status == 'pending';
          case 'In progress':
            return status == 'in_consultation';
          case 'Completed':
            return {'completed', 'rejected', 'cancelled'}.contains(status);
          default:
            return _isToday(a['appointment_date']);
        }
      }).toList();
      return Scaffold(
        appBar: AppBar(
          title: Text(compact ? 'Doctor' : 'CareSync · Doctor workspace'),
          backgroundColor: CareGuideColors.navy,
          foregroundColor: Colors.white,
          iconTheme: const IconThemeData(color: Colors.white),
          actions: [
            const NotificationCenterButton(),
            IconButton(
                tooltip: 'Change password',
                onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const ChangePasswordScreen())),
                icon: const Icon(Icons.lock_reset)),
            IconButton(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
            ),
            IconButton(
              onPressed: () {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (_) => false,
                );
              },
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : loadError != null
                ? Center(
                    child: Padding(
                        padding: const EdgeInsets.all(24),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.cloud_off_outlined, size: 42),
                          const SizedBox(height: 12),
                          Text(loadError!, textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          FilledButton.icon(
                              onPressed: _load,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Retry'))
                        ])))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: CareGuidePage(
                      padding: EdgeInsets.zero,
                      child: ListView(
                        padding: EdgeInsets.symmetric(
                            horizontal: compact ? 16 : 28, vertical: 24),
                        children: [
                          Row(children: [
                            Expanded(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Text(
                                    'Good ${DateTime.now().hour < 12 ? 'morning' : DateTime.now().hour < 17 ? 'afternoon' : 'evening'}, ${p?['name'] ?? 'Doctor'}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineMedium
                                        ?.copyWith(fontWeight: FontWeight.w700),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                      '${p?['specialization'] ?? 'Doctor'}  ·  ${p?['hospital_name'] ?? 'Hospital not available'}',
                                      style: const TextStyle(
                                          color: CareGuideColors.muted)),
                                  Text(_todayLabel(),
                                      style: const TextStyle(
                                          color: CareGuideColors.muted,
                                          fontSize: 12)),
                                ])),
                            CircleAvatar(
                                radius: 25,
                                backgroundColor: CareGuideColors.mint,
                                child: Text(_initials(p?['name']),
                                    style: const TextStyle(
                                        color: CareGuideColors.navy,
                                        fontWeight: FontWeight.w700))),
                          ]),
                          const SizedBox(height: 22),
                          Wrap(spacing: 12, runSpacing: 12, children: [
                            _metric(
                                'Today',
                                appointments
                                    .where(
                                        (a) => _isToday(a['appointment_date']))
                                    .length,
                                Icons.today,
                                CareGuideColors.navy),
                            _metric('Pending', _countStatus('pending'),
                                Icons.hourglass_top, CareGuideColors.warning),
                            _metric(
                                'Confirmed',
                                _countStatus('accepted') +
                                    _countStatus('confirmed'),
                                Icons.event_available,
                                CareGuideColors.teal),
                            _metric(
                                'In consultation',
                                _countStatus('in_consultation'),
                                Icons.medical_services_outlined,
                                CareGuideColors.teal),
                            _metric('Completed', _countStatus('completed'),
                                Icons.task_alt, CareGuideColors.success),
                            _metric(
                                'Cancelled / rejected',
                                _countStatus('cancelled') +
                                    _countStatus('rejected'),
                                Icons.event_busy_outlined,
                                CareGuideColors.danger),
                          ]),
                          const SizedBox(height: 20),
                          Card(
                              child: Padding(
                                  padding: const EdgeInsets.all(18),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(children: [
                                          const Icon(
                                              Icons.calendar_month_outlined,
                                              color: CareGuideColors.teal),
                                          const SizedBox(width: 10),
                                          const Expanded(
                                              child: Text(
                                                  'Availability & schedule',
                                                  style: TextStyle(
                                                      fontSize: 17,
                                                      fontWeight:
                                                          FontWeight.w700))),
                                          Text(
                                              p?['availability_status'] == true
                                                  ? 'ONLINE'
                                                  : 'OFFLINE',
                                              style: TextStyle(
                                                  color:
                                                      p?['availability_status'] ==
                                                              true
                                                          ? CareGuideColors
                                                              .success
                                                          : CareGuideColors
                                                              .muted,
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 11)),
                                          Switch(
                                              value:
                                                  p?['availability_status'] ==
                                                      true,
                                              onChanged: _availability),
                                        ]),
                                        Text(
                                            p?['availability_status'] == true
                                                ? 'Booking is open during your configured hours.'
                                                : 'New bookings are paused; existing appointments remain available.',
                                            style: const TextStyle(
                                                color: CareGuideColors.muted)),
                                        const Divider(height: 22),
                                        Row(children: [
                                          const Expanded(
                                              child: Text(
                                                  'Weekly working hours',
                                                  style: TextStyle(
                                                      fontWeight:
                                                          FontWeight.w600))),
                                          if (schedule.isNotEmpty)
                                            Text(
                                                '${schedule.length} configured ${schedule.length == 1 ? 'day' : 'days'}',
                                                style: const TextStyle(
                                                    color:
                                                        CareGuideColors.muted,
                                                    fontSize: 12))
                                        ]),
                                        const SizedBox(height: 8),
                                        if (schedule.isEmpty)
                                          const Text(
                                              'No working hours configured by your hospital.',
                                              style: TextStyle(
                                                  color:
                                                      CareGuideColors.muted)),
                                        if (schedule.isNotEmpty)
                                          Wrap(
                                              spacing: 8,
                                              runSpacing: 8,
                                              children: _scheduleLines()),
                                      ]))),
                          const SizedBox(height: 24),
                          Row(children: [
                            Expanded(
                                child: Text('Appointment management',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge
                                        ?.copyWith(
                                            fontWeight: FontWeight.w700))),
                            if (!compact)
                              Text('${filteredAppointments.length} shown',
                                  style: const TextStyle(
                                      color: CareGuideColors.muted))
                          ]),
                          const SizedBox(height: 10),
                          SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: SegmentedButton<String>(
                                segments: _filters
                                    .map((f) =>
                                        ButtonSegment(value: f, label: Text(f)))
                                    .toList(),
                                selected: {_appointmentFilter},
                                onSelectionChanged: (s) => setState(
                                    () => _appointmentFilter = s.first),
                                showSelectedIcon: false,
                              )),
                          const SizedBox(height: 12),
                          if (filteredAppointments.isEmpty)
                            Card(
                                child: Padding(
                                    padding: const EdgeInsets.all(24),
                                    child: Column(children: [
                                      const Icon(Icons.event_available_outlined,
                                          size: 34,
                                          color: CareGuideColors.teal),
                                      const SizedBox(height: 8),
                                      Text(_emptyAppointmentMessage(),
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600)),
                                      const SizedBox(height: 4),
                                      const Text(
                                          'Appointments will appear here when they are assigned to your account.',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                              color: CareGuideColors.muted))
                                    ]))),
                          if (filteredAppointments.isNotEmpty)
                            LayoutBuilder(
                                builder: (context, constraints) => Wrap(
                                    spacing: 12,
                                    runSpacing: 12,
                                    children: filteredAppointments.map((a) {
                                      final appointmentId =
                                          (a['id'] as num).toInt();
                                      final status =
                                          (a['status'] ?? 'pending').toString();
                                      final normalized = status.toLowerCase();
                                      return SizedBox(
                                          width: constraints.maxWidth >= 900
                                              ? (constraints.maxWidth - 12) / 2
                                              : constraints.maxWidth,
                                          child: Card(
                                              child: Padding(
                                                  padding:
                                                      const EdgeInsets.all(18),
                                                  child: Column(
                                                      crossAxisAlignment:
                                                          CrossAxisAlignment
                                                              .start,
                                                      children: [
                                                        Row(children: [
                                                          CircleAvatar(
                                                              backgroundColor:
                                                                  CareGuideColors
                                                                      .mint,
                                                              child: Text(
                                                                  _initials(a[
                                                                      'patient_name']),
                                                                  style: const TextStyle(
                                                                      color: CareGuideColors
                                                                          .navy,
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .w700))),
                                                          const SizedBox(
                                                              width: 12),
                                                          Expanded(
                                                              child: Column(
                                                                  crossAxisAlignment:
                                                                      CrossAxisAlignment
                                                                          .start,
                                                                  children: [
                                                                Text(
                                                                    a['patient_name'] ??
                                                                        'Patient',
                                                                    style: const TextStyle(
                                                                        fontWeight:
                                                                            FontWeight
                                                                                .w700,
                                                                        fontSize:
                                                                            16)),
                                                                Text(
                                                                    'Appointment #${a['id'] ?? '—'}',
                                                                    style: const TextStyle(
                                                                        color: CareGuideColors
                                                                            .muted,
                                                                        fontSize:
                                                                            12))
                                                              ])),
                                                          CareGuideStatusBadge(
                                                              label: _titleCase(
                                                                  status),
                                                              tone: _statusTone(
                                                                  normalized))
                                                        ]),
                                                        const SizedBox(
                                                            height: 14),
                                                        Row(children: [
                                                          const Icon(
                                                              Icons.schedule,
                                                              size: 17,
                                                              color:
                                                                  CareGuideColors
                                                                      .teal),
                                                          const SizedBox(
                                                              width: 7),
                                                          Expanded(
                                                              child: Text(
                                                                  _appointmentDateTime(
                                                                      a),
                                                                  style: const TextStyle(
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .w600)))
                                                        ]),
                                                        if ((a['symptoms'] ??
                                                                '')
                                                            .toString()
                                                            .trim()
                                                            .isNotEmpty)
                                                          Padding(
                                                              padding:
                                                                  const EdgeInsets
                                                                      .only(
                                                                      top: 10),
                                                              child: Text(
                                                                  a['symptoms']
                                                                      .toString(),
                                                                  maxLines: 2,
                                                                  overflow:
                                                                      TextOverflow
                                                                          .ellipsis,
                                                                  style: const TextStyle(
                                                                      color: CareGuideColors
                                                                          .muted))),
                                                        const Divider(
                                                            height: 24),
                                                        Wrap(
                                                            spacing: 8,
                                                            runSpacing: 8,
                                                            children: [
                                                              if (normalized ==
                                                                  'pending')
                                                                FilledButton(
                                                                    onPressed: () =>
                                                                        _status(
                                                                            appointmentId,
                                                                            'accepted'),
                                                                    child: const Text(
                                                                        'Accept')),
                                                              if (normalized ==
                                                                      'accepted' ||
                                                                  normalized ==
                                                                      'confirmed')
                                                                OutlinedButton(
                                                                    onPressed: () =>
                                                                        _confirmReject(
                                                                            appointmentId),
                                                                    child: const Text(
                                                                        'Reject')),
                                                              if (normalized == 'pending' ||
                                                                  normalized ==
                                                                      'accepted' ||
                                                                  normalized ==
                                                                      'confirmed')
                                                                FilledButton
                                                                    .tonalIcon(
                                                                        onPressed:
                                                                            () async {
                                                                          final r =
                                                                              await ApiService.startDoctorConsultation(appointmentId);
                                                                          if (!context
                                                                              .mounted) {
                                                                            return;
                                                                          }
                                                                          if (r['success'] !=
                                                                              true) {
                                                                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r['message'] ?? 'Could not start consultation.')));
                                                                          }
                                                                          await _load();
                                                                        },
                                                                        icon: const Icon(Icons
                                                                            .play_arrow),
                                                                        label: const Text(
                                                                            'Start consultation')),
                                                              if (normalized ==
                                                                  'in_consultation')
                                                                FilledButton(
                                                                    onPressed: () =>
                                                                        _status(
                                                                            appointmentId,
                                                                            'completed'),
                                                                    child: const Text(
                                                                        'Complete consultation')),
                                                              OutlinedButton.icon(
                                                                  onPressed: () =>
                                                                      _viewPatient(
                                                                          appointmentId),
                                                                  icon: const Icon(
                                                                      Icons
                                                                          .person_outline),
                                                                  label: const Text(
                                                                      'Patient record')),
                                                              OutlinedButton.icon(
                                                                  onPressed: () =>
                                                                      _report(
                                                                          appointmentId),
                                                                  icon: const Icon(
                                                                      Icons
                                                                          .note_add_outlined),
                                                                  label: const Text(
                                                                      'Report')),
                                                              OutlinedButton.icon(
                                                                  onPressed: () =>
                                                                      _prescription(
                                                                          appointmentId),
                                                                  icon: const Icon(
                                                                      Icons
                                                                          .medication_outlined),
                                                                  label: const Text(
                                                                      'Prescription')),
                                                            ]),
                                                      ]))));
                                    }).toList())),
                          const SizedBox(height: 16),
                        ],
                      ),
                    ),
                  ),
      );
    });
  }

  String _initials(dynamic name) {
    final parts = (name ?? '')
        .toString()
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    return parts.isEmpty
        ? 'DR'
        : parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  String _todayLabel() {
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
    const weekdays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ];
    return '${weekdays[d.weekday - 1]}, ${months[d.month - 1]} ${d.day}, ${d.year}';
  }

  String _emptyAppointmentMessage() => _appointmentFilter == 'Today'
      ? 'No appointments scheduled for today'
      : 'No ${_appointmentFilter.toLowerCase()} appointments';
  String _appointmentDateTime(Map a) {
    final raw = a['appointment_date']?.toString() ?? '';
    var date = DateTime.tryParse(raw);
    if (date != null && raw.contains('T')) date = date.toLocal();
    final time = a['appointment_time']?.toString() ?? '';
    final parsedTime = DateTime.tryParse('1970-01-01T$time');
    final resolved = date ?? parsedTime;
    if (resolved == null) {
      return [raw, time].where((v) => v.isNotEmpty).join(' · ');
    }
    final dateLabel = '${resolved.day}/${resolved.month}/${resolved.year}';
    if (parsedTime == null) return dateLabel;
    final tod = TimeOfDay(hour: parsedTime.hour, minute: parsedTime.minute)
        .format(context);
    return '$dateLabel · $tod';
  }

  CareGuideStatusTone _statusTone(String status) => switch (status) {
        'pending' => CareGuideStatusTone.warning,
        'accepted' || 'confirmed' || 'completed' => CareGuideStatusTone.success,
        'in_consultation' => CareGuideStatusTone.info,
        'rejected' || 'cancelled' => CareGuideStatusTone.danger,
        _ => CareGuideStatusTone.neutral
      };

  int _countStatus(String status) => appointments
      .where((a) => (a['status'] ?? '').toString().toLowerCase() == status)
      .length;
  bool _isToday(dynamic raw) {
    final s = raw?.toString() ?? '';
    final d = DateTime.tryParse(s);
    final now = DateTime.now();
    return d != null &&
        d.year == now.year &&
        d.month == now.month &&
        d.day == now.day;
  }

  String _titleCase(String value) => value
      .replaceAll('_', ' ')
      .split(' ')
      .map((part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
  Widget _metric(String label, int value, IconData icon, Color color) =>
      SizedBox(
          width: 200,
          child: Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                            color: color.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(12)),
                        child: Icon(icon, color: color)),
                    const SizedBox(width: 12),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text('$value',
                              style: const TextStyle(
                                  fontSize: 25, fontWeight: FontWeight.w700)),
                          Text(label,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: CareGuideColors.muted, fontSize: 12))
                        ]))
                  ]))));

  Future<void> _confirmReject(int appointmentId) async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('Reject appointment?'),
                content: const Text(
                    'The patient will be notified that this appointment was rejected.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('Keep appointment')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('Reject'))
                ]));
    if (ok == true) await _status(appointmentId, 'rejected');
  }

  List<Widget> _scheduleLines() {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];
    String display(Object? raw) {
      final parts = raw.toString().split(':');
      final hour = int.tryParse(parts.first) ?? 0;
      final minute = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
      return TimeOfDay(hour: hour, minute: minute).format(context);
    }

    return schedule.map((raw) {
      final item = Map<String, dynamic>.from(raw as Map);
      final weekday =
          item['weekday'] is num ? (item['weekday'] as num).toInt() : 0;
      return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
              color: CareGuideColors.canvas,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE2E8F0))),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(days[weekday.clamp(0, 6).toInt()].substring(0, 3),
                style: const TextStyle(
                    fontSize: 11, color: CareGuideColors.muted)),
            Text('${display(item['start_time'])}–${display(item['end_time'])}',
                style:
                    const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
            Text('${item['slot_duration_minutes'] ?? '—'} min slots',
                style:
                    const TextStyle(fontSize: 10, color: CareGuideColors.muted))
          ]));
    }).toList();
  }

  Future<void> _viewPatient(int appointmentId) async {
    final result = await ApiService.getDoctorConsultationContext(appointmentId);
    if (!mounted) return;
    if (result['success'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(result['message'] ?? 'Unable to load patient')));
      return;
    }
    final data = Map<String, dynamic>.from(result['data'] as Map);
    final appointment = Map<String, dynamic>.from(data['appointment'] as Map);
    final records = (data['records'] as List? ?? []);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: .78,
          builder: (_, controller) => ListView(
            controller: controller,
            padding: const EdgeInsets.all(20),
            children: [
              Text(appointment['patient_name'] ?? 'Patient',
                  style: Theme.of(context).textTheme.headlineSmall),
              Text(
                  'Appointment: ${appointment['appointment_date']} at ${appointment['appointment_time']}'),
              if ((appointment['symptoms'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Reason: ${appointment['symptoms']}'),
              ],
              const SizedBox(height: 16),
              const Text('Health profile',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              Text(
                  'Blood group: ${appointment['blood_group'] ?? 'Not recorded'}'),
              Text('Allergies: ${appointment['allergies'] ?? 'Not recorded'}'),
              Text(
                  'Conditions: ${appointment['chronic_conditions'] ?? 'Not recorded'}'),
              Text(
                  'Current medicines: ${appointment['current_medications'] ?? 'Not recorded'}'),
              const SizedBox(height: 16),
              const Text('Published medical records',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              if (records.isEmpty)
                const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text('No published health records available.')),
              ...records.map((raw) {
                final record = Map<String, dynamic>.from(raw as Map);
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.description_outlined),
                  title: Text(record['title'] ?? 'Health record'),
                  subtitle: Text(
                      '${record['record_type']} · ${record['record_date']}'),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _report(int appointmentId) async {
    final symptoms = TextEditingController();
    final diagnosis = TextEditingController();
    final observations = TextEditingController();
    final treatment = TextEditingController();
    final advice = TextEditingController();
    final followUp = TextEditingController();
    final notes = TextEditingController();
    Map<String, dynamic> report() => {
          'symptoms': symptoms.text.trim(),
          'diagnosis': diagnosis.text.trim(),
          'clinical_observations': observations.text.trim(),
          'treatment': treatment.text.trim(),
          'advice': advice.text.trim(),
          'follow_up_date':
              followUp.text.trim().isEmpty ? null : followUp.text.trim(),
          'notes': notes.text.trim(),
        };
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clinical report'),
        content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
              controller: symptoms,
              decoration: const InputDecoration(
                  labelText: 'Chief complaint / symptoms')),
          TextField(
              controller: diagnosis,
              decoration: const InputDecoration(labelText: 'Diagnosis')),
          TextField(
              controller: observations,
              decoration: const InputDecoration(labelText: 'Observations')),
          TextField(
              controller: treatment,
              decoration: const InputDecoration(labelText: 'Treatment')),
          TextField(
              controller: advice,
              decoration: const InputDecoration(labelText: 'Advice')),
          TextField(
              controller: followUp,
              decoration: const InputDecoration(
                  labelText: 'Follow-up date (YYYY-MM-DD)')),
          TextField(
              controller: notes,
              decoration: const InputDecoration(labelText: 'Additional notes')),
        ])),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () async {
                if (diagnosis.text.trim().isEmpty) {
                  ScaffoldMessenger.of(this.context).showSnackBar(
                      const SnackBar(
                          content: Text('Enter a diagnosis before saving.')));
                  return;
                }
                final result =
                    await ApiService.saveDoctorReport(appointmentId, report());
                if (!context.mounted) return;
                if (result['success'] == true) {
                  Navigator.pop(context);
                  if (mounted) await _load();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content:
                          Text(result['message'] ?? 'Could not save report.')));
                }
              },
              child: const Text('Save draft')),
          ElevatedButton(
              onPressed: () async {
                if (diagnosis.text.trim().isEmpty) {
                  ScaffoldMessenger.of(this.context).showSnackBar(
                      const SnackBar(
                          content:
                              Text('Enter a diagnosis before publishing.')));
                  return;
                }
                final give = await showDialog<bool>(
                    context: context,
                    builder: (c) => AlertDialog(
                            title: const Text('Give report to patient?'),
                            content: const Text(
                                'The final report will become visible in the patient’s medical records.'),
                            actions: [
                              TextButton(
                                  onPressed: () => Navigator.pop(c, false),
                                  child: const Text('Cancel')),
                              ElevatedButton(
                                  onPressed: () => Navigator.pop(c, true),
                                  child: const Text('Confirm & give'))
                            ]));
                if (!context.mounted || give != true) return;
                final result = await ApiService.saveDoctorReport(
                    appointmentId, report(),
                    publish: true);
                if (!context.mounted) return;
                if (result['success'] == true) {
                  Navigator.pop(context);
                  if (mounted) {
                    ScaffoldMessenger.of(this.context).showSnackBar(
                        const SnackBar(
                            content: Text('Report given to patient')));
                    await _load();
                  }
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(
                          result['message'] ?? 'Could not publish report.')));
                }
              },
              child: const Text('Give report'))
        ],
      ),
    );
    symptoms.dispose();
    diagnosis.dispose();
    observations.dispose();
    treatment.dispose();
    advice.dispose();
    followUp.dispose();
    notes.dispose();
  }

  Future<void> _prescription(int appointmentId) async {
    final medicine = TextEditingController();
    final dosage = TextEditingController();
    final frequency = TextEditingController();
    final duration = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Digital prescription'),
        content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
              controller: medicine,
              decoration: const InputDecoration(labelText: 'Medicine')),
          TextField(
              controller: dosage,
              decoration: const InputDecoration(labelText: 'Dosage')),
          TextField(
              controller: frequency,
              decoration: const InputDecoration(labelText: 'Frequency')),
          TextField(
              controller: duration,
              decoration: const InputDecoration(labelText: 'Duration')),
        ])),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () async {
                final result =
                    await ApiService.saveDoctorPrescription(appointmentId, [
                  {
                    'medicine': medicine.text,
                    'dosage': dosage.text,
                    'frequency': frequency.text,
                    'duration': duration.text
                  }
                ]);
                if (context.mounted) Navigator.pop(context);
                if (result['success'] == true) _load();
              },
              child: const Text('Save draft')),
          ElevatedButton(
              onPressed: () async {
                final give = await showDialog<bool>(
                    context: context,
                    builder: (c) => AlertDialog(
                            title: const Text('Give prescription to patient?'),
                            content: const Text(
                                'The final prescription will be available in the patient’s medical records.'),
                            actions: [
                              TextButton(
                                  onPressed: () => Navigator.pop(c, false),
                                  child: const Text('Cancel')),
                              ElevatedButton(
                                  onPressed: () => Navigator.pop(c, true),
                                  child: const Text('Confirm & give'))
                            ]));
                if (give != true) return;
                final result = await ApiService.saveDoctorPrescription(
                    appointmentId,
                    [
                      {
                        'medicine': medicine.text,
                        'dosage': dosage.text,
                        'frequency': frequency.text,
                        'duration': duration.text
                      }
                    ],
                    publish: true);
                if (context.mounted) Navigator.pop(context);
                if (result['success'] == true && mounted) {
                  ScaffoldMessenger.of(this.context).showSnackBar(
                      const SnackBar(
                          content: Text('Prescription given to patient')));
                }
                _load();
              },
              child: const Text('Give prescription'))
        ],
      ),
    );
    medicine.dispose();
    dosage.dispose();
    frequency.dispose();
    duration.dispose();
  }
}
