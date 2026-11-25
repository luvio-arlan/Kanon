#!/usr/bin/env swift
// KANON (卡农) — Authentic Johann Pachelbel's Canon in D Major Chamber Orchestra Renderer.
// Renders studio-grade 48 kHz stereo audio via macOS CoreAudio AVAudioEngine + Apple DLS SoundBank
// with separate Acoustic Piano/Harp & Warm-Filtered Bowed Strings submix buses into a Concert Hall.
//
// Usage: swift canon_orchestra.swift <web|github> <output.wav>

import AVFoundation
import Foundation

struct MidiEvent {
    let time: Double
    let track: Int       // 0=Piano, 1=Harp, 2=Violin1, 3=Violin2, 4=Cello, 5=SlowStrings
    let kind: Int        // 0=noteOn, 1=noteOff, 2=cc
    let data1: UInt8     // note or cc number
    let data2: UInt8     // velocity or cc value
}

final class CanonComposer {
    var events: [MidiEvent] = []
    private var rngState: UInt64 = 20261125

    private func jitter(_ maxAbs: Double) -> Double {
        rngState = rngState &* 6364136223846793005 &+ 1442695040888963407
        let u = Double((rngState >> 33) & 0x7FFFFFFF) / Double(0x7FFFFFFF)
        return (u * 2.0 - 1.0) * maxAbs
    }

    func note(_ track: Int, _ start: Double, _ dur: Double, _ pitch: Int, _ vel: Int, humanize: Double = 0.005, maxEnd: Double? = nil) {
        let t0 = max(0.0, start + jitter(humanize))
        var t1 = max(t0 + 0.04, t0 + dur)
        if let limit = maxEnd {
            t1 = max(t0 + 0.035, min(t1, limit))
        }
        let v = UInt8(max(1, min(127, vel + Int(jitter(3.5)))))
        let p = UInt8(max(0, min(127, pitch)))
        events.append(MidiEvent(time: t0, track: track, kind: 0, data1: p, data2: v))
        events.append(MidiEvent(time: t1, track: track, kind: 1, data1: p, data2: 0))
    }

    func cc(_ track: Int, _ at: Double, _ controller: UInt8, _ value: UInt8) {
        events.append(MidiEvent(time: max(0.0, at), track: track, kind: 2, data1: controller, data2: value))
    }

    func sustain(_ track: Int, _ at: Double, _ down: Bool) {
        cc(track, at, 64, down ? 127 : 0)
    }

    func expressionArc(_ track: Int, start: Double, dur: Double, low: Int, peak: Int, end: Int) {
        let steps = 8
        for i in 0...steps {
            let u = Double(i) / Double(steps)
            let val: Double
            if u < 0.55 {
                let k = u / 0.55
                val = Double(low) + Double(peak - low) * sin(k * Double.pi * 0.5)
            } else {
                let k = (u - 0.55) / 0.45
                val = Double(peak) + Double(end - peak) * (0.5 - 0.5 * cos(k * Double.pi))
            }
            cc(track, start + u * dur, 11, UInt8(max(1, min(127, Int(val)))))
        }
    }

    // Authentic 8-chord Pachelbel Canon in D progression: D - A - Bm - F#m - G - D - G - A
    static let celloCycle1 = [50, 45, 47, 42, 43, 38, 43, 45] // D3 A2 B2 F#2 G2 D2 G2 A2 (clean separation from Piano D3)
    static let celloRich   = [50, 45, 47, 42, 43, 38, 43, 45]

