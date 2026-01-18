# Jewellery-Accessories-Recommendation-Demo
Client-side demo that analyses wrist/hand skin tone from an image or webcam and suggests jewellery and accessories using explainable colour heuristics.

# Wrist / Hand Skin Tone → Jewelry & Accessories Recommendation (Demo)

A lightweight, client-side demo that analyzes a small wrist or hand skin patch
and suggests suitable jewelry, watches, and accessories based on
**skin depth**, **undertone bias**, and **style intensity**.

This project is intended as a **UX / algorithm prototype**, not a medical or cosmetic classifier.


##  Features

-   Upload photo or use live webcam
-   Manual ROI selection (user-controlled, transparent logic)
-  Skin tone analysis using CIE Lab color space
-   Undertone classification: Warm / Cool / Neutral
-   Depth estimation: Light / Medium / Deep
-   Style slider (Subtle → Bold) to adjust recommendation intensity
-   Visual product suggestions (bracelets, rings, watches)
-   No backend, no tracking, no data storage

Runs entirely in the browser.


 How It Works

1. User uploads an image or captures a webcam frame  
2. User manually selects a small, evenly-lit skin region  
3. Median RGB color is extracted from the ROI  
4. Color is converted to **CIE Lab**
5. Heuristics determine:
   - Skin depth (L*)
   - Undertone bias (b*)
6. Recommendations are generated using:
   - Undertone
   - Depth
   - Style intensity (slider)
7. Matching accessory images are displayed

No AI models, no black boxes — fully explainable logic.


## 📁 Project Structure

