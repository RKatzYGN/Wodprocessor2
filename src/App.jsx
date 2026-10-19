import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { 
  FileText, Plus, Trash2, Printer, Download,
  Bold, Italic, FolderOpen, Check, Clock, LogOut, Key, Mail, FileCode
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
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [pageChunks, setPageChunks] = useState(['<p>Start typing here...</p>']);

  const saveTimeoutRef = useRef(null);

  // Initialize TipTap Engine
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Start typing here...</p>',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      setCharCount(text.length);

      // Split content into physical 864px page chunks dynamically
      repaginateContent(html);
      triggerAutoSave(html, title);
    },
  });

  const repaginateContent = (fullHtml) => {
    const tempDiv = document.createElement('div');
    tempDiv.style.width = '816px';
    tempDiv.style.padding = '96px';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.position = 'absolute';
    tempDiv.innerHTML = fullHtml;
    document.body.appendChild(tempDiv);

    const children = Array.from(tempDiv.children);
    const chunks = [];
    let currentChunk = '';
    let currentHeight = 0;
    const maxHeightPerPage = 864; // Max height for 11in page with 1in padding

    children.forEach((child) => {
      const childHeight = child.offsetHeight || 24;
      if (currentHeight + childHeight > maxHeightPerPage && currentChunk !== '') {
        chunks.push(currentChunk);
        currentChunk = child.outerHTML;
        currentHeight = childHeight;
      } else {
        currentChunk += child.outerHTML;
        currentHeight += childHeight;
      }
    });

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    document.body.removeChild(tempDiv);
    setPageChunks(chunks.length > 0 ? chunks : ['<p>Start typing here...</p>']);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync Documents with Firestore
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

  // Auth Operations
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
    const contentHtml = docItem.content || '<p>Start typing here...</p>';
    if (editor) {
      editor.commands.setContent(contentHtml);
    }
    repaginateContent(contentHtml);
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
      if (editor) {
        editor.commands.setContent(initialContent);
      }
      repaginateContent(initialContent);
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

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    const contentHtml = editor ? editor.getHTML() : '';
    triggerAutoSave(contentHtml, val);
  };

  const handlePrint = () => window.print();

  const exportAsTxt = () => {
    const plainText = editor ? editor.getText() : '';
    const element = document.createElement("a");
    const file = new Blob([plainText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${title || 'document'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const exportAsHtml = () => {
    const html = editor ? editor.getHTML() : '';
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
        .tiptap {
          outline: none !important;
          min-height: 864px;
        }

        /* Physical Page Card Styles */
        .page-card {
          width: 816px !important;
          height: 1056px !important;
          padding: 96px !important;
          background-color: #ffffff !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }

        @media print {
          header, sidebar, .no-print, .toolbar-container, .status-bar, .page-number { 
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
            margin: 0;
          }
          .page-card { 
            box-shadow: none !important; 
            margin: 0 auto !important; 
            width: 8.5in !important; 
            height: 11in !important; 
            padding: 1in !important; 
            page-break-after: always !important; 
            page-break-inside: avoid !important;
            background: white !important;
          }
        }
      `}</style>

      {/* Header */}
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
            <button 
              onClick={() => editor?.chain().focus().toggleBold().run()} 
              className={`p-1.5 rounded hover:bg-slate-100 ${editor?.isActive('bold') ? 'bg-slate-200 text-blue-600' : ''}`}
            >
              <Bold className="h-4 w-4" />
            </button>
            <button 
              onClick={() => editor?.chain().focus().toggleItalic().run()} 
              className={`p-1.5 rounded hover:bg-slate-100 ${editor?.isActive('italic') ? 'bg-slate-200 text-blue-600' : ''}`}
            >
              <Italic className="h-4 w-4" />
            </button>
          </div>

          {/* Multi-Page Canvas Layout */}
          <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 bg-slate-200">
            {pageChunks.map((chunkHtml, idx) => (
              <div key={idx} className="page-card rounded border border-slate-300 relative flex flex-col justify-between">
                {idx === 0 ? (
                  <EditorContent editor={editor} />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: chunkHtml }} className="text-slate-900 leading-relaxed font-sans min-h-[864px]" />
                )}
                <div className="page-number text-right text-xs text-slate-400 no-print select-none pt-4">
                  Page {idx + 1} of {pageChunks.length}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Status Bar */}
          <div className="status-bar no-print flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs font-semibold text-slate-500">
            <div>TipTap Multi-Page Workspace</div>
            <div className="flex items-center gap-4">
              <span>{pageChunks.length} {pageChunks.length === 1 ? 'Page' : 'Pages'}</span>
              <span>{wordCount} Words</span>
              <span>{charCount} Characters</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
