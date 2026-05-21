/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  Save, 
  RotateCcw, 
  Table as TableIcon, 
  Download, 
  Undo2, 
  Redo2, 
  Users, 
  ArrowRight, 
  ArrowLeft, 
  AlertTriangle, 
  X, 
  LogIn, 
  LogOut, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Check 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { loadUserData, saveUserData } from './firebaseService';
import { LedgerRow } from './types';

export default function App() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [history, setHistory] = useState<LedgerRow[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSaved, setIsSaved] = useState(false);

  // Auth & Cloud State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Onboarding / Setup states
  const [people, setPeople] = useState<string[]>([]);
  const [hasSetup, setHasSetup] = useState(false);
  const [peopleCount, setPeopleCount] = useState<number>(2);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [tempNames, setTempNames] = useState<string[]>(['', '']);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Monitor Auth State and fetch Cloud Data if logged in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        setIsGuest(false);
        setCloudSyncing(true);
        try {
          const cloudData = await loadUserData(currentUser.uid);
          
          if (cloudData && (cloudData.people.length > 0 || cloudData.rows.length > 0)) {
            // Restore from Firebase
            setPeople(cloudData.people);
            const initialCloudRows: LedgerRow[] = cloudData.rows.length > 0 ? cloudData.rows : [{ id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online' as const, person: cloudData.people[0] || '' }];
            setRows(initialCloudRows);
            setHasSetup(cloudData.people.length > 0);
            setHistory([initialCloudRows]);
            setHistoryIndex(0);
            setSyncNotice("Cloud ledger synchronized successfully!");
          } else {
            // Check for previous LocalStorage entries to migrate to the user's cloud account
            const localPeopleRaw = localStorage.getItem('smart-ledger-people');
            const localRowsRaw = localStorage.getItem('smart-ledger-data');
            
            let localPeople: string[] = [];
            let localRows: LedgerRow[] = [];

            if (localPeopleRaw) {
              try { localPeople = JSON.parse(localPeopleRaw); } catch (e) {}
            }
            if (localRowsRaw) {
              try { localRows = JSON.parse(localRowsRaw); } catch (e) {}
            }

            if (localPeople.length > 0 || localRows.length > 0) {
              const rowsToMigrate: LedgerRow[] = localRows.length > 0 ? localRows : [{ id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online' as const, person: localPeople[0] || '' }];
              setPeople(localPeople);
              setRows(rowsToMigrate);
              setHasSetup(localPeople.length > 0);
              setHistory([rowsToMigrate]);
              setHistoryIndex(0);

              // Auto-upload to Cloud
              await saveUserData(currentUser.uid, currentUser.email || '', localPeople, rowsToMigrate);
              setSyncNotice("Transferred your offline ledger to Google Cloud secure backup!");
            } else {
              // Standard initial onboarding state
              setPeople([]);
              setRows([{ id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online' as const, person: '' }]);
              setHasSetup(false);
              setSetupStep(1);
            }
          }
        } catch (err) {
          console.error("Error synchronizing profile", err);
        } finally {
          setCloudSyncing(false);
          setTimeout(() => setSyncNotice(null), 5000);
        }
      } else {
        // Unauthenticated. If they already had Guest mode saved, boot directly
        const guestPref = localStorage.getItem('smart-ledger-guest-mode') === 'true';
        if (guestPref) {
          handleGuestMode();
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setAuthLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Google Sign In Failure", err);
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setIsGuest(false);
      localStorage.removeItem('smart-ledger-guest-mode');
      // Clear data states to ensure pure workspace boundaries
      setRows([{ id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online' as const, person: '' }]);
      setPeople([]);
      setHasSetup(false);
      setSetupStep(1);
    } catch (err) {
      console.error("Sign Out Failure", err);
    }
  };

  const handleGuestMode = () => {
    setIsGuest(true);
    localStorage.setItem('smart-ledger-guest-mode', 'true');
    
    const savedPeople = localStorage.getItem('smart-ledger-people');
    let loadedPeople: string[] = [];
    if (savedPeople) {
      try {
        const parsed = JSON.parse(savedPeople);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedPeople = parsed;
          setPeople(parsed);
          setHasSetup(true);
        }
      } catch (e) {}
    }

    const savedData = localStorage.getItem('smart-ledger-data');
    let initialRows: LedgerRow[] = [];
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        initialRows = parsed.map((row: any) => ({
          ...row,
          paymentMode: (row.paymentMode === 'Cash' || row.paymentMode === 'Online') ? row.paymentMode : 'Online' as const,
          person: row.person || (loadedPeople[0] || '')
        }));
      } catch (e) {
        initialRows = [{ id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online' as const, person: loadedPeople[0] || '' }];
      }
    } else {
      initialRows = [{ id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online' as const, person: loadedPeople[0] || '' }];
    }

    setRows(initialRows);
    setHistory([initialRows]);
    setHistoryIndex(0);
  };

  const handleExitGuestMode = () => {
    setIsGuest(false);
    localStorage.removeItem('smart-ledger-guest-mode');
  };

  // Helper to update rows and history
  const updateRowsWithHistory = useCallback((newRows: LedgerRow[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    
    if (newHistory.length === 0 || JSON.stringify(newHistory[newHistory.length - 1]) !== JSON.stringify(rows)) {
      newHistory.push(rows);
    }
    
    if (newHistory.length > 50) {
      newHistory.shift();
    }

    setRows(newRows);
    setHistory([...newHistory, newRows]);
    setHistoryIndex(newHistory.length);
    setIsSaved(false);
  }, [rows, history, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setRows(history[prevIndex]);
      setHistoryIndex(prevIndex);
      setIsSaved(false);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setRows(history[nextIndex]);
      setHistoryIndex(nextIndex);
      setIsSaved(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Calculate total sum
  const totalAmount = useMemo(() => {
    return rows.reduce((sum, row) => sum + (row.amount || 0), 0);
  }, [rows]);

  // Calculate spend breakdown by person
  const spendBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    people.forEach(p => {
      map[p] = 0;
    });
    rows.forEach(row => {
      if (row.person) {
        map[row.person] = (map[row.person] || 0) + (row.amount || 0);
      }
    });
    return map;
  }, [rows, people]);

  const addRow = (index?: number) => {
    const newRow: LedgerRow = {
      id: crypto.randomUUID(),
      particulars1: '',
      particulars2: '',
      amount: 0,
      paymentMode: 'Online',
      person: people[0] || '',
    };
    
    let updatedRows: LedgerRow[];
    if (typeof index === 'number') {
      updatedRows = [...rows];
      updatedRows.splice(index + 1, 0, newRow);
    } else {
      updatedRows = [...rows, newRow];
    }
    updateRowsWithHistory(updatedRows);
  };

  const updateRow = (id: string, field: keyof LedgerRow, value: string | number) => {
    const updatedRows = rows.map(row => (row.id === id ? { ...row, [field]: value } : row));
    updateRowsWithHistory(updatedRows);
  };

  const deleteRow = (id: string) => {
    let updatedRows: LedgerRow[];
    if (rows.length > 1) {
      updatedRows = rows.filter(row => row.id !== id);
    } else {
      updatedRows = [{ id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online', person: people[0] || '' }];
    }
    updateRowsWithHistory(updatedRows);
  };

  const saveToLocal = async () => {
    setIsSaved(false);
    if (user) {
      setCloudSyncing(true);
      try {
        await saveUserData(user.uid, user.email || '', people, rows);
        // Sync local storage as reliable fallback
        localStorage.setItem('smart-ledger-data', JSON.stringify(rows));
        localStorage.setItem('smart-ledger-people', JSON.stringify(people));
        setIsSaved(true);
      } catch (err) {
        console.error("Cloud preservation failure", err);
      } finally {
        setCloudSyncing(false);
        setTimeout(() => setIsSaved(false), 3000);
      }
    } else {
      localStorage.setItem('smart-ledger-data', JSON.stringify(rows));
      localStorage.setItem('smart-ledger-people', JSON.stringify(people));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const exportToCSV = () => {
    const headers = ['S.No', 'Particulars', 'Other Particulars', 'Amount (₹)', 'Payment Mode', 'Person'];
    const csvContent = [
      headers.join(','),
      ...rows.map((row, index) => {
        return [
          index + 1,
          `"${row.particulars1.replace(/"/g, '""')}"`,
          `"${row.particulars2.replace(/"/g, '""')}"`,
          row.amount,
          row.paymentMode,
          `"${row.person.replace(/"/g, '""')}"`
        ].join(',');
      }),
      ['', 'Grand Total', '', totalAmount, '', ''].join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ledger_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetData = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    const initialRow: LedgerRow = { id: crypto.randomUUID(), particulars1: '', particulars2: '', amount: 0, paymentMode: 'Online', person: '' };
    setRows([initialRow]);
    setHistory([[initialRow]]);
    setHistoryIndex(0);
    setPeople([]);
    setHasSetup(false);
    setSetupStep(1);
    setPeopleCount(2);
    setTempNames(['', '']);
    setSetupError(null);
    localStorage.removeItem('smart-ledger-data');
    localStorage.removeItem('smart-ledger-people');
    localStorage.removeItem('smart-ledger-guest-mode');
    
    if (user) {
      setCloudSyncing(true);
      try {
        await saveUserData(user.uid, user.email || '', [], [initialRow]);
      } catch (err) {
        console.error("Could not reset on Cloud", err);
      } finally {
        setCloudSyncing(false);
      }
    }
    
    setShowResetConfirm(false);
  };

  const handlePeopleCountChange = (count: number) => {
    setSetupError(null);
    setPeopleCount(count);
    const updatedNames = Array.from({ length: count }, (_, i) => tempNames[i] || '');
    setTempNames(updatedNames);
  };

  const goToStep2 = () => {
    if (peopleCount < 1 || peopleCount > 15) {
      setSetupError("Please choose between 1 and 15 individuals.");
      return;
    }
    setSetupError(null);
    const updatedNames = Array.from({ length: peopleCount }, (_, i) => tempNames[i] || '');
    setTempNames(updatedNames);
    setSetupStep(2);
  };

  const completeSetup = async () => {
    setSetupError(null);
    const finalNames = tempNames.map((name, i) => name.trim() || `Individual ${i + 1}`);
    
    // Check uniqueness
    const seen = new Set<string>();
    for (const name of finalNames) {
      if (seen.has(name.toLowerCase())) {
        setSetupError(`Duplicate name found: "${name}". Please provide a unique name for each individual.`);
        return;
      }
      seen.add(name.toLowerCase());
    }

    setPeople(finalNames);
    setHasSetup(true);
    localStorage.setItem('smart-ledger-people', JSON.stringify(finalNames));

    // Propagate participant set to current ledger rows
    const updatedRows = rows.map(r => ({ ...r, person: r.person || finalNames[0] }));
    setRows(updatedRows);
    setHistory([...history.slice(0, historyIndex + 1), updatedRows]);
    setHistoryIndex(historyIndex + 1);

    // Save automatically if authenticated
    if (user) {
      setCloudSyncing(true);
      try {
        await saveUserData(user.uid, user.email || '', finalNames, updatedRows);
      } catch (err) {
        console.error("Setup cloud save error", err);
      } finally {
        setCloudSyncing(false);
      }
    }
  };

  const editParticipants = () => {
    setSetupError(null);
    setPeopleCount(people.length);
    setTempNames([...people]);
    setSetupStep(2);
    setHasSetup(false);
  };

  // 1. Loading screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center border border-indigo-100">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 animate-pulse">
            Connecting Secure Workspace...
          </span>
        </div>
      </div>
    );
  }

  // 2. Beautiful Authentication Welcome Page
  if (!user && !isGuest) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white max-w-lg w-full rounded-2xl shadow-xl border border-slate-100 p-8 md:p-10 relative overflow-hidden"
        >
          {/* Subtle Aesthetic Gradient Arc */}
          <div className="absolute inset-0 bg-radial-[circle_at_top_right] from-indigo-50/40 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-3.5 mb-8">
              <div className="bg-indigo-600 p-3 rounded-2xl shadow-indigo-100 shadow-xl">
                <TableIcon className="text-white w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-serif italic font-bold text-slate-900 leading-tight">Smart Ledger Pro</h2>
                <p className="text-slate-400 text-[10px] uppercase tracking-[0.2em] font-medium">Digital Financial Records</p>
              </div>
            </div>

            <div className="space-y-4 mb-10">
              <h1 className="text-3xl font-sans font-bold text-slate-800 tracking-tight leading-none">
                Clean ledger tracking for your shared funds.
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed font-sans">
                Organize shared expenses, track amounts, and automatically calculate spend distribution instantly. Persist records securely in the cloud or store them offline.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all flex items-center justify-center gap-3 cursor-pointer text-md border-none focus:outline-none"
              >
                {/* Google SVG G Logo */}
                <svg className="w-5 h-5 shrink-0 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">or</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <button
                type="button"
                onClick={handleGuestMode}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold py-3.5 px-6 rounded-xl border border-slate-200/50 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <CloudOff className="w-4 h-4 text-slate-400" />
                Store Offline (Guest Mode)
              </button>
            </div>
            
            <p className="text-[10px] text-center text-slate-400 mt-8 leading-relaxed font-sans">
              Google Sign-In integrates zero-config Firestore rules. Guest mode caches locally under browser storage.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // 3. STEP 1 ONBOARDING UI
  if (!hasSetup && setupStep === 1) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-slate-100 p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-indigo-100 shadow-lg">
              <Users className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-serif italic font-bold">Smart Ledger Pro</h2>
              <p className="text-slate-400 text-[9px] uppercase tracking-[0.2em] font-medium">Individual Onboarding</p>
            </div>
          </div>

          <h3 className="text-lg font-sans font-semibold mb-2 text-slate-800">How many people are sharing?</h3>
          <p className="text-sm text-slate-500 mb-6 font-sans">Specify the total number of individuals split-funding or tracking expenses inside this ledger.</p>

          {setupError && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-rose-50 border border-rose-100 text-rose-700 text-sm px-4 py-3 rounded-xl mb-4 font-medium flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span>{setupError}</span>
            </motion.div>
          )}

          <div className="flex items-center justify-center gap-4 mb-8">
            <button 
              type="button"
              onClick={() => handlePeopleCountChange(Math.max(1, peopleCount - 1))}
              className="w-12 h-12 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold flex items-center justify-center transition-colors text-lg cursor-pointer border-none"
            >
              -
            </button>
            <input 
              type="number"
              min={1}
              max={15}
              value={peopleCount}
              onChange={(e) => {
                setSetupError(null);
                const val = parseInt(e.target.value) || 2;
                handlePeopleCountChange(Math.max(1, Math.min(15, val)));
              }}
              className="w-24 text-center text-2xl font-bold border border-slate-200/60 bg-slate-50 rounded-xl py-2 font-mono text-indigo-700 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
            <button 
              type="button"
              onClick={() => handlePeopleCountChange(Math.min(15, peopleCount + 1))}
              className="w-12 h-12 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold flex items-center justify-center transition-colors text-lg cursor-pointer border-none"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={goToStep2}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer border-none focus:outline-none"
          >
            Next: Individual names
            <ArrowRight className="w-4 h-4" />
          </button>

          {isGuest && (
            <button
              type="button"
              onClick={handleExitGuestMode}
              className="mt-4 w-full text-slate-400 hover:text-indigo-600 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-none focus:outline-none transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to Start Page
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // 4. STEP 2 ONBOARDING UI
  if (!hasSetup && setupStep === 2) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-slate-100 p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-indigo-100 shadow-lg">
              <Users className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-serif italic font-bold">Smart Ledger Pro</h2>
              <p className="text-slate-400 text-[9px] uppercase tracking-[0.2em] font-medium">Individual Onboarding</p>
            </div>
          </div>

          <h3 className="text-lg font-sans font-semibold mb-2 text-slate-800">Who are the individuals?</h3>
          <p className="text-sm text-slate-500 mb-6 font-sans">Provide unique names or nicknames for the {peopleCount} sharing members.</p>

          {setupError && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-rose-50 border border-rose-100 text-rose-700 text-sm px-4 py-3 rounded-xl mb-4 font-medium flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span>{setupError}</span>
            </motion.div>
          )}

          <div className="max-h-72 overflow-y-auto space-y-3.5 mb-8 pr-1 border border-slate-100 p-3 rounded-xl bg-slate-50/50">
            {tempNames.map((name, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 w-8">{String(i + 1).padStart(2, '0')}.</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setSetupError(null);
                    const updated = [...tempNames];
                    updated[i] = e.target.value;
                    setTempNames(updated);
                  }}
                  placeholder={`Individual ${i + 1} name`}
                  className="flex-1 bg-white border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white text-slate-700 font-semibold transition-all"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSetupStep(1)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer text-sm border-none focus:outline-none"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={completeSetup}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-sm border-none focus:outline-none"
            >
              Start Tracking
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {isGuest && (
            <button
              type="button"
              onClick={handleExitGuestMode}
              className="mt-4 w-full text-slate-400 hover:text-indigo-600 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-none focus:outline-none transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to Start Page
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // 5. MAIN DASHBOARD UI
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Floating Sync notifications */}
        <AnimatePresence>
          {syncNotice && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-indigo-900 text-white text-sm py-3 px-6 rounded-full font-sans font-medium shadow-2xl flex items-center gap-2.5 border border-indigo-700/50"
            >
              <Cloud className="w-4 h-4 text-indigo-300 shrink-0" />
              <span>{syncNotice}</span>
              <button onClick={() => setSyncNotice(null)} className="ml-2 hover:text-indigo-200 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-indigo-200 shadow-lg">
              <TableIcon className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif italic font-bold tracking-tight">Smart Ledger Pro</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-slate-500 text-[10px] uppercase tracking-[0.2em] font-medium leading-none">Digital Financial Records</span>
                {cloudSyncing ? (
                  <span className="flex items-center gap-1 text-[9px] text-indigo-500 font-mono">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    Saving changes...
                  </span>
                ) : user ? (
                  <span className="flex items-center gap-1 text-[9px] text-green-600 font-mono">
                    <Cloud className="w-2.5 h-2.5 text-green-500" />
                    Cloud Synced
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] text-yellow-600 font-mono">
                    <CloudOff className="w-2.5 h-2.5 text-yellow-500" />
                    Local Mode
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Real-time Google Authentication Widget */}
            {user ? (
              <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200/70 p-1.5 pr-3 shadow-sm text-sm">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || "User"} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full border border-indigo-100" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    {user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-700 leading-none">{user.displayName || "Ledger Owner"}</span>
                  <span className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">{user.email}</span>
                </div>
                <div className="h-4 w-px bg-slate-200 mx-1.5 hidden sm:block" />
                <button
                  onClick={handleSignOut}
                  className="p-1 px-2.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors text-slate-500 text-xs font-semibold flex items-center gap-1 cursor-pointer border-none"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-yellow-50/70 rounded-xl border border-yellow-100 p-1.5 px-3 shadow-xs text-xs">
                <CloudOff className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                <div className="flex flex-col text-left">
                  <span className="text-[11px] font-semibold text-yellow-800 leading-none">Offline Guest</span>
                  <button
                    onClick={handleExitGuestMode}
                    className="text-[9px] text-slate-400 hover:text-slate-600 font-mono mt-0.5 border-none bg-transparent p-0 cursor-pointer flex items-center gap-0.5 leading-none focus:outline-none transition-colors"
                    title="Exit Guest Mode and Return to Starting Page"
                  >
                    Return to Start
                  </button>
                </div>
                <div className="h-4 w-px bg-yellow-250 mx-1 hidden sm:block" />
                <button
                  onClick={handleGoogleLogin}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-2.5 py-1.5 font-bold shadow-sm flex items-center gap-1 transition-all cursor-pointer text-xs border-none focus:outline-none"
                >
                  <LogIn className="w-3 h-3" />
                  Sync Google
                </button>
              </div>
            )}

            <div className="flex bg-white rounded-md shadow-sm border border-slate-200 p-1">
              <button
                onClick={undo}
                disabled={historyIndex <= 0}
                className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors rounded cursor-pointer border-none bg-transparent"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors rounded cursor-pointer border-none bg-transparent"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 max-w-full overflow-x-auto scrollbar-none py-1">
              <button
                onClick={editParticipants}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 transition-colors rounded-md cursor-pointer bg-white focus:outline-none shrink-0"
                title="Edit sharing individuals and their names"
              >
                <Users className="w-4 h-4 text-indigo-500" />
                Person: ({people.length})
              </button>

              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors rounded-md border border-indigo-100 cursor-pointer bg-white focus:outline-none shrink-0"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>

              <button
                onClick={resetData}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors rounded-md border border-slate-200 cursor-pointer bg-white focus:outline-none shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>
        </header>

        {/* Individual Spend Summary Widgets (Dynamic Breakdown) */}
        {people.length > 0 && (
          <div className="mb-6 bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
            <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-400 mb-3 ml-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              Dynamic Spend Distribution
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {people.map(p => {
                const amount = spendBreakdown[p] || 0;
                return (
                  <div key={p} className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl shadow-sm hover:border-indigo-100 transition-colors">
                    <span className="text-xs font-semibold text-slate-600">{p}</span>
                    <span className="text-xs font-mono font-bold text-indigo-700">₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Ledger Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-serif italic text-[11px] uppercase tracking-wider text-slate-500 w-16 text-center border-r border-slate-200/60">S.No</th>
                  <th className="px-4 py-3 font-serif italic text-[11px] uppercase tracking-wider text-slate-500 px-6">Particulars</th>
                  <th className="px-4 py-3 font-serif italic text-[11px] uppercase tracking-wider text-slate-500">Other Particulars</th>
                  <th className="px-4 py-3 font-serif italic text-[11px] uppercase tracking-wider text-slate-500 w-40 border-l border-slate-200/60">Amount (₹)</th>
                  <th className="px-4 py-3 font-serif italic text-[11px] uppercase tracking-wider text-slate-500 w-32 border-l border-slate-200/60 text-center">Mode</th>
                  <th className="px-4 py-3 font-serif italic text-[11px] uppercase tracking-wider text-slate-500 w-44 border-l border-slate-200/60 text-center">Person</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false}>
                  {rows.map((row, index) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      layout
                      className="group hover:bg-indigo-50/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono text-center border-r border-slate-200/60">
                        {String(index + 1).padStart(2, '0')}
                      </td>
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={row.particulars1}
                          onChange={(e) => updateRow(row.id, 'particulars1', e.target.value)}
                          placeholder="Primary particulars..."
                          className="w-full bg-transparent border-none focus:ring-0 text-sm focus:outline-none placeholder:text-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.particulars2}
                          onChange={(e) => updateRow(row.id, 'particulars2', e.target.value)}
                          placeholder="Additional particulars..."
                          className="w-full bg-transparent border-none focus:ring-0 text-sm focus:outline-none placeholder:text-slate-300 text-slate-400"
                        />
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200/60">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 font-mono text-sm inline-block w-4">₹</span>
                          <input
                            type="number"
                            value={row.amount || ''}
                            onChange={(e) => updateRow(row.id, 'amount', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono focus:outline-none placeholder:text-slate-300 text-slate-700"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200/60">
                        <select
                          value={row.paymentMode}
                          onChange={(e) => updateRow(row.id, 'paymentMode', e.target.value as any)}
                          className="w-full bg-transparent border-none focus:ring-0 text-sm focus:outline-none text-slate-600 appearance-none cursor-pointer text-center font-medium"
                        >
                          <option value="Online">Online</option>
                          <option value="Cash">Cash</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 border-l border-slate-200/60">
                        <select
                          value={row.person}
                          onChange={(e) => updateRow(row.id, 'person', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 text-sm focus:outline-none text-indigo-700 font-semibold appearance-none cursor-pointer text-center"
                        >
                          <option value="">Select...</option>
                          {people.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => addRow(index)}
                            className="p-1.5 text-indigo-400 hover:text-indigo-600 transition-all rounded-full hover:bg-indigo-50 border border-transparent hover:border-indigo-100 cursor-pointer bg-transparent"
                            title="Add Row Below"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteRow(row.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-500 transition-all rounded-full hover:bg-rose-50 cursor-pointer border-none bg-transparent"
                            title="Delete Row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/50 font-bold border-t border-slate-200">
                  <td colSpan={3} className="px-6 py-4 text-right text-[11px] text-slate-500 uppercase tracking-[0.2em] font-serif italic">
                    Grand Total
                  </td>
                  <td className="px-4 py-4 text-indigo-700 font-mono text-lg border-l border-slate-200 bg-indigo-50/30">
                    <div className="flex items-center gap-1.5 justify-between pr-2">
                      <span className="text-indigo-400 text-sm">₹</span>
                      <span>{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 border-l border-slate-200/60 bg-slate-50/50"></td>
                  <td className="px-4 py-4 border-l border-slate-200/60 bg-slate-50/50"></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="p-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400 max-w-sm text-center md:text-left">
              {user 
                ? 'Your changes are synced securely to the cloud. Click "Save Ledger" to commit adjustments.' 
                : 'Changes are cached locally. Sign in with Google anytime to back up and sync records across devices.'
              }
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => addRow()}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all rounded-lg text-sm font-bold shadow-sm group cursor-pointer border-none"
              >
                <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform text-indigo-600" />
                Add Entry
              </button>
              
              <button
                onClick={saveToLocal}
                className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-bold text-white transition-all transform active:scale-95 shadow-lg cursor-pointer border-none ${
                  isSaved ? 'bg-green-600 shadow-green-100 focus:outline-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100 focus:outline-none'
                }`}
              >
                <Save className={`w-4 h-4 ${isSaved ? 'animate-bounce' : ''}`} />
                {isSaved ? 'Data Saved!' : 'Save Ledger'}
              </button>
            </div>
          </div>
        </div>

        {/* Instructions Footer */}
        <footer className="mt-8 text-center flex flex-col sm:flex-row sm:items-center sm:justify-between px-2 gap-2">
          <p className="text-xs text-slate-400">
            {user 
              ? `Connected to Firestore Database` 
              : `Running in sandbox mode with primary local caching.`
            }
          </p>
          <p className="text-xs text-slate-400">
           <i><b> Designed by- Sachin Adi</b></i>
          </p>
        </footer>
      </div>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-slate-100 p-6 relative overflow-hidden text-left"
            >
              <button
                onClick={() => setShowResetConfirm(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-start gap-4 mb-5">
                <div className="bg-rose-50 p-3 rounded-xl text-rose-600 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-sans font-bold text-slate-800">Reset All Data?</h3>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed font-sans">
                    This will permanently clear all rows, delete your sharing individuals list, and reset both local cache and cloud data. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer border-none focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReset}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl hover:shadow-lg shadow-rose-100 transition-all cursor-pointer border-none focus:outline-none"
                >
                  Confirm Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

