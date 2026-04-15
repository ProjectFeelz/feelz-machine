import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Upload, 
  Folder,
  Copy,
  Trash2,
  Check,
  X,
  Loader,
  Plus,
  Save,
  FolderPlus,
  File,
  Music,
  Image as ImageIcon,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Edit,
  Search
} from 'lucide-react';

// ============================================
// DROPDOWN CONSTANTS - NEW!
// ============================================
const KEYS = [
  'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B',
  'Cm', 'C#m/Dbm', 'Dm', 'D#m/Ebm', 'Em', 'Fm', 'F#m/Gbm', 'Gm', 'G#m/Abm', 'Am', 'A#m/Bbm', 'Bm',
  'Other'
];

const GENRES = [
  'Hip Hop', 'Trap', 'Drill', 'Boom Bap', 'Lo-Fi', 'R&B', 'Neo Soul', 'Pop',
  'Electronic', 'House', 'Deep House', 'Tech House', 'Techno', 'Dubstep',
  'Drum & Bass', 'Ambient', 'Downtempo', 'Future Bass', 'Jersey Club',
  'Jazz', 'Funk', 'Soul', 'Rock', 'Metal', 'Indie', 'Alternative',
  'Afrobeat', 'Amapiano', 'Reggae', 'Dancehall', 'Latin', 'Reggaeton',
  'Country', 'EDM', 'Trance', 'Hardstyle', 'UK Garage', 'Grime',
  'Experimental', 'Vaporwave', 'Synthwave', 'Other'
];

const MOODS = [
  'Dark', 'Happy', 'Sad', 'Aggressive', 'Chill', 'Energetic', 'Melancholic',
  'Uplifting', 'Mysterious', 'Peaceful', 'Intense', 'Dreamy', 'Romantic',
  'Angry', 'Hopeful', 'Nostalgic', 'Epic', 'Smooth', 'Bouncy', 'Atmospheric',
  'Moody', 'Vibey', 'Hard', 'Soft', 'Ethereal', 'Groovy', 'Other'
];

const STEM_TYPES = [
  'Drums', 'Drum Loop', 'Kick', 'Snare', 'Hi-Hats', 'Percussion',
  'Bass', '808', 'Sub Bass', 'Bassline',
  'Melody', 'Lead', 'Chords', 'Piano', 'Guitar', 'Keys',
  'Synth', 'Pad', 'Arp', 'Pluck',
  'Vocals', 'Vocal Chops', 'Ad-Libs',
  'Strings', 'Brass', 'FX', 'Ambient', 'Texture',
  'Other'
];

