/* ────────────────────────────────────────────────────────────────────────────
   CASAA TUNE — parameter schema
   Every entry is READ-ONLY metadata. The dashboard fetches the real files from
   GitHub and extracts the live value with `re`. Nothing here writes anything.

   fields:
     key      unique id
     label    display name
     file     repo path (fetched from raw.githubusercontent)
     re       regex with ONE capture group = the value. If it fails to match,
              the card shows "couldn't read" rather than guessing.
     unit     display unit
     what     what the parameter actually does
     dir      what raising it does
     safe     sensible range, from what we've actually driven
     tags     ["inert"]    = present in the tree but does NOTHING on the Atto 3
              ["rebuild"]  = only takes effect after a rebuild (acados compiled)
              ["app"]      = set on the device, not in code
              ["panda"]    = panda C; device never compiles it, so edits are inert
              ["fixed"]    = determined by hardware, not tunable
   ──────────────────────────────────────────────────────────────────────────── */

const REPO = "xynkro/bukapilot";
const BRANCH = "casparstune";
const STOCK_REF = "ac9798ef2";      // kommuai staging Aug-10 = our base
const STOCK_LABEL = "Kommu Aug-10";

const F = {
  mpc:   "selfdrive/controls/lib/longitudinal_mpc_lib/long_mpc.py",
  plan:  "selfdrive/controls/lib/longitudinal_planner.py",
  drive: "selfdrive/controls/lib/drive_helpers.py",
  vtsc:  "selfdrive/controls/lib/vtsc.py",
  vals:  "opendbc_repo/opendbc/car/byd/values.py",
  iface: "opendbc_repo/opendbc/car/byd/interface.py",
  radar: "opendbc_repo/opendbc/car/byd/radar_interface.py",
  cc:    "opendbc_repo/opendbc/car/byd/cam_lka/carcontroller.py",
  dm:    "selfdrive/monitoring/helpers.py",
  cal:   "selfdrive/locationd/calibrationd.py",
  panda: "opendbc_repo/opendbc/safety/modes/byd.h",
};

