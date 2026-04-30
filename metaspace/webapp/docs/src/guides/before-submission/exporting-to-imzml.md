# Exporting to imzML Format

METASPACE requires data in the **imzML format** — specifically, centroided
(peak-picked) data stored as two files:

- **`.imzML`** — XML file containing metadata and pixel coordinates
- **`.ibd`** — binary file containing the spectral data

Both files must be present for a valid submission. If your configuration is
not listed below, contact your instrument vendor for conversion instructions.
For additional help, reach out to [contact@metaspace2020.org](mailto:contact@metaspace2020.org).

## Supported Configurations

| Vendor | Platform | Required Files | Software |
|---|---|---|---|
| Generic Multi-Vendor | Any (single file) | Any vendor format | msConvert (ProteoWizard 3.0.6938) + imzMLConverter v1.1.0 |
| Generic Multi-Vendor | Any (multiple files) | Any vendor format | msConvert (ProteoWizard 3.0.6938) + imzMLConverter v1.1.0 |
| Thermo | QExactive | `.raw` | ImageQuest v1.1.0 |
| Thermo | QExactive | `.raw` | RawToImzmlConverter v1.1.4.5 |
| Bruker | Solarix FT-ICR | `.mis` | SCiLS Lab 2016b+ |
| Bruker | Solarix FT-ICR | `.mis` + `peaks.sqlite` | SCiLS Lab 2016b+ |
| Bruker | timsTOF fleX | `.mis` + `.tsf` | SCiLS Lab 2020a |

## 0.1 — Generic Multi-Vendor (Single Input File)

**Software:** msConvert GUI (ProteoWizard 3.0.6938), imzMLConverter v1.1.0

