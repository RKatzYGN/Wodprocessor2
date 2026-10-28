import React, { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import { 
  FileText, Plus, Trash2, Printer, Download,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  FolderOpen, Check, Palette, Highlighter, Clock, LogOut, Key, Mail,
  FileCode, PanelTop, PanelBottom, List, HardDrive
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';

// ----------------------------------------------------------------------
// Firebase Configuration
// ----------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBwURdUU69kkRQTIXUimC-ICc5jE4W3E-w",
  authDomain: "simple-word-processor-2.firebaseapp.com",
  projectId: "simple-word-processor-2",
  storageBucket: "simple-word-processor-2.firebasestorage.app",
  messagingSenderId: "188052684856",
  appId: "1:188052684856:web:fd1901b30527abf61ea6cd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth State
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [title, setTitle] = useState('Untitled Document');
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Header & Footer Configuration State
  const [showHeader, setShowHeader] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const [headerText, setHeaderText] = useState('DOCUMENT HEADER\nSecond Line Header');
  const [footerText, setFooterText] = useState('Document Footer\nPage Information');
  const [headerColor, setHeaderColor] = useState('grey'); // 'grey' | 'black'
  const [footerColor, setFooterColor] = useState('grey'); // 'grey' | 'black'
  const [headerAlign, setHeaderAlign] = useState('center'); // 'left' | 'center' | 'right'
  const [footerAlign, setFooterAlign] = useState('center'); // 'left' | 'center' | 'right'

  // Stats & Formatting State
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, align: 'left' });
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState('3');
  const [lineSpacing, setLineSpacing] = useState('1.15');
  const [textColor, setTextColor] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('#ffffff');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const editorRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!user || !db) return;

    const docsCollection = collection(db, 'users', user.uid, 'documents');

    const unsubscribe = onSnapshot(docsCollection, (snapshot) => {
      const fetchedDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedDocs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setDocuments(fetchedDocs);

      if (fetchedDocs.length > 0 && !currentDocId) {
        loadDocument(fetchedDocs[0]);
      } else if (fetchedDocs.length === 0 && !currentDocId) {
        createNewDocument();
      }
    });

    return () => unsubscribe();
  }, [user, currentDocId]);

  // Auth Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setAuthEmail('');
      setAuthPassword('');
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setDocuments([]);
    setCurrentDocId(null);
  };

  // Document Operations
  const loadDocument = (docItem) => {
    setCurrentDocId(docItem.id);
    setTitle(docItem.title || 'Untitled Document');
    setHeaderText(docItem.headerText || 'DOCUMENT HEADER');
    setFooterText(docItem.footerText || 'Document Footer');
    setShowHeader(docItem.showHeader !== undefined ? docItem.showHeader : true);
    setShowFooter(docItem.showFooter !== undefined ? docItem.showFooter : true);
    setHeaderColor(docItem.headerColor || 'grey');
    setFooterColor(docItem.footerColor || 'grey');
    setHeaderAlign(docItem.headerAlign || 'center');
    setFooterAlign(docItem.footerAlign || 'center');
    
    const contentHtml = docItem.content || '<p>Start typing here...</p>';
    if (editorRef.current) {
      editorRef.current.innerHTML = contentHtml;
    }
    updateStats(contentHtml);
    setSaveStatus('Saved');
  };

  const createNewDocument = async () => {
    if (!user || !db) return;
    const newDocId = 'doc_' + Date.now();
    const initialContent = '<p>Start typing here...</p>';
    const newDocData = {
      title: 'Untitled Document',
      content: initialContent,
      headerText: 'DOCUMENT HEADER',
      footerText: 'Document Footer',
      showHeader: true,
      showFooter: true,
      headerColor: 'grey',
      footerColor: 'grey',
      headerAlign: 'center',
      footerAlign: 'center',
      updatedAt: new Date()
    };

    try {
      await setDoc(doc(db, 'users', user.uid, 'documents', newDocId), newDocData);
      setCurrentDocId(newDocId);
      setTitle(newDocData.title);
      setHeaderText(newDocData.headerText);
      setFooterText(newDocData.footerText);
      setShowHeader(true);
      setShowFooter(true);
      setHeaderColor('grey');
      setFooterColor('grey');
      setHeaderAlign('center');
      setFooterAlign('center');
      if (editorRef.current) {
        editorRef.current.innerHTML = initialContent;
      }
      updateStats(initialContent);
      setSaveStatus('Saved');
    } catch (err) {
      console.error("Failed to create doc:", err);
    }
  };

  const deleteDocument = async (docId, e) => {
    e.stopPropagation();
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'documents', docId));
      if (currentDocId === docId) setCurrentDocId(null);
    } catch (err) {
      console.error("Failed to delete doc:", err);
    }
  };

  const triggerAutoSave = (overrides = {}) => {
    setSaveStatus('Saving...');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!user || !db || !currentDocId) return;
      try {
        const contentHtml = editorRef.current ? editorRef.current.innerHTML : '';
        await setDoc(doc(db, 'users', user.uid, 'documents', currentDocId), {
          title: overrides.title !== undefined ? overrides.title : title,
          content: contentHtml,
          headerText: overrides.headerText !== undefined ? overrides.headerText : headerText,
          footerText: overrides.footerText !== undefined ? overrides.footerText : footerText,
          showHeader: overrides.showHeader !== undefined ? overrides.showHeader : showHeader,
          showFooter: overrides.showFooter !== undefined ? overrides.showFooter : showFooter,
          headerColor: overrides.headerColor !== undefined ? overrides.headerColor : headerColor,
          footerColor: overrides.footerColor !== undefined ? overrides.footerColor : footerColor,
          headerAlign: overrides.headerAlign !== undefined ? overrides.headerAlign : headerAlign,
          footerAlign: overrides.footerAlign !== undefined ? overrides.footerAlign : footerAlign,
          updatedAt: new Date()
        }, { merge: true });
        setSaveStatus('Cloud synchronized');
      } catch (err) {
        setSaveStatus('Save Error');
      }
    }, 1000);
  };

  const updateStats = (html) => {
    const temp = document.createElement('div');
    temp.innerHTML = html || '';
    const text = temp.innerText || temp.textContent || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(text.length);

    if (editorRef.current) {
      const currentHeight = editorRef.current.scrollHeight;
      const pages = Math.max(1, Math.ceil(currentHeight / 864));
      setPageCount(pages);
    }
  };

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    triggerAutoSave({ title: val });
  };

  const toggleHeader = () => {
    const nextVal = !showHeader;
    setShowHeader(nextVal);
    triggerAutoSave({ showHeader: nextVal });
  };

  const toggleFooter = () => {
    const nextVal = !showFooter;
    setShowFooter(nextVal);
    triggerAutoSave({ showFooter: nextVal });
  };

  // Tab Key Indentation Handler
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      executeCommand('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  };

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const contentHtml = editorRef.current.innerHTML;
    updateStats(contentHtml);
    checkActiveFormats();
    triggerAutoSave();
  };

  const checkActiveFormats = () => {
    if (!document.getSelection) return;
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      align: document.queryCommandState('justifyLeft') ? 'left' :
             document.queryCommandState('justifyCenter') ? 'center' :
             document.queryCommandState('justifyRight') ? 'right' : 'left'
    });
  };

