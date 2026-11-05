/* RiverGuard: river pollution impact simulator
 *
 * Educational screening model for a generic conservative pollutant.
 * Assumes steady flow, complete mixing and no pollutant decay.
 * All input values are illustrative, not measured river data.
 *
 * How the file is organised:
 *   1. Settings and scenarios
 *   2. The model (pure calculations)
 *   3. Impact bands (illustrative only)
 *   4. River scene
 *   5. Chart
 *   6. Text and number updates
 *   7. User input and start-up
 */

/* ------------------------------------------------------------------ */
/* 1. Settings and scenarios                                           */
/* ------------------------------------------------------------------ */

// Illustrative scenario values. Each one sets all inputs, including the baseline.
const PRESETS = {
  low:      { riverFlow: 50, wasteFlow: 0.5, rawConc: 100, efficiency: 85, baseline: 5 },
  moderate: { riverFlow: 25, wasteFlow: 2,   rawConc: 300, efficiency: 80, baseline: 5 },
  high:     { riverFlow: 10, wasteFlow: 4,   rawConc: 800, efficiency: 60, baseline: 5 }
};

const DEFAULTS = PRESETS.moderate;
const DEFAULT_VIEW = "treated";

// Current simulation inputs, plus which case the scene is showing
let inputs = { ...DEFAULTS };
let sceneView = DEFAULT_VIEW;

const SLIDER_UNITS = { riverFlow: "m³/s", wasteFlow: "m³/s", rawConc: "mg/L", efficiency: "%" };
const SLIDER_IDS = Object.keys(SLIDER_UNITS);

const byId = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* 2. The model                                                        */
/* ------------------------------------------------------------------ */

// C_effluent = C_raw * (1 - treatment_efficiency / 100)
function effluentConcentration(rawConc, efficiency) {
  return rawConc * (1 - efficiency / 100);
}

// C_downstream = (Q_river * C_upstream + Q_waste * C_effluent) / (Q_river + Q_waste)
function downstreamConcentration(riverFlow, baseline, wasteFlow, effluent) {
  return (riverFlow * baseline + wasteFlow * effluent) / (riverFlow + wasteFlow);
}

// Runs the mass balance for both cases: untreated (raw wastewater) and treated
function calculate({ riverFlow, wasteFlow, rawConc, efficiency, baseline }) {
  const effluent = effluentConcentration(rawConc, efficiency);
  const untreated = downstreamConcentration(riverFlow, baseline, wasteFlow, rawConc);
  const treated = downstreamConcentration(riverFlow, baseline, wasteFlow, effluent);
  return {
    effluent,
    untreated,
    treated,
    reduction: untreated - treated,
    reductionPct: untreated > 0 ? ((untreated - treated) / untreated) * 100 : 0
  };
}

// Treatment efficiency needed to bring the downstream value down to a target,
// found by rearranging the mass balance. Result is clamped to 0-100%.
function efficiencyForTarget(target, { riverFlow, wasteFlow, rawConc, baseline }) {
  const allowedEffluent = (target * (riverFlow + wasteFlow) - riverFlow * baseline) / wasteFlow;
  return Math.min(100, Math.max(0, (1 - allowedEffluent / rawConc) * 100));
}

/* ------------------------------------------------------------------ */
/* 3. Impact bands                                                     */
/* ------------------------------------------------------------------ */

// ILLUSTRATIVE teaching bands, based on the ratio of downstream to baseline.
// They are not regulatory standards and say nothing about legal compliance.
const BANDS = [
  { key: "below",      label: "Below baseline",  shape: "▼", test: (r) => r < 0.995, range: "under 1×" },
  { key: "near",       label: "Near baseline",   shape: "●", test: (r) => r <= 1.1,  range: "up to 1.1×" },
  { key: "noticeable", label: "Noticeable rise", shape: "◆", test: (r) => r <= 2,    range: "up to 2×" },
  { key: "large",      label: "Large rise",      shape: "▲", test: (r) => r <= 5,    range: "up to 5×" },
  { key: "severe",     label: "Severe rise",     shape: "■", test: () => true,       range: "over 5×" }
];
const ILLUSTRATIVE_TARGET_RATIO = 2; // Upper edge of the "noticeable" band

