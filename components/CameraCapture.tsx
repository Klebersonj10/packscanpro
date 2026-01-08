
// Import React to provide the React namespace for React.FC
import React, { useRef, useState, useEffect } from 'react';
import { X, AlertCircle, Scan } from 'lucide-react';

interface SmartScannerProps {
  onAllCaptured: (photos: string[]) => void;
  onCancel: () => void;
}

const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 1200;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const SmartScanner: React.FC<SmartScannerProps> = ({ onAllCaptured, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [autoCaptureProgress, setAutoCaptureProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Alterado de 5 para 8 segundos conforme solicitado
  const PHOTO_TIMEOUT_SECONDS = 8;

  const steps = [
    { title: "DADOS DA EMPRESA", desc: "CNPJ, Endereço e Razão Social", icon: "🏢" },
    { title: "FRENTE DO PRODUTO", desc: "Marca, Nome e Conteúdo (ml/g)", icon: "🏷️" },
    { title: "FUNDO DA EMBALAGEM", desc: "Informação do Fabricante", icon: "📦" }
  ];

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    
    const startCamera = async () => {
      try {
        const constraints = {
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.setAttribute("muted", "true");
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => setIsReady(true)).catch(e => {
              console.error("Autoplay bloqueado:", e);
              setIsReady(true);
            });
          };
        }
      } catch (err: any) {
        console.error("Erro Câmera:", err);
        setError("Não foi possível acessar a câmera traseira. Verifique as permissões.");
      }
    };

    startCamera();
    
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady || step > 2) return;
    
    const intervalTime = (PHOTO_TIMEOUT_SECONDS * 1000) / 100;
    const interval = setInterval(() => {
      setAutoCaptureProgress(prev => {
        if (prev >= 100) {
          performCapture();
          return 0;
        }
        return prev + 1;
      });
    }, intervalTime);
    
    return () => clearInterval(interval);
  }, [isReady, step]);

  const performCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !isReady) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const capturedStr = canvas.toDataURL('image/jpeg', 0.8);
      const compressed = await compressImage(capturedStr);
      handleImageAddition(compressed);
    }
  };

  const handleImageAddition = (base64: string) => {
    setPhotos(prev => {
      const updated = [...prev, base64];
      if (updated.length >= 3) {
        setIsReady(false);
        onAllCaptured(updated.slice(0, 3));
        return updated;
      }
      setStep(updated.length);
      setAutoCaptureProgress(0);
      return updated;
    });
    if ('vibrate' in navigator) navigator.vibrate([80]);
  };

  const secondsRemaining = Math.ceil(PHOTO_TIMEOUT_SECONDS * (1 - autoCaptureProgress / 100));

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden touch-none">
      <div className="absolute top-0 inset-x-0 p-6 z-30 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex justify-between items-start">
          <div className="text-white">
            <h2 className="text-lg font-black tracking-tighter uppercase leading-tight">{steps[step]?.title}</h2>
            <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">{steps[step]?.desc}</p>
          </div>
          <button onClick={onCancel} className="p-2 bg-white/20 rounded-full text-white backdrop-blur-md">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-grow h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-100 ${i < step ? 'bg-green-500' : i === step ? 'bg-blue-500' : ''}`} 
                style={{ width: i === step ? `${autoCaptureProgress}%` : i < step ? '100%' : '0%' }} 
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-grow relative flex items-center justify-center bg-slate-900">
        {error ? (
          <div className="text-white text-center p-8 max-w-xs">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest">{error}</p>
            <button onClick={onCancel} className="mt-6 px-8 py-3 bg-white text-black rounded-xl font-black text-xs uppercase">Voltar</button>
          </div>
        ) : (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover" 
          />
        )}
        
        {!error && isReady && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="w-[80%] aspect-[4/5] border-2 border-white/50 rounded-[40px] shadow-[0_0_0_2000px_rgba(0,0,0,0.5)] flex items-center justify-center">
              <div className="bg-black/40 backdrop-blur-lg px-6 py-3 rounded-full border border-white/20 text-white font-black text-2xl">
                {secondsRemaining}s
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-black p-6 pb-12">
        <button 
          disabled={!isReady} 
          onClick={performCapture} 
          className="w-full bg-white text-black py-5 rounded-[20px] font-black uppercase tracking-widest active:scale-95 disabled:opacity-30 transition-all text-sm"
        >
          Capturar Agora
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};