const executeCommand = (cmd, val = null) => {
    if (editorRef.current) {
      editorRef.current.focus();
    }

    if (cmd === 'insertUnorderedList') {
      // Ensure browser styleWithCSS is active for list generation
      document.execCommand('styleWithCSS', false, false);
      
      // Execute the standard bullet list command
      document.execCommand('insertUnorderedList', false, null);

      // Force-format any unnested text into clean list items
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const parentLi = selection.anchorNode.parentElement?.closest('li');
        if (!parentLi) {
          document.execCommand('formatBlock', false, 'p');
          document.execCommand('insertUnorderedList', false, null);
        }
      }
    } else {
      document.execCommand(cmd, false, val);
    }

    checkActiveFormats();
    handleEditorInput();
  };

  const applyFontSize = (size) => { setFontSize(size); executeCommand('fontSize', size); };
  const applyFontFamily = (font) => { setFontFamily(font); executeCommand('fontName', font); };
  const applyLineSpacing = (spacing) => {
    setLineSpacing(spacing);
    if (editorRef.current) { editorRef.current.style.lineHeight = spacing; handleEditorInput(); }
  };
  const applyTextColor = (color) => { setTextColor(color); executeCommand('foreColor', color); };
  const applyHighlightColor = (color) => { setHighlightColor(color); executeCommand('hiliteColor', color); };
