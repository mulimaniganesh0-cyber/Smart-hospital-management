import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/chat_model.dart';
import '../../models/hospital_model.dart';
import '../../services/chatbot_service.dart';
import '../../services/location_service.dart';
import '../../services/careguide_localizations.dart';
import 'patient_emergency_request.dart';
import 'ambulance_booking.dart';
import 'patient_nearby_hospitals.dart';
import 'patient_bookings.dart';
import 'health_record_screen.dart';
import 'patient_resource_request.dart';

class ChatbotScreen extends StatefulWidget {
  const ChatbotScreen({super.key});

  @override
  State<ChatbotScreen> createState() => _ChatbotScreenState();
}

class _ChatbotScreenState extends State<ChatbotScreen> {
  static const _brand = Color(0xFF0A4D68);
  static const _accent = Color(0xFF088395);

  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _assistant = ChatbotService();
  final List<ChatMessage> _messages = [];

  Position? _position;
  _LocationState _locationState = _LocationState.idle;
  String? _locationError;
  bool _isLoading = false;
  String _language = 'English';
  CareGuideStrings get _strings => CareGuideStrings(_language);
  List<String> get _suggestions => [
        _strings.t('nearby'),
        _strings.t('bookHelp'),
        _strings.t('ambulance'),
        _strings.t('blood')
      ];

