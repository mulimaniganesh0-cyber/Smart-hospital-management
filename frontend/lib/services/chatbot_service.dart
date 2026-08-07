// lib/services/chatbot_service.dart
import '../models/chat_model.dart';
import 'api_service.dart';

class ChatbotService {
  final List<Map<String, String>> _history = [];
  static final Map<String, List<String>> _responses = {
    'hello|hi|hey': [
      'Hello! 👋 How can I help you today?',
      'Hi there! Welcome to Smart Hospital System. How may I assist you?',
      'Hey! Feel free to ask me anything about our services.'
    ],
    'how are you|how r u': [
      'I\'m doing great! Ready to help you with your healthcare needs. How can I assist you today?',
    ],
    'appointment|book appointment': [
      'To book an appointment:\n1. Go to "Hospitals" tab\n2. Select a hospital\n3. Click "Book Appointment"\n4. Choose date and time\n5. Confirm booking\n\nWould you like me to help you book one?',
    ],
    'ambulance|book ambulance|emergency ambulance': [
      'To book an ambulance:\n1. Go to Dashboard\n2. Click "Book Ambulance"\n3. Select ambulance type\n4. Choose pickup location\n5. Describe patient condition\n6. Confirm booking\n\n🚑 Emergency? Call 108 immediately!',
    ],
    'blood bank|blood|donate blood|request blood': [
      'Blood Bank services:\n✅ Find nearby blood banks\n✅ Check blood group availability\n✅ Request blood units\n✅ Donate blood\n\nGo to Dashboard and click "Blood Bank" to access these services.',
    ],
    'hospital|nearby hospital|find hospital': [
      'To find nearby hospitals:\n1. Go to "Hospitals" tab\n2. View all verified hospitals\n3. Filter by ICU, Emergency, or Specialty\n4. Click on any hospital for details\n5. Check bed availability and resources',
    ],
    'medicine|pharmacy|drugs': [
      'Our system focuses on hospital resources. For medicine information, please consult with hospital pharmacists or use our hospital directory to find pharmacy services.',
    ],
    'covid|corona|pandemic': [
      'For COVID-19 related queries, please check our hospital resources for ICU beds, ventilators, and oxygen availability. Contact your nearest hospital for specific COVID protocols.',
    ],
    'emergency|urgent|911|108': [
      '🚨 EMERGENCY ASSISTANCE 🚨\n\n• Call 108 for ambulance immediately\n• Our system will instantly notify nearby hospitals\n• Go to Dashboard → Click Ambulance Booking\n\nStay calm and provide clear location details.',
    ],
    'price|cost|fee|charge': [
      'Hospital charges vary by facility and service. Please contact hospitals directly for specific pricing information. Our system shows hospital resources but not pricing details.',
    ],
    'insurance|claim': [
      'Insurance coverage depends on your policy and hospital tie-ups. Contact your insurance provider or the hospital\'s insurance desk for claim assistance.',
    ],
    'feedback|suggestion|complaint': [
      'We value your feedback! Please share your suggestions through the Profile section. Our team will review and improve your experience.',
    ],
    'thanks|thank you|thx': [
      'You\'re welcome! 😊 Is there anything else I can help you with?',
      'Glad to help! Have a great day! 🏥',
    ],
    'help|support|guide': [
      'I can help you with:\n📅 Book Appointments\n🚑 Ambulance Booking\n🩸 Blood Bank Services\n🏥 Find Hospitals\n📊 View Dashboard Stats\n\nWhat would you like to know?',
    ],
    'visit|visiting hours|timing': [
      'Visiting hours vary by hospital. Generally:\n🕐 Morning: 11 AM - 1 PM\n🕔 Evening: 4 PM - 6 PM\n\nCheck with specific hospitals for exact timings.',
    ],
    'doctor|specialist|consultation': [
      'To consult a doctor:\n1. Find a hospital\n2. Check doctor specialties in hospital details\n3. Book appointment online\n4. Choose video consultation if available\n\nWould you like to browse hospitals now?',
    ],
    'report|lab|test': [
      'Lab test information is available through hospitals. Contact the hospital directly for:\n📋 Test availability\n💰 Pricing\n📊 Results timeline',
    ],
    'bed|icu|ventilator': [
      'Bed availability is shown in real-time on our system. Check hospital details for:\n✓ General Beds\n✓ ICU Beds\n✓ Ventilators with oxygen support\n✓ Emergency beds',
    ],
  };

