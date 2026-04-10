/**
 * PHOTO BOOTH APPLICATION - Firebase Integrated Version
 * Logic for camera handling (Flip support & Mirroring), 
 * automated 4-shot sessions, local storage persistence, 
 * and Firebase cloud backup.
 */

const firebaseConfig = {
  apiKey: "AIzaSyBvJ34DT6ITuelaUt5ds1Meh9ncOVlz7eY",
  authDomain: "bhagvad-photobooth.firebaseapp.com",
  projectId: "bhagvad-photobooth",
  storageBucket: "bhagvad-photobooth.firebasestorage.app",
  messagingSenderId: "381385393118",
  appId: "1:381385393118:web:f45a104d7c70e7c9e5534f",
  measurementId: "G-6NGH8CN97J"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 1. DOM Elements ---
const landingPage = document.getElementById('landing-page');
const appSide = document.getElementById('app-side');
const startBtn = document.getElementById('start-btn');
const backBtn = document.getElementById('back-to-menu');
const snapBtn = document.getElementById('snap-btn');
const flipBtn = document.getElementById('flip-btn'); 
const clearBtn = document.getElementById('clear-btn');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const gallery = document.getElementById('gallery');
const filterSelect = document.getElementById('filter-select');
const countdownEl = document.getElementById('countdown');
const shotIndicator = document.getElementById('shot-indicator');
const statusBulb = document.getElementById('status-bulb');
const nameInput = document.getElementById('user-name');

// --- 2. Application State ---
let strips = JSON.parse(localStorage.getItem('my_photo_strips')) || [];
let currentFacingMode = "user"; // "user" = front, "environment" = back

// --- 3. Navigation & Camera Logic ---

startBtn.addEventListener('click', () => {
    if (nameInput.value.trim() === "") {
        alert("Please enter your name first!");
        return;
    }
    landingPage.style.display = 'none'; 
    appSide.classList.remove('hidden'); 
    initCamera(currentFacingMode);
});

backBtn.addEventListener('click', () => {
    appSide.classList.add('hidden');
    landingPage.style.display = 'flex';
    stopCamera();
    statusBulb.classList.remove('ready');
});

// Flip Camera Logic
flipBtn.addEventListener('click', () => {
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    initCamera(currentFacingMode);
});

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
}

async function initCamera(facingMode) {
    stopCamera(); // Clear existing stream before switching

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 640 },
                facingMode: facingMode 
            }, 
            audio: false 
        });
        video.srcObject = stream;

        // MIRROR LOGIC: Add CSS class for front camera, remove for back
        if (facingMode === "user") {
            video.classList.add('mirrored');
        } else {
            video.classList.remove('mirrored');
        }

        statusBulb.classList.add('ready');
    } catch (err) {
        console.error("Camera access error:", err);
        alert("Camera access denied or lens unavailable!");
    }
}

// --- 4. The 4-Photo Session Logic ---

async function startSession() {
    snapBtn.disabled = true;
    flipBtn.disabled = true; 
    const currentStripPhotos = [];
    shotIndicator.classList.remove('hidden');

    for (let i = 1; i <= 4; i++) {
        shotIndicator.innerText = `SHOT ${i}/4`;
        await runCountdown(3); 
        
        const photoData = captureSingleFrame();
        currentStripPhotos.push(photoData);

        // Flash effect
        video.style.opacity = "0";
        setTimeout(() => video.style.opacity = "1", 100);

        if (i < 4) {
            shotIndicator.innerText = "GET READY...";
            await new Promise(resolve => setTimeout(resolve, 2000)); 
        }
    }

    shotIndicator.classList.add('hidden');
    
    const newStrip = {
        id: Date.now(),
        images: currentStripPhotos
    };
    
    strips.unshift(newStrip);
    saveAndRender(); 
    snapBtn.disabled = false;
    flipBtn.disabled = false;

    processAndCloudSave(newStrip);
}

