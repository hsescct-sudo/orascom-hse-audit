// Company projects (from the Corporate HSE audit schedule) and the sample data
// used in demo mode. Sample data is marked sample:true so it can be cleared.
import { MODULES, ROOT_CAUSES, allItems } from "./templates.js";
import { isoOf } from "./ui.js";

export const PROJECTS = [
  ["Al Alamain Historical (Old) City", "Al Alamain", "Egypt"],
  ["Latin Quarter (code 468) - Alamein", "Al Alamain", "Egypt"],
  ["Marina Towers Alamein", "Al Alamain", "Egypt"],
  ["NUCA Towers - El Alamein", "Al Alamain", "Egypt"],
  ["Treated Water Storage Tanks - New Alamein (267)", "Al Alamain", "Egypt"],
  ["HSR Green Line P3 MEP #561 - ElHammam Station", "Al Alamain", "Egypt"],
  ["HSR Green Line P3 MEP #561 - Alamein Station", "Al Alamain", "Egypt"],
  ["Al Alamain Camp", "Al Alamain", "Egypt"],
  ["Al Alamain Equipment Workshop", "Al Alamain", "Egypt"],
  ["500 KV HVDC Saudi Egypt Interconnection (Badr)", "Cairo", "Egypt"],
  ["Cairo Beni Suef Signals", "Cairo", "Egypt"],
  ["LRT 10th of Ramadan", "Cairo", "Egypt"],
  ["Metro Line 4 Phase 1 CP411", "Cairo", "Egypt"],
  ["Metro Line 4 Phase 1 CP411 JV OC-Colas Power Supply", "Cairo", "Egypt"],
  ["Metro Line 4 Phase 1 CP411 JV OC-Colas Rail", "Cairo", "Egypt"],
  ["Rehabilitation Cairo Metro Line 1 JV CR OC", "Cairo", "Egypt"],
  ["HSR Green Line P3 MEP #561 - Ahmed Omar Hashim Station", "Cairo", "Egypt"],
  ["HSR Green Line P3 MEP #561 - October Gardens Station", "Cairo", "Egypt"],
  ["HSR Green Line P3 MEP #561 - Sphinx Station", "Cairo", "Egypt"],
  ["Al Azizia Warehouse - Giza District", "Cairo", "Egypt"],
  ["Al Haram Complex Warehouse (Abu Rawash)", "Cairo", "Egypt"],
  ["Centralized Rebar Workshop", "Cairo", "Egypt"],
  ["Formwork Warehouse and Workshop", "Cairo", "Egypt"],
  ["Magdy Yacoub Global Heart Center", "Cairo", "Egypt"],
  ["HSR Green Line P3 MEP #561 - El Sokhna Station", "El Sokhna", "Egypt"],
  ["Alexandria Regional Metro Ph1 Abu Qir-Misr OC-Colas JV", "Alexandria", "Egypt"],
  ["HSR Green Line P3 MEP #561 - Borg El Arab Station", "Alexandria", "Egypt"],
  ["Annex Building Saint Mark Coptic Orthodox Cathedral", "New Capital", "Egypt"],
  ["Central Bank - New Capital", "New Capital", "Egypt"],
  ["Housing & Development Bank (HDB)", "New Capital", "Egypt"],
  ["Mansoura Projects", "New Capital", "Egypt"],
  ["Plasma Fractionation", "New Capital", "Egypt"],
  ["Civil Construction Yard and Infra Works SCCT2 Expansion", "Port Said", "Egypt"],
  ["Egyptian Railway Signaling Modernization (Nagaa Hamady - Luxor)", "Luxor", "Egypt"],
  ["ANNA", "Aswan", "Egypt"],
  ["Wave - C1", "Abu Dhabi", "UAE"],
  ["Wave - C2", "Abu Dhabi", "UAE"],
  ["Abu Dhabi Main Equipment Workshop & Warehouse", "Abu Dhabi", "UAE"],
  ["Al Hamriyah IWP 90 MIGD - Sharjah", "Sharjah", "UAE"],
  ["Amiral Project", "Jubail", "KSA"],
  ["JV Hajar 2 Expansion Power Plant", "Eastern Province", "KSA"],
];

// Projects with heavy lifting get a lifting assessment in the sample plan
const LIFTING_PROJECTS = [3, 4, 5, 10, 13, 14, 15, 16, 26, 28, 29, 30, 33, 34, 36, 37, 39, 40, 41];

