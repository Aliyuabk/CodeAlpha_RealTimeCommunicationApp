/* ==========================================================================
   ConnectPlus - WebRTC Media & WebSocket Signaling Handler
   ========================================================================== */

const roomId = JSON.parse(document.getElementById('room-id').textContent);
const currentUser = JSON.parse(document.getElementById('current-user').textContent);

let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let socket = null;

// Track active RTCPeerConnections by peer ID / socket channel
const peerConnections = {};

// STUN Servers for ICE Candidate discovery
const iceServersConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19020' },
        { urls: 'stun:stun1.l.google.com:19020' },
        { urls: 'stun:stun2.l.google.com:19020' }
    ]
};

/**
 * Initialize WebSockets & Local Media
 */
async function initMeeting() {
    try {
        // Request webcam & microphone permissions
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        const localVideoElem = document.getElementById('local-video');
        if (localVideoElem) {
            localVideoElem.srcObject = localStream;
        }

        // Establish WebSocket Connection
        const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${wsScheme}://${window.location.host}/ws/room/${roomId}/`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('Connected to signaling server');
            socket.send(JSON.stringify({
                type: 'user-joined',
                sender: currentUser,
                user: currentUser
            }));
        };

        socket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            handleSignalMessage(data);
        };

        socket.onclose = () => console.log('Signaling WebSocket closed');
        socket.onerror = (err) => console.error('WebSocket Error:', err);

    } catch (error) {
        console.error('Error accessing local media devices:', error);
        alert('Could not access microphone or camera. Please verify browser permissions.');
    }
}

/**
 * Handle incoming WebRTC signaling messages
 */
async function handleSignalMessage(data) {
    const sender = data.sender;
    if (sender === currentUser) return; // Ignore self-sent broadcast messages

    switch (data.type) {
        case 'user-joined':
            if (typeof addParticipantToRoster === 'function') {
                addParticipantToRoster(sender);
            }
            createPeerConnection(sender, true);
            break;

        case 'offer':
            if (typeof addParticipantToRoster === 'function') {
                addParticipantToRoster(sender);
            }
            const pc = createPeerConnection(sender, false);
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                target: sender,
                sender: currentUser
            }));
            break;

        case 'answer':
            if (peerConnections[sender]) {
                await peerConnections[sender].setRemoteDescription(new RTCSessionDescription(data.answer));
            }
            break;

        case 'ice-candidate':
            if (peerConnections[sender] && data.candidate) {
                await peerConnections[sender].addIceCandidate(new RTCIceCandidate(data.candidate));
            }
            break;

        case 'chat-message':
            appendChatMessage(data.user, data.message);
            break;

        case 'user-left':
            removePeer(sender);
            break;
    }
}

/**
 * Create RTCPeerConnection for a specific peer
 */
function createPeerConnection(peerId, isInitiator) {
    if (peerConnections[peerId]) {
        return peerConnections[peerId];
    }

    const pc = new RTCPeerConnection(iceServersConfig);
    peerConnections[peerId] = pc;

    // Add local media tracks to connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Send ICE candidates to signaling server
    pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
            socket.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
                target: peerId,
                sender: currentUser
            }));
        }
    };

    // Receive and display remote track
    pc.ontrack = (event) => {
        let videoElem = document.getElementById(`video-${peerId}`);
        if (!videoElem) {
            videoElem = createPeerVideoTile(peerId);
        }
        videoElem.srcObject = event.streams[0];
    };

    // Generate SDP offer if initiator
    if (isInitiator) {
        pc.createOffer().then(async (offer) => {
            await pc.setLocalDescription(offer);
            if (socket) {
                socket.send(JSON.stringify({
                    type: 'offer',
                    offer: offer,
                    target: peerId,
                    sender: currentUser
                }));
            }
        });
    }

    return pc;
}

/**
 * Dynamic UI Helpers for Remote Peer Video Tiles
 */
function createPeerVideoTile(peerId) {
    const videoGrid = document.getElementById('video-grid');
    if (!videoGrid) return null;

    const tile = document.createElement('div');
    tile.id = `tile-${peerId}`;
    tile.className = 'video-tile';

    const video = document.createElement('video');
    video.id = `video-${peerId}`;
    video.autoplay = true;
    video.playsInline = true;

    const overlay = document.createElement('div');
    overlay.className = 'user-badge';
    overlay.innerHTML = `<span>${peerId}</span>`;

    tile.appendChild(video);
    tile.appendChild(overlay);
    videoGrid.appendChild(tile);

    return video;
}

function removePeer(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    const tile = document.getElementById(`tile-${peerId}`);
    if (tile) tile.remove();
}

/**
 * Control Bar Actions: Audio & Video
 */
function toggleAudio() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const btn = document.getElementById('btn-audio');
        if (btn) btn.classList.toggle('active', !audioTrack.enabled);
    }
}

function toggleVideo() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const btn = document.getElementById('btn-video');
        if (btn) btn.classList.toggle('active', !videoTrack.enabled);
    }
}

/**
 * Screen Share Handler (In-App Overlay + WebRTC Track Swap)
 */
async function toggleScreenShare() {
    const videoGrid = document.getElementById('video-grid');
    const localTile = document.getElementById('tile-local');
    const screenTile = document.getElementById('tile-screenshare');
    const screenVideo = document.getElementById('screen-video');

    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            // Replace video track across all active WebRTC peer connections
            for (let peerId in peerConnections) {
                const senders = peerConnections[peerId].getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(screenTrack);
                }
            }

            // Update UI elements for Picture-in-Picture screen share view
            if (screenVideo) screenVideo.srcObject = screenStream;
            if (videoGrid) videoGrid.classList.add('sharing-active');
            if (screenTile) screenTile.style.display = 'flex';
            if (localTile) localTile.classList.add('pip-host-overlay');

            isScreenSharing = true;

            // Handle browser built-in "Stop sharing" bar event
            screenTrack.onended = () => stopScreenShare();
        } catch (err) {
            console.error('Screen share error:', err);
        }
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (!isScreenSharing) return;

    const videoGrid = document.getElementById('video-grid');
    const localTile = document.getElementById('tile-local');
    const screenTile = document.getElementById('tile-screenshare');
    const screenVideo = document.getElementById('screen-video');

    // Restore webcam track to peer connections
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        for (let peerId in peerConnections) {
            const senders = peerConnections[peerId].getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender && videoTrack) {
                videoSender.replaceTrack(videoTrack);
            }
        }
    }

    // Stop screen media stream tracks
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }

    // Reset UI layout
    if (screenVideo) screenVideo.srcObject = null;
    if (screenTile) screenTile.style.display = 'none';
    if (localTile) localTile.classList.remove('pip-host-overlay');
    if (videoGrid) videoGrid.classList.remove('sharing-active');

    isScreenSharing = false;
}

/**
 * Chat Messaging Handler
 */
function sendChatMessage(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('chat-input');
    if (!input) return;

    const msg = input.value.trim();
    if (msg && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'chat-message',
            user: currentUser,
            sender: currentUser,
            message: msg
        }));
        appendChatMessage('You', msg, true);
        input.value = '';
    }
}

function appendChatMessage(user, message, isMe = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = isMe || user === 'You' ? 'chat-msg me' : 'chat-msg';
    div.innerHTML = `
        <div class="sender">${user}</div>
        <div class="text">${message}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Automatically start meeting on page load
document.addEventListener('DOMContentLoaded', () => {
    initMeeting();
});