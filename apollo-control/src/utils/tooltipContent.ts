export interface TooltipInfo {
  title: string;
  description: string;
}

/**
 * Tooltip content for each section card, keyed by section name.
 * Section names come from the device tree group labels (e.g. "HP 1", "Analog 2").
 */
export const SECTION_TOOLTIPS: Record<string, TooltipInfo> = {
  Monitor: {
    title: "Monitor Output",
    description:
      "Main stereo output bus feeding your studio monitors. Controls here only affect what you hear — not what gets recorded. Adjust Level to set your listening volume without touching recording gain.",
  },
  "Analog 1": {
    title: "Analog Input 1",
    description:
      "First preamp channel. Accepts mic (XLR) or line/instrument (TRS) input. Preamp Gain, 48V, Pad, and Low Cut are applied before the A/D converter — these settings affect what is actually recorded.",
  },
  "Analog 2": {
    title: "Analog Input 2",
    description:
      "Second preamp channel, identical to Analog 1. Record two sources simultaneously — a vocalist and guitar, two mics on a drum kit, or a stereo synthesizer output.",
  },
  "HP 1": {
    title: "Headphone Output 1",
    description:
      "First built-in headphone amplifier on the Apollo Solo. Feed a performer a custom cue mix during tracking. HP 1's mix is completely independent from what plays through your studio monitors.",
  },
  "HP 2": {
    title: "Headphone Output 2",
    description:
      "Second built-in headphone amplifier. Provides an independent mix for a second performer or engineer — each person can hear a different blend at their own volume.",
  },
  "Aux 1": {
    title: "Auxiliary Output 1",
    description:
      "First auxiliary output bus. Create a separate mix of inputs and DAW playback routed to a different destination — typically HP 1 for performer cue mixes or an external effects processor.",
  },
  "Aux 2": {
    title: "Auxiliary Output 2",
    description:
      "Second auxiliary output bus. Build a second independent mix for a second performer or for parallel effects processing.",
  },
};

/**
 * Tooltip content for individual controls, keyed by "Group/Label".
 * Labels and groups come directly from the device tree in lib.rs.
 */
