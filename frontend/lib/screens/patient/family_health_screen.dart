import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import '../../services/api_service.dart';

class FamilyHealthScreen extends StatefulWidget {
  const FamilyHealthScreen({super.key});
  @override
  State<FamilyHealthScreen> createState() => _FamilyHealthScreenState();
}

class _FamilyHealthScreenState extends State<FamilyHealthScreen> {
  bool loading = true;
  List<dynamic> members = [];
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    final r = await ApiService.getFamilyMembers();
    if (!mounted) return;
    setState(() {
      members = List<dynamic>.from(r['data'] ?? []);
      error = r['success'] == true ? null : r['message'];
      loading = false;
    });
  }

  Future<void> respond(Map item, bool accept) async {
    final r =
        await ApiService.respondToFamilyRequest(item['id'] as int, accept);
    if (r['success'] == true) load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('My Family')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                const Text(
                    'Family records are separate. Access requests require the member’s approval.',
                    style: TextStyle(color: Colors.black54)),
                const SizedBox(height: 12),
                if (error != null) Text(error!),
                if (members.isEmpty)
                  const Card(
                      child: Padding(
                          padding: EdgeInsets.all(18),
                          child: Text(
                              'No authorized family profiles yet. Add an existing patient account through the secure family API.'))),
                ...members.map((m) => Card(
                    child: ListTile(
                        leading: const CircleAvatar(child: Icon(Icons.person)),
                        title: Text(m['name'] ?? 'Family member'),
                        subtitle: Text(
                            '${m['relationship']} · ${m['permission']} · ${m['status']}'),
                        trailing: m['status'] == 'PENDING'
                            ? Wrap(children: [
                                IconButton(
                                    onPressed: () => respond(
                                        Map<String, dynamic>.from(m), true),
                                    icon: const Icon(Icons.check,
                                        color: AppColors.success)),
                                IconButton(
                                    onPressed: () => respond(
                                        Map<String, dynamic>.from(m), false),
                                    icon: const Icon(Icons.close,
                                        color: AppColors.error))
                              ])
                            : null)))
              ])));
}
