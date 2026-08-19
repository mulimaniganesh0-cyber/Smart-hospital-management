import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/chat_model.dart';
import '../../services/chatbot_service.dart';
import '../../services/location_service.dart';
import 'patient_emergency_request.dart';
import 'patient_nearby_hospitals.dart';
import 'patient_bookings.dart';
import 'health_record_screen.dart';

class ChatbotScreen extends StatefulWidget {
  const ChatbotScreen({super.key});

  @override
  State<ChatbotScreen> createState() => _ChatbotScreenState();
}

class _ChatbotScreenState extends State<ChatbotScreen> {
  static const _brand = Color(0xFF0A4D68);
  static const _accent = Color(0xFF088395);
  static const _suggestions = [
    'Find nearby hospitals',
    'How do I book an appointment?',
    'I need an ambulance',
    'Check blood availability',
  ];

  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _assistant = ChatbotService();
  final List<ChatMessage> _messages = [];

  Position? _position;
  bool _isLoading = false;
  String _language = 'English';

  @override
  void initState() {
    super.initState();
    _messages.add(
      ChatMessage(
        text: 'Hello! I am CareGuide, your hospital resource assistant. '
            'I can help you find nearby care, understand services, and '
            'navigate urgent requests.',
        isUser: false,
      ),
    );
    // Ask only when the user requests nearby care or taps the location banner.
    // This keeps location permission purposeful and avoids assuming a location.
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadLocation() async {
    final position = await LocationService.getCurrentLocation();
    if (!context.mounted) return;
    setState(() => _position = position);
  }

  Future<void> _send([String? suggestion]) async {
    final text = (suggestion ?? _controller.text).trim();
    if (text.isEmpty || _isLoading) return;

    setState(() {
      _messages.add(ChatMessage(text: text, isUser: true));
      _controller.clear();
      _isLoading = true;
    });
    _scrollToBottom();

    try {
      // CareGuide must not reuse a previous patient's or an old session's
      // location for nearby/emergency requests.
      Position? requestPosition = _position;
      final needsLiveLocation = RegExp(
        r'nearby|near me|closest|nearest|emergency|ambulance|sos',
        caseSensitive: false,
      ).hasMatch(text);
      if (needsLiveLocation) {
        try {
          requestPosition = await LocationService.getFreshPatientLocation();
          if (mounted) setState(() => _position = requestPosition);
        } on PatientLocationException {
          requestPosition = null;
          if (mounted) setState(() => _position = null);
        }
      }
      final response = await _assistant.sendMessage(
        message: text,
        latitude: requestPosition?.latitude,
        longitude: requestPosition?.longitude,
        language: LocationService.getLanguageCode(_language),
      );
      if (!context.mounted) return;
      setState(() {
        _messages.add(response);
        _isLoading = false;
      });
    } catch (_) {
      if (!context.mounted) return;
      setState(() {
        _messages.add(
          ChatMessage(
            text: 'I could not complete that request. Please try again.',
            isUser: false,
          ),
        );
        _isLoading = false;
      });
    }
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _startNewConversation() {
    _assistant.resetConversation();
    setState(() {
      _messages
        ..clear()
        ..add(
          ChatMessage(
            text: 'New conversation started. How can I help?',
            isUser: false,
          ),
        );
    });
  }

  @override
  Widget build(BuildContext context) {
    final hasLocation = _position != null;
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FA),
      appBar: AppBar(
        elevation: 0,
        titleSpacing: 0,
        title: const Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: Colors.white24,
              child:
                  Icon(Icons.health_and_safety_outlined, color: Colors.white),
            ),
            SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('CareGuide',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                Text('Hospital resource assistant',
                    style: TextStyle(fontSize: 11)),
              ],
            ),
          ],
        ),
        flexibleSpace: const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [_brand, _accent]),
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'New conversation',
            onPressed: _startNewConversation,
            icon: const Icon(Icons.refresh_rounded),
          ),
          PopupMenuButton<String>(
            tooltip: 'Language',
            icon: const Icon(Icons.language_rounded),
            onSelected: (value) => setState(() => _language = value),
            itemBuilder: (context) => LocationService.getSupportedLanguages()
                .map(
                  (language) => CheckedPopupMenuItem(
                    value: language,
                    checked: language == _language,
                    child: Text(language),
                  ),
                )
                .toList(),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            _LocationBanner(hasLocation: hasLocation, onEnable: _loadLocation),
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 10),
                itemCount: _messages.length + (_isLoading ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index == _messages.length) {
                    return const _TypingIndicator();
                  }
                  return _MessageBubble(
                    message: _messages[index],
                    onRecommendationTap:
                        _messages[index].hospitalRecommendation == null
                            ? null
                            : () => _showRecommendation(_messages[index].hospitalRecommendation!),
                    onHospitalTap: (hospital) => _showRecommendation(hospital),
                    onLocation: _messages[index].requiresLocation
                        ? () => _retryWithLocation(_messages[index])
                        : null,
                    onSos: _messages[index].showSos ? _openSos : null,
                    onAction: _handleAction,
                  );
                },
              ),
            ),
            if (_messages.length <= 2 && !_isLoading)
              _SuggestionBar(onSelect: _send),
            _Composer(
              controller: _controller,
              enabled: !_isLoading,
              onSend: _send,
            ),
          ],
        ),
      ),
    );
  }

  void _showRecommendation(HospitalRecommendation hospital) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => _HospitalSheet(
          hospital: hospital,
          onDirections: () => _openDirections(hospital),
          onCall: () => _callHospital(hospital),
          onBook: _openDirectory),
    );
  }

  Future<void> _retryWithLocation(ChatMessage message) async {
    await _loadLocation();
    if (!mounted) return;
    if (_position == null) {
      setState(() => _messages.add(ChatMessage(
            text:
                'I can’t access your current location right now. You can enable location permission, search by city or area, or open the hospital directory.',
            isUser: false,
          )));
      _scrollToBottom();
      return;
    }
    _send(_messages.length > 1
        ? _messages[_messages.length - 2].text
        : 'Find a hospital near me');
  }

  Future<void> _openDirections(HospitalRecommendation hospital) async {
    if (hospital.latitude == 0 && hospital.longitude == 0) return;
    try {
      final position = await LocationService.getFreshPatientLocation();
      if (!mounted) return;
      setState(() => _position = position);
      debugPrint('PATIENT LIVE LOCATION latitude: ${position.latitude}, longitude: ${position.longitude}, accuracy: ${position.accuracy}, timestamp: ${position.timestamp}');
      debugPrint('HOSPITAL DESTINATION hospital: ${hospital.name}, latitude: ${hospital.latitude}, longitude: ${hospital.longitude}');
      final uri = Uri.https('www.google.com', '/maps/dir/', {
        'api': '1',
        'origin': '${position.latitude},${position.longitude}',
        'destination': '${hospital.latitude},${hospital.longitude}',
        'travelmode': 'driving',
      });
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Unable to open Google Maps.')));
      }
    } on PatientLocationException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _callHospital(HospitalRecommendation hospital) async {
    if (hospital.phone.isEmpty) return;
    await launchUrl(Uri(scheme: 'tel', path: hospital.phone));
  }

  void _openDirectory() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const PatientNearbyHospitals()));
  void _openSos() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const PatientEmergencyRequest()));

  void _handleAction(CareGuideAction action) {
    switch (action.type) {
      case 'EMERGENCY_SOS':
        _openSos();
      case 'BOOK_APPOINTMENT':
      case 'VIEW_HOSPITALS':
        _openDirectory();
      case 'VIEW_APPOINTMENTS':
        Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const PatientBookings()));
      case 'VIEW_HEALTH_RECORD':
        Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const HealthRecordScreen()));
    }
  }
}