// Save directly to USB / local storage
 const handleSaveToUSB = async (format = 'wpdoc') => {
    const rawContent = editorRef.current ? editorRef.current.innerHTML : '';
    const safeTitle = title || 'document';
    let filePayload = '';
    let mimeType = 'text/plain';
    let fileExtension = format;

    if (format === 'doc') {
      // Microsoft Word compatible HTML wrapper
      mimeType = 'application/msword';
      fileExtension = 'doc';
      filePayload = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' 
              xmlns:w='urn:schemas-microsoft-com:office:word' 
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset="utf-8">
          <title>${safeTitle}</title>
          <style>
            body { font-family: ${fontFamily || 'Arial'}, sans-serif; font-size: 11pt; line-height: ${lineSpacing || 1.15}; }
            .header { text-align: ${headerAlign}; color: ${headerColor === 'black' ? '#000' : '#666'}; font-size: 9pt; border-bottom: 1px solid #ddd; margin-bottom: 20px; white-space: pre-wrap; }
            .footer { text-align: ${footerAlign}; color: ${footerColor === 'black' ? '#000' : '#666'}; font-size: 9pt; border-top: 1px solid #ddd; margin-top: 20px; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          ${showHeader && headerText ? `<div class="header">${headerText}</div>` : ''}
          ${rawContent}
          ${showFooter && footerText ? `<div class="footer">${footerText}</div>` : ''}
        </body>
        </html>
      `;
    } else if (format === 'txt') {
      mimeType = 'text/plain';
      fileExtension = 'txt';
      const temp = document.createElement('div');
      temp.innerHTML = rawContent;
      const plainText = temp.innerText || temp.textContent || '';
      
      filePayload = [
        showHeader && headerText ? `--- HEADER ---\n${headerText}\n\n` : '',
        plainText,
        showFooter && footerText ? `\n\n--- FOOTER ---\n${footerText}` : ''
      ].join('');
    } else {
      // Native App Document (.wpdoc / .json)
      mimeType = 'application/json';
      fileExtension = 'wpdoc';
      filePayload = JSON.stringify({
        title: safeTitle,
        content: rawContent,
        headerText,
        footerText,
        showHeader,
        showFooter,
        headerColor,
        footerColor,
        headerAlign,
        footerAlign,
        savedAt: new Date().toISOString()
      }, null, 2);
    }

    // Direct Browser File System API (Chrome / Edge)
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${safeTitle}.${fileExtension}`,
          types: [{
            description: format === 'doc' ? 'Microsoft Word Document (*.doc)' : format === 'txt' ? 'Text Document (*.txt)' : 'Word Processor Document (*.wpdoc)',
            accept: { [mimeType]: [`.${fileExtension}`] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(filePayload);
        await writable.close();
        setSaveStatus(`Saved as .${fileExtension}`);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Save error:', err);
        }
      }
    } else {
      // Fallback for browsers without direct file picker access
      const blob = new Blob([filePayload], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}.${fileExtension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaveStatus(`Saved as .${fileExtension}`);
    }
  };

  // Open directly from USB / local storage
 const handleOpenFromUSB = async () => {
    // 1. Native File System Access API (Chrome, Edge)
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Supported Documents (*.wpdoc, *.docx, *.html, *.txt)',
            accept: {
              'application/json': ['.wpdoc', '.json'],
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              'text/html': ['.html', '.htm'],
              'text/plain': ['.txt'],
              'application/msword': ['.doc']
            },
          }],
        });
        const file = await handle.getFile();
        await parseAndLoadFile(file);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Failed to open file:', err);
        }
      }
    } else {
      // 2. Fallback File Input (Safari, Firefox)
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.wpdoc,.json,.docx,.doc,.html,.htm,.txt';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          await parseAndLoadFile(file);
        }
      };
      input.click();
    }
  };

  const parseAndLoadFile = async (file) => {
    const fileName = file.name || 'Imported Document';
    const cleanTitle = fileName.replace(/\.[^/.]+$/, "");
    const ext = fileName.split('.').pop().toLowerCase();

    try {
      // A. Word Documents (.docx)
      if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const html = result.value || '<p></p>';
        applyDocumentContent(cleanTitle, html);
        setSaveStatus(`Loaded ${fileName}`);
        return;
      }

      // B. Legacy Word Documents (.doc)
      if (ext === 'doc') {
        alert('Legacy .doc files (Word 97-2003) are binary files. Please save or export your document as .docx or .txt in Word first, then open it here.');
        return;
      }

      // C. Plain Text (.txt)
      if (ext === 'txt') {
        const text = await file.text();
        // Convert linebreaks to HTML paragraphs
        const formattedHtml = text
          .split(/\r?\n/)
          .map(line => `<p>${line.trim() ? line : '&nbsp;'}</p>`)
          .join('');
        applyDocumentContent(cleanTitle, formattedHtml);
        setSaveStatus(`Loaded ${fileName}`);
        return;
      }

      // D. Web Pages (.html, .htm)
      if (ext === 'html' || ext === 'htm') {
        const htmlContent = await file.text();
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(htmlContent, 'text/html');
        const extractedHtml = parsedDoc.body ? parsedDoc.body.innerHTML : htmlContent;
        applyDocumentContent(cleanTitle, extractedHtml);
        setSaveStatus(`Loaded ${fileName}`);
        return;
      }

      // E. Native App Documents (.wpdoc, .json)
      const rawText = await file.text();
      try {
        const data = JSON.parse(rawText);
        setTitle(data.title || cleanTitle);
        setHeaderText(data.headerText || '');
        setFooterText(data.footerText || '');
        setShowHeader(data.showHeader !== undefined ? data.showHeader : true);
        setShowFooter(data.showFooter !== undefined ? data.showFooter : true);
        setHeaderColor(data.headerColor || 'grey');
        setFooterColor(data.footerColor || 'grey');
        setHeaderAlign(data.headerAlign || 'center');
        setFooterAlign(data.footerAlign || 'center');

        if (editorRef.current) {
          editorRef.current.innerHTML = data.content || '<p></p>';
        }
        updateStats(data.content || '');
        triggerAutoSave(data);
        setSaveStatus(`Loaded ${fileName}`);
      } catch {
        // Fallback if not valid JSON: treat as plain text
        applyDocumentContent(cleanTitle, `<p>${rawText}</p>`);
        setSaveStatus(`Loaded ${fileName}`);
      }
    } catch (err) {
      console.error('File parsing error:', err);
      alert(`Could not open ${fileName}. The file format may be corrupted.`);
    }
  };

  const applyDocumentContent = (newTitle, newContent) => {
    setTitle(newTitle);
    if (editorRef.current) {
      editorRef.current.innerHTML = newContent;
    }
    updateStats(newContent);
    triggerAutoSave({ title: newTitle, content: newContent });
  };
  const handlePrint = () => window.print();

  const exportAsTxt = () => {
    const html = editorRef.current ? editorRef.current.innerHTML : '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const plainText = temp.innerText || temp.textContent || '';

    const element = document.createElement("a");
    const file = new Blob([plainText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${title || 'document'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const exportAsHtml = () => {
    const html = editorRef.current ? editorRef.current.innerHTML : '';
    const fullHtml = `<!DOCTYPE html><html><head><title>${title}</title></head><body>${html}</body></html>`;
    const element = document.createElement("a");
    const file = new Blob([fullHtml], {type: 'text/html'});
    element.href = URL.createObjectURL(file);
    element.download = `${title || 'document'}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  // Auth Screen
  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-100 font-sans">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl border border-slate-200">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-md">
              <FileText className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Word Processor</h1>
          </div>

          <h2 className="text-center text-sm font-semibold text-slate-500 mb-6">
            {isRegistering ? 'Create a new account' : 'Sign in to access your documents'}
          </h2>

          {authError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-600 border border-red-200">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
              <div className="relative">
                <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 transition-colors"
            >
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
              className="font-semibold text-blue-600 hover:underline"
            >
              {isRegistering ? 'Sign In' : 'Register now'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Editor Screen
  return (
    <div className="app-root-container flex h-screen w-full flex-col bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
      <style>{`
        /* PRINT STYLING */
        @media print {
          header, sidebar, .no-print, .toolbar-container, .status-bar { 
            display: none !important; 
          }

          html, body, #root, .app-root-container, .main-workspace, .main-content, .scroll-wrapper { 
            background: white !important; 
            overflow: visible !important; 
            height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            position: static !important;
          }

          @page {
            size: 8.5in 11in;
            margin: 0.75in;
          }

          .print-header-spacer { height: 60px; }
          .print-footer-spacer { height: 60px; }

          .print-header-fixed {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            border-bottom: 1px solid #e2e8f0;
            font-size: 9pt;
            padding-bottom: 4px;
            white-space: pre-wrap;
          }

          .print-footer-fixed {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            border-top: 1px solid #e2e8f0;
            font-size: 9pt;
            padding-top: 4px;
            white-space: pre-wrap;
          }
        }
      `}</style>

      {/* Printable Native Table Layout for Multi-line Header & Footer */}
      <div className="hidden print:block w-full">
        <table className="w-full">
          {showHeader && (
            <thead>
              <tr>
                <td>
                  <div className="print-header-spacer" />
                  <div 
                    className="print-header-fixed"
                    style={{
                      textAlign: headerAlign,
                      color: headerColor === 'black' ? '#000000' : '#64748b'
                    }}
                  >
                    {headerText}
                  </div>
                </td>
              </tr>
            </thead>
          )}
          <tbody>
            <tr>
              <td>
                <div 
                  dangerouslySetInnerHTML={{ __html: editorRef.current ? editorRef.current.innerHTML : '' }} 
                  className="text-slate-900 leading-relaxed font-sans"
                />
              </td>
            </tr>
          </tbody>
          {showFooter && (
            <tfoot>
              <tr>
                <td>
                  <div className="print-footer-spacer" />
                  <div 
                    className="print-footer-fixed"
                    style={{
                      textAlign: footerAlign,
                      color: footerColor === 'black' ? '#000000' : '#64748b'
                    }}
                  >
                    {footerText}
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Screen Header */}
      <header className="no-print flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
            <FolderOpen className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-md">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                className="h-7 w-64 rounded border border-transparent px-1.5 text-base font-semibold text-slate-800 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
              <div className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
                {saveStatus === 'Saving...' ? (
                  <span className="flex items-center gap-1 text-amber-600"><Clock className="h-3 w-3 animate-spin" /> Saving...</span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" /> {saveStatus}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Printer className="h-4 w-4 text-slate-500" /> Print
          </button>
<button 
  onClick={handleOpenFromUSB} 
  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
  title="Open from USB drive or local disk"
>
  <FolderOpen className="h-4 w-4 text-slate-500" /> Open from USB
</button>

<div className="relative group">
  <button 
    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    title="Save to USB drive or local disk"
  >
    <HardDrive className="h-4 w-4 text-slate-500" /> Save to USB / Disk
  </button>
  <div className="absolute left-0 top-full mt-1 hidden w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg group-hover:block z-30">
    <button 
      onClick={() => handleSaveToUSB('doc')} 
      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <FileText className="h-4 w-4 text-blue-600" /> Word Document (.doc)
    </button>
    <button 
      onClick={() => handleSaveToUSB('txt')} 
      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <FileCode className="h-4 w-4 text-slate-500" /> Plain Text (.txt)
    </button>
    <button 
      onClick={() => handleSaveToUSB('wpdoc')} 
      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <HardDrive className="h-4 w-4 text-emerald-600" /> Full Project (.wpdoc)
    </button>
  </div>
</div>
          <div className="relative group">
            <button className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
              <Download className="h-4 w-4" /> Export
            </button>
            <div className="absolute right-0 top-full mt-1 hidden w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg group-hover:block z-30">
              <button onClick={exportAsTxt} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <FileText className="h-4 w-4 text-slate-400" /> Plain Text (.txt)
              </button>
              <button onClick={exportAsHtml} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <FileCode className="h-4 w-4 text-slate-400" /> Web Page (.html)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
            <span className="text-xs font-semibold text-slate-600">{user.email}</span>
            <button onClick={handleLogout} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="main-workspace flex flex-1 overflow-hidden relative">
        <aside className={`no-print flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
          <div className="p-3">
            <button onClick={createNewDocument} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 mb-3">
              <Plus className="h-4 w-4" /> New Document
            </button>
            <div className="text-xs font-bold uppercase text-slate-400 mb-2">Your Documents ({documents.length})</div>
            <div className="space-y-1">
              {documents.map((docItem) => (
                <div
                  key={docItem.id}
                  onClick={() => loadDocument(docItem)}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer ${currentDocId === docItem.id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  <span className="truncate">{docItem.title || 'Untitled'}</span>
                  <button onClick={(e) => deleteDocument(docItem.id, e)} className="p-1 opacity-70 hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Editor Area */}
        <div className="main-content flex flex-1 flex-col overflow-hidden bg-slate-200 print:hidden">
          
          {/* Formatting Toolbar */}
          <div className="toolbar-container no-print flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2 shadow-sm z-10">
            <select value={fontFamily} onChange={(e) => applyFontFamily(e.target.value)} className="h-8 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700">
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
            </select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            <select value={fontSize} onChange={(e) => applyFontSize(e.target.value)} className="h-8 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700">
              <option value="1">8 pt</option>
              <option value="2">10 pt</option>
              <option value="3">12 pt</option>
              <option value="4">14 pt</option>
              <option value="5">18 pt</option>
              <option value="6">24 pt</option>
              <option value="7">36 pt</option>
            </select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            <button onClick={() => executeCommand('bold')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.bold ? 'bg-slate-200 text-blue-600' : ''}`} title="Bold"><Bold className="h-4 w-4" /></button>
            <button onClick={() => executeCommand('italic')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.italic ? 'bg-slate-200 text-blue-600' : ''}`} title="Italic"><Italic className="h-4 w-4" /></button>
            <button onClick={() => executeCommand('underline')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.underline ? 'bg-slate-200 text-blue-600' : ''}`} title="Underline"><Underline className="h-4 w-4" /></button>
            
            {/* BULLET POINTS BUTTON */}
            <button onClick={() => executeCommand('insertUnorderedList')} className="p-1.5 rounded hover:bg-slate-100 text-slate-700" title="Bullet List"><List className="h-4 w-4" /></button>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            <span className="text-xs font-medium text-slate-400 pl-1">Spacing:</span>
            <select value={lineSpacing} onChange={(e) => applyLineSpacing(e.target.value)} className="h-8 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700">
              <option value="1.0">Single (1.0)</option>
              <option value="1.15">1.15</option>
              <option value="1.5">1.5</option>
              <option value="2.0">Double (2.0)</option>
            </select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            <button onClick={() => executeCommand('justifyLeft')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.align === 'left' ? 'bg-slate-200 text-blue-600' : ''}`}><AlignLeft className="h-4 w-4" /></button>
            <button onClick={() => executeCommand('justifyCenter')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.align === 'center' ? 'bg-slate-200 text-blue-600' : ''}`}><AlignCenter className="h-4 w-4" /></button>
            <button onClick={() => executeCommand('justifyRight')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.align === 'right' ? 'bg-slate-200 text-blue-600' : ''}`}><AlignRight className="h-4 w-4" /></button>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            <label className="flex items-center gap-1 cursor-pointer" title="Text Color">
              <Palette className="h-4 w-4 text-slate-600" />
              <input type="color" value={textColor} onChange={(e) => applyTextColor(e.target.value)} className="h-6 w-6 cursor-pointer border-none bg-transparent" />
            </label>
            <label className="flex items-center gap-1 cursor-pointer" title="Highlight Color">
              <Highlighter className="h-4 w-4 text-slate-600" />
              <input type="color" value={highlightColor} onChange={(e) => applyHighlightColor(e.target.value)} className="h-6 w-6 cursor-pointer border-none bg-transparent" />
            </label>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Header / Footer Toggles */}
            <button 
              onClick={toggleHeader} 
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${showHeader ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
              title="Toggle Header"
            >
              <PanelTop className="h-3.5 w-3.5" /> Header {showHeader ? 'On' : 'Off'}
            </button>

            <button 
              onClick={toggleFooter} 
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${showFooter ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
              title="Toggle Footer"
            >
              <PanelBottom className="h-3.5 w-3.5" /> Footer {showFooter ? 'On' : 'Off'}
            </button>
          </div>

          {/* Paper Workspace Outer Scroll Wrapper */}
          <div className="scroll-wrapper flex-1 overflow-y-auto bg-slate-200 py-8">
            
            {/* The White Paper Canvas */}
            <div className="mx-auto bg-white rounded shadow-xl border border-slate-300 p-16 w-[816px] min-h-[1056px] h-auto flex flex-col justify-between">
              
              {/* Screen Header Control Section */}
              {showHeader && (
                <div className="no-print border-b border-slate-200 pb-3 mb-6">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Header Controls:</span>
                      
                      {/* Alignment Options */}
                      <div className="flex rounded border border-slate-200 bg-slate-50">
                        <button onClick={() => { setHeaderAlign('left'); triggerAutoSave({ headerAlign: 'left' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${headerAlign === 'left' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Left</button>
                        <button onClick={() => { setHeaderAlign('center'); triggerAutoSave({ headerAlign: 'center' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${headerAlign === 'center' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Center</button>
                        <button onClick={() => { setHeaderAlign('right'); triggerAutoSave({ headerAlign: 'right' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${headerAlign === 'right' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Right</button>
                      </div>

                      {/* Color Options */}
                      <div className="flex rounded border border-slate-200 bg-slate-50">
                        <button onClick={() => { setHeaderColor('grey'); triggerAutoSave({ headerColor: 'grey' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${headerColor === 'grey' ? 'bg-slate-600 text-white' : 'text-slate-600'}`}>Grey</button>
                        <button onClick={() => { setHeaderColor('black'); triggerAutoSave({ headerColor: 'black' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${headerColor === 'black' ? 'bg-black text-white' : 'text-slate-600'}`}>Black</button>
                      </div>
                    </div>

                    <button onClick={toggleHeader} className="text-xs text-slate-400 hover:text-red-500 font-bold" title="Remove Header">✕ Remove Header</button>
                  </div>

                  {/* Multi-line Header Textarea */}
                  <textarea
                    rows={2}
                    value={headerText}
                    onChange={(e) => { setHeaderText(e.target.value); triggerAutoSave({ headerText: e.target.value }); }}
                    placeholder="Type header content here (press Enter for multiple lines)..."
                    className={`w-full bg-transparent text-xs font-semibold focus:outline-none resize-y ${headerColor === 'black' ? 'text-black' : 'text-slate-400'}`}
                    style={{ textAlign: headerAlign }}
                  />
                </div>
              )}

              {/* Core Text Editor Container */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onKeyDown={handleKeyDown}
                onKeyUp={checkActiveFormats}
                onMouseUp={checkActiveFormats}
                className="outline-none text-slate-900 leading-relaxed font-sans min-h-[864px] h-auto flex-1"
              />

              {/* Screen Footer Control Section */}
              {showFooter && (
                <div className="no-print border-t border-slate-200 pt-3 mt-6">
                  {/* Multi-line Footer Textarea */}
                  <textarea
                    rows={2}
                    value={footerText}
                    onChange={(e) => { setFooterText(e.target.value); triggerAutoSave({ footerText: e.target.value }); }}
                    placeholder="Type footer content here (press Enter for multiple lines)..."
                    className={`w-full bg-transparent text-xs font-semibold focus:outline-none resize-y mb-1.5 ${footerColor === 'black' ? 'text-black' : 'text-slate-400'}`}
                    style={{ textAlign: footerAlign }}
                  />

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Footer Controls:</span>
                      
                      {/* Alignment Options */}
                      <div className="flex rounded border border-slate-200 bg-slate-50">
                        <button onClick={() => { setFooterAlign('left'); triggerAutoSave({ footerAlign: 'left' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${footerAlign === 'left' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Left</button>
                        <button onClick={() => { setFooterAlign('center'); triggerAutoSave({ footerAlign: 'center' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${footerAlign === 'center' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Center</button>
                        <button onClick={() => { setFooterAlign('right'); triggerAutoSave({ footerAlign: 'right' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${footerAlign === 'right' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Right</button>
                      </div>

                      {/* Color Options */}
                      <div className="flex rounded border border-slate-200 bg-slate-50">
                        <button onClick={() => { setFooterColor('grey'); triggerAutoSave({ footerColor: 'grey' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${footerColor === 'grey' ? 'bg-slate-600 text-white' : 'text-slate-600'}`}>Grey</button>
                        <button onClick={() => { setFooterColor('black'); triggerAutoSave({ footerColor: 'black' }); }} className={`px-1.5 py-0.5 text-[10px] font-semibold ${footerColor === 'black' ? 'bg-black text-white' : 'text-slate-600'}`}>Black</button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span>Document Length: ~{pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
                      <button onClick={toggleFooter} className="text-xs text-slate-400 hover:text-red-500 font-bold" title="Remove Footer">✕ Remove Footer</button>
                    </div>
                  </div>
                </div>
              )}

            </div>

          </div>

          {/* Bottom Status Bar */}
          <div className="status-bar no-print flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs font-semibold text-slate-500">
            <div>Word Processor Studio</div>
            <div className="flex items-center gap-4">
              <span>{pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
              <span>{wordCount} Words</span>
              <span>{charCount} Characters</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