const bandFor = (concentration, baseline) => BANDS.find((b) => b.test(concentration / baseline));

function setBandChip(el, band) {
  el.className = `band band-${band.key}`;
  el.dataset.shape = band.shape;
  el.textContent = band.label;
}

/* ------------------------------------------------------------------ */
/* 4. River scene                                                      */
/* ------------------------------------------------------------------ */

const OUTFALL_X = 470;
const SCENE_LEFT = -10;
const SCENE_RIGHT = 1210;
const STEP_X = 10;
const FLOW_LINES_START = 100; // Keeps the moving lines clear of the "Flow" label

// River centreline: a gentle meander
const riverCentre = (x) => 300 + 12 * Math.sin(x / 170) + 5 * Math.sin(x / 70);

// River half-width grows with flow (purely visual)
const riverHalfWidth = (riverFlow) => 28 + 34 * Math.sqrt(riverFlow / 100);

// Pollution strength for drawing: 0 at baseline, 1 at 60 times baseline, on a log scale
function plumeStrength(concentration, baseline) {
  if (concentration <= baseline) return 0;
  return Math.min(1, Math.log(concentration / baseline) / Math.log(60));
}

// Plume colour ramp, from pale olive through ochre to dark brown
const PLUME_RAMP = [[169, 185, 110], [181, 138, 51], [107, 68, 35]];

function plumeColour(strength) {
  const position = strength * (PLUME_RAMP.length - 1);
  const low = Math.min(Math.floor(position), PLUME_RAMP.length - 2);
  const mix = position - low;
  const channels = PLUME_RAMP[low].map((c, i) => Math.round(c + (PLUME_RAMP[low + 1][i] - c) * mix));
  return `rgb(${channels.join(",")})`;
}

const CLEAN_WATER = "#8CC7D9";
const waterColour = (strength) => (strength > 0 ? plumeColour(strength) : CLEAN_WATER);

// More strength means a more opaque plume
const plumeOpacity = (strength) => (strength > 0 ? 0.08 + 0.82 * Math.pow(strength, 0.6) : 0);

