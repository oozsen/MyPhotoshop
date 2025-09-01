/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from '@google/genai';

// --- Arayüz ve Veri Tanımları ---

interface Service {
  id: string;
  icon: string;
  title: string;
  description: string;
}

const services: Service[] = [
  {
    id: 'photo-restoration',
    icon: 'fa-solid fa-wand-magic-sparkles',
    title: 'Fotoğraf Restorasyonu',
    description:
      'Çizikleri onarın, odağı iyileştirin ve eski fotoğrafları renklendirin.',
  },
  {
    id: 'apparel',
    icon: 'fa-solid fa-shirt',
    title: 'Kıyafet',
    description: 'Kıyafet stilini, rengini veya türünü sorunsuzca değiştirin.',
  },
  {
    id: 'background',
    icon: 'fa-solid fa-mountain-sun',
    title: 'Arka Plan',
    description:
      'Arka planı hayal edebileceğiniz herhangi bir şeyle değiştirin.',
  },
  {
    id: 'object-inpainting',
    icon: 'fa-solid fa-eraser',
    title: 'Nesne Düzenleme',
    description: 'Fotoğraflarınızdan herhangi bir nesneyi ekleyin veya kaldırın.',
  },
  {
    id: 'character-design',
    icon: 'fa-solid fa-user-astronaut',
    title: 'Karakter Tasarımı',
    description: 'Portrelerinizi farklı sanatsal karakterlere dönüştürün.',
  },
];

// --- Yardımcı Fonksiyonlar ---

/**
 * Dosyayı Base64 string'ine dönüştürür.
 * @param file Dönüştürülecek dosya.
 * @returns Base64 string'i ve mime türünü içeren bir nesne döndüren bir Promise.
 */
function fileToGenerativePart(
  file: File,
): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve({
        inlineData: {
          data: result.split(',')[1],
          mimeType: file.type,
        },
      });
    };
    reader.readAsDataURL(file);
  });
}

// --- DOM Elementlerini Seçme ---

const landingPage = document.getElementById('landing-page')!;
const editorPage = document.getElementById('editor-page')!;
const servicesGrid = document.getElementById('services-grid')!;
const uploadContainer = document.getElementById('upload-container')!;
const uploadTitle = document.getElementById('upload-title')!;
const uploadIcon = document.getElementById('upload-icon')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const editorContainer = document.getElementById('editor-container')!;
const beforeImage = document.getElementById('before-image') as HTMLImageElement;
const afterImage = document.getElementById('after-image') as HTMLImageElement;
const promptInput = document.getElementById(
  'prompt-input',
) as HTMLTextAreaElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const backToServicesBtn = document.getElementById('back-to-services')!;
const serviceName = document.getElementById('service-name')!;
const loader = document.getElementById('loader')!;
const refineTaskContainer = document.getElementById('refine-task-container')!;
const taskButtons = document.querySelectorAll<HTMLButtonElement>('.task-btn');

// Image Comparison Slider
const sliderHandle = document.getElementById('slider-handle')!;
const imageComparison = document.getElementById('image-comparison')!;

// --- Uygulama Durumu (State) ---

let activeService: Service | null = null;
let uploadedFile: File | null = null;
let ai: GoogleGenAI | null = null;
let selectedApparelTask: string = 'T-shirt';

// --- Ana Fonksiyonlar ---

/**
 * Belirli bir servisi düzenleyici görünümünde açar.
 * @param service Açılacak servis nesnesi.
 */
function openEditor(service: Service) {
  activeService = service;
  landingPage.classList.add('hidden');
  editorPage.classList.remove('hidden');
  editorContainer.classList.add('hidden');
  uploadContainer.classList.remove('hidden');

  // UI'ı seçilen servise göre güncelle
  uploadTitle.textContent = `${service.title} için bir resim yükle`;
  uploadIcon.innerHTML = `<i class="${service.icon}" aria-hidden="true"></i>`;
  serviceName.textContent = service.title.toUpperCase();

  if (service.id === 'apparel') {
    refineTaskContainer.classList.remove('hidden');
    serviceName.textContent = 'GÖREVİ DETAYLANDIR';
  } else {
    refineTaskContainer.classList.add('hidden');
  }

  // Update prompt placeholder
  const placeholders: { [key: string]: string } = {
    'photo-restoration': 'Örn: Çizikleri kaldır ve renkleri canlandır',
    apparel: 'Örn: Lacivert bir takım elbiseye çevir',
    background: 'Örn: Arka planı karlı bir dağ manzarası yap',
    'object-inpainting': 'Örn: Masadaki bardağı kaldır',
    'character-design': 'Örn: Kişiyi bir süper kahramana dönüştür',
  };
  promptInput.placeholder =
    placeholders[service.id] ||
    "Örn: 'Ceketi mavi yap' veya 'Bu fotoğrafı benim için restore et'";
}

/**
 * Ana sayfaya geri döner ve düzenleyiciyi sıfırlar.
 */
function goHome() {
  landingPage.classList.remove('hidden');
  editorPage.classList.add('hidden');
  resetEditorState();
}

/**
 * Düzenleyici durumunu başlangıç haline sıfırlar.
 */
