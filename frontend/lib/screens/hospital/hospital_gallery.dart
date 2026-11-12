import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:hospital_resource_management/theme/app_colors.dart';
import 'dart:typed_data';
import '../../services/api_service.dart';

class HospitalGallery extends StatefulWidget {
  const HospitalGallery({super.key});

  @override
  State<HospitalGallery> createState() => _HospitalGalleryState();
}

class _HospitalGalleryState extends State<HospitalGallery> {
  static const _categories = <String, String>{
    'exterior': 'Exterior and building',
    'entrance': 'Entrance and reception',
    'emergency': 'Emergency department',
    'ward': 'General wards',
    'icu': 'ICU and critical care',
    'laboratory': 'Laboratory and diagnostics',
    'pharmacy': 'Pharmacy',
    'other': 'Other facilities',
  };

  final _captionController = TextEditingController();
  late Future<Map<String, dynamic>> _galleryFuture;
  List<PlatformFile> _selectedFiles = [];
  String _selectedCategory = 'other';
  bool _uploading = false;
  int _uploadedCount = 0;
  int _maxPhotos = 100;
  final Map<int, Future<Uint8List?>> _previewFutures = {};

  Future<Uint8List?> _loadPreview(int photoId) => _previewFutures.putIfAbsent(
      photoId, () => ApiService.getManagedHospitalPhotoBytes(photoId));

  @override
  void initState() {
    super.initState();
    _galleryFuture = _loadGallery();
  }

