// lib/screens/signup_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'hospital/simple_location_picker.dart';

class SignupScreen extends StatefulWidget {
  final String userType;
  const SignupScreen({super.key, required this.userType});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _isPasswordVisible = false;
  bool _isConfirmPasswordVisible = false;
  bool _acceptTerms = false;

  // Hospital specific fields (Registration Number removed)
  String _hospitalName = '';
  String _hospitalAddress = '';
  String _hospitalCity = '';
  String _hospitalState = '';
  String _hospitalPincode = '';
  String _hospitalArea = '';
  String _hospitalCountry = '';
  String _registrationNumber = '';
  double? _hospitalLatitude;
  double? _hospitalLongitude;
  bool _locationConfirmed = false;

  // Patient specific fields
  DateTime? _selectedDateOfBirth;
  String _bloodGroup = '';
  String _emergencyContact = '';
  String _emergencyContactName = '';

  @override
  Widget build(BuildContext context) {
    if (widget.userType == 'Admin') {
      return Scaffold(
        appBar: AppBar(title: const Text('Access Denied')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.admin_panel_settings, size: 80, color: Colors.red),
              ),
              const SizedBox(height: 20),
              const Text(
                'Admin accounts cannot be created',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              Text(
                'Please contact the system administrator for admin access.',
                style: TextStyle(color: Colors.grey[600]),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 30),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                child: const Text('Back to Login'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('Create ${widget.userType} Account'),
        centerTitle: false,
        elevation: 0,
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.white, const Color(0xFF0A4D68).withValues(alpha: 0.05)],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),
                _buildTextField(_nameController, 'Full Name', Icons.person_outline),
                const SizedBox(height: 16),
                _buildTextField(_emailController, 'Email', Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 16),
                _buildTextField(_phoneController, 'Phone Number', Icons.phone_outlined,
                    keyboardType: TextInputType.phone),

                if (widget.userType == 'Hospital') ...[
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.green.shade50, Colors.green.shade100],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.local_hospital, color: Colors.green),
                        SizedBox(width: 12),
                        Text(
                          'Hospital Details',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.green,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Hospital Name', Icons.local_hospital,
                      onChanged: (v) => _hospitalName = v),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Address', Icons.location_on_outlined,
                      onChanged: (v) => _hospitalAddress = v, maxLines: 2),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _buildTextField(null, 'City', Icons.location_city,
                            onChanged: (v) => _hospitalCity = v),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildTextField(null, 'State', Icons.map,
                            onChanged: (v) => _hospitalState = v),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Pincode', Icons.local_post_office,
                      onChanged: (v) => _hospitalPincode = v,
                      keyboardType: TextInputType.number),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Area', Icons.location_on, onChanged: (v) => _hospitalArea = v),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Country', Icons.public, onChanged: (v) => _hospitalCountry = v),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Hospital License / Registration Number', Icons.badge, onChanged: (v) => _registrationNumber = v),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.map_outlined),
                    label: Text(_locationConfirmed ? 'Location confirmed: ${_hospitalLatitude!.toStringAsFixed(5)}, ${_hospitalLongitude!.toStringAsFixed(5)}' : 'Select and confirm hospital location'),
                    onPressed: () async {
                      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => SimpleLocationPicker(
                        initialAddress: _hospitalAddress,
                        initialLatitude: _hospitalLatitude,
                        initialLongitude: _hospitalLongitude,
                        onLocationSelected: (lat, lng, address) => setState(() { _hospitalLatitude = lat; _hospitalLongitude = lng; _locationConfirmed = true; if (_hospitalAddress.isEmpty) _hospitalAddress = address; }),
                      )));
                    },
                  ),
                ],

                if (widget.userType == 'Patient') ...[
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.blue.shade50, Colors.blue.shade100],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.blue.shade200),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.person, color: Colors.blue),
                        SizedBox(width: 12),
                        Text(
                          'Personal Details',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.blue,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _buildDatePicker(),
                  const SizedBox(height: 16),
                  _buildDropdown(
                    'Blood Group',
                    ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
                    _bloodGroup,
                    (v) => _bloodGroup = v!,
                    Icons.water_drop,
                  ),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Emergency Contact Number', Icons.emergency,
                      onChanged: (v) => _emergencyContact = v,
                      keyboardType: TextInputType.phone),
                  const SizedBox(height: 16),
                  _buildTextField(null, 'Emergency Contact Name', Icons.person,
                      onChanged: (v) => _emergencyContactName = v),
                ],

                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.purple.shade50, Colors.purple.shade100],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.purple.shade200),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lock, color: Colors.purple),
                      SizedBox(width: 12),
                      Text(
                        'Security',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.purple,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                _buildPasswordField(
                  _passwordController,
                  'Password',
                  _isPasswordVisible,
                  () => setState(() => _isPasswordVisible = !_isPasswordVisible),
                ),
                const SizedBox(height: 16),
                _buildPasswordField(
                  _confirmPasswordController,
                  'Confirm Password',
                  _isConfirmPasswordVisible,
                  () => setState(() => _isConfirmPasswordVisible = !_isConfirmPasswordVisible),
                  isConfirm: true,
                  passwordController: _passwordController,
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Checkbox(
                      value: _acceptTerms,
                      onChanged: (v) => setState(() => _acceptTerms = v!),
                      activeColor: const Color(0xFF0A4D68),
                    ),
                    Expanded(
                      child: Text(
                        'I agree to the Terms of Service and Privacy Policy',
                        style: TextStyle(
                          color: Colors.grey[700],
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Consumer<AuthProvider>(
                  builder: (context, auth, child) => SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _acceptTerms && !auth.isLoading
                          ? _handleSignup
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0A4D68),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: auth.isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              'Create Account',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(
    TextEditingController? controller,
    String label,
    IconData icon, {
    Function(String)? onChanged,
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    final textController = controller ?? TextEditingController();
    if (onChanged != null) {
      textController.addListener(() => onChanged(textController.text));
    }
    return TextFormField(
      controller: textController,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0A4D68).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: const Color(0xFF0A4D68), size: 20),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.white,
      ),
      keyboardType: keyboardType,
      maxLines: maxLines,
      validator: (v) => v == null || v.isEmpty ? 'Please enter $label' : null,
    );
  }

  Widget _buildPasswordField(
    TextEditingController controller,
    String label,
    bool isVisible,
    VoidCallback toggle, {
    bool isConfirm = false,
    TextEditingController? passwordController,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: !isVisible,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0A4D68).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.lock_outline, color: Color(0xFF0A4D68), size: 20),
        ),
        suffixIcon: IconButton(
          icon: Icon(
            isVisible ? Icons.visibility_off : Icons.visibility,
            color: Colors.grey,
          ),
          onPressed: toggle,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.white,
      ),
      validator: (v) {
        if (v == null || v.isEmpty) return 'Please enter $label';
        if (isConfirm && v != passwordController?.text) {
          return 'Passwords do not match';
        }
        if (!isConfirm && v.length < 6) {
          return 'Password must be at least 6 characters';
        }
        return null;
      },
    );
  }

  Widget _buildDropdown(
    String label,
    List<String> items,
    String value,
    Function(String?) onChanged,
    IconData icon,
  ) {
    return DropdownButtonFormField<String>(
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0A4D68).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: const Color(0xFF0A4D68), size: 20),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.white,
      ),
      initialValue: value.isNotEmpty ? value : null,
      items: items.map((g) => DropdownMenuItem(value: g, child: Text(g))).toList(),
      onChanged: onChanged,
      validator: (v) => v == null || v.isEmpty ? 'Please select $label' : null,
    );
  }

  Widget _buildDatePicker() {
    return InkWell(
      onTap: () => _selectDateOfBirth(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
          color: Colors.white,
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0A4D68).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.cake, color: Color(0xFF0A4D68), size: 20),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Date of Birth',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _selectedDateOfBirth != null
                        ? '${_selectedDateOfBirth!.day}/${_selectedDateOfBirth!.month}/${_selectedDateOfBirth!.year}'
                        : 'Select your date of birth',
                    style: TextStyle(
                      fontSize: 16,
                      color: _selectedDateOfBirth != null
                          ? Colors.black
                          : Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.calendar_today, color: Colors.grey),
          ],
        ),
      ),
    );
  }

  Future<void> _selectDateOfBirth(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDateOfBirth ??
          DateTime.now().subtract(const Duration(days: 365 * 18)),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.light(
            primary: Color(0xFF0A4D68),
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null && picked != _selectedDateOfBirth) {
      setState(() => _selectedDateOfBirth = picked);
    }
  }

  Future<void> _handleSignup() async {
    if (_formKey.currentState!.validate()) {
      final auth = Provider.of<AuthProvider>(context, listen: false);
      Map<String, dynamic> additionalData = {};

      if (widget.userType == 'Hospital') {
        if (!_locationConfirmed || _hospitalLatitude == null || _hospitalLongitude == null) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select and confirm the hospital location.')));
          return;
        }
        additionalData = {
          'hospital_name': _hospitalName,
          'registration_number': _registrationNumber,
          'address': _hospitalAddress,
          'area': _hospitalArea,
          'city': _hospitalCity,
          'state': _hospitalState,
          'country': _hospitalCountry,
          'pincode': _hospitalPincode,
          'latitude': _hospitalLatitude,
          'longitude': _hospitalLongitude,
          'location_confirmed': true,
        };
      } else if (widget.userType == 'Patient') {
        String formattedDate = '';
        if (_selectedDateOfBirth != null) {
          formattedDate =
              '${_selectedDateOfBirth!.year}-${_selectedDateOfBirth!.month.toString().padLeft(2, '0')}-${_selectedDateOfBirth!.day.toString().padLeft(2, '0')}';
        }
        additionalData = {
          'date_of_birth': formattedDate,
          'blood_group': _bloodGroup,
          'emergency_contact': _emergencyContact,
          'emergency_contact_name': _emergencyContactName,
        };
      }

      bool success = await auth.signup(
        name: _nameController.text,
        email: _emailController.text,
        phone: _phoneController.text,
        password: _passwordController.text,
        userType: widget.userType.toLowerCase(),
        additionalData: additionalData,
      );

      if (success && mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.check_circle, color: Colors.green),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Success!',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            content: const Text('Account created successfully. Please login.'),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  Navigator.pop(context);
                },
                child: const Text('OK'),
              ),
            ],
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              auth.errorMessage ?? 'Registration failed. Please try again.',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }
}
