// lib/models/hospital_model.dart
class Hospital {
  final int id;
  final String name;
  final String address;
  final String city;
  final String phone;
  final String email;
  final double? googleRating;
  final int? googleReviewCount;
  final String? googlePlaceId;
  final String? googleMapsUrl;
  final bool ratingVerified;
  final String? ratingLastUpdated;
  final bool isVerified;
  
  // Resource fields
  final int totalBeds;
  final int availableBeds;
  final int icuBeds;
  final int availableIcu;
  final int ventilatorCount;
  final int availableVentilators;
  final int oxygenBedsTotal;
  final int oxygenBedsAvailable;
  final int bloodUnits;
  
  final List<String> specialties;
  final bool emergencyServices;
  final String distance;
  final String lastUpdated;

  Hospital({
    required this.id,
    required this.name,
    required this.address,
    required this.city,
    required this.phone,
    required this.email,
    this.googleRating,
    this.googleReviewCount,
    this.googlePlaceId,
    this.googleMapsUrl,
    this.ratingVerified = false,
    this.ratingLastUpdated,
    required this.isVerified,
    required this.totalBeds,
    required this.availableBeds,
    required this.icuBeds,
    required this.availableIcu,
    required this.ventilatorCount,
    required this.availableVentilators,
    required this.oxygenBedsTotal,
    required this.oxygenBedsAvailable,
    required this.bloodUnits,
    required this.specialties,
    required this.emergencyServices,
    required this.distance,
    required this.lastUpdated,
  });

  factory Hospital.fromJson(Map<String, dynamic> json) {
  // Helper function to safely parse values
  int parseInt(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }

  double parseDouble(dynamic value) {
    if (value == null) return 0.0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0.0;
    return 0.0;
  }

  List<String> parseList(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      return value.map((e) => e.toString()).toList();
    }
    if (value is String && value.isNotEmpty) {
      return [value];
    }
    return [];
  }

  return Hospital(
    id: parseInt(json['id']),
    name: json['name']?.toString() ?? 'Unknown Hospital',
    address: json['address']?.toString() ?? '',
    city: json['city']?.toString() ?? '',
    phone: json['phone']?.toString() ?? '',
    email: json['email']?.toString() ?? '',
    googleRating: json['rating_verified'] == true ? parseDouble(json['google_rating']) : null,
    googleReviewCount: json['rating_verified'] == true ? parseInt(json['google_review_count']) : null,
    googlePlaceId: json['rating_verified'] == true ? json['google_place_id']?.toString() : null,
    googleMapsUrl: json['rating_verified'] == true ? json['google_maps_url']?.toString() : null,
    ratingVerified: json['rating_verified'] == true,
    ratingLastUpdated: json['rating_verified'] == true ? json['rating_last_updated']?.toString() : null,
    isVerified: json['is_verified'] == true,
    totalBeds: parseInt(json['total_beds']),
    availableBeds: parseInt(json['available_beds']),
    icuBeds: parseInt(json['icu_beds']),
    availableIcu: parseInt(json['available_icu']),
    ventilatorCount: parseInt(json['ventilator_count']),
    availableVentilators: parseInt(json['available_ventilators']),
    oxygenBedsTotal: parseInt(json['oxygen_beds_total']),
    oxygenBedsAvailable: parseInt(json['oxygen_beds_available']),
    bloodUnits: parseInt(json['blood_units']),
    specialties: parseList(json['specialties']),
    emergencyServices: json['emergency_services'] == true,
    distance: json['distance']?.toString() ?? 'N/A',
    lastUpdated: json['last_updated']?.toString() ?? DateTime.now().toIso8601String(),
  );
}

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'address': address,
      'city': city,
      'phone': phone,
      'email': email,
      'google_rating': googleRating,
      'google_review_count': googleReviewCount,
      'google_place_id': googlePlaceId,
      'google_maps_url': googleMapsUrl,
      'rating_verified': ratingVerified,
      'rating_last_updated': ratingLastUpdated,
      'is_verified': isVerified,
      'total_beds': totalBeds,
      'available_beds': availableBeds,
      'icu_beds': icuBeds,
      'available_icu': availableIcu,
      'ventilator_count': ventilatorCount,
      'available_ventilators': availableVentilators,
      'oxygen_beds_total': oxygenBedsTotal,
      'oxygen_beds_available': oxygenBedsAvailable,
      'blood_units': bloodUnits,
      'specialties': specialties,
      'emergency_services': emergencyServices,
      'distance': distance,
      'last_updated': lastUpdated,
    };
  }
}