function resetEditorState() {
  activeService = null;
  uploadedFile = null;
  fileInput.value = '';
  promptInput.value = '';
  beforeImage.src = '';
  afterImage.src = '';
  beforeImage.style.clipPath = ''; // Satır içi stili sıfırla
  sliderHandle.style.left = '50%'; // Kaydırıcı tutamacını sıfırla
  editorContainer.classList.add('hidden');
  uploadContainer.classList.remove('hidden');
  refineTaskContainer.classList.add('hidden');
  downloadBtn.classList.add('hidden');
  selectedApparelTask = 'T-shirt'; // Reset to default
  taskButtons.forEach((btn) => btn.classList.remove('active'));
  document.querySelector('.task-btn[data-task="T-shirt"]')?.classList.add('active');
}

/**
 * Yüklenen bir dosyayı işler ve düzenleyiciyi hazırlar.
 * @param file İşlenecek dosya.
 */
async function handleFile(file: File) {
  if (!file.type.startsWith('image/')) {
    alert('Lütfen bir resim dosyası yükleyin.');
    return;
  }
  uploadedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const imageUrl = e.target?.result as string;

    beforeImage.src = imageUrl;
    afterImage.src = imageUrl; // Başlangıçta iki resim de aynı

    uploadContainer.classList.add('hidden');
    editorContainer.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

/**
 * Gemini API'sini kullanarak görüntü oluşturma işlemini gerçekleştirir.
 */
async function generateImage() {
  if (!uploadedFile || !promptInput.value || !ai) {
    alert('Lütfen bir resim yükleyin ve bir istem girin.');
    return;
  }

  loader.classList.remove('hidden');
  downloadBtn.classList.add('hidden');
  generateBtn.disabled = true;
  promptInput.disabled = true;

  try {
    const imagePart = await fileToGenerativePart(uploadedFile);
    let promptText = promptInput.value;
    if (activeService?.id === 'apparel') {
      promptText = `İstenen kıyafet türü: ${selectedApparelTask}. İstenen değişiklik: "${promptInput.value}"`;
    }
    const textPart = { text: promptText };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [imagePart, textPart],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Image = part.inlineData.data;
        const mimeType = part.inlineData.mimeType;
        afterImage.src = `data:${mimeType};base64,${base64Image}`;
        downloadBtn.classList.remove('hidden');
        break; // İlk resmi bulduğumuzda döngüden çık
      }
    }
  } catch (error) {
    console.error('Görüntü oluşturulurken hata oluştu:', error);
    alert('Görüntü oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.');
  } finally {
    loader.classList.add('hidden');
    generateBtn.disabled = false;
    promptInput.disabled = false;
  }
}

/**
 * Düzenlenen görüntüyü indirir.
 */
function downloadImage() {
  if (!afterImage.src || afterImage.src === beforeImage.src) {
    alert('İndirilecek düzenlenmiş bir resim yok.');
    return;
  }
  const link = document.createElement('a');
  link.href = afterImage.src;
  link.download = 'ozgurs-photoshop-duzenlendi.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Olay Dinleyicileri (Event Listeners) ---

// Servis Kartları
services.forEach((service) => {
  const card = document.createElement('div');
  card.className = 'service-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', service.title);
  card.innerHTML = `
    <div class="icon"><i class="${service.icon}" aria-hidden="true"></i></div>
    <h3>${service.title}</h3>
    <p>${service.description}</p>
  `;
  card.addEventListener('click', () => {
    openEditor(service);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.click();
    }
  });
  servicesGrid.appendChild(card);
});

// Apparel task buttons
taskButtons.forEach((button) => {
  button.addEventListener('click', () => {
    taskButtons.forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    selectedApparelTask = button.dataset.task!;
  });
});

// Geri Dön Düğmesi
backToServicesBtn.addEventListener('click', goHome);

// Dosya Yükleme
uploadContainer.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleFile(file);
});

// Sürükle ve Bırak
uploadContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadContainer.classList.add('dragover');
});
uploadContainer.addEventListener('dragleave', () => {
  uploadContainer.classList.remove('dragover');
});
uploadContainer.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadContainer.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

// Oluştur Düğmesi
generateBtn.addEventListener('click', generateImage);

// İndir Düğmesi
downloadBtn.addEventListener('click', downloadImage);

// Karşılaştırma Kaydırıcısı
let isDragging = false;
sliderHandle.addEventListener('mousedown', () => (isDragging = true));
document.addEventListener('mouseup', () => (isDragging = false));
imageComparison.addEventListener('mouseleave', () => (isDragging = false));
imageComparison.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = imageComparison.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const width = Math.max(0, Math.min(x, rect.width));
  const percentage = (width / rect.width) * 100;
  sliderHandle.style.left = `${percentage}%`;
  beforeImage.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
});

// --- Başlatma ---

/**
 * Uygulamayı başlatır.
 */
function initialize() {
  if (!process.env.API_KEY) {
    document.body.innerHTML = `
      <div style="padding: 2rem; text-align: center;">
        <h1>API Anahtarı Eksik</h1>
        <p>Lütfen ortam değişkenlerinde API_KEY'i ayarlayın.</p>
      </div>
    `;
    return;
  }
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
}

initialize();

export {};