'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Camera,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Trophy,
  Star,
  ShieldCheck,
  Zap,
  Sparkles,
  Gift,
  ShoppingCart,
  FileText,
  Loader2,
  RefreshCw,
  Copy,
  Share2,
  ChevronRight,
  Phone,
  MapPin,
  User,
  Eye,
  ScanLine,
  Image as ImageIcon,
  Clock,
  PartyPopper,
  CircleCheck,
  Ban,
  Fingerprint,
} from 'lucide-react';

// ─── Types ───
type Step = 'landing' | 'register' | 'upload' | 'validating' | 'result' | 'confirmed';

interface EntryData {
  id: string;
  entryNumber: string;
  consumerName: string;
  consumerPhone: string;
  consumerLocation: string;
}

interface ValidationResult {
  result: 'confirmed' | 'rejected' | 'duplicate';
  reason: string;
  storeName: string;
  slipDate: string;
  slipAmount: string;
  championProducts: string[];
  confidence: number;
  isFraud: boolean;
}

// ─── Constants ───
const CAPE_TOWN_AREAS = [
  'Athlone', 'Bellville', 'Bishop Lavis', 'Bonteheuwel', 'Brackenfell',
  'Cape Town CBD', 'Delft', 'Elsies River', 'Goodwood', 'Grassy Park',
  'Hanover Park', 'Heideveld', 'Khayelitsha', 'Kraaifontein', 'Langa',
  'Lavender Hill', 'Manenberg', 'Mitchells Plain', 'Nyanga', 'Parow',
  'Philippi', 'Rylands', 'Salt River', 'Stenberg', 'Strand',
  'Gugulethu', 'Wynberg', 'Muizenberg', 'Worcester', 'Paarl',
  'Stellenbosch', 'Somerset West', 'Kuils River', 'Blue Downs', 'Eersterivier',
  'Makhaza', 'Site B', 'Site C', 'Harare', 'Crossroads',
  'Philippi East', 'Samora Machel', 'Barcelona', 'Vygieskraal', 'Bokmakierie',
  'Netreg', 'Riverside', 'Macassar', 'Nomzamo', 'Lwandle',
];

const BRAND_COLORS = {
  bg: '#FAF3E3',
  text: '#3D2B1F',
  gold: '#D97706',
  goldLight: '#F59E0B',
  goldDark: '#92400E',
  cream: '#FFF8E7',
  brownLight: '#5C3D2E',
  brownDark: '#2D1B0E',
};

const STEP_LABELS: Record<Step, string> = {
  landing: 'Welcome',
  register: 'Register',
  upload: 'Upload Slip',
  validating: 'Validating',
  result: 'Result',
  confirmed: 'Confirmed!',
};

const STEP_ORDER: Step[] = ['landing', 'register', 'upload', 'validating', 'result', 'confirmed'];

const VALIDATION_STAGES = [
  { label: 'Scanning receipt...', icon: ScanLine, duration: 2500 },
  { label: 'Extracting purchase data...', icon: Eye, duration: 2500 },
  { label: 'Verifying Champion products...', icon: ShieldCheck, duration: 2500 },
  { label: 'Checking for duplicates...', icon: Fingerprint, duration: 2000 },
];

// ─── Confetti Particle Component ───
function ConfettiParticle({ delay, color }: { delay: number; color: string }) {
  const x = Math.random() * 100;
  const rotation = Math.random() * 360;
  const scale = Math.random() * 0.5 + 0.5;

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, x: `${x}vw`, rotate: 0, scale }}
      animate={{
        opacity: [1, 1, 0],
        y: [0, Math.random() * 80 + 20 + 'vh'],
        x: [`${x}vw`, `${x + (Math.random() * 20 - 10)}vw`],
        rotate: [0, rotation * 3],
        scale: [scale, scale * 0.5],
      }}
      transition={{ duration: 3, delay, ease: 'easeOut' }}
      className="fixed pointer-events-none z-50"
      style={{ color }}
    >
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      >
        {Math.random() > 0.5 ? <Star size={16} fill="currentColor" /> : <Sparkles size={14} />}
      </motion.div>
    </motion.div>
  );
}

