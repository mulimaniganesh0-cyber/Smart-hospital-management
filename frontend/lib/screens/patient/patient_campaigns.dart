// lib/screens/patient/patient_campaigns.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class PatientCampaigns extends StatefulWidget {
  const PatientCampaigns({super.key});

  @override
  State<PatientCampaigns> createState() => _PatientCampaignsState();
}

class _PatientCampaignsState extends State<PatientCampaigns> {
  List<Map<String, dynamic>> _campaigns = [];
  List<Map<String, dynamic>> _myRegistrations = [];
  bool _isLoading = true;
  String? _errorMessage;

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
      final campaignsResponse = await ApiService.getAllCampaigns();
      if (campaignsResponse['success']) {
        setState(() {
          _campaigns = List<Map<String, dynamic>>.from(campaignsResponse['data']);
        });
      }

      final registrationsResponse = await ApiService.getMyRegistrations();
      if (registrationsResponse['success']) {
        setState(() {
          _myRegistrations = List<Map<String, dynamic>>.from(registrationsResponse['data']);
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to load data: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Blood Donation Camps'),
          backgroundColor: Colors.red,
          bottom: const TabBar(
            tabs: [
              Tab(text: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹ Available Camps', icon: Icon(Icons.campaign)),
              Tab(text: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â My Registrations', icon: Icon(Icons.person)),
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
                      _buildCampaignsList(),
                      _buildRegistrationsList(),
                    ],
                  ),
      ),
    );
  }

  Widget _buildCampaignsList() {
    if (_campaigns.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.campaign, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No blood donation camps available'),
            Text(
              'Check back later for upcoming camps',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _campaigns.length,
      itemBuilder: (context, index) {
        final campaign = _campaigns[index];
        final isRegistered = _myRegistrations.any((r) => r['campaign_id'] == campaign['id']);
        
        return Card(
          margin: const EdgeInsets.only(bottom: 16),
          elevation: 2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Hospital & Status
                Row(
                  children: [
                    const Icon(Icons.local_hospital, color: Colors.red),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        campaign['hospital_name'] ?? 'Hospital',
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: campaign['status'] == 'active' 
                            ? Colors.green.withValues(alpha: 0.1) 
                            : Colors.blue.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        campaign['status']?.toUpperCase() ?? 'ACTIVE',
                        style: TextStyle(
                          fontSize: 10,
                          color: campaign['status'] == 'active' ? Colors.green : Colors.blue,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                // Campaign Name
                Text(
                  campaign['campaign_name'] ?? 'Blood Donation Camp',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                // Description
                Text(
                  campaign['description'] ?? 'No description',
                  style: TextStyle(color: Colors.grey[600], fontSize: 14),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),
                // Details
                Row(
                  children: [
                    const Icon(Icons.location_on, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      campaign['location'] ?? 'Location not specified',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.calendar_today, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      '${campaign['start_date']?.toString().split('T')[0] ?? ''} - ${campaign['end_date']?.toString().split('T')[0] ?? ''}',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Donors Progress
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Donors Registered',
                            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                          ),
                          Text(
                            '${campaign['registered_donors'] ?? 0}/${campaign['target_donors'] ?? 50}',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              color: Colors.red,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: ((campaign['registered_donors'] ?? 0) / (campaign['target_donors'] ?? 50))
                              .clamp(0.0, 1.0),
                          backgroundColor: Colors.grey.shade200,
                          color: Colors.red,
                          minHeight: 6,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.bloodtype, size: 14, color: Colors.red),
                          const SizedBox(width: 4),
                          Text(
                            'Blood Groups Needed:',
                            style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: (campaign['blood_groups_needed'] as List? ?? [])
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
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // Action Buttons
                if (campaign['status'] == 'active' || campaign['status'] == 'approved')
                  isRegistered
                      ? Container(
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
                                'You are registered for this camp',
                                style: TextStyle(color: Colors.green),
                              ),
                            ],
                          ),
                        )
                      : SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () => _showRegistrationDialog(context, campaign),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.red,
                              foregroundColor: Colors.white,
                            ),
                            child: const Text('Register Now'),
                          ),
                        ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildRegistrationsList() {
    if (_myRegistrations.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.assignment, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No registrations yet'),
            Text(
              'Register for a blood donation camp to save lives',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _myRegistrations.length,
      itemBuilder: (context, index) {
        final reg = _myRegistrations[index];
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
                        reg['campaign_name'] ?? 'Blood Donation Camp',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
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
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('ÃƒÂ°Ã…Â¸Ã‚ÂÃ‚Â¥ ${reg['hospital_name'] ?? 'Hospital'}'),
                Text('ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â ${reg['location'] ?? 'Location not specified'}'),
                Text('ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¦ ${reg['start_date']?.toString().split('T')[0] ?? ''}'),
                if (reg['units_donated'] != null && reg['units_donated'] > 0)
                  Text('ÃƒÂ°Ã…Â¸Ã‚Â©Ã‚Â¸ Units Donated: ${reg['units_donated']}'),
                Text(
                  'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â Registered: ${reg['registration_date']?.toString().split('T')[0] ?? ''}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                if (status == 'registered' || status == 'checked_in')
                  const SizedBox(height: 8),
                if (status == 'registered' || status == 'checked_in')
                  OutlinedButton(
                    onPressed: () {
                      _showCancelRegistrationDialog(context, reg['id']);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                    ),
                    child: const Text('Cancel Registration'),
                  ),
                if (status == 'donated')
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.bloodtype, color: Colors.green),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Thank you for donating! You saved a life.',
                            style: TextStyle(color: Colors.green),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showRegistrationDialog(BuildContext context, Map<String, dynamic> campaign) {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final emailController = TextEditingController();
    String selectedBloodGroup = 'A+';
    final ageController = TextEditingController();
    final weightController = TextEditingController();
    DateTime? lastDonationDate;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text('Register for ${campaign['campaign_name'] ?? 'Camp'}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Full Name *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneController,
                  decoration: const InputDecoration(
                    labelText: 'Phone Number *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.phone),
                  ),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailController,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.email),
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedBloodGroup,
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
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: ageController,
                        decoration: const InputDecoration(
                          labelText: 'Age',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.cake),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: weightController,
                        decoration: const InputDecoration(
                          labelText: 'Weight (kg)',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.fitness_center),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                InkWell(
                  onTap: () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now().subtract(const Duration(days: 180)),
                      firstDate: DateTime.now().subtract(const Duration(days: 365)),
                      lastDate: DateTime.now(),
                    );
                    if (date != null) {
                      setState(() => lastDonationDate = date);
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.calendar_today, color: Colors.red),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            lastDonationDate != null
                                ? 'Last Donation: ${lastDonationDate!.day}/${lastDonationDate!.month}/${lastDonationDate!.year}'
                                : 'Last Donation Date (Optional)',
                            style: TextStyle(
                              color: lastDonationDate != null ? Colors.black : Colors.grey,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Please ensure you meet eligibility criteria before registering.',
                  style: TextStyle(fontSize: 12, color: Colors.orange),
                  textAlign: TextAlign.center,
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
                    phoneController.text.isEmpty ||
                    ageController.text.isEmpty ||
                    weightController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please fill all required fields'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                Navigator.pop(context);

                final response = await ApiService.registerForCampaign({
                  'campaign_id': campaign['id'],
                  'donor_name': nameController.text,
                  'donor_phone': phoneController.text,
                  'donor_email': emailController.text,
                  'blood_group': selectedBloodGroup,
                  'age': int.tryParse(ageController.text) ?? 0,
                  'weight': double.tryParse(weightController.text) ?? 0.0,
                  'last_donation_date': lastDonationDate?.toIso8601String().split('T')[0],
                  'medical_conditions': '',
                });

                if (response['success'] && mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Successfully registered for blood donation camp!'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  _loadData();
                } else if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(response['message'] ?? 'Registration failed'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
              ),
              child: const Text('Register Now'),
            ),
          ],
        ),
      ),
    );
  }

  void _showCancelRegistrationDialog(BuildContext context, int registrationId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel Registration'),
        content: const Text('Are you sure you want to cancel your registration?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('No'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              // Implement cancellation API call
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Registration cancelled'),
                  backgroundColor: Colors.orange,
                ),
              );
              _loadData();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );
  }
}