**Notes:**
- Applies to rectangular images where the entire dataset is contained in a
  single file. For datasets where each row is a separate file, see [0.2](#02--generic-multi-vendor-multiple-files).
- This two-step conversion does not always preserve all imaging MS metadata.
  Where available, use a vendor-specific method instead.
- The msConvert command-line interface is also available and can perform the
  equivalent steps — see the msConvert documentation.

**Steps:**

1. Open **msConvert GUI**
2. Add your file: **Browse → select file → OK → Add**
3. Set output options:
   - Format: `mzML`
   - Precision: 32-bit (64-bit also works but produces larger files)
   - Choose an output directory
4. Add the Peak Picking filter:
   - Select **Peak Picking** from the filter drop-down
   - Check **Prefer Vendor**
   - Click **Add**
   - Ensure Peak Picking is at the top of the filter list
5. Click **Start**
6. Launch **imzMLConverter** (from `run.bat`)
7. Click **Add** and select the `.mzML` file produced in step 5
8. Set **File organisation** to `Image per file`
9. Enter the image dimensions (**Pixels in X**, **Pixels in Y**)
10. Add any additional metadata using the tabs at the top
11. Click **Convert** and choose a destination

## 0.2 — Generic Multi-Vendor (Multiple Files)

**Software:** msConvert GUI (ProteoWizard 3.0.6938), imzMLConverter v1.1.0

**Notes:**
- Use this method when each row of the image is stored as a separate file.
- See the notes from [0.1](#01--generic-multi-vendor-single-input-file) for
  general guidance.

**Steps:**

1. Follow steps 1–5 from [0.1](#01--generic-multi-vendor-single-input-file)
   to convert each `.raw` file to `.mzML`
2. Launch **imzMLConverter** (from `run.bat`)
3. Click **Add** and select all the `.mzML` files produced
4. Set **File organisation** to `Row per file`
5. Enter the image dimensions (**Pixels in X**, **Pixels in Y**)
6. Add any additional metadata using the tabs at the top
7. Click **Convert** and choose a destination

## 1.1 — Thermo QExactive (ImageQuest)

**Software:** Thermo ImageQuest v1.1.0

**Notes:**
- Requires a `.raw` file and either a `.MALDIPos` or `.udp` spatial file.
- In some cases the exported image may appear incomplete or distorted. If this
  occurs, try an alternative conversion method or inspect the metadata file.

**Steps:**

1. Open your dataset in **ImageQuest**
2. Go to **File → Export → imzML**
3. Check **Export centroids only**
4. Select 32-bit float precision (64-bit also works but produces larger files)
5. Click **More details** to enter additional experiment metadata
6. Click **OK** and choose a destination

## 1.2 — Thermo QExactive (RawToImzmlConverter)

**Software:** RawToImzmlConverter v1.1.4.5 (University of Giessen)

**Notes:**
- All image acquisition parameters must be entered manually — ensure they are
  recorded carefully during data acquisition.
- This software is designed and maintained for AP-SMALDI series instruments.

**Steps:**

1. In the **Conversion** tab:
   - Select your `.raw` imaging MS dataset
   - Check **Force Centroid?**
2. In the **Imaging** tab:
   - Verify that **Dimensions** (pixels in X and Y) and **Pixel Size** (X and Y
     spacing) are correctly entered
   - Confirm the scan pattern matches your experiment
3. Fill in all metadata in the remaining tabs
4. Click **Convert!**

## 2.1 — Bruker Solarix FT-ICR (flexImaging)

**Software:** flexImaging v3

This configuration is not currently supported. If you need to export Bruker
FTMS data and do not have access to SCiLS Lab 2016b, contact
[contact@metaspace2020.org](mailto:contact@metaspace2020.org).

## 2.2 — Bruker Solarix FT-ICR (SCiLS Lab, Profile Data)

**Software:** SCiLS Lab 2016b or later

**Notes:**
- This method is still undergoing testing. Contact
  [contact@metaspace2020.org](mailto:contact@metaspace2020.org) if you encounter
  any issues.
- Refer to **Section Exporting spectra from regions to METASPACE** in the SCiLS
  Lab Manual, or contact SCiLS Lab Support at
  [support.scils@bruker.com](mailto:support.scils@bruker.com).

**Steps:**

1. Import the dataset in SCiLS Lab: **splash screen → New → follow the dialogue**
2. Open the imported dataset
3. Create a peak list before exporting:
   - Create it within SCiLS Lab using **Feature Finding (T-ReX)** (see SCiLS
     Lab Manual, Section 5.3.2), or import an externally created list (see
     Section 4.6)
   - Ensure the peak interval width is set to a sensible value (see Section 6.2:
     Accessing File Specific Properties)
4. In the **Objects** tab, click the export icon next to the region to export,
   then select **Export to imzML**
5. In the Export Spectra dialog:
   - Select your desired **Normalization**
   - Choose between the complete spectra or a reduced feature list (see SCiLS
     Lab Manual for details)
   - Confirm the correct **polarity** — this is required for METASPACE upload
   - Select a save location for the `.imzML` and `.ibd` files
6. The export runs as a background task. Progress is shown in the **Tasks** tab.

## 2.3 — Bruker Solarix FT-ICR (SCiLS Lab, peaks.sqlite)

**Software:** SCiLS Lab 2016b or later

**Notes:**
- Use this method when the dataset was acquired with on-the-fly centroid
  detection, indicated by a `peaks.sqlite` file inside the `.d` folder.
- Refer to **Section 7.6: Exporting spectra from regions to imzML** in the
  SCiLS Lab Manual, or contact
  [support.scils@bruker.com](mailto:support.scils@bruker.com).

**Steps:**

1. Import the dataset in SCiLS Lab: **splash screen → New → follow the dialogue**
2. Open the imported dataset
3. Create a peak list before exporting (see step 3 in [2.2](#22--bruker-solarix-ft-icr-scils-lab-profile-data) for details)
4. In the **Objects** tab, click the export icon next to the region to export,
   then select **Export to imzML**
5. In the Export Spectra dialog:
   - Select your desired **Normalization**
   - Choose between the complete spectra or a reduced feature list
   - Confirm the correct **polarity**
   - Select a save location for the `.imzML` and `.ibd` files
6. The export runs as a background task. Progress is shown in the **Tasks** tab.

## 2.4 — Bruker timsTOF fleX (SCiLS Lab)

**Software:** SCiLS Lab 2020a

**Notes:**
- METASPACE is currently **incompatible with TIMS measurements**.
- This method is still undergoing testing. Contact
  [contact@metaspace2020.eu](mailto:contact@metaspace2020.eu) if you encounter
  any issues.
- Refer to **Section Exporting spectra from regions to METASPACE** in the SCiLS
  Lab Manual, or contact
  [support.scils@bruker.com](mailto:support.scils@bruker.com).

**Steps:**

1. In the **Objects** tab, click the export icon next to the region to export,
   then select **Export to imzML**
2. In the Export Spectra dialog:
   - Select your desired **Normalization**
   - Choose between the complete spectra or a reduced feature list
   - Confirm the correct **polarity**
   - Select a save location for the `.imzML` and `.ibd` files
3. The export runs as a background task. Progress is shown in the **Tasks** tab.

## Software & References

| Tool | Link |
|---|---|
| ProteoWizard (msConvert) | [proteowizard.sourceforge.net](http://proteowizard.sourceforge.net/download.html) |
| imzMLConverter 1.3.0 (GUI) | [cs.bham.ac.uk/~ibs/imzMLConverter](http://www.cs.bham.ac.uk/~ibs/imzMLConverter/) |
| jimzMLConverter 2.1.0 (CLI) | [github.com/AlanRace/imzMLConverter](https://github.com/AlanRace/imzMLConverter) |
| pyimzML | [github.com/alexandrovteam/pyimzML](https://github.com/alexandrovteam/pyimzML) |
| pyMS | [github.com/alexandrovteam/pyMS](https://github.com/alexandrovteam/pyMS) |
| imzML format overview | [maldi-msi.org](http://www.maldi-msi.org/) |