// ─── Confetti Burst ───
function ConfettiBurst() {
  const colors = ['#D97706', '#F59E0B', '#92400E', '#3D2B1F', '#FFD700', '#FF6B35'];
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <ConfettiParticle key={i} delay={i * 0.05} color={colors[i % colors.length]} />
      ))}
    </div>
  );
}

// ─── Step Indicator ───
function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="w-full px-4 py-3" style={{ background: 'rgba(250,243,227,0.95)' }}>
      <div className="flex items-center justify-between max-w-md mx-auto">
        {STEP_ORDER.map((step, idx) => {
          const isActive = idx === currentIndex;
          const isCompleted = idx < currentIndex;
          const isFuture = idx > currentIndex;

          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center gap-1 min-w-[44px]">
                <motion.div
                  animate={{
                    scale: isActive ? 1.3 : 1,
                    backgroundColor: isCompleted || isActive ? BRAND_COLORS.gold : '#E5DDD0',
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md"
                >
                  {isCompleted ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </motion.div>
                <span
                  className="text-xs font-medium text-center leading-tight"
                  style={{
                    color: isActive ? BRAND_COLORS.gold : isCompleted ? BRAND_COLORS.text : '#999',
                  }}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>
              {idx < STEP_ORDER.length - 1 && (
                <motion.div
                  animate={{
                    backgroundColor: isCompleted ? BRAND_COLORS.gold : '#E5DDD0',
                  }}
                  className="h-0.5 w-6 flex-shrink-0 rounded-full"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Validation Loading Animation ───
function ValidationAnimation() {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let totalDuration = 0;
    const timeouts: NodeJS.Timeout[] = [];

    VALIDATION_STAGES.forEach((stage, idx) => {
      const startProgress = (idx / VALIDATION_STAGES.length) * 100;
      const endProgress = ((idx + 1) / VALIDATION_STAGES.length) * 100;

      timeouts.push(
        setTimeout(() => {
          setStageIndex(idx);
          setProgress(startProgress);
        }, totalDuration)
      );

      // Animate progress within each stage
      const increments = 10;
      for (let i = 1; i <= increments; i++) {
        timeouts.push(
          setTimeout(() => {
            setProgress(startProgress + (endProgress - startProgress) * (i / increments));
          }, totalDuration + (stage.duration / increments) * i)
        );
      }

      totalDuration += stage.duration;
    });

    timeouts.push(
      setTimeout(() => {
        setProgress(100);
      }, totalDuration)
    );

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const currentStage = VALIDATION_STAGES[stageIndex];

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})` }}
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-white"
        >
          {currentStage ? <currentStage.icon size={36} /> : <ScanLine size={36} />}
        </motion.div>
      </motion.div>

      <div className="w-full max-w-xs">
        <Progress value={progress} className="h-3" />
      </div>

      <motion.p
        key={stageIndex}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="text-lg font-semibold"
        style={{ color: BRAND_COLORS.text }}
      >
        {currentStage?.label || 'Finalizing...'}
      </motion.p>

      <p className="text-sm" style={{ color: '#888' }}>
        Our AI is verifying your till slip
      </p>

      {/* Animated receipt scanning visual */}
      <div className="relative w-64 h-40 rounded-lg overflow-hidden" style={{ background: '#f5f5f5' }}>
        <motion.div
          animate={{ y: [-10, 140, -10] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-0 right-0 h-2"
          style={{ background: `linear-gradient(90deg, transparent, ${BRAND_COLORS.gold}, transparent)` }}
        />
        {/* Fake receipt lines */}
        <div className="flex flex-col gap-2 p-4 opacity-40">
          <div className="h-1 w-3/4 rounded" style={{ background: BRAND_COLORS.text }} />
          <div className="h-1 w-1/2 rounded" style={{ background: BRAND_COLORS.text }} />
          <div className="h-1 w-2/3 rounded" style={{ background: BRAND_COLORS.gold }} />
          <div className="h-1 w-1/3 rounded" style={{ background: BRAND_COLORS.text }} />
          <div className="h-1 w-1/2 rounded" style={{ background: BRAND_COLORS.gold }} />
          <div className="h-1 w-2/5 rounded" style={{ background: BRAND_COLORS.text }} />
        </div>
      </div>
    </div>
  );
}

// ─── Page Transition Wrapper ───
const pageVariants = {
  initial: { opacity: 0, x: 50, scale: 0.95 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -50, scale: 0.95 },
};

const pageTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

// ─── Main Component ───
export default function ChampionCompetitionPage() {
  // State
  const [step, setStep] = useState<Step>('landing');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [entryData, setEntryData] = useState<EntryData | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [validationTimer, setValidationTimer] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ─── File Processing ───
  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, etc.)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImagePreview(result);
      // Extract base64 without the data URL prefix
      const base64Data = result.split(',')[1];
      setImageBase64(base64Data);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const removeImage = useCallback(() => {
    setImagePreview(null);
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, []);

  // ─── Registration Submit ───
  const handleRegister = useCallback(async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError('Please enter a valid phone number (at least 10 digits)');
      return;
    }
    if (!location) {
      setError('Please select your area');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/competition/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumerName: name.trim(),
          consumerPhone: phone.trim(),
          consumerLocation: location,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Registration failed. Please try again.');
      }

      const data = await response.json();
      setEntryData({
        id: data.id,
        entryNumber: data.entryNumber,
        consumerName: name.trim(),
        consumerPhone: phone.trim(),
        consumerLocation: location,
      });

      setStep('upload');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [name, phone, location]);

  // ─── Upload & Validate ───
  const handleUploadAndValidate = useCallback(async () => {
    if (!imageBase64) {
      setError('Please capture or upload a till slip photo');
      return;
    }
    if (!entryData?.id) {
      setError('No entry found. Please register first.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setStep('validating');
    setValidationTimer(0);

    // Start a visual timer
    const timerInterval = setInterval(() => {
      setValidationTimer((prev) => prev + 100);
    }, 100);

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
        throw new Error(data.error || 'Validation failed. Please try again.');
      }

      const data = await response.json();
      setValidationResult(data);

      // Wait for validation animation to complete (minimum 5 seconds visual)
      const elapsed = validationTimer;
      const remaining = Math.max(0, 5000 - elapsed);
      await new Promise((resolve) => setTimeout(resolve, remaining));

      clearInterval(timerInterval);
      setStep('result');
    } catch (err: unknown) {
      clearInterval(timerInterval);
      const message = err instanceof Error ? err.message : 'Validation failed. Please try again.';
      setError(message);
      setStep('upload');
    } finally {
      setIsSubmitting(false);
    }
  }, [imageBase64, entryData, validationTimer]);

  // ─── Handle Result Continue ───
  const handleResultContinue = useCallback(() => {
    if (validationResult?.result === 'confirmed') {
      setShowConfetti(true);
      setStep('confirmed');
      setTimeout(() => setShowConfetti(false), 4000);
    }
  }, [validationResult]);

  // ─── Reset & Try Again ───
  const handleTryAgain = useCallback(() => {
    setImagePreview(null);
    setImageBase64(null);
    setValidationResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    setStep('upload');
  }, []);

  const handleStartOver = useCallback(() => {
    setName('');
    setPhone('');
    setLocation('');
    setImagePreview(null);
    setImageBase64(null);
    setEntryData(null);
    setValidationResult(null);
    setError(null);
    setShowConfetti(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    setStep('landing');
  }, []);

  // ─── Format Phone ───
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.slice(0, 11);
  };

  // ─── Render Steps ───
  const renderLanding = () => (
    <motion.div
      key="landing"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col items-center w-full"
    >
      {/* Hero Section */}
      <div className="relative w-full overflow-hidden rounded-2xl mb-8" style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.goldDark}, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})` }}>
        <div className="absolute inset-0 opacity-20">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute top-4 right-4"
          >
            <Star size={80} fill="rgba(255,255,255,0.3)" stroke="none" />
          </motion.div>
          <motion.div
            animate={{ rotate: [360, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            className="absolute bottom-4 left-4"
          >
            <Sparkles size={60} color="rgba(255,255,255,0.3)" />
          </motion.div>
        </div>

        <div className="flex flex-col items-center py-12 px-6 text-center relative z-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
            className="w-24 h-24 rounded-full flex items-center justify-center mb-4 shadow-lg"
            style={{ background: BRAND_COLORS.cream }}
          >
            <Trophy size={48} style={{ color: BRAND_COLORS.gold }} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-5xl font-bold text-white mb-2"
          >
            Champion Toffees
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-2xl md:text-3xl font-bold text-white mb-4 tracking-wide"
          >
            Buy, Snap, Win!
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-white/90 text-lg max-w-sm"
          >
            Purchase Champion Toffees, snap your till slip, and win amazing prizes!
          </motion.p>
        </div>
      </div>

      {/* How It Works */}
      <div className="w-full max-w-lg mb-8">
        <h2 className="text-xl font-bold mb-6 text-center" style={{ color: BRAND_COLORS.text }}>
          How It Works
        </h2>
        <div className="flex flex-col gap-4">
          {[
            { icon: ShoppingCart, title: 'Buy Champion Toffees', desc: 'Purchase any Champion Toffees product from a store near you', color: BRAND_COLORS.gold },
            { icon: Camera, title: 'Snap Your Till Slip', desc: 'Take a photo of your receipt showing the Champion product purchase', color: BRAND_COLORS.goldLight },
            { icon: Gift, title: 'Win Amazing Prizes', desc: 'Our AI validates your entry instantly — confirmed entries win!', color: BRAND_COLORS.goldDark },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + idx * 0.15 }}
            >
              <Card className="border-0 shadow-md" style={{ background: BRAND_COLORS.cream }}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: item.color }}
                  >
                    <item.icon size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base" style={{ color: BRAND_COLORS.text }}>
                      {item.title}
                    </h3>
                    <p className="text-sm" style={{ color: '#888' }}>
                      {item.desc}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Trust Signals */}
      <div className="w-full max-w-lg mb-8">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: ShieldCheck, label: 'AI Verified', color: BRAND_COLORS.gold },
            { icon: Zap, label: 'Instant Validation', color: BRAND_COLORS.goldLight },
            { icon: Star, label: 'Fair Play', color: BRAND_COLORS.goldDark },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.0 + idx * 0.1 }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl"
              style={{ background: BRAND_COLORS.cream }}
            >
              <item.icon size={28} style={{ color: item.color }} />
              <span className="text-xs font-bold text-center" style={{ color: BRAND_COLORS.text }}>
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Enter Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="w-full max-w-lg"
      >
        <Button
          onClick={() => { setError(null); setStep('register'); }}
          size="lg"
          className="w-full h-14 text-lg font-bold shadow-lg hover:shadow-xl transition-shadow"
          style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})`,
            color: 'white',
          }}
        >
          Enter Competition Now
          <ArrowRight size={20} className="ml-2" />
        </Button>
      </motion.div>
    </motion.div>
  );

  const renderRegister = () => (
    <motion.div
      key="register"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col items-center w-full max-w-lg mx-auto"
    >
      <Card className="w-full border-0 shadow-lg" style={{ background: BRAND_COLORS.cream }}>
        <CardHeader className="text-center pb-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ background: BRAND_COLORS.gold }}
          >
            <User size={32} className="text-white" />
          </motion.div>
          <CardTitle className="text-2xl" style={{ color: BRAND_COLORS.text }}>
            Register Your Entry
          </CardTitle>
          <CardDescription className="text-base" style={{ color: '#888' }}>
            Fill in your details to enter the competition
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5 px-6">
          {/* Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="name" className="font-semibold" style={{ color: BRAND_COLORS.text }}>
              <User size={16} className="inline mr-2" />
              Full Name
            </Label>
            <Input
              id="name"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 text-base"
              style={{ borderColor: BRAND_COLORS.gold + '40' }}
            />
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone" className="font-semibold" style={{ color: BRAND_COLORS.text }}>
              <Phone size={16} className="inline mr-2" />
              Phone Number
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g. 0821234567"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="h-12 text-base"
              style={{ borderColor: BRAND_COLORS.gold + '40' }}
            />
          </div>

          {/* Location */}
          <div className="flex flex-col gap-2">
            <Label className="font-semibold" style={{ color: BRAND_COLORS.text }}>
              <MapPin size={16} className="inline mr-2" />
              Your Area
            </Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="h-12 text-base w-full" style={{ borderColor: BRAND_COLORS.gold + '40' }}>
                <SelectValue placeholder="Select your area in Cape Town" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {CAPE_TOWN_AREAS.map((area) => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm"
            >
              <AlertTriangle size={16} />
              {error}
            </motion.div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3 px-6 pt-4">
          <Button
            onClick={handleRegister}
            disabled={isSubmitting}
            size="lg"
            className="w-full h-12 font-bold shadow-md"
            style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})`,
              color: 'white',
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Registering...
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={18} className="ml-2" />
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={() => { setError(null); setStep('landing'); }}
            className="w-full"
            style={{ color: BRAND_COLORS.text }}
          >
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );

  const renderUpload = () => (
    <motion.div
      key="upload"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col items-center w-full max-w-lg mx-auto"
    >
      <Card className="w-full border-0 shadow-lg" style={{ background: BRAND_COLORS.cream }}>
        <CardHeader className="text-center pb-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ background: BRAND_COLORS.gold }}
          >
            <Camera size={32} className="text-white" />
          </motion.div>
          <CardTitle className="text-2xl" style={{ color: BRAND_COLORS.text }}>
            Upload Your Till Slip
          </CardTitle>
          <CardDescription className="text-base" style={{ color: '#888' }}>
            Take a photo or upload an image of your receipt
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5 px-6">
          {/* Entry info badge */}
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg" style={{ background: BRAND_COLORS.gold + '15' }}>
            <FileText size={16} style={{ color: BRAND_COLORS.gold }} />
            <span className="text-sm font-semibold" style={{ color: BRAND_COLORS.gold }}>
              Entry: {entryData?.entryNumber || '—'}
            </span>
            <Badge variant="outline" className="text-xs" style={{ borderColor: BRAND_COLORS.gold, color: BRAND_COLORS.gold }}>
              {entryData?.consumerName}
            </Badge>
          </div>

          {/* Image Preview */}
          {imagePreview ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative rounded-xl overflow-hidden shadow-md"
            >
              <img
                src={imagePreview}
                alt="Till slip preview"
                className="w-full h-auto max-h-64 object-contain"
                style={{ background: '#f0f0f0' }}
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Badge className="shadow-sm" style={{ background: BRAND_COLORS.gold, color: 'white' }}>
                  <CheckCircle2 size={14} className="mr-1" />
                  Ready
                </Badge>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={removeImage}
                  className="h-7 w-7 p-0 rounded-full"
                >
                  <XCircle size={14} />
                </Button>
              </div>
            </motion.div>
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-xl border-2 border-dashed"
              style={{ borderColor: BRAND_COLORS.gold + '40', background: '#fff' }}
            >
              <ImageIcon size={48} style={{ color: BRAND_COLORS.gold + '60' }} />
              <p className="text-sm" style={{ color: '#888' }}>
                No image selected — capture or upload below
              </p>
            </div>
          )}

          {/* Upload Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => cameraInputRef.current?.click()}
              variant="outline"
              size="lg"
              className="h-12 font-semibold"
              style={{ borderColor: BRAND_COLORS.gold, color: BRAND_COLORS.gold }}
            >
              <Camera size={20} className="mr-2" />
              Take Photo
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="lg"
              className="h-12 font-semibold"
              style={{ borderColor: BRAND_COLORS.gold, color: BRAND_COLORS.gold }}
            >
              <Upload size={20} className="mr-2" />
              Upload File
            </Button>
          </div>

          {/* Hidden inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Tips */}
          <div className="p-4 rounded-xl" style={{ background: '#fff' }}>
            <h3 className="font-bold text-sm mb-2" style={{ color: BRAND_COLORS.text }}>
              Tips for a clear photo:
            </h3>
            <ul className="text-xs space-y-1" style={{ color: '#666' }}>
              <li className="flex items-center gap-2">
                <ChevronRight size={14} style={{ color: BRAND_COLORS.gold }} />
                Ensure the receipt is flat and well-lit
              </li>
              <li className="flex items-center gap-2">
                <ChevronRight size={14} style={{ color: BRAND_COLORS.gold }} />
                Include the store name, date, and total amount
              </li>
              <li className="flex items-center gap-2">
                <ChevronRight size={14} style={{ color: BRAND_COLORS.gold }} />
                Champion Toffees product must be visible on the slip
              </li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm"
            >
              <AlertTriangle size={16} />
              {error}
            </motion.div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3 px-6 pt-4">
          <Button
            onClick={handleUploadAndValidate}
            disabled={isSubmitting || !imageBase64}
            size="lg"
            className="w-full h-12 font-bold shadow-md"
            style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})`,
              color: 'white',
              opacity: isSubmitting || !imageBase64 ? 0.7 : 1,
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Validating...
              </>
            ) : (
              <>
                Validate My Slip
                <ShieldCheck size={18} className="ml-2" />
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={() => { setError(null); setStep('register'); }}
            className="w-full"
            style={{ color: BRAND_COLORS.text }}
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to Registration
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );

  const renderValidating = () => (
    <motion.div
      key="validating"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col items-center w-full max-w-lg mx-auto"
    >
      <Card className="w-full border-0 shadow-lg" style={{ background: BRAND_COLORS.cream }}>
        <CardHeader className="text-center pb-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ background: BRAND_COLORS.gold }}
          >
            <ScanLine size={32} className="text-white" />
          </motion.div>
          <CardTitle className="text-2xl" style={{ color: BRAND_COLORS.text }}>
            Validating Your Entry
          </CardTitle>
          <CardDescription className="text-base" style={{ color: '#888' }}>
            Our AI is checking your till slip
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6">
          <ValidationAnimation />
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderResult = () => {
    if (!validationResult) return null;

    const isConfirmed = validationResult.result === 'confirmed';
    const isRejected = validationResult.result === 'rejected';
    const isDuplicate = validationResult.result === 'duplicate';

    const resultConfig = {
      confirmed: {
        icon: CircleCheck,
        title: 'Entry Confirmed!',
        description: 'Your Champion Toffees purchase has been verified',
        color: '#16A34A',
        bg: '#F0FFF4',
      },
      rejected: {
        icon: Ban,
        title: 'Entry Not Valid',
        description: validationResult.reason || 'No Champion products found on this receipt',
        color: '#DC2626',
        bg: '#FFF5F5',
      },
      duplicate: {
        icon: Fingerprint,
        title: 'Duplicate Entry',
        description: validationResult.reason || 'This receipt has already been submitted',
        color: BRAND_COLORS.gold,
        bg: BRAND_COLORS.cream,
      },
    };

    const config = resultConfig[validationResult.result];

    return (
      <motion.div
        key="result"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
        className="flex flex-col items-center w-full max-w-lg mx-auto"
      >
        <Card className="w-full border-0 shadow-lg" style={{ background: config.bg }}>
          <CardHeader className="text-center pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg"
              style={{ background: config.color }}
            >
              <config.icon size={40} className="text-white" />
            </motion.div>
            <CardTitle className="text-2xl" style={{ color: config.color }}>
              {config.title}
            </CardTitle>
            <CardDescription className="text-base" style={{ color: '#666' }}>
              {config.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 px-6">
            {/* Validation Details */}
            <div className="p-4 rounded-xl space-y-3" style={{ background: '#fff' }}>
              {validationResult.storeName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: '#666' }}>Store</span>
                  <span className="text-sm font-bold" style={{ color: BRAND_COLORS.text }}>
                    {validationResult.storeName}
                  </span>
                </div>
              )}
              {validationResult.slipDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: '#666' }}>Date</span>
                  <span className="text-sm font-bold" style={{ color: BRAND_COLORS.text }}>
                    {validationResult.slipDate}
                  </span>
                </div>
              )}
              {validationResult.slipAmount && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: '#666' }}>Amount</span>
                  <span className="text-sm font-bold" style={{ color: BRAND_COLORS.text }}>
                    R{validationResult.slipAmount}
                  </span>
                </div>
              )}
              {validationResult.championProducts?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium" style={{ color: '#666' }}>Champion Products Found</span>
                  <div className="flex flex-wrap gap-2">
                    {validationResult.championProducts.map((product, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs" style={{ borderColor: BRAND_COLORS.gold, color: BRAND_COLORS.gold }}>
                        {product}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {validationResult.confidence > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: '#666' }}>Confidence</span>
                  <div className="flex items-center gap-2">
                    <Progress value={validationResult.confidence * 100} className="w-20 h-2" />
                    <span className="text-sm font-bold" style={{ color: BRAND_COLORS.gold }}>
                      {Math.round(validationResult.confidence * 100)}%
                    </span>
                  </div>
                </div>
              )}
              {validationResult.isFraud && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 text-red-700 text-xs">
                  <AlertTriangle size={14} />
                  Fraud detection: This slip appears to be altered or fabricated
                </div>
              )}
            </div>

            {/* Entry Number */}
            {isConfirmed && entryData?.entryNumber && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="p-4 rounded-xl text-center"
                style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})` }}
              >
                <p className="text-white/80 text-sm mb-1">Your Entry Number</p>
                <p className="text-white text-2xl font-bold">{entryData.entryNumber}</p>
              </motion.div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 px-6 pt-4">
            {isConfirmed ? (
              <Button
                onClick={handleResultContinue}
                size="lg"
                className="w-full h-12 font-bold shadow-md"
                style={{
                  background: `linear-gradient(135deg, #16A34A, #22C55E)`,
                  color: 'white',
                }}
              >
                <PartyPopper size={18} className="mr-2" />
                View My Prize Entry
              </Button>
            ) : (
              <Button
                onClick={handleTryAgain}
                size="lg"
                className="w-full h-12 font-bold shadow-md"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})`,
                  color: 'white',
                }}
              >
                <RefreshCw size={18} className="mr-2" />
                Try Again with New Slip
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={handleStartOver}
              className="w-full"
              style={{ color: BRAND_COLORS.text }}
            >
              <ArrowLeft size={16} className="mr-2" />
              Start Over
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    );
  };

  const renderConfirmed = () => (
    <motion.div
      key="confirmed"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col items-center w-full max-w-lg mx-auto"
    >
      {showConfetti && <ConfettiBurst />}

      <Card className="w-full border-0 shadow-lg overflow-hidden" style={{ background: BRAND_COLORS.cream }}>
        {/* Celebration header */}
        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.goldDark}, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})` }}>
          <div className="flex flex-col items-center py-10 px-6 text-center relative z-10">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="mb-4"
            >
              <Trophy size={64} className="text-white" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-bold text-white mb-2"
            >
              You&apos;re In!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-white/90 text-lg"
            >
              Your entry has been confirmed and you&apos;re eligible to win!
            </motion.p>
          </div>

          {/* Animated sparkles */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-4 -right-4 opacity-30"
          >
            <Star size={100} fill="white" stroke="none" />
          </motion.div>
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            className="absolute -bottom-4 -left-4 opacity-20"
          >
            <Sparkles size={80} color="white" />
          </motion.div>
        </div>

        <CardContent className="flex flex-col gap-5 px-6 pt-6">
          {/* Entry Number Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="p-6 rounded-xl text-center border-2"
            style={{ borderColor: BRAND_COLORS.gold, background: '#fff' }}
          >
            <p className="text-sm font-medium mb-2" style={{ color: '#888' }}>
              Your Competition Entry Number
            </p>
            <p
              className="text-4xl font-bold mb-4"
              style={{ color: BRAND_COLORS.gold }}
            >
              {entryData?.entryNumber || '—'}
            </p>

            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                style={{ borderColor: BRAND_COLORS.gold, color: BRAND_COLORS.gold }}
                onClick={() => {
                  navigator.clipboard.writeText(entryData?.entryNumber || '');
                }}
              >
                <Copy size={14} className="mr-1" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                style={{ borderColor: BRAND_COLORS.gold, color: BRAND_COLORS.gold }}
              >
                <Share2 size={14} className="mr-1" />
                Share
              </Button>
            </div>
          </motion.div>

          {/* Entry Details */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="p-4 rounded-xl space-y-2"
            style={{ background: '#fff' }}
          >
            <h3 className="font-bold text-sm" style={{ color: BRAND_COLORS.text }}>
              Entry Details
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: '#888' }}>Name</span>
                <span className="font-medium" style={{ color: BRAND_COLORS.text }}>
                  {entryData?.consumerName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: '#888' }}>Phone</span>
                <span className="font-medium" style={{ color: BRAND_COLORS.text }}>
                  {entryData?.consumerPhone}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: '#888' }}>Area</span>
                <span className="font-medium" style={{ color: BRAND_COLORS.text }}>
                  {entryData?.consumerLocation}
                </span>
              </div>
              {validationResult?.championProducts?.length > 0 && (
                <div className="flex items-center justify-between">
                  <span style={{ color: '#888' }}>Products</span>
                  <div className="flex flex-wrap gap-1">
                    {validationResult.championProducts.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-xs" style={{ borderColor: BRAND_COLORS.gold, color: BRAND_COLORS.gold }}>
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* What happens next */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="p-4 rounded-xl"
            style={{ background: BRAND_COLORS.gold + '15' }}
          >
            <h3 className="font-bold text-sm mb-2" style={{ color: BRAND_COLORS.gold }}>
              What happens next?
            </h3>
            <ul className="text-sm space-y-2" style={{ color: BRAND_COLORS.text }}>
              <li className="flex items-center gap-2">
                <Clock size={16} style={{ color: BRAND_COLORS.gold }} />
                Prize draws happen weekly
              </li>
              <li className="flex items-center gap-2">
                <Phone size={16} style={{ color: BRAND_COLORS.gold }} />
                Winners are notified via SMS
              </li>
              <li className="flex items-center gap-2">
                <Gift size={16} style={{ color: BRAND_COLORS.gold }} />
                Keep buying Champion Toffees for more chances!
              </li>
            </ul>
          </motion.div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 px-6 pt-4 pb-6">
          <Button
            onClick={handleStartOver}
            size="lg"
            className="w-full h-12 font-bold shadow-md"
            style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.gold}, ${BRAND_COLORS.goldLight})`,
              color: 'white',
            }}
          >
            <Sparkles size={18} className="mr-2" />
            Enter Again with New Slip
          </Button>

          <p className="text-xs text-center" style={{ color: '#888' }}>
            Each till slip can only be used once. Buy more Champion Toffees for additional entries!
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );

  // ─── Determine Which Step to Render ───
  const renderStep = () => {
    switch (step) {
      case 'landing': return renderLanding();
      case 'register': return renderRegister();
      case 'upload': return renderUpload();
      case 'validating': return renderValidating();
      case 'result': return renderResult();
      case 'confirmed': return renderConfirmed();
      default: return renderLanding();
    }
  };

  // ─── Main Render ───
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: BRAND_COLORS.bg }}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 shadow-sm" style={{ background: BRAND_COLORS.text }}>
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: BRAND_COLORS.gold }}
            >
              <Trophy size={18} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg">Champion Toffees</span>
          </div>
          {step !== 'landing' && (
            <Badge
              className="text-xs font-semibold"
              style={{ background: BRAND_COLORS.gold, color: 'white' }}
            >
              Step {STEP_ORDER.indexOf(step) + 1}/6
            </Badge>
          )}
        </div>
      </header>

      {/* Step Indicator (show when past landing) */}
      {step !== 'landing' && (
        <StepIndicator currentStep={step} />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-4 py-6 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer
        className="mt-auto py-4 px-4 text-center"
        style={{ background: BRAND_COLORS.text }}
      >
        <p className="text-white/70 text-xs">
          Champion Toffees &quot;Buy, Snap, Win!&quot; Competition • AI-Verified • Fair Play Guaranteed
        </p>
        <p className="text-white/50 text-xs mt-1">
          © 2026 Champion Sweets SA. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
