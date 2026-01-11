import React, { useRef, useState } from 'react';
import { Download, Upload, X, FileJson, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
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
    link.download = `probet_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setStatus('success');
    setMessage('Backup downloaded successfully!');
    
    setTimeout(() => {
      onClose();
      setStatus('idle');
    }, 1500);
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

        // Flexible parsing logic
        if (Array.isArray(json)) {
          // File is just an array of bets
          betsToImport = json;
        } else if (json && typeof json === 'object') {
          // File is the standard export object
          if (Array.isArray(json.bets)) {
            betsToImport = json.bets;
          }
          if (typeof json.startingBankroll === 'number' || typeof json.startingBankroll === 'string') {
            bankrollToImport = Number(json.startingBankroll);
          }
        }

        if (betsToImport.length > 0 || bankrollToImport !== undefined) {
          onImport({
            bets: betsToImport,
            startingBankroll: bankrollToImport
          });
          setStatus('success');
          setMessage(`Successfully loaded ${betsToImport.length} bets!`);
          setTimeout(() => {
            onClose();
            setStatus('idle');
          }, 1500);
        } else {
          throw new Error('No valid betting data found in file.');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage('Failed to load file. Please ensure it is a valid JSON backup.');
      }
      
      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.onerror = () => {
      setStatus('error');
      setMessage('Error reading file.');
    };

    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-ink-gray rounded-2xl w-full max-w-lg p-6 shadow-2xl relative overflow-hidden">
        
        {/* Status Notification */}
        {status !== 'idle' && (
          <div className={`absolute top-0 left-0 right-0 p-3 text-sm font-bold text-center flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300 ${
            status === 'success' ? 'bg-status-win/90 text-white' : 'bg-status-loss/90 text-white'
          }`}>
            {status === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {message}
          </div>
        )}

        <div className="flex items-center justify-between mb-6 mt-2">
          <h2 className="text-xl font-bold text-ink-text flex items-center gap-2">
            <FileJson className="text-ink-accent" /> Data Management
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-ink-text transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Export Section */}
          <div className="p-5 rounded-xl bg-ink-base border border-ink-gray hover:border-ink-accent/30 transition-colors group">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-ink-accent/10 rounded-lg text-ink-accent group-hover:bg-ink-accent/20 transition-colors">
                <Download size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-ink-text text-lg">Backup Data</h3>
                <p className="text-sm text-gray-500 mt-1 mb-3">
                  Save your betting history to your device. Use this file to restore your progress later.
                </p>
                <button 
                  onClick={handleDownload}
                  className="px-4 py-2 bg-ink-accent hover:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center gap-2"
                >
                  <Download size={16} /> Download JSON
                </button>
              </div>
            </div>
          </div>

          {/* Import Section */}
          <div className="p-5 rounded-xl bg-ink-base border border-ink-gray hover:border-amber-500/30 transition-colors group">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 rounded-lg text-amber-500 group-hover:bg-amber-500/20 transition-colors">
                <Upload size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-ink-text text-lg">Restore Data</h3>
                <p className="text-sm text-gray-500 mt-1 mb-3">
                  Upload a previously saved JSON file. 
                  <span className="text-amber-600/80 block mt-1 text-xs">Note: Valid files will overwrite current data.</span>
                </p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json,application/json"
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-ink-text text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={16} /> Select Backup File
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
