// lib/models/message_model.dart
class Message {
  String text;
  final bool isUser;
  final DateTime timestamp;
  bool isTyping;

  Message({
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.isTyping = false,
  });
}