    static let chordArps: [[Int]] = [
        [50, 57, 62, 66, 69, 66, 62, 57], // D:   D3 A3 D4 F#4 A4 F#4 D4 A3
        [45, 52, 57, 61, 64, 61, 57, 52], // A:   A2 E3 A3 C#4 E4 C#4 A3 E3
        [47, 54, 59, 62, 66, 62, 59, 54], // Bm:  B2 F#3 B3 D4 F#4 D4 B3 F#3
        [42, 49, 54, 57, 61, 57, 54, 49], // F#m: F#2 C#3 F#3 A3 C#4 A3 F#3 C#3
        [43, 50, 55, 59, 62, 59, 55, 50], // G:   G2 D3 G3 B3 D4 B3 G3 D3
        [50, 54, 57, 62, 66, 62, 57, 54], // D:   D3 F#3 A3 D4 F#4 D4 A3 F#3
        [43, 50, 55, 59, 62, 67, 62, 59], // G:   G2 D3 G3 B3 D4 G4 D4 B3
        [45, 52, 57, 61, 64, 69, 64, 61], // A:   A2 E3 A3 C#4 E4 A4 E4 C#4
    ]
    static let stringChords: [[Int]] = [
        [62, 66, 69], // D4 F#4 A4
        [61, 64, 69], // C#4 E4 A4
        [62, 66, 71], // D4 F#4 B4
        [61, 66, 69], // C#4 F#4 A4
        [62, 67, 71], // D4 G4 B4
        [62, 66, 69], // D4 F#4 A4
        [62, 67, 71], // D4 G4 B4
        [61, 64, 69], // C#4 E4 A4
    ]

    // Iconic Canon Theme A (immortal descending melody): F#5 E5 D5 C#5 B4 A4 B4 C#5
    static let themeA = [78, 76, 74, 73, 71, 69, 71, 73]
    // Iconic Canon Theme B (pure parallel thirds harmony): D5 C#5 B4 A4 G4 F#4 G4 E4
    static let themeB = [74, 73, 71, 69, 67, 66, 67, 64]

    // Iconic Pachelbel Flowing 8th-Note Motif (100% pure harmony on every chord, Bar 7 stays pure G major)
    static let themeC8: [[Int]] = [
        [78, 74, 76, 78], // D:   F#5 D5 E5 F#5
        [76, 73, 74, 76], // A:   E5 C#5 D5 E5
        [74, 71, 73, 74], // Bm:  D5 B4 C#5 D5
        [73, 69, 71, 73], // F#m: C#5 A4 B4 C#5
        [71, 67, 69, 71], // G:   B4 G4 A4 B4
        [69, 66, 69, 74], // D:   A4 F#4 A4 D5
        [71, 74, 79, 74], // G:   B4 D5 G5 D5 (pure G major!)
        [76, 73, 76, 81], // A:   E5 C#5 E5 A5
    ]

    // Iconic Pachelbel Climax 16th-Note Joyful Waterfall (pure D major scale cascades, zero clashes)
    static let themeClimax16: [[Int]] = [
        [78, 74, 76, 78, 74, 76, 78, 76], // D
        [76, 73, 74, 76, 78, 79, 81, 79], // A
        [78, 74, 76, 78, 71, 73, 74, 76], // Bm
        [73, 74, 73, 71, 73, 69, 71, 73], // F#m
        [71, 74, 73, 71, 69, 67, 69, 71], // G
        [69, 66, 67, 69, 71, 73, 74, 76], // D (iconic rising scale!)
        [74, 79, 78, 79, 81, 79, 74, 71], // G (pure G-B-D peak)
        [76, 78, 79, 81, 83, 85, 81, 85], // A -> triumphant D6 resolution!
    ]

    func initBowedExpression() {
        // Gentle vibrato (CC 1) and warm starting expression (CC 11) on bowed strings
        for t in [2, 3, 4, 5] {
            cc(t, 0.0, 1, 36)
            cc(t, 0.0, 11, 88)
        }
    }

