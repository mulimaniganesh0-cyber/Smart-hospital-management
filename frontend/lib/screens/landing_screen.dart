// lib/screens/landing_screen.dart
import 'dart:async';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'signup_screen.dart';
import 'patient/patient_home_screen.dart' as patient;
import 'hospital/hospital_home_screen.dart' as hospital;
import 'admin/admin_home_screen.dart' as admin;

class LandingScreen extends StatefulWidget {
  const LandingScreen({super.key});

  @override
  State<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends State<LandingScreen>
    with TickerProviderStateMixin {
  final PageController _pageController = PageController();
  double _currentPage = 0.0;
  DateTime _lastScrollTime = DateTime.now();

  // Navigation tabs
  final List<Map<String, dynamic>> _sections = [
    {'title': 'Welcome', 'icon': Icons.home_rounded},
    {'title': 'Resources', 'icon': Icons.pie_chart_rounded},
    {'title': 'Emergency', 'icon': Icons.local_shipping_rounded},
    {'title': 'CareGuide AI', 'icon': Icons.support_agent_rounded},
    {'title': 'Blood Bank', 'icon': Icons.water_drop_rounded},
    {'title': 'Portals', 'icon': Icons.login_rounded},
  ];

  // Simulated metrics and simulation inputs
  double _simulatedBeds = 80;
  double _simulatedICU = 90;
  double _simulatedVents = 40;

  // CareGuide simulated chat state
  final List<Map<String, dynamic>> _simulatedMessages = [
    {
      'text':
          'Hello! I am CareGuide. Ask me anything about nearby resource availability or emergency booking.',
      'isUser': false
    }
  ];
  bool _isTyping = false;

  // Blood bank simulation inputs
  double _bloodExpirySlider = 30; // days left

  // Login/Portal fields
  String _selectedPortal = 'patient';
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isPasswordVisible = false;

  // Animation controller for pulsing elements
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pageController.addListener(() {
      setState(() {
        _currentPage = _pageController.page ?? 0.0;
      });
    });

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  void _nextPage() {
    final now = DateTime.now();
    if (now.difference(_lastScrollTime).inMilliseconds > 600) {
      _lastScrollTime = now;
      if (_currentPage < _sections.length - 1) {
        _pageController.nextPage(
          duration: const Duration(milliseconds: 800),
          curve: Curves.easeInOutCubic,
        );
      }
    }
  }

  void _prevPage() {
    final now = DateTime.now();
    if (now.difference(_lastScrollTime).inMilliseconds > 600) {
      _lastScrollTime = now;
      if (_currentPage > 0) {
        _pageController.previousPage(
          duration: const Duration(milliseconds: 800),
          curve: Curves.easeInOutCubic,
        );
      }
    }
  }

  void _scrollToPage(int index) {
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 800),
      curve: Curves.easeInOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isDesktop = size.width > 900;

    return Scaffold(
      backgroundColor: const Color(0xFF0B132B), // Deep Space Blue
      body: Stack(
        children: [
          // Background Gradient decoration
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment(0.6, -0.6),
                  radius: 1.5,
                  colors: [
                    Color(0xFF1C2541),
                    Color(0xFF0B132B),
                  ],
                ),
              ),
            ),
          ),

          // Main vertical PageView with custom mouse wheel intercept
          Listener(
            onPointerSignal: (pointerSignal) {
              if (pointerSignal is PointerScrollEvent) {
                if (pointerSignal.scrollDelta.dy > 10) {
                  _nextPage();
                } else if (pointerSignal.scrollDelta.dy < -10) {
                  _prevPage();
                }
              }
            },
            child: PageView(
              controller: _pageController,
              scrollDirection: Axis.vertical,
              physics:
                  const NeverScrollableScrollPhysics(), // Managed via mouse listener / navigation
              children: [
                _buildHeroSection(isDesktop),
                _buildResourceRegistrySection(isDesktop),
                _buildDispatchSection(isDesktop),
                _buildCareGuideSection(isDesktop),
                _buildBloodBankSection(isDesktop),
                _buildPortalAuthSection(isDesktop),
              ],
            ),
          ),

