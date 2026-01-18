(() => {
  const cameraBtn = document.getElementById("cameraBtn");
  const captureBtn = document.getElementById("captureBtn");
  const stopBtn = document.getElementById("stopBtn");
  const modeText = document.getElementById("modeText");
  const camDot = document.getElementById("camDot");

  const boldness = document.getElementById("boldness");
  const boldVal = document.getElementById("boldVal");
  
  let stream = null;
  let video = document.createElement("video");
  video.playsInline = true;
  
  let mode = "image"; // "image" | "camera"
  let rafId = null;
  
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const fileInput = document.getElementById("fileInput");
  const fitBtn = document.getElementById("fitBtn");
  const clearBtn = document.getElementById("clearBtn");

  const depthEl = document.getElementById("depth");
  const undertoneEl = document.getElementById("undertone");
  const swatchEl = document.getElementById("swatch");
  const rgbEl = document.getElementById("rgb");
  const labEl = document.getElementById("lab");

  const metalsEl = document.getElementById("metals");
  const stonesEl = document.getElementById("stones");
  const contrastEl = document.getElementById("contrast");
  const warningsEl = document.getElementById("warnings");

  let img = new Image();
  let imgLoaded = false;
  function stopCamera() {
    mode = "image";
    captureBtn.disabled = true;
    stopBtn.disabled = true;
  
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
  }
  
  function setModeUI(text, camOn){
    modeText.textContent = text;
    camDot.classList.toggle("on", !!camOn);
  }

  function drawCameraFrame() {
    if (mode !== "camera") return;
  
    // Ensure canvas matches video
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
  
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
  
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
    // Draw ROI overlay (your existing sel drawing)
    if (sel) {
      // IMPORTANT: call your existing draw overlay logic
      // easiest: temporarily draw overlay without redrawing image
      drawOverlayOnly();
    }
  
    rafId = requestAnimationFrame(drawCameraFrame);
  }

  function drawOverlayOnly() {
    if (!sel) return;
    const r = sortRect(sel);
  
    // Dim outside ROI
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill("evenodd");
    ctx.restore();
  
    // ROI border
    ctx.save();
    ctx.strokeStyle = "rgba(106,166,255,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    ctx.restore();
  }
  
  // Selection state (in canvas coordinates)
  let isDragging = false;
  let sel = null; // {x,y,w,h}

  // Fit/scale handling: we draw the image into canvas at native pixel resolution but fit in CSS.
  // We'll size canvas to the image size (or a downscaled version).
  let drawScale = 1; // 1 means canvas pixels match displayed pixels for simplicity.

  // ---------- Utilities ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function sortRect(r) {
    const x1 = Math.min(r.x, r.x + r.w);
    const y1 = Math.min(r.y, r.y + r.h);
    const x2 = Math.max(r.x, r.x + r.w);
    const y2 = Math.max(r.y, r.y + r.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function toHex(r, g, b) {
    const h = (n) => n.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  // sRGB -> linear
  function srgbToLinear(c) {
    c = c / 255;
    return (c <= 0.04045) ? (c / 12.92) : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  // linear -> XYZ (D65)
  function rgbToXyz(r, g, b) {
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);

    // sRGB D65 matrix
    const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
    const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
    return { X, Y, Z };
  }

  function xyzToLab(X, Y, Z) {
    // D65 reference white
    const Xn = 0.95047;
    const Yn = 1.00000;
    const Zn = 1.08883;

    const f = (t) => {
      const d = 6 / 29;
      return (t > Math.pow(d, 3)) ? Math.cbrt(t) : (t / (3 * d * d) + 4 / 29);
    };

    const fx = f(X / Xn);
    const fy = f(Y / Yn);
    const fz = f(Z / Zn);

    const L = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const b = 200 * (fy - fz);
    return { L, a, b };
  }

  function rgbToLab(r, g, b) {
    const { X, Y, Z } = rgbToXyz(r, g, b);
    return xyzToLab(X, Y, Z);
  }

  function median(arr) {
    const a = arr.slice().sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return (a.length % 2 === 0) ? (a[mid - 1] + a[mid]) / 2 : a[mid];
  }

  function updateUIEmpty() {
    depthEl.textContent = "—";
    undertoneEl.textContent = "—";
    rgbEl.textContent = "—";
    labEl.textContent = "—";
    swatchEl.style.backgroundColor = "transparent";
    metalsEl.textContent = "—";
    stonesEl.textContent = "—";
    contrastEl.textContent = "—";
    warningsEl.innerHTML = "";
  }

  // ---------- Classification + Recommendation ----------
  function classifyAndRecommend(lab, rgb, style) {
    const warnings = [];
  
    // ---------- CLASSIFICATION (FIRST) ----------
    let depth = "Medium";
    if (lab.L >= 70) depth = "Light";
    else if (lab.L < 45) depth = "Deep";
  
    let undertone = "Neutral";
    if (lab.b >= 12) undertone = "Warm";
    else if (lab.b <= -8) undertone = "Cool";
  
    // ---------- STYLE SLIDER (SECOND) ----------
    const s = clamp(style, 0, 100);
    const isBold = s >= 50;
  
    // Contrast
    let contrast = "Flexible";
    if (depth === "Light") {
      contrast = isBold
        ? "Medium contrast (avoid very pale stones)"
        : "Subtle-to-medium contrast";
    }
    if (depth === "Deep") {
      contrast = isBold
        ? "High contrast (bright metals + saturated stones pop)"
        : "Medium-to-high contrast";
    }
  
    // Metals (unchanged)
    let metals = "";
    if (undertone === "Warm") metals = "Yellow gold, Rose gold";
    if (undertone === "Cool") metals = "Silver, White gold, Platinum";
    if (undertone === "Neutral") metals = "Mixed metals, Yellow gold or Silver";
  
    // Stones (style-aware, SINGLE definition)
    let stones = "";
    if (undertone === "Warm") {
      stones = isBold
        ? "Emerald, Citrine, Peridot, Coral, Warm reds/oranges"
        : "Warm neutrals: champagne, olive, soft coral";
    }
  
    if (undertone === "Cool") {
      stones = isBold
        ? "Sapphire, Amethyst, Aquamarine, Blue topaz, Cool pinks/purples"
        : "Cool neutrals: icy blue, lavender, soft pink";
    }
  
    if (undertone === "Neutral") {
      stones = isBold
        ? "Wide palette; pick saturated colors for impact"
        : "Neutrals + soft accents (easy to match)";
    }
  
    // ---------- WARNINGS ----------
    const maxC = Math.max(rgb.r, rgb.g, rgb.b);
    const minC = Math.min(rgb.r, rgb.g, rgb.b);
    if ((maxC - minC) < 8) {
      warnings.push("ROI has very low color variation; ensure you selected skin (not background or glare).");
    }
    if (lab.L > 92) warnings.push("ROI is very bright; glare/overexposure can distort results.");
    if (lab.L < 10) warnings.push("ROI is very dark; shadow can distort results.");
  
    return { depth, undertone, metals, stones, contrast, warnings };
  }
  
  // ---------- Drawing ----------
  function resizeCanvasToImage(maxW = 1000, maxH = 800) {
    if (!imgLoaded) return;

    // Downscale large images for performance
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    drawScale = scale;

    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    sel = null;
    updateUIEmpty();
    draw();
  }

  function draw() {
    if (mode === "camera") {
      // Camera frames are drawn in drawCameraFrame(); only overlay here if needed.
      // If not dragging, overlay still gets applied by the RAF loop.
      return;
    }
  
    if (!imgLoaded) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
    if (sel) {
      // your existing overlay drawing here (keep as-is)
      const r = sortRect(sel);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill("evenodd");
      ctx.restore();
  
      ctx.save();
      ctx.strokeStyle = "rgba(106,166,255,0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
      ctx.restore();
    }
  }
  

  cameraBtn.addEventListener("click", async () => {
    if (mode === "camera") return;
  
    // switch to camera mode
    stopCamera();              // stop any previous stream safely
    mode = "camera";
    sel = null;
    updateUIEmpty();
  
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
  
      captureBtn.disabled = false;
      stopBtn.disabled = false;
  
      drawCameraFrame();
  
    } catch (err) {
      stopCamera();
      alert("Camera access denied or unavailable.");
    }
  });
  
  stopBtn.addEventListener("click", () => {
    stopCamera();
    draw(); // redraw last image if any
  });
  
  captureBtn.addEventListener("click", () => {
    if (mode !== "camera") return;
  
    // Freeze current camera frame into img, then switch to image mode (keeps ROI workflow identical)
    const dataUrl = canvas.toDataURL("image/png");
    img = new Image();
    img.onload = () => {
      imgLoaded = true;
      stopCamera(); // switches to image mode
      resizeCanvasToImage(); // your existing function
    };
    img.src = dataUrl;
  });


  boldness.addEventListener("input", () => {
    boldVal.textContent = boldness.value;
    // re-run analysis instantly if selection exists
    if (sel) analyzeSelection();
  });

  function canvasPointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    // Convert from CSS pixels to canvas pixels
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  // ---------- ROI Analysis ----------
  function analyzeSelection() {
    if (!imgLoaded || !sel) return;

    const r = sortRect(sel);

    // Minimum size
    if (r.w < 15 || r.h < 15) {
      warningsEl.innerHTML = "Selection is too small. Drag a slightly bigger patch of skin.";
      return;
    }

    // Clamp to canvas bounds
    const x = Math.round(clamp(r.x, 0, canvas.width - 1));
    const y = Math.round(clamp(r.y, 0, canvas.height - 1));
    const w = Math.round(clamp(r.w, 1, canvas.width - x));
    const h = Math.round(clamp(r.h, 1, canvas.height - y));

    const imageData = ctx.getImageData(x, y, w, h).data;

    // Sample pixels; skip near-transparent (not relevant here), and skip obvious extremes to reduce glare influence
    const rs = [], gs = [], bs = [];
    for (let i = 0; i < imageData.length; i += 4) {
      const R = imageData[i];
      const G = imageData[i + 1];
      const B = imageData[i + 2];
      // Optional: skip nearly-white glare pixels
      if (R > 245 && G > 245 && B > 245) continue;
      rs.push(R); gs.push(G); bs.push(B);
    }

    if (rs.length < 30) {
      warningsEl.innerHTML = "ROI contains too few usable pixels (glare/shadow). Select a different area.";
      return;
    }

    const rMed = Math.round(median(rs));
    const gMed = Math.round(median(gs));
    const bMed = Math.round(median(bs));

    const lab = rgbToLab(rMed, gMed, bMed);
    const result = classifyAndRecommend(
      lab,
      { r: rMed, g: gMed, b: bMed },
      Number(boldness?.value ?? 60)
    );

    // Update UI
    depthEl.textContent = result.depth;
    undertoneEl.textContent = result.undertone;

    const hex = toHex(rMed, gMed, bMed);
    swatchEl.style.backgroundColor = hex;

    rgbEl.textContent = `${hex}  (R${rMed} G${gMed} B${bMed})`;
    labEl.textContent = `Lab(L* ${lab.L.toFixed(1)}, a* ${lab.a.toFixed(1)}, b* ${lab.b.toFixed(1)})`;

    metalsEl.textContent = result.metals;
    stonesEl.textContent = result.stones;
    contrastEl.textContent = result.contrast;

    warningsEl.innerHTML = result.warnings.length
      ? result.warnings.map(w => `• ${w}`).join("<br/>")
      : "";

      renderProducts(result);

  }

  const productsEl = document.getElementById("products");

function renderProducts(result) {
  productsEl.innerHTML = "";

  let items = [];

  if (result.undertone === "Warm") {
    items = [
      { img: "assets/products/gold_bracelet.jpg", label: "Gold bracelet" },
      { img: "assets/products/emerald_ring.png", label: "Emerald ring" },
    ];
  }

  if (result.undertone === "Cool") {
    items = [
      { img: "assets/products/silver_bracelet.jpg", label: "Silver bracelet" },
      { img: "assets/products/sapphire_ring.jpg", label: "Sapphire ring" },
    ];
  }

  if (result.undertone === "Neutral") {
    items = [
      { img: "assets/products/neutral_watch.jpg", label: "Classic watch" },
      { img: "assets/products/rose_gold_watch.jpg", label: "Rose-gold watch" },
    ];
  }

  items.forEach(p => {
    const div = document.createElement("div");
    div.className = "product";
    div.innerHTML = `
      <img src="${p.img}" alt="${p.label}">
      <span>${p.label}</span>
    `;
    productsEl.appendChild(div);
  });
}


  // ---------- Events ----------
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    // If camera is running, stop it
    if (mode === "camera") stopCamera();
  
    const url = URL.createObjectURL(file);
    img = new Image();
    img.onload = () => {
      imgLoaded = true;
      resizeCanvasToImage();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
  

  fitBtn.addEventListener("click", () => {
    resizeCanvasToImage();
  });

  clearBtn.addEventListener("click", () => {
    sel = null;
    updateUIEmpty();
    imgLoaded = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    productsEl.innerHTML = "";
    draw();
  });

  canvas.addEventListener("mousedown", (e) => {
    if (!imgLoaded) return;
    isDragging = true;
    const p = canvasPointFromEvent(e);
    sel = { x: p.x, y: p.y, w: 0, h: 0 };
    draw();
  });

  window.addEventListener("mousemove", (e) => {
    if (!imgLoaded || !isDragging || !sel) return;
    const p = canvasPointFromEvent(e);
    sel.w = p.x - sel.x;
    sel.h = p.y - sel.y;
    draw();
  });

  window.addEventListener("mouseup", () => {
    if (!imgLoaded || !isDragging) return;
    isDragging = false;
    draw();
    analyzeSelection();
  });

  // Touch support
  canvas.addEventListener("touchstart", (e) => {
    if (!imgLoaded) return;
    e.preventDefault();
    const t = e.touches[0];
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    const x = (t.clientX - rect.left) * (canvas.width / rect.width);
    const y = (t.clientY - rect.top) * (canvas.height / rect.height);
    sel = { x, y, w: 0, h: 0 };
    draw();
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (!imgLoaded || !isDragging || !sel) return;
    e.preventDefault();
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (t.clientX - rect.left) * (canvas.width / rect.width);
    const y = (t.clientY - rect.top) * (canvas.height / rect.height);
    sel.w = x - sel.x;
    sel.h = y - sel.y;
    draw();
  }, { passive: false });

  canvas.addEventListener("touchend", () => {
    if (!imgLoaded || !isDragging) return;
    isDragging = false;
    draw();
    analyzeSelection();
  });

  updateUIEmpty();
})();


