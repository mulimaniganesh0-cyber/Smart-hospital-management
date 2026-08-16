// lib/widgets/hospital_card.dart
import 'package:flutter/material.dart';
import '../models/hospital_model.dart';

class HospitalCard extends StatelessWidget {
  final Hospital hospital;
  final VoidCallback onTap;

  const HospitalCard({
    super.key,
    required this.hospital,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      hospital.name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (hospital.isVerified)
                    const Icon(Icons.verified, color: Colors.green, size: 16),
                  const SizedBox(width: 4),
                  if (hospital.ratingVerified && hospital.googleRating != null) ...[
                    Text(hospital.googleRating!.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w500)),
                    const Icon(Icons.star, color: Colors.amber, size: 16),
                    if (hospital.googleReviewCount != null) Text(' (${hospital.googleReviewCount})', style: const TextStyle(fontSize: 11)),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Text(
                hospital.address,
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.location_on, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    hospital.distance,
                    style: const TextStyle(fontSize: 12),
                  ),
                  const SizedBox(width: 12),
                  const Icon(Icons.king_bed, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    '${hospital.availableBeds} beds avail',
                    style: const TextStyle(fontSize: 12),
                  ),
                  if (hospital.emergencyServices) ...[
                    const SizedBox(width: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        '24/7 Emergency',
                        style: TextStyle(fontSize: 10, color: Colors.red),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 4,
                children: hospital.specialties
                    .take(3)
                    .map((specialty) => Chip(
                          label: Text(
                            specialty,
                            style: const TextStyle(fontSize: 10),
                          ),
                          padding: EdgeInsets.zero,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                        ))
                    .toList(),
              ),
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: hospital.availableBeds / hospital.totalBeds,
                backgroundColor: Colors.grey.shade200,
                valueColor: const AlwaysStoppedAnimation<Color>(Colors.green),
                minHeight: 4,
              ),
              const SizedBox(height: 4),
              Text(
                'Bed Occupancy: ${((hospital.totalBeds - hospital.availableBeds) / hospital.totalBeds * 100).toStringAsFixed(0)}%',
                style: const TextStyle(fontSize: 10, color: Colors.grey),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
