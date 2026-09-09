// lib/screens/hospital/hospital_home_screen.dart
import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:intl/intl.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:hospital_resource_management/screens/hospital/hospital_blood_bank.dart';
import 'package:hospital_resource_management/services/api_service.dart';
import 'package:hospital_resource_management/services/socket_service.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/hospital_provider.dart';
import 'hospital_resources.dart';
import 'hospital_staff.dart';
import 'hospital_ambulances.dart';
import 'hospital_resource_requests.dart';
import 'hospital_profile.dart';
import 'hospital_campaigns.dart';
import '../../widgets/app_ui.dart';
import '../../widgets/notification_center.dart';

class HospitalHomeScreen extends StatefulWidget {
  const HospitalHomeScreen({super.key});

  @override
  State<HospitalHomeScreen> createState() => _HospitalHomeScreenState();
}

class _HospitalHomeScreenState extends State<HospitalHomeScreen> {
  int _selectedIndex = 0;

  // Correct order of screens matching navigation items
  final List<Widget> _screens = [
    const HospitalDashboard(), // Index 0: Dashboard
    const HospitalResources(), // Index 1: Resources
    const HospitalAppointments(), // Index 2: Appointments
    const HospitalStaff(), // Index 3: Staff
    const HospitalAmbulances(), // Index 4: Ambulances
    const HospitalBloodBank(), // Index 5: Unified Blood Bank (Stock + Expiry + Requests)
    const HospitalCampaigns(), // Index 6: Camps
    const HospitalResourceRequests(), // Index 7: Requests (Blood + Resource requests)
    const HospitalProfile(), // Index 8: Profile
  ];

  // Method to navigate to a specific tab from anywhere
  void navigateToTab(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    const destinations = [
      NavigationRailDestination(
          icon: Icon(Icons.dashboard_outlined),
          selectedIcon: Icon(Icons.dashboard),
          label: Text('Dashboard')),
      NavigationRailDestination(
          icon: Icon(Icons.medical_services_outlined),
          selectedIcon: Icon(Icons.medical_services),
          label: Text('Resources')),
      NavigationRailDestination(
          icon: Icon(Icons.calendar_today_outlined),
          selectedIcon: Icon(Icons.calendar_today),
          label: Text('Appointments')),
      NavigationRailDestination(
          icon: Icon(Icons.people_outline),
          selectedIcon: Icon(Icons.people),
          label: Text('Staff')),
      NavigationRailDestination(
          icon: Icon(Icons.local_taxi_outlined),
          selectedIcon: Icon(Icons.local_taxi),
          label: Text('Ambulances')),
      NavigationRailDestination(
          icon: Icon(Icons.bloodtype_outlined),
          selectedIcon: Icon(Icons.bloodtype),
          label: Text('Blood bank')),
      NavigationRailDestination(
          icon: Icon(Icons.campaign_outlined),
          selectedIcon: Icon(Icons.campaign),
          label: Text('Campaigns')),
      NavigationRailDestination(
          icon: Icon(Icons.request_page_outlined),
          selectedIcon: Icon(Icons.request_page),
          label: Text('Requests')),
      NavigationRailDestination(
          icon: Icon(Icons.business_outlined),
          selectedIcon: Icon(Icons.business),
          label: Text('Profile')),
    ];
    return LayoutBuilder(builder: (context, constraints) {
      final desktop = constraints.maxWidth >= 1000;
      return Scaffold(
        body: desktop
            ? Row(children: [
                NavigationRail(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: navigateToTab,
                  labelType: NavigationRailLabelType.all,
                  leading: const Padding(
                      padding: EdgeInsets.fromLTRB(8, 18, 8, 20),
                      child: Column(children: [
                        Icon(Icons.health_and_safety,
                            color: CareGuideColors.teal),
                        SizedBox(height: 6),
                        Text('CareGuide',
                            style: TextStyle(fontWeight: FontWeight.w800))
                      ])),
                  destinations: destinations,
                ),
                const VerticalDivider(width: 1),
                Expanded(child: _screens[_selectedIndex]),
              ])
            : _screens[_selectedIndex],
        bottomNavigationBar: desktop
            ? null
            : NavigationBar(
                selectedIndex: _selectedIndex,
                onDestinationSelected: (index) {
                  setState(() {
                    _selectedIndex = index;
                  });
                },
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.dashboard_outlined),
                    selectedIcon: Icon(Icons.dashboard),
                    label: 'Dashboard',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.medical_services_outlined),
                    selectedIcon: Icon(Icons.medical_services),
                    label: 'Resources',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.calendar_today_outlined),
                    selectedIcon: Icon(Icons.calendar_today),
                    label: 'Appointments',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.people_outline),
                    selectedIcon: Icon(Icons.people),
                    label: 'Staff',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.local_taxi_outlined),
                    selectedIcon: Icon(Icons.local_taxi),
                    label: 'Ambulances',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.bloodtype),
                    selectedIcon: Icon(Icons.bloodtype),
                    label: 'Blood Bank',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.campaign_outlined),
                    selectedIcon: Icon(Icons.campaign),
                    label: 'Camps',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.request_page_outlined),
                    selectedIcon: Icon(Icons.request_page),
                    label: 'Requests',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.business_outlined),
                    selectedIcon: Icon(Icons.business),
                    label: 'Profile',
                  ),
                ],
              ),
      );
    });
  }
}

