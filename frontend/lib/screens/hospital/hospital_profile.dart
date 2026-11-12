// lib/screens/hospital/hospital_profile.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/hospital_provider.dart';
import '../../services/api_service.dart';
import '../login_screen.dart';

class HospitalProfile extends StatelessWidget {
  const HospitalProfile({super.key});

  @override
  Widget build(BuildContext context) {
    final hospitalProvider = Provider.of<HospitalProvider>(context);
    final hospitalData = hospitalProvider.hospitalData;
    final authProvider = Provider.of<AuthProvider>(context, listen: false);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hospital Profile'),
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => hospitalProvider.loadHospitalData(),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: hospitalProvider.isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Profile Header Card
                  Container(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF142D4E), Color(0xFF0D9488)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.1),
                                  blurRadius: 20,
                                  offset: const Offset(0, 10),
                                ),
                              ],
                            ),
                            child: const Icon(Icons.local_hospital,
                                size: 60, color: Color(0xFF142D4E)),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            hospitalData?['name'] ?? 'Hospital Name',
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.white24,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              'Est. ${hospitalData?['established_year'] ?? 1985}',
                              style: const TextStyle(color: Colors.white70),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Contact Information Card
                  _buildInfoSection(
                    title: 'Contact Information',
                    icon: Icons.contact_phone,
                    children: [
                      _buildInfoRow(
                          Icons.location_on,
                          'Address',
                          hospitalData?['address'] ?? 'Not set',
                          AppColors.error),
                      _buildDivider(),
                      _buildInfoRow(
                          Icons.phone,
                          'Phone',
                          hospitalData?['phone'] ?? 'Not set',
                          AppColors.success),
                      _buildDivider(),
                      _buildInfoRow(
                          Icons.email,
                          'Email',
                          hospitalData?['email'] ?? 'Not set',
                          AppColors.primary),
                      _buildDivider(),
                      _buildInfoRow(
                          Icons.web,
                          'Website',
                          hospitalData?['website'] ?? 'www.hospital.com',
                          AppColors.secondary),
                      _buildDivider(),
                      _buildInfoRow(
                          Icons.business,
                          'Registration',
                          hospitalData?['registration_number'] ?? 'Not set',
                          AppColors.warning),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.edit),
                          label: const Text('Edit contact details'),
                          onPressed: () =>
                              _editHospitalContact(context, hospitalProvider),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _buildInfoSection(
                      title: 'Hospital Location',
                      icon: Icons.location_on,
                      children: [
                        _buildInfoRow(
                            Icons.business,
                            'Reference',
                            '${hospitalData?['latitude'] ?? 'Not set'}, ${hospitalData?['longitude'] ?? 'Not set'}',
                            AppColors.primary),
                        _buildDivider(),
                        _buildInfoRow(
                            Icons.door_front_door,
                            'Front gate',
                            hospitalData?['entrance_verified'] == true
                                ? '${hospitalData?['entrance_latitude']}, ${hospitalData?['entrance_longitude']}'
                                : 'Not verified — navigation uses hospital location',
                            AppColors.secondary),
                        const SizedBox(height: 8),
                        Align(
                            alignment: Alignment.centerRight,
                            child: OutlinedButton.icon(
                                icon: const Icon(Icons.edit_location_alt),
                                label: const Text('Set verified front gate'),
                                onPressed: () =>
                                    _editEntrance(context, hospitalProvider))),
                      ]),
                  const SizedBox(height: 16),

                  // Verification Status Card
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.grey.shade100,
                          blurRadius: 20,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF142D4E)
                                      .withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.shield,
                                    color: Color(0xFF142D4E), size: 20),
                              ),
                              const SizedBox(width: 12),
                              const Text(
                                'Verification Status',
                                style: TextStyle(
                                    fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: (hospitalData?['is_verified'] ?? false)
                                    ? [
                                        AppColors.success
                                            .withValues(alpha: 0.1),
                                        AppColors.success.withValues(alpha: 0.1)
                                      ]
                                    : [
                                        AppColors.warning
                                            .withValues(alpha: 0.1),
                                        AppColors.warning.withValues(alpha: 0.1)
                                      ],
                              ),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: (hospitalData?['is_verified'] ?? false)
                                    ? AppColors.success.withValues(alpha: 0.1)
                                    : AppColors.warning.withValues(alpha: 0.1),
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: const BoxDecoration(
                                    color: Colors.white,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    (hospitalData?['is_verified'] ?? false)
                                        ? Icons.verified
                                        : Icons.pending,
                                    color:
                                        (hospitalData?['is_verified'] ?? false)
                                            ? AppColors.success
                                            : AppColors.warning,
                                    size: 28,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (hospitalData?['is_verified'] ?? false)
                                            ? 'Verified Hospital'
                                            : 'Pending Verification',
                                        style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                          color:
                                              (hospitalData?['is_verified'] ??
                                                      false)
                                                  ? AppColors.success
                                                  : AppColors.warning,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        (hospitalData?['is_verified'] ?? false)
                                            ? 'Your hospital has been verified and approved'
                                            : 'Your hospital is awaiting admin verification',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color:
                                              (hospitalData?['is_verified'] ??
                                                      false)
                                                  ? AppColors.success
                                                  : AppColors.warning,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                TextButton(
                                  onPressed: () {},
                                  style: TextButton.styleFrom(
                                    foregroundColor: AppColors.primary,
                                  ),
                                  child: const Text('View Details'),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Logout Button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () async {
                        final shouldLogout = await showDialog<bool>(
                          context: context,
                          builder: (context) => AlertDialog(
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20)),
                            title: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color:
                                        AppColors.error.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Icon(Icons.logout,
                                      color: AppColors.error),
                                ),
                                const SizedBox(width: 12),
                                const Text('Logout',
                                    style:
                                        TextStyle(fontWeight: FontWeight.bold)),
                              ],
                            ),
                            content:
                                const Text('Are you sure you want to logout?'),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context, false),
                                style: TextButton.styleFrom(
                                  foregroundColor: Colors.grey[600],
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 20, vertical: 12),
                                ),
                                child: const Text('Cancel'),
                              ),
                              ElevatedButton(
                                onPressed: () => Navigator.pop(context, true),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.error,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 20, vertical: 12),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12)),
                                ),
                                child: const Text('Logout'),
                              ),
                            ],
                          ),
                        );
                        if (shouldLogout == true && context.mounted) {
                          await authProvider.logout();
                          if (context.mounted) {
                            Navigator.pushAndRemoveUntil(
                              context,
                              MaterialPageRoute(
                                  builder: (context) => const LoginScreen()),
                              (route) => false,
                            );
                          }
                        }
                      },
                      icon: const Icon(Icons.logout),
                      label: const Text('Logout'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.error,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16)),
                        textStyle: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildInfoSection(
      {required String title,
      required IconData icon,
      required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade100,
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF142D4E).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: const Color(0xFF142D4E), size: 20),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }

  Future<void> _editHospitalContact(
      BuildContext context, HospitalProvider provider) async {
    final data = provider.hospitalData ?? const <String, dynamic>{};
    final formKey = GlobalKey<FormState>();
    final name = TextEditingController(text: '${data['name'] ?? ''}');
    final address = TextEditingController(text: '${data['address'] ?? ''}');
    final phone = TextEditingController(text: '${data['phone'] ?? ''}');
    final email = TextEditingController(text: '${data['email'] ?? ''}');

    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit hospital contact details'),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: name,
                    decoration: const InputDecoration(
                        labelText: 'Hospital name',
                        prefixIcon: Icon(Icons.local_hospital)),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Hospital name is required'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: address,
                    maxLines: 2,
                    decoration: const InputDecoration(
                        labelText: 'Address',
                        prefixIcon: Icon(Icons.location_on)),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Address is required'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                        labelText: 'Phone number',
                        prefixIcon: Icon(Icons.phone_outlined)),
                    validator: (value) {
                      final text = value?.trim() ?? '';
                      if (text.isEmpty) return 'Phone number is required';
                      return RegExp(r'^[+0-9][0-9\s-]{7,19}$').hasMatch(text)
                          ? null
                          : 'Please enter a valid mobile number';
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                        labelText: 'Email / Gmail',
                        prefixIcon: Icon(Icons.email_outlined)),
                    validator: (value) {
                      final text = value?.trim() ?? '';
                      if (text.isEmpty) return 'Email is required';
                      return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                              .hasMatch(text)
                          ? null
                          : 'Please enter a valid email address';
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final response = await ApiService.updateHospitalProfile({
                'name': name.text.trim(),
                'address': address.text.trim(),
                'phone': phone.text.trim(),
                'email': email.text.trim(),
              });
              if (!dialogContext.mounted) return;
              if (response['success'] == true) {
                Navigator.of(dialogContext).pop(true);
              } else {
                ScaffoldMessenger.of(dialogContext).showSnackBar(SnackBar(
                    content: Text(response['message'] ??
                        'Unable to update contact information. Please try again.')));
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    name.dispose();
    address.dispose();
    phone.dispose();
    email.dispose();
    if (saved == true) {
      await provider.loadHospitalData();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Hospital contact details updated successfully'),
            backgroundColor: AppColors.success));
      }
    }
  }

  Future<void> _editEntrance(
      BuildContext context, HospitalProvider provider) async {
    final data = provider.hospitalData;
    final lat =
        TextEditingController(text: '${data?['entrance_latitude'] ?? ''}');
    final lng =
        TextEditingController(text: '${data?['entrance_longitude'] ?? ''}');
    final address =
        TextEditingController(text: '${data?['entrance_address'] ?? ''}');
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm front-gate location'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                  'Enter only coordinates verified at the public vehicle entrance. These are used for patient directions.'),
              TextField(
                controller: lat,
                keyboardType: const TextInputType.numberWithOptions(
                    decimal: true, signed: true),
                decoration:
                    const InputDecoration(labelText: 'Front gate latitude'),
              ),
              TextField(
                controller: lng,
                keyboardType: const TextInputType.numberWithOptions(
                    decimal: true, signed: true),
                decoration:
                    const InputDecoration(labelText: 'Front gate longitude'),
              ),
              TextField(
                controller: address,
                decoration: const InputDecoration(
                    labelText: 'Entrance address (optional)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final r = await ApiService.updateHospitalEntrance(
                data?['id'] as int,
                {
                  'latitude': data?['latitude'],
                  'longitude': data?['longitude'],
                  'entrance_latitude': lat.text,
                  'entrance_longitude': lng.text,
                  'entrance_address': address.text,
                  'entrance_verified': true,
                },
              );
              if (r['success'] == true && dialogContext.mounted) {
                Navigator.pop(dialogContext, true);
              }
            },
            child: const Text('Confirm location'),
          ),
        ],
      ),
    );
    lat.dispose();
    lng.dispose();
    address.dispose();
    if (saved == true) {
      await provider.loadHospitalData();
    }
  }

  Widget _buildInfoRow(
      IconData icon, String label, String text, Color iconColor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: iconColor),
          ),
          const SizedBox(width: 12),
          SizedBox(
              width: 100,
              child: Text(label,
                  style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(
              child: Text(text, style: TextStyle(color: Colors.grey[700]))),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return Divider(height: 1, thickness: 1, color: Colors.grey.shade100);
  }
}
