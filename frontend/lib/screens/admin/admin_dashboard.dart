// lib/screens/admin/admin_dashboard.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../widgets/app_ui.dart';

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  bool _isLoading = true;
  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _recentHospitals = [];
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final statsResponse = await ApiService.getDashboardStats();
      if (!mounted) return;
      if (statsResponse['success'] == true) {
        _stats = statsResponse['data'] ?? {};
      }

      final hospitalsResponse = await ApiService.getAllHospitalsWithResources(page: 1, limit: 5);
      if (!mounted) return;
      if (hospitalsResponse['success'] == true) {
        _recentHospitals = List<Map<String, dynamic>>.from(hospitalsResponse['data'] ?? []);
      }
    } catch (e) {
      _errorMessage = 'The system overview could not be loaded. Please try again.';
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('System overview'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDashboardData,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadDashboardData,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _errorMessage != null
                ? CareGuideEmptyState(
                    icon: Icons.cloud_off_outlined,
                    title: 'Dashboard unavailable',
                    message: _errorMessage!,
                    action: ElevatedButton.icon(onPressed: _loadDashboardData, icon: const Icon(Icons.refresh), label: const Text('Try again')),
                  )
                : CareGuidePage(child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const CareGuideSectionHeader(title: 'System overview', subtitle: 'Live operational data across CareGuide'),
                        const SizedBox(height: 16),
                        LayoutBuilder(builder: (context, constraints) => GridView.count(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisCount: constraints.maxWidth >= 800 ? 4 : 2,
                          mainAxisSpacing: 16,
                          crossAxisSpacing: 16,
                          childAspectRatio: 1.2,
                          children: [
                            AdminMetricCard(
                              title: 'Total Hospitals',
                              value: _stats['total_hospitals']?.toString() ?? '0',
                              icon: Icons.local_hospital,
                              color: Colors.blue,
                              change: '+${_stats['new_hospitals'] ?? 0}',
                            ),
                            AdminMetricCard(
                              title: 'Pending Verification',
                              value: _stats['pending_verification']?.toString() ?? '0',
                              icon: Icons.pending,
                              color: Colors.orange,
                              change: '',
                            ),
                            AdminMetricCard(
                              title: 'Total Users',
                              value: _stats['total_users']?.toString() ?? '0',
                              icon: Icons.people,
                              color: Colors.green,
                              change: '+${_stats['new_users'] ?? 0}',
                            ),
                            AdminMetricCard(
                              title: 'Emergency Requests',
                              value: _stats['active_emergencies']?.toString() ?? '0',
                              icon: Icons.emergency,
                              color: Colors.red,
                              change: '+${_stats['new_emergencies'] ?? 0}',
                            ),
                          ],
                        )),
                        const SizedBox(height: 24),
                        const CareGuideSectionHeader(title: 'Recent hospital registrations'),
                        const SizedBox(height: 12),
                        if (_recentHospitals.isEmpty)
                          const Card(
                            child: Padding(
                              padding: EdgeInsets.all(16),
                              child: Center(child: Text('No recent registrations')),
                            ),
                          )
                        else
                          ..._recentHospitals.map((hospital) {
                            return AdminRecentHospitalCard(
                              name: hospital['name'] ?? 'Unknown Hospital',
                              registrationDate: hospital['created_at']?.toString().split('T')[0] ?? 'Unknown',
                              location: hospital['city'] ?? 'Unknown',
                              status: hospital['verification_status'] ?? 'pending',
                              onTap: () {
                                // Navigate to hospital detail
                              },
                            );
                          }),
                      ],
                    ),
                  )),
      ),
    );
  }
}

class AdminMetricCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final String change;

  const AdminMetricCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
    required this.change,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$title: $value',
      child: Container(
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
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: TextStyle(color: Colors.grey[600], fontSize: 12),
          ),
          Text(
            change,
            style: TextStyle(
              color: change.startsWith('+') ? Colors.green : Colors.red,
              fontSize: 11,
            ),
          ),
        ],
      ),
    ));
  }
}

class AdminRecentHospitalCard extends StatelessWidget {
  final String name;
  final String registrationDate;
  final String location;
  final String status;
  final VoidCallback onTap;

  const AdminRecentHospitalCard({
    super.key,
    required this.name,
    required this.registrationDate,
    required this.location,
    required this.status,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isPending = status.toLowerCase() == 'pending';
    final tone = isPending ? CareGuideStatusTone.warning : CareGuideStatusTone.success;
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: isPending ? Colors.orange : Colors.green,
          child: Icon(
            isPending ? Icons.pending : Icons.check,
            color: Colors.white,
          ),
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text('$location • $registrationDate'),
        trailing: CareGuideStatusBadge(label: status, tone: tone),
        onTap: onTap,
      ),
    );
  }
}
