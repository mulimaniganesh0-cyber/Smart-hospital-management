// lib/screens/admin/admin_hospital_detail.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

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
    _loadHospitalData();
  }

  Future<void> _loadHospitalData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final resourcesResponse = await ApiService.getAdminHospitalResources(widget.hospitalId);
      if (resourcesResponse['success'] && resourcesResponse['data'] != null) {
        _hospitalData = resourcesResponse['data'];
      }

      final bloodResponse = await ApiService.getAdminHospitalBloodBank(widget.hospitalId);
      if (bloodResponse['success']) {
        _bloodBank = List<Map<String, dynamic>>.from(bloodResponse['data']);
      }
    } catch (e) {
      _errorMessage = 'Network error: $e';
    } finally {
      setState(() => _isLoading = false);
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
    // Safely get values using _toInt helper
    final generalBedsTotal = _toInt(_hospitalData?['general_beds_total']);
    final generalBedsAvailable = _toInt(_hospitalData?['general_beds_available']);
    final icuBedsTotal = _toInt(_hospitalData?['icu_beds_total']);
    final icuBedsAvailable = _toInt(_hospitalData?['icu_beds_available']);
    final ventilatorsTotal = _toInt(_hospitalData?['ventilators_total']);
    final ventilatorsAvailable = _toInt(_hospitalData?['ventilators_available']);
    final oxygenBedsTotal = _toInt(_hospitalData?['oxygen_beds_total']);
    final oxygenBedsAvailable = _toInt(_hospitalData?['oxygen_beds_available']);

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
                        elevation: 2,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Hospital Information',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 16),
                              _buildInfoRow(Icons.location_on, 'Address', _hospitalData?['address'] ?? 'N/A'),
                              _buildInfoRow(Icons.phone, 'Phone', _hospitalData?['phone'] ?? 'N/A'),
                              _buildInfoRow(Icons.email, 'Email', _hospitalData?['email'] ?? 'N/A'),
                              _buildInfoRow(Icons.business, 'City', _hospitalData?['city'] ?? 'N/A'),
                              _buildInfoRow(Icons.verified, 'Status', 
                                (_hospitalData?['is_verified'] ?? false) ? 'Verified' : 'Pending'),
                              _buildInfoRow(Icons.calendar_today, 'Registered', 
                                _hospitalData?['created_at']?.toString().split('T')[0] ?? 'N/A'),
                            ],
                          ),
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      
                      // Resources Card
                      Card(
                        elevation: 2,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text(
                                    'Resources Management',
                                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: Colors.blue.shade50,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(
                                      'Last updated: ${_hospitalData?['resources_updated_at']?.toString().split('T')[0] ?? 'N/A'}',
                                      style: TextStyle(fontSize: 10, color: Colors.blue.shade700),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              _buildResourceManagementCard(
                                title: 'General Beds',
                                total: generalBedsTotal,
                                available: generalBedsAvailable,
                                field: 'general_beds_total',
                                availableField: 'general_beds_available',
                                color: Colors.blue,
                                onUpdate: _updateResource,
                              ),
                              const SizedBox(height: 12),
                              _buildResourceManagementCard(
                                title: 'ICU Beds',
                                total: icuBedsTotal,
                                available: icuBedsAvailable,
                                field: 'icu_beds_total',
                                availableField: 'icu_beds_available',
                                color: Colors.red,
                                onUpdate: _updateResource,
                              ),
                              const SizedBox(height: 12),
                              _buildResourceManagementCard(
                                title: 'Ventilators',
                                total: ventilatorsTotal,
                                available: ventilatorsAvailable,
                                field: 'ventilators_total',
                                availableField: 'ventilators_available',
                                color: Colors.green,
                                onUpdate: _updateResource,
                              ),
                              const SizedBox(height: 12),
                              _buildResourceManagementCard(
                                title: 'Oxygen Beds',
                                total: oxygenBedsTotal,
                                available: oxygenBedsAvailable,
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
                        elevation: 2,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
                                  ElevatedButton.icon(
                                    onPressed: () => _showAddBloodDialog(context),
                                    icon: const Icon(Icons.add, size: 16),
                                    label: const Text('Add Blood'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.purple,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
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
                                    final units = _toInt(stock['units_available']);
                                    final isLow = units < 10;
                                    final isCritical = units == 0;
                                    return Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      decoration: BoxDecoration(
                                        color: isCritical ? Colors.red.shade100 : isLow ? Colors.orange.shade50 : Colors.green.shade50,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: isCritical ? Colors.red.shade300 : isLow ? Colors.orange.shade200 : Colors.green.shade200,
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Text(
                                                stock['blood_group'] ?? 'Unknown',
                                                style: TextStyle(
                                                  fontSize: 14,
                                                  fontWeight: FontWeight.bold,
                                                  color: isCritical ? Colors.red.shade800 : isLow ? Colors.orange.shade800 : Colors.green.shade800,
                                                ),
                                              ),
                                              Text(
                                                '$units units',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: isCritical ? Colors.red.shade600 : isLow ? Colors.orange.shade600 : Colors.green.shade600,
                                                ),
                                              ),
                                            ],
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
                      
                      const SizedBox(height: 16),
                      
                      // Danger Zone
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.red.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(Icons.warning, color: Colors.red.shade700),
                                const SizedBox(width: 8),
                                Text(
                                  'Danger Zone',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.red.shade700,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'Deleting this hospital will permanently remove all associated data including resources, staff, appointments, and patient records.',
                              style: TextStyle(color: Colors.grey[700], fontSize: 12),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                onPressed: _showDeleteConfirmation,
                                icon: const Icon(Icons.delete),
                                label: const Text('Delete Hospital'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.red,
                                  side: const BorderSide(color: Colors.red),
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                ),
                              ),
                            ),
                          ],
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
            child: Text(
              value,
              style: const TextStyle(fontSize: 14),
              overflow: TextOverflow.ellipsis,
            ),
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
                child: OutlinedButton(
                  onPressed: () => _showUpdateDialog(
                    context,
                    'Update Total $title',
                    field,
                    total,
                    onUpdate,
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.blue,
                    side: BorderSide(color: Colors.blue.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    minimumSize: const Size(0, 30),
                  ),
                  child: const Text('Update Total', style: TextStyle(fontSize: 11)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _showUpdateDialog(
                    context,
                    'Update Available $title',
                    availableField,
                    available,
                    onUpdate,
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.green,
                    side: BorderSide(color: Colors.green.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    minimumSize: const Size(0, 30),
                  ),
                  child: const Text('Update Available', style: TextStyle(fontSize: 11)),
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

  void _showDeleteConfirmation() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning, color: Colors.red),
            SizedBox(width: 8),
            Text('Delete Hospital'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Are you sure you want to delete ${widget.hospitalName}?'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â This action cannot be undone!',
                    style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'All data related to this hospital will be permanently deleted.',
                    style: TextStyle(fontSize: 12),
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
            onPressed: () async {
              Navigator.pop(context);
              final response = await ApiService.deleteHospital(widget.hospitalId);
              if (response['success'] && mounted) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('${widget.hospitalName} deleted successfully'),
                    backgroundColor: Colors.green,
                  ),
                );
                if (!context.mounted) return;
                Navigator.pop(context);
              } else if (mounted) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(response['message'] ?? 'Failed to delete hospital'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}