// Builds a closed shape from a top edge and a bottom edge, left to right
function closedPath(xStart, xEnd, topEdge, bottomEdge) {
  const top = [];
  const bottom = [];
  for (let x = xStart; x <= xEnd; x += STEP_X) {
    top.push(`${x} ${topEdge(x).toFixed(1)}`);
    bottom.unshift(`${x} ${bottomEdge(x).toFixed(1)}`);
  }
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

const FLOW_LINES = [
  { lane: -0.68, dash: "46 130", width: 2 },
  { lane: -0.34, dash: "28 170", width: 1.6 },
  { lane: 0.02,  dash: "60 150", width: 2.2 },
  { lane: 0.38,  dash: "34 120", width: 1.6 },
  { lane: 0.7,   dash: "50 180", width: 2 }
];

// Create the flow-line paths once; their shape is updated when the river width changes
const flowLineEls = FLOW_LINES.map((line) => {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke-dasharray", line.dash);
  path.setAttribute("stroke-width", line.width);
  path.setAttribute("stroke-opacity", "0.42");
  byId("flowLines").appendChild(path);
  return path;
});

function drawRiver(halfWidth) {
  const shape = closedPath(SCENE_LEFT, SCENE_RIGHT,
    (x) => riverCentre(x) - halfWidth,
    (x) => riverCentre(x) + halfWidth);
  byId("river").setAttribute("d", shape);
  byId("riverBank").setAttribute("d", shape);
  byId("riverClipPath").setAttribute("d", shape);

  flowLineEls.forEach((el, i) => {
    let d = "";
    for (let x = FLOW_LINES_START; x <= SCENE_RIGHT; x += STEP_X * 2) {
      const y = riverCentre(x) + FLOW_LINES[i].lane * halfWidth;
      d += `${d ? "L" : "M"}${x} ${y.toFixed(1)}`;
    }
    el.setAttribute("d", d);
  });
}

// The plume starts at the near bank and spreads across the river. A wider river
// takes longer to fill. This is drawn for illustration and is not calculated physics.
function drawPlume(halfWidth, riverFlow, wasteFlow) {
  const spreadLength = 400 + 3 * riverFlow;
  const startWidth = 4 + wasteFlow * 1.6;
  const riverWidth = halfWidth * 2;

  const plumeTop = (x) => riverCentre(x) - halfWidth - 4;
  const plumeBottom = (x) => {
    const spread = Math.min(1, Math.pow(Math.max(0, x - OUTFALL_X) / spreadLength, 0.6));
    return riverCentre(x) - halfWidth + Math.max(startWidth, spread * (riverWidth + 8));
  };
  byId("plume").setAttribute("d", closedPath(OUTFALL_X - 6, SCENE_RIGHT + 30, plumeTop, plumeBottom));
}

function updateScene(results) {
  const { riverFlow, wasteFlow, efficiency, baseline, rawConc } = inputs;
  const isTreated = sceneView === "treated";
  const halfWidth = riverHalfWidth(riverFlow);

  // The scene shows whichever case is selected with the toggle
  const dischargeConc = isTreated ? results.effluent : rawConc;
  const mixedConc = isTreated ? results.treated : results.untreated;
  const nearStrength = plumeStrength(dischargeConc, baseline);
  const farStrength = plumeStrength(mixedConc, baseline);

  drawRiver(halfWidth);
  drawPlume(halfWidth, riverFlow, wasteFlow);

  // Near the outfall the plume looks like the discharge; far away it looks like the mixed result
  const nearStop = byId("plumeStopNear").style;
  const farStop = byId("plumeStopFar").style;
  nearStop.stopColor = waterColour(nearStrength);
  nearStop.stopOpacity = nearStrength > 0 ? Math.max(plumeOpacity(nearStrength), plumeOpacity(farStrength)) : 0.35;
  farStop.stopColor = waterColour(farStrength);
  farStop.stopOpacity = plumeOpacity(farStrength);

  // Wastewater falling from the pipe
  const discharge = byId("discharge");
  discharge.setAttribute("y2", (riverCentre(OUTFALL_X) - halfWidth + 3).toFixed(1));
  discharge.setAttribute("stroke-width", (3 + wasteFlow * 0.9).toFixed(1));
  discharge.setAttribute("stroke-dasharray", "9 4");
  discharge.style.stroke = waterColour(nearStrength);

  // Treatment tanks
  byId("tanks").classList.toggle("is-bypassed", !isTreated);
  byId("tankWaterA").style.fill = waterColour(plumeStrength(rawConc, baseline));
  byId("tankWaterB").style.fill = waterColour(plumeStrength(results.effluent, baseline));
  byId("tankLabel").textContent = isTreated ? `Treatment: ${efficiency}%` : "Treatment bypassed";

  // Callout pins sit on the water, near the bottom of the river
  [["pinUp", "pinUpDot", 170], ["pinDown", "pinDownDot", 1050]].forEach(([pinId, dotId, x]) => {
    const y = (riverCentre(x) + halfWidth * 0.55).toFixed(1);
    byId(pinId).setAttribute("y1", y);
    byId(dotId).setAttribute("cy", y);
  });

  byId("flowArrow").setAttribute("y", (riverCentre(26) + 5).toFixed(1));
  byId("sceneUp").textContent = `${formatConc(baseline)} mg/L`;
  byId("sceneDownLabel").textContent = isTreated ? "Downstream, treated (mixed)" : "Downstream, untreated (mixed)";
  byId("sceneDown").textContent = `${formatConc(mixedConc)} mg/L`;
}

// Moves the flow lines. Speed follows river flow, and only for visual effect.
let dashOffset = 0;
let dischargeOffset = 0;
let lastFrameTime = null;

function animateWater(time) {
  if (lastFrameTime !== null) {
    const seconds = Math.min((time - lastFrameTime) / 1000, 0.1);
    dashOffset -= (35 + inputs.riverFlow * 1.8) * seconds;
    dischargeOffset -= 60 * seconds;
    flowLineEls.forEach((el, i) => el.setAttribute("stroke-dashoffset", (dashOffset * (0.85 + i * 0.07)).toFixed(1)));
    byId("discharge").setAttribute("stroke-dashoffset", dischargeOffset.toFixed(1));
  }
  lastFrameTime = time;
  requestAnimationFrame(animateWater);
}

/* ------------------------------------------------------------------ */
/* 5. Chart                                                            */
/* ------------------------------------------------------------------ */

let chart = null;

// Chart.js plugin: writes each value above its bar
const barValueLabels = {
  id: "barValueLabels",
  afterDatasetsDraw(c) {
    const { ctx } = c;
    ctx.save();
    ctx.font = '600 13px "IBM Plex Mono", ui-monospace, Menlo, monospace';
    ctx.fillStyle = "#10303F";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    c.getDatasetMeta(0).data.forEach((bar, i) => {
      ctx.fillText(formatConc(c.data.datasets[0].data[i]), bar.x, bar.y - 5);
    });
    ctx.restore();
  }
};

function createChart() {
  if (!window.Chart) {
    byId("chartFallback").hidden = false;
    byId("concChart").hidden = true;
    return;
  }

  Chart.defaults.font.family = '"IBM Plex Sans", -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  Chart.defaults.color = "#41606E";

  chart = new Chart(byId("concChart"), {
    type: "bar",
    data: {
      labels: ["Upstream", ["Downstream,", "untreated"], ["Downstream,", "treated"]],
      datasets: [{
        label: "Concentration",
        data: [0, 0, 0],
        backgroundColor: ["#2B7CB5", "#B5702A", "#12907F"],
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: "bottom",
        maxBarThickness: 24,
        minBarLength: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion ? false : { duration: 280 },
      layout: { padding: { top: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: "#0B3B4E",
          callbacks: {
            title: (items) => [].concat(items[0].label).join(" "),
            label: (item) => `${formatConc(item.raw)} mg/L (${formatRatio(item.raw / inputs.baseline)} baseline)`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: "#C3D4DB" },
          ticks: { font: { size: 12.5 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: "#E8EFF2" },
          border: { display: false },
          ticks: { maxTicksLimit: 6, font: { size: 12 } },
          title: { display: true, text: "Concentration (mg/L)", font: { size: 12 } }
        }
      }
    },
    plugins: [barValueLabels]
  });
}

function updateChart(results) {
  if (!chart) return;
  const values = [inputs.baseline, results.untreated, results.treated];
  chart.data.datasets[0].data = values;
  chart.options.scales.y.suggestedMax = Math.max(...values) * 1.14; // Leaves room for the labels
  chart.update();
}

/* ------------------------------------------------------------------ */
/* 6. Text and number updates                                          */
/* ------------------------------------------------------------------ */

const formatConc = (value) => (value >= 100 ? value.toFixed(1) : value.toFixed(2));
const formatRatio = (ratio) => `${ratio.toFixed(ratio >= 100 ? 0 : ratio >= 10 ? 1 : 2)}×`;

function updateControls() {
  SLIDER_IDS.forEach((id) => {
    const slider = byId(id);
    slider.value = inputs[id];
    const fill = ((inputs[id] - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty("--fill", `${fill}%`);
    byId(`${id}Out`).textContent = `${inputs[id]} ${SLIDER_UNITS[id]}`;
  });

  // Don't overwrite the baseline box while someone is typing in it
  const baselineBox = byId("baseline");
  if (document.activeElement !== baselineBox) baselineBox.value = inputs.baseline;

  // Highlight the scenario only if the inputs still match it exactly
  let activeName = "Custom settings";
  document.querySelectorAll(".preset").forEach((button) => {
    const preset = PRESETS[button.dataset.preset];
    const matches = Object.keys(preset).every((key) => preset[key] === inputs[key]);
    button.setAttribute("aria-pressed", matches);
    if (matches) activeName = "Illustrative values";
  });
  byId("scenarioState").textContent = activeName;

  document.querySelectorAll(".segmented button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.view === sceneView);
  });
}

function updateReadouts(results) {
  const { baseline } = inputs;
  byId("roUp").textContent = formatConc(baseline);
  byId("roUntreated").textContent = formatConc(results.untreated);
  byId("roTreated").textContent = formatConc(results.treated);
  byId("roReduction").textContent = results.reductionPct.toFixed(1);
  byId("roReductionSub").textContent = `${formatConc(results.reduction)} mg/L lower than untreated`;
  setBandChip(byId("roUntreatedBand"), bandFor(results.untreated, baseline));
  setBandChip(byId("roTreatedBand"), bandFor(results.treated, baseline));

  byId("tUp").textContent = formatConc(baseline);
  byId("tUntreated").textContent = formatConc(results.untreated);
  byId("tTreated").textContent = formatConc(results.treated);
  byId("tUntreatedX").textContent = formatRatio(results.untreated / baseline).replace("×", "");
  byId("tTreatedX").textContent = formatRatio(results.treated / baseline).replace("×", "");
}

// Picks the headline for the summary. Order matters: special cases come first.
function chooseVerdict(results) {
  const { rawConc, efficiency, baseline } = inputs;
  const treatedBand = bandFor(results.treated, baseline).key;
  const untreatedBand = bandFor(results.untreated, baseline).key;

  if (rawConc <= baseline) return "This wastewater is no more polluted than the river";
  if (efficiency === 0) return "No treatment is applied, so the full load reaches the river";
  if (results.reduction / (results.untreated - baseline) < 0.25) return "Treatment this weak makes only a small difference";
  if (untreatedBand === "near") return "The discharge has little effect here, even before treatment";
  if (treatedBand === "below") return "Treated effluent is cleaner than the river itself";
  if (treatedBand === "near") return "Treatment brings the river close to its baseline";
  if (treatedBand === "noticeable") return "Treatment clearly helps, but a noticeable rise remains";
  return "Treatment helps, but the river stays far above its baseline";
}

function updateSummary(results) {
  const { riverFlow, wasteFlow, rawConc, efficiency, baseline } = inputs;
  const { effluent, untreated, treated, reduction, reductionPct } = results;

  byId("verdict").textContent = chooseVerdict(results);

  byId("helps").textContent = efficiency === 0
    ? "Does treatment improve conditions? Not at 0% efficiency: both results are the same."
    : `Does treatment improve conditions? Yes: the downstream concentration is ${reductionPct.toFixed(1)}% lower.`;

  const paragraphs = [];

  if (rawConc <= baseline) {
    paragraphs.push(`Raw wastewater at <strong>${rawConc} mg/L</strong> is at or below the ${formatConc(baseline)} mg/L baseline, so in this model it dilutes the river rather than adding to its concentration. Real wastewater could still carry other pollutants that this single-pollutant model does not track.`);
  } else {
    paragraphs.push(`<strong>Without treatment</strong>, the discharge raises the river from ${formatConc(baseline)} to <strong>${formatConc(untreated)} mg/L</strong>, or ${formatRatio(untreated / baseline)} the baseline.`);
  }

  if (efficiency > 0) {
    paragraphs.push(`<strong>With ${efficiency}% treatment</strong>, effluent drops from ${rawConc} to ${formatConc(effluent)} mg/L. The downstream result is <strong>${formatConc(treated)} mg/L</strong>, an improvement of ${formatConc(reduction)} mg/L.`);
  }

  if (treated < baseline * 0.995 && rawConc > baseline) {
    paragraphs.push(`The result falls below baseline because the effluent (${formatConc(effluent)} mg/L) is cleaner than the river. The model reflects dilution only, and this does not mean the discharge benefits the river overall.`);
  }

  paragraphs.push(`<strong>Dilution:</strong> the river carries ${formatRatio(riverFlow / wasteFlow)} the wastewater flow. A lower ratio leaves less capacity to dilute the discharge, which matters most during low-flow periods.`);

  const target = baseline * ILLUSTRATIVE_TARGET_RATIO;
  if (treated > target) {
    const needed = efficiencyForTarget(target, inputs);
    paragraphs.push(`<strong>What would change this?</strong> To reach the illustrative 2× baseline mark at these flows, the model needs about ${Math.ceil(needed)}% treatment efficiency. Greater river flow or less discharge would also help.`);
  }

  byId("summaryBody").innerHTML = paragraphs.map((text) => `<p>${text}</p>`).join("");
}

function updateWorkedCalculation(results) {
  const { riverFlow, wasteFlow, rawConc, efficiency, baseline } = inputs;
  const massBalance = (conc, result) =>
    `C_down = (${riverFlow} × ${baseline} + ${wasteFlow} × ${+conc.toFixed(2)}) / (${riverFlow} + ${wasteFlow}) = <b>${formatConc(result)} mg/L</b>`;

  byId("workUntreatedEff").innerHTML = `C_eff = ${rawConc} × (1 − 0 / 100) = <b>${rawConc} mg/L</b>`;
  byId("workUntreated").innerHTML = massBalance(rawConc, results.untreated);
  byId("workTreatedTitle").textContent = `Treated (η = ${efficiency}%)`;
  byId("workTreatedEff").innerHTML = `C_eff = ${rawConc} × (1 − ${efficiency} / 100) = <b>${formatConc(results.effluent)} mg/L</b>`;
  byId("workTreated").innerHTML = massBalance(results.effluent, results.treated);
}

// Recalculates and redraws everything. Every input change comes through here.
function render() {
  const results = calculate(inputs);
  updateControls();
  updateScene(results);
  updateReadouts(results);
  updateChart(results);
  updateSummary(results);
  updateWorkedCalculation(results);
}

/* ------------------------------------------------------------------ */
/* 7. User input and start-up                                          */
/* ------------------------------------------------------------------ */

SLIDER_IDS.forEach((id) => {
  byId(id).addEventListener("input", (event) => {
    inputs[id] = Number(event.target.value);
    render();
  });
});

const baselineBox = byId("baseline");

// While typing: only use numbers inside the allowed range
baselineBox.addEventListener("input", () => {
  const value = Number(baselineBox.value);
  if (baselineBox.value !== "" && value >= Number(baselineBox.min) && value <= Number(baselineBox.max)) {
    inputs.baseline = value;
    render();
  }
});

// When leaving the box: fix anything left empty or out of range
baselineBox.addEventListener("change", () => {
  const value = Number(baselineBox.value);
  const isUsable = baselineBox.value !== "" && Number.isFinite(value);
  inputs.baseline = isUsable
    ? Math.min(Number(baselineBox.max), Math.max(Number(baselineBox.min), value))
    : DEFAULTS.baseline;
  baselineBox.value = inputs.baseline;
  render();
});

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => {
    inputs = { ...PRESETS[button.dataset.preset] };
    render();
  });
});

document.querySelectorAll(".segmented button").forEach((button) => {
  button.addEventListener("click", () => {
    sceneView = button.dataset.view;
    render();
  });
});

byId("resetBtn").addEventListener("click", () => {
  inputs = { ...DEFAULTS };
  sceneView = DEFAULT_VIEW;
  baselineBox.value = inputs.baseline;
  render();
});

// Build the bands key once
byId("bandsKey").innerHTML = BANDS.map((band) =>
  `<li><span class="band band-${band.key}" data-shape="${band.shape}">${band.label}, ${band.range}</span></li>`
).join("");

createChart();
render();
if (!reducedMotion) requestAnimationFrame(animateWater);
