import React, { useRef, useState } from 'react';
import { Download, Upload, X, FileJson, CheckCircle, AlertCircle } from 'lucide-react';
import { Bet } from '../../types';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: { bets: Bet[], startingBankroll?: number }) => void;
  currentData: { bets: Bet[], startingBankroll: number | null };
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({ 
  isOpen, 
  onClose, 
  onImport, 
  currentData 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleDownload = () => {
    const dataStr = JSON.stringify(currentData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `midnight_pro_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setStatus('success');
    setMessage('Backup downloaded successfully!');
    setTimeout(() => { onClose(); setStatus('idle'); }, 1500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('idle');
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const rawContent = event.target?.result as string;
        const json = JSON.parse(rawContent);
        
        let betsToImport: Bet[] = [];
        let bankrollToImport: number | undefined = undefined;

        if (Array.isArray(json)) {
          betsToImport = json;
        } else if (json && typeof json === 'object') {
          if (Array.isArray(json.bets)) betsToImport = json.bets;
          if (typeof json.startingBankroll === 'number' || typeof json.startingBankroll === 'string') {
            bankrollToImport = Number(json.startingBankroll);
          }
        }

        if (betsToImport.length > 0 || bankrollToImport !== undefined) {
          onImport({ bets: betsToImport, startingBankroll: bankrollToImport });
          setStatus('success');
          setMessage(`Successfully loaded ${betsToImport.length} bets!`);
          setTimeout(() => { onClose(); setStatus('idle'); }, 1500);
        } else {
          throw new Error('No valid data found.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('Invalid backup file.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-ink-paper border border-ink-gray rounded-2xl w-full max-w-lg p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {status !== 'idle' && (
          <div className={`absolute top-0 left-0 right-0 p-3 text-sm font-bold text-center flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300 ${
            status === 'success' ? 'bg-status-win text-ink-base' : 'bg-status-loss text-white'
          }`}>
            {status === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {message}
          </div>
        )}

        <div className="flex items-center justify-between mb-6 mt-2 shrink-0">
          <h2 className="text-xl font-bold text-ink-text flex items-center gap-2">
            <FileJson className="text-ink-accent" /> Data Management
          </h2>
          <button onClick={onClose} className="text-ink-text/40 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="overflow-y-auto space-y-6 pr-2 -mr-2 custom-scrollbar">
          
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-4">
              <div className="p-4 rounded-xl bg-ink-base border border-ink-gray hover:border-ink-accent/50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-ink-accent/10 rounded-lg text-ink-accent">
                    <Download size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-ink-text text-sm">Backup History</h3>
                    <p className="text-xs text-ink-text/60 mb-2">Save JSON file.</p>
                    <button onClick={handleDownload} className="w-full px-3 py-1.5 bg-ink-paper hover:bg-ink-gray border border-ink-gray text-ink-text text-xs font-bold rounded-lg transition-colors">
                      Download
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-ink-base border border-ink-gray hover:border-amber-500/50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                    <Upload size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-ink-text text-sm">Restore History</h3>
                    <p className="text-xs text-ink-text/60 mb-2">Overwrite data.</p>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json,application/json" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="w-full px-3 py-1.5 bg-ink-paper hover:bg-ink-gray border border-ink-gray text-ink-text text-xs font-bold rounded-lg transition-colors">
                      Select File
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};