const CC = { Egypt: "EG", UAE: "AE", KSA: "SA" };
export function projectDocs(now) {
  const n = { EG: 0, AE: 0, SA: 0 };
  return PROJECTS.map(([name, city, country], i) => {
    const cc = CC[country]; n[cc]++;
    return { id: "prj-" + String(i + 1).padStart(3, "0"), kind: "project", name, city, country, code: `${cc}-${String(n[cc]).padStart(2, "0")}`, bu: "", director: "", manager: "", active: true, created_at: now, updated_at: now };
  });
}

export function memberDocs(now) {
  const out = [{ id: "mem-admin", kind: "member", name: "Corporate HSE", email: "", position: "Corporate HSE Manager", role: "admin", active: true, created_at: now, updated_at: now }];
  for (let i = 1; i <= 9; i++) out.push({ id: "mem-a" + String(i).padStart(2, "0"), kind: "member", name: "Auditor " + String(i).padStart(2, "0"), email: "", position: "Corporate HSE Auditor", role: "auditor", active: true, created_at: now, updated_at: now });
  return out;
}

// ---- sample data ----
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const LOCATIONS = ["Main building, level 3", "Tower crane area", "Batching plant", "Rebar yard", "Site workshop", "Station box, east side", "Excavation zone B", "Labor camp", "Material store", "Scaffold, north facade", "Substation area", "Access road"];
const NCR_TEXT = {
  "Work at height, Fall protection": ["Workers on the slab edge without edge protection.", "Harness not anchored while working at 4 m.", "Missing handrails on the scaffold working platform."],
  "Scaffoldings": ["Scaffold tag missing at the access point.", "Scaffold base plates on loose soil, no sole boards.", "Green tag expired on the north facade scaffold."],
  "Electricity": ["Damaged cable on the ground in the walkway.", "Distribution board without cover and no ELCB test record.", "Extension lead without earth connection."],
  "Housekeeping": ["Debris and nails on the access path.", "Blocked emergency exit with stored formwork.", "Poor housekeeping around the rebar cutting area."],
  "Permit to Work (PTW)": ["Hot work done without a valid permit.", "Permit not displayed at the work location.", "Confined space entry permit not signed by the area supervisor."],
  "Lifting, Rigging & Slinging": ["Damaged sling still in use, no color code.", "No banksman during the crane lift.", "Lifting plan not available for a 12 t lift."],
  "Excavation / Collapse": ["Excavation deeper than 1.5 m without shoring.", "Spoil heap at the edge of the excavation.", "No barricade around the open trench."],
  "P.P.E": ["Workers without safety glasses at the grinding area.", "Damaged safety shoes in use.", "No hearing protection near the compressor."],
  "Firefighting System": ["Fire extinguisher inspection overdue.", "Fire point blocked by materials.", "No fire watch during welding."],
  "Openings and manholes": ["Floor opening covered with loose plywood, no marking.", "Manhole left open without barricade."],
  "Welding & Cutting / Hot Work": ["Gas cylinders stored without chain.", "Flashback arrestor missing on the cutting set."],
  "Traffic Management": ["No segregation between pedestrians and vehicles.", "Reversing truck without banksman."],
  "Training & VOCs program": ["Operator VOC expired.", "No induction record for new subcontractor workers."],
  "Control of Subcontractors": ["Subcontractor HSE plan not approved.", "Subcontractor supervisor not present at the work front."],
  "Waste Management": ["Mixed waste in the hazardous waste area.", "No waste segregation bins on site."],
  "Welfare Facilities / Mobilization": ["Not enough drinking water points.", "Toilets not cleaned regularly."],
};
const LIFT_TEXT = {
  "Calibration Certificate": ["Third party certificate expired for the mobile crane.", "Load cell calibration certificate not available."],
  "Lifting Plan": ["No lifting plan for a 14 t precast lift.", "Lifting plan not signed by the lifting engineer."],
  "Slinging and Rigging": ["Shackle without WLL marking.", "Damaged web sling in the rigging loft."],
  "Equipment Daily Inspection": ["Daily checklist not filled for the forklift.", "Tower crane daily check missing for 3 days."],
  "Color Code System": ["Color code not refreshed for this quarter.", "Accessories without color code in use."],
  "Anti Collision System": ["Anti-collision system disabled on tower crane TC-2."],
  "Barricades": ["Lifting zone not barricaded.", "No exclusion zone under the suspended load."],
  "Training & VOCs program": ["Rigger VOC expired.", "Signal man not certified."],
};
const GOOD = [["Housekeeping", "Clean and well marked walkways across the site."], ["HSE Signage", "Clear bilingual signs at all work fronts."], ["Edge Protection", "Full edge protection on all slab edges."], ["Scaffolding", "Scaffold tagging system fully applied."], ["Training Center / Training", "Daily toolbox talks recorded with attendance."], ["Welfare Facilities", "Shaded rest areas with cold water."], ["Lifting", "Lifting plans prepared and reviewed for every critical lift."], ["Color Code", "Quarterly color code applied to all tools and accessories."], ["Medical Facilities", "Well equipped clinic with a full-time nurse."], ["Waste Management", "Waste segregation with labeled skips."]];
const COMMENTS = ["Site team cooperative.", "Good attendance from site management.", "HSE team needs more supervisors at night shift."];

