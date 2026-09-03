// src/components/admin/WysiwygEditor.js
// Ported from Steve's other app (same Tiptap setup, same toolbar), adapted
// for this being a plain CRA-style app rather than Next.js: no 'use client',
// no styled-jsx (plain <style> tag instead, works without an extra Babel
// plugin), FM lime instead of their electric-blue, and an image upload
// button added since the original didn't have one but this app needs it.

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Link as LinkIcon, AlignLeft, AlignCenter,
  AlignRight, Undo, Redo, Code, Image as ImageIcon, Loader,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

export function WysiwygEditor({ value, onChange, placeholder = 'Start writing...', minHeight = '220px' }) {
  const imageInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-lime-400 hover:underline cursor-pointer' },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg max-w-full' } }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'max-w-none focus:outline-none px-4 py-3',
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Sync external value changes (e.g. loading saved content)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const insertImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const path = `newsletter/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('covers').upload(path, file, { cacheControl: '31536000' });
    setUploadingImage(false);
    e.target.value = '';
    if (upErr) { window.alert('Image upload failed: ' + upErr.message); return; }
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(path);
    editor.chain().focus().setImage({ src: publicUrl }).run();
  };

  const ToolButton = ({ onClick, active, children, title }) => (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-lime-400/20 text-lime-400' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
      title={title}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-white/[0.08] rounded-lg overflow-hidden bg-white/[0.03]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-white/[0.04] border-b border-white/[0.08] flex-wrap">
        <ToolButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)">
          <Bold className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)">
          <Italic className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)">
          <UnderlineIcon className="w-4 h-4" />
        </ToolButton>

        <div className="w-px h-5 bg-white/10 mx-1" />

        <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 1">
          <Heading1 className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 2">
          <Heading2 className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} active={editor.isActive('heading', { level: 4 })} title="Heading 3">
          <Heading3 className="w-4 h-4" />
        </ToolButton>

        <div className="w-px h-5 bg-white/10 mx-1" />

        <ToolButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
          <Quote className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
          <Code className="w-4 h-4" />
        </ToolButton>

        <div className="w-px h-5 bg-white/10 mx-1" />

        <ToolButton onClick={addLink} active={editor.isActive('link')} title="Add Link">
          <LinkIcon className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Minus className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => imageInputRef.current?.click()} title="Insert Image">
          {uploadingImage ? <Loader className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        </ToolButton>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={insertImage} />

        <div className="w-px h-5 bg-white/10 mx-1" />

        <ToolButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight className="w-4 h-4" />
        </ToolButton>

        <div className="w-px h-5 bg-white/10 mx-1" />

        <ToolButton onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
          <Undo className="w-4 h-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Shift+Z)">
          <Redo className="w-4 h-4" />
        </ToolButton>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      <style>{`
        .ProseMirror {
          min-height: ${minHeight};
          color: #e0e0e0;
        }
        .ProseMirror p {
          margin-bottom: 1rem;
          line-height: 1.7;
        }
        .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin-top: 2rem;
          margin-bottom: 1rem;
        }
        .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #ffffff;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror h4 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #ffffff;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror strong {
          color: #ffffff;
          font-weight: 700;
        }
        .ProseMirror em {
          font-style: italic;
        }
        .ProseMirror u {
          text-decoration: underline;
        }
        .ProseMirror ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .ProseMirror ol {
          list-style: decimal;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .ProseMirror li {
          margin-bottom: 0.25rem;
        }
        .ProseMirror blockquote {
          border-left: 4px solid rgba(198, 255, 61, 0.4);
          padding-left: 1rem;
          font-style: italic;
          color: #888;
          margin: 1rem 0;
        }
        .ProseMirror hr {
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          margin: 1.5rem 0;
        }
        .ProseMirror code {
          background: rgba(255, 255, 255, 0.05);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          font-size: 0.9em;
          color: #C6FF3D;
        }
        .ProseMirror pre {
          background: rgba(255, 255, 255, 0.05);
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
          overflow-x: auto;
        }
        .ProseMirror pre code {
          background: none;
          padding: 0;
        }
        .ProseMirror img {
          border-radius: 8px;
          max-width: 100%;
          margin: 0.5rem 0;
        }
        .ProseMirror a {
          color: #C6FF3D;
          text-decoration: none;
        }
        .ProseMirror a:hover {
          text-decoration: underline;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #555;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}