// lib/screens/hospital/hospital_staff_management.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

class HospitalStaffManagement extends StatefulWidget {
  const HospitalStaffManagement({super.key});

  @override
  State<HospitalStaffManagement> createState() =>
      _HospitalStaffManagementState();
}

class _AppointmentAvailabilityDialog extends StatefulWidget {
  const _AppointmentAvailabilityDialog({
    required this.doctorId,
    required this.doctorName,
  });

  final int doctorId;
  final String doctorName;

  @override
  State<_AppointmentAvailabilityDialog> createState() =>
      _AppointmentAvailabilityDialogState();
}

class _AppointmentAvailabilityDialogState
    extends State<_AppointmentAvailabilityDialog> {
  static const _days = <String>[
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  final Map<int, List<_WorkingPeriod>> _periodsByDay = {
    for (var day = 0; day < 7; day++) day: <_WorkingPeriod>[],
  };
  int _slotDuration = 30;
  bool _loading = true;
  bool _saving = false;
  String? _loadError;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    _loadSchedule();
  }

  Future<void> _loadSchedule() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    debugPrint('[AVAILABILITY] Loading schedule doctorId=${widget.doctorId}');
    try {
      final response =
          await ApiService.getHospitalDoctorSchedule(widget.doctorId);
      if (!mounted) return;
      if (response['success'] != true) {
        setState(() {
          _loadError =
              response['message'] ?? 'Unable to load appointment availability.';
          _loading = false;
        });
        return;
      }
      final schedules =
          List<Map<String, dynamic>>.from(response['schedules'] ?? []);
      final parsed = <int, List<_WorkingPeriod>>{
        for (var day = 0; day < 7; day++) day: <_WorkingPeriod>[],
      };
      for (final schedule in schedules) {
        final weekday = schedule['weekday'] is num
            ? (schedule['weekday'] as num).toInt()
            : int.tryParse('${schedule['weekday']}');
        final start = _parseTime('${schedule['start_time'] ?? ''}');
        final end = _parseTime('${schedule['end_time'] ?? ''}');
        if (weekday == null ||
            weekday < 0 ||
            weekday > 6 ||
            start == null ||
            end == null) {
          debugPrint(
              '[AVAILABILITY] Ignoring malformed schedule row: $schedule');
          continue;
        }
        parsed[weekday]!.add(_WorkingPeriod(start, end));
        final duration = schedule['slot_duration_minutes'];
        final parsedDuration =
            duration is num ? duration.toInt() : int.tryParse('$duration');
        if (parsedDuration != null && parsedDuration > 0) {
          _slotDuration = parsedDuration;
        }
      }
      for (final periods in parsed.values) {
        periods.sort((a, b) => _minutes(a.start).compareTo(_minutes(b.start)));
      }
      setState(() {
        _periodsByDay
          ..clear()
          ..addAll(parsed);
        _loading = false;
      });
      debugPrint(
          '[AVAILABILITY] Parsed ${schedules.length} schedule rows for doctorId=${widget.doctorId}');
    } catch (error, stackTrace) {
      debugPrint(
          '[AVAILABILITY] Load exception doctorId=${widget.doctorId}: $error\n$stackTrace');
      if (!mounted) return;
      setState(() {
        _loadError = 'Unable to load appointment availability: $error';
        _loading = false;
      });
    }
  }

  TimeOfDay? _parseTime(String value) {
    final match = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(value);
    if (match == null) return null;
    final hour = int.tryParse(match.group(1)!);
    final minute = int.tryParse(match.group(2)!);
    if (hour == null || minute == null || hour > 23 || minute > 59) return null;
    return TimeOfDay(hour: hour, minute: minute);
  }

  int _minutes(TimeOfDay time) => time.hour * 60 + time.minute;

  String _apiTime(TimeOfDay time) =>
      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

  String _displayTime(TimeOfDay time) {
    final hour = time.hourOfPeriod == 0 ? 12 : time.hourOfPeriod;
    return '$hour:${time.minute.toString().padLeft(2, '0')} ${time.period == DayPeriod.am ? 'AM' : 'PM'}';
  }

  void _setDayEnabled(int day, bool enabled) {
    setState(() {
      _validationError = null;
      _periodsByDay[day] = enabled
          ? <_WorkingPeriod>[
              const _WorkingPeriod(
                  TimeOfDay(hour: 9, minute: 0), TimeOfDay(hour: 17, minute: 0))
            ]
          : <_WorkingPeriod>[];
    });
  }

  Future<void> _pickTime(int day, int periodIndex, bool isStart) async {
    final period = _periodsByDay[day]![periodIndex];
    final picked = await showTimePicker(
      context: context,
      initialTime: isStart ? period.start : period.end,
      helpText: isStart ? 'Select start time' : 'Select end time',
    );
    if (picked == null || !mounted) return;
    setState(() {
      _validationError = null;
      _periodsByDay[day]![periodIndex] = isStart
          ? _WorkingPeriod(picked, period.end)
          : _WorkingPeriod(period.start, picked);
    });
  }

  String? _validate() {
    final schedules = <Map<String, dynamic>>[];
    for (var day = 0; day < 7; day++) {
      final periods = _periodsByDay[day]!;
      final sorted = [...periods]
        ..sort((a, b) => _minutes(a.start).compareTo(_minutes(b.start)));
      for (var index = 0; index < sorted.length; index++) {
        final period = sorted[index];
        if (_minutes(period.end) <= _minutes(period.start)) {
          return 'End time must be after start time.';
        }
        if (_minutes(period.end) - _minutes(period.start) < _slotDuration) {
          return 'Slot duration must fit inside every working period.';
        }
        if (index > 0 &&
            _minutes(period.start) < _minutes(sorted[index - 1].end)) {
          return 'Working periods cannot overlap.';
        }
        schedules.add({
          'weekday': day,
          'start_time': _apiTime(period.start),
          'end_time': _apiTime(period.end),
          'slot_duration_minutes': _slotDuration,
          'is_active': true,
        });
      }
    }
    if (schedules.isEmpty) {
      return 'Enable at least one working period before saving.';
    }
    return null;
  }

  Future<void> _save() async {
    final validationError = _validate();
    if (validationError != null) {
      setState(() => _validationError = validationError);
      return;
    }
    final schedules = <Map<String, dynamic>>[];
    for (var day = 0; day < 7; day++) {
      for (final period in _periodsByDay[day]!) {
        schedules.add({
          'weekday': day,
          'start_time': _apiTime(period.start),
          'end_time': _apiTime(period.end),
          'slot_duration_minutes': _slotDuration,
          'is_active': true,
        });
      }
    }
    setState(() {
      _saving = true;
      _validationError = null;
    });
    debugPrint(
        '[AVAILABILITY] Saving doctorId=${widget.doctorId}, schedules=$schedules');
    try {
      final response = await ApiService.saveHospitalDoctorSchedule(
          widget.doctorId, schedules);
      if (!mounted) return;
      if (response['success'] == true) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Appointment availability saved.'),
          backgroundColor: AppColors.success,
        ));
      } else {
        setState(() {
          _saving = false;
          _validationError =
              response['message'] ?? 'Unable to save appointment availability.';
        });
      }
    } catch (error, stackTrace) {
      debugPrint(
          '[AVAILABILITY] Save exception doctorId=${widget.doctorId}: $error\n$stackTrace');
      if (!mounted) return;
      setState(() {
        _saving = false;
        _validationError = 'Unable to save appointment availability: $error';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Appointment availability: ${widget.doctorName}'),
      content: SizedBox(
        // A concrete size prevents AlertDialog's intrinsic layout from
        // collapsing a loading/error body to a blank modal on web/desktop.
        width: 520,
        height: 520,
        child: _loading
            ? const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 16),
                    Text('Loading appointment availability...'),
                  ],
                ),
              )
            : _loadError != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline,
                            color: AppColors.error, size: 42),
                        const SizedBox(height: 12),
                        Text(_loadError!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        ElevatedButton(
                            onPressed: _loadSchedule,
                            child: const Text('Retry')),
                      ],
                    ),
                  )
                : _buildEditor(),
      ),
      actions: _loading || _loadError != null
          ? [
              TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Close'))
            ]
          : [
              TextButton(
                  onPressed: _saving ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel')),
              ElevatedButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Save availability')),
            ],
    );
  }

  Widget _buildEditor() {
    return SingleChildScrollView(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(widget.doctorName,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Doctor ID: ${widget.doctorId}',
            style: const TextStyle(color: Colors.grey, fontSize: 12)),
        const SizedBox(height: 16),
        DropdownButtonFormField<int>(
          initialValue: _slotDuration,
          decoration: const InputDecoration(
              labelText: 'Appointment slot duration',
              suffixText: 'minutes',
              border: OutlineInputBorder()),
          items: [10, 15, 20, 30, 45, 60]
              .map((value) =>
                  DropdownMenuItem(value: value, child: Text('$value')))
              .toList(),
          onChanged: _saving
              ? null
              : (value) => setState(() {
                    _slotDuration = value!;
                    _validationError = null;
                  }),
        ),
        if (_validationError != null) ...[
          const SizedBox(height: 12),
          Text(_validationError!,
              style: const TextStyle(color: AppColors.error))
        ],
        const SizedBox(height: 12),
        ...List.generate(7, _buildDayEditor),
      ]),
    );
  }

  Widget _buildDayEditor(int day) {
    final periods = _periodsByDay[day]!;
    final enabled = periods.isNotEmpty;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_days[day]),
            subtitle: Text(enabled ? 'ON' : 'OFF'),
            value: enabled,
            onChanged: _saving ? null : (value) => _setDayEnabled(day, value),
          ),
          if (enabled) ...[
            ...List.generate(periods.length, (index) {
              final period = periods[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  Expanded(
                      child: OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _pickTime(day, index, true),
                          icon: const Icon(Icons.schedule),
                          label: Text(_displayTime(period.start)))),
                  const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 6),
                      child: Text('to')),
                  Expanded(
                      child: OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _pickTime(day, index, false),
                          icon: const Icon(Icons.schedule),
                          label: Text(_displayTime(period.end)))),
                  if (periods.length > 1)
                    IconButton(
                        onPressed: _saving
                            ? null
                            : () => setState(() => periods.removeAt(index)),
                        icon: const Icon(Icons.remove_circle_outline),
                        tooltip: 'Remove working period'),
                ]),
              );
            }),
            Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                    onPressed: _saving
                        ? null
                        : () => setState(() => periods.add(const _WorkingPeriod(
                            TimeOfDay(hour: 9, minute: 0),
                            TimeOfDay(hour: 17, minute: 0)))),
                    icon: const Icon(Icons.add),
                    label: const Text('Add working period'))),
          ],
        ]),
      ),
    );
  }
}

