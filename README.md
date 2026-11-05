# RiverGuard — River Pollution Impact Simulator

A mini-project for an Environmental Impact Assessment course (Unit 3: Water; setting the baseline, and predicting and assessing impacts on surface water). It simulates how industrial wastewater affects downstream river concentration, and how treatment reduces that impact.

This is an educational screening model for a generic conservative pollutant. It is not a water quality certification tool, and all values are illustrative rather than measured river data.

## Run it

Double-click `index.html`, or open it from a terminal:

```bash
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

There is nothing to install or build. An internet connection loads Chart.js and the web fonts from their CDNs. Offline, the simulator still works, using system fonts and showing the comparison table in place of the bar chart.

## The model

```text
C_effluent   = C_raw × (1 − treatment_efficiency / 100)
C_downstream = (Q_river × C_upstream + Q_waste × C_effluent) / (Q_river + Q_waste)
```

The model assumes steady flow, complete mixing and no pollutant decay.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and the illustrated river scene |
| `styles.css` | Visual design and responsive layout |
| `script.js` | Calculations, scene drawing, chart and summary text |
