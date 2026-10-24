import React, { useState } from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description: string;
  confirmText?: string;
  isDanger?: boolean;
}

export const ReasonModal: React.FC<ReasonModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  isDanger = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a mandatory reason for this change.');
      return;
    }
    setError('');
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p>{description}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Change / Deletion <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g. Corrected weight after recount; Duplicate entry..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            autoFocus
          />
          {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
        </div>

        <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition min-h-[42px] flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`px-4 py-2.5 text-xs font-bold text-white rounded-xl transition shadow-sm min-h-[42px] flex items-center justify-center ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </form>
    </Modal>
  );
};