  @override
  void dispose() {
    _captionController.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _loadGallery() async {
    final result = await ApiService.getManagedHospitalPhotos();
    if (result['success'] == true) {
      final maxPhotos = result['max_photos'];
      if (maxPhotos is num) _maxPhotos = maxPhotos.toInt();
    }
    return result;
  }

  Future<void> _refresh() async {
    setState(() {
      _galleryFuture = _loadGallery();
    });
    await _galleryFuture;
  }

  Future<void> _pickPhotos() async {
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.image,
        allowMultiple: true,
        withData: true,
      );
      if (!mounted || result == null) return;
      final selected =
          result.files.where((file) => file.bytes != null).take(10).toList();
      final tooLarge =
          selected.where((file) => file.size > 8 * 1024 * 1024).toList();
      if (tooLarge.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Each photo must be 8 MB or smaller.')));
      }
      setState(() => _selectedFiles =
          selected.where((file) => file.size <= 8 * 1024 * 1024).toList());
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Could not open the photo picker. Please try again.')));
      }
    }
  }

  Future<void> _uploadSelected() async {
    if (_selectedFiles.isEmpty || _uploading) return;
    setState(() {
      _uploading = true;
      _uploadedCount = 0;
    });
    var failed = 0;
    for (final file in _selectedFiles) {
      final bytes = file.bytes;
      if (bytes == null) {
        failed++;
        continue;
      }
      final result = await ApiService.uploadHospitalPhoto(
        bytes: bytes,
        caption: _captionController.text.trim(),
        category: _selectedCategory,
      );
      if (result['success'] != true) failed++;
      if (!mounted) return;
      setState(() => _uploadedCount++);
    }
    if (!mounted) return;
    setState(() {
      _uploading = false;
      _selectedFiles = [];
    });
    _captionController.clear();
    await _refresh();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(failed == 0
            ? 'Photos uploaded as unpublished drafts.'
            : '$failed photo(s) could not be uploaded.'),
      ));
    }
  }

  Future<void> _replacePhoto(int photoId) async {
    final result =
        await FilePicker.pickFiles(type: FileType.image, withData: true);
    final bytes = result != null && result.files.isNotEmpty
        ? result.files.first.bytes
        : null;
    if (bytes == null || !mounted) return;
    if (bytes.lengthInBytes > 8 * 1024 * 1024) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('The replacement photo must be 8 MB or smaller.')));
      return;
    }
    final response =
        await ApiService.replaceHospitalPhoto(photoId: photoId, bytes: bytes);
    if (!mounted) return;
    if (response['success'] == true) {
      _previewFutures.remove(photoId);
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Photo replaced.')));
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              response['message']?.toString() ?? 'Could not replace photo.')));
    }
  }

  Future<void> _editPhoto(Map<String, dynamic> photo) async {
    final caption =
        TextEditingController(text: photo['caption']?.toString() ?? '');
    var category = _categories.containsKey(photo['category'])
        ? photo['category'] as String
        : 'other';
    final changes = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
          builder: (dialogContext, setDialogState) => AlertDialog(
                title: const Text('Edit photo details'),
                content: Column(mainAxisSize: MainAxisSize.min, children: [
                  TextField(
                      controller: caption,
                      maxLength: 200,
                      decoration: const InputDecoration(labelText: 'Caption')),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: category,
                    decoration:
                        const InputDecoration(labelText: 'Facility category'),
                    items: _categories.entries
                        .map((entry) => DropdownMenuItem(
                            value: entry.key, child: Text(entry.value)))
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setDialogState(() => category = value);
                      }
                    },
                  ),
                ]),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(dialogContext, {
                            'caption': caption.text.trim(),
                            'category': category
                          }),
                      child: const Text('Save')),
                ],
              )),
    );
    caption.dispose();
    if (changes == null || !mounted) return;
    final response =
        await ApiService.updateHospitalPhoto(photo['id'] as int, changes);
    if (response['success'] == true) await _refresh();
    if (mounted && response['success'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              response['message']?.toString() ?? 'Could not update photo.')));
    }
  }

  Future<void> _togglePhoto(
      Map<String, dynamic> photo, String field, bool value) async {
    final response = await ApiService.updateHospitalPhoto(
        photo['id'] as int, {field: value});
    if (response['success'] == true) {
      await _refresh();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              response['message']?.toString() ?? 'Could not update photo.')));
    }
  }

  Future<void> _deletePhoto(Map<String, dynamic> photo) async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('Delete this photo?'),
              content: const Text(
                  'The photo will be removed from your hospital gallery.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Keep photo')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Delete'))
              ],
            ));
    if (confirmed != true || !mounted) return;
    final response = await ApiService.deleteHospitalPhoto(photo['id'] as int);
    if (response['success'] == true) {
      await _refresh();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              response['message']?.toString() ?? 'Could not delete photo.')));
    }
  }

  Future<void> _movePhoto(
      List<Map<String, dynamic>> photos, int index, int offset) async {
    final target = index + offset;
    if (target < 0 || target >= photos.length) return;
    final reordered = [...photos];
    final photo = reordered.removeAt(index);
    reordered.insert(target, photo);
    final response = await ApiService.reorderHospitalPhotos(
        reordered.map((item) => item['id'] as int).toList());
    if (response['success'] == true) {
      await _refresh();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              response['message']?.toString() ?? 'Could not reorder photos.')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Hospital photo gallery'), actions: [
          IconButton(
              tooltip: 'Refresh gallery',
              onPressed: _refresh,
              icon: const Icon(Icons.refresh))
        ]),
        body: FutureBuilder<Map<String, dynamic>>(
          future: _galleryFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            final result = snapshot.data;
            if (result?['success'] != true) {
              return Center(
                  child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.cloud_off_outlined, size: 42),
                        const SizedBox(height: 8),
                        Text(result?['message']?.toString() ??
                            'Unable to load your gallery.'),
                        const SizedBox(height: 8),
                        FilledButton.icon(
                            onPressed: _refresh,
                            icon: const Icon(Icons.refresh),
                            label: const Text('Retry')),
                      ])));
            }
            final photos = List<Map<String, dynamic>>.from(
                (result!['data'] as List)
                    .whereType<Map>()
                    .map((item) => Map<String, dynamic>.from(item)));
            return LayoutBuilder(builder: (context, constraints) {
              final wide = constraints.maxWidth >= 760;
              return ListView(
                  padding: EdgeInsets.all(wide ? 24 : 14),
                  children: [
                    _buildUploadCard(photos.length),
                    const SizedBox(height: 20),
                    Row(children: [
                      Expanded(
                          child: Text(
                              'Your photos (${photos.length}/$_maxPhotos)',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.bold))),
                      if (photos.isNotEmpty)
                        const Tooltip(
                            message: 'Patients only see published photos.',
                            child: Icon(Icons.info_outline)),
                    ]),
                    const SizedBox(height: 10),
                    if (photos.isEmpty)
                      const Card(
                          child: Padding(
                              padding: EdgeInsets.all(24),
                              child: Column(children: [
                                Icon(Icons.add_photo_alternate_outlined,
                                    size: 38),
                                SizedBox(height: 8),
                                Text(
                                    'No photos yet. Add facility images and publish them when they are ready.')
                              ]))),
                    if (photos.isNotEmpty)
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: photos.length,
                        gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                            maxCrossAxisExtent: wide ? 320 : 260,
                            mainAxisExtent: 365,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12),
                        itemBuilder: (context, index) =>
                            _buildPhotoCard(photos, index),
                      ),
                  ]);
            });
          },
        ),
      );

  Widget _buildUploadCard(int currentCount) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Add hospital photos',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text(
                'Photos are processed securely and stay unpublished until you publish them.'),
            const SizedBox(height: 12),
            Wrap(
                spacing: 10,
                runSpacing: 10,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  OutlinedButton.icon(
                      onPressed: _uploading || currentCount >= _maxPhotos
                          ? null
                          : _pickPhotos,
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Choose photos')),
                  SizedBox(
                      width: 240,
                      child: DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _selectedCategory,
                        decoration: const InputDecoration(
                            labelText: 'Category', isDense: true),
                        items: _categories.entries
                            .map((entry) => DropdownMenuItem(
                                value: entry.key,
                                child: Text(entry.value,
                                    overflow: TextOverflow.ellipsis)))
                            .toList(),
                        onChanged: _uploading
                            ? null
                            : (value) {
                                if (value != null) {
                                  setState(() => _selectedCategory = value);
                                }
                              },
                      )),
                  SizedBox(
                      width: 240,
                      child: TextField(
                          controller: _captionController,
                          maxLength: 200,
                          decoration: const InputDecoration(
                              labelText: 'Caption (optional)',
                              counterText: '',
                              isDense: true))),
                  FilledButton.icon(
                      onPressed: _selectedFiles.isEmpty || _uploading
                          ? null
                          : _uploadSelected,
                      icon: const Icon(Icons.cloud_upload_outlined),
                      label: const Text('Upload drafts')),
                ]),
            if (_selectedFiles.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                  '${_selectedFiles.length} photo(s) selected · maximum 10 per batch'),
              const SizedBox(height: 8),
              SizedBox(
                  height: 115,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _selectedFiles.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final bytes = _selectedFiles[index].bytes;
                      return ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: bytes == null
                              ? const SizedBox(
                                  width: 150,
                                  child: Icon(Icons.broken_image_outlined))
                              : Image.memory(bytes,
                                  width: 150,
                                  height: 115,
                                  fit: BoxFit.cover,
                                  semanticLabel:
                                      'Selected photo preview ${index + 1}'));
                    },
                  )),
            ],
            if (_uploading) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(
                  value: _selectedFiles.isEmpty
                      ? null
                      : _uploadedCount / _selectedFiles.length),
              const SizedBox(height: 4),
              Text(
                  'Uploading ${_uploadedCount + 1} of ${_selectedFiles.length}…'),
            ],
          ]),
        ),
      );

  Widget _buildPhotoCard(List<Map<String, dynamic>> photos, int index) {
    final photo = photos[index];
    final photoId = photo['id'] as int;
    final category = _categories[photo['category']] ?? _categories['other']!;
    final caption = photo['caption']?.toString() ?? '';
    final published = photo['is_published'] == true;
    final isCover = photo['is_cover'] == true;
    return Card(
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
              child: Stack(fit: StackFit.expand, children: [
            FutureBuilder<Uint8List?>(
              future: _loadPreview(photoId),
              builder: (context, snapshot) {
                final bytes = snapshot.data;
                if (bytes != null) {
                  return Image.memory(bytes,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const ColoredBox(
                          color: Color(0xFFEAF0F2),
                          child: Center(
                              child: Icon(Icons.broken_image_outlined,
                                  size: 40))));
                }
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                      child: CircularProgressIndicator(strokeWidth: 2));
                }
                return const ColoredBox(
                    color: Color(0xFFEAF0F2),
                    child: Center(
                        child: Icon(Icons.broken_image_outlined, size: 40)));
              },
            ),
            if (isCover)
              const Positioned(
                  top: 8,
                  left: 8,
                  child: Chip(
                      avatar: Icon(Icons.star, size: 16),
                      label: Text('Cover'))),
            Positioned(
                top: 4,
                right: 4,
                child: IconButton.filledTonal(
                    tooltip: 'Replace photo',
                    onPressed: () => _replacePhoto(photoId),
                    icon: const Icon(Icons.swap_horiz))),
          ])),
          Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 8, 0),
              child: Text(caption.isEmpty ? category : caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600))),
          Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 8, 0),
              child:
                  Text(category, style: Theme.of(context).textTheme.bodySmall)),
          SwitchListTile(
            dense: true,
            contentPadding: const EdgeInsets.only(left: 8, right: 6),
            title: Text(published ? 'Published' : 'Unpublished',
                style: const TextStyle(fontSize: 13)),
            value: published,
            onChanged: (value) => _togglePhoto(photo, 'is_published', value),
          ),
          Padding(
              padding: const EdgeInsets.fromLTRB(6, 0, 6, 6),
              child: Row(children: [
                IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints.tightFor(width: 36, height: 36),
                    tooltip: 'Move photo earlier',
                    onPressed:
                        index == 0 ? null : () => _movePhoto(photos, index, -1),
                    icon: const Icon(Icons.arrow_upward)),
                IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints.tightFor(width: 36, height: 36),
                    tooltip: 'Move photo later',
                    onPressed: index == photos.length - 1
                        ? null
                        : () => _movePhoto(photos, index, 1),
                    icon: const Icon(Icons.arrow_downward)),
                IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints.tightFor(width: 36, height: 36),
                    tooltip: 'Edit caption and category',
                    onPressed: () => _editPhoto(photo),
                    icon: const Icon(Icons.edit_outlined)),
                IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints.tightFor(width: 36, height: 36),
                    tooltip:
                        isCover ? 'Current cover photo' : 'Make cover photo',
                    onPressed: isCover
                        ? null
                        : () => _togglePhoto(photo, 'is_cover', true),
                    icon: Icon(isCover ? Icons.star : Icons.star_outline)),
                const Spacer(),
                IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints.tightFor(width: 36, height: 36),
                    tooltip: 'Delete photo',
                    onPressed: () => _deletePhoto(photo),
                    color: AppColors.error,
                    icon: const Icon(Icons.delete_outline)),
              ])),
        ]));
  }
}
