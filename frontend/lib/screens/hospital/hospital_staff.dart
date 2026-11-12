// lib/screens/hospital/hospital_staff.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../providers/hospital_provider.dart';
import '../../services/api_service.dart';

class HospitalStaff extends StatefulWidget {
  const HospitalStaff({super.key});

  @override
  State<HospitalStaff> createState() => _HospitalStaffState();
}

class _HospitalStaffState extends State<HospitalStaff> {
  // HospitalProvider deliberately does not load data in its constructor. Start
  // the shared hospital/profile -> staff sequence when this tab is first used.
  // This keeps the empty state from appearing before the staff request begins.
  bool _requestedInitialLoad = false;

  @override
  void initState() {
    super.initState();
    _requestedInitialLoad = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final provider = context.read<HospitalProvider>();
      if (!provider.isInitialized && !provider.isLoading) {
        provider.loadHospitalData();
      }
    });
  }

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
      body: hospitalProvider.isLoading ||
              (_requestedInitialLoad && !hospitalProvider.isInitialized)
          ? const Center(child: CircularProgressIndicator())
          : staff.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.people_outline,
                          size: 80, color: Colors.grey[400]),
                      const SizedBox(height: 16),
                      Text(
                        'No staff members added yet',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: () =>
                            _showAddStaffDialog(context, hospitalProvider),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Staff Member'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF142D4E),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
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

  Widget _buildStaffCard(
      Map<String, dynamic> member, HospitalProvider provider) {
    final isAvailable = member['is_available'] == true;

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
            colors: [
              Colors.white,
              isAvailable
                  ? AppColors.success.withValues(alpha: 0.05)
                  : AppColors.error.withValues(alpha: 0.05)
            ],
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
                        colors: [Color(0xFF142D4E), Color(0xFF0D9488)],
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child:
                        const Icon(Icons.person, color: Colors.white, size: 30),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          member['name'] ?? 'Unknown',
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          member['designation'] ?? member['role'] ?? 'Staff',
                          style:
                              TextStyle(color: Colors.grey[700], fontSize: 14),
                        ),
                        Text(
                          member['department'] ?? 'General',
                          style:
                              TextStyle(color: Colors.grey[500], fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable
                              ? AppColors.success.withValues(alpha: 0.1)
                              : AppColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: isAvailable
                                ? AppColors.success.withValues(alpha: 0.1)
                                : AppColors.error.withValues(alpha: 0.1),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: isAvailable
                                    ? AppColors.success
                                    : AppColors.error,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              isAvailable ? 'Active' : 'Inactive',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: isAvailable
                                    ? AppColors.success
                                    : AppColors.error,
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
                            onPressed: () =>
                                _showEditStaffDialog(context, member, provider),
                            style: IconButton.styleFrom(
                              backgroundColor:
                                  AppColors.primary.withValues(alpha: 0.1),
                              foregroundColor: AppColors.primary,
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.calendar_month, size: 20),
                            tooltip: 'Appointment availability',
                            onPressed: () =>
                                _showScheduleDialog(context, member),
                            style: IconButton.styleFrom(
                              backgroundColor:
                                  AppColors.secondary.withValues(alpha: 0.1),
                              foregroundColor: AppColors.secondary,
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: Icon(
                                member['user_id'] == null
                                    ? Icons.key
                                    : Icons.password,
                                size: 20),
                            tooltip: member['user_id'] == null
                                ? 'Create login account'
                                : 'Reset account password',
                            onPressed: member['user_id'] == null
                                ? () => _showCreateDoctorAccountDialog(
                                    context, member)
                                : () => _showResetDoctorPasswordDialog(
                                    context, member),
                            style: IconButton.styleFrom(
                                backgroundColor:
                                    AppColors.primary.withValues(alpha: 0.1),
                                foregroundColor: AppColors.primary),
                          ),
                          if (member['user_id'] != null) ...[
                            const SizedBox(width: 8),
                            IconButton(
                                tooltip:
                                    member['account_status'] == 'DEACTIVATED'
                                        ? 'Activate doctor account'
                                        : 'Deactivate doctor account',
                                icon: Icon(
                                    member['account_status'] == 'DEACTIVATED'
                                        ? Icons.person_add_alt_1
                                        : Icons.person_off_outlined),
                                onPressed: () =>
                                    _toggleDoctorAccount(context, member),
                                style: IconButton.styleFrom(
                                    backgroundColor: member['account_status'] ==
                                            'DEACTIVATED'
                                        ? AppColors.success
                                            .withValues(alpha: 0.1)
                                        : AppColors.warning
                                            .withValues(alpha: 0.1),
                                    foregroundColor: member['account_status'] ==
                                            'DEACTIVATED'
                                        ? AppColors.success
                                        : Colors.deepOrange)),
                          ],
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.delete, size: 20),
                            onPressed: () => _showDeleteConfirmation(
                                context, member['id'], provider),
                            style: IconButton.styleFrom(
                              backgroundColor:
                                  AppColors.error.withValues(alpha: 0.1),
                              foregroundColor: AppColors.error,
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
                  _buildDetailChip(Icons.school,
                      member['qualification'] ?? 'N/A', AppColors.secondary),
                  _buildDetailChip(
                      Icons.timer,
                      '${member['experience_years'] ?? 0} years',
                      AppColors.warning),
                  _buildDetailChip(Icons.calendar_today,
                      member['joining_date'] ?? 'N/A', AppColors.secondary),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.email_outlined, size: 16, color: Colors.grey[500]),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      member['email']?.toString().trim().isNotEmpty == true
                          ? member['email'].toString()
                          : 'Email not provided',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.grey[700]),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.phone_outlined, size: 16, color: Colors.grey[500]),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      member['phone']?.toString().trim().isNotEmpty == true
                          ? member['phone'].toString()
                          : 'Phone not provided',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.grey[700]),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showScheduleDialog(
      BuildContext context, Map<String, dynamic> doctor) async {
    final rawId = doctor['id'];
    final doctorId = rawId is num ? rawId.toInt() : int.tryParse('$rawId');
    if (doctorId == null) return;
    final result = await ApiService.getHospitalDoctorSchedule(doctorId);
    if (!context.mounted) return;
    if (result['success'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              result['message'] ?? 'Unable to load appointment schedule')));
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (_) => _DoctorScheduleDialog(
        doctorName: '${doctor['name'] ?? 'Doctor'}',
        doctorId: doctorId,
        initialSchedules: (result['schedules'] as List? ?? [])
            .whereType<Map>()
            .map((row) => Map<String, dynamic>.from(row))
            .toList(),
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
            style: TextStyle(
                fontSize: 12, color: color, fontWeight: FontWeight.w500),
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
      'Doctor',
      'Nurse',
      'Surgeon',
      'Specialist',
      'Pharmacist',
      'Lab Technician',
      'Radiologist',
      'Physiotherapist',
      'Administrator',
      'Manager',
      'Accountant',
      'Security',
      'Cleaner',
      'Driver',
      'Other',
    ];

    final List<String> departments = [
      'Cardiology',
      'Neurology',
      'Orthopedics',
      'Pediatrics',
      'Gynecology',
      'Ophthalmology',
      'ENT',
      'Dermatology',
      'Psychiatry',
      'Oncology',
      'Nephrology',
      'Urology',
      'Gastroenterology',
      'Pulmonology',
      'Radiology',
      'Pathology',
      'Emergency',
      'ICU',
      'Operation Theater',
      'Pharmacy',
      'Administration',
      'Finance',
      'HR',
      'IT',
      'Security',
      'Housekeeping',
      'Maintenance',
      'Other',
    ];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF142D4E).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.person_add, color: Color(0xFF142D4E)),
              ),
              const SizedBox(width: 12),
              const Text('Add Staff Member',
                  style: TextStyle(fontWeight: FontWeight.bold)),
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
                    prefixIcon:
                        const Icon(Icons.work, color: Color(0xFF142D4E)),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  items: designations.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) =>
                      setState(() => selectedDesignation = value!),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedDepartment,
                  decoration: InputDecoration(
                    labelText: 'Department',
                    prefixIcon:
                        const Icon(Icons.business, color: Color(0xFF142D4E)),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  items: departments.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) =>
                      setState(() => selectedDepartment = value!),
                ),
                const SizedBox(height: 12),
                _buildTextField(
                    qualificationController, 'Qualification', Icons.school),
                const SizedBox(height: 12),
                _buildTextField(
                    experienceController, 'Experience (Years)', Icons.timer,
                    isNumber: true),
                const SizedBox(height: 12),
                _buildTextField(emailController, 'Email', Icons.email),
                const SizedBox(height: 12),
                _buildTextField(phoneController, 'Phone Number', Icons.phone),
                const SizedBox(height: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Checkbox(
                        value: isAvailable,
                        onChanged: (value) =>
                            setState(() => isAvailable = value!),
                        activeColor: const Color(0xFF142D4E),
                      ),
                      const Expanded(
                          child: Text('Active / Available for duty')),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable
                              ? AppColors.success.withValues(alpha: 0.1)
                              : AppColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isAvailable ? 'Active' : 'Inactive',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isAvailable
                                ? AppColors.success
                                : AppColors.error,
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
                  'experience_years':
                      int.tryParse(experienceController.text) ?? 0,
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
                      backgroundColor: AppColors.success,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                } else if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content:
                          Text(provider.errorMessage ?? 'Failed to add staff'),
                      backgroundColor: AppColors.error,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF142D4E),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(
      TextEditingController controller, String label, IconData icon,
      {bool isNumber = false}) {
    return TextField(
      controller: controller,
      keyboardType: isNumber ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: const Color(0xFF142D4E)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _showEditStaffDialog(BuildContext context, Map<String, dynamic> staff,
      HospitalProvider provider) {
    final List<String> designations = [
      'Doctor',
      'Nurse',
      'Surgeon',
      'Specialist',
      'Pharmacist',
      'Lab Technician',
      'Radiologist',
      'Physiotherapist',
      'Administrator',
      'Manager',
      'Accountant',
      'Security',
      'Cleaner',
      'Driver',
      'Other'
    ];

    final List<String> departments = [
      'Cardiology',
      'Neurology',
      'Orthopedics',
      'Pediatrics',
      'Gynecology',
      'Ophthalmology',
      'ENT',
      'Dermatology',
      'Psychiatry',
      'Oncology',
      'Nephrology',
      'Urology',
      'Gastroenterology',
      'Pulmonology',
      'Radiology',
      'Pathology',
      'Emergency',
      'ICU',
      'Operation Theater',
      'Pharmacy',
      'Administration',
      'Finance',
      'HR',
      'IT',
      'Security',
      'Housekeeping',
      'Maintenance',
      'Other'
    ];

    String selectedDesignation =
        staff['designation'] ?? staff['role'] ?? 'Doctor';
    String selectedDepartment = staff['department'] ?? 'Cardiology';
    // Older records can contain values removed from the current options.
    // DropdownButton requires exactly one matching value.
    final uniqueDesignations = designations.toSet().toList();
    final uniqueDepartments = departments.toSet().toList();
    if (!uniqueDesignations.contains(selectedDesignation)) {
      selectedDesignation = uniqueDesignations.first;
    }
    if (!uniqueDepartments.contains(selectedDepartment)) {
      selectedDepartment = uniqueDepartments.first;
    }
    bool isAvailable = staff['is_available'] == true;

    final qualificationController =
        TextEditingController(text: staff['qualification'] ?? '');
    final experienceController = TextEditingController(
        text: (staff['experience_years'] ?? 0).toString());
    final phoneController = TextEditingController(text: staff['phone'] ?? '');
    final emailController = TextEditingController(text: staff['email'] ?? '');

    showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.edit, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Text('Edit ${staff['name']}',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
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
                    prefixIcon:
                        const Icon(Icons.work, color: AppColors.primary),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  items: uniqueDesignations.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) =>
                      setState(() => selectedDesignation = value!),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedDepartment,
                  decoration: InputDecoration(
                    labelText: 'Department',
                    prefixIcon:
                        const Icon(Icons.business, color: AppColors.primary),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  items: uniqueDepartments.map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (value) =>
                      setState(() => selectedDepartment = value!),
                ),
                const SizedBox(height: 12),
                _buildTextField(
                    qualificationController, 'Qualification', Icons.school),
                const SizedBox(height: 12),
                _buildTextField(
                    experienceController, 'Experience (Years)', Icons.timer,
                    isNumber: true),
                const SizedBox(height: 12),
                _buildTextField(phoneController, 'Phone', Icons.phone),
                const SizedBox(height: 12),
                TextField(
                  controller: emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    labelText: 'Email / Gmail',
                    prefixIcon: const Icon(Icons.email),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Checkbox(
                        value: isAvailable,
                        onChanged: (value) =>
                            setState(() => isAvailable = value!),
                        activeColor: AppColors.primary,
                      ),
                      const Expanded(
                          child: Text('Active / Available for duty')),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable
                              ? AppColors.success.withValues(alpha: 0.1)
                              : AppColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isAvailable ? 'Active' : 'Inactive',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isAvailable
                                ? AppColors.success
                                : AppColors.error,
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
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                final phone = phoneController.text.trim();
                if (phone.isEmpty ||
                    !RegExp(r'^[+0-9][0-9\s-]{7,19}$').hasMatch(phone)) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Please enter a valid mobile number'),
                    backgroundColor: AppColors.error,
                  ));
                  return;
                }
                final email = emailController.text.trim();
                final isValidEmail =
                    RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
                if (email.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Email is required'),
                    backgroundColor: AppColors.error,
                  ));
                  return;
                }
                if (!isValidEmail) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Please enter a valid email address'),
                    backgroundColor: AppColors.error,
                  ));
                  return;
                }
                final result = await provider.updateStaffMember(
                  staff['id'] as int,
                  {
                    'designation': selectedDesignation,
                    'department': selectedDepartment,
                    'qualification': qualificationController.text.trim(),
                    'experience_years':
                        int.tryParse(experienceController.text.trim()),
                    'phone': phone,
                    'email': email,
                    'is_available': isAvailable,
                  },
                );
                if (!context.mounted) return;
                if (result['success'] == true) {
                  final messenger = ScaffoldMessenger.of(context);
                  Navigator.of(context).pop();
                  messenger.showSnackBar(
                    const SnackBar(
                      content: Text('Staff updated successfully'),
                      backgroundColor: AppColors.success,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content:
                          Text(result['message'] ?? 'Could not update staff'),
                      backgroundColor: AppColors.error,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF142D4E),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    ).whenComplete(() {
      qualificationController.dispose();
      experienceController.dispose();
      phoneController.dispose();
      emailController.dispose();
    });
  }

  void _showDeleteConfirmation(
      BuildContext context, int? staffId, HospitalProvider provider) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.delete, color: AppColors.error),
            ),
            const SizedBox(width: 12),
            const Text('Delete Staff',
                style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content:
            const Text('Are you sure you want to remove this staff member?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () async {
              if (staffId == null) return;
              final result = await provider.deactivateStaffMember(staffId);
              if (!context.mounted) return;
              Navigator.pop(context);
              if (result['success'] == true) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Staff member deactivated'),
                    backgroundColor: AppColors.error,
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content:
                        Text(result['message'] ?? 'Could not deactivate staff'),
                    backgroundColor: AppColors.error,
                  ),
                );
              }
            },
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _showCreateDoctorAccountDialog(
      BuildContext context, Map<String, dynamic> doctor) {
    final provider = Provider.of<HospitalProvider>(context, listen: false);
    final login = TextEditingController(text: doctor['email'] ?? '');
    final password = TextEditingController();
    final confirmation = TextEditingController();
    bool showPassword = false;
    bool showConfirmation = false;
    showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text('Create login account\n${doctor['name']}'),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('Account Credentials',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              TextField(
                  controller: login,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                      labelText: 'Email (optional; mobile number also works)',
                      prefixIcon: Icon(Icons.person_outline))),
              const SizedBox(height: 12),
              TextField(
                  controller: password,
                  obscureText: !showPassword,
                  decoration: InputDecoration(
                      labelText: 'Initial password (10+ characters)',
                      prefixIcon: const Icon(Icons.lock),
                      suffixIcon: IconButton(
                          tooltip:
                              showPassword ? 'Hide password' : 'Show password',
                          icon: Icon(showPassword
                              ? Icons.visibility_off
                              : Icons.visibility),
                          onPressed: () =>
                              setState(() => showPassword = !showPassword)))),
              const SizedBox(height: 12),
              TextField(
                  controller: confirmation,
                  obscureText: !showConfirmation,
                  decoration: InputDecoration(
                      labelText: 'Confirm Password',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                          icon: Icon(showConfirmation
                              ? Icons.visibility_off
                              : Icons.visibility),
                          onPressed: () => setState(
                              () => showConfirmation = !showConfirmation)))),
            ])),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel')),
            ElevatedButton(
                onPressed: () async {
                  if (password.text.length < 10 ||
                      !RegExp(r'[A-Z]').hasMatch(password.text) ||
                      !RegExp(r'[a-z]').hasMatch(password.text) ||
                      !RegExp(r'[0-9]').hasMatch(password.text) ||
                      !RegExp(r'[!@#\$%^&*(),.?":{}|<>_\-]')
                          .hasMatch(password.text)) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text(
                            'Use at least 10 characters with uppercase, lowercase, a number and a symbol.')));
                    return;
                  }
                  if (password.text != confirmation.text) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Passwords do not match.')));
                    return;
                  }
                  final result = await ApiService.createStaffUser({
                    'name': doctor['name'],
                    'email': login.text.trim(),
                    'phone': doctor['phone'] ?? '',
                    'password': password.text,
                    'role': 'doctor',
                    'department': doctor['department'],
                    'qualifications': doctor['qualification'],
                    'experience_years': doctor['experience_years'],
                    'doctor_id': doctor['id'],
                  });
                  if (!context.mounted) return;
                  if (result['success'] == true) {
                    Navigator.pop(dialogContext);
                    provider.loadHospitalData();
                    final secret =
                        result['data']?['initial_password']?.toString() ??
                            password.text;
                    await showDialog<void>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                                title: const Text('Doctor account created'),
                                content: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                          'Share this initial password securely. It will not be shown again, and the doctor must change it after signing in.'),
                                      const SizedBox(height: 12),
                                      SelectableText(secret)
                                    ]),
                                actions: [
                                  TextButton.icon(
                                      onPressed: () => Clipboard.setData(
                                          ClipboardData(text: secret)),
                                      icon: const Icon(Icons.copy),
                                      label: const Text('Copy')),
                                  FilledButton(
                                      onPressed: () => Navigator.pop(ctx),
                                      child: const Text('Done'))
                                ]));
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text(
                            result['message'] ?? 'Unable to create account')));
                  }
                },
                child: const Text('Create account')),
          ],
        ),
      ),
    ).whenComplete(() {
      login.dispose();
      password.dispose();
      confirmation.dispose();
    });
  }

  Future<void> _toggleDoctorAccount(
      BuildContext context, Map<String, dynamic> doctor) async {
    final activating = doctor['account_status'] == 'DEACTIVATED';
    final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
                title: Text(
                    '${activating ? 'Activate' : 'Deactivate'} doctor account?'),
                content: Text(
                    '${doctor['name']} will ${activating ? 'regain' : 'lose'} portal access${activating ? '' : ' immediately'}. Doctor availability is managed separately.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text(activating ? 'Activate' : 'Deactivate'))
                ]));
    if (ok != true) return;
    final result = await ApiService.updateHospitalDoctorStatus(
        (doctor['id'] as num).toInt(), activating ? 'active' : 'deactivated');
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(result['message'] ?? 'Unable to update doctor account')));
    if (result['success'] == true) {
      Provider.of<HospitalProvider>(context, listen: false).loadHospitalData();
    }
  }

  void _showResetDoctorPasswordDialog(
      BuildContext context, Map<String, dynamic> doctor) {
    showDialog<void>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
            builder: (context, setState) => AlertDialog(
                  title: Text('Reset password\n${doctor['name']}'),
                  content: const Text(
                      'Issue a new temporary password? The current password is never shown, and the doctor must change the temporary password at next login.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        child: const Text('Cancel')),
                    ElevatedButton(
                        onPressed: () async {
                          final result = await ApiService.resetStaffPassword(
                              doctor['user_id'] as int, '');
                          if (!context.mounted) return;
                          if (result['success'] == true) {
                            Navigator.pop(dialogContext);
                            final secret = result['data']?['temporary_password']
                                    ?.toString() ??
                                '';
                            await showDialog<void>(
                                context: context,
                                builder: (ctx) => AlertDialog(
                                        title: const Text('Temporary password'),
                                        content: Column(
                                            mainAxisSize: MainAxisSize.min,
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              const Text(
                                                  'Share securely. This password is shown only once and must be changed after the next login.'),
                                              const SizedBox(height: 12),
                                              SelectableText(secret)
                                            ]),
                                        actions: [
                                          TextButton.icon(
                                              onPressed: () =>
                                                  Clipboard.setData(
                                                      ClipboardData(
                                                          text: secret)),
                                              icon: const Icon(Icons.copy),
                                              label: const Text('Copy')),
                                          FilledButton(
                                              onPressed: () =>
                                                  Navigator.pop(ctx),
                                              child: const Text('Done'))
                                        ]));
                          } else {
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                content: Text(result['message'] ??
                                    'Unable to reset password')));
                          }
                        },
                        child: const Text('Reset password'))
                  ],
                )));
  }
}

