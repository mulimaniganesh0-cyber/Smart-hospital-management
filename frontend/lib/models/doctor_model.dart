/// Doctor data is supplied only by the backend directory API. This model does
/// not contain a local doctor catalogue.
class Doctor {
  final int id;
  final int hospitalId;
  final String name;
  final String? qualification;
  final String? specialization;
  final int? experienceYears;
  final String? experienceDisplay;
  final String? description;
  final bool isActive;

  const Doctor({required this.id, required this.hospitalId, required this.name, this.qualification, this.specialization, this.experienceYears, this.experienceDisplay, this.description, required this.isActive});

  factory Doctor.fromJson(Map<String, dynamic> json) => Doctor(
        id: (json['id'] as num?)?.toInt() ?? 0,
        hospitalId: (json['hospital_id'] as num?)?.toInt() ?? 0,
        name: json['name']?.toString() ?? 'Doctor',
        qualification: json['qualification']?.toString(),
        specialization: json['specialization']?.toString(),
        experienceYears: (json['experience_years'] as num?)?.toInt(),
        experienceDisplay: json['experience_display']?.toString(),
        description: json['bio']?.toString() ?? json['description']?.toString(),
        isActive: json['is_active'] != false && json['availability_status'] != false,
      );
}
