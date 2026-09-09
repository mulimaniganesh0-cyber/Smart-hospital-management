import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../services/notification_router.dart';

class NotificationCenterButton extends StatefulWidget {
  const NotificationCenterButton({super.key});

  @override
  State<NotificationCenterButton> createState() => _NotificationCenterButtonState();
}

class _NotificationCenterButtonState extends State<NotificationCenterButton> {
  List<Map<String, dynamic>> _items = [];
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
    _listen();
  }

  Future<void> _listen() async {
    final socket = SocketService.instance;
    await socket.connect();
    if (!mounted) return;
    socket.onNotificationNew((event) {
      if (!mounted || event is! Map) return;
      final item = Map<String, dynamic>.from(event);
      setState(() {
        _items = [item, ..._items.where((existing) => existing['id'] != item['id'])];
        _unread = _items.where((existing) => existing['is_read'] != true).length;
      });
      if (item['priority'] == 'critical') {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
          content: Text(item['title']?.toString() ?? 'Critical alert'),
          backgroundColor: Colors.red.shade700,
          action: SnackBarAction(
            label: 'VIEW',
            textColor: Colors.white,
            onPressed: () => NotificationRouter.open(context, item),
          ),
        ));
      }
    });
    socket.onNotificationRead((event) {
      if (!mounted || event is! Map) return;
      final id = event['id'];
      setState(() { for (final item in _items) { if (item['id'] == id) item['is_read'] = true; } _unread = _items.where((item) => item['is_read'] != true).length; });
    });
    socket.onReconnect((_) => _load());
  }

  Future<void> _load() async {
    final response = await ApiService.getNotifications();
    if (!mounted || response['success'] != true) return;
    final items = List<Map<String, dynamic>>.from(response['data'] ?? []);
    setState(() { _items = items; _unread = response['unread_count'] as int? ?? items.where((item) => item['is_read'] != true).length; });
  }

  IconData _icon(Map<String, dynamic> item) {
    switch (item['type']) { case 'sos': return Icons.emergency; case 'ambulance_booking': case 'ambulance_status': return Icons.local_taxi; case 'resource_request': return Icons.bed; default: return Icons.notifications; }
  }

  Future<void> _open() async {
    await showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (sheetContext) => FractionallySizedBox(heightFactor: .8, child: Scaffold(appBar: AppBar(title: const Text('Notifications')), body: RefreshIndicator(onRefresh: _load, child: _items.isEmpty ? ListView(children: const [SizedBox(height: 260), Center(child: Text('No notifications'))]) : ListView.separated(itemCount: _items.length, separatorBuilder: (_, __) => const Divider(height: 1), itemBuilder: (_, index) { final item = _items[index]; final unread = item['is_read'] != true; return ListTile(leading: Icon(_icon(item), color: item['priority'] == 'critical' ? Colors.red : null), title: Text(item['title'] ?? 'Notification', style: TextStyle(fontWeight: unread ? FontWeight.bold : FontWeight.normal)), subtitle: Text(item['message'] ?? ''), trailing: unread ? const Icon(Icons.circle, color: Colors.red, size: 10) : null, onTap: () async { if (unread) { await ApiService.markNotificationRead(item['id'] as int); await _load(); } if (sheetContext.mounted) Navigator.of(sheetContext).pop(); if (mounted) await NotificationRouter.open(context, item); }); })))));
  }

  @override
  Widget build(BuildContext context) => Stack(clipBehavior: Clip.none, children: [IconButton(onPressed: _open, tooltip: 'Notifications', icon: const Icon(Icons.notifications_outlined)), if (_unread > 0) Positioned(right: 5, top: 5, child: Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1), decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle), child: Text(_unread > 99 ? '99+' : '$_unread', style: const TextStyle(color: Colors.white, fontSize: 10)) ))]);
}