  @override
  void initState() {
    super.initState();
    _messages.add(
      ChatMessage(
        text: _strings.t('welcome'),
        isUser: false,
      ),
    );
    _initializeLocationState();
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<Position?> _loadLocation() async {
    setState(() {
      _locationState = _LocationState.loading;
      _locationError = null;
    });
    debugPrint('[Location] Requesting best available location...');
    try {
      final position = await LocationService.getBestAvailableLocation();
      debugPrint(
          '[Location] Location accepted; latitude=${position.latitude}; longitude=${position.longitude}; accuracy=${position.accuracy}m');
      if (!mounted) return position;
      setState(() {
        _position = position;
        _locationState = _LocationState.active;
      });
      return position;
    } on PatientLocationException catch (error) {
      debugPrint('[Location] Unable to obtain location: ${error.message}');
      if (!mounted) return null;
      final message = error.message.toLowerCase();
      setState(() {
        _position = null;
        _locationError = error.message;
        _locationState = message.contains('permanently')
            ? _LocationState.permanentlyDenied
            : message.contains('services') || message.contains('gps')
                ? _LocationState.serviceDisabled
                : message.contains('permission')
                    ? _LocationState.permissionDenied
                    : _LocationState.error;
      });
      return null;
    }
  }

  Future<void> _initializeLocationState() async {
    debugPrint('[Location] Checking CareGuide location state...');
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    final permission = await Geolocator.checkPermission();
    if (!mounted) return;
    if (!serviceEnabled) {
      setState(() => _locationState = _LocationState.serviceDisabled);
    } else if (permission == LocationPermission.deniedForever) {
      setState(() => _locationState = _LocationState.permanentlyDenied);
    } else if (permission == LocationPermission.denied) {
      setState(() => _locationState = _LocationState.permissionDenied);
    } else {
      // Permission was already granted, so this does not show a new prompt.
      await _loadLocation();
    }
  }

  Future<void> _handleLocationAction() async {
    if (_locationState == _LocationState.permanentlyDenied) {
      await Geolocator.openAppSettings();
      return;
    }
    if (_locationState == _LocationState.serviceDisabled) {
      await Geolocator.openLocationSettings();
      return;
    }
    await _loadLocation();
  }

  Future<void> _send(
      [String? suggestion, int? patientAge, bool echoUser = true]) async {
    final text = (suggestion ?? _controller.text).trim();
    if (text.isEmpty || _isLoading) return;

    setState(() {
      if (echoUser) _messages.add(ChatMessage(text: text, isUser: true));
      _controller.clear();
      _isLoading = true;
    });
    _scrollToBottom();

    try {
      debugPrint('[CHATBOT] Send started; messageLength=${text.length}');
      // Location is only requested for local intents. The central service
      // reuses a valid location from this CareGuide session when needed.
      Position? requestPosition = _position;
      final needsLiveLocation = RegExp(
        r'near\s*(me|by|my|here)|nearby|closest|nearest|around me|ನನ್ನ\s*ಹತ್ತಿರ|ಹತ್ತಿರದ\s*ಆಸ್ಪತ್ರ|ಸುತ್ತಮುತ್ತ\s*ಆಸ್ಪತ್ರ|ಆಸ್ಪತ್ರೆ\s*ಬೇಕ|मेरे\s*(पास|नजदीक|आसपास)|नजदीकी\s*अस्पताल|पास\s*के\s*अस्पताल|emergency|ambulance|sos',
        caseSensitive: false,
      ).hasMatch(text);
      if (needsLiveLocation) {
        requestPosition = await _loadLocation();
      }
      final response = await _assistant.sendMessage(
        message: text,
        latitude: requestPosition?.latitude,
        longitude: requestPosition?.longitude,
        language: LocationService.getLanguageCode(_language),
        patientAge: patientAge,
      );
      if (!context.mounted) return;
      setState(() {
        _messages.add(response);
        _isLoading = false;
      });
      if (response.showAgeSelector) {
        final age = await _showAgeSelector();
        if (age != null && mounted) await _send(text, age, false);
      }
    } catch (error) {
      if (!context.mounted) return;
      if (error.toString().contains('STALE_CHATBOT_RESPONSE')) return;
      debugPrint('[CHATBOT ERROR] $error');
      final errorText = error.toString();
      final text = errorText.contains('AI assistant is temporarily unavailable')
          ? _strings.t('unavailable')
          : errorText.contains('Not authorized') ||
                  errorText.contains('Unauthorized')
              ? 'Your session has expired. Please sign in again.'
              : _strings.t('failed');
      setState(() {
        _messages.add(
          ChatMessage(
            text: text,
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
            text: _strings.t('newStarted'),
            isUser: false,
          ),
        );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FA),
      appBar: AppBar(
        elevation: 0,
        titleSpacing: 0,
        title: Row(
          children: [
            const CircleAvatar(
              radius: 18,
              backgroundColor: Colors.white24,
              child:
                  Icon(Icons.health_and_safety_outlined, color: Colors.white),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('CareGuide',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                Text(_strings.t('assistant'),
                    style: const TextStyle(fontSize: 11)),
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
            tooltip: _strings.t('newChat'),
            onPressed: _startNewConversation,
            icon: const Icon(Icons.refresh_rounded),
          ),
          PopupMenuButton<String>(
            tooltip: _strings.t('language'),
            icon: const Icon(Icons.language_rounded),
            onSelected: (value) => setState(() {
              _language = value;
              _assistant.resetConversation();
            }),
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
            _LocationBanner(
                state: _locationState,
                error: _locationError,
                onAction: _handleLocationAction,
                onRefresh: _loadLocation,
                strings: _strings),
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 10),
                itemCount: _messages.length + (_isLoading ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index == _messages.length) {
                    return _TypingIndicator(strings: _strings);
                  }
                  return _MessageBubble(
                    message: _messages[index],
                    onRecommendationTap:
                        _messages[index].hospitalRecommendation == null
                            ? null
                            : () => _showRecommendation(
                                _messages[index].hospitalRecommendation!),
                    onHospitalTap: (hospital) => _showRecommendation(hospital),
                    onLocation: _messages[index].requiresLocation
                        ? () => _retryWithLocation(_messages[index])
                        : null,
                    onSos: _messages[index].showSos ? _openSos : null,
                    onAction: _handleAction,
                    onBookDoctor: _bookRecommendedDoctor,
                    onBookHospital: _bookHospital,
                    onRequestResource: (hospital) => _handleAction(
                        CareGuideAction(
                            type: hospital.bloodGroup?.isNotEmpty == true
                                ? 'REQUEST_BLOOD'
                                : 'REQUEST_BED',
                            label: hospital.bloodGroup?.isNotEmpty == true
                                ? 'Request Blood'
                                : 'Request Bed',
                            hospitalId: hospital.id,
                            hospitalName: hospital.name,
                            resourceType:
                                hospital.bloodGroup?.isNotEmpty == true
                                    ? 'blood'
                                    : 'beds',
                            bloodGroup: hospital.bloodGroup,
                            available: hospital.availableBeds,
                            availableUnits: hospital.bloodUnitsAvailable)),
                    onDirections: _openDirections,
                    strings: _strings,
                  );
                },
              ),
            ),
            if (_messages.length <= 2 && !_isLoading)
              _SuggestionBar(onSelect: _send, suggestions: _suggestions),
            _Composer(
              controller: _controller,
              enabled: !_isLoading,
              onSend: _send,
              strings: _strings,
            ),
          ],
        ),
      ),
    );
  }