const GROUPS = [

/* ══════════════════ FOLLOWING & STOPPING ══════════════════ */
{ name: "Following & Stopping", icon: "🚗", blurb:
  "How much space the car keeps behind a lead, and how close it parks at a stop.",
  params: [
  { key:"stop_distance", label:"Stop distance", file:F.mpc, unit:"m",
    re:/^STOP_DISTANCE\s*=\s*([\d.]+)/m,
    what:"Gap left behind the lead car once you're both at a complete standstill. At a stop this is the ONLY term left in the gap equation.",
    dir:"Higher = parks further back. Lower = noses closer in.",
    safe:"2.0 – 7.0", tags:["rebuild"],
    note:"Too high caused the accordion: a lead slowing to 15 km/h at 7 m made the MPC brake to a full stop just to open the gap." },

  { key:"t_follow_relaxed", label:"Follow time — Relaxed", file:F.mpc, unit:"s",
    re:/def get_T_FOLLOW[\s\S]*?relaxed:\s*\n\s*return\s+([\d.]+)/,
    what:"Headway in SECONDS, not metres — so the physical gap grows with speed. At 90 km/h, 1.65 s ≈ 41 m.",
    dir:"Higher = bigger gap, earlier braking onset.", safe:"1.4 – 2.0", tags:["rebuild"],
    note:"Selected by the gap button on your steering wheel (SET_DISTANCE → personality)." },

  { key:"t_follow_standard", label:"Follow time — Standard", file:F.mpc, unit:"s",
    re:/def get_T_FOLLOW[\s\S]*?standard:\s*\n\s*return\s+([\d.]+)/,
    what:"Headway for the middle gap setting.",
    dir:"Higher = bigger gap, earlier braking onset.", safe:"1.4 – 1.8", tags:["rebuild"] },

  { key:"t_follow_aggressive", label:"Follow time — Aggressive", file:F.mpc, unit:"s",
    re:/def get_T_FOLLOW[\s\S]*?aggressive:\s*\n\s*return\s+([\d.]+)/,
    what:"Headway for the closest gap setting.",
    dir:"Higher = bigger gap.", safe:"1.2 – 1.6", tags:["rebuild"] },

  { key:"jerk_factor_std", label:"Brake smoothness — Standard", file:F.mpc, unit:"x",
    re:/def get_jerk_factor[\s\S]*?standard:\s*\n\s*return\s+([\d.]+)/,
    what:"Scales the MPC jerk cost per personality - how abruptly braking may ramp in. Aggressive uses 0.5, allowing sharper onset.",
    dir:"Lower = sharper, more urgent braking. Higher = smoother, lazier.",
    safe:"0.5 - 1.0", tags:["rebuild"],
    note:"Sits directly above get_T_FOLLOW with an identical shape - which is exactly why every pattern here is anchored to its function name." },

  { key:"comfort_brake", label:"Comfort brake", file:F.mpc, unit:"m/s²",
    re:/^COMFORT_BRAKE\s*=\s*([\d.]+)/m,
    what:"The deceleration the planner ASSUMES it can use when sizing the gap to a slower lead. Only matters when closing — the term is zero at matched speed.",
    dir:"LOWER = it assumes gentler braking, so it demands a bigger gap and starts slowing EARLIER. Counter-intuitive.",
    safe:"2.0 – 3.0", tags:["rebuild"] },

  { key:"long_actuator_delay", label:"Longitudinal actuator delay", file:F.iface, unit:"s",
    re:/ret\.longitudinalActuatorDelay\s*=\s*([\d.]+)/,
    what:"How long openpilot assumes the throttle/brake takes to respond. Used to look ahead when planning.",
    dir:"Higher = anticipates more, acts earlier.", safe:"0.2 – 0.6" },

  { key:"stopping_decel", label:"Stopping decel rate", file:F.iface, unit:"m/s³",
    re:/ret\.stoppingDecelRate\s*=\s*([\d.]+)/,
    what:"How quickly braking ramps in over the last few metres before a standstill.",
    dir:"Higher = firmer final stop. Lower = softer creep to rest.", safe:"0.1 – 0.5" },
]},

/* ══════════════════ ACCELERATION ══════════════════ */
{ name: "Acceleration", icon: "⚡", blurb:
  "How hard the car pulls when it has room. Note the CAN clamp below — it caps everything.",
  params: [
  { key:"a_cruise_max", label:"Max accel by speed", file:F.plan, unit:"m/s² @ [0,10,25,40] m/s",
    re:/^A_CRUISE_MAX_VALS\s*=\s*(\[[^\]]*\])/m,
    what:"Acceleration ceiling at four speeds, interpolated between. Four numbers: standstill, 36, 90, 144 km/h.",
    dir:"Higher = pulls harder. The LAST numbers matter most for highway build-up.",
    safe:"[1.6, 1.4, 1.0, 0.8]",
    note:"The FIRST number is already clamped — see ACCEL_MULT. Raising it past 1.5 does nothing." },

  { key:"accel_mult", label:"Accel multiplier (Atto 3)", file:F.vals, unit:"×",
    re:/CAR\.BYD_ATTO3:\s*(\d+),/,
    what:"Scales every longitudinal command onto the CAN bus: ACCEL_CMD = clamp(accel × MULT, −80, +30).",
    dir:"Higher = stronger accel AND stronger braking — it is SYMMETRIC.",
    safe:"18 – 26",
    note:"⚠️ Because it's symmetric it can never give 'more accel, softer brake'. At 20, the +30 ceiling is hit at a planned 1.5 m/s² — which is why the standstill A_CRUISE value is already maxed." },

  { key:"a_total_max", label:"Cornering accel budget", file:F.plan, unit:"m/s² @ [20,40] m/s",
    re:/^_A_TOTAL_MAX_V\s*=\s*(\[[^\]]*\])/m,
    what:"Total grip budget. Mid-corner it computes a_x = √(total² − a_y²) and refuses throttle beyond it — stock comma behaviour to avoid accelerating while losing a target in a turn.",
    dir:"Higher = allows more throttle mid-corner.", safe:"leave stock [1.7, 3.2]" },
]},