class _LocationBanner extends StatelessWidget {
  const _LocationBanner({required this.hasLocation, required this.onEnable});

  final bool hasLocation;
  final VoidCallback onEnable;

  @override
  Widget build(BuildContext context) {
    final color =
        hasLocation ? const Color(0xFF18794E) : const Color(0xFF9A6700);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
              hasLocation
                  ? Icons.location_on_outlined
                  : Icons.location_off_outlined,
              color: color,
              size: 19),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              hasLocation
                  ? 'Location is active for nearby recommendations'
                  : 'Enable location for nearby recommendations',
              style: TextStyle(
                  fontSize: 12, color: color, fontWeight: FontWeight.w600),
            ),
          ),
          if (!hasLocation)
            TextButton(onPressed: onEnable, child: const Text('Enable')),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble(
      {required this.message,
      this.onRecommendationTap,
      required this.onHospitalTap,
      this.onLocation,
      this.onSos,
      required this.onAction});

  final ChatMessage message;
  final VoidCallback? onRecommendationTap;
  final ValueChanged<HospitalRecommendation> onHospitalTap;
  final VoidCallback? onLocation;
  final VoidCallback? onSos;
  final ValueChanged<CareGuideAction> onAction;

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    final bubbleColor = isUser ? const Color(0xFF0A4D68) : Colors.white;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            const CircleAvatar(
              radius: 17,
              backgroundColor: Color(0xFFD9F0F3),
              child: Icon(Icons.health_and_safety_outlined,
                  color: Color(0xFF0A4D68), size: 19),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: bubbleColor,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(isUser ? 18 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 18),
                ),
                boxShadow: isUser
                    ? const []
                    : [
                        BoxShadow(
                            color: Colors.black.withValues(alpha: .04),
                            blurRadius: 12)
                      ],
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 11, 14, 9),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(message.text,
                        style: TextStyle(
                            color:
                                isUser ? Colors.white : const Color(0xFF1F2937),
                            height: 1.4)),
                    if (onRecommendationTap != null && message.hospitals.length == 1) ...[
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: onRecommendationTap,
                        icon:
                            const Icon(Icons.local_hospital_outlined, size: 17),
                        label: const Text('View hospital details'),
                      ),
                    ],
                    if (onLocation != null) ...[
                      const SizedBox(height: 8),
                      FilledButton.icon(
                          onPressed: onLocation,
                          icon: const Icon(Icons.my_location),
                          label: const Text('Use my location')),
                    ],
                    if (onSos != null) ...[
                      const SizedBox(height: 8),
                      FilledButton.icon(
                          onPressed: onSos,
                          style: FilledButton.styleFrom(
                              backgroundColor: Colors.red),
                          icon: const Icon(Icons.sos),
                          label: const Text('Emergency SOS')),
                    ],
                    if (message.hospitals.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      ...message.hospitals.map((hospital) => _ChatHospitalCard(
                        hospital: hospital,
                        onDetails: () => onHospitalTap(hospital),
                        onBook: () => onAction(const CareGuideAction(type: 'BOOK_APPOINTMENT', label: 'Book Appointment')),
                      )),
                    ],
                    if (message.actions.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: message.actions
                            .where((action) => action.type != 'EMERGENCY_SOS')
                            .map((action) => OutlinedButton(
                                  onPressed: () => onAction(action),
                                  child: Text(action.label),
                                ))
                            .toList(),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      DateFormat('h:mm a').format(message.timestamp),
                      style: TextStyle(
                          fontSize: 10,
                          color: isUser ? Colors.white70 : Colors.blueGrey),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatHospitalCard extends StatelessWidget {
  const _ChatHospitalCard({required this.hospital, required this.onDetails, required this.onBook});
  final HospitalRecommendation hospital;
  final VoidCallback onDetails;
  final VoidCallback onBook;
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(top: 8),
    child: Padding(padding: const EdgeInsets.all(10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(hospital.name, style: const TextStyle(fontWeight: FontWeight.w700)),
      Text(hospital.distance > 0 ? '${hospital.distance.toStringAsFixed(1)} km away' : hospital.address, style: const TextStyle(fontSize: 12, color: Colors.blueGrey)),
      if (hospital.ratingVerified && hospital.googleRating != null)
        Text('Google ${hospital.googleRating!.toStringAsFixed(1)}${hospital.googleReviewCount == null ? '' : ' (${hospital.googleReviewCount} reviews)'}', style: const TextStyle(fontSize: 12)),
      ...hospital.doctors.map((doctor) => Padding(
        padding: const EdgeInsets.only(top: 7),
        child: Text('${doctor.name}\n${doctor.specialization} · ${doctor.experienceYears} years${doctor.consultationFee == null ? '' : ' · ₹${doctor.consultationFee!.toStringAsFixed(0)}'}\nAvailable appointments: ${doctor.availableSlots}', style: const TextStyle(fontSize: 12)),
      )),
      const SizedBox(height: 6),
      Wrap(spacing: 8, children: [OutlinedButton(onPressed: onDetails, child: const Text('View Hospital')), FilledButton(onPressed: onBook, child: const Text('Book Appointment'))]),
    ])),
  );
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.only(left: 2, bottom: 16),
        child: Row(
          children: [
            CircleAvatar(
                radius: 17,
                child: Icon(Icons.health_and_safety_outlined, size: 18)),
            SizedBox(width: 8),
            Text('CareGuide is thinkingâ€¦'),
          ],
        ),
      );
}

