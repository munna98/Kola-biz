import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { IconBrandWhatsapp, IconX } from '@tabler/icons-react';
import { formatDate } from '@/lib/utils';

interface WhatsAppSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherId: string;
  invoiceNo?: string;
  invoiceDate?: string;
  grandTotal?: number;
  partyName?: string;
  partyPhone?: string;
  companyName?: string;
}

/** Strips all non-numeric chars, returns digits only */
function digitsOnly(val: string): string {
  return val.replace(/\D/g, '');
}

/** Normalise to international format: 91XXXXXXXXXX (no + prefix) */
function normalisePhone(raw: string): string {
  const digits = digitsOnly(raw);
  if (!digits) return '';
  // Already has country code (12 digits starting with 91)
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  // 10-digit Indian number — prepend 91
  if (digits.length === 10) return `91${digits}`;
  // Anything else: return as-is
  return digits;
}

/** Check if the normalised phone looks valid for WhatsApp */
function isPhoneValid(phone: string): boolean {
  const digits = digitsOnly(phone);
  // Accept 10-digit (will be prefixed) or 11-12 digit with country code
  return digits.length >= 10 && digits.length <= 13;
}

function buildDefaultMessage(params: {
  partyName?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  grandTotal?: number;
  companyName?: string;
}): string {
  const { partyName, invoiceNo, invoiceDate, grandTotal, companyName } = params;
  const formattedDate = invoiceDate ? formatDate(invoiceDate) : '';
  const formattedAmount = grandTotal
    ? `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : '';

  const lines: string[] = [];
  if (partyName && partyName.toLowerCase() !== 'cash') {
    lines.push(`Dear ${partyName},`);
    lines.push('');
  }
  if (invoiceNo) {
    lines.push(
      `Your invoice *${invoiceNo}*${formattedDate ? ` dated ${formattedDate}` : ''}${formattedAmount ? ` for ${formattedAmount}` : ''} is ready.`
    );
  }
  lines.push('');
  lines.push('Thank you for your business!');
  if (companyName) {
    lines.push(`— ${companyName}`);
  }
  return lines.join('\n');
}

export default function WhatsAppSendDialog({
  open,
  onOpenChange,
  invoiceNo,
  invoiceDate,
  grandTotal,
  partyName,
  partyPhone,
  companyName,
}: WhatsAppSendDialogProps) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Re-initialise fields whenever dialog opens or inputs change
  useEffect(() => {
    if (open) {
      setPhone(partyPhone || '');
      setMessage(
        buildDefaultMessage({ partyName, invoiceNo, invoiceDate, grandTotal, companyName })
      );
    }
  }, [open, partyPhone, partyName, invoiceNo, invoiceDate, grandTotal, companyName]);

  const handleSend = async () => {
    const normalised = normalisePhone(phone);
    if (!isPhoneValid(phone)) {
      toast.error('Enter a valid 10-digit WhatsApp number');
      return;
    }
    try {
      setIsSending(true);
      await invoke('open_whatsapp_url', {
        phone: normalised,
        message,
      });
      toast.success('Opening WhatsApp…');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Could not open WhatsApp. Is it installed?');
    } finally {
      setIsSending(false);
    }
  };

  const phoneDigits = digitsOnly(phone);
  const sendEnabled = isPhoneValid(phone) && message.trim().length > 0 && !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <IconBrandWhatsapp size={20} className="text-green-500" />
            Send Invoice via WhatsApp
          </DialogTitle>
        </DialogHeader>

        {/* Invoice summary pill */}
        {(invoiceNo || grandTotal) && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground bg-muted/50 border rounded-md px-3 py-2">
            {invoiceNo && <span className="font-mono font-semibold text-foreground">{invoiceNo}</span>}
            {invoiceDate && (
              <>
                <span>•</span>
                <span>{formatDate(invoiceDate)}</span>
              </>
            )}
            {grandTotal !== undefined && (
              <>
                <span>•</span>
                <span className="font-mono font-semibold text-foreground">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
            {partyName && partyName.toLowerCase() !== 'cash' && (
              <>
                <span>•</span>
                <span>{partyName}</span>
              </>
            )}
          </div>
        )}

        <div className="space-y-4">
          {/* Phone field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">WhatsApp Number</Label>
            <div className="relative">
              <Input
                id="whatsapp-phone-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210 or +91 98765 43210"
                className="h-9 text-sm pr-16"
                inputMode="tel"
              />
              {phone && (
                <button
                  type="button"
                  onClick={() => setPhone('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
            {phoneDigits.length > 0 && !isPhoneValid(phone) && (
              <p className="text-xs text-destructive">Please enter a valid phone number (10 digits)</p>
            )}
            {isPhoneValid(phone) && (
              <p className="text-xs text-muted-foreground">
                Will send to: <span className="font-mono">+{normalisePhone(phone)}</span>
              </p>
            )}
          </div>

          {/* Message field */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Message</Label>
            <Textarea
              id="whatsapp-message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="text-sm min-h-[120px] resize-none"
              placeholder="Type your message…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={!sendEnabled}
            className="h-9 gap-2 bg-green-600 hover:bg-green-700 text-white"
            id="whatsapp-send-btn"
          >
            <IconBrandWhatsapp size={16} />
            {isSending ? 'Opening…' : 'Send on WhatsApp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
