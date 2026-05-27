/* NovaAmbient Studio — Sound Synthesis & Audio DSP Engine */

export class AtmosphereEngine {
    constructor() {
        this.ctx = null;
        
        // Master Node Controls
        this.masterGain = null;
        this.masterAnalyser = null;
        this.masterVolume = 0.8;
        
        // Cached noise buffers
        this.whiteNoiseBuffer = null;
        this.pinkNoiseBuffer = null;
        this.brownNoiseBuffer = null;
        this.crackleBuffer = null; // custom impulse crackles
        
        // Active Sound Node References (so we can start/stop/mute)
        this.nodes = {
            rain: null,
            wind: null,
            campfire: null,
            thunder: null,
            cosmos: null
        };
        
        // Channel parameters
        this.channelGains = {
            rain: 0.0,
            wind: 0.0,
            campfire: 0.0,
            thunder: 0.0,
            cosmos: 0.0
        };
        
        this.channelMutes = {
            rain: false,
            wind: false,
            campfire: false,
            thunder: false,
            cosmos: false
        };
        
        // Sub-gain nodes for volume scaling
        this.gains = {
            rain: null,
            wind: null,
            campfire: null,
            thunder: null,
            cosmos: null
        };
        
        // Active LFOs or secondary nodes
        this.lfos = [];
        this.oscGroup = []; // for pad oscillators
        
        // Thunder scheduler timer
        this.thunderTimerId = null;
        
        this.isEngineRunning = false;
    }

    init() {
        if (this.ctx) return;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        // Master Routing
        this.masterAnalyser = this.ctx.createAnalyser();
        this.masterAnalyser.fftSize = 512;
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        
        this.masterGain.connect(this.masterAnalyser);
        this.masterAnalyser.connect(this.ctx.destination);
        
        // Pre-generate standard noise buffers
        this.generateNoiseBuffers();
        
        // Build the routing nodes for each channel
        this.setupMixerChannels();
    }

    generateNoiseBuffers() {
        const sampleRate = this.ctx.sampleRate;
        const bufferSize = sampleRate * 2; // 2 seconds loop
        
        // 1. WHITE NOISE
        this.whiteNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
        const whiteData = this.whiteNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            whiteData[i] = Math.random() * 2 - 1;
        }
        