function runCountdown(seconds) {
    return new Promise((resolve) => {
        let count = seconds;
        countdownEl.classList.remove('hidden');
        countdownEl.innerText = count;

        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.innerText = count;
            } else {
                clearInterval(timer);
                countdownEl.classList.add('hidden');
                resolve();
            }
        }, 1000);
    });
}
function captureSingleFrame() {
    const context = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 800;

    const size = Math.min(video.videoWidth, video.videoHeight);
    const sourceX = (video.videoWidth - size) / 2;
    const sourceY = (video.videoHeight - size) / 2;

    context.save();

    // 1. Handle Mirroring
    if (video.classList.contains('mirrored')) {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
    }

    // 2. Draw the raw image first
    context.drawImage(video, sourceX, sourceY, size, size, 0, 0, 800, 800);
    context.restore();

    // 3. MANUAL PIXEL BAKING (For iPhone Safari/Chrome)
    if (filterSelect.value !== 'none') {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i+1];
            let b = data[i+2];

            if (filterSelect.value === 'grayscale(100%)') {
                // Standard Grayscale formula
                let avg = 0.3 * r + 0.59 * g + 0.11 * b;
                data[i] = data[i+1] = data[i+2] = avg;
            } 
            else if (filterSelect.value === 'rich-sepia') {
    // 1. Get base luminance (weighted for better contrast)
    let luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // 2. Apply a Power Curve to make the shadows "punchy" and dark
    // This removes the "washed out" grey look
    luminance = 255 * Math.pow(luminance / 255, 1.4);

    // 3. THE CHOCOLATE MIX (Red > Green > Blue)
    // Red gives warmth, Green gives depth, Blue is kept low for the brown tint
    data[i]   = (luminance * 1.1) + 10;  // RED: Over 1.0 makes it rich/warm
    data[i+1] = (luminance * 0.9) + 3;  // GREEN: Balanced for brown
    data[i+2] = (luminance * 0.75);      // BLUE: Low value removes the "cold" blue/grey tint

    // 4. Final Safety Clamp (prevents pixel glitches)
    for (let j = 0; j < 3; j++) {
        if (data[i+j] > 255) data[i+j] = 255;
        if (data[i+j] < 0) data[i+j] = 0;
    }
}
        }
        // Put the modified pixels back on the canvas
        context.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL('image/jpeg', 0.9);
}
// --- 5. Firebase Cloud Saving & Processing ---

// --- Updated Cloud Saving Logic ---
async function processAndCloudSave(stripData) {
    try {
        const finalStripBase64 = await generateStitchedStrip(stripData.id);
        
        if (!finalStripBase64) {
            console.error("Failed to generate strip.");
            return;
        }

        const userName = nameInput.value.trim() || "Anonymous"; 
        
        // Trigger Download
        const link = document.createElement('a');
        link.download = `${userName.replace(/\s+/g, '_')}-photostrip-${stripData.id}.jpg`;
        link.href = finalStripBase64;
        document.body.appendChild(link); // Required for some browsers
        link.click();
        document.body.removeChild(link);

        // Firebase Upload
        await db.collection('booth_shots').add({
            userName: userName,
            stripId: stripData.id,
            imageData: finalStripBase64, // Note: Consider Firebase Storage if images are very large
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: "pending_print"
        });
        
        console.log("Cloud backup successful for " + userName);
    } catch (e) {
        console.error("Process/Cloud save failed:", e);
        alert("Session saved locally, but cloud upload failed. Check connection.");
    }
}

