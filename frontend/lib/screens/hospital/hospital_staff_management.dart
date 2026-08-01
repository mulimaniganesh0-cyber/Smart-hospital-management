// lib/screens/hospital/hospital_staff_management.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/hospital_provider.dart';
import '../../services/api_service.dart';

class HospitalStaffManagement extends StatefulWidget {
  const HospitalStaffManagement({super.key});

  @override
  State<HospitalStaffManagement> createState() => _HospitalStaffManagementState();
}

class _HospitalStaffManagementState extends State<HospitalStaffManagement> {
  List<Map<String, dynamic>> _staff = [];
  List<Map<String, dynamic>> _roles = [];
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
      final staffResponse = await ApiService.getHospitalStaff();
      if (staffResponse['success']) {
        setState(() {
          _staff = List<Map<String, dynamic>>.from(staffResponse['data']);
        });
      }

      final rolesResponse = await ApiService.getRoles();
      if (rolesResponse['success']) {
        setState(() {
          _roles = List<Map<String, dynamic>>.from(rolesResponse['data']);
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
          title: const Text('Staff Management'),
          backgroundColor: const Color(0xFF0A4D68),
          bottom: const TabBar(
            tabs: [
              Tab(text: '👥 Staff', icon: Icon(Icons.people)),
              Tab(text: '📋 Activity', icon: Icon(Icons.history)),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _showAddStaffDialog(context),
              tooltip: 'Add Staff',
            ),
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
                      _buildStaffList(),
                      _buildActivityLog(),
                    ],
                  ),
      ),
    );
  }

  Widget _buildStaffList() {
    if (_staff.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No staff members added yet'),
            Text('Add staff to manage your hospital team'),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _staff.length,
      itemBuilder: (context, index) {
        final staff = _staff[index];
        return _buildStaffCard(staff);
      },
    );
  }

  Widget _buildStaffCard(Map<String, dynamic> staff) {
    final role = staff['role'] ?? 'staff';
    final isActive = staff['is_verified'] ?? false;
    final isDoctor = role == 'doctor';

    Color roleColor;
    switch (role) {
      case 'hospital_admin':
        roleColor = Colors.red;
        break;
      case 'doctor':
        roleColor = Colors.blue;
        break;
      case 'nurse':
        roleColor = Colors.green;
        break;
      case 'receptionist':
        roleColor = Colors.orange;
        break;
      default:
        roleColor = Colors.grey;
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
                CircleAvatar(
                  radius: 25,
                  backgroundColor: roleColor.withOpacity(0.1),
                  child: Icon(
                    role == 'doctor' ? Icons.medical_services :
                    role == 'nurse' ? Icons.health_and_safety :
                    role == 'receptionist' ? Icons.receipt_long :
                    Icons.person,
                    color: roleColor,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        staff['name'] ?? 'Unknown',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        staff['email'] ?? 'No email',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                      Text(
                        staff['hospital_role'] ?? role,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: roleColor,
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isActive ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        isActive ? 'Active' : 'Inactive',
                        style: TextStyle(
                          fontSize: 10,
                          color: isActive ? Colors.green : Colors.red,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (role != 'hospital_admin' && role != 'super_admin')
                      Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit, size: 18),
                            onPressed: () => _showEditRoleDialog(context, staff),
                            constraints: const BoxConstraints(),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete, size: 18),
                            onPressed: () => _deleteStaff(staff['id']),
                            constraints: const BoxConstraints(),
                            color: Colors.red,
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ),
            if (isDoctor) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (staff['specialization'] != null)
                    _buildChip('Specialization', staff['specialization']),
                  if (staff['experience_years'] != null)
                    _buildChip('Experience', '${staff['experience_years']} years'),
                  if (staff['qualification'] != null)
                    _buildChip('Qualification', staff['qualification']),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildChip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$label: ',
            style: TextStyle(fontSize: 11, color: Colors.grey[600]),
          ),
          Text(
            value,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityLog() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.history, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text('Activity log coming soon'),
          Text('Track all staff actions here'),
        ],
      ),
    );
  }

  void _showAddStaffDialog(BuildContext context) {
    final nameController = TextEditingController();
    final emailController = TextEditingController();
    final phoneController = TextEditingController();
    final passwordController = TextEditingController();
    String selectedRole = 'doctor';
    String selectedDepartment = 'Cardiology';
    final qualificationController = TextEditingController();
    final experienceController = TextEditingController();

    final List<String> roles = ['doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist'];
    final List<String> departments = [
      'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 
      'Gynecology', 'Ophthalmology', 'ENT', 'Dermatology',
      'Psychiatry', 'Oncology', 'Nephrology', 'Urology',
      'Gastroenterology', 'Pulmonology', 'Radiology', 'Pathology',
      'Emergency', 'ICU', 'Operation Theater', 'Pharmacy'
    ];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add Staff Member'),
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
                  controller: emailController,
                  decoration: const InputDecoration(
                    labelText: 'Email *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.email),
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneController,
                  decoration: const InputDecoration(
                    labelText: 'Phone *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.phone),
                  ),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: passwordController,
                  decoration: const InputDecoration(
                    labelText: 'Password *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.lock),
                  ),
                  obscureText: true,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedRole,
                  decoration: const InputDecoration(
                    labelText: 'Role *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.work),
                  ),
                  items: roles.map((role) {
                    return DropdownMenuItem(
                      value: role,
                      child: Row(
                        children: [
                          Icon(
                            role == 'doctor' ? Icons.medical_services :
                            role == 'nurse' ? Icons.health_and_safety :
                            role == 'receptionist' ? Icons.receipt_long :
                            Icons.person,
                            size: 16,
                            color: Colors.blue,
                          ),
                          const SizedBox(width: 8),
                          Text(role.toUpperCase()),
                        ],
                      ),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => selectedRole = value!),
                ),
                const SizedBox(height: 12),
                if (selectedRole == 'doctor') ...[
                  DropdownButtonFormField<String>(
                    value: selectedDepartment,
                    decoration: const InputDecoration(
                      labelText: 'Department',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.business),
                    ),
                    items: departments.map((dept) {
                      return DropdownMenuItem(
                        value: dept,
                        child: Text(dept),
                      );
                    }).toList(),
                    onChanged: (value) => setState(() => selectedDepartment = value!),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: qualificationController,
                    decoration: const InputDecoration(
                      labelText: 'Qualification',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.school),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: experienceController,
                    decoration: const InputDecoration(
                      labelText: 'Experience (Years)',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.timer),
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ],
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
                    emailController.text.isEmpty ||
                    phoneController.text.isEmpty ||
                    passwordController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please fill all required fields'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                Navigator.pop(context);

                final staffData = {
                  'name': nameController.text,
                  'email': emailController.text,
                  'phone': phoneController.text,
                  'password': passwordController.text,
                  'role': selectedRole,
                  'department': selectedDepartment,
                  'qualifications': qualificationController.text,
                  'experience_years': int.tryParse(experienceController.text) ?? 0,
                };

                final response = await ApiService.createStaffUser(staffData);

                if (response['success'] && mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('✅ Staff added successfully'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  _loadData();
                } else if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(response['message'] ?? 'Failed to add staff'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A4D68),
              ),
              child: const Text('Add Staff'),
            ),
          ],
        ),
      ),
    );
  }

  void _showEditRoleDialog(BuildContext context, Map<String, dynamic> staff) {
    String selectedRole = staff['role'] ?? 'staff';

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Edit Role: ${staff['name']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              value: selectedRole,
              decoration: const InputDecoration(
                labelText: 'Role',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.work),
              ),
              items: ['doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist']
                  .map((role) {
                    return DropdownMenuItem(
                      value: role,
                      child: Text(role.toUpperCase()),
                    );
                  }).toList(),
              onChanged: (value) => selectedRole = value!,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: Colors.orange),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Changing role will update permissions',
                      style: TextStyle(fontSize: 12, color: Colors.orange),
                    ),
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
              final response = await ApiService.updateStaffRole(staff['id'], selectedRole);

              if (response['success'] && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('✅ Role updated successfully'),
                    backgroundColor: Colors.green,
                  ),
                );
                _loadData();
              }
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }

  void _deleteStaff(int staffId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Staff'),
        content: const Text('Are you sure you want to remove this staff member?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              final response = await ApiService.deleteStaffUser(staffId);

              if (response['success'] && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('✅ Staff removed successfully'),
                    backgroundColor: Colors.green,
                  ),
                );
                _loadData();
              } else if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(response['message'] ?? 'Failed to remove staff'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}