// lib/main.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'providers/auth_provider.dart';
import 'providers/patient_provider.dart';
import 'providers/hospital_provider.dart';
import 'screens/landing_screen.dart';
import 'screens/patient/patient_home_screen.dart';
import 'screens/hospital/hospital_home_screen.dart';
import 'screens/admin/admin_home_screen.dart';

void main() {
  runApp(const HospitalResourceApp());
}

class HospitalResourceApp extends StatelessWidget {
  const HospitalResourceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => PatientProvider()),
        ChangeNotifierProvider(create: (_) => HospitalProvider()),
      ],
      child: MaterialApp(
        title: 'Smart Hospital Resource Management',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          primaryColor: const Color(0xFF0A4D68),
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF0A4D68),
            secondary: const Color(0xFF088395),
            surface: const Color(0xFFF8FAFC),
          ),
          textTheme: GoogleFonts.poppinsTextTheme(),
          scaffoldBackgroundColor: const Color(0xFFF8FAFC),
          appBarTheme: const AppBarTheme(
            elevation: 0,
            centerTitle: true,
            backgroundColor: Color(0xFF0A4D68),
            foregroundColor: Colors.white,
          ),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0A4D68),
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 50),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              textStyle: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFFD7E0E5)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFFD7E0E5)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide:
                  const BorderSide(color: Color(0xFF088395), width: 1.5),
            ),
          ),
          navigationBarTheme: const NavigationBarThemeData(
            height: 72,
            indicatorColor: Color(0xFFD9F0F3),
            labelTextStyle: WidgetStatePropertyAll(
                TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
          ),
        ),
        home: Consumer<AuthProvider>(
          builder: (context, auth, child) {
            if (auth.isAuthenticated) {
              final userType = auth.currentUser?.userType;
              if (userType == 'patient') {
                return const PatientHomeScreen();
              } else if (userType == 'hospital') {
                return const HospitalHomeScreen();
              } else if (userType == 'admin') {
                return const AdminHomeScreen();
              }
            }
            return const LandingScreen();
          },
        ),
      ),
    );
  }
}
