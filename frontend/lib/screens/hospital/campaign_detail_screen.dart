// lib/screens/hospital/campaign_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/hospital_provider.dart';
import '../../services/api_service.dart';

class CampaignDetailScreen extends StatefulWidget {
  final int campaignId;
  final String campaignName;

  const CampaignDetailScreen({
    super.key,
    required this.campaignId,
    required this.campaignName,
  });

  @override
  State<CampaignDetailScreen> createState() => _CampaignDetailScreenState();
}

class _CampaignDetailScreenState extends State<CampaignDetailScreen> {
  Map<String, dynamic>? _campaign;
  List<Map<String, dynamic>> _registrations = [];
  List<Map<String, dynamic>> _donations = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final campaignResponse = await ApiService.getCampaignDetails(widget.campaignId);
      if (campaignResponse['success'] && mounted) {
        setState(() {
          _campaign = campaignResponse['data'];
        });
      }

      final registrationsResponse = await ApiService.getCampaignRegistrations(widget.campaignId);
      if (registrationsResponse['success'] && mounted) {
        setState(() {
          _registrations = List<Map<String, dynamic>>.from(registrationsResponse['data']);
        });
      }

      final donationsResponse = await ApiService.getCampaignDonations(widget.campaignId);
      if (donationsResponse['success'] && mounted) {
        setState(() {
          _donations = List<Map<String, dynamic>>.from(donationsResponse['data']);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Failed to load data: $e';
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
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.campaignName),
          backgroundColor: Colors.red,
          bottom: const TabBar(
            tabs: [
              Tab(text: '📋 Overview', icon: Icon(Icons.info)),
              Tab(text: '👤 Registrations', icon: Icon(Icons.people)),
              Tab(text: '🩸 Donations', icon: Icon(Icons.bloodtype)),
            ],
          ),
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
                        const Icon(Icons.error_outline, size: 64, color: Colors.red),
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
                : TabBarView(
                    children: [
                      _buildOverviewTab(),
                      _buildRegistrationsTab(),
                      _buildDonationsTab(),
                    ],
                  ),
      ),
    );
  }

  Widget _buildOverviewTab() {
    final campaign = _campaign;
    if (campaign == null) {
      return const Center(child: Text('Campaign not found'));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Campaign Details',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildDetailRow('Campaign Name', campaign['campaign_name'] ?? 'N/A'),
                  _buildDetailRow('Description', campaign['description'] ?? 'No description'),
                  _buildDetailRow('Location', campaign['location'] ?? 'N/A'),
                  _buildDetailRow('City', campaign['city'] ?? 'N/A'),
                  _buildDetailRow('Contact Person', campaign['contact_person'] ?? 'N/A'),
                  _buildDetailRow('Contact Phone', campaign['contact_phone'] ?? 'N/A'),
                  _buildDetailRow('Status', campaign['status']?.toUpperCase() ?? 'PENDING'),
                  _buildDetailRow('Start Date', campaign['start_date']?.toString().split('T')[0] ?? 'N/A'),
                  _buildDetailRow('End Date', campaign['end_date']?.toString().split('T')[0] ?? 'N/A'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Donation Statistics',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildStatItem('Target Donors', campaign['target_donors']?.toString() ?? '0'),
                      _buildStatItem('Registered', campaign['registered_donors']?.toString() ?? '0'),
                      _buildStatItem('Donated', _donations.length.toString()),
                      _buildStatItem('Blood Collected', '${campaign['total_blood_collected'] ?? 0} units'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: ((campaign['registered_donors'] ?? 0) / (campaign['target_donors'] ?? 50))
                          .clamp(0.0, 1.0),
                      backgroundColor: Colors.grey.shade200,
                      color: Colors.red,
                      minHeight: 8,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${((campaign['registered_donors'] ?? 0) / (campaign['target_donors'] ?? 50) * 100).toInt()}% of target achieved',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(color: Colors.grey[600], fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.red,
          ),
        ),
        Text(
          label,
          style: TextStyle(fontSize: 10, color: Colors.grey[600]),
        ),
      ],
    );
  }

  Widget _buildRegistrationsTab() {
    if (_registrations.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No registrations yet'),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _registrations.length,
      itemBuilder: (context, index) {
        final reg = _registrations[index];
        final status = reg['status'] ?? 'registered';
        
        Color statusColor;
        switch (status) {
          case 'donated':
            statusColor = Colors.green;
            break;
          case 'checked_in':
            statusColor = Colors.blue;
            break;
          case 'cancelled':
            statusColor = Colors.red;
            break;
          default:
            statusColor = Colors.orange;
        }

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
                        reg['donor_name'] ?? 'Unknown',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        status.toUpperCase(),
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('🩸 Blood Group: ${reg['blood_group'] ?? 'N/A'}'),
                Text('📱 ${reg['donor_phone'] ?? 'N/A'}'),
                if (reg['age'] != null)
                  Text('🎂 Age: ${reg['age']} years'),
                if (reg['weight'] != null)
                  Text('⚖️ Weight: ${reg['weight']} kg'),
                Text('📅 Registered: ${reg['registration_date']?.toString().split('T')[0] ?? ''}'),
                if (reg['units_donated'] != null && reg['units_donated'] > 0)
                  Text('🩸 Units Donated: ${reg['units_donated']}'),
                if (status == 'registered')
                  const SizedBox(height: 8),
                if (status == 'registered')
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => _showRecordDonationDialog(context, reg),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('✅ Record Donation'),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildDonationsTab() {
    if (_donations.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.bloodtype, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No donations recorded yet'),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _donations.length,
      itemBuilder: (context, index) {
        final donation = _donations[index];
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
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            Icons.bloodtype,
                            color: Colors.red,
                            size: 24,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              donation['donor_name'] ?? 'Unknown',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            Text(
                              '${donation['blood_group']} - ${donation['units_donated']} units',
                              style: TextStyle(
                                color: Colors.red.shade700,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.green.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'Batch: ${donation['batch_number'] ?? 'N/A'}',
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.green,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.calendar_today, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      donation['donation_date']?.toString().split('T')[0] ?? '',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                    const SizedBox(width: 16),
                    const Icon(Icons.access_time, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      donation['donation_time']?.toString().substring(0, 5) ?? '',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ),
                if (donation['expiry_date'] != null)
                  Text(
                    'Expires: ${donation['expiry_date']?.toString().split('T')[0] ?? ''}',
                    style: TextStyle(fontSize: 12, color: Colors.orange),
                  ),
                if (donation['collected_by'] != null)
                  Text(
                    'Collected by: ${donation['collected_by']}',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showRecordDonationDialog(BuildContext context, Map<String, dynamic> registration) {
    final unitsController = TextEditingController(text: '1');
    final collectedByController = TextEditingController();
    final hemoglobinController = TextEditingController();
    final bpSystolicController = TextEditingController();
    final bpDiastolicController = TextEditingController();
    final pulseController = TextEditingController();
    final temperatureController = TextEditingController();
    DateTime? donationDate = DateTime.now();
    TimeOfDay? donationTime = TimeOfDay.now();
    String selectedBloodGroup = registration['blood_group'] ?? 'A+';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text('Record Donation: ${registration['donor_name']}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  value: selectedBloodGroup,
                  decoration: const InputDecoration(
                    labelText: 'Blood Group *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.water_drop),
                  ),
                  items: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
                      .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                      .toList(),
                  onChanged: (value) => setState(() => selectedBloodGroup = value!),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: unitsController,
                  decoration: const InputDecoration(
                    labelText: 'Units Donated *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.numbers),
                  ),
                  keyboardType: TextInputType.number,
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
                            firstDate: DateTime.now().subtract(const Duration(days: 7)),
                            lastDate: DateTime.now(),
                          );
                          if (date != null) {
                            setState(() => donationDate = date);
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
                                  donationDate != null
                                      ? 'Date: ${donationDate!.day}/${donationDate!.month}/${donationDate!.year}'
                                      : 'Donation Date *',
                                  style: TextStyle(
                                    color: donationDate != null ? Colors.black : Colors.grey,
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
                            initialTime: TimeOfDay.now(),
                          );
                          if (time != null) {
                            setState(() => donationTime = time);
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
                                  donationTime != null
                                      ? 'Time: ${donationTime!.format(context)}'
                                      : 'Donation Time *',
                                  style: TextStyle(
                                    color: donationTime != null ? Colors.black : Colors.grey,
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
                TextField(
                  controller: collectedByController,
                  decoration: const InputDecoration(
                    labelText: 'Collected By',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Vitals (Optional)',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: hemoglobinController,
                        decoration: const InputDecoration(
                          labelText: 'Hemoglobin (g/dL)',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.bloodtype),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: bpSystolicController,
                              decoration: const InputDecoration(
                                labelText: 'Systolic',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                          const Text('/'),
                          Expanded(
                            child: TextField(
                              controller: bpDiastolicController,
                              decoration: const InputDecoration(
                                labelText: 'Diastolic',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: pulseController,
                        decoration: const InputDecoration(
                          labelText: 'Pulse (bpm)',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.favorite),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: temperatureController,
                        decoration: const InputDecoration(
                          labelText: 'Temperature (°F)',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.thermostat),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.orange.shade200),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: Colors.orange),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Recording this donation will add blood to the hospital blood bank.',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
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
                final units = int.tryParse(unitsController.text) ?? 0;
                if (units <= 0) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please enter valid units'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                if (donationDate == null || donationTime == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please select donation date and time'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                Navigator.pop(context);

                final response = await ApiService.recordDonation({
                  'registration_id': registration['id'],
                  'blood_group': selectedBloodGroup,
                  'units_donated': units,
                  'donation_date': donationDate!.toIso8601String().split('T')[0],
                  'donation_time': '${donationTime!.hour.toString().padLeft(2, '0')}:${donationTime!.minute.toString().padLeft(2, '0')}:00',
                  'collected_by': collectedByController.text,
                  'hemoglobin_level': double.tryParse(hemoglobinController.text),
                  'blood_pressure': bpSystolicController.text.isNotEmpty && bpDiastolicController.text.isNotEmpty 
                      ? '${bpSystolicController.text}/${bpDiastolicController.text}' 
                      : null,
                  'pulse_rate': int.tryParse(pulseController.text),
                  'temperature': double.tryParse(temperatureController.text),
                  'notes': '',
                });

                if (response['success'] && mounted) {
                  // Refresh all data
                  await _loadData();
                  
                  // Also refresh the hospital provider to update blood bank
                  final hospitalProvider = Provider.of<HospitalProvider>(context, listen: false);
                  await hospitalProvider.loadHospitalData();
                  
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('✅ Donation recorded! ${units} unit(s) of ${selectedBloodGroup} added to blood bank.'),
                        backgroundColor: Colors.green,
                      ),
                    );
                  }
                } else if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(response['message'] ?? 'Failed to record donation'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
              ),
              child: const Text('✅ Record Donation'),
            ),
          ],
        ),
      ),
    );
  }
}