/* ══════════════════ EMERGENCY BRAKING ══════════════════ */
{ name: "Danger-brake override", icon: "🛑", blurb:
  "A separate hard-brake layer on top of the normal MPC, for closing on a lead fast.",
  params: [
  { key:"danger_on", label:"Danger trigger (ON)", file:F.plan, unit:"m/s closing",
    re:/^DANGER_VREL_ON_MPS\s*=\s*([\d.]+)/m,
    what:"Firm override braking engages once the gap is shrinking faster than this. 3.0 m/s ≈ 11 km/h of closing speed.",
    dir:"LOWER = fires earlier and more often. Higher = only in genuine emergencies.",
    safe:"2.5 – 4.5",
    note:"Must stay ABOVE the OFF value — the pair is hysteresis, preventing on/off chatter." },

  { key:"danger_off", label:"Danger release (OFF)", file:F.plan, unit:"m/s closing",
    re:/^DANGER_VREL_OFF_MPS\s*=\s*([\d.]+)/m,
    what:"Once engaged, the override holds until closing drops below this.",
    dir:"Lower = holds the brake longer.", safe:"1.5 – 3.5" },

  { key:"danger_decel", label:"Danger decel", file:F.plan, unit:"m/s² @ [0,10] m/s",
    re:/^DANGER_DECEL_VEGO_V\s*=\s*(\[[^\]]*\])/m,
    what:"How hard the override brakes, by speed. Scaled at runtime by the BrakeMagGain slider in the app.",
    dir:"More negative = harder braking.", safe:"[-1.0, -1.2]" },

  { key:"brake_mag_gain", label:"Brake gain (app slider)", file:null, unit:"%",
    what:"Set on the DEVICE, not in code — the 'braking gain' slider. Multiplies danger-brake authority by 1 + pct/100.",
    dir:"Higher = firmer emergency braking. At 100% it doubles it.",
    safe:"0 – 100", tags:["app"],
    note:"No commit or rebuild needed — the safest thing to experiment with." },
]},

/* ══════════════════ CORNERING ══════════════════ */
{ name: "Cornering & Steering", icon: "🎯", blurb:
  "How hard and how fast the car is allowed to steer. This is your Atto 3's REAL lateral lever set — the PID gains below do nothing.",
  params: [
  { key:"max_lat_accel", label:"Max lateral accel", file:F.drive, unit:"m/s²",
    re:/^MAX_LATERAL_ACCEL_NO_ROLL\s*=\s*([\d.]+)/m,
    what:"Ceiling on how much cornering force the car will request. Converted to a curvature limit via ÷ v². The single biggest 'holds the line vs runs wide' lever.",
    dir:"Higher = holds tighter corners. 5.0 ≈ 0.51 g on the 2090 kg Atto 3.",
    safe:"3.0 – 5.0",
    note:"It's a CEILING — raising it makes clipping LESS likely, not more. Validated on the ECP ramp (66 m radius at 55–60 km/h)." },

  { key:"max_lat_jerk", label:"Max lateral jerk", file:F.drive, unit:"m/s³",
    re:/^MAX_LATERAL_JERK\s*=\s*([\d.]+)/m,
    what:"How fast cornering force may be ADDED — governs turn-in crispness.",
    dir:"Higher = quicker turn-in.", safe:"5.0 – 7.0" },

  { key:"angle_rate_up", label:"Steer rate — turn in", file:F.vals, unit:"°/frame @ [0,5,15] m/s",
    re:/ANGLE_RATE_LIMIT_UP\s*=\s*AngleRateLimit\(speed_bp=\[[^\]]*\],\s*angle_v=(\[[^\]]*\])/,
    what:"How fast the commanded steering angle may INCREASE, by speed. Too slow and it lags a tightening corner and drifts wide.",
    dir:"Higher = keeps pace with tightening bends.", safe:"[6,4,3] – [8,7,6]",
    note:"Panda hard ceiling is {28,26,22} — well above these, so no reflash needed." },

  { key:"angle_rate_down", label:"Steer rate — unwind", file:F.vals, unit:"°/frame @ [0,5,15] m/s",
    re:/ANGLE_RATE_LIMIT_DOWN\s*=\s*AngleRateLimit\(speed_bp=\[[^\]]*\],\s*angle_v=(\[[^\]]*\])/,
    what:"How fast the commanded angle may DECREASE — governs corner exit.",
    dir:"Higher = straightens out faster on exit.", safe:"[8,6,4] – [8,7,6]" },

  { key:"steer_angle_max", label:"Max steering angle", file:F.vals, unit:"°",
    re:/STEER_ANGLE_MAX\s*=\s*([\d.]+)/,
    what:"Absolute lock openpilot may command. Only binds at low speed / big lock: roundabouts, tight junctions.",
    dir:"Higher = more available lock for tight manoeuvres.", safe:"120 – 180",
    note:"⚠️ Panda's own max_angle is INERT for BYD (both its use-sites sit behind flags this car disables), so this is the ONLY absolute angle limit in the chain. Panda still enforces RATE limits." },

  { key:"steer_offset", label:"Angle offset window", file:F.cc, unit:"°",
    re:/^MAX_STEER_ANGLE_OFFSET_DEG\s*=\s*(\d+)/m,
    what:"How far the commanded angle may deviate from where the wheel actually IS, per step. The command window slides with the measured angle.",
    dir:"Higher = more authority per step, less clipping. Also a bigger snap-back if you displace the wheel.",
    safe:"10 – 15" },

  { key:"steer_actuator_delay", label:"Steer actuator delay", file:F.iface, unit:"s",
    re:/ret\.steerActuatorDelay\s*=\s*([\d.]+)/,
    what:"How long openpilot assumes the EPS takes to respond. Higher makes the controller look further ahead, so it starts steering EARLIER.",
    dir:"Higher = crisper turn-in. Too high = over-anticipates and weaves.", safe:"0.01 – 0.10" },

  { key:"steer_limit_timer", label:"Saturation alert dwell", file:F.iface, unit:"s",
    re:/ret\.steerLimitTimer\s*=\s*([\d.]+)/,
    what:"How long steering must stay saturated before the 'Take Control' alert fires. Alert timing ONLY — zero effect on steering authority.",
    dir:"Higher = fewer alerts, but hides genuine tracking failure.", safe:"0.6 – 3.0",
    note:"The condition it reports is real: desired vs measured angle differing by >2.5°. Better to reduce demand than to mute it." },

  { key:"kf", label:"Lateral kf (feedforward)", file:F.iface, unit:"",
    re:/ret\.lateralTuning\.pid\.kf\s*=\s*([\d.]+)/,
    what:"PID feedforward gain.",
    dir:"—", safe:"n/a", tags:["inert"],
    note:"⚠️ DOES NOTHING on your car. The Atto 3 is SteerControlType.angle, so controlsd uses LatControlAngle — which has no PID at all. kf / kpV / kiV are dead code here. (Also means the old 'kpV causes calibration thrash' theory was mis-attributed — the real culprit was the steer-rate limit.)" },
]},