  void _showRecommendation(HospitalRecommendation hospital) {
    // Use the existing detail screen and the database hospital ID rather than
    // a name-based lookup, which can be ambiguous and loses live resources.
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => HospitalDetailScreen(
        hospital: _hospitalFromRecommendation(hospital),
      ),
    ));
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
      final position = await LocationService.getBestAvailableLocation();
      if (!mounted) return;
      setState(() => _position = position);
      debugPrint(
          'PATIENT LIVE LOCATION latitude: ${position.latitude}, longitude: ${position.longitude}, accuracy: ${position.accuracy}, timestamp: ${position.timestamp}');
      final entranceIsValid = hospital.entranceLatitude != null &&
          hospital.entranceLongitude != null &&
          hospital.entranceLatitude! >= -90 &&
          hospital.entranceLatitude! <= 90 &&
          hospital.entranceLongitude! >= -180 &&
          hospital.entranceLongitude! <= 180;
      final destinationLatitude =
          entranceIsValid ? hospital.entranceLatitude! : hospital.latitude;
      final destinationLongitude =
          entranceIsValid ? hospital.entranceLongitude! : hospital.longitude;
      debugPrint(
          'HOSPITAL DESTINATION hospital: ${hospital.name}, latitude: $destinationLatitude, longitude: $destinationLongitude; using=${entranceIsValid ? 'main entrance' : 'hospital coordinates'}');
      final uri = Uri.https('www.google.com', '/maps/dir/', {
        'api': '1',
        'origin': '${position.latitude},${position.longitude}',
        'destination': '$destinationLatitude,$destinationLongitude',
        'travelmode': 'driving',
      });
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
          mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Unable to open Google Maps.')));
      }
    } on PatientLocationException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<int?> _showAgeSelector() {
    return showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: 320,
          child: Column(children: [
            const Padding(
                padding: EdgeInsets.all(16),
                child: Text("Select the patient's age",
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
            Expanded(
                child: GridView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: 101,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 5,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.5),
              itemBuilder: (context, index) => OutlinedButton(
                  onPressed: () => Navigator.pop(context, index),
                  child: Text('$index')),
            )),
          ]),
        ),
      ),
    );
  }

  void _openDirectory() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const PatientNearbyHospitals()));
  void _bookRecommendedDoctor(
      HospitalRecommendation recommendation, DoctorRecommendation doctor) {
    final hospital = _hospitalFromRecommendation(recommendation);
    Navigator.of(context).push(MaterialPageRoute(
        builder: (_) =>
            BookingScreen(hospital: hospital, initialDoctorId: doctor.id)));
  }

  Hospital _hospitalFromRecommendation(HospitalRecommendation recommendation) {
    return Hospital(
      id: recommendation.id,
      name: recommendation.name,
      address: recommendation.address,
      city: '',
      phone: recommendation.phone,
      email: '',
      isVerified: recommendation.isVerified,
      totalBeds: 0,
      availableBeds: recommendation.availableBeds,
      icuBeds: 0,
      availableIcu: recommendation.availableIcu,
      ventilatorCount: 0,
      availableVentilators: recommendation.availableVentilators,
      oxygenBedsTotal: 0,
      oxygenBedsAvailable: recommendation.availableOxygenBeds,
      bloodUnits: recommendation.bloodUnitsAvailable ?? 0,
      specialties: [recommendation.specialty],
      emergencyServices: false,
      distance: recommendation.distance.toString(),
      lastUpdated: '',
    );
  }

  void _bookHospital(HospitalRecommendation recommendation) {
    Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => BookingScreen(
            hospital: _hospitalFromRecommendation(recommendation))));
  }

  void _openSos() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const PatientEmergencyRequest()));

  void _handleAction(CareGuideAction action) {
    switch (action.type) {
      case 'EMERGENCY_SOS':
        _openSos();
        return;
      case 'REQUEST_AMBULANCE':
        Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const AmbulanceBookingScreen()));
        return;
      case 'BOOK_APPOINTMENT':
      case 'VIEW_HOSPITALS':
        _openDirectory();
        return;
      case 'REQUEST_BED':
      case 'REQUEST_BLOOD':
        if (action.hospitalId == null) return;
        Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => PatientResourceRequest(
                  hospitalId: action.hospitalId,
                  hospitalName: action.hospitalName,
                  resourceType: action.type == 'REQUEST_BLOOD'
                      ? 'blood'
                      : action.resourceType,
                  bloodGroup: action.bloodGroup,
                  availableQuantity: action.availableUnits ?? action.available,
                )));
        return;
      case 'VIEW_HOSPITAL':
        if (action.hospitalId != null) _openDirectory();
        return;
      case 'DIRECTIONS':
        // A structured action only carries an id; hospital cards use their
        // entrance coordinates directly, so the action remains a safe
        // directory fallback instead of guessing a destination.
        _openDirectory();
        return;
      case 'VIEW_APPOINTMENTS':
        Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const PatientBookings()));
        return;
      case 'VIEW_HEALTH_RECORD':
        Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const HealthRecordScreen()));
        return;
    }
  }
}