// ==================== HOSPITAL DASHBOARD ====================
class HospitalDashboard extends StatefulWidget {
  const HospitalDashboard({super.key});

  @override
  State<HospitalDashboard> createState() => _HospitalDashboardState();
}

class _HospitalDashboardState extends State<HospitalDashboard> {
  Map<String, dynamic> _stats = {
    'total_patients': 0,
    'today_appointments': 0,
    'patients_waiting': 0,
    'doctors_available': 0,
    'doctors_busy': 0,
    'general_beds_available': 0,
    'general_beds_occupied': 0,
    'icu_beds_available': 0,
    'icu_beds_occupied': 0,
    'active_emergencies': 0,
    'ambulances_available': 0,
    'ambulances_total': 0,
    'pharmacy_stock_alerts': 0,
    'lab_pending_reports': 0,
    'blood_bank_total_units': 0,
    'revenue_today': 0,
  };
  bool _isLoading = true;
  bool _statsRequestInFlight = false;
  Map<String, dynamic>? _dailyQr;
  bool _dailyQrLoading = true;

  @override
  void initState() {
    super.initState();
    _loadStats();
    _loadDailyQr();
    _connectSocketListeners();
  }

  Future<void> _loadDailyQr() async {
    setState(() => _dailyQrLoading = true);
    final response = await ApiService.getTodayHospitalQr();
    if (!mounted) return;
    setState(() { _dailyQr = response['success'] == true && response['qr'] is Map ? Map<String, dynamic>.from(response['qr']) : null; _dailyQrLoading = false; });
  }

  Future<Uint8List?> _qrPng() async {
    final payload = _dailyQr?['payload'];
    if (payload is! String) return null;
    final image = await QrPainter(
      data: payload,
      version: QrVersions.auto,
      gapless: true,
      eyeStyle: const QrEyeStyle(color: Colors.black),
      dataModuleStyle: const QrDataModuleStyle(color: Colors.black),
    ).toImageData(900, format: ui.ImageByteFormat.png);
    return image?.buffer.asUint8List();
  }

