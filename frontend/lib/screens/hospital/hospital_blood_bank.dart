// lib/screens/hospital/hospital_blood_bank.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class HospitalBloodBank extends StatefulWidget {
  const HospitalBloodBank({super.key});

  @override
  State<HospitalBloodBank> createState() => _HospitalBloodBankState();
}

class _HospitalBloodBankState extends State<HospitalBloodBank> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _bloodStock = [];
  Map<String, dynamic> _summary = {};
  String? _errorMessage;

  final List<String> _bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadBloodBank();
    });
  }

 // In hospital_blood_bank.dart - Update _loadBloodBank method

Future<void> _loadBloodBank() async {
  setState(() {
    _isLoading = true;
    _errorMessage = null;
  });

  try {
    final response = await ApiService.getHospitalBloodBank();
    
    if (response['success'] == true) {
      final data = response['data'];
      
      // Handle both response formats
      if (data != null) {
        // If data has 'blood_stock' field (from our API)
        if (data['blood_stock'] is List) {
          _bloodStock = (data['blood_stock'] as List)
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
          _summary = data['summary'] is Map
              ? Map<String, dynamic>.from(data['summary'])
              : {};
        } 
        // If data is a list directly
        else if (data is List) {
          _bloodStock = data
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
          _summary = {
            'total_units': _bloodStock.fold<int>(0, (sum, item) {
  final value = item['units_available'] ?? 0;
  return sum + (value is int ? value : (value as num).toInt());
}),
            'expiring_soon': 0,
            'expired': 0,
          };
        }
        // If data has 'stock' field
        else if (data['stock'] != null) {
          _bloodStock = (data['stock'] as List)
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
          _summary = data['summary'] is Map
              ? Map<String, dynamic>.from(data['summary'])
              : {};
        }
      }
      
      debugPrint(' Loaded ${_bloodStock.length} blood stocks');
    } else {
      _errorMessage = response['message'] ?? 'Failed to load blood bank';
      debugPrint(' Failed to load blood bank: $_errorMessage');
    }
  } catch (e) {
    _errorMessage = 'Network error: $e';
    debugPrint(' Network error: $e');
  } finally {
    setState(() => _isLoading = false);
  }
}
  Future<void> _addBloodStock() async {
    String selectedGroup = 'A+';
    int units = 10;
    DateTime selectedDate = DateTime.now().add(const Duration(days: 30));

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
                  items: _bloodGroups.map((group) {
                    return DropdownMenuItem(value: group, child: Text(group));
                  }).toList(),
                  onChanged: (value) => setState(() => selectedGroup = value!),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  initialValue: '10',
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Units',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) => setState(() => units = int.tryParse(value) ?? 0),
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
                  Navigator.pop(context, {
                    'blood_group': selectedGroup,
                    'units': units,
                    'expiry_date': selectedDate.toIso8601String().split('T')[0],
                  });
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                ),
                child: const Text('Add'),
              ),
            ],
          );
        },
      ),
    );

    if (result != null) {
      setState(() => _isLoading = true);
      try {
        final response = await ApiService.addBloodStock(
          bloodGroup: result['blood_group'],
          units: result['units'],
          expiryDate: result['expiry_date'],
        );
        if (response['success'] == true) {
          if (!context.mounted) return;
          if (!context.mounted) return;
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Blood stock added successfully'), backgroundColor: Colors.green),
          );
          await _loadBloodBank();
        }
      } catch (e) {
        debugPrint('Error adding blood stock: $e');
      } finally {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Blood Bank Management'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadBloodBank,
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
                        onPressed: _loadBloodBank,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    // Summary Cards
                    Container(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          _buildSummaryCard('Total Units', _asInt(_summary['total_units']), Colors.blue),
                          const SizedBox(width: 8),
                          _buildSummaryCard('Near Expiry', _asInt(_summary['expiring_soon']), Colors.orange),
                          const SizedBox(width: 8),
                          _buildSummaryCard('Expired', _asInt(_summary['expired']), Colors.red),
                        ],
                      ),
                    ),
                    
                    // Add Button
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _addBloodStock,
                          icon: const Icon(Icons.add),
                          label: const Text('Add Blood Stock'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                    ),
                    
                    const SizedBox(height: 8),
                    
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
                                  SizedBox(height: 8),
                                  Text(
                                    'Click "Add Blood Stock" to get started',
                                    style: TextStyle(color: Colors.grey),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(12),
                              itemCount: _bloodStock.length,
                              itemBuilder: (context, index) {
                                final stock = _bloodStock[index];
                                return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Row(
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.all(8),
                                          decoration: BoxDecoration(
                                            color: Colors.red.shade50,
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: const Icon(
                                            Icons.bloodtype,
                                            color: Colors.red,
                                            size: 30,
                                          ),
                                        ),
                                        const SizedBox(width: 16),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                stock['blood_group'] ?? 'Unknown',
                                                style: const TextStyle(
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                              Text(
                                                '${stock['units_available'] ?? 0} units available',
                                                style: const TextStyle(
                                                  fontSize: 14,
                                                  color: Colors.grey,
                                                ),
                                              ),
                                              if (stock['expiry_date'] != null)
                                                Text(
                                                  'Expires: ${stock['expiry_date']?.toString().split('T')[0] ?? ''}',
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    color: Colors.orange.shade700,
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ),
                                        Row(
                                          children: [
                                            IconButton(
                                              icon: const Icon(Icons.edit, color: Colors.blue),
                                              onPressed: () => _editBloodStock(stock),
                                            ),
                                            IconButton(
                                              icon: const Icon(Icons.delete, color: Colors.red),
                                              onPressed: () => _deleteBloodStock(stock),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildSummaryCard(String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Text(
              value.toString(),
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  int _asInt(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  Future<void> _editBloodStock(Map<String, dynamic> stock) async {
    int units = _asInt(stock['units_available']);
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
                TextFormField(
                  initialValue: units.toString(),
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Units',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) => setState(() => units = int.tryParse(value) ?? 0),
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
                  Navigator.pop(context, {
                    'blood_group': stock['blood_group'],
                    'units': units,
                    'expiry_date': selectedDate.toIso8601String().split('T')[0],
                  });
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                ),
                child: const Text('Update'),
              ),
            ],
          );
        },
      ),
    );

    if (result != null) {
      setState(() => _isLoading = true);
      try {
        final response = await ApiService.updateBloodStock(
          bloodGroup: result['blood_group'],
          units: result['units'],
          expiryDate: result['expiry_date'],
        );
        if (response['success'] == true) {
          if (!context.mounted) return;
          if (!context.mounted) return;
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Blood stock updated successfully'), backgroundColor: Colors.green),
          );
          await _loadBloodBank();
        }
      } catch (e) {
        debugPrint('Error updating blood stock: $e');
      } finally {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _deleteBloodStock(Map<String, dynamic> stock) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Blood Stock'),
        content: Text('Are you sure you want to delete ${stock['blood_group']} blood stock?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isLoading = true);
      try {
        final response = await ApiService.deleteBloodStock(stock['blood_group']);
        if (response['success'] == true) {
          if (!context.mounted) return;
          if (!context.mounted) return;
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${stock['blood_group']} blood stock deleted'), backgroundColor: Colors.green),
          );
          await _loadBloodBank();
        }
      } catch (e) {
        debugPrint('Error deleting blood stock: $e');
      } finally {
        setState(() => _isLoading = false);
      }
    }
  }
}
