// The three audit forms, written as data. Text, weights and lists come from
// F-HSE-078 Rev 06 (OC HSE Audit Report), F-HSE-0175 Rev 02 (Lifting
// Operation Assessment) and F-HSE-0075 (HSE Flash Audit). Obvious typos were
// fixed; nothing else was changed.
// Admins can edit lists and texts from Settings; these are the defaults.

import { FLASH_PARTS } from "./flash.js";

export const ROOT_CAUSES = ["Lack of Training", "Lack of Supervision", "Lack of Resources", "Management", "Other"];
export const SEVERITIES = ["Minor", "Major", "Serious"];

export const GRADES = [
  { min: 85, code: "green", label: "Full compliance", appraisal: "Up to OC Standards", bonus: 15 },
  { min: 75, code: "orange", label: "Relative compliance", appraisal: "Close to OC Standards", bonus: 10 },
  { min: 65, code: "yellow", label: "Low compliance", appraisal: "Needs Improvement", bonus: 5 },
  { min: 0, code: "red", label: "No compliance", appraisal: "Unsatisfactory", bonus: 0 },
];

const GOOD_PRACTICE = ["Access / Walkways", "Assembly Point", "Chemical Precautions", "Clinic", "Color Code", "Confined space", "Edge Protection", "Electrical", "Environment", "Equipment", "Firefighting System", "Housekeeping", "HSE Management System", "HSE Precautions", "HSE Signage", "Inspection", "Lifting", "Lighting System", "Material Storage", "Medical Facilities", "Openings and manholes", "P.P.E", "Scaffolding", "Soil Contamination", "Storage Management", "Traffic Management", "Training Center / Training", "VOC", "Warehouse", "Waste Management", "Welfare Facilities", "Workshop"];

// NCR classification list from F-HSE-0003 Rev 07 (general version)
const NCR_FULL = ["Access Control / Walkways", "Biodiversity Conservation & Sustainable Natural Resource Management", "CCTV system", "Checking", "Chemical Precautions", "Color Code System", "Commissioning", "Compressed gases", "Confined space", "Control of HSE Document", "Control of Subcontractors", "CSR (Community Social Responsibility)", "Cultural Heritage", "Dust & Air Pollution Management", "Dust Control", "Electricity", "Emergency Preparedness & Response", "Energy management", "Environmental", "Environmental aspects / impact and control", "Environmental Awareness Training", "Erosion, Earthworks & Excavation control", "Excavation / Collapse", "Falling Object", "Firefighting System", "Flora & Fauna", "Food Safety and Food Hygiene", "Green spaces", "Grievance Procedure", "Grievance system", "Handling of oils, fuels & greases", "Heavy Equipment", "Housekeeping", "HSE Management System", "HSE Signage", "Implementation & Operation", "Indigenous People", "Inspection and Maintenance", "Interested parties & stakeholders complaints", "Labor rights & welfare facilities", "Ladders", "Lifting, Rigging & Slinging", "Lighting System", "Machines", "Management Support, Staff Commitment", "Manual handling tools", "Medical Facilities & Health", "Noise & Vibration Management", "Openings and manholes", "P.P.E", "Permit to Work (PTW)", "Pest Control", "Planning / Risk assessment", "Power Tools Inspection", "Pressure", "Prevention / Corrective Action", "Protruding rebar / Sharp Edges", "QHSE Policy", "QR Code system", "Safety Committee / OH&S Management System", "Scaffoldings", "Sewage & sanitation", "Soil Contamination", "Storage of Materials", "Surface & groundwater management", "Temperature Management", "Traffic Management", "Training & VOCs program", "Use of cement & Concrete", "Waste Management", "Water Consumption & Supply of Water for Human Use", "Welding & Cutting / Hot Work", "Welfare Facilities / Mobilization", "Work at height, Fall protection", "Workshop"];

// NCR classification list from F-HSE-0003 Rev 07 (lifting version)
const NCR_LIFTING = ["Anti Collision System", "Barricades", "Calibration Certificate", "Color Code System", "Control of HSE Document", "Equipment Daily Inspection", "Falling Object", "Heavy Equipment, Rigging", "Inspection and Maintenance", "Lifting Plan", "QR Code system", "Slinging and Rigging", "Storage of Materials", "Traffic Management", "Training & VOCs program", "Work at height, Fall protection"];

const NCR_DEFAULT_CLAUSE = "ISO 45001 clause 8.1.2";
const NCR_DEFAULT_REQUIREMENT = "The organization shall establish, implement and maintain a process(es) for the elimination of hazards and reduction of OH&S risks.";

