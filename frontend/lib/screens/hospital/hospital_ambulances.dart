// lib/screens/hospital/hospital_ambulances.dart
import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class HospitalAmbulances extends StatefulWidget {
  const HospitalAmbulances({super.key});

  @override
  State<HospitalAmbulances> createState() => _HospitalAmbulancesState();
}

class _HospitalAmbulancesState extends State<HospitalAmbulances> {
  List<Map<String, dynamic>> _ambulances = [];
  List<Map<String, dynamic>> _pendingBookings = [];
  bool _isLoading = true;
  bool _isProcessing = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadData() async {
    if (!context.mounted) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // Load ambulances
      final response = await ApiService.getHospitalAmbulances();

      if (!context.mounted) return;

      if (response['success'] && response['data'] != null) {
        setState(() {
          _ambulances = List<Map<String, dynamic>>.from(response['data']);
        });
      } else {
        setState(() {
          _errorMessage = response['message'] ?? 'Failed to load ambulances';
        });
      }

      // Load pending bookings
      final bookingsResponse = await ApiService.getHospitalAmbulanceBookings();

      if (!context.mounted) return;

      if (bookingsResponse['success'] && bookingsResponse['data'] != null) {
        setState(() {
          _pendingBookings =
              List<Map<String, dynamic>>.from(bookingsResponse['data']);
        });
      }
    } catch (e) {
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

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ambulance Management'),
          backgroundColor: const Color(0xFF0A4D68),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'ÃƒÂ°Ã…Â¸Ã…Â¡Ã¢â‚¬Ëœ Ambulances', icon: Icon(Icons.local_taxi)),
              Tab(text: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹ Bookings', icon: Icon(Icons.assignment)),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _showAddAmbulanceDialog(context),
              tooltip: 'Add Ambulance',
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadData,
              tooltip: 'Refresh',
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
                : const TabBarView(
                    children: [
                      AmbulancesList(),
                      BookingsList(),
                    ],
                  ),
      ),
    );
  }

  // ==================== HELPER METHODS IN STATE ====================
  void _showAddAmbulanceDialog(BuildContext context) {
    if (_isProcessing) return;

    final vehicleController = TextEditingController();
    final driverController = TextEditingController();
    final phoneController = TextEditingController();
    String selectedType = 'Basic Life Support';

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.local_taxi, color: Color(0xFF0A4D68)),
            SizedBox(width: 12),
            Text('Add Ambulance',
                style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: vehicleController,
                decoration: const InputDecoration(
                  labelText: 'Vehicle Number *',
                  prefixIcon: Icon(Icons.confirmation_number),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: driverController,
                decoration: const InputDecoration(
                  labelText: 'Driver Name *',
                  prefixIcon: Icon(Icons.person),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phoneController,
                decoration: const InputDecoration(
                  labelText: 'Driver Phone *',
                  prefixIcon: Icon(Icons.phone),
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedType,
                decoration: const InputDecoration(
                  labelText: 'Ambulance Type *',
                  prefixIcon: Icon(Icons.medical_services),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                      value: 'Basic Life Support',
                      child: Text('Basic Life Support (BLS)')),
                  DropdownMenuItem(
                      value: 'Advanced Life Support',
                      child: Text('Advanced Life Support (ALS)')),
                  DropdownMenuItem(
                      value: 'Cardiac Ambulance',
                      child: Text('Cardiac Ambulance')),
                  DropdownMenuItem(
                      value: 'Neonatal Ambulance',
                      child: Text('Neonatal Ambulance')),
                ],
                onChanged: (value) => selectedType = value!,
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info, size: 16, color: Colors.blue),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Ambulance will be available for emergency bookings immediately.',
                        style: TextStyle(fontSize: 12, color: Colors.blue),
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
              if (vehicleController.text.isEmpty ||
                  driverController.text.isEmpty ||
                  phoneController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Please fill all required fields'),
                    backgroundColor: Colors.red,
                  ),
                );
                return;
              }

              setState(() => _isProcessing = true);
              Navigator.pop(context);

              try {
                final response = await ApiService.registerHospitalAmbulance({
                  'vehicle_number': vehicleController.text,
                  'driver_name': driverController.text,
                  'driver_phone': phoneController.text,
                  'type': selectedType,
                });

                if (response['success'] && mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ambulance added successfully'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  await _loadData();
                } else if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                          response['message'] ?? 'Failed to add ambulance'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } catch (e) {
                if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Error: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } finally {
                if (mounted) {
                  setState(() => _isProcessing = false);
                }
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0A4D68),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Add Ambulance'),
          ),
        ],
      ),
    );
  }

  void _showEditAmbulanceDialog(
      BuildContext context, Map<String, dynamic> ambulance) {
    if (_isProcessing) return;

    final driverController =
        TextEditingController(text: ambulance['driver_name']);
    final phoneController =
        TextEditingController(text: ambulance['driver_phone']);
    String selectedType = ambulance['type'] ?? 'Basic Life Support';

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.edit, color: Colors.blue),
            SizedBox(width: 12),
            Text('Edit Ambulance',
                style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: driverController,
              decoration: const InputDecoration(
                labelText: 'Driver Name',
                prefixIcon: Icon(Icons.person),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneController,
              decoration: const InputDecoration(
                labelText: 'Driver Phone',
                prefixIcon: Icon(Icons.phone),
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: selectedType,
              decoration: const InputDecoration(
                labelText: 'Ambulance Type',
                prefixIcon: Icon(Icons.medical_services),
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                    value: 'Basic Life Support',
                    child: Text('Basic Life Support (BLS)')),
                DropdownMenuItem(
                    value: 'Advanced Life Support',
                    child: Text('Advanced Life Support (ALS)')),
                DropdownMenuItem(
                    value: 'Cardiac Ambulance',
                    child: Text('Cardiac Ambulance')),
                DropdownMenuItem(
                    value: 'Neonatal Ambulance',
                    child: Text('Neonatal Ambulance')),
              ],
              onChanged: (value) => selectedType = value!,
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
              setState(() => _isProcessing = true);
              Navigator.pop(context);

              try {
                final response =
                    await ApiService.updateHospitalAmbulance(ambulance['id'], {
                  'driver_name': driverController.text,
                  'driver_phone': phoneController.text,
                  'type': selectedType,
                });

                if (response['success'] && mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ambulance updated successfully'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  await _loadData();
                }
              } catch (e) {
                if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Error: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } finally {
                if (mounted) {
                  setState(() => _isProcessing = false);
                }
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0A4D68),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Save Changes'),
          ),
        ],
      ),
    );
  }

  Future<void> _toggleAmbulanceAvailability(
      int ambulanceId, bool isAvailable) async {
    if (_isProcessing) return;

    setState(() => _isProcessing = true);

    try {
      final response = await ApiService.updateAmbulanceAvailability(
          ambulanceId, isAvailable);

      if (response['success'] && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isAvailable
                ? 'ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ambulance is now available'
                : 'ÃƒÂ°Ã…Â¸Ã…Â¡Ã‚Â« Ambulance is now busy'),
            backgroundColor: isAvailable ? Colors.green : Colors.orange,
          ),
        );
        await _loadData();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content:
                Text(response['message'] ?? 'Failed to update availability'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  Future<void> _assignAmbulanceToBooking(int bookingId) async {
    if (_isProcessing) return;

    final availableAmbulances =
        _ambulances.where((a) => a['is_available'] == true).toList();

    if (availableAmbulances.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No available ambulances to assign'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Assign Ambulance'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Select an ambulance to assign to this booking:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...availableAmbulances.map((ambulance) {
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: const Icon(Icons.local_taxi, color: Colors.blue),
                  title: Text(ambulance['vehicle_number'] ?? 'Ambulance'),
                  subtitle:
                      Text('Driver: ${ambulance['driver_name'] ?? 'N/A'}'),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: () async {
                    Navigator.pop(context);
                    setState(() => _isProcessing = true);

                    try {
                      final response =
                          await ApiService.assignAmbulanceToBooking(
                              bookingId, ambulance['id']);

                      if (response['success'] && mounted) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ambulance assigned successfully'),
                            backgroundColor: Colors.green,
                          ),
                        );
                        await _loadData();
                      } else if (mounted) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content:
                                Text(response['message'] ?? 'Failed to assign'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    } catch (e) {
                      if (mounted) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Error: $e'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    } finally {
                      if (mounted) {
                        setState(() => _isProcessing = false);
                      }
                    }
                  },
                ),
              );
            }),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }

  Future<void> _rejectBooking(int bookingId) async {
    if (_isProcessing) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Reject Booking'),
        content: const Text('Are you sure you want to reject this booking?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              setState(() => _isProcessing = true);

              try {
                final response =
                    await ApiService.updateBookingStatus(bookingId, 'rejected');

                if (response['success'] && mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Booking rejected'),
                      backgroundColor: Colors.orange,
                    ),
                  );
                  await _loadData();
                } else if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(response['message'] ?? 'Failed to reject'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } catch (e) {
                if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Error: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } finally {
                if (mounted) {
                  setState(() => _isProcessing = false);
                }
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteAmbulance(int ambulanceId) async {
    if (_isProcessing) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Delete Ambulance'),
        content: const Text('Are you sure you want to delete this ambulance?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              setState(() => _isProcessing = true);

              try {
                final response =
                    await ApiService.deleteHospitalAmbulance(ambulanceId);

                if (response['success'] && mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ambulance deleted successfully'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  await _loadData();
                } else if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(response['message'] ?? 'Failed to delete'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } catch (e) {
                if (mounted) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Error: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } finally {
                if (mounted) {
                  setState(() => _isProcessing = false);
                }
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

// ==================== AMBULANCES LIST ====================
class AmbulancesList extends StatelessWidget {
  const AmbulancesList({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.findAncestorStateOfType<_HospitalAmbulancesState>()!;

    if (state._ambulances.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.local_taxi, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            const Text(
              'No ambulances registered',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(
              'Add your first ambulance to get started',
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () => state._showAddAmbulanceDialog(context),
              icon: const Icon(Icons.add),
              label: const Text('Add Ambulance'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A4D68),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: state._loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state._ambulances.length,
        itemBuilder: (context, index) {
          return _buildAmbulanceCard(context, state._ambulances[index], state);
        },
      ),
    );
  }

  Widget _buildAmbulanceCard(BuildContext context,
      Map<String, dynamic> ambulance, _HospitalAmbulancesState state) {
    final isAvailable = ambulance['is_available'] ?? true;

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
                    color:
                        isAvailable ? Colors.green.shade50 : Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.local_taxi,
                    color: isAvailable ? Colors.green : Colors.red,
                    size: 30,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ambulance['vehicle_number'] ?? 'Ambulance',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        'Driver: ${ambulance['driver_name'] ?? 'N/A'}',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                      Text(
                        'Type: ${ambulance['type'] ?? 'BLS'}',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: isAvailable
                        ? Colors.green.withValues(alpha: 0.1)
                        : Colors.red.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    isAvailable ? 'Available' : 'Busy',
                    style: TextStyle(
                      color: isAvailable ? Colors.green : Colors.red,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.phone, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  ambulance['driver_phone'] ?? 'N/A',
                  style: const TextStyle(fontSize: 12),
                ),
                const SizedBox(width: 16),
                const Icon(Icons.location_on, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  ambulance['current_location'] ?? 'Location not set',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: state._isProcessing
                        ? null
                        : () => state._toggleAmbulanceAvailability(
                            ambulance['id'], !isAvailable),
                    icon: Icon(isAvailable ? Icons.block : Icons.check_circle,
                        size: 18),
                    label: Text(
                        isAvailable ? 'Mark as Busy' : 'Mark as Available'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: isAvailable ? Colors.red : Colors.green,
                      side: BorderSide(
                          color: isAvailable ? Colors.red : Colors.green),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () =>
                        state._showEditAmbulanceDialog(context, ambulance),
                    icon: const Icon(Icons.edit, size: 18),
                    label: const Text('Edit'),
                    style: OutlinedButton.styleFrom(
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: IconButton(
                    icon: const Icon(Icons.delete, color: Colors.red),
                    onPressed: () => state._deleteAmbulance(ambulance['id']),
                    tooltip: 'Delete',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ==================== BOOKINGS LIST ====================
class BookingsList extends StatelessWidget {
  const BookingsList({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.findAncestorStateOfType<_HospitalAmbulancesState>()!;

    if (state._pendingBookings.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.assignment_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              'No pending bookings',
              style: TextStyle(fontSize: 16),
            ),
            SizedBox(height: 8),
            Text(
              'When patients book ambulances, they will appear here.',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: state._loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state._pendingBookings.length,
        itemBuilder: (context, index) {
          return _buildBookingCard(
              context, state._pendingBookings[index], state);
        },
      ),
    );
  }

  Widget _buildBookingCard(BuildContext context, Map<String, dynamic> booking,
      _HospitalAmbulancesState state) {
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
                const CircleAvatar(
                  backgroundColor: Colors.orange,
                  child: Icon(Icons.person, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        booking['patient_name'] ?? 'Patient',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â¾ ${booking['patient_phone'] ?? 'N/A'}',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.orange.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    booking['status'] ?? 'Pending',
                    style: const TextStyle(
                      color: Colors.orange,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â Pickup Location',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                  Text(
                    booking['pickup_address'] ?? 'Address not available',
                    style: const TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹ Patient Condition',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                  Text(
                    booking['patient_condition'] ?? 'Not specified',
                    style: const TextStyle(fontSize: 14),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.access_time, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  _formatTime(booking['created_at']),
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: state._isProcessing
                        ? null
                        : () => state._assignAmbulanceToBooking(booking['id']),
                    icon: const Icon(Icons.local_taxi, size: 18),
                    label: const Text('Assign Ambulance'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: state._isProcessing
                        ? null
                        : () => state._rejectBooking(booking['id']),
                    icon: const Icon(Icons.cancel, size: 18),
                    label: const Text('Reject'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(String? timestamp) {
    if (timestamp == null) return 'Just now';
    try {
      final date = DateTime.parse(timestamp);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes} minutes ago';
      if (diff.inDays < 1) return '${diff.inHours} hours ago';
      return '${diff.inDays} days ago';
    } catch (e) {
      return 'Recently';
    }
  }
}