    func addAccompanimentCycle(start: Double, chordDur: Double, density: Int, intensity: Double) {
        let eighth = chordDur / 4.0
        let sixteenth = chordDur / 8.0

        // Expressive breathing phrase arcs every 2 chords across bowed instruments
        for pair in 0..<4 {
            let pt = start + Double(pair * 2) * chordDur
            expressionArc(4, start: pt, dur: chordDur * 2.0, low: 82, peak: 108, end: 88)
            if density >= 2 {
                expressionArc(2, start: pt, dur: chordDur * 2.0, low: 84, peak: 112, end: 90)
                expressionArc(3, start: pt, dur: chordDur * 2.0, low: 78, peak: 104, end: 84)
                expressionArc(5, start: pt, dur: chordDur * 2.0, low: 74, peak: 98, end: 78)
            }
        }

        for c in 0..<8 {
            let ct = start + Double(c) * chordDur
            let chordLimit = ct + chordDur - 0.048 // Strictly prevents ANY note bleed across chord changes!
            let arp = Self.chordArps[c]

            // Crisp sustain pedal clear before each chord change -> pristine Baroque transparency!
            sustain(0, max(0.0, ct - 0.042), false)
            sustain(0, ct + 0.018, true)
            sustain(1, max(0.0, ct - 0.042), false)
            sustain(1, ct + 0.018, true)

            // Warm Acoustic Cello Ground Bass (clean, grounded, noble)
            let celloPitch = density == 1 ? Self.celloCycle1[c] : Self.celloRich[c]
            note(4, ct, chordDur * 0.94, celloPitch, Int(78 * intensity), humanize: 0.004, maxEnd: chordLimit)

            if density == 1 {
                // Cycle 1: Luminous George-Winston style flowing 4-note Concert Piano + Harp shimmer
                for step in 0..<4 {
                    let tNote = ct + Double(step) * eighth
                    let vel = (step == 0 ? 84 : 68)
                    note(0, tNote, eighth * 1.45, arp[step], Int(Double(vel) * intensity), humanize: 0.005, maxEnd: chordLimit)
                }
                note(1, ct, eighth * 2.4, arp[2] + 12, Int(62 * intensity), humanize: 0.006, maxEnd: chordLimit)
                note(1, ct + eighth * 2.0, eighth * 1.8, arp[3] + 12, Int(54 * intensity), humanize: 0.006, maxEnd: chordLimit)
            } else {
                // Cycle 2 & 3: Sparkling 8-note Piano waterfall + flowing sunlit Orchestral Harp
                for step in 0..<8 {
                    let tNote = ct + Double(step) * sixteenth
                    let accent = step == 0 ? 88.0 : (step == 4 ? 78.0 : 66.0)
                    note(0, tNote, sixteenth * 1.85, arp[step], Int(accent * intensity), humanize: 0.004, maxEnd: chordLimit)
                }
                for step in 0..<4 {
                    let tNote = ct + Double(step) * eighth
                    note(1, tNote, eighth * 1.55, arp[step + 1] + 12, Int(62 * intensity), humanize: 0.006, maxEnd: chordLimit)
                }
            }

            // Subtle warm Slow Strings halo in Cycle 2 & 3 (low foreground presence, zero muddy synth!)
            if density >= 2 {
                let padVel = Int((density == 3 ? 58.0 : 46.0) * intensity)
                for p in Self.stringChords[c] {
                    note(5, ct, chordDur * 0.95, p, padVel, humanize: 0.004, maxEnd: chordLimit)
                }
            }
        }
    }

    func addFinaleCoda(start: Double, end: Double) {
        let heldDur = max(0.85, (end - start) - 0.92) // Bowed strings release cleanly before tail so reverb blooms naturally!
        sustain(0, max(0.0, start - 0.042), false)
        sustain(0, start + 0.018, true)
        sustain(1, max(0.0, start - 0.042), false)
        sustain(1, start + 0.018, true)

        expressionArc(4, start: start, dur: heldDur, low: 92, peak: 102, end: 36)
        expressionArc(5, start: start, dur: heldDur, low: 88, peak: 98, end: 28)
        expressionArc(2, start: start, dur: heldDur, low: 94, peak: 104, end: 32)
        expressionArc(3, start: start, dur: heldDur, low: 86, peak: 96, end: 28)

        // Radiant D Major Cadence: D3 - A3 - D4 - F#4 - A4 - D5 - F#5 - D6
        note(4, start, heldDur, 50, 80, humanize: 0.003) // Cello D3
        for p in [62, 66, 69, 74] {
            note(5, start, heldDur, p, 56, humanize: 0.004) // Slow Strings D Major
        }
        note(2, start, heldDur, 86, 82, humanize: 0.004) // Violin I D6
        note(3, start, heldDur, 78, 74, humanize: 0.004) // Violin II F#5

        // Sparkling ascending Concert Piano + Orchestral Harp final arpeggio letting hall reverb shimmer out
        let finalArp = [50, 57, 62, 66, 69, 74, 78, 86]
        let arpEnd = end - 0.12
        for (idx, p) in finalArp.enumerated() {
            let t = start + Double(idx) * 0.064
            note(0, t, max(0.55, arpEnd - t), p, 86 - idx * 2, humanize: 0.004, maxEnd: arpEnd)
            if idx >= 2 {
                note(1, t + 0.025, max(0.55, arpEnd - t), p, 74 - idx * 2, humanize: 0.004, maxEnd: arpEnd)
            }
        }
        sustain(0, end - 0.08, false)
        sustain(1, end - 0.08, false)
    }

