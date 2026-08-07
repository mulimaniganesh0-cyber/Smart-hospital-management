// lib/screens/admin/admin_home_screen.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/screens/admin/admin_campaign_verification.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../login_screen.dart';
import 'hospital_verification.dart';

class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  int _selectedIndex = 0;

  final List<Widget> _screens = [
    const AdminDashboard(),
    const AdminHospitalsList(),
    const HospitalVerificationScreen(),
    const AdminCampaignVerification(),
    const AdminProfile(),
  ];

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
            icon: Icon(Icons.local_hospital_outlined),
            selectedIcon: Icon(Icons.local_hospital),
            label: 'Hospitals',
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_outlined),
            selectedIcon: Icon(Icons.verified),
            label: 'Verification',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign),
            label: 'Camps',
          ),
          NavigationDestination(
            icon: Icon(Icons.admin_panel_settings_outlined),
            selectedIcon: Icon(Icons.admin_panel_settings),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

// ==================== ADMIN DASHBOARD ====================
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
    if (!context.mounted) return;
    
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final statsResponse = await ApiService.getDashboardStats();
      if (mounted && statsResponse['success'] == true) {
        setState(() {
          _stats = statsResponse['data'] ?? {};
        });
      }

      final hospitalsResponse = await ApiService.getAllHospitalsWithResources(page: 1, limit: 5);
      if (mounted && hospitalsResponse['success'] == true) {
        setState(() {
          _recentHospitals = List<Map<String, dynamic>>.from(hospitalsResponse['data'] ?? []);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Failed to load dashboard data: $e';
        });
      }
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard'),
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
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline, size: 64, color: Colors.red),
                        const SizedBox(height: 16),
                        Text(_errorMessage!),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadDashboardData,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'System Overview',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 16),
                        GridView.count(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisCount: 2,
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
                        ),
                        const SizedBox(height: 24),
                        const Text(
                          'Recent Hospital Registrations',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
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
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (context) => AdminHospitalDetailScreen(
                                      hospitalId: hospital['id'],
                                      hospitalName: hospital['name'] ?? 'Hospital',
                                    ),
                                  ),
                                );
                              },
                            );
                          }),
                      ],
                    ),
                  ),
      ),
    );
  }
}

// ==================== ADMIN METRIC CARD ====================
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
    );
  }
}

