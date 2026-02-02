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
  ChevronRight
} from 'lucide-react';

function AdminUploadPanel({ user }) {
  const [activeTab, setActiveTab] = useState('upload'); // upload, collections, templates
  const [collections, setCollections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [loading, setLoading] = useState(false);
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
    main_loop_url: '',
    cover_image_url: '',
    has_stems: false,
    featured: false
  });

  // Collection form
  const [collectionForm, setCollectionForm] = useState({
    name: '',
    description: '',
    cover_image_url: '',
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

  // ============================================
  // SINGLE PACK UPLOAD
  // ============================================
  const handleSinglePackSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const packData = {
        ...packForm,
        bpm: parseInt(packForm.bpm) || null,
        collection_id: selectedCollection || null,
        is_pack: true,
        plays: 0
      };

      const { data, error } = await supabase
        .from('samples')
        .insert([packData])
        .select();

      if (error) throw error;

      showMessage('success', '✓ Sample pack uploaded successfully!');
      resetPackForm();
    } catch (error) {
      console.error('Upload error:', error);
      showMessage('error', 'Upload failed: ' + error.message);
    }

    setLoading(false);
  };

  // ============================================
  // BATCH UPLOAD
  // ============================================
  const addPackToBatch = () => {
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

    try {
      const packsData = batchPacks.map(p => ({
        name: p.name,
        artist: p.artist,
        bpm: parseInt(p.bpm) || null,
        key: p.key,
        genre: p.genre,
        mood: p.mood,
        main_loop_url: p.main_loop_url,
        cover_image_url: p.cover_image_url,
        collection_id: p.collection_id,
        has_stems: p.has_stems,
        featured: p.featured,
        is_pack: true,
        plays: 0
      }));

      const { error } = await supabase
        .from('samples')
        .insert(packsData);

      if (error) throw error;

      showMessage('success', `✓ ${batchPacks.length} packs uploaded successfully!`);
      setBatchPacks([]);
    } catch (error) {
      console.error('Batch upload error:', error);
      showMessage('error', 'Batch upload failed: ' + error.message);
    }

    setLoading(false);
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

    try {
      const { error } = await supabase
        .from('collections')
        .insert([{
          ...collectionForm,
          created_by: user.id
        }]);

      if (error) throw error;

      showMessage('success', '✓ Collection created!');
      setCollectionForm({
        name: '',
        description: '',
        cover_image_url: '',
        is_public: true
      });
      fetchData();
    } catch (error) {
      showMessage('error', 'Failed to create collection: ' + error.message);
    }

    setLoading(false);
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
  // AUTO-DETECTION HELPERS
  // ============================================
  const autoFillFromFilename = (url, field) => {
    if (!url) return;

    const filename = url.split('/').pop().toLowerCase();

    // Auto-detect BPM
    const bpmMatch = filename.match(/(\d{2,3})[\-_\s]?bpm|bpm[\-_\s]?(\d{2,3})/i);
    if (bpmMatch && !packForm.bpm) {
      const bpm = bpmMatch[1] || bpmMatch[2];
      setPackForm({ ...packForm, bpm, [field]: url });
      showMessage('success', `Auto-detected BPM: ${bpm}`);
      return;
    }

    // Auto-detect Key
    const keyMatch = filename.match(/([A-G][\#b]?)[\-_\s]?(maj|major|min|minor)/i);
    if (keyMatch && !packForm.key) {
      const key = keyMatch[0].replace(/[\-_\s]/g, ' ');
      setPackForm({ ...packForm, key, [field]: url });
      showMessage('success', `Auto-detected Key: ${key}`);
      return;
    }

    setPackForm({ ...packForm, [field]: url });
  };

  // ============================================
  // HELPERS
  // ============================================
  const resetPackForm = () => {
    setPackForm({
      name: '',
      artist: '',
      bpm: '',
      key: '',
      genre: '',
      mood: '',
      main_loop_url: '',
      cover_image_url: '',
      has_stems: false,
      featured: false
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
                  <label className="block text-cyan-300 text-sm mb-2">BPM *</label>
                  <input
                    type="number"
                    value={packForm.bpm}
                    onChange={(e) => setPackForm({ ...packForm, bpm: e.target.value })}
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                    required
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
                <label className="block text-cyan-300 text-sm mb-2">Main Loop URL * (Auto-detects BPM/Key)</label>
                <input
                  type="url"
                  value={packForm.main_loop_url}
                  onChange={(e) => autoFillFromFilename(e.target.value, 'main_loop_url')}
                  placeholder="https://..."
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-cyan-300 text-sm mb-2">Cover Image URL</label>
                <input
                  type="url"
                  value={packForm.cover_image_url}
                  onChange={(e) => setPackForm({ ...packForm, cover_image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
                />
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

              <div className="flex space-x-3 pt-4">
                {uploadMode === 'single' ? (
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
                  >
                    {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span>{loading ? 'Uploading...' : 'Upload Pack'}</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
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
                  disabled={loading}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center space-x-2"
                >
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{loading ? 'Uploading...' : 'Upload All'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {batchPacks.map((pack) => (
                  <div key={pack.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex-1">
                      <p className="font-semibold text-white">{pack.name}</p>
                      <p className="text-sm text-cyan-400">{pack.artist} • {pack.bpm} BPM • {pack.key}</p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => duplicatePack(pack)}
                        className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded transition"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4 text-blue-400" />
                      </button>
                      <button
                        onClick={() => removeFromBatch(pack.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded transition"
                        title="Remove"
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
                  <label className="block text-cyan-300 text-sm mb-2">Cover Image URL</label>
                  <input
                    type="url"
                    value={collectionForm.cover_image_url}
                    onChange={(e) => setCollectionForm({ ...collectionForm, cover_image_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white"
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
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
              >
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <FolderPlus className="w-5 h-5" />}
                <span>{loading ? 'Creating...' : 'Create Collection'}</span>
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
    </div>
  );
}

export default AdminUploadPanel;