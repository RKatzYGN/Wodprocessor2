import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, Plus, Trash2, Printer, Download,
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  FolderOpen, Check, Palette, Highlighter, Clock, LogOut, Key, Mail,
  FileCode, Layers, FileUp, Sparkles, ChevronDown
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

/* Standard 96 DPI Paper Dimensions (US Letter: 8.5 x 11 inches) */
const PAGE_HEIGHT_PX = 1056; 
const PAGE_MARGIN_TOP_BOTTOM = 96; // 1-inch margins = 96px
const PRINTABLE_PAGE_HEIGHT = PAGE_HEIGHT_PX - (PAGE_MARGIN_TOP_BOTTOM * 2); // 864px

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Authentication UI state
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Document states
  const [documents, setDocuments] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [title, setTitle] = useState('Untitled Document');
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Stats & Page metrics
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  // Toolbar selection state
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    align: 'left'
  });
  const [fontSize, setFontSize] = useState('3');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [textColor, setTextColor] = useState('#0f172a');
  const [highlightColor, setHighlightColor] = useState('#fef08a');

  // DOM Refs
  const editorRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const isUpdatingFromRemoteRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const docsRef = collection(db, 'users', user.uid, 'documents');
    const unsubscribe = onSnapshot(docsRef, (snapshot) => {
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

  const calculateMetrics = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || editorRef.current.textContent || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(text.length);

    // Calculate real pages based on printable content height
    const scrollHeight = editorRef.current.scrollHeight;
    const computedPages = Math.max(1, Math.ceil(scrollHeight / PRINTABLE_PAGE_HEIGHT));
    setPageCount(computedPages);
  }, []);

  const updateToolbarStatus = useCallback(() => {
    if (typeof document === 'undefined' || !document.queryCommandState) return;
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        align: document.queryCommandState('justifyCenter') ? 'center' :
               document.queryCommandState('justifyRight') ? 'right' :
               document.queryCommandState('justifyFull') ? 'justify' : 'left'
      });
    } catch {
      // Ignore document state query errors when blur
    }
  }, []);

  const triggerAutoSave = (htmlContent, newTitle) => {
    if (isUpdatingFromRemoteRef.current) return;
    setSaveStatus('Saving...');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!user || !db || !currentDocId) return;
      try {
        await setDoc(doc(db, 'users', user.uid, 'documents', currentDocId), {
          title: newTitle !== undefined ? newTitle : title,
          content: htmlContent,
          updatedAt: new Date()
        }, { merge: true });
        setSaveStatus('Cloud synchronized');
      } catch (err) {
        console.error("Auto-save error:", err);
        setSaveStatus('Save error');
      }
    }, 1000);
  };

  const loadDocument = (docItem) => {
    isUpdatingFromRemoteRef.current = true;
    setCurrentDocId(docItem.id);
    setTitle(docItem.title || 'Untitled Document');
    const content = docItem.content || '<p>Start typing your document here...</p>';
    if (editorRef.current) {
      editorRef.current.innerHTML = content;
    }
    setTimeout(() => {
      calculateMetrics();
      isUpdatingFromRemoteRef.current = false;
    }, 50);
    setSaveStatus('Saved');
  };

  const createNewDocument = async () => {
    if (!user || !db) return;
    const newDocId = 'doc_' + Date.now();
    const initialContent = '<p>Start typing your document here...</p>';
    const newDocData = {
      title: 'Untitled Document',
      content: initialContent,
      updatedAt: new Date()
    };

    try {
      await setDoc(doc(db, 'users', user.uid, 'documents', newDocId), newDocData);
      setCurrentDocId(newDocId);
      setTitle(newDocData.title);
      if (editorRef.current) {
        editorRef.current.innerHTML = initialContent;
      }
      calculateMetrics();
      setSaveStatus('Saved');
    } catch (err) {
      console.error("Failed to create document:", err);
    }
  };

  const deleteDocument = async (docId, e) => {
    e.stopPropagation();
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'documents', docId));
      if (currentDocId === docId) setCurrentDocId(null);
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const executeFormat = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    updateToolbarStatus();
    calculateMetrics();
    triggerAutoSave(editorRef.current.innerHTML, title);
  };

  const handleFontSize = (size) => {
    setFontSize(size);
    executeFormat('fontSize', size);
  };

  const handleFontFamily = (family) => {
    setFontFamily(family);
    executeFormat('fontName', family);
  };

  const handleTextColor = (color) => {
    setTextColor(color);
    executeFormat('foreColor', color);
  };

  const handleHighlight = (color) => {
    setHighlightColor(color);
    executeFormat('hiliteColor', color);
  };

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    calculateMetrics();
    updateToolbarStatus();
    triggerAutoSave(editorRef.current.innerHTML, title);
  };

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    const content = editorRef.current ? editorRef.current.innerHTML : '';
    triggerAutoSave(content, val);
  };

  const handlePrint = () => window.print();

  const exportAsTxt = () => {
    const text = editorRef.current ? (editorRef.current.innerText || editorRef.current.textContent || '') : '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title || 'document'}.txt`;
    link.click();
  };

  const exportAsHtml = () => {
    const html = editorRef.current ? editorRef.current.innerHTML : '';
    const fullDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:${fontFamily},sans-serif;padding:40px;line-height:1.6;max-width:800px;margin:auto;}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title || 'document'}.html`;
    link.click();
  };

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

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-400">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-100 font-sans p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-200">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight">Word Processor</h1>
              <p className="text-xs text-slate-500">Cloud Paginated Document Studio</p>
            </div>
          </div>

          <h2 className="text-center text-sm font-semibold text-slate-600 mb-6">
            {isRegistering ? 'Create an account to start writing' : 'Sign in to access your cloud documents'}
          </h2>

          {authError && (
            <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-200">
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
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none transition-colors"
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
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 transition-colors"
            >
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            {isRegistering ? 'Already have an account?' : "Don't have an account yet?"}{' '}
            <button
              type="button"
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

  return (
    <div className="flex h-screen w-full flex-col bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden select-none">
      
      {/* Dynamic CSS Styling for Seamless Pages and Print Output */}
      <style>{`
        /* Multi-Page Canvas: White sheets separated by clean 32px workspace page gaps */
        .workspace-pages-container {
          background-color: transparent;
        }

        .paper-sheet-card {
          width: 816px !important;
          min-height: 1056px !important;
          background: #ffffff !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          position: relative;
        }

        /* Seamless Continuous Typing Canvas */
        .document-canvas-editor {
          width: 816px !important;
          padding: 96px !important; /* Standard 1-inch printable margins */
          min-height: 1056px !important;
          outline: none !important;
          color: #0f172a !important;
          line-height: 1.6 !important;
          background-color: #ffffff !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          /* Subtle physical page dividers rendered every 1056px */
          background-image: linear-gradient(to bottom, transparent 1052px, #cbd5e1 1052px, #cbd5e1 1056px) !important;
          background-size: 100% 1056px !important;
        }

        .document-canvas-editor p {
          margin-bottom: 0.75rem;
        }

        @media print {
          header, aside, .no-print, .toolbar-container, .status-bar { 
            display: none !important; 
          }
          body, html, #root, .main-scroll-area { 
            background: white !important; 
            overflow: visible !important; 
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: 8.5in 11in;
            margin: 1in;
          }
          .document-canvas-editor { 
            box-shadow: none !important; 
            margin: 0 !important; 
            width: 100% !important; 
            padding: 0 !important; 
            background: white !important;
            background-image: none !important;
          }
        }
      `}</style>

      {/* Top Application Bar */}
      <header className="no-print flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Toggle Document Manager"
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
                placeholder="Document Title"
                className="h-7 w-64 rounded border border-transparent px-1.5 text-sm font-semibold text-slate-800 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
              />
              <div className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
                {saveStatus === 'Saving...' ? (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Clock className="h-3 w-3 animate-spin" /> Saving...
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Check className="h-3 w-3" /> {saveStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePrint} 
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            title="Print or Save as PDF"
          >
            <Printer className="h-4 w-4 text-slate-500" /> Print
          </button>

          <div className="relative group">
            <button className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
              <Download className="h-4 w-4" /> Export
            </button>
            <div className="absolute right-0 top-full mt-1 hidden w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg group-hover:block z-30">
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

          <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
            <span className="text-xs font-semibold text-slate-600 truncate max-w-[150px]">{user.email}</span>
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Left Document Sidebar */}
        <aside className={`no-print flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
          <div className="p-3">
            <button 
              onClick={createNewDocument} 
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors mb-3 shadow-sm"
            >
              <Plus className="h-4 w-4" /> New Document
            </button>
            
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
              Documents ({documents.length})
            </div>
            
            <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-170px)] pr-1">
              {documents.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No documents yet</div>
              ) : (
                documents.map((docItem) => (
                  <div
                    key={docItem.id}
                    onClick={() => loadDocument(docItem)}
                    className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors ${
                      currentDocId === docItem.id 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate pr-2">{docItem.title || 'Untitled'}</span>
                    <button 
                      onClick={(e) => deleteDocument(docItem.id, e)} 
                      className={`p-1 rounded transition-opacity ${
                        currentDocId === docItem.id ? 'hover:bg-blue-700 text-white' : 'opacity-70 hover:opacity-100 text-slate-500'
                      }`}
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Central Editor Area */}
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-200">
          
          {/* Full Formatting Toolbar */}
          <div className="toolbar-container no-print flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2 shadow-sm z-10">
            
            {/* Font Family */}
            <select 
              value={fontFamily} 
              onChange={(e) => handleFontFamily(e.target.value)} 
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
            </select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Font Size */}
            <select 
              value={fontSize} 
              onChange={(e) => handleFontSize(e.target.value)} 
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="1">10 pt</option>
              <option value="2">11 pt</option>
              <option value="3">12 pt</option>
              <option value="4">14 pt</option>
              <option value="5">18 pt</option>
              <option value="6">24 pt</option>
              <option value="7">36 pt</option>
            </select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Bold, Italic, Underline */}
            <button 
              type="button"
              onClick={() => executeFormat('bold')} 
              className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                activeFormats.bold ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
              }`}
              title="Bold (Ctrl+B)"
            >
              <Bold className="h-4 w-4" />
            </button>

            <button 
              type="button"
              onClick={() => executeFormat('italic')} 
              className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                activeFormats.italic ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
              }`}
              title="Italic (Ctrl+I)"
            >
              <Italic className="h-4 w-4" />
            </button>

            <button 
              type="button"
              onClick={() => executeFormat('underline')} 
              className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                activeFormats.underline ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
              }`}
              title="Underline (Ctrl+U)"
            >
              <UnderlineIcon className="h-4 w-4" />
            </button>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Alignment Controls */}
            <button 
              type="button"
              onClick={() => executeFormat('justifyLeft')} 
              className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                activeFormats.align === 'left' ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
              }`}
              title="Align Left"
            >
              <AlignLeft className="h-4 w-4" />
            </button>

            <button 
              type="button"
              onClick={() => executeFormat('justifyCenter')} 
              className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                activeFormats.align === 'center' ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
              }`}
              title="Align Center"
            >
              <AlignCenter className="h-4 w-4" />
            </button>

            <button 
              type="button"
              onClick={() => executeFormat('justifyRight')} 
              className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                activeFormats.align === 'right' ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
              }`}
              title="Align Right"
            >
              <AlignRight className="h-4 w-4" />
            </button>

            <button 
              type="button"
              onClick={() => executeFormat('justifyFull')} 
              className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                activeFormats.align === 'justify' ? 'bg-slate-200 text-blue-600' : 'text-slate-700'
              }`}
              title="Justify"
            >
              <AlignJustify className="h-4 w-4" />
            </button>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Text Color Picker */}
            <label className="flex items-center gap-1 cursor-pointer p-1 rounded-lg hover:bg-slate-100" title="Text Color">
              <Palette className="h-4 w-4 text-slate-700" />
              <input 
                type="color" 
                value={textColor} 
                onChange={(e) => handleTextColor(e.target.value)} 
                className="h-5 w-5 cursor-pointer border-none bg-transparent" 
              />
            </label>

            {/* Highlight Color Picker */}
            <label className="flex items-center gap-1 cursor-pointer p-1 rounded-lg hover:bg-slate-100" title="Highlight Color">
              <Highlighter className="h-4 w-4 text-slate-700" />
              <input 
                type="color" 
                value={highlightColor} 
                onChange={(e) => handleHighlight(e.target.value)} 
                className="h-5 w-5 cursor-pointer border-none bg-transparent" 
              />
            </label>
          </div>

          <div className="main-scroll-area flex-1 overflow-y-auto p-8 flex justify-center bg-slate-200">
            <div className="relative flex flex-col items-center">
              
              {/* Document Surface */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onKeyUp={updateToolbarStatus}
                onMouseUp={updateToolbarStatus}
                className="document-canvas-editor rounded-sm select-text font-normal"
                style={{
                  fontFamily: fontFamily
                }}
              />

              {/* Dynamic Page Break Status Pill */}
              <div className="no-print my-6 flex items-center gap-2 rounded-full bg-slate-800/80 px-4 py-1.5 text-xs text-white backdrop-blur-sm shadow-md">
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                <span>Page 1 of {pageCount}</span>
              </div>
            </div>
          </div>

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