    func composeWeb36() -> Double {
        initBowedExpression()
        let chordDur = 1.40
        let c1 = 0.14
        let c2 = c1 + 8.0 * chordDur // 11.34s (exact Cockpit Light/Dark optical wipe!)
        let c3 = c2 + 8.0 * chordDur // 22.54s (soars across Valuation 5x5 climax & AI IC!)
        let coda = c3 + 8.0 * chordDur // 33.74s (KANON Monogram Finale!)

        // CYCLE 1 (0.14 - 11.34s): Pure Intimate Acoustic Grand Piano, Sparkling Harp & Warm Cello
        addAccompanimentCycle(start: c1, chordDur: chordDur, density: 1, intensity: 0.80)
        for c in 0..<8 {
            let ct = c1 + Double(c) * chordDur
            let lim = ct + chordDur - 0.048
            // Concert Piano right hand sings the iconic Canon Theme A with luminous grace!
            note(0, ct, chordDur * 0.92, Self.themeA[c], 86, humanize: 0.004, maxEnd: lim)
            // Warm octave/third shadow on half-bar for poetic depth
            note(0, ct + chordDur * 0.50, chordDur * 0.44, Self.themeB[c], 64, humanize: 0.005, maxEnd: lim)
        }

        // CYCLE 2 (11.34 - 22.54s): Warm Filtered Violins Join Piano & Harp in True Contrapuntal Polyphony!
        addAccompanimentCycle(start: c2, chordDur: chordDur, density: 2, intensity: 0.95)
        let eighth = chordDur / 4.0
        for c in 0..<8 {
            let ct = c2 + Double(c) * chordDur
            let lim = ct + chordDur - 0.048
            // Violin I + Piano sparkle play the beloved flowing 8th-note Canon melody
            for (s, p) in Self.themeC8[c].enumerated() {
                let tn = ct + Double(s) * eighth
                note(2, tn, eighth * 0.92, p, s == 0 ? 84 : 74, humanize: 0.004, maxEnd: lim)
                if s == 0 || s == 2 {
                    note(0, tn, eighth * 1.3, p, 72, humanize: 0.004, maxEnd: lim)
                }
            }
            // Violin II strictly monophonic singing Theme B (pure parallel thirds harmony!)
            note(3, ct, chordDur * 0.92, Self.themeB[c], 74, humanize: 0.004, maxEnd: lim)
        }

        // CYCLE 3 (22.54 - 33.74s): Joyful Radiant Chamber Orchestra Climax (16th-Note Pachelbel Waterfall!)
        addAccompanimentCycle(start: c3, chordDur: chordDur, density: 3, intensity: 1.04)
        let sixteenth = chordDur / 8.0
        for c in 0..<8 {
            let ct = c3 + Double(c) * chordDur
            let lim = ct + chordDur - 0.048
            // Violin I plays smooth legato 16th-note Pachelbel cascade while Piano shimmers on even 16ths!
            for (s, p) in Self.themeClimax16[c].enumerated() {
                let tn = ct + Double(s) * sixteenth
                note(2, tn, sixteenth * 1.15, p, s % 4 == 0 ? 86 : 74, humanize: 0.003, maxEnd: lim)
                if s % 2 == 0 {
                    note(0, tn, eighth * 1.1, p, s % 4 == 0 ? 78 : 64, humanize: 0.004, maxEnd: lim)
                }
            }
            // Violin II weaves pure aligned Theme C8 counterpoint (100% consonant on every beat!)
            for (s, p) in Self.themeC8[c].enumerated() {
                let tn = ct + Double(s) * eighth
                note(3, tn, eighth * 1.04, p, 74, humanize: 0.004, maxEnd: lim)
            }
        }

        addFinaleCoda(start: coda, end: 36.0)
        return 36.0
    }

