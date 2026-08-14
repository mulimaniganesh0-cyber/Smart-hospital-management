// lib/screens/hospital/hospital_resource_requests.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/hospital_provider.dart';
import '../../services/api_service.dart';

class HospitalResourceRequests extends StatefulWidget {
  const HospitalResourceRequests({super.key});

  @override
  State<HospitalResourceRequests> createState() =>
      _HospitalResourceRequestsState();
}

class _HospitalResourceRequestsState extends State<HospitalResourceRequests> {
  bool _isLoading = true;
  String? _errorMessage;
  String _selectedFilter = 'all';
  String _selectedType = 'all';
  List<Map<String, dynamic>> _requests = [];

  final List<String> _statusFilters = [
    'all',
    'pending',
    'approved',
    'fulfilled',
    'rejected'
  ];
  final List<String> _typeFilters = ['all', 'blood', 'resource'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadRequests();
    });
  }

  Future<void> _loadRequests() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // Load both blood and resource requests
      final bloodResponse = await ApiService.getHospitalBloodRequests();
      final resourceResponse = await ApiService.getHospitalResourceRequests();

      List<Map<String, dynamic>> allRequests = [];

      // Add blood requests with type marker
      if (bloodResponse['success'] == true && bloodResponse['data'] != null) {
        final bloodRequests = (bloodResponse['data'] as List)
            .whereType<Map>()
            .map((request) => Map<String, dynamic>.from(request))
            .toList();
        allRequests.addAll(bloodRequests.map((r) {
          r['_type'] = 'blood';
          r['display_name'] = 'Blood Request';
          return r;
        }));
      }

      // Add resource requests with type marker
      if (resourceResponse['success'] == true &&
          resourceResponse['data'] != null) {
        final resourceRequests = (resourceResponse['data'] as List)
            .whereType<Map>()
            .map((request) => Map<String, dynamic>.from(request))
            .toList();
        allRequests.addAll(resourceRequests.map((r) {
          r['_type'] = 'resource';
          r['display_name'] = 'Resource Request';
          return r;
        }));
      }

      // Sort by date (newest first)
      allRequests.sort((a, b) {
        final dateA = a['request_date'] ?? a['created_at'] ?? '';
        final dateB = b['request_date'] ?? b['created_at'] ?? '';
        return dateB.compareTo(dateA);
      });

      setState(() {
        _requests = allRequests;
        _isLoading = false;
      });

      debugPrint('Loaded ${allRequests.length} total requests');
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to load requests: $e';
        _isLoading = false;
      });
      debugPrint('Error loading requests: $e');
    }
  }

  List<Map<String, dynamic>> get _filteredRequests {
    var filtered = _requests;

    // Filter by type
    if (_selectedType != 'all') {
      filtered = filtered.where((r) => r['_type'] == _selectedType).toList();
    }

    // Filter by status
    if (_selectedFilter != 'all') {
      filtered = filtered.where((r) {
        final status = r['status']?.toString().toLowerCase() ?? '';
        return status == _selectedFilter;
      }).toList();
    }

    return filtered;
  }

  int _getCountByStatus(String status) {
    if (status == 'all') return _requests.length;
    return _requests
        .where((r) => (r['status']?.toString().toLowerCase() ?? '') == status)
        .length;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('All Requests'),
        backgroundColor: const Color(0xFF0A4D68),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadRequests,
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
                          size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_errorMessage!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadRequests,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    // Statistics Cards
                    Container(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          _buildStatsCard('Total', _requests.length,
                              Colors.blue, Icons.list),
                          const SizedBox(width: 8),
                          _buildStatsCard(
                              'Pending',
                              _getCountByStatus('pending'),
                              Colors.orange,
                              Icons.pending),
                          const SizedBox(width: 8),
                          _buildStatsCard(
                              'Fulfilled',
                              _getCountByStatus('fulfilled'),
                              Colors.green,
                              Icons.check_circle),
                          const SizedBox(width: 8),
                          _buildStatsCard(
                              'Rejected',
                              _getCountByStatus('rejected'),
                              Colors.red,
                              Icons.cancel),
                        ],
                      ),
                    ),

                    // Filters
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Request Type',
                            style: TextStyle(
                                fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: _typeFilters.map((type) {
                                return Padding(
                                  padding: const EdgeInsets.only(right: 4),
                                  child: FilterChip(
                                    label: Text(type == 'all'
                                        ? 'All'
                                        : type == 'blood'
                                            ? ' Blood'
                                            : ' Resource'),
                                    selected: _selectedType == type,
                                    onSelected: (selected) {
                                      setState(() => _selectedType = type);
                                    },
                                    selectedColor: const Color(0xFF0A4D68)
                                        .withValues(alpha: 0.2),
                                  ),
                                );
                              }).toList(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Status',
                            style: TextStyle(
                                fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: _statusFilters.map((filter) {
                                return Padding(
                                  padding: const EdgeInsets.only(right: 4),
                                  child: FilterChip(
                                    label: Text(filter == 'all'
                                        ? 'All'
                                        : filter.toUpperCase()),
                                    selected: _selectedFilter == filter,
                                    onSelected: (selected) {
                                      setState(() => _selectedFilter = filter);
                                    },
                                    selectedColor: const Color(0xFF0A4D68)
                                        .withValues(alpha: 0.2),
                                  ),
                                );
                              }).toList(),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Requests List
                    Expanded(
                      child: _filteredRequests.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.request_page,
                                      size: 64, color: Colors.grey),
                                  const SizedBox(height: 16),
                                  Text(
                                    'No ${_selectedFilter == 'all' ? '' : _selectedFilter} requests',
                                    style: const TextStyle(fontSize: 16),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Waiting for patients to request resources or blood',
                                    style: TextStyle(color: Colors.grey[600]),
                                  ),
                                ],
                              ),
                            )
                          : RefreshIndicator(
                              onRefresh: _loadRequests,
                              child: ListView.builder(
                                padding: const EdgeInsets.all(12),
                                itemCount: _filteredRequests.length,
                                itemBuilder: (context, index) {
                                  final request = _filteredRequests[index];
                                  return _buildRequestCard(request);
                                },
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildStatsCard(String label, int count, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(height: 2),
            Text(
              count.toString(),
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRequestCard(Map<String, dynamic> request) {
    final status = request['status'] ?? 'pending';
    final isBlood = request['_type'] == 'blood';
    final patientName = request['patient_name'] ?? 'Unknown';
    final patientPhone = request['patient_phone'] ?? 'N/A';
    final createdAt = request['request_date'] ??
        request['created_at'] ??
        DateTime.now().toIso8601String();
    final bloodGroup = request['blood_group'] ?? '';
    final resourceType = request['resource_type'] ?? 'General Bed';
    final quantity = request['units_required'] ?? request['quantity'] ?? 1;

    // Determine icon and color based on type
    final icon = isBlood ? Icons.water_drop : Icons.medical_services;
    final color = isBlood ? Colors.red : Colors.blue;
    final typeLabel = isBlood
        ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ Blood Request'
        : 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Resource Request';
    final detailLabel = isBlood
        ? '$bloodGroup ($quantity units)'
        : '$resourceType (x$quantity)';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: _getStatusColor(status).withValues(alpha: 0.3),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(icon, color: color, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              patientName,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            Text(
                              typeLabel,
                              style: TextStyle(
                                  fontSize: 12, color: Colors.grey[600]),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getStatusColor(status).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    status.toUpperCase(),
                    style: TextStyle(
                      color: _getStatusColor(status),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Details
            Row(
              children: [
                const Icon(Icons.info, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(detailLabel, style: const TextStyle(fontSize: 13)),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.phone, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(patientPhone, style: const TextStyle(fontSize: 12)),
                const SizedBox(width: 16),
                const Icon(Icons.access_time, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  _formatDate(createdAt),
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),

            // Notes
            if (request['description'] != null &&
                request['description'].toString().isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.description, size: 14, color: Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        request['description'],
                        style:
                            const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Action Buttons (only for pending requests)
            if (status == 'pending') ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _showFulfillDialog(context, request),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text(
                          'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Fulfill'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () =>
                          _updateRequestStatus(request, 'rejected'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text(
                          'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Reject'),
                    ),
                  ),
                ],
              ),
            ],

            // Status messages
            if (status == 'fulfilled') ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green, size: 16),
                    SizedBox(width: 8),
                    Text(
                      'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Fulfilled successfully',
                      style: TextStyle(color: Colors.green, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],

            if (status == 'rejected') ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.cancel, color: Colors.red, size: 16),
                    SizedBox(width: 8),
                    Text(
                      'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Request rejected',
                      style: TextStyle(color: Colors.red, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'approved':
        return Colors.blue;
      case 'fulfilled':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  void _showFulfillDialog(BuildContext context, Map<String, dynamic> request) {
    final isBlood = request['_type'] == 'blood';
    final patientName = request['patient_name'] ?? 'patient';
    final quantity = request['units_required'] ?? request['quantity'] ?? 1;
    final detail = isBlood
        ? 'Blood: ${request['blood_group'] ?? 'Unknown'} ($quantity units)'
        : 'Resource: ${request['resource_type'] ?? 'General Bed'} (x$quantity)';

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Icon(isBlood ? Icons.water_drop : Icons.medical_services,
                color: isBlood ? Colors.red : Colors.blue),
            const SizedBox(width: 12),
            Text(
                isBlood ? 'Fulfill Blood Request' : 'Fulfill Resource Request'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Are you sure you want to fulfill this request?'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Patient: $patientName'),
                  Text('Request: $detail'),
                  const SizedBox(height: 8),
                  Text(
                    'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â This will decrease available ${isBlood ? 'blood units' : 'resources'}',
                    style: TextStyle(fontSize: 12, color: Colors.orange[700]),
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
            onPressed: () {
              Navigator.pop(context);
              _updateRequestStatus(request, 'fulfilled');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
            ),
            child: const Text(
                'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Fulfill'),
          ),
        ],
      ),
    );
  }

  Future<void> _updateRequestStatus(
      Map<String, dynamic> request, String status) async {
    final requestId = request['id'];
    final isBlood = request['_type'] == 'blood';

    setState(() => _isLoading = true);

    try {
      dynamic response;
      if (isBlood) {
        if (status == 'fulfilled') {
          response = await ApiService.fulfillBloodRequest(requestId);
        } else {
          response = await ApiService.rejectBloodRequest(requestId);
        }
      } else {
        if (status == 'fulfilled') {
          response = await ApiService.fulfillResourceRequest(requestId);
        } else {
          response = await ApiService.rejectResourceRequest(requestId);
        }
      }

      if (mounted) {
        if (response['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Request ${status}ed successfully'),
              backgroundColor: Colors.green,
            ),
          );

          // Refresh the list
          await _loadRequests();

          // Refresh hospital data to update resource counts
          if (!context.mounted) return;
          if (!context.mounted) return;
          if (!mounted) return;
          final hospitalProvider =
              Provider.of<HospitalProvider>(context, listen: false);
          await hospitalProvider.loadHospitalData();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(response['message'] ?? 'Failed to update request'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}