export function sampleData(now, today = isoOf(new Date())) {
  const R = rng(20261118);
  const pick = a => a[Math.floor(R() * a.length)];
  const projects = projectDocs(now);
  const members = memberDocs(now);
  const auditors = members.filter(m => m.role === "auditor");
  const year = +today.slice(0, 4);
  const docs = [], plan = [];
  const quality = projects.map(() => 0.62 + R() * 0.36); // how good each site is
  const mkId = (p) => p + "-" + Math.floor(R() * 1e9).toString(36) + Math.floor(R() * 1e6).toString(36);
  // Plan: full audit twice a year per project, lifting once for heavy-lifting projects
  projects.forEach((p, i) => {
    const m1 = 1 + (i % 6), m2 = m1 + 6;
    const lead = auditors[i % auditors.length];
    for (const m of [m1, m2]) plan.push({ id: mkId("pln"), kind: "plan", module: "full", year, month: m, project_id: p.id, lead_id: lead.id, team_ids: [auditors[(i + 3) % auditors.length].id], created_at: now, updated_at: now, sample: true });
    if (LIFTING_PROJECTS.includes(i + 1)) plan.push({ id: mkId("pln"), kind: "plan", module: "lifting", year, month: 1 + ((i * 5) % 11), project_id: p.id, lead_id: auditors[(i + 5) % auditors.length].id, team_ids: [], created_at: now, updated_at: now, sample: true });
  });
  const curMonth = +today.slice(5, 7), curDay = +today.slice(8, 10);
  const counters = {};
  const sorted = plan.slice().sort((a, b) => a.month - b.month);
  const lastOpen = {}; // `${module}|${project}` -> open NCR docs from the last audit
  for (const pl of sorted) {
    const due = pl.month < curMonth || (pl.month === curMonth && curDay > 20);
    const skip = R() < 0.08; // a few plan items are overdue
    if (!due || skip) continue;
    const def = MODULES[pl.module];
    const pIdx = projects.findIndex(p => p.id === pl.project_id);
    const proj = projects[pIdx];
    const key = pl.module + "|" + proj.id;
    counters[key] = (counters[key] || 0) + 1;
    const day = 3 + Math.floor(R() * 22);
    const date = `${year}-${String(pl.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (date > today) continue;
    const q = Math.min(0.98, quality[pIdx] + (counters[key] > 1 ? 0.04 : 0));
    const ratings = {};
    for (const it of allItems(def)) {
      if (R() < 0.07 && !it.critical) { ratings[it.id] = "na"; continue; }
      let v = Math.round((q + (R() - 0.5) * 0.3) * 100);
      if (it.critical && R() < 0.25) v -= 15;
      ratings[it.id] = Math.max(20, Math.min(100, v));
    }
    const lead = members.find(m => m.id === pl.lead_id);
    const team = pl.team_ids.map(id => members.find(m => m.id === id)).filter(Boolean);
    const ref = `${def.prefix}-${proj.code}-${String(counters[key]).padStart(2, "0")}`;
    const audit = {
      id: mkId("aud"), kind: "audit", module: pl.module, project_id: proj.id, plan_id: pl.id, ref, number: counters[key], date,
      status: "approved", lead_id: lead.id,
      auditors: [lead, ...team].map(m => ({ name: m.name, position: m.position })),
      attendees: [{ name: "Project Manager", position: "Project Manager" }, { name: "Site HSE Manager", position: "HSE Manager" }, { name: "Construction Manager", position: "Construction Manager" }],
      manpower: 150 + Math.floor(R() * 1400), completion: 10 + Math.floor(R() * 85),
      opening: "Audit scope and plan explained to the project team.", siteTour: "Site tour covered the main work fronts with the site HSE manager.",
      closeMeeting: pick(COMMENTS) + " Findings discussed and deadlines agreed.", summary: pl.module === "lifting" ? "Lifting operations reviewed with the lifting engineer and the rigging supervisor." : "",
      ratings, notes: {}, photos: [],
      equipment: pl.module === "lifting" ? def.equipment.map(e => ({ ...e, count: Math.floor(R() * 6) })) : [],
      created_at: date + "T08:00:00.000Z", updated_at: date + "T15:00:00.000Z", submitted_at: date + "T14:00:00.000Z", approved_at: date + "T16:00:00.000Z",
      sample: true,
    };
    pl.audit_id = audit.id;
    docs.push(audit);
    // carried-over NCRs from the last audit: still open -> repeated
    const carried = lastOpen[key] || [];
    let seq = 0;
    audit.carry = carried.map(n => {
      const stillOpen = R() < 0.45;
      if (!stillOpen) { n.status = "Closed"; n.ca_date = date; n.ca_text = n.ca_text || "Corrected on site and verified."; n.followup_name = lead.name; n.followup_position = lead.position; n.followup_date = date; }
      return { ncr_id: n.id, result: stillOpen ? "open" : "closed" };
    });
    const newOpen = [];
    for (const c of audit.carry.filter(c => c.result === "open")) {
      const old = carried.find(n => n.id === c.ncr_id); seq++;
      const n = { ...old, id: mkId("ncr"), audit_id: audit.id, ref: `${ref}-${String(seq).padStart(2, "0")}`, seq, date, repeated: true, repeat_of: old.id, status: "Open", ca_text: "", ca_date: "", followup_name: "", followup_position: "", followup_date: "", due_date: addDaysISO(date, 7), created_at: audit.created_at, updated_at: audit.updated_at };
      old.status = "Carried"; old.carried_to = n.id;
      docs.push(n); newOpen.push(n);
    }
    const nNew = 2 + Math.floor(R() * (pl.module === "lifting" ? 4 : 8) * (1.2 - q));
    const textMap = pl.module === "lifting" ? LIFT_TEXT : NCR_TEXT;
    const classes = Object.keys(textMap);
    for (let k = 0; k < nNew; k++) {
      const cls = pick(classes); seq++;
      const sev = R() < 0.07 ? "Serious" : R() < 0.38 ? "Major" : "Minor";
      const due = addDaysISO(date, sev === "Serious" ? 1 : sev === "Major" ? 7 : 14);
      const age = (Date.parse(today) - Date.parse(date)) / 86400000;
      const closed = R() < Math.min(0.92, age / 70);
      const caDate = closed ? addDaysISO(date, 1 + Math.floor(R() * (sev === "Minor" ? 25 : 12))) : "";
      const n = {
        id: mkId("ncr"), kind: "ncr", module: pl.module, audit_id: audit.id, project_id: proj.id, ref: `${ref}-${String(seq).padStart(2, "0")}`, seq, date,
        severity: sev, repeated: false, classification: cls, item_id: "", clause: def.ncrClause,
        description: pick(textMap[cls]), location: pick(LOCATIONS), root_causes: [pick(ROOT_CAUSES)], other_cause: "",
        action_required: "Correct the condition, find the root cause and stop it happening again. Send evidence photos.",
        photos: [], responsible_name: "Site HSE Manager", responsible_position: "HSE Manager", due_date: due,
        status: closed ? "Closed" : "Open", ca_text: closed ? "Corrected on site and verified." : "", ca_date: caDate,
        followup_name: closed ? lead.name : "", followup_position: closed ? lead.position : "", followup_date: closed ? caDate : "", comments: "",
        created_at: audit.created_at, updated_at: audit.updated_at, sample: true,
      };
      docs.push(n); if (!closed) newOpen.push(n);
    }
    lastOpen[key] = newOpen;
    const ng = 1 + Math.floor(R() * 3);
    for (let k = 0; k < ng; k++) {
      const [cls, ex] = pick(GOOD);
      docs.push({ id: mkId("gp"), kind: "good", module: pl.module, audit_id: audit.id, project_id: proj.id, date, subject: ex.split(" ").slice(0, 4).join(" "), classification: cls, example: ex, photos: [], created_at: audit.created_at, updated_at: audit.updated_at, sample: true });
    }
  }
  return [...projects, ...members, ...plan, ...docs];
}

function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); }
