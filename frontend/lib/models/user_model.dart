// lib/models/user_model.dart
class UserModel {
  final String id;
  final String name;
  final String email;
  final String phone;
  final String userType;
  final Map<String, dynamic>? additionalData;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.userType,
    this.additionalData,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      // Convert id to string if it's an integer
      id: json['id'].toString(),
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      phone: json['phone'] ?? '',
      userType: json['user_type'] ?? json['userType'] ?? '',
      additionalData: json['additional_data'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'user_type': userType,
      'additional_data': additionalData,
    };
  }
}