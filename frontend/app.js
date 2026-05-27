/* NovaAmbient Studio — Workspace Orchestrator & UI Bindings */
import { AtmosphereEngine } from './audio.js';

// Instantiate core DSP Engine
const audio = new AtmosphereEngine();

// Channels database definition
const channels = [
    { id: 'rain', name: 'Rain Shower', icon: 'cloud-rain', defaultVal: 0 },
    { id: 'wind', name: 'Gusting Wind', icon: 'wind', defaultVal: 0 },
    { id: 'campfire', name: 'Campfire Crackle', icon: 'flame', defaultVal: 0 },
    { id: 'thunder', name: 'Distant Thunder', icon: 'zap', defaultVal: 0 },
    { id: 'cosmos', name: 'Cosmic Pad', icon: 'orbit', defaultVal: 0 }
];

// Pomodoro Timer State
let timerInterval = null;
let timerDuration = 25 * 60; // 25 mins in seconds
let timeLeft = timerDuration;
let timerMode = 'focus'; // 'focus', 'short', 'long'
let isTimerRunning = false;

document.addEventListener('DOMContentLoaded', () => {
    // Render Sound Mixers
    renderMixerGrid();
    
    // Bind General Control Deck Elements
    bindControls();
    
    // Setup Canvas Visualizer
    startVisualizer();
    
    // Trigger Lucide Icon setup
    lucide.createIcons();
    
    // Initialize Timer UI display
    updateTimerDisplay();
    
    updateStatus("NovaAmbient DSP engine connected.");
});

// 1. DYNAMICALLY RENDER ATMOSPHERE MIXER SLIDERS
function renderMixerGrid() {
    const list = document.getElementById('mixer-channels-list');
    list.innerHTML = '';
    
    channels.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'mixer-channel-card';
        card.dataset.channel = ch.id;
        
        card.innerHTML = `
            <div class="channel-meta">
                <span class="channel-info">
                    <i data-lucide="${ch.icon}"></i>
                    <span>${ch.name}</span>
                </span>
                <div class="channel-controls">
                    <button class="btn-mute" id="mute-${ch.id}" title="Mute">M</button>
                    <button class="btn-solo" id="solo-${ch.id}" title="Solo">S</button>
                </div>
            </div>
            <div class="slider-row">
                <input type="range" min="0" max="100" value="${ch.defaultVal}" class="deck-slider" id="slider-${ch.id}">
                <span class="value-badge" id="val-${ch.id}">${ch.defaultVal}%</span>
            </div>
        `;
        
        list.appendChild(card);
        bindChannelEvents(ch.id);
    });
}

function bindChannelEvents(channelId) {
    const slider = document.getElementById(`slider-${channelId}`);
    const badge = document.getElementById(`val-${channelId}`);
    const muteBtn = document.getElementById(`mute-${channelId}`);
    const soloBtn = document.getElementById(`solo-${channelId}`);
    
    // Volume Slider Drag
    slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        badge.textContent = `${val}%`;
        
        // Start engine if not running on first drag interaction
        if (!audio.isEngineRunning && val > 0) {
            startAudioEngine();
        }
        
        audio.setChannelVolume(channelId, val);
    });
    
    // Mute click
    muteBtn.addEventListener('click', () => {
        const isMuted = !audio.channelMutes[channelId];
        audio.setChannelMute(channelId, isMuted);
        muteBtn.classList.toggle('active', isMuted);
        
        if (isMuted) {
            updateStatus(`Muted channel: ${channelId}`);
        } else {
            updateStatus(`Unmuted channel: ${channelId}`);
        }
    });
    
    // Solo click
    soloBtn.addEventListener('click', () => {
        const isSoloed = !audio.channelMutes[channelId] && !soloBtn.classList.contains('active');
        
        // Clear all other solos
        document.querySelectorAll('.btn-solo').forEach(btn => {
            if (btn !== soloBtn) btn.classList.remove('active');
        });
        
        // Toggle this solo active state
        soloBtn.classList.toggle('active');
        
        const anySoloActive = soloBtn.classList.contains('active');
        
        // Configure local gain states
        channels.forEach(ch => {
            if (anySoloActive) {
                audio.channelMutes[ch.id] = (ch.id !== channelId);
                const localMuteBtn = document.getElementById(`mute-${ch.id}`);
                if (localMuteBtn) localMuteBtn.classList.toggle('active', ch.id !== channelId);
            } else {
                audio.channelMutes[ch.id] = false;
                const localMuteBtn = document.getElementById(`mute-${ch.id}`);
                if (localMuteBtn) localMuteBtn.classList.remove('active');
            }
            audio.updateNodeVolume(ch.id);
        });
        
        updateStatus(anySoloActive ? `Soloing channel: ${channelId}` : "Cleared all solos");
    });
}

