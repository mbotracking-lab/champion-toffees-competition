'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Trophy,
  Camera,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Copy,
  Share2,
  Phone,
  ShieldCheck,
  ScanLine,
  Eye,
  Fingerprint,
  Sparkles,
  Star,
  Gift,
  Clock,
  PartyPopper,
  CircleCheck,
  Ban,
  Image as ImageIcon,
  Store,
  Home,
  User,
  ChevronDown,
  Send,
  Paperclip,
  RefreshCw,
  QrCode,
  X,
} from 'lucide-react';

// ─── Types ───
type ChatPhase = 'greeting' | 'askFullName' | 'askTraderName' | 'askStoreAddress' | 'askWholesale' | 'askPhone' | 'confirmDetails' | 'askSlip' | 'validating' | 'resultConfirmed' | 'resultRejected' | 'resultDuplicate' | 'resultPending' | 'startOver';

interface ChatMessage {
  id: string;
  from: 'bot' | 'user';
  text: string;
  timestamp: Date;
  type?: 'text' | 'image' | 'options' | 'details' | 'result' | 'typing';
  imageUrl?: string;
  options?: string[];
  details?: Record<string, string>;
  resultData?: ValidationResult;
}

interface EntryData {
  id: string;
  entryNumber: string;
  fullName: string;
  traderName: string;
  storeAddress: string;
  wholesaleStore: string;
  consumerPhone: string;
}

interface ValidationResult {
  result: 'confirmed' | 'rejected' | 'duplicate' | 'pending';
  reason: string;
  storeName: string;
  slipDate: string;
  slipAmount: string;
  championProducts: string[];
  confidence: number;
  isFraud: boolean;
}

interface ParticipatingStore {
  id: string;
  name: string;
  region: string;
}

// ─── Brand Colors ───
const BRAND = {
  bg: '#ECE5DD',          // WhatsApp-style chat background
  headerBg: '#075E54',    // WhatsApp teal-green
  headerAccent: '#128C7E',
  botBubble: '#FFFFFF',
  userBubble: '#DCF8C6',  // WhatsApp light green
  text: '#3D2B1F',
  gold: '#D97706',
  goldLight: '#F59E0B',
  goldDark: '#92400E',
  cream: '#FFF8E7',
  inputBg: '#F0F0F0',
  green: '#25D366',
  greenDark: '#075E54',
  timeColor: '#999',
  errorRed: '#DC2626',
  successGreen: '#16A34A',
};

// ─── Chat Flow Definition ───
const CHAT_FLOW: { phase: ChatPhase; botMessage: string }[] = [
  { phase: 'greeting', botMessage: 'Hey there! Welcome to Champion — Upgrade Your Hustle! 🏆\n\nHere\'s how it works:\n🛒 Buy any 2 Champion or Candy Tops products\n📷 Snap your till slip\n🎉 Win R1 000 cash every week + R20 000 in grand prizes!\n\nLet\'s get you entered!' },
  { phase: 'askFullName', botMessage: 'What\'s your full name?' },
  { phase: 'askTraderName', botMessage: 'Nice! What\'s the name of the trader or spaza shop where you bought? (Type "N/A" if it\'s for yourself)' },
  { phase: 'askStoreAddress', botMessage: 'And which area or address is the shop in? (e.g., "Khayelitsha Site C")' },
  { phase: 'askWholesale', botMessage: 'Which wholesale store did you buy from?\n\nTap a store below or type the name:' },
  { phase: 'askPhone', botMessage: 'Almost there! 🙌 What\'s the best phone number to reach you if you win?' },
  { phase: 'confirmDetails', botMessage: 'Let me just confirm everything:' },
  { phase: 'askSlip', botMessage: '' },
];

// ─── Utility ───
function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.slice(0, 11);
}

// ─── Typing Indicator ───
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: BRAND.gold }}>
        <Trophy size={16} className="text-white" />
      </div>
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm max-w-[80%] shadow-sm"
        style={{ background: BRAND.botBubble }}
      >
        <div className="flex gap-1.5 items-center h-5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ background: '#999' }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Chat Bubble ───