// ==================== ADMIN RECENT HOSPITAL CARD ====================
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
    final isVerified = status.toLowerCase() == 'verified';
    final isPending = status.toLowerCase() == 'pending';
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: isVerified
                          ? Colors.green.withValues(alpha: 0.1)
                          : isPending
                              ? Colors.orange.withValues(alpha: 0.1)
                              : Colors.red.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      status,
                      style: TextStyle(
                        color: isVerified
                            ? Colors.green
                            : isPending
                                ? Colors.orange
                                : Colors.red,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.location_on, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(location, style: const TextStyle(fontSize: 12)),
                  const SizedBox(width: 16),
                  const Icon(Icons.calendar_today, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(registrationDate, style: const TextStyle(fontSize: 12)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ==================== ADMIN HOSPITALS LIST ====================
class AdminHospitalsList extends StatefulWidget {
  const AdminHospitalsList({super.key});

  @override
  State<AdminHospitalsList> createState() => _AdminHospitalsListState();
}

class _AdminHospitalsListState extends State<AdminHospitalsList> {
  List<Map<String, dynamic>> _hospitals = [];
  bool _isLoading = true;
  String? _errorMessage;
  String _searchQuery = '';
  String _filterStatus = 'all';

  @override
  void initState() {
    super.initState();
    _loadHospitals();
  }

  Future<void> _loadHospitals() async {
    if (!context.mounted) return;
    
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await ApiService.getAllHospitalsWithResources();
      if (mounted) {
        if (response['success']) {
          setState(() {
            _hospitals = List<Map<String, dynamic>>.from(response['data']);
          });
        } else {
          setState(() {
            _errorMessage = response['message'] ?? 'Failed to load hospitals';
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Network error: $e';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> get _filteredHospitals {
    var filtered = _hospitals;
    
    if (_searchQuery.isNotEmpty) {
      filtered = filtered.where((h) =>
        (h['name'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (h['city'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase())
      ).toList();
    }
    
    if (_filterStatus != 'all') {
      if (_filterStatus == 'verified') {
        filtered = filtered.where((h) => h['is_verified'] == true).toList();
      } else if (_filterStatus == 'pending') {
        filtered = filtered.where((h) => h['verification_status'] == 'pending').toList();
      } else if (_filterStatus == 'rejected') {
        filtered = filtered.where((h) => h['verification_status'] == 'rejected').toList();
      }
    }
    
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hospital Management'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadHospitals,
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
                      const Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_errorMessage!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadHospitals,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              decoration: const InputDecoration(
                                hintText: 'Search hospitals...',
                                prefixIcon: Icon(Icons.search),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.all(Radius.circular(12)),
                                ),
                                contentPadding: EdgeInsets.symmetric(horizontal: 16),
                              ),
                              onChanged: (value) {
                                setState(() => _searchQuery = value);
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey.shade300),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                value: _filterStatus,
                                items: const [
                                  DropdownMenuItem(value: 'all', child: Text('All')),
                                  DropdownMenuItem(value: 'verified', child: Text('Verified')),
                                  DropdownMenuItem(value: 'pending', child: Text('Pending')),
                                  DropdownMenuItem(value: 'rejected', child: Text('Rejected')),
                                ],
                                onChanged: (value) {
                                  setState(() => _filterStatus = value!);
                                },
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        '${_filteredHospitals.length} hospitals found',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ),
                    
                    const SizedBox(height: 8),
                    
                    Expanded(
                      child: _filteredHospitals.isEmpty
                          ? const Center(child: Text('No hospitals found'))
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filteredHospitals.length,
                              itemBuilder: (context, index) {
                                final hospital = _filteredHospitals[index];
                                return _buildHospitalCard(hospital);
                              },
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildHospitalCard(Map<String, dynamic> hospital) {
    final isVerified = hospital['is_verified'] ?? false;
    final status = hospital['verification_status'] ?? 'pending';
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => AdminHospitalDetailScreen(
                hospitalId: hospital['id'],
                hospitalName: hospital['name'] ?? 'Hospital',
              ),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isVerified ? Colors.green.shade50 : Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      isVerified ? Icons.verified : Icons.pending,
                      color: isVerified ? Colors.green : Colors.orange,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          hospital['name'] ?? 'Unknown Hospital',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Row(
                          children: [
                            const Icon(Icons.location_on, size: 14, color: Colors.grey),
                            const SizedBox(width: 4),
                            Text(
                              hospital['city'] ?? 'Location not set',
                              style: const TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                            const SizedBox(width: 12),
                            const Icon(Icons.phone, size: 14, color: Colors.grey),
                            const SizedBox(width: 4),
                            Text(
                              hospital['phone'] ?? 'N/A',
                              style: const TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: status == 'verified'
                          ? Colors.green.withValues(alpha: 0.1)
                          : status == 'pending'
                              ? Colors.orange.withValues(alpha: 0.1)
                              : Colors.red.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      status.toUpperCase(),
                      style: TextStyle(
                        color: status == 'verified'
                            ? Colors.green
                            : status == 'pending'
                                ? Colors.orange
                                : Colors.red,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  _buildResourceChip('Beds', hospital['general_beds_available'] ?? 0, hospital['general_beds_total'] ?? 0, Colors.blue),
                  _buildResourceChip('ICU', hospital['icu_beds_available'] ?? 0, hospital['icu_beds_total'] ?? 0, Colors.red),
                  _buildResourceChip('Ventilators', hospital['ventilators_available'] ?? 0, hospital['ventilators_total'] ?? 0, Colors.green),
                  _buildResourceChip('Oxygen', hospital['oxygen_beds_available'] ?? 0, hospital['oxygen_beds_total'] ?? 0, Colors.purple),
                  _buildBloodChip(hospital['blood_units'] ?? 0),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Registered: ${hospital['created_at']?.toString().split('T')[0] ?? 'N/A'}',
                    style: TextStyle(color: Colors.grey[500], fontSize: 11),
                  ),
                  if ((hospital['general_beds_total'] ?? 0) == 0 &&
                      (hospital['icu_beds_total'] ?? 0) == 0 &&
                      (hospital['ventilators_total'] ?? 0) == 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade50,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'No resources',
                        style: TextStyle(fontSize: 10, color: Colors.orange),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildResourceChip(String label, int available, int total, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: available > 0 ? color : Colors.grey,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            '$available/$total',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: available > 0 ? Colors.black87 : Colors.grey,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 9,
              color: Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBloodChip(int units) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.water_drop, size: 12, color: Colors.red),
          const SizedBox(width: 4),
          Text(
            '$units units',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Colors.red,
            ),
          ),
        ],
      ),
    );
  }
}

// ==================== ADMIN HOSPITAL DETAIL SCREEN ====================
class AdminHospitalDetailScreen extends StatefulWidget {
  final int hospitalId;
  final String hospitalName;

  const AdminHospitalDetailScreen({
    super.key,
    required this.hospitalId,
    required this.hospitalName,
  });

  @override
  State<AdminHospitalDetailScreen> createState() => _AdminHospitalDetailScreenState();
}

class _AdminHospitalDetailScreenState extends State<AdminHospitalDetailScreen> {
  bool _isLoading = true;
  Map<String, dynamic>? _hospitalData;
  List<Map<String, dynamic>> _bloodBank = [];
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadHospitalData();
  }

  Future<void> _loadHospitalData() async {
    if (!context.mounted) return;
    
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final resourcesResponse = await ApiService.getAdminHospitalResources(widget.hospitalId);
      if (mounted && resourcesResponse['success'] && resourcesResponse['data'] != null) {
        setState(() {
          _hospitalData = resourcesResponse['data'];
        });
      }

      final bloodResponse = await ApiService.getAdminHospitalBloodBank(widget.hospitalId);
      if (mounted && bloodResponse['success']) {
        setState(() {
          _bloodBank = List<Map<String, dynamic>>.from(bloodResponse['data']);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Network error: $e';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _updateResource(String field, int value) async {
    try {
      final response = await ApiService.updateAdminHospitalResources(
        widget.hospitalId,
        {field: value},
      );
      
      if (response['success'] && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Resource updated successfully')),
        );
        _loadHospitalData();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _updateBloodStock(String bloodGroup, int units) async {
    try {
      final response = await ApiService.updateAdminBloodBank(
        widget.hospitalId,
        bloodGroup,
        units,
      );
      
      if (response['success'] && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Blood stock updated successfully')),
        );
        _loadHospitalData();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.hospitalName),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadHospitalData,
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
                      const Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_errorMessage!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadHospitalData,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      // Hospital Info Card
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Hospital Information',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              _buildInfoRow(Icons.location_on, 'Address', _hospitalData?['address'] ?? 'N/A'),
                              _buildInfoRow(Icons.phone, 'Phone', _hospitalData?['phone'] ?? 'N/A'),
                              _buildInfoRow(Icons.email, 'Email', _hospitalData?['email'] ?? 'N/A'),
                              _buildInfoRow(Icons.business, 'City', _hospitalData?['city'] ?? 'N/A'),
                              _buildInfoRow(Icons.verified, 'Status', 
                                (_hospitalData?['is_verified'] ?? false) ? 'Verified' : 'Pending'),
                            ],
                          ),
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      
                      // Resources Card
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Resources Management',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 16),
                              _buildResourceManagementCard(
                                title: 'General Beds',
                                total: _hospitalData?['general_beds_total'] ?? 0,
                                available: _hospitalData?['general_beds_available'] ?? 0,
                                field: 'general_beds_total',
                                availableField: 'general_beds_available',
                                color: Colors.blue,
                                onUpdate: _updateResource,
                              ),
                              const SizedBox(height: 12),
                              _buildResourceManagementCard(
                                title: 'ICU Beds',
                                total: _hospitalData?['icu_beds_total'] ?? 0,
                                available: _hospitalData?['icu_beds_available'] ?? 0,
                                field: 'icu_beds_total',
                                availableField: 'icu_beds_available',
                                color: Colors.red,
                                onUpdate: _updateResource,
                              ),
                              const SizedBox(height: 12),
                              _buildResourceManagementCard(
                                title: 'Ventilators',
                                total: _hospitalData?['ventilators_total'] ?? 0,
                                available: _hospitalData?['ventilators_available'] ?? 0,
                                field: 'ventilators_total',
                                availableField: 'ventilators_available',
                                color: Colors.green,
                                onUpdate: _updateResource,
                              ),
                              const SizedBox(height: 12),
                              _buildResourceManagementCard(
                                title: 'Oxygen Beds',
                                total: _hospitalData?['oxygen_beds_total'] ?? 0,
                                available: _hospitalData?['oxygen_beds_available'] ?? 0,
                                field: 'oxygen_beds_total',
                                availableField: 'oxygen_beds_available',
                                color: Colors.purple,
                                onUpdate: _updateResource,
                              ),
                            ],
                          ),
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      
                      // Blood Bank Card
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text(
                                    'Blood Bank',
                                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                  ),
                                  ElevatedButton(
                                    onPressed: () => _showAddBloodDialog(context),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.purple,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      minimumSize: const Size(100, 36),
                                    ),
                                    child: const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(Icons.add, size: 16),
                                        SizedBox(width: 4),
                                        Text('Add Blood'),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              if (_bloodBank.isEmpty)
                                Container(
                                  padding: const EdgeInsets.all(32),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade50,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Center(
                                    child: Column(
                                      children: [
                                        Icon(Icons.inventory, size: 48, color: Colors.grey),
                                        SizedBox(height: 12),
                                        Text('No blood stock available'),
                                        Text(
                                          'Click "Add Blood" to add blood units',
                                          style: TextStyle(fontSize: 12, color: Colors.grey),
                                        ),
                                      ],
                                    ),
                                  ),
                                )
                              else
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: _bloodBank.map((stock) {
                                    final isLow = (stock['units_available'] ?? 0) < 10;
                                    return Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      decoration: BoxDecoration(
                                        color: isLow ? Colors.red.shade50 : Colors.green.shade50,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: isLow ? Colors.red.shade200 : Colors.green.shade200,
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            '${stock['blood_group']}: ${stock['units_available']} units',
                                            style: TextStyle(
                                              color: isLow ? Colors.red.shade700 : Colors.green.shade700,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          IconButton(
                                            icon: const Icon(Icons.edit, size: 16),
                                            onPressed: () => _showEditBloodDialog(context, stock),
                                            padding: EdgeInsets.zero,
                                            constraints: const BoxConstraints(
                                              minWidth: 30,
                                              minHeight: 30,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey),
          const SizedBox(width: 8),
          SizedBox(
            width: 80,
            child: Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 14)),
          ),
        ],
      ),
    );
  }

  Widget _buildResourceManagementCard({
    required String title,
    required int total,
    required int available,
    required String field,
    required String availableField,
    required Color color,
    required Function(String, int) onUpdate,
  }) {
    final occupied = total - available;
    final percentage = total > 0 ? available / total : 0.0;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Icon(
                      _getResourceIcon(field),
                      size: 16,
                      color: color,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${(percentage * 100).toInt()}%',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: percentage.clamp(0.0, 1.0),
              backgroundColor: Colors.grey.shade200,
              color: color,
              minHeight: 4,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildStatItem('Total', total.toString(), Colors.grey),
              const SizedBox(width: 16),
              _buildStatItem('Available', available.toString(), Colors.green),
              const SizedBox(width: 16),
              _buildStatItem('Occupied', occupied.toString(), Colors.red),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 30,
                  child: ElevatedButton(
                    onPressed: () => _showUpdateDialog(
                      context,
                      'Update Total $title',
                      field,
                      total,
                      onUpdate,
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: const Size(0, 30),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('Update Total', style: TextStyle(fontSize: 11)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SizedBox(
                  height: 30,
                  child: ElevatedButton(
                    onPressed: () => _showUpdateDialog(
                      context,
                      'Update Available $title',
                      availableField,
                      available,
                      onUpdate,
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: const Size(0, 30),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('Update Available', style: TextStyle(fontSize: 11)),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color),
          ),
          Text(
            label,
            style: TextStyle(fontSize: 10, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  IconData _getResourceIcon(String field) {
    if (field.contains('general')) return Icons.king_bed;
    if (field.contains('icu')) return Icons.local_hospital;
    if (field.contains('ventilator')) return Icons.air;
    if (field.contains('oxygen')) return Icons.medical_services;
    return Icons.medical_services;
  }

  void _showUpdateDialog(BuildContext context, String title, String field, int currentValue, Function(String, int) onUpdate) {
    final controller = TextEditingController(text: currentValue.toString());

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            hintText: 'Enter new value',
            border: OutlineInputBorder(),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final value = int.tryParse(controller.text);
              if (value != null && value >= 0) {
                Navigator.pop(context);
                onUpdate(field, value);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please enter a valid number')),
                );
              }
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }

  void _showAddBloodDialog(BuildContext context) {
    String selectedGroup = 'A+';
    final unitsController = TextEditingController(text: '10');
    final List<String> bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Blood Stock'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              initialValue: selectedGroup,
              decoration: const InputDecoration(
                labelText: 'Blood Group',
                border: OutlineInputBorder(),
              ),
              items: bloodGroups.map((group) {
                return DropdownMenuItem(value: group, child: Text(group));
              }).toList(),
              onChanged: (value) => selectedGroup = value!,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: unitsController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Units',
                border: OutlineInputBorder(),
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
            onPressed: () {
              final units = int.tryParse(unitsController.text);
              if (units != null && units > 0) {
                Navigator.pop(context);
                _updateBloodStock(selectedGroup, units);
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.purple),
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _showEditBloodDialog(BuildContext context, Map<String, dynamic> stock) {
    final unitsController = TextEditingController(text: stock['units_available'].toString());

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Update ${stock['blood_group']} Stock'),
        content: TextField(
          controller: unitsController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            hintText: 'Enter new units',
            border: OutlineInputBorder(),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final units = int.tryParse(unitsController.text);
              if (units != null && units >= 0) {
                Navigator.pop(context);
                _updateBloodStock(stock['blood_group'], units);
              }
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }
}

// ==================== ADMIN PROFILE ====================
class AdminProfile extends StatelessWidget {
  const AdminProfile({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final user = authProvider.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Profile'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const CircleAvatar(
              radius: 60,
              backgroundColor: Color(0xFF0A4D68),
              child: Icon(Icons.admin_panel_settings, size: 60, color: Colors.white),
            ),
            const SizedBox(height: 12),
            Text(
              user?.name ?? 'Admin User',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const Text('System Administrator'),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _buildProfileRow(Icons.email, 'Email', user?.email ?? 'admin@system.com'),
                    const Divider(),
                    _buildProfileRow(Icons.phone, 'Phone', user?.phone ?? '+1 234 567 8900'),
                    const Divider(),
                    const _AdminProfileRow(
                      icon: Icons.business,
                      label: 'Department',
                      value: 'IT Administration',
                    ),
                    const Divider(),
                    const _AdminProfileRow(
                      icon: Icons.verified,
                      label: 'Role',
                      value: 'Super Admin',
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () async {
                final shouldLogout = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Logout'),
                    content: const Text('Are you sure you want to logout?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Logout'),
                      ),
                    ],
                  ),
                );

                if (shouldLogout == true && context.mounted) {
                  await authProvider.logout();
                  if (context.mounted) {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(builder: (context) => const LoginScreen()),
                      (route) => false,
                    );
                  }
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                minimumSize: const Size(double.infinity, 50),
              ),
              child: const Text('Logout'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey),
          const SizedBox(width: 12),
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminProfileRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _AdminProfileRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey),
          const SizedBox(width: 12),
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }
}