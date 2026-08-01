// lib/screens/admin/admin_campaign_verification.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AdminCampaignVerification extends StatefulWidget {
  const AdminCampaignVerification({super.key});

  @override
  State<AdminCampaignVerification> createState() =>
      _AdminCampaignVerificationState();
}

class _AdminCampaignVerificationState extends State<AdminCampaignVerification> {
  List<Map<String, dynamic>> _campaigns = [];
  Map<String, dynamic> _stats = {};
  bool _isLoading = true;
  String? _errorMessage;
  String _selectedFilter = 'pending';
  String _searchQuery = '';

  final List<String> _filters = [
    'pending',
    'approved',
    'active',
    'completed',
    'rejected',
    'all'
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // Load stats
      final statsResponse = await ApiService.getAdminCampaignStats();
      if (statsResponse['success']) {
        setState(() {
          _stats = statsResponse['data'] ?? {};
        });
      }

      // Load campaigns
      final campaignsResponse = await ApiService.getAllCampaigns();
      if (campaignsResponse['success']) {
        setState(() {
          _campaigns =
              List<Map<String, dynamic>>.from(campaignsResponse['data']);
        });
      } else {
        _errorMessage =
            campaignsResponse['message'] ?? 'Failed to load campaigns';
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Network error: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _filteredCampaigns {
    var filtered = _campaigns;

    if (_selectedFilter != 'all') {
      filtered = filtered.where((c) => c['status'] == _selectedFilter).toList();
    }

    if (_searchQuery.isNotEmpty) {
      filtered = filtered
          .where((c) =>
              (c['campaign_name'] ?? '')
                  .toLowerCase()
                  .contains(_searchQuery.toLowerCase()) ||
              (c['hospital_name'] ?? '')
                  .toLowerCase()
                  .contains(_searchQuery.toLowerCase()) ||
              (c['location'] ?? '')
                  .toLowerCase()
                  .contains(_searchQuery.toLowerCase()))
          .toList();
    }

    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Campaign Management'),
        backgroundColor: Colors.red,
        actions: [
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
                          size: 64, color: Colors.red),
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
              : Column(
                  children: [
                    // Stats Cards
                    _buildStatsCards(),

                    // Search Bar
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Search campaigns...',
                          prefixIcon: const Icon(Icons.search),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        onChanged: (value) {
                          setState(() {
                            _searchQuery = value;
                          });
                        },
                      ),
                    ),

                    // Filter Chips
                    Container(
                      height: 45,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: _filters.length,
                        itemBuilder: (context, index) {
                          final filter = _filters[index];
                          final count = _campaigns
                              .where((c) => filter == 'all'
                                  ? true
                                  : c['status'] == filter)
                              .length;
                          return Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text('${filter.toUpperCase()} ($count)'),
                              selected: _selectedFilter == filter,
                              onSelected: (selected) {
                                setState(() => _selectedFilter = filter);
                              },
                              selectedColor: Colors.red.shade100,
                            ),
                          );
                        },
                      ),
                    ),

