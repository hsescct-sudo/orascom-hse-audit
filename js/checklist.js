// The 109 flash-audit checks (13 topics). IDs like WAH-03 are stable — the database stores them.
const RAW = [
 {
  "code": "WAH",
  "name": "Work at Height",
  "photo": "Untagged/incomplete scaffolds, missing guardrails or toe boards, workers not tied off, unprotected openings.",
  "items": [
   [
    "Work at height permit issued and valid where required by the PTW procedure",
    "Med"
   ],
   [
    "Scaffolds tagged (green/red) and inspected by a competent scaffold inspector within the last 7 days",
    "High"
   ],
   [
    "Scaffold platforms fully boarded with top rail, mid rail, toe boards and a safe access ladder",
    "High"
   ],
   [
    "Full-body harness worn and 100% tied off to a suitable anchor (double lanyard) above 1.8 m",
    "High"
   ],
   [
    "Harnesses and lanyards inspected, colour-coded and in good condition",
    "Med"
   ],
   [
    "Open edges, floor openings and shafts protected by guardrails or secured, marked covers",
    "High"
   ],
   [
    "Ladders in good condition, secured, extending 1 m above the landing, used for access or short tasks only",
    "Med"
   ],
   [
    "MEWPs / man-lifts: valid third-party certificate, daily checklist, trained operator, harness clipped in basket",
    "High"
   ],
   [
    "Rescue plan for suspended workers available and rescue kit on site",
    "Med"
   ]
  ]
 },
 {
  "code": "LFT",
  "name": "Lifting Operations",
  "photo": "Lifting zone without barricade, people under load, damaged slings, outriggers not on pads, missing certificates.",
  "items": [
   [
    "Lift plan available for every lift; critical lifts have an approved critical lift plan",
    "High"
   ],
   [
    "Crane / lifting equipment third-party certificate valid and copy available in the cab",
    "High"
   ],
   [
    "Operator, rigger and signalman hold valid third-party certification",
    "High"
   ],
   [
    "Lifting accessories (slings, shackles, hooks) certified, colour-coded, SWL marked and in good condition",
    "High"
   ],
   [
    "Outriggers fully extended on mats/pads; ground bearing capacity checked",
    "High"
   ],
   [
    "Lifting zone barricaded; nobody under the suspended load; tag lines used",
    "High"
   ],
   [
    "Daily pre-use crane inspection completed; LMI and limit switches working",
    "Med"
   ],
   [
    "Wind speed monitored and stop-lift limits known to the crew",
    "Med"
   ],
   [
    "Forklifts / telehandlers used within manufacturer rating and not for suspended lifts without an approved attachment",
    "High"
   ],
   [
    "Safe clearance kept from overhead power lines",
    "High"
   ]
  ]
 },
 {
  "code": "PTW",
  "name": "Permit to Work (PTW)",
  "photo": "Permit at the work front (or its absence), expired or mismatched permits, missing signatures, open isolations.",
  "items": [
   [
    "Valid permit displayed at the work location for every activity that needs one",
    "High"
   ],
   [
    "Permit matches the actual activity, location, crew and date/time",
    "High"
   ],
   [
    "Task-specific JSA / risk assessment attached and briefed to the crew (TBT signed)",
    "Med"
   ],
   [
    "Isolations (LOTO) listed on the permit and verified in the field",
    "High"
   ],
   [
    "Gas test results recorded on hot work and confined space permits",
    "High"
   ],
   [
    "Permit issuers and receivers authorised and trained (authorised list available)",
    "Med"
   ],
   [
    "Simultaneous / overlapping operations coordinated between permits and contractors",
    "High"
   ],
   [
    "Permits closed out at end of shift and the PTW register is up to date",
    "Low"
   ]
  ]
 },
 {
  "code": "CSE",
  "name": "Confined Space Entry",
  "photo": "Unsigned/unguarded confined space openings, missing attendant, gas detector reading, rescue set-up.",
  "items": [
   [
    "Confined spaces identified, signposted and access controlled when not in use",
    "High"
   ],
   [
    "Valid entry permit with gas test (O2, LEL, H2S, CO) before entry and at set intervals",
    "High"
   ],
   [
    "Calibrated multi-gas detector used for continuous monitoring during entry",
    "High"
   ],
   [
    "Standby attendant at the entry point at all times; entry/exit log maintained",
    "High"
   ],
   [
    "Rescue plan and rescue equipment (tripod/winch, breathing apparatus) available on site",
    "High"
   ],
   [
    "Energy and process lines isolated (blinds, LOTO) before entry",
    "High"
   ],
   [
    "Adequate ventilation provided",
    "Med"
   ],
   [
    "Entrants and attendants trained; communication method agreed",
    "Med"
   ],
   [
    "Low-voltage or intrinsically safe lighting and tools used inside",
    "Med"
   ]
  ]
 },
 {
  "code": "ELE",
  "name": "Electrical Safety",
  "photo": "Open or unearthed DBs, damaged/taped cables, cables on the ground or in water, bare wires in sockets.",
  "items": [
   [
    "Temporary distribution boards closed, locked, labelled and earthed with tested RCD/ELCB (30 mA)",
    "High"
   ],
   [
    "Cables elevated or protected; no damaged insulation or taped joints; not lying in water or vehicle routes",
    "Med"
   ],
   [
    "Industrial plugs and sockets used; no bare wires inserted into sockets",
    "High"
   ],
   [
    "Portable power tools inspected and colour-coded / tagged",
    "Med"
   ],
   [
    "LOTO applied for work on electrical systems; lock and tag register maintained",
    "High"
   ],
   [
    "Only authorised, competent electricians work on electrical installations",
    "High"
   ],
   [
    "Generators earthed, with drip tray and safe refuelling arrangement",
    "Med"
   ],
   [
    "Overhead and underground cables identified with clearance or goal posts in place",
    "High"
   ],
   [
    "Reduced-voltage (110 V) or battery tools used in wet or confined areas",
    "Med"
   ]
  ]
 },
 {
  "code": "LOF",
  "name": "Line of Fire",
  "photo": "Workers in the path of moving plant or loads, hoses without whip checks, unguarded rotating parts.",
  "items": [
   [
    "Workers kept out of the path of moving equipment and suspended or swinging loads",
    "High"
   ],
   [
    "Pressure testing and pressurised hoses: exclusion zone set and whip checks fitted",
    "High"
   ],
   [
    "Stored energy (springs, tensioned cables, strands) identified and controlled",
    "High"
   ],
   [
    "Pinch points and rotating parts guarded",
    "High"
   ],
   [
    "Nobody standing between vehicles/plant and fixed objects; reversing guided by a banksman",
    "High"
   ],
   [
    "Hands-free tools / tag lines / push-pull sticks used to keep hands away from loads",
    "Med"
   ],
   [
    "Correct body position and guards in place during cutting and grinding",
    "Med"
   ],
   [
    "Cut-resistant gloves and suitable PPE used for material handling",
    "Med"
   ]
  ]
 },
 {
  "code": "FOB",
  "name": "Falling Objects",
  "photo": "Materials at edges, untethered tools at height, entrances without overhead protection, missing exclusion zones.",
  "items": [
   [
    "Toe boards fitted on scaffolds, platforms and open edges",
    "High"
   ],
   [
    "Tools used at height tethered or kept in tool bags",
    "Med"
   ],
   [
    "No materials stored near edges or openings; loose items secured against wind",
    "High"
   ],
   [
    "Exclusion zone barricaded and signed below overhead work",
    "High"
   ],
   [
    "Overhead protection (catch fans, nets, covered walkways) at building entrances and access routes",
    "High"
   ],
   [
    "Debris chutes or controlled lowering used for waste from height",
    "Med"
   ],
   [
    "Hard hats worn by everyone, with chin straps when working at height",
    "Med"
   ],
   [
    "Loose items on cranes, MEWPs and structures removed or secured",
    "Med"
   ]
  ]
 },
 {
  "code": "EXC",
  "name": "Excavation",
  "photo": "Vertical unbenched walls, spoil at the edge, no barricade, no ladder, plant too close to the edge.",
  "items": [
   [
    "Excavation permit issued with underground services clearance (drawings / cable scan)",
    "High"
   ],
   [
    "Excavations deeper than 1.2 m sloped, benched or shored according to soil type",
    "High"
   ],
   [
    "Spoil and materials kept at least 1 m back from the edge",
    "Med"
   ],
   [
    "Hard barricades and signage around the excavation, with lighting at night",
    "High"
   ],
   [
    "Safe access/egress (ladders or ramps) every 7.5 m in excavations deeper than 1.2 m",
    "High"
   ],
   [
    "Plant and vehicles kept a safe distance from the edge; stop blocks used",
    "High"
   ],
   [
    "Daily inspection by a competent person recorded (and after rain or water ingress)",
    "Med"
   ],
   [
    "Water accumulation controlled by dewatering",
    "Med"
   ],
   [
    "Banksman for excavators and nobody inside the swing radius",
    "High"
   ]
  ]
 },
 {
  "code": "TRF",
  "name": "Traffic Management",
  "photo": "Pedestrians on vehicle routes, missing flagmen at blind spots, speed signs, defective plant, workers in pickup beds.",
  "items": [
   [
    "Approved traffic management plan with site layout displayed",
    "Med"
   ],
   [
    "Pedestrian walkways segregated from vehicle routes by hard barriers",
    "High"
   ],
   [
    "Speed limit signs posted and enforced",
    "Med"
   ],
   [
    "Trained flagmen / banksmen at blind spots, crossings, gates and during reversing",
    "High"
   ],
   [
    "Vehicles and plant: valid third-party inspection, reverse alarm, beacon, seat belts",
    "High"
   ],
   [
    "Drivers and operators licensed and hold a site driving authorisation",
    "Med"
   ],
   [
    "Defined parking, turning and one-way areas",
    "Low"
   ],
   [
    "Reflective signs and lighting at night; high-visibility vests worn",
    "Med"
   ],
   [
    "Workers transported only seated in buses (no riding in pickup beds)",
    "High"
   ]
  ]
 },
 {
  "code": "EMR",
  "name": "Emergency Preparedness",
  "photo": "Assembly point signs, emergency numbers board, first aid kits, blocked routes, heat-stress rest areas.",
  "items": [
   [
    "Emergency response plan available and updated; emergency numbers displayed",
    "Med"
   ],
   [
    "Assembly points identified, signposted and kept clear",
    "Med"
   ],
   [
    "Emergency drills done as scheduled, with records and lessons learned",
    "Med"
   ],
   [
    "Trained first aiders on every shift; first aid kits stocked",
    "High"
   ],
   [
    "Clinic / medical cover and ambulance available or formally arranged",
    "High"
   ],
   [
    "Emergency alarm and communication system working",
    "Med"
   ],
   [
    "Spill kits available at fuel and chemical areas",
    "Med"
   ],
   [
    "Heat stress controls: cool drinking water, shaded rest areas and work-rest regime",
    "Med"
   ]
  ]
 },
 {
  "code": "FIR",
  "name": "Fire Protection",
  "photo": "Missing or expired extinguishers, hot work without fire watch, gas cylinders unsecured, combustible waste piles.",
  "items": [
   [
    "Fire extinguishers of the right type, inspected monthly (tagged) and accessible",
    "Med"
   ],
   [
    "Hot work: permit, fire watch, extinguisher, fire blanket, combustibles cleared from the area",
    "High"
   ],
   [
    "Gas cylinders stored upright, chained, capped, with oxygen and fuel gas segregated",
    "High"
   ],
   [
    "Flashback arrestors fitted at both ends of oxy-fuel sets",
    "High"
   ],
   [
    "Fuel storage bunded, signed (no smoking) and earthed",
    "Med"
   ],
   [
    "Fire alarm / detection working in offices, stores and camps",
    "Med"
   ],
   [
    "Smoking only in designated areas",
    "Med"
   ],
   [
    "Emergency exits and escape routes clear and signposted",
    "Med"
   ],
   [
    "No accumulation of scrap or combustible waste",
    "Med"
   ]
  ]
 },
 {
  "code": "HKP",
  "name": "Housekeeping",
  "photo": "Blocked walkways and stairs, uncapped rebar, scattered materials, mixed waste, spills.",
  "items": [
   [
    "Access routes, walkways and stairs clear of materials and debris",
    "Med"
   ],
   [
    "Materials stacked stable, segregated and labelled",
    "Med"
   ],
   [
    "Waste segregated, bins provided and removed regularly",
    "Med"
   ],
   [
    "Protruding rebar capped; nails and sharp objects removed",
    "High"
   ],
   [
    "Chemicals stored with SDS and secondary containment; spills cleaned",
    "Med"
   ],
   [
    "Adequate lighting in work areas, stairs and access routes",
    "Med"
   ],
   [
    "Welfare facilities (toilets, drinking water, rest/eating areas) clean; no eating or sleeping in work areas",
    "Med"
   ],
   [
    "Laydown yards organised",
    "Low"
   ]
  ]
 },
 {
  "code": "GEN",
  "name": "General – PPE & Supervision",
  "photo": "Workers without basic PPE, damaged PPE, supervisor absent at high-risk work.",
  "items": [
   [
    "Basic PPE worn correctly by all workers, with enough stock in the store",
    "Med"
   ],
   [
    "Daily toolbox talks held and recorded",
    "Med"
   ],
   [
    "Supervisor present at every high-risk activity",
    "High"
   ],
   [
    "All personnel on site have attended HSE induction",
    "Med"
   ],
   [
    "HSE personnel coverage adequate for manpower and active work fronts",
    "Med"
   ]
  ]
 }
];