const item = (id, title, text, weight, extra = {}) => ({ id, title, text, weight, ...extra });

export const FULL = {
  id: "full",
  short: "HSE Audit",
  name: "OC HSE Audit",
  reportTitle: "OC HSE Audit Report",
  formRef: "F-HSE-078",
  formRev: "06",
  ncrFormRef: "F-HSE-0003",
  ncrFormRev: "07",
  prefix: "HSE",
  scoreLabel: "Audit score",
  what: "HSE audit", startLabel: "Start an HSE audit", peopleLabel: "Auditors", dateLabel: "Audit date",
  scoreStep: "Appraisal", sectionsLabel: "Ratings by element", partTitle: p => `${p.code}: ${p.name}`, itemNo: (it, k) => k,
  parts: [
    {
      id: "p1", code: "Part 1", name: "Site HSE Performance Appraisal", share: 90,
      items: [
        item("p1_01", "Management Support, Staff Commitment", "Site management support for the site HSE team, resources, availability of HSE equipment, training, keen to attend the site walk-through, toolbox talk and monthly safety meeting.", 10),
        item("p1_02", "Housekeeping & Storage of Materials", "Access ways, roads, cleaning equipment, storage of materials, stores load limits, flammable stores, MSDS, handling precautions, labeling system, signs.", 10),
        item("p1_03", "Work at height, Fall protection, Scaffold", "Handrails, edge protection, safety harness, lifeline, permits to work at height, emergency rescue equipment, training, signs. Scaffold: competent person, erection and dismantling, working on scaffolds, tagging system, materials, ladders, ties, quality, inspection.", 20, { critical: true }),
        item("p1_04", "Electrical and Tools", "Single and three phase cords with ground system, signs, lock out tag out, GFCI, safe operation, proper PPE, safe use of power tools, inspections, guards in place, defective tools tagged and taken out of service, training, competent person.", 20, { critical: true }),
        item("p1_05", "Heavy Equipment, Rigging", "Inspection, certificates, calibration test, safe operation, rigging equipment inspection, lifting plan, training, competent person.", 20, { critical: true }),
        item("p1_06", "PTW", "Permit to work is implemented, documented and communicated with the site team.", 20, { critical: true }),
        item("p1_07", "Excavation", "Permits, barricades, access, excavation materials storage, collapse protection, signs, training.", 10),
        item("p1_08", "Environmental & Health, Medical Facilities", "Environmental measuring, waste management, hazardous materials, ISO requirements, toilets, changing room, lunch area, assembly point, water supply, accommodation, dust control. Medical: clinic condition, site doctor, qualified medical staff, ambulance if needed, medicines, medical waste and medical equipment.", 5),
        item("p1_09", "Prevention / Corrective Action", "Last audit results, site response, closing NCRs.", 5, { usesLastAudit: true }),
        item("p1_10", "Holes, manholes and wall openings", "Holes and wall openings are protected as per OC procedures, such as hard barricades and hard covers, with warning signs.", 5),
        item("p1_11", "P.P.E", "Proper PPE for the activity, as per the OC approved list, with good quality.", 5),
        item("p1_12", "Training & VOCs program", "All employees, subcontractors and visitors received the required HSE training and induction. A training plan / matrix is in place and implemented.", 5),
        item("p1_13", "Welding", "Permits, welding hoses and cables, gas cylinder handling and storage, fire protection, inspection, proper PPE, return valve.", 5),
        item("p1_14", "Fire Prevention", "Adequate fire extinguishers, emergency plan, emergency team, fire alarm system, fire inspection, fire truck if needed, fire rescue equipment and required training.", 5),
        item("p1_15", "Control of Subcontractors", "Subcontractor procedure applied, safety requirements in contracts, penalty policy applied, supervision, induction, training, PPE and housekeeping.", 10),
        item("p1_16", "Confined space", "Permit to work, gas detectors, rescue team, rescue equipment, proper training, proper supervisor and communication.", 5),
      ],
    },
    {
      id: "p2", code: "Part 2", name: "HSE Management System Appraisal", share: 10,
      items: [
        item("p2_01", "QHSE Policy (4.2)", "The QHSE Policy is documented, maintained, posted and communicated.", 20),
        item("p2_02", "Environmental aspects / impact and control (4.3.1 ISO 14001)", "The project implemented the OC procedure for identifying and evaluating all aspects related to site activities and operations.", 20),
        item("p2_03", "Planning (4.3)", "Hazard identification, risk assessment and determining controls, legal and other requirements, objectives and programs.", 20),
        item("p2_04", "Implementation and operation (4.4)", "Resources, roles, responsibility, accountability and authority, competence, training and awareness, communication, participation and consultation, documentation, control of documents, operational control, emergency preparedness and response.", 20),
        item("p2_05", "Checking (4.5)", "Performance measurement and monitoring, evaluation of compliance, incident investigation, nonconformity, corrective and preventive action, control of records.", 20),
      ],
    },
  ],
  deductions: { serious: 15, repeated: 3 },
  seriousNote: "A serious violation needs immediate action or stopping the work, e.g. unprotected work at height, unprotected deep excavation, unsafe confined space, critical lifting without a lifting plan, bad working scaffolds, significant electrical issues. One or more serious violations deduct 15% from the final score.",
  ncrClasses: NCR_FULL,
  goodClasses: GOOD_PRACTICE,
  ncrClause: NCR_DEFAULT_CLAUSE,
  ncrRequirement: NCR_DEFAULT_REQUIREMENT,
  hasMeetings: true,
  hasEquipment: false,
};