class _WorkingPeriod {
  const _WorkingPeriod(this.start, this.end);

  final TimeOfDay start;
  final TimeOfDay end;
}

class _HospitalStaffManagementState extends State<HospitalStaffManagement> {
  List<Map<String, dynamic>> _staff = [];
  bool _isLoading = true;
  bool _staffLoadStarted = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // The access token and hospital user are restored asynchronously. Waiting
    // for the authenticated hospital session avoids sending the first request
    // before those credentials are available.
    final auth = context.watch<AuthProvider>();
    if (!_staffLoadStarted &&
        auth.isAuthenticated &&
        auth.currentUser?.userType == 'hospital') {
      _staffLoadStarted = true;
      _loadData();
    }
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final staffResponse = await ApiService.getHospitalStaff();
      if (!mounted) return;
      if (staffResponse['success'] == true) {
        final rawStaff = staffResponse['data'] ??
            staffResponse['staff'] ??
            staffResponse['doctors'] ??
            const <dynamic>[];
        if (rawStaff is! List) {
          setState(() {
            _errorMessage = 'Received an invalid staff list from the server.';
          });
          return;
        }
        setState(() {
          _staff = rawStaff
              .whereType<Map>()
              .map((staff) => Map<String, dynamic>.from(staff))
              .toList();
        });
        debugPrint('[STAFF] Loaded ${_staff.length} staff members.');
      } else {
        setState(() =>
            _errorMessage = staffResponse['message'] ?? 'Failed to load staff');
      }
    } catch (e, stackTrace) {
      debugPrint('[STAFF] Load failed: $e\n$stackTrace');
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Unable to load staff. Please try again.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Staff Management'),
          backgroundColor: const Color(0xFF142D4E),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚Â¥ Staff', icon: Icon(Icons.people)),
              Tab(
                  text: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹ Activity',
                  icon: Icon(Icons.history)),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _showAddStaffDialog(context),
              tooltip: 'Add Staff',
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadData,
            ),
          ],
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _errorMessage != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline,
                            size: 64, color: AppColors.error),
                        const SizedBox(height: 16),
                        Text(_errorMessage!),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadData,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : TabBarView(
                    children: [
                      _buildStaffList(),
                      _buildActivityLog(),
                    ],
                  ),
      ),
    );
  }

  Widget _buildStaffList() {
    if (_staff.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No staff members added yet'),
            Text('Add staff to manage your hospital team'),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _staff.length,
      itemBuilder: (context, index) {
        final staff = _staff[index];
        return _buildStaffCard(staff);
      },
    );
  }

  Widget _buildStaffCard(Map<String, dynamic> staff) {
    final role = staff['role'] ?? 'staff';
    final isActive =
        staff['account_status'] == null || staff['account_status'] == 'ACTIVE';
    final isDoctor = role == 'doctor';

    Color roleColor;
    switch (role) {
      case 'hospital_admin':
        roleColor = AppColors.error;
        break;
      case 'doctor':
        roleColor = AppColors.primary;
        break;
      case 'nurse':
        roleColor = AppColors.success;
        break;
      case 'receptionist':
        roleColor = AppColors.warning;
        break;
      default:
        roleColor = Colors.grey;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 25,
                  backgroundColor: roleColor.withValues(alpha: 0.1),
                  child: Icon(
                    role == 'doctor'
                        ? Icons.medical_services
                        : role == 'nurse'
                            ? Icons.health_and_safety
                            : role == 'receptionist'
                                ? Icons.receipt_long
                                : Icons.person,
                    color: roleColor,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        staff['name'] ?? 'Unknown',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        staff['email'] ?? 'No email',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                      Text(
                        staff['hospital_role'] ?? role,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: roleColor,
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isActive
                            ? AppColors.success.withValues(alpha: 0.1)
                            : AppColors.error.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        isActive ? 'Account Active' : 'Account Disabled',
                        style: TextStyle(
                          fontSize: 10,
                          color: isActive ? AppColors.success : AppColors.error,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (role != 'hospital_admin' && role != 'super_admin')
                      Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit, size: 18),
                            onPressed: () =>
                                _showEditRoleDialog(context, staff),
                            constraints: const BoxConstraints(),
                          ),
                          IconButton(
                            icon: const Icon(Icons.key, size: 18),
                            tooltip: 'Reset password',
                            onPressed: () =>
                                _showResetPasswordDialog(context, staff),
                            constraints: const BoxConstraints(),
                          ),
                          if (isDoctor)
                            IconButton(
                              icon: const Icon(Icons.calendar_month, size: 18),
                              tooltip: staff['doctor_id'] == null
                                  ? 'This staff account is not linked to a doctor record'
                                  : 'Appointment availability',
                              onPressed: staff['doctor_id'] == null
                                  ? null
                                  : () => _showAppointmentAvailability(staff),
                              constraints: const BoxConstraints(),
                            ),
                          IconButton(
                            icon: const Icon(Icons.delete, size: 18),
                            onPressed: () => _deleteStaff(staff['id']),
                            constraints: const BoxConstraints(),
                            color: AppColors.error,
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ),
            if (isDoctor) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (staff['specialization'] != null)
                    _buildChip('Specialization', staff['specialization']),
                  if (staff['experience_years'] != null)
                    _buildChip(
                        'Experience', '${staff['experience_years']} years'),
                  if (staff['qualification'] != null)
                    _buildChip('Qualification', staff['qualification']),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildChip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$label: ',
            style: TextStyle(fontSize: 11, color: Colors.grey[600]),
          ),
          Text(
            value,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityLog() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.history, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text('Activity log coming soon'),
          Text('Track all staff actions here'),
        ],
      ),
    );
  }

  void _showAddStaffDialog(BuildContext context) {
    final nameController = TextEditingController();
    final emailController = TextEditingController();
    final phoneController = TextEditingController();
    final passwordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    String selectedRole = 'doctor';
    String selectedDepartment = 'Cardiology';
    final qualificationController = TextEditingController();
    final experienceController = TextEditingController();
    bool passwordVisible = false;
    bool confirmPasswordVisible = false;

    final List<String> roles = [
      'doctor',
      'nurse',
      'receptionist',
      'lab_technician',
      'pharmacist'
    ];
    final List<String> departments = [
      'Cardiology',
      'Neurology',
      'Orthopedics',
      'Pediatrics',
      'Gynecology',
      'Ophthalmology',
      'ENT',
      'Dermatology',
      'Psychiatry',
      'Oncology',
      'Nephrology',
      'Urology',
      'Gastroenterology',
      'Pulmonology',
      'Radiology',
      'Pathology',
      'Emergency',
      'ICU',
      'Operation Theater',
      'Pharmacy'
    ];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add Staff Member'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Full Name *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailController,
                  decoration: const InputDecoration(
                    labelText: 'Login Email / Username *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.email),
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneController,
                  decoration: const InputDecoration(
                    labelText: 'Phone *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.phone),
                  ),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Account Credentials',
                        style: TextStyle(fontWeight: FontWeight.bold))),
                const SizedBox(height: 8),
                TextField(
                  controller: passwordController,
                  decoration: InputDecoration(
                    labelText: 'Password * (minimum 8 characters)',
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.lock),
                    suffixIcon: IconButton(
                        icon: Icon(passwordVisible
                            ? Icons.visibility_off
                            : Icons.visibility),
                        onPressed: () =>
                            setState(() => passwordVisible = !passwordVisible)),
                  ),
                  obscureText: !passwordVisible,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: confirmPasswordController,
                  decoration: InputDecoration(
                    labelText: 'Confirm Password *',
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                        icon: Icon(confirmPasswordVisible
                            ? Icons.visibility_off
                            : Icons.visibility),
                        onPressed: () => setState(() =>
                            confirmPasswordVisible = !confirmPasswordVisible)),
                  ),
                  obscureText: !confirmPasswordVisible,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedRole,
                  decoration: const InputDecoration(
                    labelText: 'Role *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.work),
                  ),
                  items: roles.map((role) {
                    return DropdownMenuItem(
                      value: role,
                      child: Row(
                        children: [
                          Icon(
                            role == 'doctor'
                                ? Icons.medical_services
                                : role == 'nurse'
                                    ? Icons.health_and_safety
                                    : role == 'receptionist'
                                        ? Icons.receipt_long
                                        : Icons.person,
                            size: 16,
                            color: AppColors.primary,
                          ),
                          const SizedBox(width: 8),
                          Text(role.toUpperCase()),
                        ],
                      ),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => selectedRole = value!),
                ),
                const SizedBox(height: 12),
                if (selectedRole == 'doctor') ...[
                  DropdownButtonFormField<String>(
                    initialValue: selectedDepartment,
                    decoration: const InputDecoration(
                      labelText: 'Department',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.business),
                    ),
                    items: departments.map((dept) {
                      return DropdownMenuItem(
                        value: dept,
                        child: Text(dept),
                      );
                    }).toList(),
                    onChanged: (value) =>
                        setState(() => selectedDepartment = value!),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: qualificationController,
                    decoration: const InputDecoration(
                      labelText: 'Qualification',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.school),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: experienceController,
                    decoration: const InputDecoration(
                      labelText: 'Experience (Years)',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.timer),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (nameController.text.isEmpty ||
                    emailController.text.isEmpty ||
                    phoneController.text.isEmpty ||
                    passwordController.text.isEmpty ||
                    confirmPasswordController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please fill all required fields'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                  return;
                }
                if (passwordController.text.length < 8) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content:
                          Text('Password must contain at least 8 characters.'),
                      backgroundColor: AppColors.error));
                  return;
                }
                if (passwordController.text != confirmPasswordController.text) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('Passwords do not match.'),
                      backgroundColor: AppColors.error));
                  return;
                }

                Navigator.pop(context);

                final staffData = {
                  'name': nameController.text,
                  'email': emailController.text,
                  'phone': phoneController.text,
                  'password': passwordController.text,
                  'role': selectedRole,
                  'department': selectedDepartment,
                  'qualifications': qualificationController.text,
                  'experience_years':
                      int.tryParse(experienceController.text) ?? 0,
                };

                final response = await ApiService.createStaffUser(staffData);

                if (response['success'] && mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content:
                          Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Staff added successfully'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  _loadData();
                } else if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content:
                          Text(response['message'] ?? 'Failed to add staff'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF142D4E),
              ),
              child: const Text('Add Staff'),
            ),
          ],
        ),
      ),
    );
  }

  void _showAppointmentAvailability(Map<String, dynamic> staff) {
    final rawDoctorId = staff['doctor_id'];
    final doctorId =
        rawDoctorId is num ? rawDoctorId.toInt() : int.tryParse('$rawDoctorId');
    if (doctorId == null) {
      debugPrint(
          '[AVAILABILITY] Refused to open: missing doctor_id for staff=${staff['id']}');
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('This staff account is not linked to a doctor record.'),
        backgroundColor: AppColors.error,
      ));
      return;
    }
    debugPrint(
        '[AVAILABILITY] Opening dialog doctorId=$doctorId staffId=${staff['id']}');
    showDialog<void>(
      context: context,
      builder: (_) => _AppointmentAvailabilityDialog(
        doctorId: doctorId,
        doctorName: '${staff['name'] ?? 'Doctor'}',
      ),
    );
  }

  void _showResetPasswordDialog(
      BuildContext context, Map<String, dynamic> staff) {
    final password = TextEditingController();
    final confirmation = TextEditingController();
    bool showPassword = false;
    bool showConfirmation = false;
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text('Reset password — ${staff['name']}'),
          content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text(
                'Set a new password. The existing password is never shown.'),
            const SizedBox(height: 12),
            TextField(
                controller: password,
                obscureText: !showPassword,
                decoration: InputDecoration(
                    labelText: 'New password',
                    prefixIcon: const Icon(Icons.lock),
                    suffixIcon: IconButton(
                        icon: Icon(showPassword
                            ? Icons.visibility_off
                            : Icons.visibility),
                        onPressed: () =>
                            setState(() => showPassword = !showPassword)))),
            const SizedBox(height: 12),
            TextField(
                controller: confirmation,
                obscureText: !showConfirmation,
                decoration: InputDecoration(
                    labelText: 'Confirm new password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                        icon: Icon(showConfirmation
                            ? Icons.visibility_off
                            : Icons.visibility),
                        onPressed: () => setState(
                            () => showConfirmation = !showConfirmation)))),
          ])),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel')),
            ElevatedButton(
                onPressed: () async {
                  if (password.text.length < 8) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text(
                            'Password must contain at least 8 characters.')));
                    return;
                  }
                  if (password.text != confirmation.text) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Passwords do not match.')));
                    return;
                  }
                  final rawUserId = staff['user_id'] ?? staff['id'];
                  final userId = rawUserId is num
                      ? rawUserId.toInt()
                      : int.tryParse('$rawUserId');
                  if (userId == null) {
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Staff account ID is unavailable.')));
                    return;
                  }
                  final result = await ApiService.resetStaffPassword(
                      userId, password.text);
                  if (!mounted) return;
                  final scaffoldMessenger = ScaffoldMessenger.of(this.context);
                  if (result['success'] == true) {
                    Navigator.of(this.context).pop();
                    scaffoldMessenger.showSnackBar(const SnackBar(
                        content: Text('Password reset successfully'),
                        backgroundColor: AppColors.success));
                  } else {
                    scaffoldMessenger.showSnackBar(SnackBar(
                        content: Text(
                            result['message'] ?? 'Unable to reset password')));
                  }
                },
                child: const Text('Reset password')),
          ],
        ),
      ),
    ).whenComplete(() {
      password.dispose();
      confirmation.dispose();
    });
  }

  void _showEditRoleDialog(BuildContext context, Map<String, dynamic> staff) {
    String selectedRole = staff['role'] ?? 'staff';

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Edit Role: ${staff['name']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              initialValue: selectedRole,
              decoration: const InputDecoration(
                labelText: 'Role',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.work),
              ),
              items: [
                'doctor',
                'nurse',
                'receptionist',
                'lab_technician',
                'pharmacist'
              ].map((role) {
                return DropdownMenuItem(
                  value: role,
                  child: Text(role.toUpperCase()),
                );
              }).toList(),
              onChanged: (value) => selectedRole = value!,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: AppColors.warning),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Changing role will update permissions',
                      style: TextStyle(fontSize: 12, color: AppColors.warning),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              final rawUserId = staff['user_id'] ?? staff['id'];
              final userId = rawUserId is num
                  ? rawUserId.toInt()
                  : int.tryParse('$rawUserId');
              if (userId == null) return;
              final response =
                  await ApiService.updateStaffRole(userId, selectedRole);

              if (response['success'] && mounted) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Role updated successfully'),
                    backgroundColor: AppColors.success,
                  ),
                );
                _loadData();
              }
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }

  void _deleteStaff(int staffId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Staff'),
        content:
            const Text('Are you sure you want to remove this staff member?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              final response = await ApiService.deleteStaffUser(staffId);

              if (response['success'] && mounted) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content:
                        Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Staff removed successfully'),
                    backgroundColor: AppColors.success,
                  ),
                );
                _loadData();
              } else if (mounted) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content:
                        Text(response['message'] ?? 'Failed to remove staff'),
                    backgroundColor: AppColors.error,
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}
