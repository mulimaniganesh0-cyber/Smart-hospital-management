// lib/models/chat_model.dart
class ChatMessage {
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final HospitalRecommendation? hospitalRecommendation;
  final List<HospitalRecommendation> hospitals;
  final bool requiresLocation;
  final bool showSos;
  final bool isEmergency;
  final List<CareGuideAction> actions;
  final bool isLoading;

  ChatMessage({
    required this.text,
    required this.isUser,
    DateTime? timestamp,
    this.hospitalRecommendation,
    this.hospitals = const [],
    this.requiresLocation = false,
    this.showSos = false,
    this.isEmergency = false,
    this.actions = const [],
    this.isLoading = false,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() {
    return {
      'text': text,
      'isUser': isUser,
      'timestamp': timestamp.toIso8601String(),
      'hospitalRecommendation': hospitalRecommendation?.toJson(),
      'hospitals': hospitals.map((item) => item.toJson()).toList(),
      'requiresLocation': requiresLocation,
      'showSos': showSos,
      'isEmergency': isEmergency,
      'actions': actions.map((item) => item.toJson()).toList(),
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
      hospitals: (json['hospitals'] as List? ?? const []).whereType<Map>().map((item) => HospitalRecommendation.fromJson(Map<String, dynamic>.from(item))).toList(),
      requiresLocation: json['requiresLocation'] == true,
      showSos: json['showSos'] == true,
      isEmergency: json['isEmergency'] == true,
      actions: (json['actions'] as List? ?? const []).whereType<Map>().map((item) => CareGuideAction.fromJson(Map<String, dynamic>.from(item))).toList(),
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
  final double latitude;
  final double longitude;
  final String? openingHours;
  final List<DoctorRecommendation> doctors;
  final double? googleRating;
  final int? googleReviewCount;
  final bool ratingVerified;

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
    this.latitude = 0,
    this.longitude = 0,
    this.openingHours,
    this.doctors = const [],
    this.googleRating,
    this.googleReviewCount,
    this.ratingVerified = false,
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
      'latitude': latitude,
      'longitude': longitude,
      'openingHours': openingHours,
      'doctors': doctors.map((item) => item.toJson()).toList(),
      'googleRating': googleRating,
      'googleReviewCount': googleReviewCount,
      'ratingVerified': ratingVerified,
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
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      openingHours: json['openingHours'],
      doctors: (json['doctors'] as List? ?? const []).whereType<Map>().map((item) => DoctorRecommendation.fromJson(Map<String, dynamic>.from(item))).toList(),
      googleRating: json['googleRating'] is num ? (json['googleRating'] as num).toDouble() : null,
      googleReviewCount: json['googleReviewCount'] is num ? (json['googleReviewCount'] as num).toInt() : null,
      ratingVerified: json['ratingVerified'] == true,
    );
  }
}

class DoctorRecommendation {
  final int id;
  final String name;
  final String specialization;
  final int experienceYears;
  final double? consultationFee;
  final int availableSlots;
  const DoctorRecommendation({required this.id, required this.name, required this.specialization, required this.experienceYears, this.consultationFee, required this.availableSlots});
  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'specialization': specialization, 'experience_years': experienceYears, 'consultation_fee': consultationFee, 'available_slots': availableSlots};
  factory DoctorRecommendation.fromJson(Map<String, dynamic> json) => DoctorRecommendation(
    id: json['id'] is num ? (json['id'] as num).toInt() : int.tryParse('${json['id']}') ?? 0,
    name: '${json['name'] ?? 'Doctor'}', specialization: '${json['specialization'] ?? 'General care'}',
    experienceYears: json['experience_years'] is num ? (json['experience_years'] as num).toInt() : int.tryParse('${json['experience_years']}') ?? 0,
    consultationFee: json['consultation_fee'] is num ? (json['consultation_fee'] as num).toDouble() : double.tryParse('${json['consultation_fee'] ?? ''}'),
    availableSlots: json['available_slots'] is num ? (json['available_slots'] as num).toInt() : int.tryParse('${json['available_slots']}') ?? 0,
  );
}

class CareGuideAction {
  final String type;
  final String label;
  const CareGuideAction({required this.type, required this.label});
  Map<String, dynamic> toJson() => {'type': type, 'label': label};
  factory CareGuideAction.fromJson(Map<String, dynamic> json) => CareGuideAction(type: '${json['type']}', label: '${json['label']}');
}