export const CONTROL_TOOLTIPS: Record<string, TooltipInfo> = {
  // ── Monitor ──────────────────────────────────────────────────────────
  "Monitor/Monitor Level": {
    title: "Monitor Level",
    description:
      "Master output volume sent to your studio monitors, in dB. Only affects listening volume — has no effect on recordings. Range: −96 to 0 dB.",
  },
  "Monitor/Dim Attenuation": {
    title: "Dim Attenuation",
    description:
      "How much the volume drops when Dim is engaged, expressed as dB of attenuation. Set once (e.g. 20 dB) so toggling Dim always ducks to a predictable level without disturbing your Monitor Level. Range: 0 to 96 dB.",
  },
  "Monitor/Mute": {
    title: "Monitor Mute",
    description:
      "Silences all monitor output entirely. Useful for phone calls, talking to a vocalist in the booth, or critical listening in silence. Recordings are unaffected.",
  },
  "Monitor/Dim": {
    title: "Dim",
    description:
      "Temporarily reduces monitor volume by the Dim Attenuation amount. Toggle on to duck speakers for a conversation, then off to instantly return to your set level — no need to adjust the Level knob.",
  },
  "Monitor/Mono": {
    title: "Mono Sum",
    description:
      "Sums both stereo channels to mono, playing the same signal through both speakers. Essential for checking mix translation to mono playback devices: phones, TV speakers, Bluetooth, and many club systems.",
  },
  "Monitor/Alt Monitor": {
    title: "Alternate Monitor",
    description:
      "Routes output to a second pair of studio monitors connected to the Apollo's Alt outputs. Use to A/B compare how a mix sounds on different speakers without re-patching cables.",
  },

  // ── Analog 1 ─────────────────────────────────────────────────────────
  "Analog 1/Gain": {
    title: "Preamp Gain",
    description:
      "Analog amplification applied before the A/D converter. Set high enough for a healthy signal without clipping the preamp. Starting points: condenser mics 40–55 dB, dynamic mics 55–65 dB, line-level sources 0–20 dB.",
  },
  "Analog 1/Fader": {
    title: "Channel Fader",
    description:
      "Post-preamp digital fader controlling this channel's level in monitor and headphone mixes. Does not affect what is recorded — only what you and the performer hear. Range: −144 to +6 dB.",
  },
  "Analog 1/Pan": {
    title: "Pan",
    description:
      "Stereo position of this channel in the monitor mix. Center (0) places the signal equally in both speakers. Hard left (−1) or hard right (+1) sends it entirely to one speaker.",
  },
  "Analog 1/Mute": {
    title: "Channel Mute",
    description:
      "Silences this input in monitor and headphone mixes. The signal is still recorded in your DAW — this only affects monitoring during tracking.",
  },
  "Analog 1/Solo": {
    title: "Solo",
    description:
      "Mutes all other channels so you can hear only this input in isolation. Useful for checking a source for noise, correct signal level, or pops.",
  },
  "Analog 1/48V": {
    title: "Phantom Power (+48V)",
    description:
      "+48V DC sent through the XLR connector to power condenser microphones. Only enable when your mic requires it — condenser mics need it; most dynamic and ribbon mics do not, and some ribbon mics can be damaged.",
  },
  "Analog 1/Pad": {
    title: "Pad (−20 dB)",
    description:
      "Inserts a passive −20 dB attenuator before the preamp circuit. Use when recording very loud sources — a cranked guitar amp, close-miked kick or snare, or a line-level synthesizer — that clips the preamp at minimum gain.",
  },
  "Analog 1/Low Cut": {
    title: "Low Cut Filter",
    description:
      "Applies a high-pass filter removing low-frequency content below ~75 Hz. Reduces room rumble, HVAC noise, and mic handling noise. Commonly used on vocals, acoustic guitar, and any source that doesn't need sub-bass.",
  },
  "Analog 1/Phase": {
    title: "Phase Invert (180°)",
    description:
      "Flips the polarity of the signal by 180°. Use when combining two mics on the same source (e.g., kick drum inside + outside) that cause cancellation, or to correct polarity issues from certain mics or cable wiring.",
  },

  // ── Analog 2 ─────────────────────────────────────────────────────────
  "Analog 2/Gain": {
    title: "Preamp Gain",
    description:
      "Analog amplification applied before the A/D converter. Set high enough for a healthy signal without clipping the preamp. Starting points: condenser mics 40–55 dB, dynamic mics 55–65 dB, line-level sources 0–20 dB.",
  },
  "Analog 2/Fader": {
    title: "Channel Fader",
    description:
      "Post-preamp digital fader controlling this channel's level in monitor and headphone mixes. Does not affect what is recorded — only what you and the performer hear. Range: −144 to +6 dB.",
  },
  "Analog 2/Pan": {
    title: "Pan",
    description:
      "Stereo position of this channel in the monitor mix. Center (0) places the signal equally in both speakers. Hard left (−1) or hard right (+1) sends it entirely to one speaker.",
  },
  "Analog 2/Mute": {
    title: "Channel Mute",
    description:
      "Silences this input in monitor and headphone mixes. The signal is still recorded in your DAW — this only affects monitoring during tracking.",
  },
  "Analog 2/Solo": {
    title: "Solo",
    description:
      "Mutes all other channels so you can hear only this input in isolation. Useful for checking a source for noise, correct signal level, or pops.",
  },
  "Analog 2/48V": {
    title: "Phantom Power (+48V)",
    description:
      "+48V DC sent through the XLR connector to power condenser microphones. Only enable when your mic requires it — condenser mics need it; most dynamic and ribbon mics do not, and some ribbon mics can be damaged.",
  },
  "Analog 2/Pad": {
    title: "Pad (−20 dB)",
    description:
      "Inserts a passive −20 dB attenuator before the preamp circuit. Use when recording very loud sources — a cranked guitar amp, close-miked kick or snare, or a line-level synthesizer — that clips the preamp at minimum gain.",
  },
  "Analog 2/Low Cut": {
    title: "Low Cut Filter",
    description:
      "Applies a high-pass filter removing low-frequency content below ~75 Hz. Reduces room rumble, HVAC noise, and mic handling noise. Commonly used on vocals, acoustic guitar, and any source that doesn't need sub-bass.",
  },
  "Analog 2/Phase": {
    title: "Phase Invert (180°)",
    description:
      "Flips the polarity of the signal by 180°. Use when combining two mics on the same source (e.g., kick drum inside + outside) that cause cancellation, or to correct polarity issues from certain mics or cable wiring.",
  },

  // ── HP 1 ─────────────────────────────────────────────────────────────
  "HP 1/Level": {
    title: "Headphone Volume",
    description:
      "Output level of headphone amplifier 1. Controls how loud the performer hears their cue mix. Fully independent from monitor level. Range: −96 to 0 dB.",
  },
  "HP 1/Mute": {
    title: "Headphone Mute",
    description:
      "Silences headphone output 1 without touching the Level knob. Use to cut the performer's feed between takes, during talkback, or when swapping patches.",
  },

  // ── HP 2 ─────────────────────────────────────────────────────────────
  "HP 2/Level": {
    title: "Headphone Volume",
    description:
      "Output level of headphone amplifier 2. Controls how loud the performer hears their cue mix. Fully independent from monitor level and HP 1. Range: −96 to 0 dB.",
  },
  "HP 2/Mute": {
    title: "Headphone Mute",
    description:
      "Silences headphone output 2 without touching the Level knob. Use to cut the performer's feed between takes, during talkback, or when swapping patches.",
  },

  // ── Aux 1 ────────────────────────────────────────────────────────────
  "Aux 1/Fader": {
    title: "Aux 1 Output Level",
    description:
      "Master output level for Auxiliary Bus 1. Controls the overall volume sent from this bus to its routed destination (e.g., HP 1 or an outboard processor). Range: −144 to +6 dB.",
  },
  "Aux 1/Mute": {
    title: "Aux Mute",
    description:
      "Silences Auxiliary Bus 1 output entirely. Cuts the whole cue mix fed by this bus without adjusting individual send levels.",
  },

  // ── Aux 2 ────────────────────────────────────────────────────────────
  "Aux 2/Fader": {
    title: "Aux 2 Output Level",
    description:
      "Master output level for Auxiliary Bus 2. Controls the overall volume sent from this bus to its routed destination. Range: −144 to +6 dB.",
  },
  "Aux 2/Mute": {
    title: "Aux Mute",
    description:
      "Silences Auxiliary Bus 2 output entirely. Cuts the whole cue mix fed by this bus without adjusting individual send levels.",
  },
};

/** Returns tooltip info for a control identified by group name and control label. */
export function getControlTooltip(group: string, label: string): TooltipInfo | null {
  return CONTROL_TOOLTIPS[`${group}/${label}`] ?? null;
}

/** Returns tooltip info for a section card by its display name. */
export function getSectionTooltip(sectionName: string): TooltipInfo | null {
  return SECTION_TOOLTIPS[sectionName] ?? null;
}