export const LIFTING = {
  id: "lifting",
  short: "Lifting",
  name: "Lifting Operation Assessment",
  reportTitle: "Lifting Operation Assessment Report",
  formRef: "F-HSE-0175",
  formRev: "02",
  ncrFormRef: "F-HSE-0003",
  ncrFormRev: "07",
  prefix: "LFT",
  scoreLabel: "Assessment score",
  what: "lifting assessment", startLabel: "Start a lifting assessment", peopleLabel: "Assessors", dateLabel: "Assessment date",
  scoreStep: "Checklist", sectionsLabel: "Ratings by section", partTitle: p => `${p.code}. ${p.name}`, itemNo: it => it.id,
  summaryLabel: "Lifting assessment summary", purposeLabel: "Purpose of the lifting assessment", checklistTitle: "Lifting Assessment Appraisal Checklist",
  sheetTitle: "Lifting Assessment Report", appraisalSheet: "Appraisal Sheet",
  purpose: "Lifting and rigging are among the most important activities to monitor and assess. This periodic audit checks the safe use of lifting equipment and lifting accessories against health and safety requirements, and checks that each lifting operation is well planned.",
  parts: [
    {
      id: "A", code: "A", name: "Certification of third party lifting equipment", share: 10,
      items: [
        item("A1", "Third party certification every 6 months", "All lifting equipment, including man baskets, is certified by the approved third party every 6 months. The third party is approved and accredited by the national accreditation body.", 20),
        item("A2", "Third party engineers approved", "Names of the third party engineers are in the approved list, and the lifting engineer is certified for the type of equipment he inspected.", 10),
        item("A3", "Detailed inspection checklist", "The third party provided a detailed checklist for each equipment inspected.", 10),
        item("A4", "Third party witness form", "The third party witness form is available for performance evaluation.", 10),
        item("A5", "Certificates retained", "Certificates are kept as an archive: lifting accessory certificates for two years, and lifting equipment certificates while the equipment is on the project.", 10),
        item("A6", "Updated register", "All lifting equipment and lifting accessories are in the updated register.", 10),
        item("A7", "Inspection copy on the equipment", "A copy of the third party inspection is on the equipment, in a designated place.", 10),
        item("A8", "Catalog, maintenance log, previous certificates", "Copies of the crane catalog, regular maintenance log and previous inspection certificates are available.", 10),
        item("A9", "Equipment log book (ID)", "The equipment log book (ID) is available.", 10),
      ],
    },
    {
      id: "B", code: "B", name: "Lifting Permits / Lifting Plans", share: 15,
      items: [
        item("B1", "Lifting permit implemented", "The lifting permit is properly implemented by a competent lifting team.", 20),
        item("B2", "Permit items filled correctly", "Items of the lifting permit are properly filled and match the specific (critical) lifting operation.", 10),
        item("B3", "Permit signed by authorized person", "The lifting permit is signed by an authorized person.", 10),
        item("B4", "Work specification and validity", "Specification of work and permit validity are stated and confirmed.", 10),
        item("B5", "Specific lifting data", "Load capacity, crane details, radius, COG, rigging and slings are filled and reviewed by the authorized competent person.", 10),
        item("B6", "Lifting plan above 10 tonnes", "A detailed lifting plan is prepared for lifts above 10 tonnes.", 10),
        item("B7", "Lifting plan content", "The lifting plan includes all required data, lifting calculations and a specific, sufficient risk assessment.", 10),
        item("B8", "Equipment movement permit", "A permit to control equipment movement is in place.", 5),
        item("B9", "Critical lifting plan by competent person", "The critical lifting plan is well planned and prepared by a competent person.", 10),
        item("B10", "Assembly and dismantling risk assessment", "Risk assessments are prepared for equipment assembly and dismantling.", 10),
      ],
    },
    {
      id: "C", code: "C", name: "Level of competence", share: 10,
      items: [
        item("C1", "Operators licensed and certified", "All crane and lifting equipment operators hold valid licenses and are certified.", 20),
        item("C2", "VOC for operators and riggers", "Verification of competency (VOC) is completed for operators and riggers every year.", 20),
        item("C3", "Dedicated riggers", "There are dedicated riggers for lifting operations.", 10),
        item("C4", "Riggers trained", "Riggers received formal training.", 10),
        item("C5", "Riggers certified", "Riggers are certified as competent.", 10),
        item("C6", "Lifting plan quality", "The quality of lifting plans suits the complexity of the lifting operations.", 10),
        item("C7", "Risk assessment quality", "The quality of risk assessments suits the complexity of the lifting operations.", 10),
        item("C8", "Competence system", "A system defines who is competent to carry out each category of lifting operation.", 10),
      ],
    },
    {
      id: "D", code: "D", name: "Equipment Inspection and Condition", share: 25,
      items: [
        item("D1", "Lifting equipment inspected", "Lifting equipment (cranes, manlifts, forklifts) is inspected and in acceptable condition.", 10),
        item("D2", "Rigging equipment inspected", "Rigging equipment is inspected, secured and in acceptable condition.", 5),
        item("D3", "Defective equipment out of use", "Defective fixed lifting equipment is made unusable until repaired, and the rejected color code is applied.", 10),
        item("D4", "Daily and monthly inspections", "Inspection checklists for all lifting equipment are in place and prepared by competent persons. Daily and monthly inspections are done regularly.", 15),
        item("D5", "Crane safety devices", "All cranes and tower cranes have the required safety devices and working limit switches.", 10),
        item("D6", "Load moment indicator (LMI)", "Tower cranes have a load moment indicator system (LMI).", 10),
        item("D7", "Wire ropes condition", "Main and auxiliary wire ropes are lubricated with no visible defects such as broken wires, kinks, excess wear or crushing.", 10),
        item("D8", "Fabricated equipment certified", "Fabricated equipment such as man baskets and material skips has a calculation sheet and is certified.", 10),
        item("D9", "Man basket rigging set", "Man baskets used to hoist people have a specific rigging set certified by the approved body.", 10),
        item("D10", "Load charts", "Crane load charts are available, implemented and communicated.", 10),
      ],
    },
    {
      id: "E", code: "E", name: "Lifting Accessories", share: 10,
      items: [
        item("E1", "Register and tracking", "There is a register and tracking system for portable lifting equipment issued from the rigging loft.", 20),
        item("E2", "Logged in and out", "All appliances and accessories are logged in and out.", 10),
        item("E3", "Color code maintained", "The color code is maintained and refreshed as required.", 20),
        item("E4", "Quarantine area", "A dedicated quarantine area is available for damaged lifting equipment.", 20),
        item("E5", "Quarantine area locked", "The quarantine area is kept locked and secure.", 10),
        item("E6", "Suitable accessories", "The range of portable lifting equipment is adequate and suitable for purpose.", 20),
      ],
    },
    {
      id: "F", code: "F", name: "Safe lifting Operation and use", share: 15,
      items: [
        item("F1", "Permit signed, no conflicts", "The work permit is signed and approved, with no conflict with other lifting operations in the same area.", 10),
        item("F2", "Enough competent riggers", "There is a sufficient number of competent riggers.", 20),
        item("F3", "Communication means", "Means of communication such as walkie-talkies are in place, sufficient and working.", 20),
        item("F4", "Interference and anti-collision", "Interference between tower cranes is controlled and the anti-collision system is used.", 20),
        item("F5", "Pre-lift meeting", "A pre-lift meeting was held between the crane operator, signal person, crew supervisor, contractor coordinator and other affected persons.", 10),
        item("F6", "Wind speed device", "Adequate devices are in place to measure wind speed (anemometer).", 20),
      ],
    },
    {
      id: "G", code: "G", name: "Maintenance procedures", share: 15,
      items: [
        item("G1", "Fixed lifting equipment PM", "Preventive maintenance procedures are in place for fixed lifting equipment.", 10),
        item("G2", "Cranes PM", "Preventive maintenance procedures are in place for the cranes.", 10),
        item("G3", "Forklifts PM", "Preventive maintenance procedures are in place for the forklifts.", 10),
        item("G4", "Manlifts PM", "Preventive maintenance procedures are in place for the manlifts.", 10),
        item("G5", "Rope change-out records", "There is a procedure to monitor and record rope change-outs (crane and winch ropes).", 20),
        item("G6", "Maintenance log book", "The maintenance log book is available, with the history from day one of use to date.", 10),
        item("G7", "Subcontractors follow procedures", "Subcontractors follow the same company inspection and maintenance procedures for all rental equipment.", 10),
        item("G8", "Designated maintenance place", "Maintenance is done at a designated place and well coordinated.", 20),
      ],
    },
  ],
  deductions: { serious: 15, repeated: 3 },
  seriousNote: "One or more serious violations deduct 15% from the final score. Each repeated violation from the last assessment that is still open deducts 3%.",
  ncrClasses: NCR_LIFTING,
  goodClasses: GOOD_PRACTICE,
  ncrClause: NCR_DEFAULT_CLAUSE,
  ncrRequirement: NCR_DEFAULT_REQUIREMENT,
  hasMeetings: false,
  hasEquipment: true,
  equipment: [
    { desc: "OC Mobile Crane", owner: "Owned" },
    { desc: "Tower Cranes", owner: "Owned" },
    { desc: "OC Telescopic Forklifts", owner: "Owned" },
    { desc: "Rental Telescopic Forklifts", owner: "Rental" },
    { desc: "Man Basket", owner: "Owned" },
    { desc: "Elevator (Alimak)", owner: "Owned" },
  ],
};