function startAudioEngine() {
    audio.startAllActiveChannels();
    document.getElementById('status-led').className = 'led-indicator running';
    updateStatus("DSP Synthesis engine online.");
}

function stopAudioEngine() {
    audio.stopAllChannels();
    document.getElementById('status-led').className = 'led-indicator offline';
    updateStatus("Synthesis engine offline.");
}

// 2. BIND GENERAL CONTROLS AND PRESETS
function bindControls() {
    const masterVol = document.getElementById('slider-master-vol');
    const masterVolLabel = document.getElementById('label-master-vol');
    
    // Master Volume control
    masterVol.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        masterVolLabel.textContent = `${val}%`;
        audio.setMasterVolume(val);
    });
    
    // Pomodoro Controls
    const timerToggle = document.getElementById('btn-timer-toggle');
    const timerReset = document.getElementById('btn-timer-reset');
    
    timerToggle.addEventListener('click', toggleTimer);
    timerReset.addEventListener('click', resetTimer);
    
    document.getElementById('mode-focus').addEventListener('click', () => switchTimerMode('focus', 25));
    document.getElementById('mode-short').addEventListener('click', () => switchTimerMode('short', 5));
    document.getElementById('mode-long').addEventListener('click', () => switchTimerMode('long', 15));
    
    // Quick Presets
    document.getElementById('preset-rainy-woods').addEventListener('click', () => {
        applyPresetMix({ rain: 80, wind: 30, campfire: 20, thunder: 60, cosmos: 0 });
    });
    document.getElementById('preset-cozy-hearth').addEventListener('click', () => {
        applyPresetMix({ rain: 0, wind: 10, campfire: 85, thunder: 0, cosmos: 25 });
    });
    document.getElementById('preset-cyber-storm').addEventListener('click', () => {
        applyPresetMix({ rain: 95, wind: 65, campfire: 0, thunder: 90, cosmos: 10 });
    });
    document.getElementById('preset-deep-space').addEventListener('click', () => {
        applyPresetMix({ rain: 0, wind: 15, campfire: 0, thunder: 0, cosmos: 90 });
    });
    
    // File Presets Saving/Loading
    document.getElementById('btn-save-mix').addEventListener('click', async () => {
        if (typeof pywebview === 'undefined' || !pywebview.api) {
            toasts.error("Save Error", "Desktop API backend not loaded.");
            return;
        }
        
        const presetData = {
            masterVolume: parseInt(masterVol.value),
            channels: channels.map(c => ({
                id: c.id,
                volume: parseInt(document.getElementById(`slider-${c.id}`).value),
                muted: audio.channelMutes[c.id]
            }))
        };
        
        updateStatus("Saving custom atmosphere...");
        const res = await pywebview.api.save_preset(JSON.stringify(presetData, null, 2));
        
        if (res && res.status === 'success') {
            toasts.success("Preset Saved", `Mix "${res.filename}" saved.`);
            updateStatus(`Preset saved successfully to: ${res.filepath}`);
        } else if (res && res.error) {
            toasts.error("Save Failed", res.error);
        } else {
            updateStatus("Save cancelled.");
        }
    });

    document.getElementById('btn-load-mix').addEventListener('click', async () => {
        if (typeof pywebview === 'undefined' || !pywebview.api) {
            toasts.error("Load Error", "Desktop API backend not loaded.");
            return;
        }
        
        updateStatus("Opening atmosphere file...");
        const res = await pywebview.api.load_preset();
        
        if (res && res.status === 'success') {
            const data = JSON.parse(res.content);
            
            // Set Master Volume
            if (data.masterVolume !== undefined) {
                masterVol.value = data.masterVolume;
                masterVolLabel.textContent = `${data.masterVolume}%`;
                audio.setMasterVolume(data.masterVolume);
            }
            
            // Set Channel Volumes
            if (data.channels) {
                const mix = {};
                data.channels.forEach(ch => {
                    mix[ch.id] = ch.volume;
                });
                applyPresetMix(mix);
            }
            
            toasts.success("Preset Opened", `Loaded atmosphere "${res.filename}"`);
            updateStatus(`Opened atmosphere: ${res.filepath}`);
        } else if (res && res.error) {
            toasts.error("Open Failed", res.error);
        } else {
            updateStatus("Open cancelled.");
        }
    });
    
    // Clear/Reset mix
    document.getElementById('btn-clear-mix').addEventListener('click', () => {
        stopAudioEngine();
        channels.forEach(ch => {
            const slider = document.getElementById(`slider-${ch.id}`);
            const badge = document.getElementById(`val-${ch.id}`);
            const mute = document.getElementById(`mute-${ch.id}`);
            const solo = document.getElementById(`solo-${ch.id}`);
            
            slider.value = 0;
            badge.textContent = "0%";
            mute.classList.remove('active');
            solo.classList.remove('active');
            
            audio.channelGains[ch.id] = 0.0;
            audio.channelMutes[ch.id] = false;
        });
        toasts.warn("Mixer Reset", "All sound channels cleared.");
    });
}