export const TOPICS = RAW.map(t => ({
  code: t.code, name: t.name, photo: t.photo,
  items: t.items.map(([text, risk], i) => ({ id: `${t.code}-${String(i + 1).padStart(2, "0")}`, text, risk, topic: t.code }))
}));
export const TOPIC = Object.fromEntries(TOPICS.map(t => [t.code, t]));
export const ITEM = Object.fromEntries(TOPICS.flatMap(t => t.items.map(i => [i.id, i])));
export const ITEM_IDS = Object.keys(ITEM);
export const TOTAL_CHECKS = ITEM_IDS.length;
export const topicName = code => (TOPIC[code] && TOPIC[code].name) || code || "—";

export const RC_LIST = ["Lack of Supervision", "Lack of Inspection", "Lack of Training / Competence", "Inadequate Planning / Risk Assessment",
  "Procedure Not Followed", "Inadequate Procedure", "Lack of Resources", "Lack of Coordination", "Management / Enforcement",
  "Equipment Defect / Maintenance", "Poor Housekeeping Discipline"];

// Best-guess topic for free text (used when importing Excel reports)
const KEYWORDS = [
  ["CSE", /confined|manhole|tank entry|vessel entry|gas test/i],
  ["PTW", /permit|ptw|isolation certificate|work authori[sz]/i],
  ["LFT", /lift|crane|rigg|sling|shackle|hoist|forklift|telehandler|load chart/i],
  ["EXC", /excavat|trench|benching|shoring|spoil|slope/i],
  ["WAH", /scaffold|height|harness|lanyard|guardrail|ladder|man-?lift|mewp|edge protection|fall arrest/i],
  ["FOB", /falling object|dropped object|overhead protection|toe ?board|materials? (stored )?(near|on) (the )?edge/i],
  ["ELE", /electric|cable|db\b|distribution board|socket|elcb|rcd|earthing|generator|loto|lock ?out/i],
  ["TRF", /traffic|vehicle|flagm|banksm|speed|pedestrian|walkway|driver|reversing|bus/i],
  ["FIR", /fire|extinguish|hot work|cylinder|flammable|scrap|combustible|smok/i],
  ["EMR", /emergency|first aid|assembly|drill|ambulance|clinic|heat stress|spill kit/i],
  ["LOF", /line of fire|pinch|caught|stored energy|pressur|whip ?check/i],
  ["HKP", /housekeeping|debris|tripping|slipping|rebar|access route|obstruct|waste|eating|sleeping|hygiene/i],
  ["GEN", /ppe|helmet|hard hat|glove|goggle|toolbox|induction|supervis/i],
];
export function guessTopic(text) {
  for (const [code, re] of KEYWORDS) if (re.test(text || "")) return code;
  return "GEN";
}
