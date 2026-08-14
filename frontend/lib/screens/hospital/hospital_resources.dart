// lib/screens/hospital/hospital_resources.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/hospital_provider.dart';
import '../../services/api_service.dart';

class HospitalResources extends StatefulWidget {
  const HospitalResources({super.key});

  @override
  State<HospitalResources> createState() => _HospitalResourcesState();
}

class _HospitalResourcesState extends State<HospitalResources> {
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<HospitalProvider>(context, listen: false).loadHospitalData();
    });
  }

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
  Widget build(BuildContext context) {
    final provider = Provider.of<HospitalProvider>(context);
    final data = provider.hospitalData;
    final resources = data?['resources'] is Map
        ? Map<String, dynamic>.from(data!['resources'] as Map)
        : <String, dynamic>{};

    // Handle error state
    if (provider.errorMessage != null && provider.hospitalData == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Manage Resources'),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.orange),
              const SizedBox(height: 16),
              Text(
                provider.errorMessage ?? 'Unable to load resources',
                style: const TextStyle(fontSize: 16),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => provider.loadHospitalData(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (provider.isLoading && provider.hospitalData == null) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Loading resources...'),
            ],
          ),
        ),
      );
    }

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Manage Resources'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Resources', icon: Icon(Icons.medical_services)),
              Tab(text: 'Requests', icon: Icon(Icons.assignment)),
            ],
          ), /*
            tabs: [
              Tab(text: 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â  Resources', icon: Icon(Icons.medical_services)),
              Tab(text: 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ Requests', icon: Icon(Icons.assignment)),
            ],
          ),
          */ actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () => provider.loadHospitalData(),
            ),
          ],
        ),
        body: TabBarView(
          children: [
            _buildResourcesTab(context, provider, resources),
            _buildRequestsTab(context, provider),
          ],
        ),
      ),
    );
  }

  Widget _buildResourcesTab(
    BuildContext context,
    HospitalProvider provider,
    Map<String, dynamic> resources,
  ) {
    final generalBeds = resources['generalBeds'] ?? {};
    final icuBeds = resources['icuBeds'] ?? {};
    final ventilators = resources['ventilators'] ?? {};
    final oxygenBeds = resources['oxygenBeds'] ?? {};

    final generalTotal = _toInt(generalBeds['total']);
    final generalAvailable = _toInt(generalBeds['available']);
    final icuTotal = _toInt(icuBeds['total']);
    final icuAvailable = _toInt(icuBeds['available']);
    final ventTotal = _toInt(ventilators['total']);
    final ventAvailable = _toInt(ventilators['available']);
    final oxygenTotal = _toInt(oxygenBeds['total']);
    final oxygenAvailable = _toInt(oxygenBeds['available']);

    return RefreshIndicator(
      onRefresh: () => provider.loadHospitalData(),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Add New Resource Button
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF0A4D68), Color(0xFF088395)],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: ElevatedButton.icon(
                onPressed: () => _showAddNewResourceDialog(context, provider),
                icon: const Icon(Icons.add_circle_outline, size: 28),
                label: const Text(
                  'Add New Resource',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF0A4D68),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            
            // Resource Cards
            _buildResourceCard(
              context,
              title: 'General Beds',
              icon: Icons.king_bed,
              color: Colors.blue,
              total: generalTotal,
              available: generalAvailable,
              resourceType: 'generalBeds',
              provider: provider,
            ),
            const SizedBox(height: 16),
            _buildResourceCard(
              context,
              title: 'ICU Beds',
              icon: Icons.local_hospital,
              color: Colors.red,
              total: icuTotal,
              available: icuAvailable,
              resourceType: 'icuBeds',
              provider: provider,
            ),
            const SizedBox(height: 16),
            _buildResourceCard(
              context,
              title: 'Ventilators',
              icon: Icons.air,
              color: Colors.green,
              total: ventTotal,
              available: ventAvailable,
              resourceType: 'ventilators',
              provider: provider,
            ),
            const SizedBox(height: 16),
            _buildResourceCard(
              context,
              title: 'Oxygen Supported Beds',
              icon: Icons.medical_services,
              color: Colors.purple,
              total: oxygenTotal,
              available: oxygenAvailable,
              resourceType: 'oxygenBeds',
              provider: provider,
            ),
            const SizedBox(height: 16),
            _buildBloodBankSection(context, provider),
          ],
        ),
      ),
    );
  }

  // ==================== ADD NEW RESOURCE DIALOG ====================
  
  Future<void> _showAddNewResourceDialog(BuildContext context, HospitalProvider provider) async {
    String selectedResourceType = 'generalBeds';
    int totalCount = 10;
    int availableCount = 10;
    
    final totalController = TextEditingController(text: '10');
    final availableController = TextEditingController(text: '10');
    
    final Map<String, String> resourceTypeMap = {
      'General Beds': 'generalBeds',
      'ICU Beds': 'icuBeds',
      'Ventilators': 'ventilators',
      'Oxygen Supported Beds': 'oxygenBeds',
    };
    
    final List<String> resourceTypes = resourceTypeMap.keys.toList();

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0A4D68).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.add_circle_outline,
                    color: Color(0xFF0A4D68),
                    size: 28,
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Add New Resource',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Resource Type',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: selectedResourceType,
                        isExpanded: true,
                        items: resourceTypes.map((type) {
                          return DropdownMenuItem(
                            value: resourceTypeMap[type],
                            child: Row(
                              children: [
                                Icon(
                                  _getResourceIcon(resourceTypeMap[type]!),
                                  size: 20,
                                  color: _getResourceColor(resourceTypeMap[type]!),
                                ),
                                const SizedBox(width: 8),
                                Text(type),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: (value) {
                          setState(() {
                            selectedResourceType = value!;
                          });
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Total Count',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: totalController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      hintText: 'Enter total number',
                      prefixIcon: Icon(Icons.numbers),
                    ),
                    onChanged: (value) {
                      totalCount = int.tryParse(value) ?? 0;
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Available Count',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: availableController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      hintText: 'Enter available number',
                      prefixIcon: Icon(Icons.check_circle_outline),
                    ),
                    onChanged: (value) {
                      availableCount = int.tryParse(value) ?? 0;
                    },
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.orange.shade200),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.info_outline, color: Colors.orange, size: 20),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Available count cannot exceed total count.',
                            style: TextStyle(fontSize: 12, color: Colors.orange),
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
                onPressed: () {
                  totalCount = int.tryParse(totalController.text) ?? 0;
                  availableCount = int.tryParse(availableController.text) ?? 0;
                  
                  if (totalCount <= 0) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Total count must be greater than 0'),
                        backgroundColor: Colors.red,
                      ),
                    );
                    return;
                  }
                  if (availableCount > totalCount) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Available count cannot exceed total count'),
                        backgroundColor: Colors.red,
                      ),
                    );
                    return;
                  }
                  Navigator.pop(context, {
                    'resourceType': selectedResourceType,
                    'total': totalCount,
                    'available': availableCount,
                  });
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0A4D68),
                ),
                child: const Text('Add Resource'),
              ),
            ],
          );
        },
      ),
    );

    if (result != null && context.mounted) {
      setState(() => _isProcessing = true);
      
      try {
        final success = await provider.addNewResource(
          result['resourceType'],
          result['total'],
          result['available'],
        );
        
        if (success && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ ${_getResourceDisplayName(result['resourceType'])} added successfully'),
              backgroundColor: Colors.green,
            ),
          );
          await provider.loadHospitalData();
        } else if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Failed to add resource. Please try again.'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Error: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } finally {
        if (mounted) setState(() => _isProcessing = false);
      }
    }
  }

  IconData _getResourceIcon(String resourceType) {
    switch (resourceType) {
      case 'generalBeds':
        return Icons.king_bed;
      case 'icuBeds':
        return Icons.local_hospital;
      case 'ventilators':
        return Icons.air;
      case 'oxygenBeds':
        return Icons.medical_services;
      default:
        return Icons.medical_services;
    }
  }

  Color _getResourceColor(String resourceType) {
    switch (resourceType) {
      case 'generalBeds':
        return Colors.blue;
      case 'icuBeds':
        return Colors.red;
      case 'ventilators':
        return Colors.green;
      case 'oxygenBeds':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  String _getResourceDisplayName(String resourceType) {
    switch (resourceType) {
      case 'generalBeds':
        return 'General Beds';
      case 'icuBeds':
        return 'ICU Beds';
      case 'ventilators':
        return 'Ventilators';
      case 'oxygenBeds':
        return 'Oxygen Supported Beds';
      default:
        return resourceType;
    }
  }

  // ==================== RESOURCE CARD ====================

  Widget _buildResourceCard(
    BuildContext context, {
    required String title,
    required IconData icon,
    required Color color,
    required int total,
    required int available,
    required String resourceType,
    required HospitalProvider provider,
  }) {
    final occupied = total - available;
    final percentage = total > 0 ? available / total : 0.0;

    return Card(
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
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: color, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${(percentage * 100).toInt()}%',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStat('Total', total.toString(), Colors.grey),
                _buildStat('Available', available.toString(), Colors.green),
                _buildStat('Occupied', occupied.toString(), Colors.red),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: percentage.clamp(0.0, 1.0),
                backgroundColor: Colors.grey.shade200,
                color: color,
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 16),
            // DISCHARGE / FREE RESOURCE BUTTON
            if (occupied > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SizedBox(
                  width: double.infinity,
                  height: 45,
                  child: ElevatedButton.icon(
                    onPressed: _isProcessing ? null : () => _freeResource(
                      context,
                      title,
                      resourceType,
                      provider,
                      available,
                      occupied,
                    ),
                    icon: const Icon(Icons.new_releases),
                    label: Text('Discharge Patient (Free One $title)'), /*
                    label: Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Discharge Patient (Free One $title)'),
                    */ style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green.shade700,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _showUpdateDialog(
                      context,
                      'Update $title - Total',
                      resourceType,
                      'total',
                      provider,
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Update Total'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _showUpdateDialog(
                      context,
                      'Update $title - Available',
                      resourceType,
                      'available',
                      provider,
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Update Available'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStat(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Colors.grey),
        ),
      ],
    );
  }

  // ==================== FREE RESOURCE ====================
  
  Future<void> _freeResource(
    BuildContext context,
    String title,
    String resourceType,
    HospitalProvider provider,
    int currentAvailable,
    int currentOccupied,
  ) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Row(
            children: [
              Icon(Icons.new_releases, color: Colors.green.shade700),
              const SizedBox(width: 8),
              const Text('Discharge Patient'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Current Status:'),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.check_circle, color: Colors.green, size: 16),
                        const SizedBox(width: 8),
                        Text('Available: $currentAvailable'),
                      ],
                    ),
                    Row(
                      children: [
                        const Icon(Icons.person, color: Colors.red, size: 16),
                        const SizedBox(width: 8),
                        Text('Occupied: $currentOccupied'),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, size: 16, color: Colors.green),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'This will free one resource and make it available for other patients.',
                        style: TextStyle(fontSize: 12, color: Colors.green),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green.shade700,
              ),
              child: const Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ Discharge & Free Resource'),
            ),
          ],
        ),
      );

      if (confirm == true && context.mounted) {
        // Call the free resource API
        final response = await ApiService.freeResource(resourceType, 1);
        
        if (response['success'] && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ Patient discharged. Resource is now available.'),
              backgroundColor: Colors.green,
            ),
          );
          await provider.loadHospitalData();
        } else if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(response['message'] ?? 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Failed to free resource. Please try again.'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  // ==================== UPDATE DIALOG ====================

  Future<void> _showUpdateDialog(
    BuildContext context,
    String title,
    String resourceType,
    String field,
    HospitalProvider provider,
  ) async {
    final controller = TextEditingController();

    final value = await showDialog<int>(
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
              final intValue = int.tryParse(controller.text);
              if (intValue != null && intValue >= 0) {
                Navigator.pop(context, intValue);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (value != null && context.mounted) {
      final success = await provider.updateResource(resourceType, field, value);
      if (success && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$field updated to $value'),
            backgroundColor: Colors.green,
          ),
        );
      } else if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Update failed. Please try again.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  // ==================== BLOOD BANK SECTION ====================

  Widget _buildBloodBankSection(BuildContext context, HospitalProvider provider) {
    final bloodStock = provider.bloodStock;

    return Card(
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
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.purple.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.water_drop, color: Colors.purple, size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      'Blood Bank',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.refresh),
                      onPressed: () {
                        provider.loadHospitalData();
                      },
                      tooltip: 'Refresh',
                    ),
                    SizedBox(
                      height: 40,
                      width: 120,
                      child: ElevatedButton.icon(
                        onPressed: () => _showAddBloodDialog(context, provider),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add Stock'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.purple,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (bloodStock.isEmpty)
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
                        'Click "Add Stock" to add blood units',
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
                children: bloodStock.map((stock) {
                  final units = _toInt(stock['units_available']);
                  final threshold = _toInt(stock['minimum_threshold']);
                  final isLow = units < threshold;
                  
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: isLow ? Colors.red.shade50 : Colors.green.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isLow ? Colors.red.shade200 : Colors.green.shade200,
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
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: isLow ? Colors.red : Colors.green,
                              ),
                            ),
                            Text(
                              '$units units',
                              style: TextStyle(
                                fontSize: 12,
                                color: isLow ? Colors.red.shade700 : Colors.green.shade700,
                              ),
                            ),
                            if (stock['expiry_date'] != null)
                              Text(
                                'Expires: ${stock['expiry_date']?.toString().split('T')[0] ?? ''}',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.orange.shade700,
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(Icons.edit, size: 18),
                          onPressed: () => _showUpdateBloodDialog(context, stock, provider),
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
            // Show total units
            if (bloodStock.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      'Total: ${bloodStock.fold<int>(0, (sum, stock) => sum + _toInt(stock['units_available']))} units',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
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

  // ==================== BLOOD BANK DIALOGS ====================

  Future<void> _showAddBloodDialog(BuildContext context, HospitalProvider provider) async {
    String selectedGroup = 'A+';
    final unitsController = TextEditingController(text: '10');
    DateTime selectedDate = DateTime.now().add(const Duration(days: 30));
    final List<String> bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
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
                  onChanged: (value) => setState(() => selectedGroup = value!),
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
                const SizedBox(height: 16),
                ListTile(
                  title: const Text('Expiry Date'),
                  subtitle: Text(
                    '${selectedDate.day}/${selectedDate.month}/${selectedDate.year}',
                  ),
                  trailing: const Icon(Icons.calendar_today),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: selectedDate,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) {
                      setState(() => selectedDate = picked);
                    }
                  },
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
                    Navigator.pop(context, {
                      'group': selectedGroup,
                      'units': units,
                      'expiryDate': selectedDate.toIso8601String().split('T')[0],
                    });
                  }
                },
                style: ElevatedButton.styleFrom(backgroundColor: Colors.purple),
                child: const Text('Add'),
              ),
            ],
          );
        },
      ),
    );

    if (result != null && context.mounted) {
      final success = await provider.addBloodStock(
        result['group'],
        result['units'],
        result['expiryDate'],
      );
      if (success && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Blood stock added successfully'),
            backgroundColor: Colors.green,
          ),
        );
        await provider.loadHospitalData();
      }
    }
  }

  Future<void> _showUpdateBloodDialog(
    BuildContext context,
    Map<String, dynamic> stock,
    HospitalProvider provider,
  ) async {
    final unitsController = TextEditingController(text: stock['units_available'].toString());
    DateTime selectedDate = stock['expiry_date'] != null 
        ? DateTime.parse(stock['expiry_date'])
        : DateTime.now().add(const Duration(days: 30));

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text('Update ${stock['blood_group']} Stock'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: unitsController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    hintText: 'Enter new units',
                    border: OutlineInputBorder(),
                  ),
                  autofocus: true,
                ),
                const SizedBox(height: 16),
                ListTile(
                  title: const Text('Expiry Date'),
                  subtitle: Text(
                    '${selectedDate.day}/${selectedDate.month}/${selectedDate.year}',
                  ),
                  trailing: const Icon(Icons.calendar_today),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: selectedDate,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) {
                      setState(() => selectedDate = picked);
                    }
                  },
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
                  if (units != null && units >= 0) {
                    Navigator.pop(context, {
                      'units': units,
                      'expiryDate': selectedDate.toIso8601String().split('T')[0],
                    });
                  }
                },
                child: const Text('Update'),
              ),
            ],
          );
        },
      ),
    );

    if (result != null && context.mounted) {
      final success = await provider.addBloodStock(
        stock['blood_group'],
        result['units'],
        result['expiryDate'],
      );
      if (success && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Blood stock updated successfully'),
            backgroundColor: Colors.green,
          ),
        );
        await provider.loadHospitalData();
      }
    }
  }

  // ==================== REQUESTS TAB ====================

  Widget _buildRequestsTab(BuildContext context, HospitalProvider provider) {
    final requests = provider.resourceRequests;
    
    final pendingRequests = requests.where((r) => r['status'] == 'pending').toList();
    final fulfilledRequests = requests.where((r) => r['status'] == 'fulfilled' || r['status'] == 'rejected').toList();

    if (requests.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.assignment_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No resource requests yet'),
            Text(
              'Requests from patients will appear here',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _buildRequestStats('Pending', pendingRequests.length, Colors.orange),
              _buildRequestStats('Fulfilled', fulfilledRequests.length, Colors.green),
              _buildRequestStats('Total', requests.length, Colors.blue),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => provider.loadHospitalData(),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: requests.length,
              itemBuilder: (context, index) {
                final request = requests[index];
                final isPending = request['status'] == 'pending';
                return _buildRequestCard(request, isPending, provider);
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRequestStats(String label, int count, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Text(
            '$count',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(fontSize: 14, color: color),
          ),
        ],
      ),
    );
  }

  Widget _buildRequestCard(Map<String, dynamic> request, bool isPending, HospitalProvider provider) {
    final resourceType = request['resource_type'] ?? 'Resource';
    final patientName = request['patient_name'] ?? 'Unknown';
    final quantity = _toInt(request['quantity']);
    final description = request['description'] ?? 'No description';
    final status = request['status'] ?? 'pending';

    IconData icon;
    Color color;
    switch (resourceType.toLowerCase()) {
      case 'general_bed':
        icon = Icons.king_bed;
        color = Colors.blue;
        break;
      case 'icu_bed':
        icon = Icons.local_hospital;
        color = Colors.red;
        break;
      case 'ventilator':
        icon = Icons.air;
        color = Colors.green;
        break;
      case 'oxygen_bed':
        icon = Icons.medical_services;
        color = Colors.purple;
        break;
      case 'blood':
        icon = Icons.water_drop;
        color = Colors.red;
        break;
      default:
        icon = Icons.medical_services;
        color = Colors.orange;
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
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: color, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        resourceType.toUpperCase().replaceAll('_', ' '),
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        'Patient: $patientName',
                        style: const TextStyle(fontSize: 14),
                      ),
                      Text(
                        'Quantity: $quantity',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: isPending ? Colors.orange.withValues(alpha: 0.1) : Colors.green.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    status.toUpperCase(),
                    style: TextStyle(
                      color: isPending ? Colors.orange : Colors.green,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â $description'),
            Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ ${request['patient_phone'] ?? 'N/A'}'),
            if (isPending) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isProcessing ? null : () => _fulfillRequest(request, provider),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                      ),
                      child: const Text('Fulfill & Allocate'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _isProcessing ? null : () => _rejectRequest(request, provider),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                      ),
                      child: const Text('Reject'),
                    ),
                  ),
                ],
              ),
            ],
            if (!isPending)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: status == 'fulfilled' ? Colors.green.shade50 : Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      status == 'fulfilled' ? Icons.check_circle : Icons.cancel,
                      color: status == 'fulfilled' ? Colors.green : Colors.red,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      status == 'fulfilled' 
                          ? 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ Request fulfilled. Resource allocated to patient.'
                          : 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Request rejected.',
                      style: TextStyle(
                        fontSize: 12,
                        color: status == 'fulfilled' ? Colors.green : Colors.red,
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

  Future<void> _fulfillRequest(Map<String, dynamic> request, HospitalProvider provider) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Fulfill ${request['resource_type']} Request'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Patient: ${request['patient_name']}'),
              Text('Resource: ${request['resource_type']}'),
              Text('Quantity: ${request['quantity']}'),
              const SizedBox(height: 12),
              const Text(
                'This will allocate the requested resource to the patient.',
                style: TextStyle(color: Colors.green),
              ),
              const Text(
                'Available resources will be reduced automatically.',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
              child: const Text('Confirm Fulfill'),
            ),
          ],
        ),
      );

      if (confirm == true && context.mounted) {
        final success = await provider.fulfillResourceRequest(request['id']);
        if (success && context.mounted) {
          if (!context.mounted) return;
          if (!context.mounted) return;
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ Request fulfilled. Resource allocated.'),
              backgroundColor: Colors.green,
            ),
          );
          await provider.loadHospitalData();
        }
      }
    } catch (e) {
      if (context.mounted) {
        if (!context.mounted) return;
        if (!context.mounted) return;
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _rejectRequest(Map<String, dynamic> request, HospitalProvider provider) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Reject Request'),
          content: Text('Reject ${request['resource_type']} request from ${request['patient_name']}?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Reject'),
            ),
          ],
        ),
      );

      if (confirm == true && context.mounted) {
        final success = await provider.rejectResourceRequest(request['id']);
        if (success && context.mounted) {
          if (!context.mounted) return;
          if (!context.mounted) return;
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Request rejected'),
              backgroundColor: Colors.red,
            ),
          );
          await provider.loadHospitalData();
        }
      }
    } catch (e) {
      if (context.mounted) {
        if (!context.mounted) return;
        if (!context.mounted) return;
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }
}