function applyPresetMix(mix) {
    if (!audio.ctx) {
        audio.init();
    }
    
    let anyActive = false;
    
    channels.forEach(ch => {
        const val = mix[ch.id] !== undefined ? mix[ch.id] : 0;
        const slider = document.getElementById(`slider-${ch.id}`);
        const badge = document.getElementById(`val-${ch.id}`);
        const mute = document.getElementById(`mute-${ch.id}`);
        const solo = document.getElementById(`solo-${ch.id}`);
        
        slider.value = val;
        badge.textContent = `${val}%`;
        
        // Reset local mutes/solos
        mute.classList.remove('active');
        solo.classList.remove('active');
        audio.channelMutes[ch.id] = false;
        
        audio.setChannelVolume(ch.id, val);
        if (val > 0) anyActive = true;
    });
    
    if (anyActive) {
        startAudioEngine();
    } else {
        stopAudioEngine();
    }
    
    toasts.success("Preset Applied", "Ambient mixer levels loaded.");
}

// 3. POMODORO TIMER LOGIC
function toggleTimer() {
    const btn = document.getElementById('btn-timer-toggle');
    const led = document.getElementById('status-led');
    
    if (isTimerRunning) {
        // Pause timer
        isTimerRunning = false;
        clearInterval(timerInterval);
        timerInterval = null;
        btn.querySelector('i').setAttribute('data-lucide', 'play');
        btn.classList.remove('playing');
        lucide.createIcons();
        updateStatus("Focus timer paused.");
        
        if (audio.isEngineRunning) {
            led.className = 'led-indicator running';
        } else {
            led.className = 'led-indicator offline';
        }
    } else {
        // Start timer
        isTimerRunning = true;
        btn.querySelector('i').setAttribute('data-lucide', 'pause');
        btn.classList.add('playing');
        lucide.createIcons();
        updateStatus(`Focus timer running (${timerMode.toUpperCase()})`);
        
        // Make sure audio context is alive
        audio.init();
        
        if (timerMode === 'focus') {
            led.className = 'led-indicator running';
        } else {
            led.className = 'led-indicator break';
        }
        
        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            
            if (timeLeft <= 0) {
                timerFinished();
            }
        }, 1000);
    }
}

function resetTimer() {
    isTimerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    timeLeft = timerDuration;
    
    const btn = document.getElementById('btn-timer-toggle');
    btn.querySelector('i').setAttribute('data-lucide', 'play');
    btn.classList.remove('playing');
    lucide.createIcons();
    
    updateTimerDisplay();
    updateStatus("Timer reset.");
}

