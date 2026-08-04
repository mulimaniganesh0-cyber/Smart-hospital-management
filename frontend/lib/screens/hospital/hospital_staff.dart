// lib/screens/hospital/hospital_staff.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/hospital_provider.dart';

class HospitalStaff extends StatefulWidget {
  const HospitalStaff({super.key});

  @override
  State<HospitalStaff> createState() => _HospitalStaffState();
}

class _HospitalStaffState extends State<HospitalStaff> {
  @override
  Widget build(BuildContext context) {
    final hospitalProvider = Provider.of<HospitalProvider>(context);
    final staff = hospitalProvider.staff;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff Management'),
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddStaffDialog(context, hospitalProvider),
            tooltip: 'Add Staff',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => hospitalProvider.loadHospitalData(),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: hospitalProvider.isLoading
          ? const Center(child: CircularProgressIndicator())
          : staff.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.people_outline, size: 80, color: Colors.grey[400]),
                      const SizedBox(height: 16),
                      Text(
                        'No staff members added yet',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: () => _showAddStaffDialog(context, hospitalProvider),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Staff Member'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0A4D68),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: staff.length,
                  itemBuilder: (context, index) {
                    final member = staff[index];
                    return _buildStaffCard(member, hospitalProvider);
                  },
                ),
    );
  }

  Widget _buildStaffCard(Map<String, dynamic> member, HospitalProvider provider) {
    final isAvailable = member['is_available'] ?? true;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white, isAvailable ? Colors.green.withValues(alpha: 0.05) : Colors.red.withValues(alpha: 0.05)],
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
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF0A4D68), Color(0xFF088395)],
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(Icons.person, color: Colors.white, size: 30),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          member['name'] ?? 'Unknown',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          member['designation'] ?? member['role'] ?? 'Staff',
                          style: TextStyle(color: Colors.grey[700], fontSize: 14),
                        ),
                        Text(
                          member['department'] ?? 'General',
                          style: TextStyle(color: Colors.grey[500], fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: isAvailable ? Colors.green.shade200 : Colors.red.shade200,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: isAvailable ? Colors.green : Colors.red,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              isAvailable ? 'Active' : 'Inactive',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: isAvailable ? Colors.green : Colors.red,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit, size: 20),
                            onPressed: () => _showEditStaffDialog(context, member, provider),
                            style: IconButton.styleFrom(
                              backgroundColor: Colors.blue.shade50,
                              foregroundColor: Colors.blue,
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.delete, size: 20),
                            onPressed: () => _showDeleteConfirmation(context, member['id'], provider),
                            style: IconButton.styleFrom(
                              backgroundColor: Colors.red.shade50,
                              foregroundColor: Colors.red,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  _buildDetailChip(Icons.school, member['qualification'] ?? 'N/A', Colors.purple),
                  _buildDetailChip(Icons.timer, '${member['experience_years'] ?? 0} years', Colors.orange),
                  _buildDetailChip(Icons.calendar_today, member['joining_date'] ?? 'N/A', Colors.teal),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.email, size: 16, color: Colors.grey[500]),
                  const SizedBox(width: 8),
                  Expanded(child: Text(member['email'] ?? 'N/A', style: TextStyle(color: Colors.grey[700]))),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.phone, size: 16, color: Colors.grey[500]),
                  const SizedBox(width: 8),
                  Text(member['phone'] ?? 'N/A', style: TextStyle(color: Colors.grey[700])),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailChip(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  void _showAddStaffDialog(BuildContext context, HospitalProvider provider) {
    final nameController = TextEditingController();
    final qualificationController = TextEditingController();
    final experienceController = TextEditingController();
    final emailController = TextEditingController();
    final phoneController = TextEditingController();

    String selectedDesignation = 'Doctor';
    String selectedDepartment = 'Cardiology';
    bool isAvailable = true;

    final List<String> designations = [
      'Doctor', 'Nurse', 'Surgeon', 'Specialist', 'Pharmacist',
      'Lab Technician', 'Radiologist', 'Physiotherapist', 'Administrator',
      'Manager', 'Accountant', 'Security', 'Cleaner', 'Driver', 'Other',
    ];

    final List<String> departments = [
      'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Gynecology',
      'Ophthalmology', 'ENT', 'Dermatology', 'Psychiatry', 'Oncology',
      'Nephrology', 'Urology', 'Gastroenterology', 'Pulmonology', 'Radiology',
      'Pathology', 'Emergency', 'ICU', 'Operation Theater', 'Pharmacy',
      'Administration', 'Finance', 'HR', 'IT', 'Security', 'Housekeeping',
      'Maintenance', 'Other',
    ];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF0A4D68).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.person_add, color: Color(0xFF0A4D68)),
              ),
              const SizedBox(width: 12),
              const Text('Add Staff Member', style: TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildTextField(nameController, 'Full Name', Icons.person),
                const SizedBox(height: 12),
                
                DropdownButtonFormField<String>(
                  initialValue: selectedDesignation,
                  decoration: InputDecoration(
                    labelText: 'Designation',
                    prefixIcon: const Icon(Icons.work, color: Color(0xFF0A4D68)),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: designations.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => selectedDesignation = value!),
                ),
                const SizedBox(height: 12),

                DropdownButtonFormField<String>(
                  initialValue: selectedDepartment,
                  decoration: InputDecoration(
                    labelText: 'Department',
                    prefixIcon: const Icon(Icons.business, color: Color(0xFF0A4D68)),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: departments.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => selectedDepartment = value!),
                ),
                const SizedBox(height: 12),

                _buildTextField(qualificationController, 'Qualification', Icons.school),
                const SizedBox(height: 12),
                _buildTextField(experienceController, 'Experience (Years)', Icons.timer, isNumber: true),
                const SizedBox(height: 12),
                _buildTextField(emailController, 'Email', Icons.email),
                const SizedBox(height: 12),
                _buildTextField(phoneController, 'Phone Number', Icons.phone),
                const SizedBox(height: 12),

                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Checkbox(
                        value: isAvailable,
                        onChanged: (value) => setState(() => isAvailable = value!),
                        activeColor: const Color(0xFF0A4D68),
                      ),
                      const Expanded(child: Text('Active / Available for duty')),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isAvailable ? 'Active' : 'Inactive',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isAvailable ? Colors.green : Colors.red,
                          ),
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
              style: TextButton.styleFrom(foregroundColor: Colors.grey[600]),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
    onPressed: () async {
      final staffData = {
        'name': nameController.text,
        'designation': selectedDesignation,
        'department': selectedDepartment,
        'qualification': qualificationController.text,
        'experience_years': int.tryParse(experienceController.text) ?? 0,
        'email': emailController.text,
        'phone': phoneController.text,
        'is_available': isAvailable,
      };

      // Use provider instead of calling API directly
      final success = await provider.addStaffMember(staffData);
      if (!context.mounted) return;
      Navigator.pop(context);
      
      if (success && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Staff added successfully'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
      } else if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(provider.errorMessage ?? 'Failed to add staff'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    },
    style: ElevatedButton.styleFrom(
      backgroundColor: const Color(0xFF0A4D68),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    child: const Text('Add'),
  ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, IconData icon, {bool isNumber = false}) {
    return TextField(
      controller: controller,
      keyboardType: isNumber ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: const Color(0xFF0A4D68)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _showEditStaffDialog(BuildContext context, Map<String, dynamic> staff, HospitalProvider provider) {
    final List<String> designations = [
      'Doctor', 'Nurse', 'Surgeon', 'Specialist', 'Pharmacist',
      'Lab Technician', 'Radiologist', 'Physiotherapist', 'Administrator',
      'Manager', 'Accountant', 'Security', 'Cleaner', 'Driver', 'Other'
    ];

    final List<String> departments = [
      'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Gynecology',
      'Ophthalmology', 'ENT', 'Dermatology', 'Psychiatry', 'Oncology',
      'Nephrology', 'Urology', 'Gastroenterology', 'Pulmonology', 'Radiology',
      'Pathology', 'Emergency', 'ICU', 'Operation Theater', 'Pharmacy',
      'Administration', 'Finance', 'HR', 'IT', 'Security', 'Housekeeping',
      'Maintenance', 'Other'
    ];

    String selectedDesignation = staff['designation'] ?? staff['role'] ?? 'Doctor';
    String selectedDepartment = staff['department'] ?? 'Cardiology';
    bool isAvailable = staff['is_available'] ?? true;

    final qualificationController = TextEditingController(text: staff['qualification'] ?? '');
    final experienceController = TextEditingController(text: (staff['experience_years'] ?? 0).toString());
    final phoneController = TextEditingController(text: staff['phone'] ?? '');

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.edit, color: Colors.blue),
              ),
              const SizedBox(width: 12),
              Text('Edit ${staff['name']}', style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: selectedDesignation,
                  decoration: InputDecoration(
                    labelText: 'Designation',
                    prefixIcon: const Icon(Icons.work, color: Colors.blue),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: designations.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => selectedDesignation = value!),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedDepartment,
                  decoration: InputDecoration(
                    labelText: 'Department',
                    prefixIcon: const Icon(Icons.business, color: Colors.blue),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: departments.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => selectedDepartment = value!),
                ),
                const SizedBox(height: 12),
                _buildTextField(qualificationController, 'Qualification', Icons.school),
                const SizedBox(height: 12),
                _buildTextField(experienceController, 'Experience (Years)', Icons.timer, isNumber: true),
                const SizedBox(height: 12),
                _buildTextField(phoneController, 'Phone', Icons.phone),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Checkbox(
                        value: isAvailable,
                        onChanged: (value) => setState(() => isAvailable = value!),
                        activeColor: Colors.blue,
                      ),
                      const Expanded(child: Text('Active / Available for duty')),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isAvailable ? 'Active' : 'Inactive',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isAvailable ? Colors.green : Colors.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                Navigator.pop(context);
                provider.loadHospitalData();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Staff updated successfully'),
                      backgroundColor: Colors.green,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A4D68),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  void _showDeleteConfirmation(BuildContext context, int? staffId, HospitalProvider provider) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.delete, color: Colors.red),
            ),
            const SizedBox(width: 12),
            const Text('Delete Staff', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: const Text('Are you sure you want to remove this staff member?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Staff removed'),
                    backgroundColor: Colors.red,
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              }
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}