/* ══════════════════ RADAR ══════════════════ */
{ name: "Radar & Lead Detection", icon: "📡", blurb:
  "Gates deciding which radar returns become a tracked lead. Vision is the gatekeeper — radar alone can't create a lead above low speed.",
  params: [
  { key:"yrel", label:"Lateral window", file:F.radar, unit:"m",
    re:/^YREL_ABS_MAX\s*=\s*([\d.]+)/m,
    what:"How far off-centre a radar return may be and still count as your lead. Beyond 30 m the gate tightens automatically (×0.7).",
    dir:"Higher = acquires leads earlier and further out, but lets in more side-lane traffic and roadside ghosts.",
    safe:"1.5 – 2.5",
    note:"The sweet spot is narrow: 1.5 acquires late, 2.5 brought phantom braking on curves and near gantries. 2.0 is the compromise." },

  { key:"valid_cnt", label:"Frames to confirm", file:F.radar, unit:"frames",
    re:/^VALID_CNT_ON\s*=\s*(\d+)/m,
    what:"Consecutive good frames before a track is declared a lead. At 20 Hz, 5 frames = 250 ms.",
    dir:"Lower = faster acquisition, more track churn and phantom leads.", safe:"3 – 5" },

  { key:"miss_max", label:"Frames before drop", file:F.radar, unit:"frames",
    re:/^MISS_MAX\s*=\s*(\d+)/m,
    what:"How long a track survives missing frames before deletion. 15 frames = 750 ms.",
    dir:"Lower = drops stale tracks sooner, but risks losing a real lead in a dropout.",
    safe:"10 – 15",
    note:"⚠️ At 3 this caused a <1 m near-miss at 90 km/h — lead dropped, planner accelerated, lead reappeared, jam brake. A departing car is deleted instantly by a separate check, so high values aren't as risky as they look." },

  { key:"conf_on", label:"Confidence to accept", file:F.radar, unit:"",
    re:/^CONF_ON\s*=\s*([\d.]+)/m,
    what:"Radar confidence needed to start tracking a target.",
    dir:"Lower = accepts weaker returns (bikes, distant cars) and more ghosts.", safe:"0.70 – 0.80" },

  { key:"radar_freq", label:"Radar rate", file:F.radar, unit:"Hz",
    re:/^RADAR_FREQ_HZ\s*=\s*(\d+)/m,
    what:"Declared broadcast rate of the BYD radar, used for freshness checks.",
    dir:"—", safe:"20 (fixed)", tags:["fixed"],
    note:"NOT a request to the sensor — openpilot is a passive listener. Raising it would just make the parser think messages are late. The fusion is clocked by vision at 20 Hz anyway." },
]},

