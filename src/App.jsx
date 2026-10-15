import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Plus, Trash2, Edit3, Printer, Download, Save, 
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  FolderOpen, ChevronLeft, ChevronRight, LogOut, User, Check, AlertCircle,
  Type, Palette, Highlighter, Sparkles, Copy, FileCode, Clock
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';

// ----------------------------------------------------------------------
// Firebase Setup
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
const appId = 'doc-editor-app';

export default function App() {
  // ----------------------------------------------------------------------
  // State Management
  // ----------------------------------------------------------------------
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  
  // Document State
  const [title, setTitle] = useState('Untitled Document');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('Saved'); // 'Saved', 'Saving...', 'Unsaved'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Editor formatting states (for UI visual feedback)
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    align: 'left'
  });
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState('3'); // execCommand uses 1-7 scale or px span styling
  const [lineSpacing, setLineSpacing] = useState('1.15');
  const [textColor, setTextColor] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('#ffffff');

  // Pagination & Layout states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const editorRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // ----------------------------------------------------------------------
  // 1. Authentication Lifecycle
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth initialization failed:", err);
        // Fallback try anonymous
        try { await signInAnonymously(auth); } catch(e){ console.error(e); }
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ----------------------------------------------------------------------
  // 2. Firestore Document Fetching (User Private Space)
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!user || !db) return;

    // Strict path per mandatory rules: /artifacts/{appId}/users/{userId}/{collectionName}
    const docsCollection = collection(db, 'artifacts', appId, 'users', user.uid, 'documents');

    const unsubscribe = onSnapshot(
      docsCollection,
      (snapshot) => {
        const fetchedDocs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));

        // JavaScript-side sort by lastUpdated desc
        fetchedDocs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
        setDocuments(fetchedDocs);

        // If no active doc and docs exist, pick first doc or create initial
        if (fetchedDocs.length > 0 && !currentDocId) {
          loadDocument(fetchedDocs[0]);
        } else if (fetchedDocs.length === 0 && !currentDocId) {
          createNewDocument();
        }
      },
      (error) => {
        console.error("Error fetching documents:", error);
      }
    );

    return () => unsubscribe();
  }, [user, currentDocId]);

  // Load a document into editor state
  const loadDocument = (docItem) => {
    setCurrentDocId(docItem.id);
    setTitle(docItem.title || 'Untitled Document');
    setContent(docItem.content || '');
    if (editorRef.current) {
      editorRef.current.innerHTML = docItem.content || '';
    }
    setSaveStatus('Saved');
  };

  // Create a new document in Firestore
  const createNewDocument = async () => {
    if (!user || !db) return;
    const newDocId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const newDocData = {
      title: 'Untitled Document',
      content: '<p>Start typing your document here...</p>',
      updatedAt: new Date(),
      createdAt: new Date()
    };

    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'documents', newDocId);
      await setDoc(docRef, newDocData);
      setCurrentDocId(newDocId);
      setTitle(newDocData.title);
      setContent(newDocData.content);
      if (editorRef.current) {
        editorRef.current.innerHTML = newDocData.content;
      }
      setSaveStatus('Saved');
    } catch (err) {
      console.error("Failed to create document:", err);
    }
  };

  // Delete document
  const deleteDocument = async (docId, e) => {
    e.stopPropagation();
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'documents', docId));
      if (currentDocId === docId) {
        setCurrentDocId(null);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  // Auto-Save Mechanism
  const triggerAutoSave = (newContent, newTitle) => {
    setSaveStatus('Saving...');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!user || !db || !currentDocId) return;

      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'documents', currentDocId);
        await setDoc(docRef, {
          title: newTitle !== undefined ? newTitle : title,
          content: newContent !== undefined ? newContent : content,
          updatedAt: new Date()
        }, { merge: true });
        setSaveStatus('All changes saved');
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSaveStatus('Save Error');
      }
    }, 1200);
  };

  // Handle Title Change
  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    triggerAutoSave(content, val);
  };

  // Handle Editor Content Change
  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const updatedHtml = editorRef.current.innerHTML;
    setContent(updatedHtml);
    checkActiveFormats();
    calculatePages();
    triggerAutoSave(updatedHtml, title);
  };

  // Calculate pages approximation based on editor height & paper standard size
  const calculatePages = () => {
    if (!editorRef.current) return;
    const height = editorRef.current.scrollHeight;
    // Standard visual A4 page frame height in px (~960px)
    const pageHeight = 960; 
    const calculated = Math.max(1, Math.ceil(height / pageHeight));
    setTotalPages(calculated);
  };

  // Check active selection formatting to highlight toolbar buttons
  const checkActiveFormats = () => {
    if (!document.getSelection) return;
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      align: getCommandValue('justifyLeft') ? 'left' :
             getCommandValue('justifyCenter') ? 'center' :
             getCommandValue('justifyRight') ? 'right' :
             getCommandValue('justifyFull') ? 'justify' : 'left'
    });
  };

  const getCommandValue = (cmd) => {
    try {
      return document.queryCommandState(cmd);
    } catch (e) {
      return false;
    }
  };

  // Executing Text Formats
  const executeCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    checkActiveFormats();
    handleEditorInput();
  };

  // Custom Font Size execution
  const applyFontSize = (size) => {
    setFontSize(size);
    executeCommand('fontSize', size);
  };

  // Apply Font Family
  const applyFontFamily = (font) => {
    setFontFamily(font);
    executeCommand('fontName', font);
  };

  // Apply Line Spacing
  const applyLineSpacing = (spacing) => {
    setLineSpacing(spacing);
    if (editorRef.current) {
      editorRef.current.style.lineHeight = spacing;
      handleEditorInput();
    }
  };

  // Apply Colors
  const applyTextColor = (color) => {
    setTextColor(color);
    executeCommand('foreColor', color);
  };

  const applyHighlightColor = (color) => {
    setHighlightColor(color);
    executeCommand('hiliteColor', color);
  };

  // ----------------------------------------------------------------------
  // Export & Print Helpers
  // ----------------------------------------------------------------------
  const handlePrint = () => {
    window.print();
  };

  const exportAsTxt = () => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const plainText = tempDiv.innerText || tempDiv.textContent || '';
    
    const element = document.createElement("a");
    const file = new Blob([plainText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${title || 'document'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const exportAsHtml = () => {
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: ${fontFamily}, sans-serif; line-height: ${lineSpacing}; padding: 40px; max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;

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
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-400">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
      {/* Dynamic Print CSS Injection */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          /* Hide Sidebar, Header, Toolbar, Navigation elements on print */
          header, sidebar, .no-print, .toolbar-container, .sidebar-container {
            display: none !important;
          }
          /* Expand editor area to full page size */
          .main-content {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .paper-page {
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
            min-height: 100vh !important;
            border: none !important;
            padding: 1in !important;
            page-break-after: always;
          }
        }
      `}</style>

      {/* Top Application Bar */}
      <header className="no-print flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Toggle Document Sidebar"
          >
            <FolderOpen className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                className="h-7 w-64 rounded border border-transparent px-1.5 text-base font-semibold text-slate-800 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                placeholder="Untitled Document"
              />
              <div className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
                {saveStatus === 'Saving...' ? (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Clock className="h-3 w-3 animate-spin" /> Saving...
                  </span>
                ) : saveStatus === 'All changes saved' || saveStatus === 'Saved' ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Check className="h-3 w-3" /> Cloud synchronized
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400">
                    <AlertCircle className="h-3 w-3" /> Unsaved changes
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            title="Print Document (Ctrl+P)"
          >
            <Printer className="h-4 w-4 text-slate-500" />
            <span>Print</span>
          </button>

          {/* Export Dropdown Menu */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
            <div className="absolute right-0 top-full mt-1 hidden w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg group-hover:block z-30">
              <button
                onClick={exportAsTxt}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileText className="h-4 w-4 text-slate-400" /> Plain Text (.txt)
              </button>
              <button
                onClick={exportAsHtml}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileCode className="h-4 w-4 text-slate-400" /> Web Page (.html)
              </button>
            </div>
          </div>

          {/* User Profile Badge */}
          <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold text-xs" title={user?.uid}>
              <User className="h-4 w-4 text-slate-600" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace with Sidebar & Canvas */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Document Sidebar / Manager */}
        <aside 
          className={`sidebar-container no-print flex flex-col border-r border-slate-200 bg-white transition-all duration-300 z-10 ${
            isSidebarOpen ? 'w-64' : 'w-0 border-none'
          }`}
        >
          {isSidebarOpen && (
            <div className="flex h-full flex-col p-3">
              <button
                onClick={createNewDocument}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors shadow-sm mb-3"
              >
                <Plus className="h-4 w-4" /> New Document
              </button>

              <div className="px-1 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                Your Documents ({documents.length})
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                {documents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No documents found. Click "New Document" to start.
                  </div>
                ) : (
                  documents.map((docItem) => (
                    <div
                      key={docItem.id}
                      onClick={() => loadDocument(docItem)}
                      className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer transition-all ${
                        currentDocId === docItem.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <FileText className={`h-4 w-4 flex-shrink-0 ${currentDocId === docItem.id ? 'text-white' : 'text-slate-400'}`} />
                        <span className="truncate">{docItem.title || 'Untitled'}</span>
                      </div>
                      <button
                        onClick={(e) => deleteDocument(docItem.id, e)}
                        className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                          currentDocId === docItem.id
                            ? 'hover:bg-blue-700 text-blue-100'
                            : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title="Delete Document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Editor Workspace Column */}
        <div className="main-content flex flex-1 flex-col overflow-hidden bg-slate-200">
          
          {/* Formatting Toolbar */}
          <div className="toolbar-container no-print flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2 shadow-sm z-10">
            
            {/* Font Family Selector */}
            <div className="flex items-center">
              <select
                value={fontFamily}
                onChange={(e) => applyFontFamily(e.target.value)}
                className="h-8 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
                <option value="Trebuchet MS">Trebuchet MS</option>
              </select>
            </div>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Font Size Selector */}
            <div className="flex items-center">
              <select
                value={fontSize}
                onChange={(e) => applyFontSize(e.target.value)}
                className="h-8 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="1">8 pt</option>
                <option value="2">10 pt</option>
                <option value="3">12 pt</option>
                <option value="4">14 pt</option>
                <option value="5">18 pt</option>
                <option value="6">24 pt</option>
                <option value="7">36 pt</option>
              </select>
            </div>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Text Style Controls */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => executeCommand('bold')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${activeFormats.bold ? 'bg-slate-200 text-blue-600 font-bold' : 'text-slate-600'}`}
                title="Bold (Ctrl+B)"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                onClick={() => executeCommand('italic')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${activeFormats.italic ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
                title="Italic (Ctrl+I)"
              >
                <Italic className="h-4 w-4" />
              </button>
              <button
                onClick={() => executeCommand('underline')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${activeFormats.underline ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
                title="Underline (Ctrl+U)"
              >
                <Underline className="h-4 w-4" />
              </button>
            </div>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Line Spacing Selector */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-slate-400 pl-1">Spacing:</span>
              <select
                value={lineSpacing}
                onChange={(e) => applyLineSpacing(e.target.value)}
                className="h-8 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="1.0">Single (1.0)</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5</option>
                <option value="2.0">Double (2.0)</option>
              </select>
            </div>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Text Alignment */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => executeCommand('justifyLeft')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${activeFormats.align === 'left' ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
                title="Align Left"
              >
                <AlignLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => executeCommand('justifyCenter')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${activeFormats.align === 'center' ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
                title="Align Center"
              >
                <AlignCenter className="h-4 w-4" />
              </button>
              <button
                onClick={() => executeCommand('justifyRight')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${activeFormats.align === 'right' ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
                title="Align Right"
              >
                <AlignRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => executeCommand('justifyFull')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${activeFormats.align === 'justify' ? 'bg-slate-200 text-blue-600' : 'text-slate-600'}`}
                title="Justify"
              >
                <AlignJustify className="h-4 w-4" />
              </button>
            </div>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Color Pickers */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 cursor-pointer" title="Text Color">
                <Palette className="h-4 w-4 text-slate-600" />
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => applyTextColor(e.target.value)}
                  className="h-6 w-6 cursor-pointer border-none bg-transparent"
                />
              </label>

              <label className="flex items-center gap-1 cursor-pointer" title="Highlight Color">
                <Highlighter className="h-4 w-4 text-slate-600" />
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(e) => applyHighlightColor(e.target.value)}
                  className="h-6 w-6 cursor-pointer border-none bg-transparent"
                />
              </label>
            </div>

          </div>

          {/* Paginated Paper Editor Canvas Scroll View */}
          <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-slate-200">
            <div className="relative flex flex-col items-center">
              
              {/* Paper Canvas (US Letter / A4 aspect simulated) */}
              <div 
                className="paper-page bg-white shadow-xl rounded-sm border border-slate-300 transition-all"
                style={{
                  width: '816px', // Standard US Letter width at 96dpi
                  minHeight: '1056px', // Standard US Letter height
                  padding: '96px', // 1 inch margins
                  boxSizing: 'border-box'
                }}
              >
                {/* Editable Editable Document Region */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  onKeyUp={checkActiveFormats}
                  onMouseUp={checkActiveFormats}
                  className="min-h-[864px] outline-none text-slate-900 leading-relaxed font-sans"
                  style={{
                    fontFamily: fontFamily,
                    lineHeight: lineSpacing
                  }}
                />
              </div>

              {/* Dynamic Page Indicator Footer */}
              <div className="no-print my-6 flex items-center gap-2 rounded-full bg-slate-800/80 px-4 py-1.5 text-xs text-white backdrop-blur-sm shadow-md">
                <span>Page 1 of {totalPages}</span>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
