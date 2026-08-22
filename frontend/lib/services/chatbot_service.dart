import '../models/chat_model.dart';
import 'api_service.dart';

/// Intent detection and hospital facts stay on the backend, so the app never
/// substitutes a hardcoded hospital answer when the service is unavailable.
class ChatbotService {
  final List<Map<String, String>> _history = [];
  Map<String, dynamic> _context = {};

  Future<ChatMessage> sendMessage({
    required String message,
    required double? latitude,
    required double? longitude,
    required String language,
  }) async {
    // Capture the current text at send time, so every request carries the
    // latest turn rather than a stale controller or history value.
    final currentMessage = message.trim();
    if (currentMessage.isEmpty) throw ArgumentError.value(message, 'message');
    final result = await ApiService.queryChatbot({
      'message': currentMessage,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      'language': language,
      'conversationHistory': _history,
      'context': _context,
    });
    final data = result['data'];
    if (result['success'] != true || data is! Map || data['response'] == null) {
      if (result['error'] == 'AI_SERVICE_UNAVAILABLE') {
        throw Exception('The AI assistant is temporarily unavailable. Please try again.');
      }
      throw Exception(result['message'] ?? 'CareGuide request failed');
    }
    // A general LLM response must never render an incidental hospital payload.
    // Cards are reserved for the single structured database-result path.
    final responseType = '${data['type'] ?? 'llm'}';
    final canRenderHospitalCards = responseType == 'hospital_results' ||
        responseType == 'doctor_results' ||
        responseType == 'symptom_hospital_recommendation';
    final hospitals = (canRenderHospitalCards
            ? data['hospitals'] as List? ?? const []
            : const [])
        .whereType<Map>()
        .map((item) => _toRecommendation(Map<String, dynamic>.from(item)))
        .toList();
    final reply = ChatMessage(
      text: '${data['response']}', isUser: false, hospitals: hospitals,
      hospitalRecommendation: hospitals.isEmpty ? null : hospitals.first,
      requiresLocation: data['requiresLocation'] == true,
      showSos: data['showSos'] == true, isEmergency: data['severity'] == 'emergency',
      actions: (data['actions'] as List? ?? const []).whereType<Map>().map((item) => CareGuideAction.fromJson(Map<String, dynamic>.from(item))).toList(),
    );
    _context = data['context'] is Map ? Map<String, dynamic>.from(data['context']) : {};
    _remember(currentMessage, reply.text);
    return reply;
  }

  void resetConversation() { _history.clear(); _context = {}; }

  void _remember(String userMessage, String assistantMessage) {
    _history..add({'role': 'user', 'content': userMessage})..add({'role': 'assistant', 'content': assistantMessage});
    if (_history.length > 12) _history.removeRange(0, _history.length - 12);
  }

  HospitalRecommendation _toRecommendation(Map<String, dynamic> hospital) {
    int asInt(dynamic value) => value is num ? value.toInt() : int.tryParse('$value') ?? 0;
    double asDouble(dynamic value) => value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
    return HospitalRecommendation(
      id: asInt(hospital['id']), name: '${hospital['display_name'] ?? hospital['name'] ?? 'Hospital'}',
      address: '${hospital['display_address'] ?? hospital['address'] ?? hospital['city'] ?? 'Address unavailable'}',
      latitude: asDouble(hospital['latitude']), longitude: asDouble(hospital['longitude']),
      distance: asDouble(hospital['distance']), rating: asDouble(hospital['rating']),
      specialty: (hospital['specialties'] as List?)?.join(', ') ?? 'General care',
      availableBeds: asInt(hospital['available_beds']), availableIcu: asInt(hospital['available_icu']),
      availableVentilators: asInt(hospital['available_ventilators']), isVerified: true,
      phone: '${hospital['phone'] ?? ''}',
      doctors: (hospital['doctors'] as List? ?? const []).whereType<Map>().map((item) => DoctorRecommendation.fromJson(Map<String, dynamic>.from(item))).toList(),
      googleRating: hospital['rating_verified'] == true ? asDouble(hospital['google_rating']) : null,
      googleReviewCount: hospital['rating_verified'] == true ? asInt(hospital['google_review_count']) : null,
      ratingVerified: hospital['rating_verified'] == true,
    );
  }
}
