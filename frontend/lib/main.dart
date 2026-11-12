// lib/main.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'theme/app_theme.dart';
import 'providers/auth_provider.dart';
import 'providers/patient_provider.dart';
import 'providers/hospital_provider.dart';
import 'screens/landing_screen.dart';
import 'screens/patient/patient_home_screen.dart';
import 'screens/hospital/hospital_home_screen.dart';
import 'screens/admin/admin_home_screen.dart';
import 'screens/doctor/doctor_dashboard_screen.dart';
import 'screens/driver/ambulance_driver_dashboard.dart';
import 'screens/private_ambulance_registration_screen.dart';
import 'screens/change_password_screen.dart';

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
        title: 'CareSync',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: Consumer<AuthProvider>(
          builder: (context, auth, child) {
            if (auth.isAuthenticated) {
              if (auth.currentUser
                      ?.additionalData?['password_reset_required'] ==
                  true) {
                return const ChangePasswordScreen(required: true);
              }
              final userType = auth.currentUser?.userType;
              if (userType == 'patient') {
                return const PatientHomeScreen();
              } else if (userType == 'hospital') {
                return const HospitalHomeScreen();
              } else if (userType == 'admin') {
                return const AdminHomeScreen();
              } else if (userType == 'doctor') {
                return const DoctorDashboardScreen();
              } else if (userType == 'ambulance_driver') {
                return const AmbulanceDriverDashboard();
              }
            }
            return const LandingScreen();
          },
        ),
        routes: {
          '/private-ambulance-registration': (_) =>
              const PrivateAmbulanceRegistrationScreen(),
          '/doctor/dashboard': (_) => const DoctorDashboardScreen(),
          '/doctor/appointments': (_) => const DoctorDashboardScreen(),
          '/doctor/patients': (_) => const DoctorDashboardScreen(),
          '/doctor/consultation': (_) => const DoctorDashboardScreen(),
          '/doctor/reports': (_) => const DoctorDashboardScreen(),
          '/doctor/prescriptions': (_) => const DoctorDashboardScreen(),
          '/doctor/profile': (_) => const DoctorDashboardScreen(),
          '/doctor/notifications': (_) => const DoctorDashboardScreen(),
        },
      ),
    );
  }
}
