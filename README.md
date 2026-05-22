# miniproject_agb_co2

โปรเจกต์ประมาณค่ามวลชีวภาพเหนือดิน (Above-Ground Biomass: AGB) และการกักเก็บคาร์บอน (CO₂) ในพื้นที่จังหวัดเชียงใหม่ โดยใช้ข้อมูลภาพดาวเทียมและเทคนิค Machine Learning

## 📁 โครงสร้างโปรเจกต์

```
miniproject_agb_co2/
└── data/
    ├── csv/          # ผลลัพธ์เชิงสถิติ, validation, feature importance
    ├── dem/          # Digital Elevation Model (ดาวน์โหลดจาก Google Drive)
    ├── image_data/   # ภาพ raster AGB/CO2/Forest Map (ดาวน์โหลดจาก Google Drive)
    ├── point/        # จุดตัวอย่าง forest / non-forest (shapefile)
    ├── shp_CM/       # ขอบเขตจังหวัดเชียงใหม่ (shapefile)
    └── shp_forest/   # ขอบเขตพื้นที่ป่า (shapefile)
```

## 📦 ดาวน์โหลดข้อมูล Raster ขนาดใหญ่

ไฟล์ raster ขนาดใหญ่ไม่ได้อัปขึ้น GitHub เนื่องจากเกิน limit (100 MB/ไฟล์) จึงเก็บไว้บน Google Drive

### 🛰️ image_data/ — ภาพดาวเทียมและผลการประมวลผล

| ไฟล์ | คำอธิบาย | ลิงก์ดาวน์โหลด |
|------|---------|----------------|
| `ChiangMai_Change.tif` | แผนที่การเปลี่ยนแปลงพื้นที่ป่า 2019–2023 | [⬇️ Download](https://drive.google.com/file/d/1UBUZszYEfrUIeIgr34RthmoT87DR2Nd4/view?usp=drive_link) |
| `CO2_2023.tif` | การกักเก็บ CO₂ ปี 2023 | [⬇️ Download](https://drive.google.com/file/d/10URgJdAYk1yPGfigIrXRgD06QqpEQiLX/view?usp=drive_link) |
| `CO2_2019.tif` | การกักเก็บ CO₂ ปี 2019 | [⬇️ Download](https://drive.google.com/file/d/11xuYqbQ54EAvNZD9GWXps93-Gg2Qe_is/view?usp=drive_link) |
| `AGB_2023.tif` | มวลชีวภาพเหนือดิน ปี 2023 | [⬇️ Download](https://drive.google.com/file/d/1Nk0Wr6uWpT9yEF5tnLHkfCaiYdz4hB_P/view?usp=drive_link) |
| `AGB_2019.tif` | มวลชีวภาพเหนือดิน ปี 2019 | [⬇️ Download](https://drive.google.com/file/d/1oCA0JKsRe1-DzF2mZrCNZQGoKbZdc_BE/view?usp=drive_link) |
| `Forest_Map_2023.tif` | แผนที่ป่าไม้ ปี 2023 | [⬇️ Download](https://drive.google.com/file/d/1ExodmleTPzml5KFmn_rkHfKPwSm7kLFQ/view?usp=drive_link) |
| `Forest_Map_2019.tif` | แผนที่ป่าไม้ ปี 2019 | [⬇️ Download](https://drive.google.com/file/d/1vq8KZhEN5Z2qzELDSi2S1U66RHxgVKkM/view?usp=drive_link) |

### 🏔️ dem/ — Digital Elevation Model

| ไฟล์ | คำอธิบาย | ลิงก์ดาวน์โหลด |
|------|---------|----------------|
| `dem.tif` | แบบจำลองระดับสูงเชิงเลข | [⬇️ Download](https://drive.google.com/file/d/1FGLiSjmhHhU03aBzA0wMI13R_f7N0hhW/view?usp=drive_link) |

> **หมายเหตุ:** หลังดาวน์โหลด ให้วางไฟล์ในโฟลเดอร์ที่ระบุ (`data/image_data/` หรือ `data/dem/`)

## 📊 ข้อมูล CSV (อยู่ใน repo)

ไฟล์ทั้งหมดในโฟลเดอร์ `data/csv/`:

- `AGB_CO2_by_ForestType.csv` — AGB/CO₂ แยกตามประเภทป่า
- `AGB_Regression_Diagnostics.csv` — Diagnostics ของ regression model
- `AGB_Uncertainty_Province.csv` — Uncertainty ระดับจังหวัด
- `ChiangMai_Stats_by_District.csv` — สถิติแยกตามอำเภอ
- `ChiangMai_Stats_by_District_ForestType.csv` — สถิติแยกตามอำเภอ × ประเภทป่า
- `ChiangMai_Summary_Statistics.csv` — สรุปสถิติรวม
- `Feature_Importance_Classifier.csv` — ความสำคัญของ features (จำแนกป่า/ไม่ใช่ป่า)
- `Feature_Importance_Regressor.csv` — ความสำคัญของ features (regression AGB)
- `Per_Forest_Type_Accuracy.csv` — ความแม่นยำแยกตามประเภทป่า
- `Per_NonForest_Type_FalseRate.csv` — Error rate ของ non-forest
- `Scatter_AGB_Predicted_vs_Observed.csv` — Predicted vs Observed
- `Validation_AGB_Regression.csv` — Validation ของ regression
- `Validation_External_AreaForest.csv` — Validation ภายนอกด้วยข้อมูลพื้นที่ป่า
- `Validation_Internal.csv` — Validation ภายใน

## 🗺️ ข้อมูล Shapefile (อยู่ใน repo)

- `data/point/` — จุดตัวอย่าง forest และ non-forest
- `data/shp_forest/` — ขอบเขตพื้นที่ป่า
- `data/shp_CM/` — ขอบเขตจังหวัดเชียงใหม่

## 🛠️ การใช้งาน

1. Clone repository:
   ```bash
   git clone https://github.com/Dante2907/miniproject_agb_co2.git
   cd miniproject_agb_co2
   ```

2. ดาวน์โหลดไฟล์ raster จากตารางด้านบน วางใน `data/image_data/` และ `data/dem/`

3. โครงสร้างข้อมูลสุดท้ายควรครบทุกโฟลเดอร์ตามที่ระบุไว้ด้านบน

## 👤 ผู้พัฒนา

- **Dante2907** — teetawats@gmail.com