function ChatBubble({ message, onOptionSelect }: { message: ChatMessage; onOptionSelect?: (option: string) => void }) {
  const isBot = message.from === 'bot';
  const isUser = message.from === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`flex items-end gap-2 mb-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {isBot && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: BRAND.gold }}>
          <Trophy size={16} className="text-white" />
        </div>
      )}

      <div
        className={`px-4 py-2.5 rounded-2xl max-w-[80%] shadow-sm ${
          isBot ? 'rounded-bl-sm' : 'rounded-br-sm'
        }`}
        style={{ background: isBot ? BRAND.botBubble : BRAND.userBubble }}
      >
        {/* Text content */}
        {message.type === 'typing' ? (
          <div className="flex gap-1.5 items-center h-5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: '#999' }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
              />
            ))}
          </div>
        ) : (
          <div>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: isBot ? BRAND.text : '#1a1a1a' }}>
              {message.text}
            </p>

            {/* Image preview */}
            {message.imageUrl && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img src={message.imageUrl} alt="Till slip" className="w-full max-h-48 object-contain" style={{ background: '#f5f5f5' }} />
              </div>
            )}

            {/* Details summary */}
            {message.type === 'details' && message.details && (
              <div className="mt-2 p-3 rounded-lg space-y-1.5" style={{ background: BRAND.cream }}>
                {Object.entries(message.details).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span style={{ color: '#888' }}>{key}</span>
                    <span className="font-semibold" style={{ color: BRAND.text }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Store options */}
            {message.type === 'options' && message.options && (
              <div className="mt-2 flex flex-col gap-1.5">
                {message.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onOptionSelect?.(opt)}
                    className="text-left px-3 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md active:scale-95"
                    style={{ background: BRAND.cream, color: BRAND.goldDark, border: `1px solid ${BRAND.gold}30` }}
                  >
                    <Store size={14} className="inline mr-2" style={{ color: BRAND.gold }} />
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Result card */}
            {message.type === 'result' && message.resultData && (
              <div className="mt-2 p-3 rounded-lg space-y-2" style={{ background: message.resultData.result === 'confirmed' ? '#F0FFF4' : message.resultData.result === 'rejected' ? '#FFF5F5' : BRAND.cream }}>
                {message.resultData.storeName && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: '#666' }}>Store</span>
                    <span className="font-semibold" style={{ color: BRAND.text }}>{message.resultData.storeName}</span>
                  </div>
                )}
                {message.resultData.slipDate && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: '#666' }}>Date</span>
                    <span className="font-semibold" style={{ color: BRAND.text }}>{message.resultData.slipDate}</span>
                  </div>
                )}
                {message.resultData.slipAmount && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: '#666' }}>Amount</span>
                    <span className="font-semibold" style={{ color: BRAND.text }}>R{message.resultData.slipAmount}</span>
                  </div>
                )}
                {message.resultData.championProducts?.length > 0 && (
                  <div className="text-xs">
                    <span style={{ color: '#666' }}>Products: </span>
                    <span className="font-semibold" style={{ color: BRAND.gold }}>{message.resultData.championProducts.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <p className={`text-[10px] mt-1 ${isUser ? 'text-right' : 'text-left'}`} style={{ color: BRAND.timeColor }}>
          {formatTime(message.timestamp)}
          {isUser && <CheckCircle2 size={12} className="inline ml-1" style={{ color: '#4FC3F7' }} />}
        </p>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: '#6B7280' }}>
          <User size={16} className="text-white" />
        </div>
      )}
    </motion.div>
  );
}

// ─── Confetti ───
function ConfettiParticle({ delay, color }: { delay: number; color: string }) {
  const x = Math.random() * 100;
  const rotation = Math.random() * 360;
  const scale = Math.random() * 0.5 + 0.5;

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, x: `${x}vw`, rotate: 0, scale }}
      animate={{ opacity: [1, 1, 0], y: [0, Math.random() * 80 + 20 + 'vh'], x: [`${x}vw`, `${x + (Math.random() * 20 - 10)}vw`], rotate: [0, rotation * 3], scale: [scale, scale * 0.5] }}
      transition={{ duration: 3, delay, ease: 'easeOut' }}
      className="fixed pointer-events-none z-50"
      style={{ color }}
    >
      <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
        {Math.random() > 0.5 ? <Star size={16} fill="currentColor" /> : <Sparkles size={14} />}
      </motion.div>
    </motion.div>
  );
}

function ConfettiBurst() {
  const colors = ['#D97706', '#F59E0B', '#92400E', '#25D366', '#FFD700', '#FF6B35'];
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <ConfettiParticle key={i} delay={i * 0.05} color={colors[i % colors.length]} />
      ))}
    </div>
  );
}

// ─── Main Component ───
export default function ChampionChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>('greeting');
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Form data collected during chat
  const [fullName, setFullName] = useState('');
  const [traderName, setTraderName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [wholesaleStore, setWholesaleStore] = useState('');
  const [phone, setPhone] = useState('');
  const [stores, setStores] = useState<ParticipatingStore[]>([]);

  // Entry & validation data
  const [entryData, setEntryData] = useState<EntryData | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Auto-scroll to bottom ───
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // ─── Add bot message with typing delay ───
  const addBotMessage = useCallback(async (text: string, type?: ChatMessage['type'], extra?: Partial<ChatMessage>) => {
    setIsTyping(true);
    // Simulate typing delay (1-2 seconds)
    const delay = 800 + Math.random() * 800;
    await new Promise(resolve => setTimeout(resolve, delay));
    setIsTyping(false);

    const msg: ChatMessage = {
      id: generateId(),
      from: 'bot',
      text,
      timestamp: new Date(),
      type: type || 'text',
      ...extra,
    };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  // ─── Add user message ───
  const addUserMessage = useCallback((text: string, type?: ChatMessage['type'], extra?: Partial<ChatMessage>) => {
    const msg: ChatMessage = {
      id: generateId(),
      from: 'user',
      text,
      timestamp: new Date(),
      type: type || 'text',
      ...extra,
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  // ─── Fetch stores ───
  useEffect(() => {
    fetch('/api/stores')
      .then(res => res.json())
      .then(data => {
        if (data.stores) setStores(data.stores);
      })
      .catch(() => {});
  }, []);

  // ─── Start the conversation ───
  useEffect(() => {
    if (messages.length === 0) {
      // Kick off the greeting
      const timer = setTimeout(() => {
        addBotMessage(CHAT_FLOW[0].botMessage);
        setPhase('askFullName');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Advance conversation after bot messages ───
  const advancePhase = useCallback((currentPhase: ChatPhase) => {
    const nextFlows: Record<ChatPhase, { phase: ChatPhase; botMessage: string } | null> = {
      greeting: CHAT_FLOW[1], // askFullName
      askFullName: CHAT_FLOW[2], // askTraderName
      askTraderName: CHAT_FLOW[3], // askStoreAddress
      askStoreAddress: CHAT_FLOW[4], // askWholesale
      askWholesale: CHAT_FLOW[5],   // askPhone
      askPhone: null, // will do confirmDetails
      confirmDetails: CHAT_FLOW[7], // askSlip
      askSlip: null,
      validating: null,
      resultConfirmed: null,
      resultRejected: null,
      resultDuplicate: null,
      resultPending: null,
      startOver: null,
    };

    const next = nextFlows[currentPhase];
    if (next) {
      setPhase(next.phase);
      if (next.phase === 'askWholesale' && stores.length > 0) {
        addBotMessage(next.botMessage, 'options', { options: stores.map(s => s.name) });
      } else {
        addBotMessage(next.botMessage);
      }
    }
  }, [addBotMessage, stores]);

  // ─── Handle user text input ───
  const handleSend = useCallback(async () => {
    const value = inputValue.trim();
    if (!value && phase !== 'askSlip') return;

    setInputValue('');
    setError(null);

    // Handle store option tap (already selected via onOptionSelect)
    // This handles free-text input for stores
    if (phase === 'askWholesale') {
      setWholesaleStore(value);
      addUserMessage(value);
      // Then ask phone
      setPhase('askPhone');
      await addBotMessage(CHAT_FLOW[5].botMessage);
      return;
    }

    // Phase-specific handling
    switch (phase) {
      case 'askFullName':
        if (value.replace(/[^a-zA-Z\s'-]/g, '').trim().length < 3) {
          addUserMessage(value);
          await addBotMessage('That\'s a bit short — could you share your full name so we know who to contact if you win?');
          return;
        }
        setFullName(value);
        addUserMessage(value);
        advancePhase('askFullName');
        break;

      case 'askTraderName':
        setTraderName(value);
        addUserMessage(value);
        advancePhase('askTraderName');
        break;

      case 'askStoreAddress':
        setStoreAddress(value);
        addUserMessage(value);
        advancePhase('askStoreAddress');
        break;

      case 'askPhone':
        const digits = value.replace(/\D/g, '');
        if (digits.length < 10) {
          addUserMessage(value);
          await addBotMessage('Hmm, that doesn\'t look right. Could you double-check? 📞\nExample: 0721234567');
          return;
        }
        setPhone(digits);
        addUserMessage(digits);
        // Confirm details
        setPhase('confirmDetails');
        await addBotMessage('Let me confirm your details:', 'details', {
          details: {
            'Name': fullName,
            'Trader Name': traderName,
            'Store Address': storeAddress,
            'Wholesale Store': wholesaleStore,
            'Phone': digits,
          },
        });
        await addBotMessage('Does that look right? Type "yes" to confirm or "no" to start over.');
        break;

      case 'confirmDetails':
        if (value.toLowerCase() === 'yes' || value.toLowerCase() === 'y') {
          addUserMessage('Looks good! ✅');
          // Register the entry
          const nameParts = fullName.split(/\s+/);
          setIsSubmitting(true);
          try {
            const response = await fetch('/api/competition/entry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                firstName: nameParts[0],
                surname: nameParts.slice(1).join(' '),
                consumerPhone: phone,
                traderName,
                storeAddress,
                wholesaleStore,
              }),
            });
            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.error || 'Registration failed');
            }
            const data = await response.json();
            const entry = data.entry || data;
            setEntryData({
              id: entry.id,
              entryNumber: String(entry.entryNumber),
              fullName,
              traderName,
              storeAddress,
              wholesaleStore,
              consumerPhone: phone,
            });
            // Ask for slip upload
            setPhase('askSlip');
            await addBotMessage(`*Entry #${entry.entryNumber} is in!* ✅\n\nNow send a *clear photo of your till slip*! 📸\n\nMake sure we can see:\n• The store name\n• The date\n• At least 2 Champion or Candy Tops products\n\nGood lighting helps! ☀️`, 'text');
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Something went wrong';
            await addBotMessage(`❌ Oops! ${msg}\n\nPlease try again.`);
          } finally {
            setIsSubmitting(false);
          }
        } else {
          addUserMessage('No, let me start over.');
          await addBotMessage('No sweat! Let\'s start fresh. 🔄\n\nWhat\'s your *full name*?');
          setFullName('');
          setTraderName('');
          setStoreAddress('');
          setWholesaleStore('');
          setPhone('');
          setPhase('askFullName');
        }
        break;

      case 'resultConfirmed':
        if (value.toLowerCase().includes('again') || value.toLowerCase().includes('new')) {
          handleStartOver();
        } else {
          addUserMessage(value);
          await addBotMessage('🎉 You\'re now eligible for our R1 000 weekly cash prize and the R20 000 grand prize!\n\nKeep buying Champion products for more chances to win. Good luck! 🏆\n\nType "again" to enter with a new slip, or share this with friends!');
        }
        break;

      case 'resultPending':
        addUserMessage(value);
        if (value.toLowerCase().includes('check') && entryData?.id) {
          // Check entry status
          try {
            const res = await fetch(`/api/competition/status/${entryData.id}`);
            const data = await res.json();
            const status = data.entry?.validationResult;
            if (status === 'confirmed') {
              setPhase('resultConfirmed');
              await addBotMessage('🎉 Great news! Your entry has been CONFIRMED! ✅ Your Champion Toffees purchase has been verified.');
            } else if (status === 'rejected') {
              setPhase('resultRejected');
              await addBotMessage(`❌ Your entry was not validated: ${data.entry?.validationReason || 'No Champion products found.'}`);
            } else {
              await addBotMessage('⏳ Your entry is still being reviewed. Please check back in a few minutes.');
            }
          } catch {
            await addBotMessage('⏳ Could not check status right now. Please try again in a few minutes.');
          }
        } else if (value.toLowerCase().includes('again')) {
          handleStartOver();
        } else {
          await addBotMessage('⏳ Your entry is still under review. Type "check" to re-check your status, or "again" to submit a new entry.');
        }
        break;

      case 'resultRejected':
      case 'resultDuplicate':
        addUserMessage(value);
        await addBotMessage('🔄 Want to try again with a different slip? Type "try again" or tap the 📎 button to upload a new one.');
        setPhase('askSlip');
        break;

      default:
        addUserMessage(value);
        break;
    }
  }, [inputValue, phase, fullName, traderName, storeAddress, wholesaleStore, phone, stores, addBotMessage, addUserMessage, advancePhase, isSubmitting, entryData]);

  // ─── Handle store option tap ───
  const handleStoreSelect = useCallback(async (storeName: string) => {
    setWholesaleStore(storeName);
    addUserMessage(storeName);
    setPhase('askPhone');
    await addBotMessage(CHAT_FLOW[5].botMessage);
  }, [addBotMessage, addUserMessage]);

  // ─── Handle image upload with compression ───
  const compressImage = useCallback((file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      const img = new Image();
      img.onload = () => {
        // Scale down if image is too wide/tall
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxWidth) {
          const ratio = Math.min(maxWidth / width, maxWidth / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with quality setting
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = compressedDataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }
    setError(null);

    try {
      // Compress the image for VLM analysis (reduces ~2MB images to ~300KB)
      const compressedBase64 = await compressImage(file, 1200, 0.8);
      setImageBase64(compressedBase64);

      // Use original for preview (higher quality display)
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Image compression failed, using original:', err);
      // Fallback: use original image if compression fails
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        const base64 = result.split(',')[1];
        setImageBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  }, [compressImage]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ─── Submit slip for validation ───
  const handleSubmitSlip = useCallback(async () => {
    if (!imageBase64) {
      await addBotMessage('⚠️ Please upload a photo of your till slip first. Tap the 📎 button below.');
      return;
    }
    if (!entryData?.id) {
      await addBotMessage('⚠️ No entry found. Please confirm your details first.');
      return;
    }

    // Show the user's slip in chat
    addUserMessage('Here\'s my till slip 📸', 'image', { imageUrl: imagePreview || undefined });

    setIsSubmitting(true);
    setPhase('validating');

    // Show validating message
    await addBotMessage('🔍 Analyzing your till slip...\n\nChecking:\n• Is this a valid receipt?\n• Is it from a participating store?\n• Does it show Champion products?\n• Is it authentic?', 'text');

    try {
      const response = await fetch('/api/competition/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entryData.id,
          imageBase64,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Validation failed');
      }

      const data = await response.json();
      const validation: ValidationResult = data.validation || data;
      setValidationResult(validation);

      // For pending results, skip the extra typing delay — the conversation is complete
      // For confirmed/rejected results, add a brief delay to simulate final processing
      if (validation.result !== 'pending') {
        setIsTyping(true);
        await new Promise(resolve => setTimeout(resolve, 1500));
        setIsTyping(false);
      }

      if (validation.result === 'confirmed') {
        setPhase('resultConfirmed');
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
        await addBotMessage(
          `🎉 Congratulations! Your entry has been CONFIRMED! ✅\n\nEntry #${entryData.entryNumber}\n\nYour Champion Toffees purchase has been verified from ${validation.storeName || 'a participating store'}.`,
          'result',
          { resultData: validation }
        );
        await addBotMessage(
          `🏆 You're now eligible to win amazing prizes!\n\n• Prize draws happen weekly\n• Winners are notified via SMS\n• Keep buying Champion Toffees for more chances!\n\nType "again" to enter with a new slip, or share this with friends!`
        );
      } else if (validation.result === 'duplicate') {
        setPhase('resultDuplicate');
        await addBotMessage(
          `⚠️ Duplicate Entry Detected\n\n${validation.reason || 'This till slip has already been submitted.'}\n\nEach till slip can only be used once. Please try again with a different receipt.`,
          'result',
          { resultData: validation }
        );
      } else if (validation.result === 'pending') {
        setPhase('resultPending');
        // No extra typing delay for pending — show result immediately so user knows conversation is complete
        setIsTyping(false);
        const pendingMsg: ChatMessage = {
          id: generateId(),
          from: 'bot',
          text: `⏳ Your entry is being reviewed!\n\nEntry #${entryData?.entryNumber || ''}\n\n${validation.reason || 'Your till slip is being validated. This usually takes a few minutes.'}\n\nWe'll confirm your entry once the review is complete. You can check back later for the result.`,
          timestamp: new Date(),
          type: 'result',
          resultData: validation,
        };
        setMessages(prev => [...prev, pendingMsg]);

        // Add tip message immediately (no typing delay)
        const tipMsg: ChatMessage = {
          id: generateId(),
          from: 'bot',
          text: `📱 Tip: Save your entry number and check the status later. Reviews are typically completed within 30 minutes.\n\nType "again" to enter with a new slip, or "check" to re-check your entry status.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, tipMsg]);
      } else {
        setPhase('resultRejected');
        await addBotMessage(
          `❌ Entry Not Valid\n\n${validation.reason || 'No Champion products found on this receipt.'}\n\nPlease make sure your slip shows Champion Toffees purchased from a participating store.`,
          'result',
          { resultData: validation }
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Validation failed';
      await addBotMessage(`❌ Oops! ${msg}\n\nPlease try uploading your slip again.`);
      setPhase('askSlip');
    } finally {
      setIsSubmitting(false);
    }
  }, [imageBase64, imagePreview, entryData, addBotMessage, addUserMessage]);

  // ─── Start Over ───
  const handleStartOver = useCallback(async () => {
    setFullName('');
    setTraderName('');
    setStoreAddress('');
    setWholesaleStore('');
    setPhone('');
    setImagePreview(null);
    setImageBase64(null);
    setEntryData(null);
    setValidationResult(null);
    setError(null);
    setShowConfetti(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    setMessages([]);
    setPhase('greeting');
  }, []);

  // ─── Determine input placeholder ───
  const getInputPlaceholder = () => {
    switch (phase) {
      case 'askFullName': return 'Your full name...';
      case 'askTraderName': return 'Your shop/business name...';
      case 'askStoreAddress': return 'Your store address...';
      case 'askWholesale': return 'Type store name or tap above...';
      case 'askPhone': return 'e.g. 0821234567';
      case 'confirmDetails': return 'Type "yes" or "no"...';
      case 'askSlip': return 'Tap 📎 to upload your slip...';
      case 'resultConfirmed': return 'Type "again" for new entry...';
      case 'resultRejected': return 'Type "try again"...';
      case 'resultDuplicate': return 'Type "try again"...';
      case 'resultPending': return 'Type "check" for status...';
      default: return 'Type a message...';
    }
  };

  // ─── Can user type? ───
  const canType = !['validating', 'greeting'].includes(phase) && !isSubmitting && !isTyping;

  // ─── Show attachment button? ───
  const showAttach = phase === 'askSlip' || phase === 'resultRejected' || phase === 'resultDuplicate' || phase === 'resultPending';

  // ─── Show send button? ───
  const showSend = canType && phase !== 'askSlip';

  // ─── Auto-submit slip when image is selected ───
  useEffect(() => {
    if (imageBase64 && phase === 'askSlip' && entryData?.id && !isSubmitting) {
      handleSubmitSlip();
    }
  }, [imageBase64]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Main Render ───
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: BRAND.bg }}>
      {showConfetti && <ConfettiBurst />}

      {/* ─── WhatsApp-style Header ─── */}
      <header className="flex-shrink-0 shadow-md z-40" style={{ background: BRAND.headerBg }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm" style={{ background: BRAND.gold }}>
            <Trophy size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-lg truncate">Champion Toffees</h1>
            <p className="text-white/70 text-xs">
              {isTyping ? 'typing...' : isSubmitting ? 'processing...' : phase === 'validating' ? 'validating slip...' : phase === 'resultPending' ? 'under review...' : 'online'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entryData && (
              <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: BRAND.gold, color: 'white' }}>
                #{entryData.entryNumber}
              </span>
            )}
            <button
              onClick={() => setShowQRModal(true)}
              className="p-2 rounded-full transition-colors hover:bg-white/20"
              title="Show QR Code"
            >
              <QrCode size={20} className="text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── QR Code Modal ─── */}
      <AnimatePresence>
        {showQRModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowQRModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
              style={{ background: '#fff' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: BRAND.text }}>
                  Scan to Enter Competition
                </h3>
                <button onClick={() => setShowQRModal(false)} className="p-1 rounded-full hover:bg-gray-100">
                  <X size={20} style={{ color: '#666' }} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-xl" style={{ background: BRAND.cream }}>
                  <QRCodeSVG
                    value={typeof window !== 'undefined' ? window.location.href : 'https://champion-toffees-competition-f8tl.vercel.app'}
                    size={200}
                    bgColor={BRAND.cream}
                    fgColor={BRAND.text}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <p className="text-sm text-center font-medium" style={{ color: BRAND.text }}>
                  Champion Toffees "Buy, Snap, Win!" Competition
                </p>
                <p className="text-xs text-center" style={{ color: '#888' }}>
                  Scan this QR code with your phone camera to open the competition chat bot and enter to win!
                </p>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : 'https://champion-toffees-competition-f8tl.vercel.app');
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-1"
                    style={{ background: BRAND.cream, color: BRAND.goldDark, border: `1px solid ${BRAND.gold}40` }}
                  >
                    <Copy size={16} />
                    Copy Link
                  </button>
                  <button
                    onClick={() => setShowQRModal(false)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-1"
                    style={{ background: BRAND.headerBg, color: 'white' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Chat Background Pattern (WhatsApp-style) ─── */}
      <div
        className="flex-1 overflow-y-auto relative"
        style={{
          background: `${BRAND.bg}`,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zm6-30V0h-2v4H6v2h4v4h2V6h4V4h-4z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* ─── Date Separator ─── */}
        <div className="flex justify-center py-3 px-4 sticky top-0 z-10">
          <span className="text-xs px-3 py-1 rounded-lg shadow-sm font-medium" style={{ background: '#E1E1E1', color: '#666' }}>
            Today
          </span>
        </div>

        {/* ─── Encrypted Notice ─── */}
        <div className="flex justify-center pb-3 px-4">
          <span className="text-xs px-3 py-1 rounded-lg text-center" style={{ background: '#FFECD2', color: BRAND.goldDark }}>
            <ShieldCheck size={12} className="inline mr-1" />
            Messages are secured. Your info stays private.
          </span>
        </div>

        {/* ─── Messages ─── */}
        <div className="px-3 pb-4">
          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              onOptionSelect={phase === 'askWholesale' ? handleStoreSelect : undefined}
            />
          ))}

          {/* Typing indicator */}
          {isTyping && <TypingIndicator />}
        </div>

        {/* Scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* ─── Image Preview Bar (before submission) ─── */}
      <AnimatePresence>
        {imagePreview && phase === 'askSlip' && !isSubmitting && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 border-t overflow-hidden"
            style={{ background: '#fff', borderColor: '#ddd' }}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0" style={{ background: '#f5f5f5' }}>
                <img src={imagePreview} alt="Slip preview" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: BRAND.text }}>Till slip ready</p>
                <p className="text-xs" style={{ color: '#888' }}>Tap send to validate</p>
              </div>
              <button
                onClick={() => { setImagePreview(null); setImageBase64(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="p-2 rounded-full"
                style={{ color: BRAND.errorRed }}
              >
                <XCircle size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Error Bar ─── */}
      {error && (
        <div className="flex-shrink-0 px-4 py-2 flex items-center gap-2" style={{ background: '#FFF5F5' }}>
          <AlertTriangle size={16} style={{ color: BRAND.errorRed }} />
          <span className="text-sm" style={{ color: BRAND.errorRed }}>{error}</span>
        </div>
      )}

      {/* ─── Input Bar (WhatsApp-style) ─── */}
      <div className="flex-shrink-0 border-t z-40" style={{ background: BRAND.inputBg }}>
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Attachment button */}
          {showAttach && (
            <>
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="p-2 rounded-full transition-colors hover:bg-gray-200"
                style={{ color: BRAND.headerBg }}
                title="Take Photo"
              >
                <Camera size={22} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-full transition-colors hover:bg-gray-200"
                style={{ color: BRAND.headerBg }}
                title="Upload File"
              >
                <Paperclip size={22} />
              </button>
              {/* Hidden inputs */}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} className="hidden" />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </>
          )}

          {/* Text input */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                if (phase === 'askPhone') {
                  setInputValue(formatPhone(e.target.value));
                } else {
                  setInputValue(e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim() && canType) {
                  handleSend();
                }
              }}
              placeholder={getInputPlaceholder()}
              disabled={!canType}
              className="w-full px-4 py-2.5 rounded-full text-sm outline-none shadow-sm transition-all"
              style={{
                background: '#fff',
                color: BRAND.text,
                opacity: canType ? 1 : 0.6,
              }}
            />
          </div>

          {/* Send / Submit button */}
          {showSend && inputValue.trim() ? (
            <button
              onClick={handleSend}
              className="p-2.5 rounded-full transition-all shadow-sm"
              style={{ background: BRAND.headerBg, color: 'white' }}
            >
              <Send size={20} />
            </button>
          ) : phase === 'askSlip' && imageBase64 && !isSubmitting ? (
            <button
              onClick={handleSubmitSlip}
              className="p-2.5 rounded-full transition-all shadow-sm"
              style={{ background: BRAND.green, color: 'white' }}
            >
              <Send size={20} />
            </button>
          ) : (
            <div className="p-2.5 rounded-full" style={{ background: '#ddd', color: '#999' }}>
              <Send size={20} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