    func composeGithub22() -> Double {
        initBowedExpression()
        let chordDur = 1.25
        let c1 = 0.12
        let c2 = c1 + 8.0 * chordDur // 10.12s (Valuation & 5x5 Matrix Climax!)
        let coda = c2 + 8.0 * chordDur // 20.12s (KANON Monogram Finale!)

        // CYCLE 1 (0.12 - 10.12s): Crisp Sunlit Piano + Harp + Cello singing iconic Theme A
        addAccompanimentCycle(start: c1, chordDur: chordDur, density: 1, intensity: 0.84)
        let eighth = chordDur / 4.0
        for c in 0..<8 {
            let ct = c1 + Double(c) * chordDur
            let lim = ct + chordDur - 0.048
            note(0, ct, chordDur * 0.92, Self.themeA[c], 88, humanize: 0.004, maxEnd: lim)
            if c >= 4 {
                // Warm strings & Violin II glide in smoothly from bar 5 (G major lift!)
                note(3, ct, chordDur * 0.92, Self.themeB[c], 72, humanize: 0.004, maxEnd: lim)
                for p in Self.stringChords[c] {
                    note(5, ct, chordDur * 0.92, p, 44, humanize: 0.004, maxEnd: lim)
                }
            } else {
                note(0, ct + chordDur * 0.50, chordDur * 0.44, Self.themeB[c], 66, humanize: 0.005, maxEnd: lim)
            }
        }

        // CYCLE 2 (10.12 - 20.12s): Full Joyful Chamber Orchestra Climax (16th-Note Pachelbel Waterfall!)
        addAccompanimentCycle(start: c2, chordDur: chordDur, density: 3, intensity: 1.04)
        let sixteenth = chordDur / 8.0
        for c in 0..<8 {
            let ct = c2 + Double(c) * chordDur
            let lim = ct + chordDur - 0.048
            for (s, p) in Self.themeClimax16[c].enumerated() {
                let tn = ct + Double(s) * sixteenth
                note(2, tn, sixteenth * 1.15, p, s % 4 == 0 ? 86 : 74, humanize: 0.003, maxEnd: lim)
                if s % 2 == 0 {
                    note(0, tn, eighth * 1.1, p, s % 4 == 0 ? 78 : 64, humanize: 0.004, maxEnd: lim)
                }
            }
            for (s, p) in Self.themeC8[c].enumerated() {
                let tn = ct + Double(s) * eighth
                note(3, tn, eighth * 1.04, p, 74, humanize: 0.004, maxEnd: lim)
            }
        }

        addFinaleCoda(start: coda, end: 22.0)
        return 22.0
    }
}

