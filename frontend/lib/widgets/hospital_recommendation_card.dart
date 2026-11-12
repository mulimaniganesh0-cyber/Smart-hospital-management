// lib/widgets/hospital_recommendation_card.dart
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';

class HospitalRecommendationCard extends StatelessWidget {
  final Map<String, dynamic> hospital;
  final bool isEmergency;
  final VoidCallback onSelect;

  const HospitalRecommendationCard({
    super.key,
    required this.hospital,
    required this.isEmergency,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final name = hospital['name'] ?? 'Unknown Hospital';
    final address = hospital['address'] ?? '';
    final distance = (hospital['distance_km'] ?? 0).toStringAsFixed(1);
    final rating = (hospital['rating'] ?? 0).toStringAsFixed(1);
    final isVerified = hospital['is_verified'] ?? false;
    final resources = hospital['available_resources'] ?? {};
    final availableBeds = resources['general_beds'] ?? 0;
    final availableIcu = resources['icu_beds'] ?? 0;
    final hasEmergency = resources['emergency_services'] ?? false;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: isEmergency ? 8 : 4,
      child: InkWell(
        onTap: onSelect,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: isEmergency
                ? Border.all(color: AppColors.error, width: 2)
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isEmergency
                          ? AppColors.error.withValues(alpha: 0.1)
                          : const Color(0xFF142D4E).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      isEmergency ? Icons.emergency : Icons.local_hospital,
                      color: isEmergency
                          ? AppColors.error
                          : const Color(0xFF142D4E),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (isVerified)
                              const Icon(Icons.verified,
                                  color: AppColors.success, size: 16),
                          ],
                        ),
                        Text(
                          'ðŸ“ $address',
                          style:
                              TextStyle(fontSize: 12, color: Colors.grey[600]),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _buildInfoChip(
                    icon: Icons.location_on,
                    label: '$distance km',
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 8),
                  _buildInfoChip(
                    icon: Icons.star,
                    label: rating,
                    color: AppColors.warning,
                  ),
                  const SizedBox(width: 8),
                  _buildInfoChip(
                    icon: Icons.king_bed,
                    label: '$availableBeds beds',
                    color: AppColors.success,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (availableIcu > 0)
                    _buildInfoChip(
                      icon: Icons.local_hospital,
                      label: '$availableIcu ICU',
                      color: AppColors.secondary,
                    ),
                  if (availableIcu > 0) const SizedBox(width: 8),
                  if (hasEmergency)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'ðŸš¨ Emergency',
                        style: TextStyle(fontSize: 10, color: AppColors.error),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: onSelect,
                  style: ElevatedButton.styleFrom(
                    backgroundColor:
                        isEmergency ? AppColors.error : const Color(0xFF142D4E),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  child: Text(isEmergency
                      ? 'ðŸš‘ Request Emergency Help'
                      : 'ðŸ“‹ View Details'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoChip({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 11, color: color),
          ),
        ],
      ),
    );
  }
}