          // Header Navigation Bar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _buildHeader(isDesktop),
          ),

          // Interactive Sidebar indicators
          Positioned(
            right: 24,
            top: 0,
            bottom: 0,
            child: Center(
              child: _buildSidebarIndicators(),
            ),
          ),
        ],
      ),
    );
  }

  // ==================== NAVIGATION / HEADER ====================

  Widget _buildHeader(bool isDesktop) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            const Color(0xFF0B132B).withValues(alpha: 0.9),
            const Color(0xFF0B132B).withValues(alpha: 0.0),
          ],
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Logo
          Row(
            children: [
              ScaleTransition(
                scale: _pulseAnimation,
                child: const Icon(
                  Icons.local_hospital,
                  color: Color(0xFF48CAE4),
                  size: 32,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'CareSync',
                style: GoogleFonts.outfit(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),

          // Quick links (Desktop only)
          if (isDesktop)
            Expanded(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_sections.length, (index) {
                  final isSelected = _currentPage.round() == index;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: TextButton(
                      onPressed: () => _scrollToPage(index),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        foregroundColor:
                            isSelected ? const Color(0xFF48CAE4) : Colors.white70,
                      ),
                      child: Text(
                        _sections[index]['title'],
                        style: GoogleFonts.poppins(
                          fontWeight:
                              isSelected ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),

          // Access Portal CTA
          ElevatedButton(
            onPressed: () => _scrollToPage(5),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0077B6),
              foregroundColor: Colors.white,
              elevation: 4,
              shadowColor: const Color(0xFF0096C7).withValues(alpha: 0.4),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(30),
              ),
            ),
            child: const Text('Access Dashboard'),
          ),
        ],
      ),
    );
  }

  Widget _buildSidebarIndicators() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(_sections.length, (index) {
        final isSelected = _currentPage.round() == index;
        final double size = isSelected ? 16 : 8;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Tooltip(
            message: _sections[index]['title'],
            child: InkWell(
              onTap: () => _scrollToPage(index),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: size,
                height: size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isSelected ? const Color(0xFF48CAE4) : Colors.white24,
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: const Color(0xFF48CAE4).withValues(alpha: 0.6),
                            blurRadius: 10,
                            spreadRadius: 2,
                          )
                        ]
                      : [],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  // ==================== SLIDE 0: HERO SECTION ====================

  Widget _buildHeroSection(bool isDesktop) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1200),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(height: 60),
                    // Main Tagline
                    ShaderMask(
                      shaderCallback: (bounds) => const LinearGradient(
                        colors: [
                          Color(0xFF90E0EF),
                          Color(0xFF00B4D8),
                          Color(0xFF0077B6)
                        ],
                      ).createShader(bounds),
                      child: Text(
                        'Revolutionizing Hospital Resource Coordination',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.outfit(
                          fontSize: isDesktop ? 54 : 36,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          height: 1.2,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Description
                    Text(
                      'A modern, integrated portal for real-time bed registries, emergency ambulance dispatching, blood bank monitoring, and CareGuide AI guidance.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.poppins(
                        fontSize: isDesktop ? 18 : 15,
                        color: Colors.white.withValues(alpha: 0.8),
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 48),

                    // Desktop Glass Dashboard Mockup
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.04),
                        borderRadius: BorderRadius.circular(20),
                        border:
                            Border.all(color: Colors.white.withValues(alpha: 0.08)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 30,
                            offset: const Offset(0, 15),
                          )
                        ],
                      ),
                      child: Wrap(
                        spacing: 24,
                        runSpacing: 24,
                        alignment: WrapAlignment.center,
                        children: [
                          _buildHeroMetric('142+', 'Hospitals Connected',
                              Icons.local_hospital, const Color(0xFF48CAE4)),
                          _buildHeroMetric('2.1 Min', 'Avg Response Time',
                              Icons.flash_on, const Color(0xFFFFB703)),
                          _buildHeroMetric(
                              '98.7%',
                              'Successful Dispatches',
                              Icons.check_circle_outline,
                              const Color(0xFF2A9D8F)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 60),

                    // Bouncing Chevron indicator
                    Column(
                      children: [
                        Text(
                          'Scroll down to explore features',
                          style: GoogleFonts.poppins(
                              fontSize: 12, color: Colors.white30),
                        ),
                        const SizedBox(height: 8),
                        const Icon(
                          Icons.keyboard_arrow_down,
                          color: Colors.white30,
                          size: 28,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeroMetric(
      String val, String label, IconData icon, Color color) {
    return Container(
      width: 250,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  val,
                  style: GoogleFonts.outfit(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  label,
                  style:
                      GoogleFonts.poppins(fontSize: 12, color: Colors.white54),
                ),
              ],
            ),
          )
        ],
      ),
    );
  }

  // ==================== SLIDE 1: LIVE RESOURCE REGISTRY ====================

  Widget _buildResourceRegistrySection(bool isDesktop) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Flex(
            direction: isDesktop ? Axis.horizontal : Axis.vertical,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left Content
              Expanded(
                flex: 5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF48CAE4).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        'REAL-TIME REGISTRY',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: const Color(0xFF48CAE4),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Live Ward Capacity Tracking',
                      style: GoogleFonts.outfit(
                        fontSize: isDesktop ? 42 : 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Hospitals update inventory counts continuously. Patients can discover general beds, ICU beds, ventilators, and oxygen capacity in real time before departure.',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        color: Colors.white70,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 24),
                    _buildFeatureBullet(Icons.check_circle_outline_rounded,
                        'Auto-updates via WebSockets connection.'),
                    _buildFeatureBullet(Icons.check_circle_outline_rounded,
                        'Prevents hospital congestion during surge seasons.'),
                    _buildFeatureBullet(Icons.check_circle_outline_rounded,
                        'Critical levels trigger system warnings.'),
                  ],
                ),
              ),
              const SizedBox(width: 48, height: 48),

              // Right Simulator Widget
              Expanded(
                flex: 5,
                child: Container(
                  padding: const EdgeInsets.all(32),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.03),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Live Ward Simulator',
                        style: GoogleFonts.outfit(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Adjust sliders to simulate emergency patient intake and watch inventory levels update dynamically.',
                        style: GoogleFonts.poppins(
                            fontSize: 12, color: Colors.white30),
                      ),
                      const SizedBox(height: 24),

                      // General Beds Tracker
                      _buildSliderIndicator('General Beds Occupancy',
                          _simulatedBeds, const Color(0xFF48CAE4)),
                      Slider(
                        value: _simulatedBeds,
                        min: 0,
                        max: 100,
                        activeColor: const Color(0xFF48CAE4),
                        inactiveColor: Colors.white12,
                        onChanged: (val) {
                          setState(() {
                            _simulatedBeds = val;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // ICU Occupancy
                      _buildSliderIndicator('ICU Beds Occupancy', _simulatedICU,
                          const Color(0xFFFFB703)),
                      Slider(
                        value: _simulatedICU,
                        min: 0,
                        max: 100,
                        activeColor: const Color(0xFFFFB703),
                        inactiveColor: Colors.white12,
                        onChanged: (val) {
                          setState(() {
                            _simulatedICU = val;
                          });
                        },
                      ),
                      const SizedBox(height: 16),

                      // Ventilator Available
                      _buildSliderIndicator('Ventilators In Use',
                          _simulatedVents, const Color(0xFF2A9D8F)),
                      Slider(
                        value: _simulatedVents,
                        min: 0,
                        max: 100,
                        activeColor: const Color(0xFF2A9D8F),
                        inactiveColor: Colors.white12,
                        onChanged: (val) {
                          setState(() {
                            _simulatedVents = val;
                          });
                        },
                      ),
                    ],
                  ),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSliderIndicator(String title, double val, Color color) {
    String status = 'Normal';
    if (val > 85) {
      status = 'CRITICAL LIMIT';
    } else if (val > 65) {
      status = 'HIGH UTILITY';
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title,
            style: GoogleFonts.poppins(fontSize: 14, color: Colors.white70)),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: val > 85
                    ? Colors.red.withValues(alpha: 0.2)
                    : color.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                status,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: val > 85 ? Colors.redAccent : color,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text('${val.round()}%',
                style: GoogleFonts.outfit(
                    fontWeight: FontWeight.bold, color: Colors.white)),
          ],
        )
      ],
    );
  }

  Widget _buildFeatureBullet(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFF48CAE4), size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.poppins(color: Colors.white70, fontSize: 14),
            ),
          )
        ],
      ),
    );
  }

  // ==================== SLIDE 2: EMERGENCY DISPATCH ====================

  Widget _buildDispatchSection(bool isDesktop) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Flex(
            direction: isDesktop ? Axis.horizontal : Axis.vertical,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left Content
              if (!isDesktop) const SizedBox(height: 40),
              Expanded(
                flex: 5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFB703).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        'EMERGENCY DISPATCH',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: const Color(0xFFFFB703),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Intelligent Routing & Dispatch',
                      style: GoogleFonts.outfit(
                        fontSize: isDesktop ? 42 : 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Seconds count. Patients can trigger emergency medical requests directly from their app. The platform immediately alerts the closest hospital and coordinates vehicle dispatches.',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        color: Colors.white70,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 24),
                    _buildFeatureBullet(Icons.flash_on,
                        'Instantly broadcasts coordinates through WebSockets.'),
                    _buildFeatureBullet(Icons.map,
                        'Calculates travel time using live geographic telemetry.'),
                    _buildFeatureBullet(Icons.phone_in_talk,
                        'Direct coordination line to ambulance drivers.'),
                  ],
                ),
              ),
              const SizedBox(width: 48, height: 48),

              // Right Map Visualizer Simulator
              Expanded(
                flex: 5,
                child: Container(
                  height: 400,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.02),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: Stack(
                      children: [
                        // Map Background grid simulation
                        Positioned.fill(
                          child: CustomPaint(
                            painter: MapGridPainter(),
                          ),
                        ),

                        // Map Icons overlay
                        Positioned(
                          left: 60,
                          bottom: 80,
                          child: Column(
                            children: [
                              const Icon(Icons.person_pin_circle_rounded,
                                  color: Color(0xFFFFB703), size: 36),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.8),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text('Patient Location',
                                    style: GoogleFonts.poppins(
                                        fontSize: 10, color: Colors.white)),
                              ),
                            ],
                          ),
                        ),

                        Positioned(
                          right: 80,
                          top: 80,
                          child: Column(
                            children: [
                              const Icon(Icons.local_hospital,
                                  color: Color(0xFF48CAE4), size: 40),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.8),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text('City General Hospital',
                                    style: GoogleFonts.poppins(
                                        fontSize: 10, color: Colors.white)),
                              ),
                            ],
                          ),
                        ),

                        // Route Progress Indicator / Live Dispatch logs
                        Positioned(
                          bottom: 16,
                          left: 16,
                          right: 16,
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.85),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.local_shipping_rounded,
                                    color: Color(0xFFFFB703), size: 24),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text('Ambulance #A-24 Dispatched',
                                          style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 12,
                                              color: Colors.white)),
                                      const SizedBox(height: 2),
                                      Text(
                                          'En Route. ETA: 4.8 minutes (Traffic Normal)',
                                          style: GoogleFonts.poppins(
                                              fontSize: 10,
                                              color: Colors.white70)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  // ==================== SLIDE 3: CAREGUIDE AI CHAT ====================

  Widget _buildCareGuideSection(bool isDesktop) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Flex(
            direction: isDesktop ? Axis.horizontal : Axis.vertical,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left Content
              Expanded(
                flex: 5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2A9D8F).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        'CAREGUIDE ASSISTANT',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: const Color(0xFF2A9D8F),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'AI Location-Aware Assistant',
                      style: GoogleFonts.outfit(
                        fontSize: isDesktop ? 42 : 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'CareGuide queries current capacity models dynamically. Interact with CareGuide by choosing prompts to simulate real-time patient assistance.',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        color: Colors.white70,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 24),
                    _buildFeatureBullet(Icons.location_on,
                        'Uses client geographic search contexts.'),
                    _buildFeatureBullet(Icons.chat_bubble_outline_rounded,
                        'Answers questions on resource reservation rules.'),
                    _buildFeatureBullet(Icons.stars_sharp,
                        'Recommends top-rated hospitals based on patient reports.'),
                  ],
                ),
              ),
              const SizedBox(width: 48, height: 48),

              // Right Simulated Chat Box
              Expanded(
                flex: 5,
                child: Container(
                  height: 400,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.03),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Column(
                    children: [
                      // Header
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0xFF2A9D8F).withValues(alpha: 0.1),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.support_agent,
                                color: Color(0xFF2A9D8F)),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('CareGuide AI',
                                  style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white)),
                              Row(
                                children: [
                                  Container(
                                      width: 6,
                                      height: 6,
                                      decoration: const BoxDecoration(
                                          color: Colors.green,
                                          shape: BoxShape.circle)),
                                  const SizedBox(width: 6),
                                  Text('Online',
                                      style: GoogleFonts.poppins(
                                          fontSize: 10, color: Colors.white60)),
                                ],
                              ),
                            ],
                          )
                        ],
                      ),
                      const Divider(color: Colors.white10, height: 24),

                      // Messages list
                      Expanded(
                        child: ListView.builder(
                          itemCount: _simulatedMessages.length,
                          itemBuilder: (context, index) {
                            final msg = _simulatedMessages[index];
                            final isUser = msg['isUser'] == true;
                            return Align(
                              alignment: isUser
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 10),
                                decoration: BoxDecoration(
                                  color: isUser
                                      ? const Color(0xFF0077B6)
                                      : Colors.white.withValues(alpha: 0.06),
                                  borderRadius: BorderRadius.only(
                                    topLeft: const Radius.circular(12),
                                    topRight: const Radius.circular(12),
                                    bottomLeft: isUser
                                        ? const Radius.circular(12)
                                        : Radius.zero,
                                    bottomRight: isUser
                                        ? Radius.zero
                                        : const Radius.circular(12),
                                  ),
                                ),
                                child: Text(
                                  msg['text'],
                                  style: GoogleFonts.poppins(
                                      fontSize: 13, color: Colors.white),
                                ),
                              ),
                            );
                          },
                        ),
                      ),

                      if (_isTyping)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 8.0),
                            child: Text('CareGuide is typing...',
                                style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: Colors.white30,
                                    fontStyle: FontStyle.italic)),
                          ),
                        ),

                      // Selection prompts
                      Wrap(
                        spacing: 8,
                        children: [
                          _buildPromptChip('Find nearest ICU bed'),
                          _buildPromptChip('How to book ambulance?'),
                        ],
                      )
                    ],
                  ),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPromptChip(String label) {
    return ActionChip(
      backgroundColor: Colors.white.withValues(alpha: 0.04),
      label: Text(label,
          style: GoogleFonts.poppins(
              fontSize: 11, color: const Color(0xFF48CAE4))),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Colors.white10)),
      onPressed: () {
        if (_isTyping) return;
        setState(() {
          _simulatedMessages.add({'text': label, 'isUser': true});
          _isTyping = true;
        });

        // Auto reply
        Timer(const Duration(seconds: 1), () {
          setState(() {
            _isTyping = false;
            String response = 'Loading real-time data... ';
            if (label.contains('ICU')) {
              response =
                  'City General Hospital currently has 3 vacant ICU beds, which is 2.4 km away. I recommend routing there.';
            } else {
              response =
                  'You can book an emergency ambulance directly from the dispatch portal on your patient dashboard. Just input your coordinates.';
            }
            _simulatedMessages.add({'text': response, 'isUser': false});
          });
        });
      },
    );
  }

  // ==================== SLIDE 4: BLOOD BANK EXPIRE ====================

  Widget _buildBloodBankSection(bool isDesktop) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Flex(
            direction: isDesktop ? Axis.horizontal : Axis.vertical,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left Content
              if (!isDesktop) const SizedBox(height: 40),
              Expanded(
                flex: 5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.redAccent.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        'BLOOD RESOURCE MANAGER',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.redAccent,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Batch Expiry & Campaign Management',
                      style: GoogleFonts.outfit(
                        fontSize: isDesktop ? 42 : 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Monitor units by batch and set threshold limits. Expiry monitoring automatically generates warnings when vital blood resources approach shelf-life limits, dispatching priority donation campaigns.',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        color: Colors.white70,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 24),
                    _buildFeatureBullet(Icons.warning_amber_rounded,
                        'Proactive expiry alerts per batch.'),
                    _buildFeatureBullet(
                        Icons.event_note, 'Coordinated community campaigns.'),
                    _buildFeatureBullet(
                        Icons.analytics, 'Detailed collection report logs.'),
                  ],
                ),
              ),
              const SizedBox(width: 48, height: 48),

              // Right Visualizer Simulator
              Expanded(
                flex: 5,
                child: Container(
                  padding: const EdgeInsets.all(32),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.03),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Batch Expiry Simulator',
                        style: GoogleFonts.outfit(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Simulate remaining batch shelf life. The system automatically creates a campaign once it dips below 7 days.',
                        style: GoogleFonts.poppins(
                            fontSize: 12, color: Colors.white30),
                      ),
                      const SizedBox(height: 24),

                      // Slider
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Days until Batch Expiry',
                              style: GoogleFonts.poppins(
                                  fontSize: 14, color: Colors.white70)),
                          Text('${_bloodExpirySlider.round()} Days',
                              style: GoogleFonts.outfit(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white)),
                        ],
                      ),
                      Slider(
                        value: _bloodExpirySlider,
                        min: 1,
                        max: 42,
                        activeColor: Colors.redAccent,
                        inactiveColor: Colors.white12,
                        onChanged: (val) {
                          setState(() {
                            _bloodExpirySlider = val;
                          });
                        },
                      ),
                      const SizedBox(height: 24),

                      // Warning Banner Dynamic State
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _bloodExpirySlider < 7
                              ? Colors.red.withValues(alpha: 0.15)
                              : Colors.green.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _bloodExpirySlider < 7
                                ? Colors.redAccent
                                : Colors.green,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _bloodExpirySlider < 7
                                  ? Icons.warning_amber_rounded
                                  : Icons.check_circle_outline,
                              color: _bloodExpirySlider < 7
                                  ? Colors.redAccent
                                  : Colors.green,
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _bloodExpirySlider < 7
                                        ? 'âš ï¸ Critical Expiry Risk!'
                                        : 'Blood Stock Stable',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.bold,
                                      color: _bloodExpirySlider < 7
                                          ? Colors.redAccent
                                          : Colors.green,
                                      fontSize: 13,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    _bloodExpirySlider < 7
                                        ? 'Batch A+ expires soon. Community Blood Campaign launched automatically.'
                                        : 'All current blood bank resources are safely within acceptable usage terms.',
                                    style: GoogleFonts.poppins(
                                        fontSize: 11, color: Colors.white70),
                                  ),
                                ],
                              ),
                            )
                          ],
                        ),
                      )
                    ],
                  ),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  // ==================== SLIDE 5: LOGIN / PORTALS ACCESS ====================

  Widget _buildPortalAuthSection(bool isDesktop) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Flex(
            direction: isDesktop ? Axis.horizontal : Axis.vertical,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left Content
              Expanded(
                flex: 5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0077B6).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        'ACCESS PORTALS',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: const Color(0xFF0077B6),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Ready to Get Started?',
                      style: GoogleFonts.outfit(
                        fontSize: isDesktop ? 42 : 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Select your user profile role to access the corresponding workspace. Standard pre-configured test credentials can be used for administrative evaluation.',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        color: Colors.white70,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 28),

                    // Selector Cards
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        _buildRoleSelectorCard(
                            'patient', 'Patient Portal', Icons.person),
                        _buildRoleSelectorCard('hospital', 'Hospital Portal',
                            Icons.local_hospital),
                        _buildRoleSelectorCard('admin', 'Admin Portal',
                            Icons.admin_panel_settings),
                      ],
                    )
                  ],
                ),
              ),
              const SizedBox(width: 48, height: 48),

              // Right Glassmorphic Login Form
              Expanded(
                flex: 5,
                child: Container(
                  padding: const EdgeInsets.all(32),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.2),
                        blurRadius: 30,
                        offset: const Offset(0, 15),
                      )
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Sign In',
                        style: GoogleFonts.outfit(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      Text(
                        'Access your ${_selectedPortal.toUpperCase()} dashboard workspace',
                        style: GoogleFonts.poppins(
                            fontSize: 12, color: Colors.white30),
                      ),
                      const SizedBox(height: 24),

                      // Email Field
                      TextField(
                        controller: _emailController,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: 'Email Address',
                          labelStyle: const TextStyle(color: Colors.white70),
                          prefixIcon: const Icon(Icons.email_outlined,
                              color: Colors.white54),
                          fillColor: Colors.white.withValues(alpha: 0.05),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Password Field
                      TextField(
                        controller: _passwordController,
                        obscureText: !_isPasswordVisible,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: 'Password',
                          labelStyle: const TextStyle(color: Colors.white70),
                          prefixIcon: const Icon(Icons.lock_outline,
                              color: Colors.white54),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _isPasswordVisible
                                  ? Icons.visibility_off
                                  : Icons.visibility,
                              color: Colors.white54,
                            ),
                            onPressed: () {
                              setState(() {
                                _isPasswordVisible = !_isPasswordVisible;
                              });
                            },
                          ),
                          fillColor: Colors.white.withValues(alpha: 0.05),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 24),

                      // Login Button
                      Consumer<AuthProvider>(
                        builder: (context, auth, child) {
                          return ElevatedButton(
                            onPressed: auth.isLoading ? null : _handleLogin,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF0077B6),
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                            ),
                            child: auth.isLoading
                                ? const CircularProgressIndicator(
                                    color: Colors.white)
                                : const Text('Access Portal Dashboard',
                                    style:
                                        TextStyle(fontWeight: FontWeight.bold)),
                          );
                        },
                      ),

                      if (_selectedPortal != 'admin') ...[
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text("Don't have an account? ",
                                style: TextStyle(
                                    color: Colors.white60, fontSize: 13)),
                            TextButton(
                              onPressed: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (context) => SignupScreen(
                                      userType: _selectedPortal == 'patient'
                                          ? 'Patient'
                                          : 'Hospital',
                                    ),
                                  ),
                                );
                              },
                              child: const Text('Sign Up'),
                            ),
                          ],
                        ),
                      ]
                    ],
                  ),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRoleSelectorCard(String role, String label, IconData icon) {
    final isSelected = _selectedPortal == role;
    return InkWell(
      onTap: () {
        setState(() {
          _selectedPortal = role;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF48CAE4).withValues(alpha: 0.15)
              : Colors.white.withValues(alpha: 0.02),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF48CAE4)
                : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                color: isSelected ? const Color(0xFF48CAE4) : Colors.white30,
                size: 18),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? const Color(0xFF48CAE4) : Colors.white70,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleLogin() async {
    if (_emailController.text.trim().isEmpty) {
      _showError('Please enter your email');
      return;
    }
    if (_passwordController.text.trim().isEmpty) {
      _showError('Please enter your password');
      return;
    }

    final auth = Provider.of<AuthProvider>(context, listen: false);
    final success = await auth.login(
      _emailController.text.trim(),
      _passwordController.text.trim(),
      _selectedPortal,
    );

    if (success && mounted) {
      if (_selectedPortal == 'patient') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => const patient.PatientHomeScreen(),
          ),
        );
      } else if (_selectedPortal == 'hospital') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => const hospital.HospitalHomeScreen(),
          ),
        );
      } else {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => const admin.AdminHomeScreen(),
          ),
        );
      }
    } else {
      _showError(auth.errorMessage ?? 'Invalid credentials. Please try again.');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        duration: const Duration(seconds: 3),
      ),
    );
  }
}

// Custom Painter to draw stylized map roads background grid
class MapGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.03)
      ..strokeWidth = 1.0;

    // Draw grid lines
    const double spacing = 40.0;
    for (double i = 0; i < size.width; i += spacing) {
      canvas.drawLine(Offset(i, 0), Offset(i, size.height), paint);
    }
    for (double i = 0; i < size.height; i += spacing) {
      canvas.drawLine(Offset(0, i), Offset(size.width, i), paint);
    }

    // Draw some stylized road layouts
    final roadPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.08)
      ..strokeWidth = 8.0
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..moveTo(60, 320)
      ..lineTo(200, 320)
      ..lineTo(200, 100)
      ..lineTo(320, 100);

    canvas.drawPath(path, roadPaint);

    // Draw dotted path for route telemetry
    final routePaint = Paint()
      ..color = const Color(0xFFFFB703).withValues(alpha: 0.6)
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final routePath = Path()
      ..moveTo(60, 320)
      ..lineTo(200, 320)
      ..lineTo(200, 100)
      ..lineTo(320, 100);

    // Simplistic dotted line drawing
    canvas.drawPath(routePath, routePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
