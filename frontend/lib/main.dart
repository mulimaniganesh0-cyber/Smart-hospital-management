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
import 'widgets/app_ui.dart';

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
        title: 'CareGuide',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          primaryColor: CareGuideColors.teal,
          colorScheme: ColorScheme.fromSeed(
            seedColor: CareGuideColors.teal,
            primary: CareGuideColors.teal,
            secondary: const Color(0xFF2563EB),
            surface: Colors.white,
          ),
          textTheme: GoogleFonts.poppinsTextTheme(),
          scaffoldBackgroundColor: CareGuideColors.canvas,
          cardTheme: CardThemeData(
            elevation: 0,
            clipBehavior: Clip.antiAlias,
            color: Colors.white,
            surfaceTintColor: Colors.transparent,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFE2E8EE))),
          ),
          appBarTheme: const AppBarTheme(
            elevation: 0,
            centerTitle: false,
            backgroundColor: CareGuideColors.canvas,
            foregroundColor: CareGuideColors.ink,
          ),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
              backgroundColor: CareGuideColors.teal,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 50),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              textStyle: GoogleFonts.poppins(
                fontSize: 15,
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
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFD7E0E5)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFD7E0E5)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide:
                  const BorderSide(color: CareGuideColors.teal, width: 1.5),
            ),
          ),
          navigationBarTheme: const NavigationBarThemeData(
            height: 68,
            backgroundColor: Colors.white,
            indicatorColor: Color(0xFFD8F5EE),
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