class _SuggestionBar extends StatelessWidget {
  const _SuggestionBar({required this.onSelect});
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 43,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          scrollDirection: Axis.horizontal,
          itemCount: _ChatbotScreenState._suggestions.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, index) => ActionChip(
            label: Text(_ChatbotScreenState._suggestions[index]),
            onPressed: () => onSelect(_ChatbotScreenState._suggestions[index]),
          ),
        ),
      );
}

class _Composer extends StatelessWidget {
  const _Composer(
      {required this.controller, required this.enabled, required this.onSend});
  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
        decoration: const BoxDecoration(color: Colors.white),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                enabled: enabled,
                textCapitalization: TextCapitalization.sentences,
                minLines: 1,
                maxLines: 4,
                onSubmitted: (_) => onSend(),
                decoration: InputDecoration(
                  hintText: 'Ask about care, appointments, or resources',
                  filled: true,
                  fillColor: const Color(0xFFF1F5F7),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide.none),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: enabled ? onSend : null,
              icon: const Icon(Icons.arrow_upward_rounded),
              style: IconButton.styleFrom(
                  backgroundColor: const Color(0xFF0A4D68)),
            ),
          ],
        ),
      );
}

class _HospitalSheet extends StatelessWidget {
  const _HospitalSheet(
      {required this.hospital,
      required this.onDirections,
      required this.onCall,
      required this.onBook});
  final HospitalRecommendation hospital;
  final VoidCallback onDirections;
  final VoidCallback onCall;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const CircleAvatar(
                  radius: 25,
                  backgroundColor: Color(0xFFD9F0F3),
                  child: Icon(Icons.local_hospital_outlined,
                      color: Color(0xFF0A4D68))),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(hospital.name,
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    Text(hospital.address,
                        style: const TextStyle(color: Colors.blueGrey)),
                  ])),
            ]),
            const SizedBox(height: 20),
            Row(children: [
              _ResourceStat(
                  label: 'Beds', value: hospital.availableBeds.toString()),
              _ResourceStat(
                  label: 'ICU', value: hospital.availableIcu.toString()),
              _ResourceStat(
                  label: 'Ventilators',
                  value: hospital.availableVentilators.toString()),
            ]),
            const SizedBox(height: 16),
            Text(
                '${hospital.distance.toStringAsFixed(1)} km away Â· ${hospital.phone}',
                style: const TextStyle(color: Colors.blueGrey)),
            const SizedBox(height: 16),
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton.icon(
                  onPressed: onDirections,
                  icon: const Icon(Icons.directions),
                  label: const Text('Directions')),
              OutlinedButton.icon(
                  onPressed: onCall,
                  icon: const Icon(Icons.call),
                  label: const Text('Call hospital')),
              FilledButton.icon(
                  onPressed: onBook,
                  icon: const Icon(Icons.calendar_month),
                  label: const Text('Book appointment')),
            ]),
          ],
        ),
      );
}

class _ResourceStat extends StatelessWidget {
  const _ResourceStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          margin: const EdgeInsets.only(right: 8),
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
              color: const Color(0xFFF1F5F7),
              borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Text(value,
                style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0A4D68))),
            Text(label,
                style: const TextStyle(fontSize: 11, color: Colors.blueGrey)),
          ]),
        ),
      );
}