const NCR_FLASH = FLASH_PARTS.map(p => p.name);

export const FLASH = {
  id: "flash",
  short: "Flash Audit",
  name: "HSE Flash Audit",
  reportTitle: "HSE Flash Audit Report",
  formRef: "F-HSE-0075",
  formRev: "01",
  ncrFormRef: "F-HSE-0003",
  ncrFormRev: "07",
  prefix: "FA",
  scoreLabel: "Checklist compliance",
  what: "Flash audit", startLabel: "Start a Flash audit", peopleLabel: "Auditors", dateLabel: "Audit date",
  scoreStep: "Checklist", sectionsLabel: "Compliance by topic", partTitle: p => p.name, itemNo: it => it.id,
  summaryLabel: "Flash audit summary", purposeLabel: "Purpose of the Flash audit", checklistTitle: "HSE Flash Audit Checklist",
  sheetTitle: "HSE Flash Audit Report", appraisalSheet: "Checklist",
  purpose: "A short site visit that checks the high-risk activities against the company rules: work at height, lifting, permits, confined spaces, electrical, line of fire, falling objects, excavation, traffic, emergency, fire, housekeeping and PPE.",
  // Each check is Yes, No or N/A. The score is the share of Yes among the checks that apply.
  binary: true, countScore: true,
  parts: FLASH_PARTS,
  // The risk of a check sets the NCR type when the answer is No.
  riskSeverity: { High: "Serious", Med: "Major", Low: "Minor" },
  deductions: { serious: 0, repeated: 0 },
  seriousNote: "Flash audits have no deductions. The score is the share of checks met.",
  ncrClasses: NCR_FLASH,
  goodClasses: GOOD_PRACTICE,
  ncrClause: NCR_DEFAULT_CLAUSE,
  ncrRequirement: NCR_DEFAULT_REQUIREMENT,
  hasMeetings: false,
  hasEquipment: false,
};

export const MODULES = { full: FULL, lifting: LIFTING, flash: FLASH };
export const MODULE_IDS = ["full", "lifting", "flash"];

// Settings can override lists and item texts; this merges them over the defaults.
export function moduleDef(id, settings) {
  const base = MODULES[id];
  const o = (settings && settings.modules && settings.modules[id]) || {};
  const parts = base.parts.map(p => ({
    ...p,
    items: p.items.map(it => ({ ...it, ...((o.items && o.items[it.id]) || {}) })),
  }));
  return {
    ...base,
    parts,
    ncrClasses: o.ncrClasses || base.ncrClasses,
    goodClasses: o.goodClasses || base.goodClasses,
    formRef: o.formRef || base.formRef,
    formRev: o.formRev || base.formRev,
    deductions: { ...base.deductions, ...(o.deductions || {}) },
  };
}
export const allItems = def => def.parts.flatMap(p => p.items.map(it => ({ ...it, part: p.id })));
