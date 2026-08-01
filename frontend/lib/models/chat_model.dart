// lib/models/chat_model.dart
class ChatMessage {
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final HospitalRecommendation? hospitalRecommendation;
  final bool isLoading;

  ChatMessage({
    required this.text,
    required this.isUser,
    DateTime? timestamp,
    this.hospitalRecommendation,
    this.isLoading = false,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() {
    return {
      'text': text,
      'isUser': isUser,
      'timestamp': timestamp.toIso8601String(),
      'hospitalRecommendation': hospitalRecommendation?.toJson(),
      'isLoading': isLoading,
    };
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      text: json['text'],
      isUser: json['isUser'],
      timestamp: DateTime.parse(json['timestamp']),
      hospitalRecommendation: json['hospitalRecommendation'] != null
          ? HospitalRecommendation.fromJson(json['hospitalRecommendation'])
          : null,
      isLoading: json['isLoading'] ?? false,
    );
  }
}

class HospitalRecommendation {
  final int id;
  final String name;
  final String address;
  final double distance;
  final double rating;
  final String specialty;
  final int availableBeds;
  final int availableIcu;
  final int availableVentilators;
  final bool isVerified;
  final String phone;
  final String? openingHours;

  HospitalRecommendation({
    required this.id,
    required this.name,
    required this.address,
    required this.distance,
    required this.rating,
    required this.specialty,
    required this.availableBeds,
    required this.availableIcu,
    required this.availableVentilators,
    required this.isVerified,
    required this.phone,
    this.openingHours,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'address': address,
      'distance': distance,
      'rating': rating,
      'specialty': specialty,
      'availableBeds': availableBeds,
      'availableIcu': availableIcu,
      'availableVentilators': availableVentilators,
      'isVerified': isVerified,
      'phone': phone,
      'openingHours': openingHours,
    };
  }

  factory HospitalRecommendation.fromJson(Map<String, dynamic> json) {
    return HospitalRecommendation(
      id: json['id'],
      name: json['name'],
      address: json['address'],
      distance: json['distance'],
      rating: json['rating'],
      specialty: json['specialty'],
      availableBeds: json['availableBeds'],
      availableIcu: json['availableIcu'],
      availableVentilators: json['availableVentilators'],
      isVerified: json['isVerified'],
      phone: json['phone'],
      openingHours: json['openingHours'],
    );
  }
}