/* ══════════════════ CURVE SPEED (VTSC) ══════════════════ */
{ name: "Curve Speed Control (VTSC)", icon: "🌀", blurb:
  "Predictive: reads the model's forecast path and slows BEFORE a corner. Reduction-only — never raises your set speed, gas pedal always wins.",
  params: [
  { key:"vtsc_lat_accel", label:"VTSC comfort budget", file:F.vtsc, unit:"m/s²",
    re:/^VTSC_TARGET_LAT_ACCEL\s*=\s*([\d.]+)/m,
    what:"The cornering force VTSC plans for. Target speed = √(budget ÷ curvature). At 4.5 a 100 m bend gives 76 km/h.",
    dir:"HIGHER = intervenes LESS (only genuinely tight corners). Lower = slows more often, more nanny-ish.",
    safe:"2.7 – 4.5",
    note:"4.5 sits just under the 5.0 execution clamp, so it plans slightly inside what the controller can deliver." },

  { key:"vtsc_floor", label:"Max speed reduction", file:F.plan, unit:"fraction",
    re:/^VTSC_MAX_REDUCTION_FRAC\s*=\s*([\d.]+)/m,
    what:"Hard floor on how far below your set speed VTSC may ever ask. 0.50 = never below half.",
    dir:"Higher = allowed to slow more for tight corners.", safe:"0.35 – 0.50",
    note:"At 100 km/h set, 0.50 means a 50 km/h floor — enough for corners down to ~43 m radius." },

  { key:"vtsc_min_speed", label:"Minimum active speed", file:F.plan, unit:"m/s",
    re:/^VTSC_MIN_ACTIVE_SPEED\s*=\s*([\d.]+)/m,
    what:"Below this, VTSC does nothing at all. 8.3 m/s ≈ 30 km/h.",
    dir:"Higher = only active at speed.", safe:"8.3" },

  { key:"vtsc_rate_down", label:"Slow-down rate", file:F.plan, unit:"m/s per s",
    re:/^VTSC_RATE_DOWN\s*=\s*([\d.]+)/m,
    what:"How fast the target may fall — controls how gently it eases into a corner.",
    dir:"Higher = sheds speed faster, more noticeable.", safe:"2.0 – 3.5",
    note:"Lookahead is 6 s; at 2.5 the biggest allowed reduction takes ~5.6 s, so it's close to the limit on the tightest corners." },

  { key:"vtsc_rate_up", label:"Recovery rate", file:F.plan, unit:"m/s per s",
    re:/^VTSC_RATE_UP\s*=\s*([\d.]+)/m,
    what:"How fast the target climbs back on corner exit. The constraint releases while you're still turning, so acceleration begins on exit.",
    dir:"Higher = picks speed back up sooner.", safe:"1.0 – 1.5" },
]},