enum _LocationState {
  idle,
  loading,
  active,
  serviceDisabled,
  permissionDenied,
  permanentlyDenied,
  error
}

class _LocationBanner extends StatelessWidget {
  const _LocationBanner(
      {required this.state,
      required this.error,
      required this.onAction,
      required this.onRefresh,
      required this.strings});

  final _LocationState state;
  final String? error;
  final VoidCallback onAction;
  final VoidCallback onRefresh;
  final CareGuideStrings strings;

  @override
  Widget build(BuildContext context) {
    final active = state == _LocationState.active;
    final loading = state == _LocationState.loading;
    final color = active
        ? const Color(0xFF18794E)
        : state == _LocationState.error
            ? Colors.red.shade700
            : const Color(0xFF9A6700);
    final message = switch (state) {
      _LocationState.active => strings.t('locationOn'),
      _LocationState.loading => strings.t('locationLoading'),
      _LocationState.serviceDisabled => strings.t('locationDisabled'),
      _LocationState.permissionDenied => strings.t('locationPermission'),
      _LocationState.permanentlyDenied => strings.t('locationPermanent'),
      _LocationState.error => error ?? strings.t('locationError'),
      _LocationState.idle => strings.t('locationOff'),
    };
    final actionLabel = state == _LocationState.permanentlyDenied
        ? strings.t('openSettings')
        : state == _LocationState.serviceDisabled
            ? strings.t('openSettings')
            : strings.t('enable');
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
              active
                  ? Icons.location_on_outlined
                  : loading
                      ? Icons.location_searching_outlined
                      : Icons.location_off_outlined,
              color: color,
              size: 19),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                  fontSize: 12, color: color, fontWeight: FontWeight.w600),
            ),
          ),
          if (loading)
            const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2))
          else ...[
            IconButton(
                tooltip: strings.t('refreshLocation'),
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded)),
            if (!active)
              TextButton(onPressed: onAction, child: Text(actionLabel)),
          ],
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
      required this.onAction,
      required this.onBookDoctor,
      required this.onBookHospital,
      required this.onRequestResource,
      required this.onDirections,
      required this.strings});

  final ChatMessage message;
  final VoidCallback? onRecommendationTap;
  final ValueChanged<HospitalRecommendation> onHospitalTap;
  final VoidCallback? onLocation;
  final VoidCallback? onSos;
  final ValueChanged<CareGuideAction> onAction;
  final void Function(HospitalRecommendation, DoctorRecommendation)
      onBookDoctor;
  final ValueChanged<HospitalRecommendation> onBookHospital;
  final ValueChanged<HospitalRecommendation> onRequestResource;
  final ValueChanged<HospitalRecommendation> onDirections;
  final CareGuideStrings strings;

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
                    if (onRecommendationTap != null &&
                        message.hospitals.length == 1) ...[
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: onRecommendationTap,
                        icon:
                            const Icon(Icons.local_hospital_outlined, size: 17),
                        label: Text(strings.t('viewHospital')),
                      ),
                    ],
                    if (onLocation != null) ...[
                      const SizedBox(height: 8),
                      FilledButton.icon(
                        onPressed: onLocation,
                        icon: const Icon(Icons.my_location),
                        label: Text(strings.t('useLocation')),
                      ),
                    ],
                    if (onSos != null) ...[
                      const SizedBox(height: 8),
                      FilledButton.icon(
                          onPressed: onSos,
                          style: FilledButton.styleFrom(
                              backgroundColor: Colors.red),
                          icon: const Icon(Icons.sos),
                          label: Text(strings.t('sos'))),
                    ],
                    if (message.hospitals.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      ...message.hospitals.map((hospital) => _ChatHospitalCard(
                            hospital: hospital,
                            responseType: message.responseType,
                            resourceType: message.resourceType,
                            onDetails: () => onHospitalTap(hospital),
                            onBookDoctor: (doctor) =>
                                onBookDoctor(hospital, doctor),
                            strings: strings,
                            onBookHospital: () => onBookHospital(hospital),
                            onRequestResource: () =>
                                onAction(_requestActionFor(hospital)),
                            onDirections: () => onDirections(hospital),
                          )),
                    ],
                    if (message.actions.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: message.actions
                            .where((action) => ![
                                  'EMERGENCY_SOS',
                                  'REQUEST_BLOOD',
                                  'REQUEST_BED',
                                  'VIEW_HOSPITAL',
                                  'DIRECTIONS'
                                ].contains(action.type))
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

  CareGuideAction _requestActionFor(HospitalRecommendation hospital) {
    for (final action in message.actions) {
      if (action.hospitalId == hospital.id &&
          (action.type == 'REQUEST_BLOOD' || action.type == 'REQUEST_BED')) {
        return action;
      }
    }
    final blood = message.responseType == 'blood_results';
    return CareGuideAction(
      type: blood ? 'REQUEST_BLOOD' : 'REQUEST_BED',
      label: blood ? 'Request Blood' : 'Request Bed',
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      resourceType: blood ? 'blood' : (message.resourceType ?? 'beds'),
      bloodGroup: blood ? hospital.bloodGroup : null,
      available: hospital.availableBeds,
      availableUnits: hospital.bloodUnitsAvailable,
    );
  }
}