func renderCanon(edition: String, outPath: String) throws {
    let composer = CanonComposer()
    let duration = edition == "github" ? composer.composeGithub22() : composer.composeWeb36()
    let sortedEvents = composer.events.sorted { $0.time < $1.time }

    let dlsURL = URL(fileURLWithPath: "/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls")
    let engine = AVAudioEngine()
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!

    // Dedicated submixers (CRITICAL: AVAudioUnitReverb has only 1 input bus, so all instruments MUST sum in AVAudioMixerNode first!)
    let pianoHarpMixer = AVAudioMixerNode()
    let stringsMixer = AVAudioMixerNode()
    let masterSubmix = AVAudioMixerNode()

    // Dedicated Warm Wood Filter EQ on Bowed Strings Bus ONLY (eliminates Apple DLS solo violin nasal fizz!)
    let stringsEQ = AVAudioUnitEQ(numberOfBands: 3)
    stringsEQ.bands[0].filterType = .parametric
    stringsEQ.bands[0].frequency = 240.0
    stringsEQ.bands[0].bandwidth = 1.2
    stringsEQ.bands[0].gain = 1.5
    stringsEQ.bands[0].bypass = false

    stringsEQ.bands[1].filterType = .parametric
    stringsEQ.bands[1].frequency = 3100.0
    stringsEQ.bands[1].bandwidth = 1.1
    stringsEQ.bands[1].gain = -3.8
    stringsEQ.bands[1].bypass = false

    stringsEQ.bands[2].filterType = .highShelf
    stringsEQ.bands[2].frequency = 8200.0
    stringsEQ.bands[2].gain = -3.5
    stringsEQ.bands[2].bypass = false

    let reverb = AVAudioUnitReverb()
    reverb.loadFactoryPreset(.mediumHall2)
    reverb.wetDryMix = 23.0 // Sunlit chamber hall air

    for node in [pianoHarpMixer, stringsMixer, stringsEQ, masterSubmix, reverb] as [AVAudioNode] {
        engine.attach(node)
    }

    // Audio Graph:
    //   [Piano, Harp] -> pianoHarpMixer --------------------> masterSubmix -> reverb -> mainMixerNode
    //   [Violin1, Violin2, Cello, SlowStrings] -> stringsMixer -> stringsEQ -> masterSubmix
    engine.connect(pianoHarpMixer, to: masterSubmix, format: format)
    engine.connect(stringsMixer, to: stringsEQ, format: format)
    engine.connect(stringsEQ, to: masterSubmix, format: format)
    engine.connect(masterSubmix, to: reverb, format: format)
    engine.connect(reverb, to: engine.mainMixerNode, format: format)

    // 6 dedicated studio acoustic instruments:
    // 0: Concert Grand Piano (GM 0)  -> pianoHarpMixer
    // 1: Orchestral Harp     (GM 46) -> pianoHarpMixer
    // 2: Solo Violin I       (GM 40) -> stringsMixer (warm-filtered)
    // 3: Solo Violin II      (GM 40) -> stringsMixer (warm-filtered)
    // 4: Acoustic Cello      (GM 42) -> stringsMixer (warm-filtered)
    // 5: Slow Strings Halo   (GM 49) -> stringsMixer (warm-filtered)
    let specs: [(program: UInt8, vol: Float, pan: Float, isString: Bool)] = [
        (0,  0.98, -0.10, false), // Concert Grand Piano (Hero Voice!)
        (46, 0.74,  0.26, false), // Sparkling Orchestral Harp
        (40, 0.46, -0.26, true),  // Warm Filtered Violin I (silky legato!)
        (40, 0.42,  0.28, true),  // Warm Filtered Violin II
        (42, 0.88,  0.00, true),  // Noble Acoustic Cello
        (49, 0.30,  0.04, true),  // Silky Slow Strings Halo
    ]

    var samplers: [AVAudioUnitSampler] = []
    for sp in specs {
        let s = AVAudioUnitSampler()
        engine.attach(s)
        engine.connect(s, to: sp.isString ? stringsMixer : pianoHarpMixer, format: format)
        s.volume = sp.vol
        s.pan = sp.pan
        samplers.append(s)
    }

    // Verify all 6 instruments are genuinely routed!
    for (idx, s) in samplers.enumerated() {
        let pts = engine.outputConnectionPoints(for: s, outputBus: 0)
        precondition(pts.count == 1, "Sampler \(idx) disconnected!")
    }

    let maxFrames: AVAudioFrameCount = 1024
    try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: maxFrames)
    try engine.start()

    for (idx, sp) in specs.enumerated() {
        try samplers[idx].loadSoundBankInstrument(
            at: dlsURL,
            program: sp.program,
            bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB),
            bankLSB: UInt8(kAUSampler_DefaultBankLSB)
        )
    }

    let sampleRate = 48000.0
    let totalFrames = Int(duration * sampleRate)
    let blockFrames = 256
    var leftSamples = [Float](repeating: 0, count: totalFrames)
    var rightSamples = [Float](repeating: 0, count: totalFrames)
    let renderBuf = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: AVAudioFrameCount(blockFrames))!

    var evIdx = 0
    var curFrame = 0
    while curFrame < totalFrames {
        let curTime = Double(curFrame) / sampleRate
        while evIdx < sortedEvents.count && sortedEvents[evIdx].time <= curTime {
            let ev = sortedEvents[evIdx]
            let s = samplers[ev.track]
            if ev.kind == 0 {
                s.startNote(ev.data1, withVelocity: ev.data2, onChannel: 0)
            } else if ev.kind == 1 {
                s.stopNote(ev.data1, onChannel: 0)
            } else if ev.kind == 2 {
                s.sendController(ev.data1, withValue: ev.data2, onChannel: 0)
            }
            evIdx += 1
        }
        let n = min(blockFrames, totalFrames - curFrame)
        let status = try engine.renderOffline(AVAudioFrameCount(n), to: renderBuf)
        if status == .success, let ch = renderBuf.floatChannelData {
            for i in 0..<n {
                leftSamples[curFrame + i] = ch[0][i]
                rightSamples[curFrame + i] = ch[1][i]
            }
        }
        curFrame += n
    }

    // Clean peak staging (-2.0 dBFS headroom, zero clipping!) + warm breathing fade-out
    let fadeIn = Int(0.08 * sampleRate)
    let fadeOut = Int(0.58 * sampleRate)
    var peak: Float = 1e-6
    for i in 0..<totalFrames {
        peak = max(peak, abs(leftSamples[i]), abs(rightSamples[i]))
    }
    let gain: Float = 0.80 / peak

    var pcmData = Data(count: totalFrames * 4)
    pcmData.withUnsafeMutableBytes { raw in
        let dst = raw.bindMemory(to: Int16.self)
        for i in 0..<totalFrames {
            var env: Float = 1.0
            if i < fadeIn {
                env = Float(i) / Float(fadeIn)
            }
            let rem = totalFrames - 1 - i
            if rem < fadeOut {
                env *= Float(0.5 - 0.5 * cos(Double.pi * Double(rem) / Double(fadeOut)))
            }
            let l = max(-1.0, min(1.0, leftSamples[i] * gain * env))
            let r = max(-1.0, min(1.0, rightSamples[i] * gain * env))
            dst[i * 2] = Int16(l * 32767.0)
            dst[i * 2 + 1] = Int16(r * 32767.0)
        }
    }

    let dataSize = UInt32(pcmData.count)
    var wav = Data()
    func appendLE(_ v: UInt32) { var x = v.littleEndian; wav.append(Data(bytes: &x, count: 4)) }
    func appendLE16(_ v: UInt16) { var x = v.littleEndian; wav.append(Data(bytes: &x, count: 2)) }
    wav.append("RIFF".data(using: .ascii)!)
    appendLE(36 + dataSize)
    wav.append("WAVE".data(using: .ascii)!)
    wav.append("fmt ".data(using: .ascii)!)
    appendLE(16)
    appendLE16(1)
    appendLE16(2)
    appendLE(48000)
    appendLE(48000 * 4)
    appendLE16(4)
    appendLE16(16)
    wav.append("data".data(using: .ascii)!)
    appendLE(dataSize)
    wav.append(pcmData)

    let outURL = URL(fileURLWithPath: outPath)
    try FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try wav.write(to: outURL)
    print(String(format: "[canon_orchestra] Rendered 6-voice Pachelbel Canon in D (%@ %.1fs, 48kHz stereo, gain=%.2f) -> %@", edition, duration, gain, outPath))
}

let args = CommandLine.arguments
let edition = args.count > 1 ? args[1] : "web"
let outPath = args.count > 2 ? args[2] : "soundtrack-\(edition).wav"
do {
    try renderCanon(edition: edition, outPath: outPath)
} catch {
    fputs("[canon_orchestra] ERROR: \(error)\n", stderr)
    exit(1)
}