/* ══════════════════ DRIVER MONITORING ══════════════════ */
{ name: "Driver Monitoring", icon: "👁️", blurb:
  "Head pose, drowsiness and phone detection. Pose is the part actually watching whether you're looking at the road.",
  params: [
  { key:"phone_thresh", label:"Phone gate (pre-calibration)", file:F.dm, unit:"",
    re:/self\._PHONE_THRESH\s*=\s*(.+)/,
    what:"Phone-detection threshold used during the first ~60 s of a drive, before it learns your baseline.",
    dir:"Higher = far less sensitive.", safe:"0.4 – 1.0" },

  { key:"phone_thresh2", label:"Phone multiplier", file:F.dm, unit:"×",
    re:/self\._PHONE_THRESH2\s*=\s*([\d.]+)/,
    what:"After calibration the trigger is (your learned baseline, clamped 0.025–0.06) × THIS. The real phone dial.",
    dir:"Higher = much less sensitive. At 30 it effectively never fires; at 40 it's mathematically impossible.",
    safe:"15 – 30",
    note:"Raising the MIN/MAX offsets instead is unreliable — it only helps if your cabin's baseline happens to exceed the cap." },

  { key:"blink_thresh", label:"Drowsiness trigger", file:F.dm, unit:"",
    re:/self\._BLINK_THRESHOLD\s*=\s*([\d.]+)/,
    what:"Averaged blink probability that counts as drowsy. The direct eye-closure trigger.",
    dir:"Higher = far fewer drowsiness alerts.", safe:"0.865 – 0.95" },

  { key:"face_thresh", label:"Face detection confidence", file:F.dm, unit:"",
    re:/self\._FACE_THRESHOLD\s*=\s*([\d.]+)/,
    what:"Confidence needed to register your face at all.",
    dir:"⚠️ RAISING THIS BACKFIRES.", safe:"0.7 (leave it)",
    note:"A stricter gate means your face registers LESS often → drops to 30 s wheel-touch mode, treats you as unresponsive, and slows awareness recovery. Result is MORE nagging, not less. Tried 0.9, reverted." },

  { key:"distracted_time", label:"Active timeout", file:F.dm, unit:"s",
    re:/self\._DISTRACTED_TIME\s*=\s*([\d.]+)/,
    what:"Total time budget while your face is visible and pose says distracted.",
    dir:"Higher = longer before escalation.", safe:"11 – 20" },
]},

/* ══════════════════ CALIBRATION ══════════════════ */
{ name: "Calibration", icon: "📐", blurb:
  "How the device learns where it's pointing. It only samples on straight, fast road.",
  params: [
  { key:"yaw_spread", label:"Max yaw spread before reset", file:F.cal, unit:"rad",
    re:/^MAX_ALLOWED_YAW_SPREAD\s*=\s*np\.radians\((\d+)\)/m,
    what:"If measured yaw spread exceeds this while calibrated, it assumes the mount moved, resets to the previous block and goes to 'recalibrating'. Value shown is in DEGREES.",
    dir:"Higher = tolerates more variation before resetting.", safe:"2 (leave stock)",
    note:"⚠️ Do NOT widen calibration limits to silence a warning. Doing exactly that once let the car run on a bad calibration and it drifted toward the barriers." },

  { key:"inputs_needed", label:"Blocks needed", file:F.cal, unit:"blocks",
    re:/^INPUTS_NEEDED\s*=\s*(\d+)/m,
    what:"Minimum sample blocks before calibration is considered valid.",
    dir:"Lower = validates sooner on less data.", safe:"5 (leave stock)" },

  { key:"min_speed_filter", label:"Minimum sampling speed", file:F.cal, unit:"km/h",
    re:/^MIN_SPEED_FILTER\s*=\s*(\d+)\s*\*\s*CV\.KPH_TO_MS/m,
    what:"Calibration only collects samples above this speed AND with yaw rate under 2°/s — i.e. straight, fast road only.",
    dir:"—", safe:"30 (leave stock)" },
]},

/* ══════════════════ PANDA ══════════════════ */
{ name: "Panda Safety (read-only)", icon: "🔒", blurb:
  "The safety microcontroller. Your device NEVER compiles this from source — it flashes Kommu's committed binary, so editing byd.h does nothing.",
  params: [
  { key:"panda_spoof", label:"Atto 3 torque spoof", file:F.panda, unit:"",
    re:/if \(param == 1U\) \{[\s\S]{0,200}?(byd_steering_torque_spoof = true|\/\* default cfg already selected \*\/)/,
    what:"With param 1 the panda BLOCKS the real steering-torque message (0x1FC) from reaching the camera, so openpilot's spoof is a clean substitution rather than a collision. This is Kommu's hands-on-wheel-beep fix.",
    dir:"—", safe:"—", tags:["panda"],
    note:"Our older base had an EMPTY param-1 branch — which is why porting just the Python spoof broke LKS: the camera got the real message AND the fake one." },

  { key:"panda_rate", label:"Panda rate ceiling", file:F.panda, unit:"°/frame",
    re:/angle_rate_up_lookup\s*=\s*\{\{[^}]*\},\s*(\{[^}]*\})/,
    what:"Hard ceiling on steering rate, enforced in firmware regardless of what openpilot asks. The real backstop.",
    dir:"—", safe:"—", tags:["panda"] },
]},
];
