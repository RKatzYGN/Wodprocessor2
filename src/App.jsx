import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Plus, Trash2, Printer, Download,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  FolderOpen, Check, Palette, Highlighter, Clock, LogOut, Key, Mail,
  FileCode
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
// Your Firebase Configuration
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

  // 1. Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-Time Firestore Synchronization
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

  // Document Management
  const loadDocument = (docItem) => {
    setCurrentDocId(docItem.id);
    setTitle(docItem.title || 'Untitled Document');
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
      updatedAt: new Date()
    };

    try {
      await setDoc(doc(db, 'users', user.uid, 'documents', newDocId), newDocData);
      setCurrentDocId(newDocId);
      setTitle(newDocData.title);
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

  const triggerAutoSave = (updatedContent, updatedTitle) => {
    setSaveStatus('Saving...');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!user || !db || !currentDocId) return;
      try {
        await setDoc(doc(db, 'users', user.uid, 'documents', currentDocId), {
          title: updatedTitle !== undefined ? updatedTitle : title,
          content: updatedContent,
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
    const contentHtml = editorRef.current ? editorRef.current.innerHTML : '';
    triggerAutoSave(contentHtml, val);
  };

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const contentHtml = editorRef.current.innerHTML;
    updateStats(contentHtml);
    checkActiveFormats();
    triggerAutoSave(contentHtml, title);
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
    document.execCommand(cmd, false, val);
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

  // --- Auth Screen ---
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

  // --- Main Editor Screen ---
  return (
    <div className="flex h-screen w-full flex-col bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
      <style>{`
        /* Dynamic On-Screen Visual Page Break Dividers */
        .paper-canvas {
          background-image: linear-gradient(to bottom, #ffffff 0px, #ffffff 864px, #cbd5e1 864px, #cbd5e1 896px, #ffffff 896px);
          background-size: 100% 896px;
        }

        /* Native Print Formatting */
        @media print {
          header, sidebar, .no-print, .toolbar-container, .status-bar { 
            display: none !important; 
          }
          body, html, #root, .main-content { 
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
          .paper-canvas { 
            box-shadow: none !important; 
            margin: 0 !important; 
            width: 100% !important; 
            border: none !important; 
            padding: 0 !important; 
            background: white !important;
            background-image: none !important;
          }
          ::-webkit-scrollbar { 
            display: none !important; 
          }
        }
      `}</style>

      {/* Top Header */}
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

        {/* Account & Export Controls */}
        <div className="flex items-center gap-3">
          <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Printer className="h-4 w-4 text-slate-500" /> Print
          </button>

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
      <div className="flex flex-1 overflow-hidden relative">
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
        <div className="main-content flex flex-1 flex-col overflow-hidden bg-slate-200">
          
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

            <button onClick={() => executeCommand('bold')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.bold ? 'bg-slate-200 text-blue-600' : ''}`}><Bold className="h-4 w-4" /></button>
            <button onClick={() => executeCommand('italic')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.italic ? 'bg-slate-200 text-blue-600' : ''}`}><Italic className="h-4 w-4" /></button>
            <button onClick={() => executeCommand('underline')} className={`p-1.5 rounded hover:bg-slate-100 ${activeFormats.underline ? 'bg-slate-200 text-blue-600' : ''}`}><Underline className="h-4 w-4" /></button>

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
          </div>

          {/* Paper Canvas */}
          <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-slate-200">
            <div 
              className="paper-canvas bg-white shadow-xl border border-slate-300 transition-all duration-200"
              style={{ width: '816px', minHeight: '1056px', padding: '96px' }}
            >
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onKeyUp={checkActiveFormats}
                onMouseUp={checkActiveFormats}
                className="outline-none text-slate-900 leading-relaxed font-sans min-h-[864px]"
              />
            </div>
          </div>

          {/* Bottom Status Bar */}
          <div className="status-bar no-print flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs font-semibold text-slate-500">
            <div>Word Processor Workspace</div>
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