function switchTimerMode(mode, minutes) {
    // Set active button styles
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mode-${mode}`).classList.add('active');
    
    timerMode = mode;
    timerDuration = minutes * 60;
    
    const title = document.getElementById('timer-state-title');
    title.textContent = mode === 'focus' ? 'FOCUS' : 'BREAK';
    
    resetTimer();
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    const clockText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timer-clock-text').textContent = clockText;
    document.getElementById('quick-timer-display').textContent = `${timerMode === 'focus' ? 'Focus Session' : 'Break Time'}: ${clockText}`;
    
    // Update SVG Circle Progress
    const progressRing = document.getElementById('timer-progress-ring');
    const circumference = 534; // 2 * Math.PI * 85
    const progress = timeLeft / timerDuration;
    const offset = circumference - (progress * circumference);
    progressRing.style.strokeDashoffset = offset;
}

function timerFinished() {
    isTimerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    
    // Synthesize Focus Over Bell Signal!
    audio.playFocusBell();
    
    const btn = document.getElementById('btn-timer-toggle');
    btn.querySelector('i').setAttribute('data-lucide', 'play');
    btn.classList.remove('playing');
    lucide.createIcons();
    
    if (timerMode === 'focus') {
        toasts.success("Session Complete!", "Time to take a short break.");
        switchTimerMode('short', 5);
    } else {
        toasts.info("Break is Over!", "Time to focus again.");
        switchTimerMode('focus', 25);
    }
}

// 4. REAL-TIME WAVEFORM VISUALIZATION
function startVisualizer() {
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');
    
    function resizeCanvas() {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Particles database for slow ambient animations
    const particles = [];
    const particleCount = 20;
    for (let p = 0; p < particleCount; p++) {
        particles.push({
            x: Math.random() * 300,
            y: Math.random() * 200,
            r: 2 + Math.random() * 4,
            speedX: -0.2 - Math.random() * 0.3,
            speedY: -0.1 + Math.random() * 0.2,
            alpha: 0.1 + Math.random() * 0.4
        });
    }

    function draw() {
        requestAnimationFrame(draw);
        
        // Deep ambient dark background
        ctx.fillStyle = '#040406';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Fit canvas width/height references
        const w = canvas.width;
        const h = canvas.height;
        
        // If audio engine is not online, render a slow breathing ambient visualizer
        if (!audio.masterAnalyser || !audio.isEngineRunning) {
            // A. Draw breathing floating particles
            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                
                // Wrap screen boundary
                if (p.x < 0) p.x = w;
                if (p.y < 0 || p.y > h) p.y = Math.random() * h;
                
                ctx.fillStyle = `rgba(157, 78, 221, ${p.alpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            });
            
            // B. Draw smooth breathing center wave
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(157, 78, 221, 0.2)';
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'var(--accent-glow)';
            
            ctx.beginPath();
            const centerY = h / 2;
            const amp = 8 * Math.sin(Date.now() / 800);
            
            ctx.moveTo(0, centerY);
            for (let x = 0; x < w; x++) {
                const y = centerY + Math.sin((x / w) * Math.PI * 2 + Date.now() / 400) * amp;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            return;
        }
        
        // If playing, render real-time frequency data
        const bufferLength = audio.masterAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        audio.masterAnalyser.getByteTimeDomainData(dataArray);
        
        // Map average energy to glowing visual effects
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += Math.abs(dataArray[i] - 128);
        }
        const energy = sum / bufferLength; // 0 to ~60
        
        // Draw fluid ambient background glow
        const glowRad = 50 + energy * 2.5;
        const grad = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, glowRad);
        grad.addColorStop(0, 'rgba(157, 78, 221, 0.08)');
        grad.addColorStop(1, 'rgba(4, 4, 6, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        
        // Draw primary neon wave
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'var(--accent-glow)';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'var(--accent-glow)';
        
        ctx.beginPath();
        const sliceWidth = w / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * h) / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    draw();
}

// 5. CONNECT DSP EVENT HOOKS
audio.onThunderFlashCallback = () => {
    // Briefly flash the app body or visualizer background to simulate lightning
    const body = document.body;
    body.style.transition = 'none';
    body.style.filter = 'brightness(1.6)';
    
    setTimeout(() => {
        body.style.transition = 'filter 1.2s ease-out';
        body.style.filter = '';
    }, 150);
    
    toasts.info("Lightning strike", "Procedural thunder rumble triggered.");
};

// General Toast Messages helper
const toasts = {
    show: (type, title, msg) => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        
        let icon = 'info';
        if (type === 'success') icon = 'check-circle';
        else if (type === 'error') icon = 'x-circle';
        else if (type === 'warning') icon = 'alert-triangle';
        
        t.innerHTML = `
            <i data-lucide="${icon}"></i>
            <div class="toast-body">
                <strong>${title}</strong>
                <span>${msg}</span>
            </div>
        `;
        
        container.appendChild(t);
        lucide.createIcons();
        
        setTimeout(() => {
            t.classList.add('toast-fade-out');
            t.addEventListener('animationend', () => t.remove());
        }, 3000);
    },
    success: (title, msg) => toasts.show('success', title, msg),
    error: (title, msg) => toasts.show('error', title, msg),
    warn: (title, msg) => toasts.show('warning', title, msg),
    info: (title, msg) => toasts.show('info', title, msg)
};

function updateStatus(msg) {
    document.getElementById('status-message').textContent = msg;
}
