
import React, { useState, useRef } from 'react';
import { X, Upload, Trash2, Tag, Building2, Box, Loader2, Sparkles, ImageIcon } from 'lucide-react';

interface ManualUploadProps {
  onComplete: (photos: string[]) => void;
  onCancel: () => void;
}

const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 1200;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
  });
};

export const ManualUpload: React.FC<ManualUploadProps> = ({ onComplete, onCancel }) => {
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);

  const steps = [
    { title: "DADOS DA EMPRESA", desc: "Foto do CNPJ e Endereço", icon: <Building2 className="w-6 h-6" /> },
    { title: "FRENTE DO PRODUTO", desc: "Foto da Marca e Conteúdo", icon: <Tag className="w-6 h-6" /> },
    { title: "FUNDO DA EMBALAGEM", desc: "Foto do Fabricante (Plástico)", icon: <Box className="w-6 h-6" /> }
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || currentSlot === null) return;

    setIsCompressing(true);
    try {
      const rawBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });

      const compressed = await compressImage(rawBase64);
      const newPhotos = [...photos];
      newPhotos[currentSlot] = compressed;
      setPhotos(newPhotos);
      setCurrentSlot(null);
    } catch (err) {
      alert("Erro ao processar imagem.");
    } finally {
      setIsCompressing(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openUploader = (index: number) => {
    if (isCompressing) return;
    setCurrentSlot(index);
    fileInputRef.current?.click();
  };

  const removePhoto = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPhotos = [...photos];
    newPhotos[index] = null;
    setPhotos(newPhotos);
  };

  const photoCount = photos.filter(p => p !== null).length;
  const isComplete = photoCount === 3;

  return (
    <div className="max-w-2xl mx-auto py-6 animate-in slide-in-from-bottom-10 px-4">
      <div className="bg-white rounded-[50px] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-10 text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-tighter uppercase leading-none mb-2 italic">Análise Inteligente</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selecione as 3 fotos obrigatórias</p>
          </div>
          <button onClick={onCancel} className="p-4 bg-white/10 rounded-full hover:bg-white/20 transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-5">
          {steps.map((step, index) => (
            <div 
              key={index}
              onClick={() => openUploader(index)}
              className={`relative group cursor-pointer border-2 border-dashed rounded-[35px] p-6 transition-all flex items-center gap-6 ${
                photos[index] 
                  ? 'border-emerald-500 bg-emerald-50/30' 
                  : 'border-slate-200 bg-slate-50 hover:border-blue-400'
              }`}
            >
              <div className={`w-20 h-20 rounded-3xl flex-shrink-0 overflow-hidden border-2 ${photos[index] ? 'border-emerald-200' : 'border-slate-100 bg-white text-slate-400'} flex items-center justify-center shadow-sm`}>
                {photos[index] ? (
                  <img src={photos[index]!} className="w-full h-full object-cover" />
                ) : (
                  currentSlot === index && isCompressing ? <Loader2 className="w-8 h-8 animate-spin text-blue-500" /> : step.icon
                )}
              </div>

              <div className="flex-grow">
                <h3 className={`font-black text-sm tracking-tight uppercase italic ${photos[index] ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {step.title}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{step.desc}</p>
              </div>

              <div className="flex-shrink-0">
                {photos[index] ? (
                  <button onClick={(e) => removePhoto(index, e)} className="p-4 bg-white shadow-md border border-rose-100 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all">
                    <Trash2 className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="p-4 bg-white shadow-md border border-slate-100 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <Upload className="w-5 h-5" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-10 bg-slate-50 border-t border-slate-100">
          <button
            disabled={!isComplete || isCompressing}
            onClick={() => onComplete(photos as string[])}
            className={`w-full py-8 rounded-[35px] font-black text-sm uppercase tracking-widest shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4 ${
              isComplete 
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isComplete ? (
              <>
                <Sparkles className="w-6 h-6" /> Iniciar Análise via IA
              </>
            ) : (
              isCompressing ? <Loader2 className="w-6 h-6 animate-spin" /> : `Faltam ${3 - photoCount} foto(s)`
            )}
          </button>
        </div>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
    </div>
  );
};
