// lib/screens/hospital/hospital_campaigns.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class HospitalCampaigns extends StatefulWidget {
  const HospitalCampaigns({super.key});

  @override
  State<HospitalCampaigns> createState() => _HospitalCampaignsState();
}

class _HospitalCampaignsState extends State<HospitalCampaigns> {
  List<Map<String, dynamic>> _campaigns = [];
  bool _isLoading = true;
  String? _errorMessage;
  String _selectedFilter = 'all';

  final List<String> _filters = ['all', 'pending', 'approved', 'active', 'completed', 'cancelled'];

  @override
  void initState() {
    super.initState();
    _loadCampaigns();
  }

  Future<void> _loadCampaigns() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await ApiService.getHospitalCampaigns();
      if (response['success']) {
        setState(() {
          _campaigns = List<Map<String, dynamic>>.from(response['data']);
        });
      } else {
        _errorMessage = response['message'] ?? 'Failed to load campaigns';
      }
    } catch (e) {
      _errorMessage = 'Network error: $e';
    } finally {
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredCampaigns {
    if (_selectedFilter == 'all') return _campaigns;
    return _campaigns.where((c) => c['status'] == _selectedFilter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Blood Donation Camps'),
        backgroundColor: Colors.red,
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showCreateCampaignDialog(context),
            tooltip: 'Create Campaign',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadCampaigns,
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
                        onPressed: _loadCampaigns,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    // Filter Chips
                    Container(
                      height: 50,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: _filters.length,
                        itemBuilder: (context, index) {
                          final filter = _filters[index];
                          final count = _campaigns.where((c) => 
                            filter == 'all' ? true : c['status'] == filter
                          ).length;
                          return Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text('${filter.toUpperCase()} ($count)'),
                              selected: _selectedFilter == filter,
                              onSelected: (selected) {
                                setState(() => _selectedFilter = filter);
                              },
                              selectedColor: Colors.red.shade100,
                              labelStyle: TextStyle(
                                fontSize: 11,
                                fontWeight: _selectedFilter == filter ? FontWeight.bold : FontWeight.normal,
                              ),
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
                                  Icon(Icons.campaign, size: 64, color: Colors.grey),
                                  SizedBox(height: 16),
                                  Text('No campaigns found'),
                                  Text(
                                    'Create your first blood donation campaign',
                                    style: TextStyle(color: Colors.grey),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filteredCampaigns.length,
                              itemBuilder: (context, index) {
                                return _buildCampaignCard(_filteredCampaigns[index]);
                              },
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildCampaignCard(Map<String, dynamic> campaign) {
    final status = campaign['status'] ?? 'pending';
    final isPending = status == 'pending';
    final isActive = status == 'active' || status == 'approved';
    
    Color statusColor;
    switch (status) {
      case 'approved':
      case 'active':
        statusColor = Colors.green;
        break;
      case 'pending':
        statusColor = Colors.orange;
        break;
      case 'completed':
        statusColor = Colors.blue;
        break;
      case 'cancelled':
      case 'rejected':
        statusColor = Colors.red;
        break;
      default:
        statusColor = Colors.grey;
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
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.bloodtype, color: Colors.red, size: 24),
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
                        campaign['location'] ?? 'Location not specified',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
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
                    status.toUpperCase(),
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.calendar_today, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  '${campaign['start_date']?.toString().split('T')[0] ?? ''} - ${campaign['end_date']?.toString().split('T')[0] ?? ''}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                const SizedBox(width: 16),
                const Icon(Icons.access_time, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  '${campaign['start_time']?.toString().substring(0, 5) ?? ''} - ${campaign['end_time']?.toString().substring(0, 5) ?? ''}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
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
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildStatItem(
                    'Target',
                    campaign['target_donors']?.toString() ?? '0',
                    Colors.blue,
                  ),
                  _buildStatItem(
                    'Registered',
                    campaign['registered_donors']?.toString() ?? '0',
                    Colors.green,
                  ),
                  _buildStatItem(
                    'Remaining',
                    ((campaign['target_donors'] ?? 0) - (campaign['registered_donors'] ?? 0)).toString(),
                    Colors.orange,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: (campaign['blood_groups_needed'] as List? ?? ['A+', 'A-', 'B+', 'B-', 'O+', 'O-'])
                  .map((group) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
            const SizedBox(height: 12),
            if (isPending)
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _updateCampaignStatus(campaign['id'], 'active'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                      child: const Text('Activate'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _updateCampaignStatus(campaign['id'], 'cancelled'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                ],
              ),
            if (isActive)
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _updateCampaignStatus(campaign['id'], 'completed'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                      child: const Text('Mark Complete'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _updateCampaignStatus(campaign['id'], 'cancelled'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                ],
              ),
            if (status == 'completed' || status == 'cancelled' || status == 'rejected')
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, size: 16, color: Colors.grey),
                    SizedBox(width: 8),
                    Text(
                      'This campaign is closed',
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
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
    );
  }

  // lib/screens/hospital/hospital_campaigns.dart - Update the _updateCampaignStatus method

Future<void> _updateCampaignStatus(int campaignId, String status) async {
  final confirm = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Update Campaign Status'),
      content: Text('Are you sure you want to mark this campaign as $status?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, true),
          style: ElevatedButton.styleFrom(
            backgroundColor: status == 'cancelled' ? Colors.red : Colors.green,
          ),
          child: Text(status.toUpperCase()),
        ),
      ],
    ),
  );

  if (confirm == true && mounted) {
    final response = await ApiService.updateCampaignStatus(campaignId, status);
    if (mounted) {
      if (response['success']) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Campaign status updated to $status'),
            backgroundColor: Colors.green,
          ),
        );
        _loadCampaigns();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response['message'] ?? 'Failed to update status'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

  void _showCreateCampaignDialog(BuildContext context) {
    final nameController = TextEditingController();
    final descriptionController = TextEditingController();
    final locationController = TextEditingController();
    final cityController = TextEditingController();
    final contactPersonController = TextEditingController();
    final contactPhoneController = TextEditingController();
    // Use TextEditingController with initial value for target donors
    final targetDonorsController = TextEditingController(text: '50');
    
    DateTime? startDate;
    DateTime? endDate;
    TimeOfDay? startTime;
    TimeOfDay? endTime;
    int targetDonors = 50;
    List<String> selectedBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-'];
    final List<String> allBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Create Blood Donation Camp'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Campaign Name *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.title),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descriptionController,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.description),
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: locationController,
                  decoration: const InputDecoration(
                    labelText: 'Location *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.location_on),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: cityController,
                  decoration: const InputDecoration(
                    labelText: 'City *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.location_city),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: DateTime.now(),
                            firstDate: DateTime.now(),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                          );
                          if (date != null) {
                            setState(() => startDate = date);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today, color: Colors.red),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  startDate != null
                                      ? 'Start: ${startDate!.day}/${startDate!.month}/${startDate!.year}'
                                      : 'Start Date *',
                                  style: TextStyle(
                                    color: startDate != null ? Colors.black : Colors.grey,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: startDate ?? DateTime.now().add(const Duration(days: 7)),
                            firstDate: startDate ?? DateTime.now(),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                          );
                          if (date != null) {
                            setState(() => endDate = date);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today, color: Colors.red),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  endDate != null
                                      ? 'End: ${endDate!.day}/${endDate!.month}/${endDate!.year}'
                                      : 'End Date *',
                                  style: TextStyle(
                                    color: endDate != null ? Colors.black : Colors.grey,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () async {
                          final time = await showTimePicker(
                            context: context,
                            initialTime: TimeOfDay.now(),
                          );
                          if (time != null) {
                            setState(() => startTime = time);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.access_time, color: Colors.red),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  startTime != null
                                      ? 'Start: ${startTime!.format(context)}'
                                      : 'Start Time *',
                                  style: TextStyle(
                                    color: startTime != null ? Colors.black : Colors.grey,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () async {
                          final time = await showTimePicker(
                            context: context,
                            initialTime: startTime ?? TimeOfDay.now(),
                          );
                          if (time != null) {
                            setState(() => endTime = time);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.access_time, color: Colors.red),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  endTime != null
                                      ? 'End: ${endTime!.format(context)}'
                                      : 'End Time *',
                                  style: TextStyle(
                                    color: endTime != null ? Colors.black : Colors.grey,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: targetDonorsController,
                        decoration: const InputDecoration(
                          labelText: 'Target Donors',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.people),
                        ),
                        keyboardType: TextInputType.number,
                        onChanged: (value) {
                          targetDonors = int.tryParse(value) ?? 50;
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: contactPersonController,
                        decoration: const InputDecoration(
                          labelText: 'Contact Person',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.person),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: contactPhoneController,
                  decoration: const InputDecoration(
                    labelText: 'Contact Phone',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.phone),
                  ),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Blood Groups Needed',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: allBloodGroups.map((group) {
                    final isSelected = selectedBloodGroups.contains(group);
                    return FilterChip(
                      label: Text(group),
                      selected: isSelected,
                      onSelected: (selected) {
                        setState(() {
                          if (selected) {
                            selectedBloodGroups.add(group);
                          } else {
                            selectedBloodGroups.remove(group);
                          }
                        });
                      },
                      selectedColor: Colors.red.shade100,
                      checkmarkColor: Colors.red,
                    );
                  }).toList(),
                ),
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
                    locationController.text.isEmpty ||
                    cityController.text.isEmpty ||
                    startDate == null ||
                    endDate == null ||
                    startTime == null ||
                    endTime == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please fill all required fields'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                targetDonors = int.tryParse(targetDonorsController.text) ?? 50;

                Navigator.pop(context);

                final response = await ApiService.createCampaign({
                  'campaign_name': nameController.text,
                  'description': descriptionController.text,
                  'location': locationController.text,
                  'city': cityController.text,
                  'start_date': startDate!.toIso8601String().split('T')[0],
                  'end_date': endDate!.toIso8601String().split('T')[0],
                  'start_time': '${startTime!.hour.toString().padLeft(2, '0')}:${startTime!.minute.toString().padLeft(2, '0')}:00',
                  'end_time': '${endTime!.hour.toString().padLeft(2, '0')}:${endTime!.minute.toString().padLeft(2, '0')}:00',
                  'target_donors': targetDonors,
                  'blood_groups_needed': selectedBloodGroups,
                  'contact_person': contactPersonController.text,
                  'contact_phone': contactPhoneController.text,
                });

                if (response['success']) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Campaign created successfully!'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  _loadCampaigns();
                } else {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(response['message'] ?? 'Failed to create campaign'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
              ),
              child: const Text('Create Campaign'),
            ),
          ],
        ),
      ),
    );
  }
}