// --- High-Quality Stitching with Error Handling ---
async function generateStitchedStrip(stripId) {
    const stripData = strips.find(s => s.id == stripId);
    if (!stripData) return null;

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');

    // --- 1. HIGH RESOLUTION SETTINGS (Print Quality) ---
    const photoSize = 1200; 
    const padding = 60;
    const gap = 40;
    const footerHeight = 350; // Extra room for text and stickers
    
    tempCanvas.width = photoSize + (padding * 2);
    tempCanvas.height = (photoSize * 4) + (gap * 3) + (padding * 2) + footerHeight;

    // Background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Ensure no filters are applied during stitching
    ctx.filter = "none";

    // --- 2. DRAW PHOTOS ---
    let currentY = padding;
    for (const dataUrl of stripData.images) {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => {
            img.onload = () => {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, padding, currentY, photoSize, photoSize);
                currentY += photoSize + gap;
                resolve();
            };
            img.onerror = reject;
        });
    }

    // --- 3. LOAD HIGH-QUALITY STICKERS ---
    const leftSticker = new Image();
    const rightSticker = new Image();
    
    // Absolute paths to your sticker assets
    leftSticker.src = 'stick1.png'; 
    rightSticker.src = 'stick2.png';

    // Wait for stickers to load before continuing
    await Promise.all([
        new Promise(r => { leftSticker.onload = r; leftSticker.onerror = r; }),
        new Promise(r => { rightSticker.onload = r; rightSticker.onerror = r; })
    ]).catch(e => console.error("Sticker loading failed:", e));

    // --- 4. DRAW FOOTER CONTENT ---
    const userName = nameInput.value.trim().toUpperCase() || "GUEST";
    const today = new Date().toLocaleDateString('en-GB');

    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    
    // User Name
    ctx.font = "bold 80px 'Gaegu', sans-serif";
    ctx.fillText("Jai Jagannath", tempCanvas.width / 2, currentY + 70);
    
    // Event Title
    ctx.font = "bold 60px 'Gaegu', sans-serif";
    ctx.fillText("Srimad Bhagwad 2026", tempCanvas.width / 2, currentY + 160);
    
    // Date
    ctx.font = "50px Arial";
    ctx.fillStyle = "#666";
    ctx.fillText(today, tempCanvas.width / 2, currentY + 240);

    // --- 5. DRAW THE STICKERS ---
    const stickerSize = 320; // Scaled up for the 1200px resolution
    const stickerY = currentY + 40; // Aligned with the name text

    // Draw Left Sticker (only if loaded)
    if (leftSticker.complete && leftSticker.naturalWidth !== 0) {
        ctx.drawImage(leftSticker, padding, stickerY, stickerSize, stickerSize);
    }

    // Draw Right Sticker (only if loaded)
    if (rightSticker.complete && rightSticker.naturalWidth !== 0) {
        ctx.drawImage(
            rightSticker, 
            tempCanvas.width - padding - stickerSize, 
            stickerY, 
            stickerSize, 
            stickerSize
        );
    }

    // --- 6. FINAL DOWNLOAD OUTPUT ---
    // Using PNG ensures stickers stay sharp and colors don't bleed on iPhone
    return tempCanvas.toDataURL("image/jpeg", 0.5);
}
// --- 6. UI & State Handling ---

function renderGallery() {
    gallery.innerHTML = ''; 
    strips.forEach(strip => {
        const stripDiv = document.createElement('div');
        stripDiv.className = 'photostrip';
        let imagesHTML = strip.images.map(img => `<img src="${img}">`).join('');
        stripDiv.innerHTML = `
            <button class="delete-btn" data-id="${strip.id}">&times;</button>
            ${imagesHTML}
            <div class="strip-footer">˗ˏˋ ★ ˎˊ˗</div>
            <button class="download-btn" onclick="downloadStrip('${strip.id}')">Download</button>
        `;
        gallery.appendChild(stripDiv);
    });
}

async function downloadStrip(stripId) {
    const data = await generateStitchedStrip(stripId);
    const link = document.createElement('a');
    link.download = `photostrip-${stripId}.jpg`;
    link.href = data;
    link.click();
}

function saveAndRender() {
    localStorage.setItem('my_photo_strips', JSON.stringify(strips));
    renderGallery();
}

snapBtn.addEventListener('click', startSession);

clearBtn.addEventListener('click', () => {
    if(confirm("Delete entire gallery?")) {
        strips = [];
        saveAndRender();
    }
});

gallery.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const id = parseInt(e.target.getAttribute('data-id'));
        strips = strips.filter(s => s.id !== id);
        saveAndRender();
    }
});

/**
 * Filter Switch Logic
 */
filterSelect.addEventListener('change', () => {
    video.classList.remove('rich-sepia');

    if (filterSelect.value === 'rich-sepia') {
        video.classList.add('rich-sepia');
        video.style.filter = "none"; 
    } else {
        video.style.filter = filterSelect.value;
    }
});

renderGallery();