class _ChatHospitalCard extends StatelessWidget {
  const _ChatHospitalCard(
      {required this.hospital,
      required this.responseType,
      required this.resourceType,
      required this.onDetails,
      required this.onBookDoctor,
      required this.onBookHospital,
      required this.onRequestResource,
      required this.onDirections,
      required this.strings});
  final HospitalRecommendation hospital;
  final String responseType;
  final String? resourceType;
  final VoidCallback onDetails;
  final ValueChanged<DoctorRecommendation> onBookDoctor;
  final VoidCallback onBookHospital;
  final VoidCallback onRequestResource;
  final VoidCallback onDirections;
  final CareGuideStrings strings;
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(top: 8),
        child: Padding(
            padding: const EdgeInsets.all(10),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(hospital.name,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(
                  hospital.distance > 0
                      ? '${hospital.distance.toStringAsFixed(1)} km away'
                      : hospital.address,
                  style: const TextStyle(fontSize: 12, color: Colors.blueGrey)),
              if (hospital.ratingVerified && hospital.googleRating != null)
                Text(
                    'Google ${hospital.googleRating!.toStringAsFixed(1)}${hospital.googleReviewCount == null ? '' : ' (${hospital.googleReviewCount} reviews)'}',
                    style: const TextStyle(fontSize: 12)),
              if (responseType == 'blood_results' &&
                  hospital.bloodGroup != null &&
                  hospital.bloodGroup!.isNotEmpty)
                Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Blood availability\n${hospital.bloodGroup} ${hospital.bloodGroup!.endsWith('+') ? 'Positive' : 'Negative'}\nAvailable: ${hospital.bloodUnitsAvailable ?? 0} units',
                      style: TextStyle(
                          fontSize: 13,
                          color: hospital.bloodAvailable == true
                              ? Colors.green.shade700
                              : Colors.red.shade700,
                          fontWeight: FontWeight.w700),
                    )),
              if (responseType == 'bed_results')
                Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: _BedAvailabilitySummary(
                        hospital: hospital, focusedResource: resourceType)),
              ...hospital.doctors.map((doctor) => Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              '${doctor.name}\n${doctor.specialization} · ${doctor.experienceYears} years${doctor.consultationFee == null ? '' : ' · ₹${doctor.consultationFee!.toStringAsFixed(0)}'}\nAvailable appointments: ${doctor.availableSlots}',
                              style: const TextStyle(fontSize: 12)),
                          TextButton(
                              onPressed: () => onBookDoctor(doctor),
                              child:
                                  Text('${strings.t('book')} ${doctor.name}')),
                        ]),
                  )),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 6, children: [
                OutlinedButton(
                    onPressed: onDetails, child: Text(strings.t('view'))),
                if (responseType == 'blood_results' ||
                    responseType == 'bed_results')
                  FilledButton(
                      onPressed: onRequestResource,
                      child: Text(responseType == 'blood_results'
                          ? 'Request Blood'
                          : 'Request Bed')),
                OutlinedButton.icon(
                    onPressed: onDirections,
                    icon: const Icon(Icons.directions, size: 16),
                    label: const Text('Directions'))
              ]),
            ])),
      );
}
class _BedAvailabilitySummary extends StatelessWidget {
  const _BedAvailabilitySummary({required this.hospital, this.focusedResource});
  final HospitalRecommendation hospital;
  final String? focusedResource;

