import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Mail, 
  Send, 
  Users, 
  Image as ImageIcon, 
  Trash2, 
  Loader, 
  CheckCircle,
  XCircle,
  Eye,
  Plus,
  X
} from 'lucide-react';

function EmailCampaigns({ user }) {
  const [activeTab, setActiveTab] = useState('compose'); // compose, subscribers, history
  const [subscribers, setSubscribers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form state
  const [formData, setFormData] = useState({
    subject: '',
    body: '',
    images: []
  });
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    fetchSubscribers();
    fetchCampaigns();
  }, []);

  const fetchSubscribers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('email_subscribers')
      .select('*')
      .eq('subscribed', true)
      .order('subscribed_at', { ascending: false });

    if (!error) {
      setSubscribers(data || []);
    }
    setLoading(false);
  };

  const fetchCampaigns = async () => {
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setCampaigns(data || []);
    }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingImages(true);

    try {
      const uploadedImages = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('campaign-images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('campaign-images')
          .getPublicUrl(fileName);

        uploadedImages.push({
          url: publicUrl,
          name: file.name
        });
      }

      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...uploadedImages]
      }));

      setMessage({ type: 'success', text: `${uploadedImages.length} image(s) uploaded!` });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Image upload error:', error);
      setMessage({ type: 'error', text: 'Failed to upload images' });
    } finally {
      setUploadingImages(false);
    }
  };

  const removeImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleSendCampaign = async (e) => {
    e.preventDefault();

    if (!formData.subject.trim() || !formData.body.trim()) {
      setMessage({ type: 'error', text: 'Subject and body are required' });
      return;
    }

    if (subscribers.length === 0) {
      setMessage({ type: 'error', text: 'No subscribers to send to' });
      return;
    }

    if (!window.confirm(`Send email to ${subscribers.length} subscriber(s)?`)) {
      return;
    }

    setSending(true);
    setMessage({ type: '', text: '' });

    try {
      // Get admin ID
      const { data: adminData } = await supabase
        .from('admins')
        .select('id')
        .eq('user_id', user.id)
        .single();

      // Create HTML content with images
      let htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(to bottom, #1e3a8a, #111827); color: #ffffff; border-radius: 10px;">
          <h2 style="color: #06b6d4; margin-bottom: 20px;">${formData.subject}</h2>
          <div style="line-height: 1.6; margin-bottom: 30px;">
            ${formData.body.replace(/\n/g, '<br>')}
          </div>
      `;

      // Add images
      if (formData.images.length > 0) {
        htmlContent += '<div style="margin: 30px 0;">';
        formData.images.forEach(img => {
          htmlContent += `
            <img src="${img.url}" alt="${img.name}" style="max-width: 100%; height: auto; border-radius: 10px; margin-bottom: 15px; border: 2px solid #06b6d4;" />
          `;
        });
        htmlContent += '</div>';
      }

      htmlContent += `
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #374151; text-align: center;">
            <p style="color: #60a5fa; font-size: 14px;">
              © ${new Date().getFullYear()} Feelz Machine | 
              <a href="${window.location.origin}" style="color: #06b6d4; text-decoration: none;">Visit Feelz Machine</a>
            </p>
          </div>
        </div>
      `;

      // Save campaign to database
      const { data: campaignData, error: campaignError } = await supabase
        .from('email_campaigns')
        .insert([{
          admin_id: adminData?.id,
          subject: formData.subject,
          body: formData.body,
          html_content: htmlContent,
          sent_to_count: subscribers.length,
          status: 'sent',
          sent_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // TODO: Actual email sending would happen here via a backend service
      // For now, we're just logging the campaign
      // In production, you'd use services like:
      // - Supabase Edge Functions + Resend/SendGrid
      // - AWS SES
      // - Mailgun
      // - etc.

      console.log('Campaign saved:', campaignData);
      console.log('Would send to:', subscribers.length, 'subscribers');
      console.log('HTML Content:', htmlContent);

      setMessage({ 
        type: 'success', 
        text: `Campaign created! (Email sending requires backend setup - ${subscribers.length} recipients ready)` 
      });

      // Reset form
      setFormData({ subject: '', body: '', images: [] });
      fetchCampaigns();

      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      console.error('Send campaign error:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSending(false);
    }
  };

  const deleteSubscriber = async (subscriberId) => {
    if (!window.confirm('Remove this subscriber?')) return;

    try {
      const { error } = await supabase
        .from('email_subscribers')
        .update({ subscribed: false, unsubscribed_at: new Date().toISOString() })
        .eq('id', subscriberId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Subscriber removed' });
      fetchSubscribers();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Delete error:', error);
      setMessage({ type: 'error', text: 'Failed to remove subscriber' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Email Marketing</h2>
          <p className="text-cyan-300 text-sm">{subscribers.length} active subscribers</p>
        </div>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div className={`p-4 rounded-lg flex items-center space-x-3 ${
          message.type === 'success' 
            ? 'bg-green-500/20 border border-green-500/50 text-green-300'
            : 'bg-red-500/20 border border-red-500/50 text-red-300'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <XCircle className="w-5 h-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2">
        <button
          onClick={() => setActiveTab('compose')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
            activeTab === 'compose'
              ? 'bg-blue-500 text-white'
              : 'bg-blue-950/50 text-cyan-300 hover:bg-blue-900/50'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Compose</span>
        </button>

        <button
          onClick={() => setActiveTab('subscribers')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
            activeTab === 'subscribers'
              ? 'bg-blue-500 text-white'
              : 'bg-blue-950/50 text-cyan-300 hover:bg-blue-900/50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Subscribers ({subscribers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
            activeTab === 'history'
              ? 'bg-blue-500 text-white'
              : 'bg-blue-950/50 text-cyan-300 hover:bg-blue-900/50'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>History</span>
        </button>
      </div>

      {/* Compose Tab */}
      {activeTab === 'compose' && (
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/30">
          <form onSubmit={handleSendCampaign} className="space-y-4">
            {/* Subject */}
            <div>
              <label className="block text-sm font-semibold text-cyan-300 mb-2">
                Subject *
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
                placeholder="New sample packs available!"
                className="w-full px-4 py-3 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-semibold text-cyan-300 mb-2">
                Message *
              </label>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                required
                rows="8"
                placeholder="Check out our latest sample packs..."
                className="w-full px-4 py-3 bg-blue-950/50 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white resize-none"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-semibold text-cyan-300 mb-2">
                <ImageIcon className="w-4 h-4 inline mr-2" />
                Showcase Images (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                disabled={uploadingImages}
                className="w-full px-4 py-2 bg-blue-950/50 border border-cyan-500/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-white hover:file:bg-cyan-600"
              />
              {uploadingImages && (
                <p className="text-xs text-cyan-400 mt-1">Uploading...</p>
              )}
            </div>

            {/* Image Preview */}
            {formData.images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {formData.images.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-32 object-cover rounded-lg border-2 border-cyan-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                    <p className="text-xs text-cyan-400 mt-1 truncate">{img.name}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Send Button */}
            <button
              type="submit"
              disabled={sending || subscribers.length === 0}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition flex items-center justify-center space-x-2"
            >
              {sending ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Send to {subscribers.length} Subscriber(s)</span>
                </>
              )}
            </button>

            {subscribers.length === 0 && (
              <p className="text-sm text-yellow-400 text-center">
                No subscribers yet. Users will be added when they download samples.
              </p>
            )}
          </form>
        </div>
      )}

      {/* Subscribers Tab */}
      {activeTab === 'subscribers' && (
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/30">
          <h3 className="text-lg font-bold text-white mb-4">Active Subscribers</h3>
          
          {loading ? (
            <div className="text-center py-8">
              <Loader className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
            </div>
          ) : subscribers.length === 0 ? (
            <p className="text-center text-cyan-300 py-8">No subscribers yet</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {subscribers.map((sub) => (
                <div
                  key={sub.id}
                  className="p-3 bg-blue-950/30 rounded-lg border border-cyan-500/20 hover:border-cyan-400/50 transition flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-white">{sub.name || 'Anonymous'}</p>
                    <p className="text-sm text-cyan-300">{sub.email}</p>
                    <p className="text-xs text-cyan-400">
                      Joined {new Date(sub.subscribed_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteSubscriber(sub.id)}
                    className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/30">
          <h3 className="text-lg font-bold text-white mb-4">Campaign History</h3>
          
          {campaigns.length === 0 ? (
            <p className="text-center text-cyan-300 py-8">No campaigns sent yet</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="p-4 bg-blue-950/30 rounded-lg border border-cyan-500/20"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-white">{campaign.subject}</h4>
                    <span className={`px-2 py-1 text-xs rounded ${
                      campaign.status === 'sent' 
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-sm text-cyan-300 mb-2">{campaign.body.substring(0, 100)}...</p>
                  <div className="flex items-center justify-between text-xs text-cyan-400">
                    <span>Sent to: {campaign.sent_to_count} subscribers</span>
                    <span>{new Date(campaign.sent_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Important Note */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <p className="text-yellow-300 text-sm">
          <strong>Note:</strong> Email campaigns are saved but actual sending requires backend setup 
          (Supabase Edge Functions + email service like Resend). For now, campaigns are logged for testing.
        </p>
      </div>
    </div>
  );
}

export default EmailCampaigns;