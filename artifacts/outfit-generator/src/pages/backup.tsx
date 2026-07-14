/**
 * BackupPage — export and import wardrobe data.
 *
 * Export: generates a JSON file containing all clothing items (with embedded
 * image data URLs), outfits, and outfit relationships.
 * Import: reads a JSON backup file and replaces the current local database.
 */

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { exportBackup, importBackup } from '@/lib/backup';
import { useQueryClient } from '@tanstack/react-query';

type Status = 'idle' | 'exporting' | 'importing' | 'success' | 'error';

export default function BackupPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const queryClient = useQueryClient();

  const handleExport = async () => {
    setStatus('exporting');
    setErrorMsg(null);
    try {
      await exportBackup();
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error('Export failed:', err);
      setErrorMsg('Export failed. Please try again.');
      setStatus('error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    pendingFileRef.current = file;
    setShowImportConfirm(true);
  };

  const handleImportConfirmed = async () => {
    const file = pendingFileRef.current;
    if (!file) return;
    setShowImportConfirm(false);
    setStatus('importing');
    setErrorMsg(null);
    try {
      await importBackup(file);
      queryClient.invalidateQueries();
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error('Import failed:', err);
      setErrorMsg(
        err instanceof Error && err.message.includes('Invalid')
          ? 'This file doesn\'t look like a valid vanity backup.'
          : 'Import failed. The backup file may be corrupted.',
      );
      setStatus('error');
    }
    pendingFileRef.current = null;
  };

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-secondary/10">

      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">
          Backup 💾
        </h1>
        <p className="font-medium text-muted-foreground text-sm">
          Save or restore your entire vanity — all products, looks, and photos.
        </p>
      </header>

      {/* Status banners */}
      {status === 'success' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-center gap-3 border-2 border-black rounded-xl bg-primary p-4
                     shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="font-bold text-sm uppercase tracking-tight">Done!</p>
        </motion.div>
      )}

      {status === 'error' && errorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-start gap-3 border-2 border-red-500 rounded-xl bg-red-50 p-4"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
          <p className="text-sm font-medium text-red-700">{errorMsg}</p>
        </motion.div>
      )}

      {/* Export card */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b-2 border-black bg-primary">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">Export</h2>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground leading-snug">
            Creates a JSON backup file containing all your products, photos, and saved looks.
            Keep it somewhere safe — iCloud Drive, Google Drive, etc.
          </p>
          <button
            onClick={handleExport}
            disabled={status === 'exporting' || status === 'importing'}
            className="w-full flex items-center justify-center gap-2 py-3
                       border-4 border-black rounded-2xl bg-black text-white
                       font-display font-bold text-base uppercase tracking-tight
                       shadow-[4px_4px_0px_0px_rgba(0,0,0,0.4)]
                       active:translate-x-1 active:translate-y-1 active:shadow-none
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Download className="w-5 h-5" />
            {status === 'exporting' ? 'Exporting…' : 'Export Backup'}
          </button>
        </div>
      </div>

      {/* Import card */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-black bg-secondary/30">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">Restore</h2>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span><strong>Warning:</strong> Restoring a backup replaces ALL current data.</span>
          </div>
          <p className="text-sm text-muted-foreground leading-snug">
            Pick a <code className="text-xs font-mono bg-muted px-1 rounded">.json</code> backup
            file exported from My Digital Vanity.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={status === 'exporting' || status === 'importing'}
            className="w-full flex items-center justify-center gap-2 py-3
                       border-4 border-black rounded-2xl bg-primary
                       font-display font-bold text-base uppercase tracking-tight
                       shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                       active:translate-x-1 active:translate-y-1 active:shadow-none
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Upload className="w-5 h-5" />
            {status === 'importing' ? 'Restoring…' : 'Choose Backup File'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Import confirmation dialog */}
      {showImportConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
        >
          <motion.div
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
                       p-6 w-full max-w-sm"
          >
            <h3 className="font-display font-bold text-xl uppercase tracking-tight mb-2">
              Replace everything?
            </h3>
            <p className="text-sm text-muted-foreground mb-5 leading-snug">
              This will permanently delete your current wardrobe and replace it with the backup.
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowImportConfirm(false); pendingFileRef.current = null; }}
                className="flex-1 py-3 rounded-xl border-2 border-black bg-white font-bold
                           text-sm uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-0.5 active:shadow-none transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirmed}
                className="flex-1 py-3 rounded-xl border-2 border-red-600 bg-red-500 text-white
                           font-bold text-sm uppercase
                           shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]
                           active:translate-y-0.5 active:shadow-none transition-all"
              >
                Yes, Restore
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