  @override
  Widget build(BuildContext context) {
    final resources = <String, int>{
      'General': hospital.availableBeds,
      'ICU': hospital.availableIcu,
      'Oxygen': hospital.availableOxygenBeds,
      'Ventilator': hospital.availableVentilators,
    };
    final focused = switch (focusedResource) {
      'icu_beds' => 'ICU',
      'oxygen_beds' => 'Oxygen',
      'ventilators' => 'Ventilator',
      _ => null,
    };
    final shown = focused == null
        ? resources.entries
        : resources.entries.where((entry) => entry.key == focused);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('AVAILABLE RESOURCES',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
      const SizedBox(height: 4),
      Wrap(
          spacing: 12,
          runSpacing: 4,
          children: shown
              .map((entry) => Text('${entry.key}: ${entry.value}',
                  style: const TextStyle(fontSize: 12)))
              .toList()),
    ]);
  }
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator({required this.strings});
  final CareGuideStrings strings;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 2, bottom: 16),
        child: Row(
          children: [
            const CircleAvatar(
                radius: 17,
                child: Icon(Icons.health_and_safety_outlined, size: 18)),
            const SizedBox(width: 8),
            Text(strings.t('typing')),
          ],
        ),
      );
}

class _SuggestionBar extends StatelessWidget {
  const _SuggestionBar({required this.onSelect, required this.suggestions});
  final ValueChanged<String> onSelect;
  final List<String> suggestions;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 43,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          scrollDirection: Axis.horizontal,
          itemCount: suggestions.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, index) => ActionChip(
            label: Text(suggestions[index]),
            onPressed: () => onSelect(suggestions[index]),
          ),
        ),
      );
}

class _Composer extends StatelessWidget {
  const _Composer(
      {required this.controller,
      required this.enabled,
      required this.onSend,
      required this.strings});
  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onSend;
  final CareGuideStrings strings;

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
                  hintText: strings.t('placeholder'),
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