  Future<pw.Document?> _qrDocument() async {
    final png = await _qrPng();
    if (png == null) return null;
    final doc = pw.Document();
    final date = _dailyQr?['date']?.toString() ?? '';
    doc.addPage(pw.Page(build: (_) => pw.Center(child: pw.Column(mainAxisSize: pw.MainAxisSize.min, children: [
      pw.Text('SCAN FOR TOKEN', style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)), pw.SizedBox(height: 18), pw.Image(pw.MemoryImage(png), width: 260, height: 260), pw.SizedBox(height: 14), pw.Text('Today\'s Queue QR • $date'), pw.Text('Scan using Smart Hospital App • Valid Today Only')
    ]))));
    return doc;
  }

  Future<void> _downloadQr() async { final doc = await _qrDocument(); if (doc != null) await Printing.sharePdf(bytes: await doc.save(), filename: 'hospital-daily-queue-qr.pdf'); }
  Future<void> _printQr() async { final doc = await _qrDocument(); if (doc != null) await Printing.layoutPdf(onLayout: (_) async => doc.save()); }

  Widget _dailyQrCard(String hospitalName) {
    if (_dailyQrLoading) return const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())));
    if (_dailyQr == null) return Card(child: ListTile(title: const Text('Daily patient queue QR unavailable'), subtitle: const Text('Check your connection and try again.'), trailing: IconButton(onPressed: _loadDailyQr, icon: const Icon(Icons.refresh))));
    final date = DateTime.tryParse(_dailyQr!['date']?.toString() ?? '');
    final label = date == null ? (_dailyQr!['date'] ?? '') : DateFormat('dd MMMM yyyy').format(date);
    return Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(children: [
      const Text('SCAN TO BOOK APPOINTMENT', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)), const SizedBox(height: 12),
      QrImageView(data: _dailyQr!['payload'] as String, size: 250, backgroundColor: Colors.white), const SizedBox(height: 12),
      Text(hospitalName, style: const TextStyle(fontWeight: FontWeight.bold)), Text('Today\'s QR • $label'), const SizedBox(height: 4),
      const Text('● Active until 11:59 PM', style: TextStyle(color: Colors.green, fontWeight: FontWeight.w600)), const Text('Patients can scan this QR to book an appointment.'), const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [OutlinedButton.icon(onPressed: _loadDailyQr, icon: const Icon(Icons.refresh), label: const Text('Refresh QR')), OutlinedButton.icon(onPressed: _downloadQr, icon: const Icon(Icons.download), label: const Text('Download QR')), FilledButton.icon(onPressed: _printQr, icon: const Icon(Icons.print), label: const Text('Print QR'))])
    ])));
  }

  Future<void> _connectSocketListeners() async {
    final socket = SocketService.instance;
    await socket.connect();
    if (!mounted) return;
    socket.onResourcesChanged((_) => _loadStats());
    void refreshEmergency(_) {
      _loadStats();
      Provider.of<HospitalProvider>(context, listen: false).loadHospitalData();
    }

    socket.onNewEmergency(refreshEmergency);
    socket.onEmergencyCreated(refreshEmergency);
    socket.onEmergencyLifecycle(refreshEmergency);
    socket.onAmbulanceBooking(refreshEmergency);
    socket.onDashboardStatsChanged((_) => _loadStats());
    socket.onBloodStockChanged((_) => _loadStats());
  }

  Future<void> _loadStats() async {
    if (!mounted || _statsRequestInFlight) return;
    _statsRequestInFlight = true;
    setState(() => _isLoading = true);

    try {
      final response = await ApiService.getHospitalDashboardStats();
      if (!mounted) return;
      if (response['success'] == true && response['data'] != null) {
        final data = response['data'];

        setState(() {
          _stats = {
            'total_patients': data['total_patients'] ?? 0,
            'today_appointments': data['today_appointments'] ?? 0,
            'patients_waiting': data['patients_waiting'] ?? 0,
            'doctors_available': data['doctors_available'] ?? 0,
            'doctors_busy': data['doctors_busy'] ?? 0,
            'general_beds_available': data['general_beds_available'] ?? 0,
            'general_beds_occupied': data['general_beds_occupied'] ?? 0,
            'icu_beds_available': data['icu_beds_available'] ?? 0,
            'icu_beds_occupied': data['icu_beds_occupied'] ?? 0,
            'active_emergencies': data['active_emergencies'] ?? 0,
            'ambulances_available': data['ambulances_available'] ?? 0,
            'ambulances_total': data['ambulances_total'] ?? 0,
            'pharmacy_stock_alerts': data['pharmacy_stock_alerts'] ?? 0,
            'lab_pending_reports': data['lab_pending_reports'] ?? 0,
            'blood_bank_total_units': data['blood_bank_total_units'] ?? 0,
            'revenue_today': data['revenue_statistics']?['today'] ?? 0,
          };
        });
      }
    } catch (e) {
      debugPrint('Error loading dashboard stats: $e');
    } finally {
      _statsRequestInFlight = false;
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _navigateToTab(int index) {
    final parentState =
        context.findAncestorStateOfType<_HospitalHomeScreenState>();
    if (parentState != null) {
      parentState.navigateToTab(index);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hospitalProvider = Provider.of<HospitalProvider>(context);
    final hospitalData = hospitalProvider.hospitalData;
    final authProvider = Provider.of<AuthProvider>(context);

    if (_isLoading || hospitalProvider.isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    // Count pending blood requests
    final pendingBloodRequests = hospitalProvider.bloodRequests
        .where((r) => r['status']?.toLowerCase() == 'pending')
        .length;

    // Count pending resource requests
    final pendingResourceRequests = hospitalProvider.resourceRequests
        .where((r) => r['status']?.toLowerCase() == 'pending')
        .length;

    // Total pending requests
    final totalPendingRequests = pendingBloodRequests + pendingResourceRequests;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hospital Dashboard'),
        actions: [
          const NotificationCenterButton(),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _loadStats();
              hospitalProvider.loadHospitalData();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _loadStats();
          await hospitalProvider.loadHospitalData();
        },
        child: CareGuidePage(
            child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Hospital Name Header
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                    color: CareGuideColors.navy,
                    borderRadius: BorderRadius.circular(20)),
                child: Row(children: [
                  const CircleAvatar(
                      radius: 24,
                      backgroundColor: Color(0x33FFFFFF),
                      child: Icon(Icons.local_hospital_outlined,
                          color: Colors.white)),
                  const SizedBox(width: 14),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(hospitalData?['name'] ?? 'Hospital operations',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 19,
                                fontWeight: FontWeight.w800)),
                        const SizedBox(height: 3),
                        Text(
                            'Operations dashboard • ${authProvider.currentUser?.name ?? 'Hospital team'}',
                            style: const TextStyle(
                                color: Color(0xFFD9F5F1), fontSize: 12)),
                      ])),
                  CareGuideStatusBadge(
                      label: '${_stats['active_emergencies']} active SOS',
                      tone: _stats['active_emergencies'] > 0
                          ? CareGuideStatusTone.danger
                          : CareGuideStatusTone.success),
                ]),
              ),
              const SizedBox(height: 20),

              _dailyQrCard(hospitalData?['name']?.toString() ?? 'Hospital'),
              const SizedBox(height: 20),

              // Metrics Grid - Row 1
              Row(
                children: [
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Total Patients',
                      value: _stats['total_patients'].toString(),
                      icon: Icons.people,
                      color: Colors.blue,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Beds Available',
                      value: _stats['general_beds_available'].toString(),
                      icon: Icons.king_bed,
                      color: Colors.green,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Metrics Grid - Row 2
              Row(
                children: [
                  Expanded(
                    child: _buildMetricCard(
                      title: 'ICU Available',
                      value: _stats['icu_beds_available'].toString(),
                      icon: Icons.local_hospital,
                      color: Colors.red,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Today\'s Appts',
                      value: _stats['today_appointments'].toString(),
                      icon: Icons.calendar_today,
                      color: Colors.orange,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Metrics Grid - Row 3
              Row(
                children: [
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Active Emergencies',
                      value: _stats['active_emergencies'].toString(),
                      icon: Icons.emergency,
                      color: Colors.redAccent,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Ambulances',
                      value:
                          '${_stats['ambulances_available']}/${_stats['ambulances_total']}',
                      icon: Icons.local_shipping,
                      color: Colors.teal,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Metrics Grid - Row 4
              Row(
                children: [
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Doctors Available',
                      value: _stats['doctors_available'].toString(),
                      icon: Icons.person,
                      color: Colors.indigo,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Blood Units',
                      value: _stats['blood_bank_total_units'].toString(),
                      icon: Icons.bloodtype,
                      color: Colors.pink,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Quick Actions Header
              const Text(
                'Quick Actions',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),

              // Quick Actions Grid
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionCard(
                      icon: Icons.medical_services,
                      title: 'Resources',
                      color: Colors.blue,
                      onTap: () => _navigateToTab(1), // Resources tab
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildQuickActionCard(
                      icon: Icons.bloodtype,
                      title: 'Blood Bank',
                      color: Colors.red,
                      onTap: () => _navigateToTab(5), // Blood Bank tab
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionCard(
                      icon: Icons.request_page,
                      title: 'Requests',
                      color: Colors.purple,
                      badge: totalPendingRequests > 0
                          ? totalPendingRequests
                          : null,
                      onTap: () => _navigateToTab(7), // Requests tab
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildQuickActionCard(
                      icon: Icons.calendar_today,
                      title: 'Appointments',
                      color: Colors.orange,
                      onTap: () => _navigateToTab(2), // Appointments tab
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Pending Requests Summary
              if (totalPendingRequests > 0)
                _buildPendingRequestsSummary(
                  pendingBloodRequests: pendingBloodRequests,
                  pendingResourceRequests: pendingResourceRequests,
                  totalPendingRequests: totalPendingRequests,
                ),

              const SizedBox(height: 16),

              // Recent Emergency Requests
              const Text(
                'Recent Emergency Requests',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              if (hospitalProvider.emergencies.isNotEmpty)
                ...hospitalProvider.emergencies.take(3).map((emergency) {
                  return _buildEmergencyCard(emergency, context);
                })
              else
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Center(child: Text('No emergency requests')),
                  ),
                ),
            ],
          ),
        )),
      ),
    );
  }

  Widget _buildMetricCard(
      {required String title,
      required String value,
      required IconData icon,
      required Color color}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: .18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: TextStyle(color: Colors.grey[600], fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionCard({
    required IconData icon,
    required String title,
    required Color color,
    required VoidCallback onTap,
    int? badge,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Stack(
              children: [
                Icon(icon, color: color, size: 32),
                if (badge != null && badge > 0)
                  Positioned(
                    right: -8,
                    top: -8,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(
                        minWidth: 20,
                        minHeight: 20,
                      ),
                      child: Text(
                        badge.toString(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: color, fontWeight: FontWeight.w600, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPendingRequestsSummary({
    required int pendingBloodRequests,
    required int pendingResourceRequests,
    required int totalPendingRequests,
  }) {
    return Card(
      color: Colors.orange.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.notifications_active, color: Colors.orange),
                const SizedBox(width: 8),
                Text(
                  '$totalPendingRequests Pending Request${totalPendingRequests > 1 ? 's' : ''}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: Colors.orange,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => _navigateToTab(7), // Requests tab
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          const Icon(Icons.bloodtype,
                              color: Colors.red, size: 24),
                          const SizedBox(height: 4),
                          Text(
                            '$pendingBloodRequests',
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Colors.red,
                            ),
                          ),
                          const Text(
                            'Blood Requests',
                            style: TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: InkWell(
                    onTap: () => _navigateToTab(7), // Requests tab
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          const Icon(Icons.medical_services,
                              color: Colors.purple, size: 24),
                          const SizedBox(height: 4),
                          Text(
                            '$pendingResourceRequests',
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Colors.purple,
                            ),
                          ),
                          const Text(
                            'Resource Requests',
                            style: TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmergencyCard(
      Map<String, dynamic> emergency, BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: Colors.red,
          child: Icon(Icons.emergency, color: Colors.white),
        ),
        title: Text(emergency['patient_name'] ?? 'Unknown Patient'),
        subtitle: Text(emergency['emergency_type'] ?? 'Medical Emergency'),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.red.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            emergency['status'] ?? 'Pending',
            style: const TextStyle(color: Colors.red, fontSize: 12),
          ),
        ),
        onTap: () => _showEmergencyDetails(context, emergency),
      ),
    );
  }

  void _showEmergencyDetails(
      BuildContext context, Map<String, dynamic> emergency) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Emergency: ${emergency['patient_name'] ?? 'Unknown'}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Type: ${emergency['emergency_type'] ?? 'Medical'}'),
            const SizedBox(height: 8),
            Text('Severity: ${emergency['severity'] ?? 'Unknown'}'),
            const SizedBox(height: 8),
            Text('Status: ${emergency['status'] ?? 'Pending'}'),
            const SizedBox(height: 8),
            Text(
                'Description: ${emergency['description'] ?? 'No description'}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
          ElevatedButton(
            onPressed: () async {
              final response = await ApiService.respondToSosDispatch(
                  emergency['id'], 'accept');
              if (!context.mounted) return;
              Navigator.pop(context);
              if (response['success']) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Emergency team notified')),
                );
                if (!context.mounted) return;
                Provider.of<HospitalProvider>(context, listen: false)
                    .loadHospitalData();
              }
            },
            child: const Text('Accept emergency'),
          ),
          TextButton(
            onPressed: () async {
              final response = await ApiService.respondToSosDispatch(emergency['id'], 'reject');
              if (!context.mounted) return;
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(response['success'] == true ? 'Emergency rejected; escalation continues.' : (response['message'] ?? 'Unable to reject emergency'))));
              if (response['success'] == true && context.mounted) Provider.of<HospitalProvider>(context, listen: false).loadHospitalData();
            },
            child: const Text('Reject'),
          ),
          const SizedBox(width: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.pop(context);
              _showAssignAmbulance(context, emergency);
            },
            icon: const Icon(Icons.local_taxi),
            label: const Text('Assign ambulance'),
          ),
        ],
      ),
    );
  }

  Future<void> _showAssignAmbulance(
      BuildContext context, Map<String, dynamic> emergency) async {
    final response = await ApiService.getHospitalAmbulances();
    if (!context.mounted) return;
    final ambulances = List<Map<String, dynamic>>.from(response['data'] ?? [])
        .where((a) => a['is_available'] == true && a['status'] == 'AVAILABLE')
        .toList();
    if (ambulances.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('No ambulance is currently available'),
          backgroundColor: Colors.red));
      return;
    }
    int selected = ambulances.first['id'] as int;
    await showDialog<void>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
            builder: (dialogContext, setDialogState) => AlertDialog(
                  title: const Text('Assign available ambulance'),
                  content: DropdownButtonFormField<int>(
                    initialValue: selected,
                    isExpanded: true,
                    items: ambulances
                        .map((a) => DropdownMenuItem<int>(
                            value: a['id'] as int,
                            child: Text(
                                '${a['vehicle_number']} • ${a['type'] ?? 'Ambulance'}')))
                        .toList(),
                    onChanged: (value) {
                      if (value != null) setDialogState(() => selected = value);
                    },
                  ),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        child: const Text('Cancel')),
                    ElevatedButton(
                        onPressed: () async {
                          final result =
                              await ApiService.assignEmergencyAmbulance(
                                  emergency['id'] as int, selected);
                          if (!dialogContext.mounted) return;
                          if (result['success'] == true) {
                            Navigator.pop(dialogContext);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text('Ambulance assigned'),
                                      backgroundColor: Colors.green));
                            }
                            if (context.mounted) {
                              Provider.of<HospitalProvider>(context,
                                      listen: false)
                                  .loadHospitalData();
                            }
                          } else {
                            ScaffoldMessenger.of(dialogContext).showSnackBar(
                                SnackBar(
                                    content: Text(result['message'] ??
                                        'Could not assign ambulance'),
                                    backgroundColor: Colors.red));
                          }
                        },
                        child: const Text('Assign'))
                  ],
                )));
  }
}

