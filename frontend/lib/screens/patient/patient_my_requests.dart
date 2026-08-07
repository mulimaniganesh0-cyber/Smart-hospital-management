// lib/screens/patient/patient_my_requests.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class PatientMyRequests extends StatefulWidget {
  const PatientMyRequests({super.key});

  @override
  State<PatientMyRequests> createState() => _PatientMyRequestsState();
}

class _PatientMyRequestsState extends State<PatientMyRequests> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _requests = [];
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    setState(() => _isLoading = true);
    
    try {
      final response = await ApiService.getMyResourceRequests();
      if (response['success']) {
        _requests = List<Map<String, dynamic>>.from(response['data'] ?? []);
      }
    } catch (e) {
      _errorMessage = 'Failed to load requests: $e';
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Requests'),
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
                      const Icon(Icons.error_outline, size: 64, color: Colors.red),
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
              : _requests.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.assignment_outlined, size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text('No requests made yet'),
                          SizedBox(height: 8),
                          Text(
                            'Request resources from hospitals',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _requests.length,
                      itemBuilder: (context, index) {
                        final request = _requests[index];
                        return _buildRequestCard(request);
                      },
                    ),
    );
  }

  Widget _buildRequestCard(Map<String, dynamic> request) {
    final status = request['status'] ?? 'pending';
    final resourceType = request['resource_type'] ?? 'Resource';
    final quantity = request['quantity'] ?? 1;
    final hospitalName = request['hospital_name'] ?? 'Hospital';
    
    Color statusColor;
    IconData statusIcon;
    String statusText;
    
    switch (status.toLowerCase()) {
      case 'fulfilled':
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        statusText = 'Fulfilled';
        break;
      case 'pending':
        statusColor = Colors.orange;
        statusIcon = Icons.pending;
        statusText = 'Pending';
        break;
      case 'approved':
        statusColor = Colors.blue;
        statusIcon = Icons.check_circle_outline;
        statusText = 'Approved';
        break;
      case 'rejected':
        statusColor = Colors.red;
        statusIcon = Icons.cancel;
        statusText = 'Rejected';
        break;
      default:
        statusColor = Colors.grey;
        statusIcon = Icons.help;
        statusText = status;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
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
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(statusIcon, color: statusColor, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$resourceType Request',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        '$hospitalName â€¢ Qty: $quantity',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusText.toUpperCase(),
                    style: TextStyle(
                      color: statusColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
            if (request['description'] != null && request['description'].isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'ðŸ“ ${request['description']}',
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
            const SizedBox(height: 4),
            Text(
              'ðŸ• ${_formatDate(request['created_at'])}',
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
            if (status.toLowerCase() == 'fulfilled' && request['fulfilled_at'] != null) ...[
              const SizedBox(height: 4),
              Text(
                'âœ… Fulfilled on ${_formatDate(request['fulfilled_at'])}',
                style: const TextStyle(fontSize: 11, color: Colors.green),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatDate(String? dateTime) {
    if (dateTime == null) return 'Just now';
    try {
      final date = DateTime.parse(dateTime);
      final now = DateTime.now();
      final diff = now.difference(date);
      
      if (diff.inDays > 7) {
        return '${date.day}/${date.month}/${date.year}';
      } else if (diff.inDays > 0) {
        return '${diff.inDays} days ago';
      } else if (diff.inHours > 0) {
        return '${diff.inHours} hours ago';
      } else if (diff.inMinutes > 0) {
        return '${diff.inMinutes} minutes ago';
      } else {
        return 'Just now';
      }
    } catch (e) {
      return 'Just now';
    }
  }
}
