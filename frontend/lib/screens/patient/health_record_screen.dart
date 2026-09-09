import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class HealthRecordScreen extends StatefulWidget {
  const HealthRecordScreen({super.key});
  @override
  State<HealthRecordScreen> createState() => _HealthRecordScreenState();
}

class _HealthRecordScreenState extends State<HealthRecordScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _records = [];
  String _type = '';
  String _search = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    final status = await ApiService.getMedicalOnboardingStatus();
    final rawId = status['data']?['patient_id'];
    if (rawId == null) { if (mounted) setState(() { _loading = false; _error = status['message'] ?? 'Unable to load health records'; }); return; }
    final patientId = rawId is num ? rawId.toInt() : int.parse('$rawId');
    final result = await ApiService.getMedicalTimeline(patientId,
        type: _type.isEmpty ? null : _type, search: _search.isEmpty ? null : _search);
    if (!mounted) return;
    setState(() { _records = result['success'] == true ? List<dynamic>.from(result['data'] ?? []) : []; _error = result['success'] == true ? null : result['message']; _loading = false; });
  }

  Future<void> _add() async {
    final record = await showModalBottomSheet<Map<String, dynamic>>(context: context, isScrollControlled: true, builder: (_) => const _AddRecordSheet());
    if (record == null) return;
    final result = await ApiService.createMedicalRecord(record);
    if (!mounted) return;
    if (result['success'] == true) {
      await _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result['message'] ?? 'Could not save record')),
      );
    }
  }

  Future<void> _remove(int id) async { if ((await ApiService.removeHealthRecord(id))['success'] == true) await _load(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Health Record'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      floatingActionButton: FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add), label: const Text('Add Health Record')),
      body: _loading ? const Center(child: CircularProgressIndicator()) : _error != null ? Center(child: Text(_error!)) : Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 4), child: TextField(
          onChanged: (value) { _search = value.trim(); _load(); },
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search health records'),
        )),
        SingleChildScrollView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), child: Row(children: ['', 'CONSULTATION', 'PRESCRIPTION', 'LAB_RESULT', 'MEDICATION', 'BLOOD_PRESSURE', 'BLOOD_SUGAR', 'WEIGHT'].map((type) => Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(type.isEmpty ? 'All' : type.replaceAll('_', ' ')), selected: _type == type, onSelected: (_) { setState(() => _type = type); _load(); }))).toList())),
        Expanded(child: _records.isEmpty ? Center(child: ElevatedButton.icon(onPressed: _add, icon: const Icon(Icons.add), label: const Text('Add Health Record'))) : RefreshIndicator(
        onRefresh: _load,
        child: ListView.builder(padding: const EdgeInsets.all(16), itemCount: _records.length, itemBuilder: (_, index) {
          final record = Map<String, dynamic>.from(_records[index]);
          final details = record['details'] is Map ? Map<String, dynamic>.from(record['details']) : <String, dynamic>{};
          final notes = details['notes']?.toString();
          return Card(child: ListTile(
            leading: const Icon(Icons.health_and_safety),
            title: Text(record['title'] ?? 'Health record'),
            subtitle: Text('${record['record_type']} • ${record['record_date']}\nPatient Provided • ${record['verification_status'] == 'VERIFIED' ? 'Verified' : 'Not verified'}${notes == null || notes.isEmpty ? '' : '\n$notes'}'),
            isThreeLine: true,
            trailing: PopupMenuButton<String>(onSelected: (value) { if (value == 'remove') _remove((record['id'] as num).toInt()); }, itemBuilder: (_) => const [PopupMenuItem(value: 'remove', child: Text('Remove'))]),
          ));
        }),
      ))]),
    );
  }
}

class _AddRecordSheet extends StatefulWidget { const _AddRecordSheet(); @override State<_AddRecordSheet> createState() => _AddRecordSheetState(); }
class _AddRecordSheetState extends State<_AddRecordSheet> {
  String _type = 'BLOOD_PRESSURE';
  final _title = TextEditingController(); final _notes = TextEditingController(); final _value = TextEditingController(); DateTime _date = DateTime.now();
  static const types = {'BLOOD_PRESSURE':'Blood Pressure','BLOOD_SUGAR':'Blood Sugar','WEIGHT':'Weight','CONDITION':'Medical Condition','ALLERGY':'Allergy','SURGERY':'Surgery','MEDICATION':'Medication','HOSPITALIZATION':'Hospitalization','VACCINATION':'Vaccination','LAB_RESULT':'Lab Result','DOCUMENT':'Medical Document','OTHER':'Other'};
  @override Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
    child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Text('Add Health Record', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)), const SizedBox(height: 16),
      DropdownButtonFormField<String>(initialValue: _type, items: types.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(), onChanged: (v) => setState(() => _type = v!)),
      TextField(controller: _title, decoration: const InputDecoration(labelText: 'Title / condition / medicine name')),
      TextField(controller: _value, decoration: const InputDecoration(labelText: 'Reading or value (optional)')),
      TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Notes'), maxLines: 2), const SizedBox(height: 12),
      Row(children: [Text('${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}'), const Spacer(), TextButton(onPressed: () async { final date = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(1900), lastDate: DateTime.now()); if (date != null) setState(() => _date = date); }, child: const Text('Change date'))]),
      SizedBox(width: double.infinity, child: ElevatedButton(onPressed: () { if (_title.text.trim().isEmpty) return; Navigator.pop(context, {'record_type': _type, 'title': _title.text.trim(), 'record_date': '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}', 'details': {'value': _value.text.trim(), 'notes': _notes.text.trim()}}); }, child: const Text('Save to Health Record'))),
    ])),
  );
}
