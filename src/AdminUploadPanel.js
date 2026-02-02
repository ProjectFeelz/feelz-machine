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

function AdminUploadPanel({ user }) {
  const [activeTab, setActiveTab] = useState('upload'); // upload, collections, templates, manage
  const [collections, setCollections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [samples, setSamples] = useState([]);
  const [filteredSamples, setFilteredSamples] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [uploadQueue, setUploadQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Upload form state
  const [uploadMode, setUploadMode] = useState('single'); // single, batch
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

  // Stem files state
  const [stemFiles, setStemFiles] = useState({
    drums: null,
    bass: null,
    melody: null,
    vocals: null,
    other: null
  });

  // Collection form
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    description: '',
    cover_image_file: null,
    is_public: true
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
    fetchData();
  }, []);

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
    // Fetch collections
    const { data: collectionsData } = await supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: false });
    setCollections(collectionsData || []);

    // Fetch templates
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

  // ============================================
  // FILE UPLOAD HELPERS
  // ============================================
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

  // ============================================
  // SINGLE PACK UPLOAD
  // ============================================
  const handleSinglePackSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUploading(true);

    try {
      // Upload main loop file
      if (!packForm.main_loop_file) {
        throw new Error('Main loop file is required');
      }

      showMessage('info', 'Uploading audio file...');
      const mainLoopUrl = await uploadFileToStorage(
        packForm.main_loop_file, 
        'feelz-samples',
        'loops/'
      );

      // Upload cover image if provided
      let coverImageUrl = null;
      if (packForm.cover_image_file) {
        showMessage('info', 'Uploading cover image...');
        coverImageUrl = await uploadFileToStorage(
          packForm.cover_image_file,
          'feelz-samples',
          'covers/'
        );
      }

      // Auto-detect BPM from filename if not provided
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

      // Upload stems if has_stems is checked
      if (packForm.has_stems) {
        const stemTypes = [
          { key: 'drums', name: 'Drums', file: stemFiles.drums },
          { key: 'bass', name: 'Bass', file: stemFiles.bass },
          { key: 'melody', name: 'Melody', file: stemFiles.melody },
          { key: 'vocals', name: 'Vocals', file: stemFiles.vocals },
          { key: 'other', name: 'Other', file: stemFiles.other }
        ];

        let stemCount = 0;
        for (const stem of stemTypes) {
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
                stem_type: stem.name,
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

  // ============================================
  // BATCH UPLOAD
  // ============================================
  const addPackToBatch = () => {
    if (!packForm.main_loop_file) {
      showMessage('error', 'Main loop file is required');
      return;
    }

    const newPack = {
      id: Date.now(),
      ...packForm,
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
      const uploadedPacks = [];

      for (let i = 0; i < batchPacks.length; i++) {
        const pack = batchPacks[i];
        showMessage('info', `Uploading pack ${i + 1} of ${batchPacks.length}...`);

        // Upload main loop
        const mainLoopUrl = await uploadFileToStorage(
          pack.main_loop_file,
          'feelz-samples',
          'loops/'
        );

        // Upload cover if provided
        let coverImageUrl = null;
        if (pack.cover_image_file) {
          coverImageUrl = await uploadFileToStorage(
            pack.cover_image_file,
            'feelz-samples',
            'covers/'
          );
        }

        // Auto-detect BPM
        let bpm = pack.bpm;
        if (!bpm) {
          const bpmMatch = pack.main_loop_file.name.match(/(\d{2,3})[\-_\s]?bpm|bpm[\-_\s]?(\d{2,3})/i);
          if (bpmMatch) {
            bpm = bpmMatch[1] || bpmMatch[2];
          }
        }

        uploadedPacks.push({
          name: pack.name,
          artist: pack.artist,
          bpm: parseInt(bpm) || null,
          key: pack.key,
          genre: pack.genre,
          mood: pack.mood,
          main_loop_url: mainLoopUrl,
          thumbnail_url: coverImageUrl,
          collection_id: pack.collection_id,
          has_stems: pack.has_stems,
          featured: pack.featured,
          is_pack: true,
          plays: 0
        });
      }

      showMessage('info', 'Saving to database...');
      const { error } = await supabase
        .from('samples')
        .insert(uploadedPacks);

      if (error) throw error;

      showMessage('success', `✓ ${batchPacks.length} packs uploaded successfully!`);
      setBatchPacks([]);
    } catch (error) {
      console.error('Batch upload error:', error);
      showMessage('error', 'Batch upload failed: ' + error.message);
    }

    setLoading(false);
    setUploading(false);
  };

  // ============================================
  // TEMPLATE OPERATIONS
  // ============================================
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
        .from('upload_templates')
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

  // ============================================
  // COLLECTION OPERATIONS
  // ============================================
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
        is_public: true
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

  // ============================================
  // HELPERS
  // ============================================
  const startEdit = (sample) => {
    setEditingId(sample.id);
    setEditForm({
      name: sample.name,
      artist: sample.artist,
      bpm: sample.bpm,
      key: sample.key,
      genre: sample.genre,
      mood: sample.mood,
      featured: sample.featured
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id) => {
    try {
      const { error } = await supabase
        .from('samples')
        .update(editForm)
        .eq('id', id);

      if (error) throw error;

      showMessage('success', '✓ Pack updated!');
      setEditingId(null);
      setEditForm({});
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
    setStemFiles({
      drums: null,
      bass: null,
      melody: null,
      vocals: null,
      other: null
    });
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-6">
      {/* Message Banner */}
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

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Key *</label>
                  <input
                    type="text"
                    value={packForm.key}
                    onChange={(e) => setPackForm({ ...packForm, key: e.target.value })}
                    placeholder="C Major"
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Genre *</label>
                  <input
                    type="text"
                    value={packForm.genre}
                    onChange={(e) => setPackForm({ ...packForm, genre: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-cyan-300 text-sm mb-2">Mood</label>
                  <input
                    type="text"
                    value={packForm.mood}
                    onChange={(e) => setPackForm({ ...packForm, mood: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  />
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

              {/* Stem Uploads - Show when has_stems is checked */}
              {packForm.has_stems && (
                <div className="bg-blue-950/20 border border-cyan-500/20 rounded-lg p-4 space-y-3">
                  <h4 className="text-cyan-300 font-semibold mb-3 flex items-center space-x-2">
                    <Music className="w-4 h-4" />
                    <span>Upload Stems (Optional)</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-cyan-400 text-xs mb-1">🥁 Drums Stem</label>
                      <input
                        type="file"
                        accept=".wav,.mp3,.ogg"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && file.size > 50 * 1024 * 1024) {
                            showMessage('error', `File too large! Max 50MB on free tier.`);
                            return;
                          }
                          setStemFiles({ ...stemFiles, drums: file });
                        }}
                        className="w-full text-xs px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                      />
                      {stemFiles.drums && (
                        <p className="text-xs text-green-400 mt-1">✓ {stemFiles.drums.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-cyan-400 text-xs mb-1">🎸 Bass Stem</label>
                      <input
                        type="file"
                        accept=".wav,.mp3,.ogg"
                        onChange={(e) => setStemFiles({ ...stemFiles, bass: e.target.files[0] })}
                        className="w-full text-xs px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                      />
                      {stemFiles.bass && (
                        <p className="text-xs text-green-400 mt-1">✓ {stemFiles.bass.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-cyan-400 text-xs mb-1">🎹 Melody Stem</label>
                      <input
                        type="file"
                        accept=".wav,.mp3,.ogg"
                        onChange={(e) => setStemFiles({ ...stemFiles, melody: e.target.files[0] })}
                        className="w-full text-xs px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                      />
                      {stemFiles.melody && (
                        <p className="text-xs text-green-400 mt-1">✓ {stemFiles.melody.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-cyan-400 text-xs mb-1">🎤 Vocals Stem</label>
                      <input
                        type="file"
                        accept=".wav,.mp3,.ogg"
                        onChange={(e) => setStemFiles({ ...stemFiles, vocals: e.target.files[0] })}
                        className="w-full text-xs px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                      />
                      {stemFiles.vocals && (
                        <p className="text-xs text-green-400 mt-1">✓ {stemFiles.vocals.name}</p>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-cyan-400 text-xs mb-1">🎧 Other Stem</label>
                      <input
                        type="file"
                        accept=".wav,.mp3,.ogg"
                        onChange={(e) => setStemFiles({ ...stemFiles, other: e.target.files[0] })}
                        className="w-full text-xs px-2 py-1.5 bg-blue-950/50 border border-cyan-500/30 rounded text-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
                      />
                      {stemFiles.other && (
                        <p className="text-xs text-green-400 mt-1">✓ {stemFiles.other.name}</p>
                      )}
                    </div>
                  </div>
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

      {/* COLLECTIONS TAB */}
      {activeTab === 'collections' && (
        <div className="space-y-6">
          {/* Create Collection Form */}
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

          {/* Collections List */}
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
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Create Template Form */}
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

          {/* Templates List */}
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

      {/* MANAGE TAB */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          {/* Search */}
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

          {/* Sample List */}
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
                    // EDIT MODE
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
                    // VIEW MODE
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
    </div>
  );
}

export default AdminUploadPanel;