class _DoctorScheduleDialog extends StatefulWidget {
  const _DoctorScheduleDialog(
      {required this.doctorName,
      required this.doctorId,
      required this.initialSchedules});
  final String doctorName;
  final int doctorId;
  final List<Map<String, dynamic>> initialSchedules;
  @override
  State<_DoctorScheduleDialog> createState() => _DoctorScheduleDialogState();
}

class _WorkingPeriod {
  _WorkingPeriod(this.start, this.end);
  TimeOfDay start;
  TimeOfDay end;
}

class _DoctorScheduleDialogState extends State<_DoctorScheduleDialog> {
  static const _days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];
  static const _durations = [10, 15, 20, 30, 45, 60];
  late final List<bool> _enabled;
  late final List<List<_WorkingPeriod>> _periods;
  int _duration = 30;
  bool _saving = false;

  TimeOfDay _parseTime(Object? value, TimeOfDay fallback) {
    final parts = (value?.toString() ?? '').split(':');
    final hour = parts.isEmpty ? null : int.tryParse(parts.first);
    final minute = parts.length < 2 ? null : int.tryParse(parts[1]);
    return hour == null || minute == null
        ? fallback
        : TimeOfDay(hour: hour, minute: minute);
  }

  @override
  void initState() {
    super.initState();
    _enabled = List<bool>.filled(7, false);
    _periods = List.generate(7, (_) => []);
    for (final schedule in widget.initialSchedules) {
      final day = schedule['weekday'] is num
          ? (schedule['weekday'] as num).toInt()
          : int.tryParse('${schedule['weekday']}');
      if (day == null || day < 0 || day > 6 || schedule['is_active'] == false) {
        continue;
      }
      _enabled[day] = true;
      final start = _parseTime(
          schedule['start_time'], const TimeOfDay(hour: 9, minute: 0));
      final end = _parseTime(
          schedule['end_time'], const TimeOfDay(hour: 17, minute: 0));
      final breakStart = schedule['break_start_time'] == null
          ? null
          : _parseTime(schedule['break_start_time'], start);
      final breakEnd = schedule['break_end_time'] == null
          ? null
          : _parseTime(schedule['break_end_time'], end);
      if (breakStart != null &&
          breakEnd != null &&
          _minutes(start) < _minutes(breakStart) &&
          _minutes(breakStart) < _minutes(breakEnd) &&
          _minutes(breakEnd) < _minutes(end)) {
        _periods[day].addAll(
            [_WorkingPeriod(start, breakStart), _WorkingPeriod(breakEnd, end)]);
      } else {
        _periods[day].add(_WorkingPeriod(start, end));
      }
      final savedDuration =
          int.tryParse('${schedule['slot_duration_minutes']}');
      if (savedDuration != null && _durations.contains(savedDuration)) {
        _duration = savedDuration;
      }
    }
  }

  int _minutes(TimeOfDay time) => time.hour * 60 + time.minute;
  String _apiTime(TimeOfDay time) =>
      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  String _displayTime(TimeOfDay time) => time.format(context);

  Future<void> _pickTime(_WorkingPeriod period, bool isStart) async {
    final selected = await showTimePicker(
        context: context, initialTime: isStart ? period.start : period.end);
    if (selected != null && mounted) {
      setState(() {
        if (isStart) {
          period.start = selected;
        } else {
          period.end = selected;
        }
      });
    }
  }

  String? _validationError() {
    for (var day = 0; day < 7; day++) {
      if (!_enabled[day]) continue;
      if (_periods[day].isEmpty) {
        return '${_days[day]} needs at least one working period.';
      }
      final periods = [..._periods[day]]
        ..sort((a, b) => _minutes(a.start).compareTo(_minutes(b.start)));
      for (var index = 0; index < periods.length; index++) {
        if (_minutes(periods[index].start) >= _minutes(periods[index].end)) {
          return 'End time must be after start time.';
        }
        if (_minutes(periods[index].end) - _minutes(periods[index].start) <
            _duration) {
          return 'Slot duration must fit inside every working period.';
        }
        if (index > 0 &&
            _minutes(periods[index].start) < _minutes(periods[index - 1].end)) {
          return 'Working hours cannot overlap.';
        }
      }
    }
    return _enabled.any((enabled) => enabled)
        ? null
        : 'Enable at least one real working day before saving.';
  }

  Future<void> _save() async {
    final error = _validationError();
    if (error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    final schedules = <Map<String, dynamic>>[];
    for (var day = 0; day < 7; day++) {
      if (_enabled[day]) {
        for (final period in _periods[day]) {
          schedules.add({
            'weekday': day,
            'start_time': _apiTime(period.start),
            'end_time': _apiTime(period.end),
            'slot_duration_minutes': _duration,
            'is_active': true
          });
        }
      }
    }
    setState(() => _saving = true);
    final result =
        await ApiService.saveHospitalDoctorSchedule(widget.doctorId, schedules);
    if (!mounted) return;
    setState(() => _saving = false);
    if (result['success'] == true) {
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      messenger.showSnackBar(const SnackBar(
        content: Text('Appointment availability saved'),
        backgroundColor: AppColors.success,
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(result['message'] ?? 'Unable to save schedule')));
    }
  }

  Widget _timeButton(_WorkingPeriod period, bool isStart) =>
      OutlinedButton.icon(
        onPressed: _saving ? null : () => _pickTime(period, isStart),
        icon: const Icon(Icons.access_time),
        label: Text(_displayTime(isStart ? period.start : period.end)),
      );

  Widget _periodEditor(int day, int index) {
    final period = _periods[day][index];
    // AlertDialog measures its content intrinsically. A LayoutBuilder here
    // cannot provide intrinsic dimensions and caused the blank dialog.
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('From'),
          _timeButton(period, true),
          const SizedBox(height: 8),
          const Text('To'),
          _timeButton(period, false),
          if (index > 0)
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                tooltip: 'Remove period',
                onPressed: _saving
                    ? null
                    : () => setState(() => _periods[day].removeAt(index)),
                icon: const Icon(Icons.remove_circle_outline),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.sizeOf(context);
    // Keep the explicitly constrained dialog content within small phone
    // screens without needing a LayoutBuilder under AlertDialog.
    final contentWidth = (screenSize.width - 80).clamp(0.0, 520.0).toDouble();
    final contentHeight =
        (screenSize.height - 220).clamp(240.0, 520.0).toDouble();

    return AlertDialog(
      title: Text('Appointment availability\n${widget.doctorName}'),
      content: SizedBox(
          width: contentWidth,
          height: contentHeight,
          child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<int>(
                key: ValueKey(_duration),
                initialValue: _duration,
                decoration: const InputDecoration(
                    labelText: 'Appointment slot duration',
                    suffixText: 'minutes'),
                items: _durations
                    .map((value) => DropdownMenuItem(
                        value: value, child: Text('$value minutes')))
                    .toList(),
                onChanged: _saving
                    ? null
                    : (value) => setState(() => _duration = value!)),
            const SizedBox(height: 12),
            const Text(
                'Turn on a day to select the doctor’s real working hours. Times are saved in India local time.',
                style: TextStyle(fontSize: 12)),
            if (!_enabled.any((enabled) => enabled)) ...[
              const SizedBox(height: 16),
              const Text('No availability added yet.'),
              const SizedBox(height: 8),
            ],
            ...List.generate(
                7,
                (day) => Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SwitchListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(_days[day]),
                              value: _enabled[day],
                              onChanged: _saving
                                  ? null
                                  : (value) => setState(() {
                                        _enabled[day] = value;
                                        if (value && _periods[day].isEmpty) {
                                          _periods[day].add(_WorkingPeriod(
                                              const TimeOfDay(
                                                  hour: 9, minute: 0),
                                              const TimeOfDay(
                                                  hour: 17, minute: 0)));
                                        }
                                      })),
                          if (_enabled[day])
                            Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text('Working hours',
                                          style: TextStyle(
                                              fontWeight: FontWeight.w600)),
                                      const SizedBox(height: 6),
                                      ...List.generate(_periods[day].length,
                                          (index) => _periodEditor(day, index)),
                                      TextButton.icon(
                                          onPressed: _saving
                                              ? null
                                              : () => setState(() =>
                                                  _periods[day].add(
                                                      _WorkingPeriod(
                                                          const TimeOfDay(
                                                              hour: 9,
                                                              minute: 0),
                                                          const TimeOfDay(
                                                              hour: 17,
                                                              minute: 0)))),
                                          icon: const Icon(Icons.add),
                                          label:
                                              const Text('Add working period')),
                                    ])),
                        ])),
          ]))),
      actions: [
        TextButton(
            onPressed: _saving ? null : () => Navigator.pop(context),
            child: const Text('Cancel')),
        ElevatedButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'Saving…' : 'Save availability'))
      ],
    );
  }
}