                    // Campaigns List
                    Expanded(
                      child: _filteredCampaigns.isEmpty
                          ? const Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.campaign,
                                      size: 64, color: Colors.grey),
                                  SizedBox(height: 16),
                                  Text('No campaigns found'),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filteredCampaigns.length,
                              itemBuilder: (context, index) {
                                final campaign = _filteredCampaigns[index];
                                return _buildCampaignCard(campaign);
                              },
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildStatsCards() {
    final total = _stats['total_campaigns'] ?? 0;
    final pending = _stats['pending_campaigns'] ?? 0;
    final approved = _stats['approved_campaigns'] ?? 0;
    final active = _stats['active_campaigns'] ?? 0;
    final completed = _stats['completed_campaigns'] ?? 0;
    final collected = _stats['total_blood_collected'] ?? 0;
    final registered = _stats['total_registered_donors'] ?? 0;

    return Container(
      padding: const EdgeInsets.all(12),
      color: Colors.grey.shade50,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _buildStatCard('Total', total.toString(), Colors.blue),
            _buildStatCard('Pending', pending.toString(), Colors.orange),
            _buildStatCard('Approved', approved.toString(), Colors.green),
            _buildStatCard('Active', active.toString(), Colors.red),
            _buildStatCard('Completed', completed.toString(), Colors.purple),
            _buildStatCard('🩸 Collected', '$collected units', Colors.red),
            _buildStatCard(
                '👤 Registered', registered.toString(), Colors.green),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String label, String value, Color color) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
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

  Widget _buildCampaignCard(Map<String, dynamic> campaign) {
    final status = campaign['status'] ?? 'pending';
    final isPending = status == 'pending';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isPending ? Colors.orange.shade300 : Colors.grey.shade200,
          width: isPending ? 2 : 1,
        ),
      ),
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
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child:
                      const Icon(Icons.bloodtype, color: Colors.red, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        campaign['campaign_name'] ?? 'Blood Donation Camp',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '🏥 ${campaign['hospital_name'] ?? 'Unknown Hospital'}',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: status == 'approved' || status == 'active'
                        ? Colors.green.withValues(alpha: 0.1)
                        : status == 'pending'
                            ? Colors.orange.withValues(alpha: 0.1)
                            : status == 'completed'
                                ? Colors.blue.withValues(alpha: 0.1)
                                : Colors.red.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    status.toUpperCase(),
                    style: TextStyle(
                      color: status == 'approved' || status == 'active'
                          ? Colors.green
                          : status == 'pending'
                              ? Colors.orange
                              : status == 'completed'
                                  ? Colors.blue
                                  : Colors.red,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              campaign['description'] ?? 'No description',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.location_on, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  campaign['location'] ?? 'N/A',
                  style: const TextStyle(fontSize: 12),
                ),
                const SizedBox(width: 16),
                const Icon(Icons.location_city, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  campaign['city'] ?? 'N/A',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.calendar_today, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  '${campaign['start_date']?.toString().split('T')[0] ?? ''} - ${campaign['end_date']?.toString().split('T')[0] ?? ''}',
                  style: const TextStyle(fontSize: 12),
                ),
                const SizedBox(width: 16),
                const Icon(Icons.access_time, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  '${campaign['start_time']?.toString().substring(0, 5) ?? ''} - ${campaign['end_time']?.toString().substring(0, 5) ?? ''}',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildDetailStat(
                      'Target', campaign['target_donors']?.toString() ?? '0'),
                  _buildDetailStat('Registered',
                      campaign['registered_donors']?.toString() ?? '0'),
                  _buildDetailStat('Collected',
                      campaign['total_blood_collected']?.toString() ?? '0'),
                  _buildDetailStat(
                      'Contact', campaign['contact_person'] ?? 'N/A'),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: (campaign['blood_groups_needed'] as List? ?? [])
                  .map((group) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.red.shade100,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          group,
                          style: TextStyle(
                            fontSize: 10,
                            color: Colors.red.shade700,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ))
                  .toList(),
            ),
            if (isPending) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _approveCampaign(campaign['id']),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                      child: const Text('✅ Approve'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _rejectCampaign(
                          campaign['id'], campaign['campaign_name']),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                      ),
                      child: const Text('❌ Reject'),
                    ),
                  ),
                ],
              ),
            ],
            if (status == 'approved')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: Colors.blue),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Campaign approved. Hospital can now activate it.',
                          style: TextStyle(fontSize: 12, color: Colors.blue),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (status == 'active')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.check_circle, size: 16, color: Colors.green),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Campaign is currently active',
                          style: TextStyle(fontSize: 12, color: Colors.green),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (status == 'completed')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.purple.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.celebration, size: 16, color: Colors.purple),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Campaign completed successfully! 🎉',
                          style: TextStyle(fontSize: 12, color: Colors.purple),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (status == 'rejected')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.cancel, size: 16, color: Colors.red),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Campaign rejected',
                          style: TextStyle(fontSize: 12, color: Colors.red),
                        ),
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

  Widget _buildDetailStat(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
          ),
        ),
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

  Future<void> _approveCampaign(int campaignId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approve Campaign'),
        content: const Text(
            'Are you sure you want to approve this blood donation campaign?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
            ),
            child: const Text('Approve'),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      final response = await ApiService.approveCampaign(campaignId);
      if (response['success'] && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Campaign approved successfully'),
            backgroundColor: Colors.green,
          ),
        );
        _loadData();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response['message'] ?? 'Failed to approve campaign'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _rejectCampaign(int campaignId, String campaignName) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject Campaign'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Reject $campaignName?'),
            const SizedBox(height: 16),
            const TextField(
              decoration: InputDecoration(
                labelText: 'Reason for Rejection',
                hintText: 'Please provide a reason',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
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
              // API call for rejection
              ApiService.rejectCampaign(campaignId);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('❌ Campaign rejected'),
                  backgroundColor: Colors.red,
                ),
              );
              _loadData();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }
}
