// lib/models/patient_model.dart
class PatientModel {
  final int id;
  final String name;
  final String email;
  final String phone;
  final String bloodGroup;
  final String emergencyContact;
  final List<Map<String, dynamic>> bookings;
  final List<Map<String, dynamic>> medicalHistory;

  PatientModel({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.bloodGroup,
    required this.emergencyContact,
    required this.bookings,
    required this.medicalHistory,
  });

  factory PatientModel.fromJson(Map<String, dynamic> json) {
    return PatientModel(
      id: json['id'] ?? 0,
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      phone: json['phone'] ?? '',
      bloodGroup: json['blood_group'] ?? '',
      emergencyContact: json['emergency_contact'] ?? '',
      bookings: List<Map<String, dynamic>>.from(json['bookings'] ?? []),
      medicalHistory: List<Map<String, dynamic>>.from(json['medical_history'] ?? []),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'blood_group': bloodGroup,
      'emergency_contact': emergencyContact,
      'bookings': bookings,
      'medical_history': medicalHistory,
    };
  }
}