  static String getResponse(String message) {
    String lowercaseMsg = message.toLowerCase().trim();

    // Check for specific keywords
    for (var entry in _responses.entries) {
      List<String> patterns = entry.key.split('|');
      for (String pattern in patterns) {
        if (lowercaseMsg.contains(pattern)) {
          List<String> responses = entry.value;
          return responses[
              DateTime.now().millisecondsSinceEpoch % responses.length];
        }
      }
    }

    // Default response for unknown queries
    return "I'm here to help! You can ask me about:\n\n📅 Appointments\n🚑 Ambulance booking\n🩸 Blood bank\n🏥 Hospitals\n🚨 Emergencies\n\nType 'help' to see all options.";
  }

  Future<ChatMessage> sendMessage({
    required String message,
    required double latitude,
    required double longitude,
    required String language,
  }) async {
    try {
      final result = await ApiService.queryChatbot({
        'message': message,
        'latitude': latitude,
        'longitude': longitude,
        'language': language,
        'history': _history,
      });
      final data = result['data'];
      if (result['code'] == 'ai_unavailable') {
        return ChatMessage(
          text: '${result['message']}',
          isUser: false,
        );
      }
      if (result['success'] == true && data is Map && data['response'] != null) {
        final hospitals = data['hospitals'];
        HospitalRecommendation? recommendation;
        if (hospitals is List && hospitals.isNotEmpty && hospitals.first is Map) {
          recommendation = _toRecommendation(
            Map<String, dynamic>.from(hospitals.first as Map),
          );
        }
        final reply = ChatMessage(
          text: '${data['response']}',
          isUser: false,
          hospitalRecommendation: recommendation,
        );
        _remember(message, reply.text);
        return reply;
      }
    } catch (_) {
      // Use the local guidance below when the server cannot be reached.
    }

    final normalized = message.toLowerCase();
    final needsHospital =
        RegExp(r'hospital|nearby|icu|bed|ventilator').hasMatch(normalized);

    if (needsHospital && latitude != 0 && longitude != 0) {
      try {
        final result = await ApiService.getNearbyHospitals(latitude, longitude);
        final hospitals = result['data'];
        if (result['success'] == true &&
            hospitals is List &&
            hospitals.isNotEmpty) {
          final recommendation = _toRecommendation(
            Map<String, dynamic>.from(hospitals.first as Map),
          );
          final reply = ChatMessage(
            text: 'I found ${recommendation.name}, about '
                '${recommendation.distance.toStringAsFixed(1)} km away. '
                'It currently shows ${recommendation.availableBeds} beds and '
                '${recommendation.availableIcu} ICU beds available.',
            isUser: false,
            hospitalRecommendation: recommendation,
          );
          _remember(message, reply.text);
          return reply;
        }
      } catch (_) {
        // A helpful local response is preferable to failing the conversation.
      }
    }

    final reply = ChatMessage(text: getResponse(message), isUser: false);
    _remember(message, reply.text);
    return reply;
  }

  void resetConversation() => _history.clear();

  void _remember(String userMessage, String assistantMessage) {
    _history
      ..add({'role': 'user', 'content': userMessage})
      ..add({'role': 'assistant', 'content': assistantMessage});
    if (_history.length > 12) {
      _history.removeRange(0, _history.length - 12);
    }
  }

  HospitalRecommendation _toRecommendation(Map<String, dynamic> hospital) {
    int asInt(dynamic value) =>
        value is num ? value.toInt() : int.tryParse('$value') ?? 0;
    double asDouble(dynamic value) =>
        value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

    return HospitalRecommendation(
      id: asInt(hospital['id']),
      name: '${hospital['name'] ?? 'Nearby hospital'}',
      address:
          '${hospital['address'] ?? hospital['city'] ?? 'Address unavailable'}',
      distance: asDouble(hospital['distance']),
      rating: asDouble(hospital['rating']),
      specialty: '${hospital['specialty'] ?? 'General care'}',
      availableBeds: asInt(
        hospital['available_beds'] ?? hospital['general_beds_available'],
      ),
      availableIcu: asInt(
        hospital['available_icu'] ?? hospital['icu_beds_available'],
      ),
      availableVentilators: asInt(
        hospital['available_ventilators'] ?? hospital['ventilators_available'],
      ),
      isVerified: hospital['is_verified'] == true,
      phone: '${hospital['phone'] ?? 'Not available'}',
    );
  }
}
