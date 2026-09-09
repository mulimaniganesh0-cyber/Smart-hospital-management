// lib/screens/patient/patient_my_requests.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../widgets/app_ui.dart';

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
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    
    try {
      final response = await ApiService.getMyResourceRequests();
      if (response['success'] == true) {
        _requests = List<Map<String, dynamic>>.from(response['data'] ?? []);
      } else {
        _errorMessage = 'We could not load your requests right now.';
      }
    } catch (e) {
      _errorMessage = 'We could not load your requests right now.';
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My care requests'),
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
              ? CareGuideEmptyState(
                  icon: Icons.cloud_off_outlined,
                  title: 'Requests are unavailable',
                  message: _errorMessage!,
                  action: ElevatedButton.icon(onPressed: _loadRequests, icon: const Icon(Icons.refresh), label: const Text('Try again')),
                )
              : _requests.isEmpty
                  ? const CareGuideEmptyState(icon: Icons.assignment_outlined, title: 'No requests yet', message: 'Requests for beds, blood, and other resources will appear here.')
                  : CareGuidePage(
                      child: ListView.builder(
                      padding: const EdgeInsets.only(bottom: 24),
                      itemCount: _requests.length,
                      itemBuilder: (context, index) {
                        final request = _requests[index];
                        return _buildRequestCard(request);
                      },
                    )),
    );
  }

  Widget _buildRequestCard(Map<String, dynamic> request) {
    final status = request['status'] ?? 'pending';
    final resourceType = request['resource_type'] ?? 'Resource';
    final quantity = request['quantity'] ?? 1;
    final hospitalName = request['hospital_name'] ?? 'Hospital';
    
    IconData statusIcon;
    String statusText;
    CareGuideStatusTone statusTone;
    
    switch (status.toLowerCase()) {
      case 'fulfilled':
        statusIcon = Icons.check_circle;
        statusText = 'Fulfilled';
        statusTone = CareGuideStatusTone.success;
        break;
      case 'pending':
        statusIcon = Icons.pending;
        statusText = 'Pending';
        statusTone = CareGuideStatusTone.warning;
        break;
      case 'approved':
        statusIcon = Icons.check_circle_outline;
        statusText = 'Approved';
        statusTone = CareGuideStatusTone.info;
        break;
      case 'rejected':
        statusIcon = Icons.cancel;
        statusText = 'Rejected';
        statusTone = CareGuideStatusTone.danger;
        break;
      default:
        statusIcon = Icons.help;
        statusText = status;
        statusTone = CareGuideStatusTone.neutral;
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
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(statusIcon, color: Theme.of(context).colorScheme.primary, size: 20),
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
                      Text('$hospitalName • Quantity: $quantity', style: const TextStyle(fontSize: 12, color: CareGuideColors.muted)),
                    ],
                  ),
                ),
                CareGuideStatusBadge(label: statusText, tone: statusTone),
              ],
            ),
            if (request['description'] != null && request['description'].isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                request['description'],
                style: const TextStyle(fontSize: 12, color: CareGuideColors.muted),
              ),
            ],
            const SizedBox(height: 4),
            Text(
              'Submitted ${_formatDate(request['created_at'])}',
              style: const TextStyle(fontSize: 11, color: CareGuideColors.muted),
            ),
            if (status.toLowerCase() == 'fulfilled' && request['fulfilled_at'] != null) ...[
              const SizedBox(height: 4),
              Text(
                'Fulfilled ${_formatDate(request['fulfilled_at'])}',
                style: const TextStyle(fontSize: 11, color: CareGuideColors.success),
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