// ==================== HOSPITAL APPOINTMENTS ====================
class HospitalAppointments extends StatefulWidget {
  const HospitalAppointments({super.key});

  @override
  State<HospitalAppointments> createState() => _HospitalAppointmentsState();
}

class _HospitalAppointmentsState extends State<HospitalAppointments> {
  String _selectedFilter = 'all';
  final List<String> _filters = [
    'all',
    'pending',
    'confirmed',
    'completed',
    'cancelled'
  ];

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<HospitalProvider>(context);
    final allAppointments = provider.appointments;

    final filteredAppointments = _selectedFilter == 'all'
        ? allAppointments
        : allAppointments
            .where((a) => (a['status'] ?? '').toLowerCase() == _selectedFilter)
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Appointments'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => provider.loadHospitalData(),
          ),
        ],
      ),
      body: provider.isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Container(
                  height: 50,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    itemCount: _filters.length,
                    itemBuilder: (context, index) {
                      final filter = _filters[index];
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          label: Text(filter.toUpperCase()),
                          selected: _selectedFilter == filter,
                          onSelected: (selected) {
                            setState(() => _selectedFilter = filter);
                          },
                          selectedColor:
                              const Color(0xFF0A4D68).withValues(alpha: 0.2),
                        ),
                      );
                    },
                  ),
                ),
                Expanded(
                  child: filteredAppointments.isEmpty
                      ? const Center(child: Text('No appointments found'))
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: filteredAppointments.length,
                          itemBuilder: (context, index) {
                            final appointment = filteredAppointments[index];
                            return _buildAppointmentCard(appointment, provider);
                          },
                        ),
                ),
              ],
            ),
    );
  }

  Widget _buildAppointmentCard(
      Map<String, dynamic> appointment, HospitalProvider provider) {
    final statusColor = _getStatusColor(appointment['status'] ?? 'pending');
    final isPending = (appointment['status'] ?? '').toLowerCase() == 'pending';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    appointment['patient_name'] ?? 'Unknown Patient',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    appointment['status'] ?? 'Pending',
                    style: TextStyle(color: statusColor, fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
                '${appointment['appointment_date'] ?? ''} at ${appointment['appointment_time'] ?? ''}'),
            Text('Doctor: ${appointment['doctor_name'] ?? 'Not assigned'}'),
            if (isPending) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _updateStatus(
                          context, appointment['id'], 'confirmed', provider),
                      style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.green),
                      child: const Text('Confirm'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _updateStatus(
                          context, appointment['id'], 'cancelled', provider),
                      style:
                          OutlinedButton.styleFrom(foregroundColor: Colors.red),
                      child: const Text('Cancel'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return Colors.green;
      case 'completed':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  Future<void> _updateStatus(BuildContext context, int id, String status,
      HospitalProvider provider) async {
    final success = await provider.updateAppointmentStatus(id, status);
    if (success && mounted) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Appointment $status')),
      );
    }
  }
}