function AdminUploadPanel({ user, adminLevel = 3 }) {
  const [activeTab, setActiveTab] = useState('upload');
  const [collections, setCollections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [samples, setSamples] = useState([]);
  const [filteredSamples, setFilteredSamples] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editThumbnailFile, setEditThumbnailFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Upload form state
  const [uploadMode, setUploadMode] = useState('single');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [batchPacks, setBatchPacks] = useState([]);

  // Single pack form
  const [packForm, setPackForm] = useState({
    name: '',
    artist: '',
    bpm: '',
    key: '',
    genre: '',
    mood: '',
    main_loop_file: null,
    cover_image_file: null,
    has_stems: false,
    featured: false
  });

  // Custom inputs for "Other" options - NEW!
  const [customKey, setCustomKey] = useState('');
  const [customGenre, setCustomGenre] = useState('');
  const [customMood, setCustomMood] = useState('');

  // Flexible stem files - NEW! (not hardcoded to 5 types)
  const [stemFiles, setStemFiles] = useState([]);

  // Collection form
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    description: '',
    cover_image_file: null,
    is_public: true,
    youtube_url: ''  // ✅ ADD THIS LINE
  });

  // Template form
  const [templateForm, setTemplateForm] = useState({
    name: '',
    artist: '',
    genre: '',
    mood: '',
    bpm_min: '',
    bpm_max: ''
  });

  useEffect(() => {
    if (adminLevel === 3) {
      fetchData();
    }
  }, [adminLevel]);

  useEffect(() => {
    if (activeTab === 'manage') {
      fetchSamples();
    }
  }, [activeTab]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredSamples(
        samples.filter(s => 
          s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.genre?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredSamples(samples);
    }
  }, [searchTerm, samples]);

  const fetchData = async () => {
    const { data: collectionsData } = await supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: false });
    setCollections(collectionsData || []);

    const { data: templatesData } = await supabase
      .from('upload_templates')
      .select('*')
      .order('created_at', { ascending: false });
    setTemplates(templatesData || []);
  };

  const fetchSamples = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('samples')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setSamples(data || []);
      setFilteredSamples(data || []);
    }
    setLoading(false);
  };

  const uploadFileToStorage = async (file, bucket, folder = '') => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSinglePackSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUploading(true);

    try {
      if (!packForm.main_loop_file) {
        throw new Error('Main loop file is required');
      }

      showMessage('info', 'Uploading audio file...');
      const mainLoopUrl = await uploadFileToStorage(
        packForm.main_loop_file, 
        'feelz-samples',
        'loops/'
      );

      let coverImageUrl = null;
      if (packForm.cover_image_file) {
        showMessage('info', 'Uploading cover image...');
        coverImageUrl = await uploadFileToStorage(
          packForm.cover_image_file,
          'feelz-samples',
          'covers/'
        );
      }

      let detectedBpm = packForm.bpm;
      if (!detectedBpm) {
        const bpmMatch = packForm.main_loop_file.name.match(/(\d{2,3})[\-_\s]?bpm|bpm[\-_\s]?(\d{2,3})/i);
        if (bpmMatch) {
          detectedBpm = bpmMatch[1] || bpmMatch[2];
          showMessage('success', `Auto-detected BPM: ${detectedBpm}`);
        }
      }

      showMessage('info', 'Saving to database...');
      const packData = {
        name: packForm.name,
        artist: packForm.artist,
        bpm: parseInt(detectedBpm) || null,
        key: packForm.key,
        genre: packForm.genre,
        mood: packForm.mood,
        main_loop_url: mainLoopUrl,
        file_url: mainLoopUrl,
        thumbnail_url: coverImageUrl,
        collection_id: selectedCollection || null,
        has_stems: packForm.has_stems,
        featured: packForm.featured,
        is_pack: true,
        plays: 0
      };

      const { data, error } = await supabase
        .from('samples')
        .insert([packData])
        .select();

      if (error) throw error;

      const sampleId = data[0].id;

      // Upload stems if any - NEW flexible system!
      if (packForm.has_stems && stemFiles.length > 0) {
        let stemCount = 0;
        for (const stem of stemFiles) {
          if (stem.file) {
            stemCount++;
            showMessage('info', `Uploading ${stem.name} stem...`);
            
            const stemUrl = await uploadFileToStorage(
              stem.file,
              'feelz-samples',
              'stems/'
            );

            await supabase
              .from('sample_stems')
              .insert([{
                sample_id: sampleId,
                name: stem.name,
                stem_type: stem.stem_type,
                file_url: stemUrl,
                order_index: stemCount
              }]);
          }
        }

        if (stemCount > 0) {
          showMessage('success', `✓ Uploaded ${stemCount} stems!`);
        }
      }

      showMessage('success', '✓ Sample pack uploaded successfully!');
      resetPackForm();
    } catch (error) {
      console.error('Upload error:', error);
      showMessage('error', 'Upload failed: ' + error.message);
    }

    setLoading(false);
    setUploading(false);
  };

  const addPackToBatch = () => {
  if (!packForm.main_loop_file) {
    showMessage('error', 'Main loop file is required');
    return;
  }

  // ✅ FIX: Explicitly create new object to avoid shared file references
  const newPack = {
    id: Date.now(),
    name: packForm.name,
    artist: packForm.artist,
    bpm: packForm.bpm,
    key: packForm.key,
    genre: packForm.genre,
    mood: packForm.mood,
    main_loop_file: packForm.main_loop_file,
    cover_image_file: packForm.cover_image_file, // Creates NEW reference per pack
    has_stems: packForm.has_stems,
    featured: packForm.featured,
    stems: [...stemFiles],
    collection_id: selectedCollection || null
  };
  setBatchPacks([...batchPacks, newPack]);
  resetPackForm();
  showMessage('success', 'Pack added to batch!');
};

  const removeFromBatch = (id) => {
    setBatchPacks(batchPacks.filter(p => p.id !== id));
  };

  const duplicatePack = (pack) => {
    const newPack = {
      ...pack,
      id: Date.now(),
      name: pack.name + ' (Copy)'
    };
    setBatchPacks([...batchPacks, newPack]);
    showMessage('success', 'Pack duplicated!');
  };

  const handleBatchSubmit = async () => {
    if (batchPacks.length === 0) {
      showMessage('error', 'No packs in batch to upload');
      return;
    }

    setLoading(true);
    setUploading(true);

    try {
      for (let i = 0; i < batchPacks.length; i++) {
        const pack = batchPacks[i];
        showMessage('info', `Uploading pack ${i + 1} of ${batchPacks.length}...`);

        const mainLoopUrl = await uploadFileToStorage(
          pack.main_loop_file,
          'feelz-samples',
          'loops/'
        );

        let coverImageUrl = null;
        if (pack.cover_image_file) {
          coverImageUrl = await uploadFileToStorage(
            pack.cover_image_file,
            'feelz-samples',
            'covers/'
          );
        }

        let bpm = pack.bpm;
        if (!bpm) {
          const bpmMatch = pack.main_loop_file.name.match(/(\d{2,3})[\-_\s]?bpm|bpm[\-_\s]?(\d{2,3})/i);
          if (bpmMatch) {
            bpm = bpmMatch[1] || bpmMatch[2];
          }
        }

        const { data: sampleData, error: sampleError } = await supabase
          .from('samples')
          .insert([{
            name: pack.name,
            artist: pack.artist,
            bpm: parseInt(bpm) || null,
            key: pack.key,
            genre: pack.genre,
            mood: pack.mood,
            main_loop_url: mainLoopUrl,
            file_url: mainLoopUrl,
            thumbnail_url: coverImageUrl,
            collection_id: pack.collection_id,
            has_stems: pack.has_stems,
            featured: pack.featured,
            is_pack: true,
            plays: 0
          }])
          .select();

        if (sampleError) throw sampleError;

        // Upload stems for this pack
        if (pack.has_stems && pack.stems && pack.stems.length > 0) {
          const sampleId = sampleData[0].id;
          for (const stem of pack.stems) {
            if (stem.file) {
              const stemUrl = await uploadFileToStorage(
                stem.file,
                'feelz-samples',
                'stems/'
              );

              await supabase
                .from('sample_stems')
                .insert([{
                  sample_id: sampleId,
                  name: stem.name,
                  stem_type: stem.stem_type,
                  file_url: stemUrl,
                  order_index: pack.stems.indexOf(stem)
                }]);
            }
          }
        }
      }

      showMessage('success', `✓ ${batchPacks.length} packs uploaded successfully!`);
      setBatchPacks([]);
    } catch (error) {
      console.error('Batch upload error:', error);
      showMessage('error', 'Batch upload failed: ' + error.message);
    }

    setLoading(false);
    setUploading(false);
  };

  const applyTemplate = (template) => {
    setPackForm({
      ...packForm,
      artist: template.artist || '',
      genre: template.genre || '',
      mood: template.mood || '',
      bpm: template.bpm_min || ''
    });
    showMessage('success', 'Template applied!');
  };

  const handleSaveTemplate = async (e) => {
  e.preventDefault();
  setLoading(true);

  try {
    const { error } = await supabase
      .from('upload_templates')  // ✅ CORRECT TABLE
      .insert([{
        ...templateForm,
        bpm_min: parseInt(templateForm.bpm_min) || null,
        bpm_max: parseInt(templateForm.bpm_max) || null,
        created_by: user.id
      }]);

    if (error) throw error;

    showMessage('success', '✓ Template saved!');
    setTemplateForm({
      name: '',
      artist: '',
      genre: '',
      mood: '',
      bpm_min: '',
      bpm_max: ''
    });
    fetchData();
  } catch (error) {
    showMessage('error', 'Failed to save template: ' + error.message);
  }

  setLoading(false);
};

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;

    try {
      const { error } = await supabase
        .from('upload_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      showMessage('success', 'Template deleted');
      fetchData();
    } catch (error) {
      showMessage('error', 'Failed to delete template');
    }
  };

  const handleSaveCollection = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUploading(true);

    try {
      let coverImageUrl = null;
      if (collectionForm.cover_image_file) {
        showMessage('info', 'Uploading collection cover...');
        coverImageUrl = await uploadFileToStorage(
          collectionForm.cover_image_file,
          'feelz-samples',
          'collection-covers/'
        );
      }

      const { error } = await supabase
        .from('collections')
        .insert([{
          name: collectionForm.name,
          description: collectionForm.description,
          cover_image_url: coverImageUrl,
          is_public: collectionForm.is_public,
          created_by: user.id
        }]);

      if (error) throw error;

      showMessage('success', '✓ Collection created!');
      setCollectionForm({
  name: '',
  description: '',
  cover_image_file: null,
  is_public: true,
  youtube_url: ''  // ✅ ADD THIS LINE
});
      fetchData();
    } catch (error) {
      showMessage('error', 'Failed to create collection: ' + error.message);
    }

    setLoading(false);
    setUploading(false);
  };

  const deleteCollection = async (id) => {
    if (!window.confirm('Delete this collection? Sample packs will not be deleted.')) return;

    try {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', id);

      if (error) throw error;

      showMessage('success', 'Collection deleted');
      fetchData();
    } catch (error) {
      showMessage('error', 'Failed to delete collection');
    }
  };

  const startEdit = (sample) => {
    setEditingId(sample.id);
    setEditForm({
      name: sample.name,
      artist: sample.artist,
      bpm: sample.bpm,
      key: sample.key,
      genre: sample.genre,
      mood: sample.mood,
      featured: sample.featured,
      current_thumbnail: sample.thumbnail_url
    });
    setEditThumbnailFile(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditThumbnailFile(null);
  };

  const saveEdit = async (id) => {
  try {
    let updateData = { ...editForm };
    delete updateData.current_thumbnail;

    // Only update thumbnail_url if a new file was uploaded
    if (editThumbnailFile) {
      showMessage('info', 'Uploading new thumbnail...');
      
      const fileExt = editThumbnailFile.name.split('.').pop();
      const fileName = `covers/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('feelz-samples')
        .upload(fileName, editThumbnailFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('feelz-samples')
        .getPublicUrl(fileName);

      updateData.thumbnail_url = publicUrl;
    } else {
      // ✅ FIX: Preserve existing thumbnail - don't include in update
      delete updateData.thumbnail_url;
    }

    const { error } = await supabase
      .from('samples')
      .update(updateData)
      .eq('id', id);

      if (error) throw error;

      showMessage('success', '✓ Pack updated!');
      setEditingId(null);
      setEditForm({});
      setEditThumbnailFile(null);
      fetchSamples();
    } catch (error) {
      showMessage('error', 'Failed to update: ' + error.message);
    }
  };

  const deletePack = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;

    try {
      const { error } = await supabase
        .from('samples')
        .delete()
        .eq('id', id);

      if (error) throw error;

      showMessage('success', 'Pack deleted');
      fetchSamples();
    } catch (error) {
      showMessage('error', 'Failed to delete: ' + error.message);
    }
  };

  const resetPackForm = () => {
    setPackForm({
      name: '',
      artist: '',
      bpm: '',
      key: '',
      genre: '',
      mood: '',
      main_loop_file: null,
      cover_image_file: null,
      has_stems: false,
      featured: false
    });
    setStemFiles([]);
    setCustomKey('');
    setCustomGenre('');
    setCustomMood('');
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // NEW! Add stem to flexible list
  const addStem = () => {
    setStemFiles([...stemFiles, { name: '', stem_type: '', file: null }]);
  };

  const removeStem = (index) => {
    setStemFiles(stemFiles.filter((_, i) => i !== index));
  };

  const updateStem = (index, field, value) => {
    const newStems = [...stemFiles];
    newStems[index][field] = value;
    setStemFiles(newStems);
  };

  return (
    <div className="space-y-6">
      {message.text && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-500/20 border border-green-500/50 text-green-300'
            : message.type === 'info'
            ? 'bg-blue-500/20 border border-blue-500/50 text-blue-300'
            : 'bg-red-500/20 border border-red-500/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-cyan-500/20 pb-2">
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 rounded-t-lg transition ${
            activeTab === 'upload'
              ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-500'
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          <Upload className="w-4 h-4 inline mr-2" />
          Upload Packs
        </button>
        <button
          onClick={() => setActiveTab('manage')}
          className={`px-4 py-2 rounded-t-lg transition ${
            activeTab === 'manage'
              ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-500'
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          <Edit className="w-4 h-4 inline mr-2" />
          Manage Packs
        </button>
        {adminLevel === 3 && (
          <>
            <button
              onClick={() => setActiveTab('collections')}
              className={`px-4 py-2 rounded-t-lg transition ${
                activeTab === 'collections'
                  ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-500'
                  : 'text-gray-400 hover:text-cyan-300'
              }`}
            >
              <Folder className="w-4 h-4 inline mr-2" />
              Collections
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 rounded-t-lg transition ${
                activeTab === 'templates'
                  ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-500'
                  : 'text-gray-400 hover:text-cyan-300'
              }`}
            >
              <Save className="w-4 h-4 inline mr-2" />
              Templates
            </button>
          </>
        )}
      </div>

      {/* UPLOAD TAB */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Upload Mode Selector */}
          <div className="flex space-x-4">
            <button
              onClick={() => setUploadMode('single')}
              className={`flex-1 py-3 px-4 rounded-lg transition ${
                uploadMode === 'single'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                  : 'bg-white/5 text-cyan-300 hover:bg-white/10'
              }`}
            >
              <File className="w-5 h-5 inline mr-2" />
              Single Upload
            </button>
            <button
              onClick={() => setUploadMode('batch')}
              className={`flex-1 py-3 px-4 rounded-lg transition ${
                uploadMode === 'batch'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                  : 'bg-white/5 text-cyan-300 hover:bg-white/10'
              }`}
            >
              <Folder className="w-5 h-5 inline mr-2" />
              Batch Upload
            </button>
          </div>

          {/* Collection & Template Selectors */}
          {adminLevel === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-cyan-300 text-sm mb-2">Collection (Optional)</label>
                <select
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                >
                  <option value="">No Collection</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-cyan-300 text-sm mb-2">Apply Template (Optional)</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => {
                    setSelectedTemplate(e.target.value);
                    const template = templates.find(t => t.id === e.target.value);
                    if (template) applyTemplate(template);
                  }}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                >
                  <option value="">No Template</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Pack Form */}
          <form onSubmit={uploadMode === 'single' ? handleSinglePackSubmit : (e) => { e.preventDefault(); addPackToBatch(); }}>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20 space-y-4">
              <h3 className="text-lg font-bold text-white mb-4">Pack Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Pack Name *</label>
                  <input
                    type="text"
                    value={packForm.name}
                    onChange={(e) => setPackForm({ ...packForm, name: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Artist *</label>
                  <input
                    type="text"
                    value={packForm.artist}
                    onChange={(e) => setPackForm({ ...packForm, artist: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">BPM (optional - auto-detects)</label>
                  <input
                    type="number"
                    value={packForm.bpm}
                    onChange={(e) => setPackForm({ ...packForm, bpm: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  />
                </div>

                {/* KEY DROPDOWN WITH OTHER - NEW! */}
                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Key *</label>
                  <select
                    value={KEYS.includes(packForm.key) ? packForm.key : 'Other'}
                    onChange={(e) => {
                      if (e.target.value === 'Other') {
                        setCustomKey('');
                        setPackForm({ ...packForm, key: '' });
                      } else {
                        setPackForm({ ...packForm, key: e.target.value });
                        setCustomKey('');
                      }
                    }}
                    required
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  >
                    <option value="">Select key...</option>
                    {KEYS.map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                  {(!KEYS.includes(packForm.key) || packForm.key === '') && (
                    <input
                      type="text"
                      value={customKey || packForm.key}
                      onChange={(e) => {
                        setCustomKey(e.target.value);
                        setPackForm({ ...packForm, key: e.target.value });
                      }}
                      placeholder="Enter custom key..."
                      className="mt-2 w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    />
                  )}
                </div>

                {/* GENRE DROPDOWN WITH OTHER - NEW! */}
                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Genre *</label>
                  <select
                    value={GENRES.includes(packForm.genre) ? packForm.genre : 'Other'}
                    onChange={(e) => {
                      if (e.target.value === 'Other') {
                        setCustomGenre('');
                        setPackForm({ ...packForm, genre: '' });
                      } else {
                        setPackForm({ ...packForm, genre: e.target.value });
                        setCustomGenre('');
                      }
                    }}
                    required
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  >
                    <option value="">Select genre...</option>
                    {GENRES.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                  {(!GENRES.includes(packForm.genre) || packForm.genre === '') && (
                    <input
                      type="text"
                      value={customGenre || packForm.genre}
                      onChange={(e) => {
                        setCustomGenre(e.target.value);
                        setPackForm({ ...packForm, genre: e.target.value });
                      }}
                      placeholder="Enter custom genre..."
                      className="mt-2 w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    />
                  )}
                </div>

                {/* MOOD DROPDOWN WITH OTHER - NEW! */}
                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Mood</label>
                  <select
                    value={MOODS.includes(packForm.mood) ? packForm.mood : 'Other'}
                    onChange={(e) => {
                      if (e.target.value === 'Other') {
                        setCustomMood('');
                        setPackForm({ ...packForm, mood: '' });
                      } else {
                        setPackForm({ ...packForm, mood: e.target.value });
                        setCustomMood('');
                      }
                    }}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  >
                    <option value="">Select mood...</option>
                    {MOODS.map(mood => (
                      <option key={mood} value={mood}>{mood}</option>
                    ))}
                  </select>
                  {(!MOODS.includes(packForm.mood) || packForm.mood === '') && (
                    <input
                      type="text"
                      value={customMood || packForm.mood}
                      onChange={(e) => {
                        setCustomMood(e.target.value);
                        setPackForm({ ...packForm, mood: e.target.value });
                      }}
                      placeholder="Enter custom mood..."
                      className="mt-2 w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">Main Loop Audio File * (.wav, .mp3)</label>
                <input
                  type="file"
                  accept=".wav,.mp3,.ogg"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                      if (file.size > 50 * 1024 * 1024) {
                        showMessage('error', `File too large (${sizeMB}MB)! Supabase free tier limit is 50MB. Please compress to MP3 or upgrade plan.`);
                        return;
                      }
                      setPackForm({ ...packForm, main_loop_file: file });
                    }
                  }}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                  required
                />
                {packForm.main_loop_file && (
                  <p className="text-cyan-400 text-sm mt-2">
                    Selected: {packForm.main_loop_file.name} ({(packForm.main_loop_file.size / (1024 * 1024)).toFixed(2)}MB)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">Cover Image (optional - .jpg, .png)</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => setPackForm({ ...packForm, cover_image_file: e.target.files[0] })}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                />
                {packForm.cover_image_file && (
                  <p className="text-cyan-400 text-sm mt-2">Selected: {packForm.cover_image_file.name}</p>
                )}
              </div>

              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 text-cyan-300">
                  <input
                    type="checkbox"
                    checked={packForm.has_stems}
                    onChange={(e) => setPackForm({ ...packForm, has_stems: e.target.checked })}
                    className="rounded"
                  />
                  <span>Has Stems</span>
                </label>

                <label className="flex items-center space-x-2 text-cyan-300">
                  <input
                    type="checkbox"
                    checked={packForm.featured}
                    onChange={(e) => setPackForm({ ...packForm, featured: e.target.checked })}
                    className="rounded"
                  />
                  <span>Featured</span>
                </label>
              </div>

              {/* FLEXIBLE STEM SYSTEM - NEW! */}
              {packForm.has_stems && (
                <div className="bg-blue-950/20 border border-cyan-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-cyan-300 font-semibold flex items-center space-x-2">
                      <Music className="w-4 h-4" />
                      <span>Upload Stems</span>
                    </h4>
                    <button
                      type="button"
                      onClick={addStem}
                      className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-sm transition flex items-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Stem</span>
                    </button>
                  </div>

                  {stemFiles.map((stem, index) => (
                    <div key={index} className="p-3 bg-blue-950/30 rounded-lg border border-cyan-500/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-cyan-400 text-sm font-semibold">Stem {index + 1}</h5>
                        <button
                          type="button"
                          onClick={() => removeStem(index)}
                          className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded transition"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-cyan-400 text-xs mb-1">Stem Name</label>
                          <input
                            type="text"
                            value={stem.name}
                            onChange={(e) => updateStem(index, 'name', e.target.value)}
                            placeholder="e.g., Drums, Bass"
                            className="w-full px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          />
                        </div>

                        {/* STEM TYPE DROPDOWN - NEW! */}
                        <div>
                          <label className="block text-cyan-400 text-xs mb-1">Stem Type</label>
                          <select
                            value={STEM_TYPES.includes(stem.stem_type) ? stem.stem_type : 'Other'}
                            onChange={(e) => {
                              if (e.target.value === 'Other') {
                                updateStem(index, 'stem_type', '');
                              } else {
                                updateStem(index, 'stem_type', e.target.value);
                              }
                            }}
                            className="w-full px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          >
                            <option value="">Select type...</option>
                            {STEM_TYPES.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                          {(!STEM_TYPES.includes(stem.stem_type) || stem.stem_type === '') && (
                            <input
                              type="text"
                              value={stem.stem_type}
                              onChange={(e) => updateStem(index, 'stem_type', e.target.value)}
                              placeholder="Custom stem type..."
                              className="mt-1 w-full px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-cyan-400 text-xs mb-1">Audio File</label>
                        <input
                          type="file"
                          accept=".wav,.mp3,.ogg"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file && file.size > 50 * 1024 * 1024) {
                              showMessage('error', 'File too large! Max 50MB.');
                              return;
                            }
                            updateStem(index, 'file', file);
                          }}
                          className="w-full text-xs px-2 py-1 bg-blue-950/50 border border-cyan-500/30 rounded text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300"
                        />
                        {stem.file && (
                          <p className="text-xs text-green-400 mt-1">✓ {stem.file.name}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {stemFiles.length === 0 && (
                    <p className="text-center text-cyan-400 text-sm py-4">No stems added yet. Click "Add Stem" to start.</p>
                  )}
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                {uploadMode === 'single' ? (
                  <button
                    type="submit"
                    disabled={loading || uploading}
                    className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2"
                  >
                    {uploading ? <Loader className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span>{uploading ? 'Uploading...' : 'Upload Pack'}</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={uploading}
                    className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add to Batch ({batchPacks.length})</span>
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Batch Queue */}
          {uploadMode === 'batch' && batchPacks.length > 0 && (
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Batch Queue ({batchPacks.length} packs)</h3>
                <button
                  onClick={handleBatchSubmit}
                  disabled={loading || uploading}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center space-x-2"
                >
                  {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploading ? 'Uploading...' : 'Upload All'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {batchPacks.map((pack) => (
                  <div key={pack.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex-1">
                      <p className="font-semibold text-white">{pack.name}</p>
                      <p className="text-sm text-cyan-400">{pack.artist} • {pack.bpm || 'Auto'} BPM • {pack.key}</p>
                      <p className="text-xs text-gray-400">{pack.main_loop_file?.name}</p>
                      {pack.stems && pack.stems.length > 0 && (
                        <p className="text-xs text-cyan-500">{pack.stems.length} stems</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => duplicatePack(pack)}
                        className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded transition"
                        title="Duplicate"
                        disabled={uploading}
                      >
                        <Copy className="w-4 h-4 text-blue-400" />
                      </button>
                      <button
                        onClick={() => removeFromBatch(pack.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded transition"
                        title="Remove"
                        disabled={uploading}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANAGE TAB */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div className="bg-white/5 backdrop-blur-xl rounded-lg p-4 border border-cyan-400/20">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-cyan-400" />
              <input
                type="text"
                placeholder="Search packs by name, artist, or genre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
            </div>
          ) : filteredSamples.length === 0 ? (
            <div className="text-center py-12 text-cyan-400">
              <Music className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-xl">No packs found</p>
              {searchTerm && <p className="text-sm mt-2">Try a different search term</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSamples.map((sample) => (
                <div
                  key={sample.id}
                  className="bg-white/5 backdrop-blur-xl rounded-lg p-4 border border-cyan-400/20"
                >
                  {editingId === sample.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-cyan-400 mb-1">Name</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-cyan-400 mb-1">Artist</label>
                          <input
                            type="text"
                            value={editForm.artist}
                            onChange={(e) => setEditForm({ ...editForm, artist: e.target.value })}
                            className="w-full px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-cyan-400 mb-1">BPM</label>
                          <input
                            type="number"
                            value={editForm.bpm}
                            onChange={(e) => setEditForm({ ...editForm, bpm: e.target.value })}
                            className="w-full px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-cyan-400 mb-1">Key</label>
                          <input
                            type="text"
                            value={editForm.key}
                            onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                            className="w-full px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-cyan-400 mb-1">Genre</label>
                          <input
                            type="text"
                            value={editForm.genre}
                            onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                            className="w-full px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-cyan-400 mb-1">Mood</label>
                          <input
                            type="text"
                            value={editForm.mood}
                            onChange={(e) => setEditForm({ ...editForm, mood: e.target.value })}
                            className="w-full px-3 py-2 bg-blue-950/50 border border-cyan-500/30 rounded text-white text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-cyan-400 mb-1">New Thumbnail (optional)</label>
                        <div className="space-y-2">
                          {editForm.current_thumbnail && !editThumbnailFile && (
                            <div className="flex items-center space-x-2">
                              <img 
                                src={editForm.current_thumbnail} 
                                alt="Current" 
                                className="w-16 h-16 rounded object-cover"
                              />
                              <span className="text-xs text-cyan-500">Current thumbnail</span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp"
                            onChange={(e) => setEditThumbnailFile(e.target.files[0])}
                            className="w-full text-xs px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300"
                          />
                          {editThumbnailFile && (
                            <p className="text-xs text-green-400">✓ New thumbnail: {editThumbnailFile.name}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2 text-cyan-300 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.featured}
                            onChange={(e) => setEditForm({ ...editForm, featured: e.target.checked })}
                            className="rounded"
                          />
                          <span>Featured</span>
                        </label>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => saveEdit(sample.id)}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-semibold transition flex items-center space-x-2"
                        >
                          <Save className="w-4 h-4" />
                          <span>Save Changes</span>
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 rounded-lg text-sm font-semibold transition flex items-center space-x-2"
                        >
                          <X className="w-4 h-4" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1 flex items-center space-x-3">
                        {sample.thumbnail_url && (
                          <img
                            src={sample.thumbnail_url}
                            alt={sample.name}
                            className="w-16 h-16 rounded object-cover"
                          />
                        )}
                        <div>
                          <h3 className="font-bold text-white text-lg">{sample.name}</h3>
                          <p className="text-sm text-cyan-400">
                            {sample.artist} • {sample.bpm} BPM • {sample.key} • {sample.genre}
                          </p>
                          {sample.mood && (
                            <p className="text-xs text-cyan-500 mt-1">Mood: {sample.mood}</p>
                          )}
                          <div className="flex items-center space-x-2 mt-2">
                            {sample.has_stems && (
                              <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded">
                                Has Stems
                              </span>
                            )}
                            {sample.featured && (
                              <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded">
                                Featured
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEdit(sample)}
                          className="p-3 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition"
                          title="Edit Pack"
                        >
                          <Edit className="w-5 h-5 text-blue-400" />
                        </button>
                        <button
                          onClick={() => deletePack(sample.id, sample.name)}
                          className="p-3 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition"
                          title="Delete Pack"
                        >
                          <Trash2 className="w-5 h-5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COLLECTIONS TAB */}
      {activeTab === 'collections' && adminLevel === 3 && (
        <div className="space-y-6">
          <form onSubmit={handleSaveCollection}>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20 space-y-4">
              <h3 className="text-lg font-bold text-white mb-4">Create New Collection</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Collection Name *</label>
                  <input
                    type="text"
                    value={collectionForm.name}
                    onChange={(e) => setCollectionForm({ ...collectionForm, name: e.target.value })}
                    placeholder="Lo-Fi Essentials Series"
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Cover Image (optional)</label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => setCollectionForm({ ...collectionForm, cover_image_file: e.target.files[0] })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">Description</label>
                <textarea
                  value={collectionForm.description}
                  onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white resize-none"
                />
              </div>

              <div>
  <label className="block text-cyan-300 text-sm mb-2">YouTube Video URL (optional)</label>
  <input
    type="url"
    value={collectionForm.youtube_url}
    onChange={(e) => setCollectionForm({ ...collectionForm, youtube_url: e.target.value })}
    placeholder="https://www.youtube.com/watch?v=..."
    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
  />
  <p className="text-xs text-cyan-600 mt-1">
    Add a YouTube video to showcase this collection
  </p>
</div>

              <label className="flex items-center space-x-2 text-cyan-300">
                <input
                  type="checkbox"
                  checked={collectionForm.is_public}
                  onChange={(e) => setCollectionForm({ ...collectionForm, is_public: e.target.checked })}
                  className="rounded"
                />
                <span>Public Collection</span>
              </label>

              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
              >
                {uploading ? <Loader className="w-5 h-5 animate-spin" /> : <FolderPlus className="w-5 h-5" />}
                <span>{uploading ? 'Creating...' : 'Create Collection'}</span>
              </button>
            </div>
          </form>

          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
            <h3 className="text-lg font-bold text-white mb-4">Your Collections ({collections.length})</h3>
            <div className="space-y-2">
              {collections.map((collection) => (
                <div key={collection.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Folder className="w-5 h-5 text-cyan-400" />
                    <div>
                      <p className="font-semibold text-white">{collection.name}</p>
                      <p className="text-xs text-cyan-400">{collection.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteCollection(collection.id)}
                    className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded transition"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
              {collections.length === 0 && (
                <p className="text-center text-cyan-400 py-8">No collections yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && adminLevel === 3 && (
        <div className="space-y-6">
          <form onSubmit={handleSaveTemplate}>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20 space-y-4">
              <h3 className="text-lg font-bold text-white mb-4">Create New Template</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Template Name *</label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Lo-Fi Hip Hop Preset"
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Default Artist</label>
                  <input
                    type="text"
                    value={templateForm.artist}
                    onChange={(e) => setTemplateForm({ ...templateForm, artist: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Genre</label>
                  <input
                    type="text"
                    value={templateForm.genre}
                    onChange={(e) => setTemplateForm({ ...templateForm, genre: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Mood</label>
                  <input
                    type="text"
                    value={templateForm.mood}
                    onChange={(e) => setTemplateForm({ ...templateForm, mood: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">BPM Min</label>
                  <input
                    type="number"
                    value={templateForm.bpm_min}
                    onChange={(e) => setTemplateForm({ ...templateForm, bpm_min: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">BPM Max</label>
                  <input
                    type="number"
                    value={templateForm.bpm_max}
                    onChange={(e) => setTemplateForm({ ...templateForm, bpm_max: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
              >
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>{loading ? 'Saving...' : 'Save Template'}</span>
              </button>
            </div>
          </form>

          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
            <h3 className="text-lg font-bold text-white mb-4">Your Templates ({templates.length})</h3>
            <div className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="font-semibold text-white">{template.name}</p>
                    <p className="text-xs text-cyan-400">
                      {template.genre} • {template.mood} • {template.bpm_min}-{template.bpm_max} BPM
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTemplate(template.id)}
                    className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded transition"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="text-center text-cyan-400 py-8">No templates yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUploadPanel;