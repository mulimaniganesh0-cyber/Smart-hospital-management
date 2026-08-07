// lib/screens/hospital/blood_bank_expiry.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class BloodBankExpiryManagement extends StatefulWidget {
  const BloodBankExpiryManagement({super.key});

  @override
  State<BloodBankExpiryManagement> createState() => _BloodBankExpiryManagementState();
}

class _BloodBankExpiryManagementState extends State<BloodBankExpiryManagement> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _bloodStock = [];
  List<Map<String, dynamic>> _notifications = [];
  Map<String, dynamic> _summary = {};
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  // lib/screens/hospital/blood_bank_expiry.dart - Update _loadData method

Future<void> _loadData() async {
  if (!context.mounted) return;
  
  setState(() {
    _isLoading = true;
    _errorMessage = null;
  });

  try {
    final response = await ApiService.getBloodStockWithExpiry();
    debugPrint('Blood stock response: $response');
    
    if (!context.mounted) return;
    
    if (response['success'] && response['data'] != null) {
      setState(() {
        _bloodStock = List<Map<String, dynamic>>.from(response['data']['blood_stock'] ?? []);
        _notifications = List<Map<String, dynamic>>.from(response['data']['notifications'] ?? []);
        _summary = response['data']['summary'] ?? {};
      });
    } else {
      setState(() {
        _errorMessage = response['message'] ?? 'Failed to load blood stock';
      });
    }
  } catch (e) {
    debugPrint('Error loading blood stock: $e');
    if (mounted) {
      setState(() {
        _errorMessage = 'Network error: $e';
      });
    }
  } finally {
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }
}

  // Fixed _showNotifications method with proper context
  void _showNotifications(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.all(16),
        height: MediaQuery.of(context).size.height * 0.6,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Notifications',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: _notifications.isEmpty
                  ? const Center(
                      child: Text('No notifications'),
                    )
                  : ListView.builder(
                      itemCount: _notifications.length,
                      itemBuilder: (context, index) {
                        final notif = _notifications[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            leading: Icon(
                              notif['notification_type'] == 'critical'
                                  ? Icons.warning_amber
                                  : Icons.info,
                              color: notif['notification_type'] == 'critical'
                                  ? Colors.red
                                  : Colors.orange,
                            ),
                            title: Text(notif['message'] ?? ''),
                            subtitle: Text(
                              notif['created_at']?.toString().split('T')[0] ?? '',
                            ),
                            trailing: notif['is_read'] == false
                                ? const Icon(Icons.circle, color: Colors.red, size: 12)
                                : null,
                          ),
                        );
                      },
                    ),
            ),
            if (_notifications.isNotEmpty)
              TextButton(
                onPressed: () async {
                  await ApiService.markAllNotificationsRead();
                  _loadData();
                  if (!context.mounted) return;
                  Navigator.pop(context);
                },
                child: const Text('Mark all as read'),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Blood Bank Management'),
        backgroundColor: Colors.red,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
          IconButton(
            icon: const Icon(Icons.notifications),
            onPressed: () => _showNotifications(context),
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
              : Column(
                  children: [
                    // Summary Cards
                    _buildSummaryCards(),
                    
                    // Add Blood Button
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: ElevatedButton.icon(
                        onPressed: () => _showAddBloodDialog(context),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Blood Stock'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                          minimumSize: const Size(double.infinity, 50),
                        ),
                      ),
                    ),
                    
                    // Blood Stock List
                    Expanded(
                      child: _bloodStock.isEmpty
                          ? const Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.inventory, size: 64, color: Colors.grey),
                                  SizedBox(height: 16),
                                  Text('No blood stock available'),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(8),
                              itemCount: _bloodStock.length,
                              itemBuilder: (context, index) {
                                return _buildBloodCard(_bloodStock[index]);
                              },
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildSummaryCards() {
    final total = _summary['total_units'] ?? 0;
    final good = _summary['by_status']?['good'] ?? 0;
    final warning = _summary['by_status']?['warning'] ?? 0;
    final critical = _summary['by_status']?['critical'] ?? 0;

    return Container(
      padding: const EdgeInsets.all(12),
      color: Colors.grey.shade50,
      child: Row(
        children: [
          _buildSummaryCard('Total', total.toString(), Colors.blue),
          _buildSummaryCard('Good', good.toString(), Colors.green),
          _buildSummaryCard('Warning', warning.toString(), Colors.orange),
          _buildSummaryCard('Critical', critical.toString(), Colors.red),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        padding: const EdgeInsets.all(6),
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
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: TextStyle(fontSize: 9, color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBloodCard(Map<String, dynamic> blood) {
    final status = blood['status'] ?? 'good';
    final daysRemaining = blood['days_remaining']?.toInt() ?? 0;
    
    Color statusColor;
    String statusLabel;
    
    switch (status) {
      case 'expired':
        statusColor = Colors.grey;
        statusLabel = 'Expired';
        break;
      case 'critical':
        statusColor = Colors.red;
        statusLabel = 'Critical';
        break;
      case 'warning':
        statusColor = Colors.orange;
        statusLabel = 'Warning';
        break;
      default:
        statusColor = Colors.green;
        statusLabel = 'Good';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
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
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.water_drop,
                        color: statusColor,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${blood['blood_group']} Blood',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        Text(
                          'Batch: ${blood['batch_number'] ?? 'N/A'}',
                          style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStat('Units', blood['units_available']?.toString() ?? '0'),
                _buildStat('Donor', blood['donor_name'] ?? 'Unknown'),
                _buildStat('Days Left', daysRemaining.toString()),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Expires: ${blood['expiry_date']?.toString().split('T')[0] ?? 'N/A'}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                if (status != 'expired' && blood['units_available'] > 0)
                  ElevatedButton(
                    onPressed: () => _useBlood(context, blood),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      minimumSize: const Size(80, 32),
                    ),
                    child: const Text('Use'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStat(String label, String value) {
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
          style: TextStyle(fontSize: 10, color: Colors.grey[600]),
        ),
      ],
    );
  }

  void _showAddBloodDialog(BuildContext context) {
    String selectedGroup = 'A+';
    int units = 1;
    DateTime? expiryDate;
    DateTime? donationDate = DateTime.now();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Blood Stock'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedGroup,
                decoration: const InputDecoration(
                  labelText: 'Blood Group *',
                  border: OutlineInputBorder(),
                ),
                items: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
                    .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                    .toList(),
                onChanged: (value) => selectedGroup = value!,
              ),
              const SizedBox(height: 12),
              TextFormField(
                decoration: const InputDecoration(
                  labelText: 'Units *',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                initialValue: '1',
                onChanged: (value) => units = int.tryParse(value) ?? 1,
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: DateTime.now().add(const Duration(days: 42)),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date != null) {
                    setState(() => expiryDate = date);
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
                      const Icon(Icons.explore, color: Colors.red),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          expiryDate != null
                              ? 'Expiry Date: ${expiryDate!.day}/${expiryDate!.month}/${expiryDate!.year}'
                              : 'Select Expiry Date *',
                          style: TextStyle(
                            color: expiryDate != null ? Colors.black : Colors.grey,
                          ),
                        ),
                      ),
                    ],
                  ),
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
              if (expiryDate == null) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please select expiry date')),
                );
                return;
              }

              Navigator.pop(context);
              
              final response = await ApiService.addBloodWithExpiry({
                'blood_group': selectedGroup,
                'units': units,
                'donation_date': donationDate.toIso8601String().split('T')[0],
                'expiry_date': expiryDate!.toIso8601String().split('T')[0],
                'donor_name': '',
                'donor_phone': '',
              });

              if (response['success']) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Blood added successfully'),
                    backgroundColor: Colors.green,
                  ),
                );
                _loadData();
              } else {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(response['message'] ?? 'Failed to add blood'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Add Blood'),
          ),
        ],
      ),
    );
  }

  void _useBlood(BuildContext context, Map<String, dynamic> blood) {
    final unitsController = TextEditingController(text: '1');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Use ${blood['blood_group']} Blood'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Available: ${blood['units_available']} units'),
            const SizedBox(height: 12),
            TextFormField(
              controller: unitsController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Units to use *',
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
            onPressed: () async {
              final units = int.tryParse(unitsController.text) ?? 0;
              if (units <= 0 || units > (blood['units_available'] ?? 0)) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Invalid units')),
                );
                return;
              }

              Navigator.pop(context);
              
              final response = await ApiService.useBloodUnits({
                'blood_group': blood['blood_group'],
                'units_required': units,
                'used_for': 'Patient treatment',
              });

              if (response['success']) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Blood units used successfully'),
                    backgroundColor: Colors.green,
                  ),
                );
                _loadData();
              } else {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(response['message'] ?? 'Failed to use blood'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Use Blood'),
          ),
        ],
      ),
    );
  }
}
