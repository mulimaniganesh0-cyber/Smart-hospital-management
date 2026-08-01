// lib/screens/hospital/hospital_home_screen.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/screens/hospital/hospital_blood_bank.dart';
import 'package:hospital_resource_management/services/api_service.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/hospital_provider.dart';
import '../login_screen.dart';
import 'hospital_resources.dart';
import 'hospital_appointments.dart';
import 'hospital_staff.dart';
import 'hospital_ambulances.dart';
import 'hospital_resource_requests.dart';
import 'hospital_profile.dart';
import 'hospital_campaigns.dart';

class HospitalHomeScreen extends StatefulWidget {
  const HospitalHomeScreen({super.key});

  @override
  State<HospitalHomeScreen> createState() => _HospitalHomeScreenState();
}

class _HospitalHomeScreenState extends State<HospitalHomeScreen> {
  int _selectedIndex = 0;

  // Correct order of screens matching navigation items
  final List<Widget> _screens = [
    const HospitalDashboard(),          // Index 0: Dashboard
    const HospitalResources(),           // Index 1: Resources
    const HospitalAppointments(),        // Index 2: Appointments
    const HospitalStaff(),               // Index 3: Staff
    const HospitalAmbulances(),          // Index 4: Ambulances
    const HospitalBloodBank(),           // Index 5: Unified Blood Bank (Stock + Expiry + Requests)
    const HospitalCampaigns(),           // Index 6: Camps
    const HospitalResourceRequests(),    // Index 7: Requests (Blood + Resource requests)
    const HospitalProfile(),             // Index 8: Profile
  ];

  // Method to navigate to a specific tab from anywhere
  void navigateToTab(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_selectedIndex],
      bottomNavigationBar: NavigationBar(
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
    'available_beds': 0,
    'available_icu': 0,
    'appointments': 0,
  };
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    
    try {
      final response = await ApiService.getHospitalProfile();
      if (response['success'] && response['data'] != null) {
        final data = response['data'];
        final resources = data['resources'] ?? {};
        
        setState(() {
          _stats = {
            'total_patients': data['total_patients'] ?? 0,
            'available_beds': resources['generalBeds']?['available']?.toInt() ?? 0,
            'available_icu': resources['icuBeds']?['available']?.toInt() ?? 0,
            'appointments': data['today_appointments'] ?? 0,
          };
        });
      }
    } catch (e) {
      print('Error loading stats: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _navigateToTab(int index) {
    final parentState = context.findAncestorStateOfType<_HospitalHomeScreenState>();
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
    final pendingBloodRequests = hospitalProvider.bloodRequests.where((r) => 
      r['status']?.toLowerCase() == 'pending'
    ).length;

    // Count pending resource requests
    final pendingResourceRequests = hospitalProvider.resourceRequests.where((r) => 
      r['status']?.toLowerCase() == 'pending'
    ).length;

    // Total pending requests
    final totalPendingRequests = pendingBloodRequests + pendingResourceRequests;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hospital Dashboard'),
        actions: [
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
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Hospital Name Header
              Text(
                hospitalData?['name'] ?? 'Hospital Name',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                'Welcome back, ${authProvider.currentUser?.name ?? 'Administrator'}',
                style: TextStyle(color: Colors.grey[600]),
              ),
              const SizedBox(height: 24),
              
              // Metrics Grid
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
                      title: 'Available Beds',
                      value: _stats['available_beds'].toString(),
                      icon: Icons.king_bed,
                      color: Colors.green,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Available ICU',
                      value: _stats['available_icu'].toString(),
                      icon: Icons.local_hospital,
                      color: Colors.red,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Today\'s Appointments',
                      value: _stats['appointments'].toString(),
                      icon: Icons.calendar_today,
                      color: Colors.orange,
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
                      badge: totalPendingRequests > 0 ? totalPendingRequests : null,
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
        ),
      ),
    );
  }

  Widget _buildMetricCard({required String title, required String value, required IconData icon, required Color color}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade100,
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(height: 12),
          Text(
            value,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
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
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.3)),
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
              style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12),
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
                          const Icon(Icons.bloodtype, color: Colors.red, size: 24),
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
                          const Icon(Icons.medical_services, color: Colors.purple, size: 24),
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

  Widget _buildEmergencyCard(Map<String, dynamic> emergency, BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: Colors.red,
          child: const Icon(Icons.emergency, color: Colors.white),
        ),
        title: Text(emergency['patient_name'] ?? 'Unknown Patient'),
        subtitle: Text(emergency['emergency_type'] ?? 'Medical Emergency'),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.red.withOpacity(0.1),
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

  void _showEmergencyDetails(BuildContext context, Map<String, dynamic> emergency) {
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
            Text('Description: ${emergency['description'] ?? 'No description'}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
          ElevatedButton(
            onPressed: () async {
              final response = await ApiService.updateEmergencyStatus(
                emergency['id'], 
                'assigned'
              );
              Navigator.pop(context);
              if (response['success']) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Emergency team notified')),
                );
                Provider.of<HospitalProvider>(context, listen: false).loadHospitalData();
              }
            },
            child: const Text('Respond'),
          ),
        ],
      ),
    );
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
  final List<String> _filters = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<HospitalProvider>(context);
    final allAppointments = provider.appointments;
    
    final filteredAppointments = _selectedFilter == 'all'
        ? allAppointments
        : allAppointments.where((a) => 
            (a['status'] ?? '').toLowerCase() == _selectedFilter
          ).toList();

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
                          selectedColor: const Color(0xFF0A4D68).withOpacity(0.2),
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

  Widget _buildAppointmentCard(Map<String, dynamic> appointment, HospitalProvider provider) {
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
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.1),
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
            Text('${appointment['appointment_date'] ?? ''} at ${appointment['appointment_time'] ?? ''}'),
            Text('Doctor: ${appointment['doctor_name'] ?? 'Not assigned'}'),
            if (isPending) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _updateStatus(context, appointment['id'], 'confirmed', provider),
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.green),
                      child: const Text('Confirm'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _updateStatus(context, appointment['id'], 'cancelled', provider),
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
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
      case 'confirmed': return Colors.green;
      case 'completed': return Colors.blue;
      case 'cancelled': return Colors.red;
      default: return Colors.orange;
    }
  }

  Future<void> _updateStatus(BuildContext context, int id, String status, HospitalProvider provider) async {
    final success = await provider.updateAppointmentStatus(id, status);
    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Appointment $status')),
      );
    }
  }
}