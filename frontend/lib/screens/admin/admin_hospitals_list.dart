// lib/screens/admin/admin_hospitals_list.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import 'admin_hospital_detail.dart';

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
  int _currentPage = 1;
  int _totalPages = 1;
  final int _limit = 20;

  // Helper function to safely convert to int
  int _toInt(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is String) return int.tryParse(value) ?? 0;
    if (value is double) return value.toInt();
    if (value is num) return value.toInt();
    return 0;
  }

  @override
  void initState() {
    super.initState();
    _loadHospitals();
  }

  Future<void> _loadHospitals() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await ApiService.getAllHospitalsWithResources(
        page: _currentPage,
        limit: _limit,
      );
      if (response['success']) {
        _hospitals = List<Map<String, dynamic>>.from(response['data']);
        _totalPages = response['totalPages'] ?? 1;
      } else {
        _errorMessage = response['message'] ?? 'Failed to load hospitals';
      }
    } catch (e) {
      _errorMessage = 'Network error: $e';
    } finally {
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredHospitals {
    var filtered = _hospitals;
    
    if (_searchQuery.isNotEmpty) {
      filtered = filtered.where((h) =>
        (h['name'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (h['city'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (h['email'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase())
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
    final filteredHospitals = _filteredHospitals;

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
                    // Search and Filter
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.grey.shade100,
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  decoration: InputDecoration(
                                    hintText: 'Search hospitals...',
                                    prefixIcon: const Icon(Icons.search),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: BorderSide.none,
                                    ),
                                    filled: true,
                                    fillColor: Colors.grey.shade50,
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 16),
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
                                  color: Colors.grey.shade50,
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
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${filteredHospitals.length} hospitals found',
                                style: TextStyle(color: Colors.grey[600], fontSize: 12),
                              ),
                              if (_hospitals.isNotEmpty)
                                Text(
                                  'Page $_currentPage of $_totalPages',
                                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    
                    // Hospital List
                    Expanded(
                      child: filteredHospitals.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.local_hospital, size: 64, color: Colors.grey[400]),
                                  const SizedBox(height: 16),
                                  Text(
                                    'No hospitals found',
                                    style: TextStyle(color: Colors.grey[600]),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Try adjusting your search or filters',
                                    style: TextStyle(color: Colors.grey[500], fontSize: 12),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: filteredHospitals.length,
                              itemBuilder: (context, index) {
                                final hospital = filteredHospitals[index];
                                return _buildHospitalCard(hospital);
                              },
                            ),
                    ),
                    
                    // Pagination
                    if (_totalPages > 1)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.grey.shade100,
                              blurRadius: 4,
                              offset: const Offset(0, -2),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.chevron_left),
                              onPressed: _currentPage > 1
                                  ? () {
                                      setState(() {
                                        _currentPage--;
                                        _loadHospitals();
                                      });
                                    }
                                  : null,
                            ),
                            Text(
                              'Page $_currentPage of $_totalPages',
                              style: const TextStyle(fontWeight: FontWeight.w500),
                            ),
                            IconButton(
                              icon: const Icon(Icons.chevron_right),
                              onPressed: _currentPage < _totalPages
                                  ? () {
                                      setState(() {
                                        _currentPage++;
                                        _loadHospitals();
                                      });
                                    }
                                  : null,
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
    );
  }

  Widget _buildHospitalCard(Map<String, dynamic> hospital) {
    final isVerified = hospital['is_verified'] ?? false;
    final status = hospital['verification_status'] ?? 'pending';
    
    // Safely convert values to int
    final generalBedsTotal = _toInt(hospital['general_beds_total']);
    final generalBedsAvailable = _toInt(hospital['general_beds_available']);
    final icuBedsTotal = _toInt(hospital['icu_beds_total']);
    final icuBedsAvailable = _toInt(hospital['icu_beds_available']);
    final ventilatorsTotal = _toInt(hospital['ventilators_total']);
    final ventilatorsAvailable = _toInt(hospital['ventilators_available']);
    final oxygenBedsTotal = _toInt(hospital['oxygen_beds_total']);
    final oxygenBedsAvailable = _toInt(hospital['oxygen_beds_available']);
    final bloodUnits = _toInt(hospital['blood_units']);
    
    final hasResources = generalBedsTotal > 0 || icuBedsTotal > 0 || ventilatorsTotal > 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: isVerified ? Colors.green.shade50 : Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(12),
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
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Row(
                          children: [
                            const Icon(Icons.location_on, size: 14, color: Colors.grey),
                            const SizedBox(width: 4),
                            Text(
                              hospital['city'] ?? 'Location not set',
                              style: const TextStyle(fontSize: 12, color: Colors.grey),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
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
                          ? Colors.green.withOpacity(0.1)
                          : status == 'pending'
                              ? Colors.orange.withOpacity(0.1)
                              : Colors.red.withOpacity(0.1),
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
              Row(
                children: [
                  _buildResourceIndicator(
                    label: 'Beds',
                    available: generalBedsAvailable,
                    total: generalBedsTotal,
                    color: Colors.blue,
                  ),
                  const SizedBox(width: 16),
                  _buildResourceIndicator(
                    label: 'ICU',
                    available: icuBedsAvailable,
                    total: icuBedsTotal,
                    color: Colors.red,
                  ),
                  const SizedBox(width: 16),
                  _buildResourceIndicator(
                    label: 'Ventilators',
                    available: ventilatorsAvailable,
                    total: ventilatorsTotal,
                    color: Colors.green,
                  ),
                  const SizedBox(width: 16),
                  _buildResourceIndicator(
                    label: 'Oxygen',
                    available: oxygenBedsAvailable,
                    total: oxygenBedsTotal,
                    color: Colors.purple,
                  ),
                  const SizedBox(width: 16),
                  _buildResourceIndicator(
                    label: 'Blood',
                    available: bloodUnits,
                    color: Colors.red,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Registered: ${hospital['created_at']?.toString().split('T')[0] ?? 'N/A'}',
                    style: TextStyle(color: Colors.grey[500], fontSize: 11),
                  ),
                  if (!hasResources)
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

  Widget _buildResourceIndicator({
    required String label,
    required int available,
    int? total,
    required Color color,
  }) {
    return Row(
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
          total != null ? '$available/$total' : '$available',
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
    );
  }
}