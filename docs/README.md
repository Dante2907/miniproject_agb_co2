# 🌳 Chiang Mai Forest Atlas — Web Application

เว็บ visualization โทนเขียว-ขาว สไตล์ editorial scientific สำหรับโปรเจกต์ประมาณค่า AGB และ CO₂ ของจังหวัดเชียงใหม่

## 📁 โครงสร้าง

```
docs/
├── index.html                    ← หน้าเว็บหลัก
├── css/style.css
├── js/main.js
├── data/
│   ├── stats.json                ← ข้อมูลสถิติทั้งหมด (สร้างจาก CSV)
│   ├── geojson/                  ← shapefile แปลงเป็น GeoJSON
│   │   ├── bounds.json
│   │   ├── forest_dissolved.geojson
│   │   ├── point_forest.geojson
│   │   └── point_non_forest.geojson
│   └── overlays/                 ← ⚠️ ต้องสร้าง PNG เองจาก QGIS (ดูด้านล่าง)
│       ├── AGB_2019.png
│       ├── AGB_2023.png
│       ├── CO2_2019.png
│       ├── CO2_2023.png
│       ├── ForestMap_2019.png
│       ├── ForestMap_2023.png
│       └── Change.png
└── assets/
```

## 🚀 วิธี Deploy บน GitHub Pages

### 1. ย้ายโฟลเดอร์ docs/ เข้า repo

```powershell
# ใน D:\data (root ของ repo)
# ตรวจว่ามีโฟลเดอร์ docs/ ใหม่
ls docs

git add docs/
git commit -m "Add web atlas (docs/)"
git push
```

### 2. เปิด GitHub Pages

1. ไปที่ https://github.com/Dante2907/miniproject_agb_co2/settings/pages
2. ใต้ **Source** → เลือก `Deploy from a branch`
3. **Branch:** `main` · **Folder:** `/docs`
4. กด **Save**
5. รอ 1-2 นาที จะได้ URL: `https://dante2907.github.io/miniproject_agb_co2/`

## 🖼️ วิธี Export PNG Overlay จาก QGIS

เว็บใช้ PNG overlay (ไม่ใช่ .tif ตรง) เพราะเบราว์เซอร์ไม่สามารถ render GeoTIFF ขนาดใหญ่ได้ ต้องแปลงทีละไฟล์ใน QGIS:

### ขั้นตอนสำหรับแต่ละ raster (ทำซ้ำกับทุกไฟล์)

1. เปิด QGIS โหลด `.tif` ที่ต้องการ (เช่น `AGB_2019.tif`)
2. **กำหนดสีให้สวยงาม:**
   - Right-click layer → **Properties** → **Symbology**
   - Render type: **Singleband pseudocolor**
   - Color ramp: เลือกตามตาราง ↓
   - กด Classify
3. **Export เป็น PNG:**
   - Menu → **Project → Import/Export → Export Map to Image**
   - Extent: ใช้ Extent ของจังหวัดเชียงใหม่ (กด **Calculate from Layer** → เลือก layer ที่จะ export)
   - **สำคัญ:** resolution ประมาณ 200-300 DPI พอ ไม่ต้องสูงมาก
   - Output size: ราว 2000-3000 px กว้าง
   - **ปิด** Background และ Layer ที่ไม่ต้องการ (เก็บเฉพาะ raster ที่จะ export)
   - Save เป็น `.png`
4. เซฟไฟล์ในชื่อตามตารางและวางใน `docs/data/overlays/`

### สีแนะนำ (ให้เข้ากับธีมเว็บ)

| ไฟล์ | Color ramp | ชื่อไฟล์ output |
|------|-----------|-----------------|
| `AGB_2019.tif` | YlOrBr (Yellow-Orange-Brown) | `AGB_2019.png` |
| `AGB_2023.tif` | YlOrBr | `AGB_2023.png` |
| `CO2_2019.tif` | Blues หรือ BuPu | `CO2_2019.png` |
| `CO2_2023.tif` | Blues | `CO2_2023.png` |
| `Forest_Map_2019.tif` | Greens (categorical) | `ForestMap_2019.png` |
| `Forest_Map_2023.tif` | Greens | `ForestMap_2023.png` |
| `ChiangMai_Change.tif` | RdYlGn (Red→Yellow→Green) | `Change.png` |

### ⚠️ สำคัญ: Bounds ต้องตรงกัน

PNG overlay จะวางทับแผนที่ตาม bounds ที่อยู่ใน `docs/data/geojson/bounds.json`:

```json
{
  "chiangmai_bounds": {
    "west":  98.0451,
    "south": 17.2423,
    "east":  99.5730,
    "north": 20.1475
  }
}
```

ตอน export จาก QGIS **ต้องใช้ extent นี้** (พิกัด WGS84 / EPSG:4326) ไม่งั้น overlay จะวางไม่ตรง

วิธีตั้ง extent ใน QGIS export dialog:
- Tick "Map extent" หรือใส่ค่ามือ:
  - West: 98.0451 · East: 99.5730
  - South: 17.2423 · North: 20.1475
- CRS: **EPSG:4326**

### Optimize PNG (ลดขนาดไฟล์)

หลัง export ใช้ [tinypng.com](https://tinypng.com) หรือ command line:

```bash
# ติดตั้ง pngquant
pngquant --quality=65-80 *.png --ext .png --force
```

จะลดขนาดได้ ~70% โดยคุณภาพแทบไม่ต่าง

## 🎨 Features ของเว็บ

- ✅ Layer toggle (AGB, CO₂, Forest Map, Change, Forest polygons, Sample points)
- ✅ Year switcher (2019 / 2023 / Compare)
- ✅ Opacity slider
- ✅ 4 basemaps (Light / Dark / Satellite / Terrain)
- ✅ Click feature → popup สถิติ
- ✅ Big stats summary (province level)
- ✅ District ranking table + search
- ✅ Charts:
  - Forest area by type (2019 vs 2023)
  - AGB by forest type
  - Feature importance (top 10)
  - Model validation metrics
  - Detection accuracy
- ✅ Download data cards (Google Drive links)
- ✅ Methodology section
- ✅ Responsive (mobile-friendly)

## 🔧 Local Development

```powershell
# ใน docs/ folder
python -m http.server 8000
# เปิด http://localhost:8000
```

## 📝 ปรับแต่งโทนสี

แก้ใน `css/style.css` ตรงตัวแปร `:root` — เปลี่ยน `--moss-*` เป็นสีอื่นได้

## 📦 ขนาดไฟล์

- HTML/CSS/JS: ~50 KB
- GeoJSON: ~6 MB
- PNG overlays: ขึ้นกับ resolution (แนะนำรวม < 20 MB)
- stats.json: ~17 KB

รวมไม่เกิน 30 MB → GitHub Pages โหลดได้สบาย