        // 2. PINK NOISE (Paul Kellet's refined method)
        this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
        const pinkData = this.pinkNoiseBuffer.getChannelData(0);
        let b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0, b4 = 0.0, b5 = 0.0, b6 = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;
            pinkData[i] = pink * 0.11; // normalize
        }
        
        // 3. BROWNIAN NOISE
        this.brownNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
        const brownData = this.brownNoiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            brownData[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = brownData[i];
            brownData[i] *= 3.5; // normalize
        }
        
        // 4. CAMPFIRE CRACKLES (Custom Impulse loop)
        const crackleSize = sampleRate * 1.5; // 1.5 seconds loop
        this.crackleBuffer = this.ctx.createBuffer(1, crackleSize, sampleRate);
        const crackleData = this.crackleBuffer.getChannelData(0);
        for (let i = 0; i < crackleSize; i++) {
            crackleData[i] = 0.0;
        }
        // Inject ~18 sparse pops with exponential decays
        const popCount = 18;
        for (let p = 0; p < popCount; p++) {
            const index = Math.floor(Math.random() * crackleSize);
            const popAmplitude = 0.4 + Math.random() * 0.6;
            for (let decay = 0; decay < 80; decay++) {
                if (index + decay < crackleSize) {
                    // Combine high freq crackle tick + decay
                    crackleData[index + decay] += popAmplitude * Math.exp(-decay / 12) * (Math.random() * 2 - 1);
                }
            }
        }
    }

    setupMixerChannels() {
        // Create static gain nodes for each channel that remain connected to master
        Object.keys(this.channelGains).forEach(ch => {
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0.0, this.ctx.currentTime);
            gainNode.connect(this.masterGain);
            this.gains[ch] = gainNode;
        });
    }

    setMasterVolume(percentage) {
        this.masterVolume = Math.max(0, Math.min(100, percentage)) / 100;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        }
    }

    setChannelVolume(channel, percentage) {
        const vol = Math.max(0, Math.min(100, percentage)) / 100;
        this.channelGains[channel] = vol;
        this.updateNodeVolume(channel);
        
        // If engine is running and volume goes above 0, make sure node is started
        if (this.isEngineRunning && vol > 0 && !this.nodes[channel]) {
            this.startChannelNode(channel);
        }
    }

    setChannelMute(channel, isMuted) {
        this.channelMutes[channel] = isMuted;
        this.updateNodeVolume(channel);
    }

    updateNodeVolume(channel) {
        const gainNode = this.gains[channel];
        if (!gainNode) return;
        
        const finalVol = this.channelMutes[channel] ? 0.0 : this.channelGains[channel];
        gainNode.gain.setTargetAtTime(finalVol, this.ctx.currentTime, 0.1);
    }

    startAllActiveChannels() {
        this.init();
        this.ctx.resume();
        this.isEngineRunning = true;
        
        Object.keys(this.channelGains).forEach(ch => {
            if (this.channelGains[ch] > 0) {
                this.startChannelNode(ch);
            }
        });
        
        // Start automatic thunder scheduler
        this.scheduleRandomThunder();
    }

    stopAllChannels() {
        this.isEngineRunning = false;
        
        Object.keys(this.nodes).forEach(ch => {
            this.stopChannelNode(ch);
        });
        
        if (this.thunderTimerId) {
            clearTimeout(this.thunderTimerId);
            this.thunderTimerId = null;
        }
    }

    startChannelNode(channel) {
        if (!this.isEngineRunning || this.nodes[channel]) return;
        
        if (channel === 'rain') {
            this.startRainSynth();
        } else if (channel === 'wind') {
            this.startWindSynth();
        } else if (channel === 'campfire') {
            this.startCampfireSynth();
        } else if (channel === 'thunder') {
            // Thunder is event-based, but we initialize volume node routing
            this.updateNodeVolume('thunder');
        } else if (channel === 'cosmos') {
            this.startCosmosSynth();
        }
    }

    stopChannelNode(channel) {
        const nodeGroup = this.nodes[channel];
        if (!nodeGroup) return;
        
        if (channel === 'cosmos') {
            this.oscGroup.forEach(osc => {
                try { osc.stop(); } catch(e) {}
            });
            this.oscGroup = [];
        } else {
            nodeGroup.forEach(node => {
                try { node.stop(); } catch(e) {}
            });
        }
        
        this.nodes[channel] = null;
    }

    /* SYNTHESIS ENGINES */

    // 1. RAIN SYNTH
    startRainSynth() {
        // Pink noise source (low frequency rain texture)
        const rainSource = this.ctx.createBufferSource();
        rainSource.buffer = this.pinkNoiseBuffer;
        rainSource.loop = true;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
        
        // Amplitude Modulator LFO (Simulates soft wind-gusts affecting rain speed)
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // 12 seconds loop
        
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(0.2, this.ctx.currentTime); // modulate up to 20%
        
        const modGain = this.ctx.createGain();
        modGain.gain.setValueAtTime(0.8, this.ctx.currentTime); // baseline gain
        
        lfo.connect(lfoGain);
        lfoGain.connect(modGain.gain); // Modulate baseline rain gain node
        
        rainSource.connect(filter);
        filter.connect(modGain);
        modGain.connect(this.gains.rain);
        
        rainSource.start();
        lfo.start();
        
        this.nodes.rain = [rainSource, lfo];
        this.updateNodeVolume('rain');
    }

    // 2. WIND SYNTH
    startWindSynth() {
        const windSource = this.ctx.createBufferSource();
        windSource.buffer = this.pinkNoiseBuffer;
        windSource.loop = true;
        
        // High Q bandpass filter for howling wind resonance
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(3.5, this.ctx.currentTime);
        filter.frequency.setValueAtTime(350, this.ctx.currentTime);
        
        // Modulator LFO (makes the wind howl sweep up and down)
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.05, this.ctx.currentTime); // 20s sweep cycles
        
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(220, this.ctx.currentTime); // sweep range
        
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency); // Modulate cutoff frequency directly
        
        windSource.connect(filter);
        filter.connect(this.gains.wind);
        
        windSource.start();
        lfo.start();
        
        this.nodes.wind = [windSource, lfo];
        this.updateNodeVolume('wind');
    }

    // 3. CAMPFIRE SYNTH
    startCampfireSynth() {
        // A. Low fire rumble (Brown noise)
        const rumbleSource = this.ctx.createBufferSource();
        rumbleSource.buffer = this.brownNoiseBuffer;
        rumbleSource.loop = true;
        
        const rumbleFilter = this.ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(220, this.ctx.currentTime);
        
        const rumbleGain = this.ctx.createGain();
        rumbleGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
        
        rumbleSource.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(this.gains.campfire);
        
        // B. Wooden crackles (Impulse train loop)
        const crackleSource = this.ctx.createBufferSource();
        crackleSource.buffer = this.crackleBuffer;
        crackleSource.loop = true;
        
        const crackleFilter = this.ctx.createBiquadFilter();
        crackleFilter.type = 'highpass';
        crackleFilter.frequency.setValueAtTime(900, this.ctx.currentTime);
        
        const crackleGain = this.ctx.createGain();
        crackleGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
        
        crackleSource.connect(crackleFilter);
        crackleFilter.connect(crackleGain);
        crackleGain.connect(this.gains.campfire);
        
        rumbleSource.start();
        crackleSource.start();
        
        this.nodes.campfire = [rumbleSource, crackleSource];
        this.updateNodeVolume('campfire');
    }

    // 4. EVENT THUNDER TRIGGER
    triggerThunder() {
        if (!this.isEngineRunning || this.channelGains.thunder === 0 || this.channelMutes.thunder) return;
        
        const now = this.ctx.currentTime;
        
        // Base low rumble (Brown noise)
        const rumble = this.ctx.createBufferSource();
        rumble.buffer = this.brownNoiseBuffer;
        rumble.loop = true;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(90, now);
        filter.frequency.exponentialRampToValueAtTime(30, now + 5.0);
        
        const rumbleGain = this.ctx.createGain();
        rumbleGain.gain.setValueAtTime(0.0, now);
        rumbleGain.gain.linearRampToValueAtTime(0.9, now + 0.15); // Fast strike
        rumbleGain.gain.setValueAtTime(0.9, now + 0.5);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 6.0); // long fade-out
        
        rumble.connect(filter);
        filter.connect(rumbleGain);
        rumbleGain.connect(this.gains.thunder);
        
        // Crack crackle peak (High frequency strike peak)
        const strike = this.ctx.createOscillator();
        const strikeGain = this.ctx.createGain();
        strike.type = 'triangle';
        strike.frequency.setValueAtTime(45, now);
        strike.frequency.exponentialRampToValueAtTime(10, now + 0.4);
        
        strikeGain.gain.setValueAtTime(0.0, now);
        strikeGain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        strikeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        strike.connect(strikeGain);
        strikeGain.connect(this.gains.thunder);
        
        // Start sources
        rumble.start(now);
        strike.start(now);
        
        // Clean up nodes after 6.5 seconds
        setTimeout(() => {
            try { rumble.stop(); } catch(e) {}
            try { strike.stop(); } catch(e) {}
        }, 6500);
        
        // Trigger visual flash callback if defined
        if (this.onThunderFlashCallback) {
            this.onThunderFlashCallback();
        }
    }

    scheduleRandomThunder() {
        if (!this.isEngineRunning) return;
        
        // Schedule next thunder in 20 - 45 seconds
        const delay = 20000 + Math.random() * 25000;
        this.thunderTimerId = setTimeout(() => {
            this.triggerThunder();
            this.scheduleRandomThunder();
        }, delay);
    }

    // 5. COSMOS SYNTH (Slow breathing ambient chords)
    startCosmosSynth() {
        const now = this.ctx.currentTime;
        
        // Spatial Delay setup
        const delay = this.ctx.createDelay();
        delay.delayTime.setValueAtTime(0.6, now);
        
        const feedback = this.ctx.createGain();
        feedback.gain.setValueAtTime(0.45, now);
        
        // Delay routing
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(this.gains.cosmos);
        
        // Ambient chord frequencies: C3 (130.81), G3 (196.0), C4 (261.63), E4 (329.63)
        const freqs = [130.81, 196.00, 261.63, 329.63];
        
        this.oscGroup = [];
        
        freqs.forEach(f => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now);
            
            const oscGain = this.ctx.createGain();
            oscGain.gain.setValueAtTime(0.12, now); // soft pad volume
            
            // Slow independent filter sweeps for a breathing feel
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400 + Math.random() * 200, now);
            filter.Q.setValueAtTime(2.0, now);
            
            // Modulation LFO for filter cutoff
            const lfo = this.ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(0.04 + Math.random() * 0.04, now); // slow independent LFO
            
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.setValueAtTime(120, now);
            
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);
            
            // Connections
            osc.connect(filter);
            filter.connect(oscGain);
            oscGain.connect(this.gains.cosmos);
            oscGain.connect(delay); // send to delay line
            
            osc.start();
            lfo.start();
            
            this.oscGroup.push(osc);
            this.oscGroup.push(lfo); // keep track to stop later
        });
        
        this.nodes.cosmos = this.oscGroup;
        this.updateNodeVolume('cosmos');
    }

    // Play focus bell sound (synthesized sine bell chime)
    playFocusBell() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now); // High clean chime
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, now); // 5th partial
        
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);
        
        osc1.start(now);
        osc2.start(now);
        
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
    }
}
