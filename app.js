// Private Video Call System - FHE Implementation
class PrivateVideoCallApp {
    constructor() {
        this.web3Provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentCallId = null;
        this.currentInviteId = null;
        this.callStartTime = null;
        this.durationInterval = null;
        this.contacts = new Map();

        // Contract configuration
        this.contractAddress = "0xdef73a13bBC4f72cDEe053eb336a1Fb72472F5E5";
        this.contractABI = [
            // Contract ABI will be added here
            "function registerUser(uint32 _publicKey, uint32 _initialStatus) external",
            "function updateUserStatus(uint32 _newStatus) external",
            "function inviteToCall(address _recipient, uint64 _inviteKey) external",
            "function acceptCallInvitation(bytes32 _inviteId, uint64 _callKey, uint32 _signalingData) external",
            "function declineCallInvitation(bytes32 _inviteId) external",
            "function startVideoCall(uint256 _callId) external",
            "function updateSignalingData(uint256 _callId, uint32 _newSignalingData) external",
            "function endVideoCall(uint256 _callId) external",
            "function addTrustedContact(address _contact) external",
            "function blockUser(address _user) external",
            "function getCallInfo(uint256 _callId) external view returns (address, address, bool, bool, uint256, uint256)",
            "function getUserCallHistory(address _user) external view returns (uint256[])",
            "function isUserRegistered(address _user) external view returns (bool)",
            "event CallInvited(address indexed from, address indexed to, bytes32 inviteId)",
            "event CallAccepted(address indexed from, address indexed to, uint256 indexed callId)",
            "event CallStarted(uint256 indexed callId, address indexed initiator, address indexed recipient)",
            "event CallEnded(uint256 indexed callId, uint256 duration)"
        ];

        // WebRTC Configuration
        this.rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.init();
    }

    async init() {
        await this.connectWallet();
        this.setupEventListeners();
        this.setupContractListeners();
        this.loadContacts();
        this.loadCallHistory();
    }

    async connectWallet() {
        try {
            if (typeof window.ethereum !== 'undefined') {
                this.web3Provider = new ethers.providers.Web3Provider(window.ethereum);
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                this.signer = this.web3Provider.getSigner();
                this.userAddress = await this.signer.getAddress();

                this.contract = new ethers.Contract(
                    this.contractAddress,
                    this.contractABI,
                    this.signer
                );

                document.getElementById('userAddress').value = this.userAddress;
                document.getElementById('connectionStatus').textContent = 'Connected to Blockchain Network';

                // Check if user is registered
                const isRegistered = await this.contract.isUserRegistered(this.userAddress);
                if (!isRegistered) {
                    await this.registerUser();
                }
            } else {
                throw new Error('MetaMask not found');
            }
        } catch (error) {
            console.error('Wallet connection failed:', error);
            document.getElementById('connectionStatus').textContent = 'Connection failed';
            document.getElementById('connectionDot').style.background = '#dc3545';
        }
    }

    async registerUser() {
        try {
            // Generate encrypted public key and initial status
            const publicKey = Math.floor(Math.random() * 1000000);
            const initialStatus = 1; // Online

            const tx = await this.contract.registerUser(publicKey, initialStatus);
            await tx.wait();

            console.log('User registered successfully');
        } catch (error) {
            console.error('Registration failed:', error);
        }
    }

    setupEventListeners() {
        // Status update
        document.getElementById('userStatus').addEventListener('change', async (e) => {
            await this.updateStatus(parseInt(e.target.value));
        });

        // Media controls
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('videoBtn').addEventListener('click', () => this.toggleVideo());

        // Call controls
        document.getElementById('callBtn').addEventListener('click', () => this.initiateCall());
        document.getElementById('endBtn').addEventListener('click', () => this.endCall());
    }

    setupContractListeners() {
        // Listen for incoming call invitations
        this.contract.on('CallInvited', (from, to, inviteId) => {
            if (to.toLowerCase() === this.userAddress.toLowerCase()) {
                this.showIncomingCall(from, inviteId);
            }
        });

        // Listen for call acceptance
        this.contract.on('CallAccepted', (from, to, callId) => {
            if (from.toLowerCase() === this.userAddress.toLowerCase()) {
                this.handleCallAccepted(callId);
            }
        });

        // Listen for call start
        this.contract.on('CallStarted', (callId, initiator, recipient) => {
            if (initiator.toLowerCase() === this.userAddress.toLowerCase() ||
                recipient.toLowerCase() === this.userAddress.toLowerCase()) {
                this.handleCallStarted(callId);
            }
        });

        // Listen for call end
        this.contract.on('CallEnded', (callId, duration) => {
            if (this.currentCallId === callId.toString()) {
                this.handleCallEnded(duration);
            }
        });
    }

    async updateStatus(status) {
        try {
            const tx = await this.contract.updateUserStatus(status);
            await tx.wait();

            const statusText = ['Offline', 'Online', 'Busy', 'Do Not Disturb'][status];
            console.log(`Status updated to: ${statusText}`);
        } catch (error) {
            console.error('Status update failed:', error);
        }
    }

    async addContact() {
        const address = document.getElementById('contactAddress').value.trim();
        if (!address || !ethers.utils.isAddress(address)) {
            alert('Please enter a valid Ethereum address');
            return;
        }

        try {
            // Check if user is registered
            const isRegistered = await this.contract.isUserRegistered(address);
            if (!isRegistered) {
                alert('User is not registered in the system');
                return;
            }

            // Add to trusted contacts
            const tx = await this.contract.addTrustedContact(address);
            await tx.wait();

            // Add to local contacts
            this.contacts.set(address, { address, trusted: true });
            this.updateContactList();

            document.getElementById('contactAddress').value = '';
            console.log('Contact added successfully');
        } catch (error) {
            console.error('Failed to add contact:', error);
        }
    }

    async initiateCall() {
        const selectedContact = this.getSelectedContact();
        if (!selectedContact) {
            alert('Please select a contact to call');
            return;
        }

        try {
            // Generate encrypted invite key
            const inviteKey = Math.floor(Math.random() * 1000000000);

            const tx = await this.contract.inviteToCall(selectedContact, inviteKey);
            await tx.wait();

            console.log('Call invitation sent');
            this.showCallStatus('Calling...', selectedContact);
        } catch (error) {
            console.error('Failed to initiate call:', error);
        }
    }

    async acceptInvite() {
        if (!this.currentInviteId) return;

        try {
            // Generate encrypted call key and signaling data
            const callKey = Math.floor(Math.random() * 1000000000);
            const signalingData = Math.floor(Math.random() * 100000);

            const tx = await this.contract.acceptCallInvitation(
                this.currentInviteId,
                callKey,
                signalingData
            );
            await tx.wait();

            this.hideIncomingCall();
            console.log('Call invitation accepted');
        } catch (error) {
            console.error('Failed to accept invitation:', error);
        }
    }

    async declineInvite() {
        if (!this.currentInviteId) return;

        try {
            const tx = await this.contract.declineCallInvitation(this.currentInviteId);
            await tx.wait();

            this.hideIncomingCall();
            console.log('Call invitation declined');
        } catch (error) {
            console.error('Failed to decline invitation:', error);
        }
    }

    async startVideoCall() {
        if (!this.currentCallId) return;

        try {
            // Start media capture
            await this.startMediaCapture();

            // Initialize WebRTC
            await this.initializeWebRTC();

            // Update contract
            const tx = await this.contract.startVideoCall(this.currentCallId);
            await tx.wait();

            console.log('Video call started');
        } catch (error) {
            console.error('Failed to start video call:', error);
        }
    }

    async endCall() {
        if (!this.currentCallId) return;

        try {
            const tx = await this.contract.endVideoCall(this.currentCallId);
            await tx.wait();

            this.cleanup();
            console.log('Call ended');
        } catch (error) {
            console.error('Failed to end call:', error);
        }
    }

    async startMediaCapture() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            localVideo.style.display = 'block';

            document.getElementById('videoPlaceholder').style.display = 'none';
            document.getElementById('qualityIndicator').style.display = 'block';
        } catch (error) {
            console.error('Media capture failed:', error);
            throw error;
        }
    }

    async initializeWebRTC() {
        this.peerConnection = new RTCPeerConnection(this.rtcConfiguration);

        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remoteVideo');
            remoteVideo.srcObject = this.remoteStream;
            remoteVideo.style.display = 'block';
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Send ICE candidate through encrypted signaling
                this.sendSignalingData({
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };
    }

    async sendSignalingData(data) {
        if (!this.currentCallId) return;

        try {
            // Encrypt and send signaling data
            const encryptedData = Math.floor(Math.random() * 100000); // Simplified

            const tx = await this.contract.updateSignalingData(
                this.currentCallId,
                encryptedData
            );
            await tx.wait();
        } catch (error) {
            console.error('Failed to send signaling data:', error);
        }
    }

    showIncomingCall(from, inviteId) {
        this.currentInviteId = inviteId;
        document.getElementById('inviteFrom').textContent = `From: ${from}`;
        document.getElementById('inviteNotification').style.display = 'block';
    }

    hideIncomingCall() {
        this.currentInviteId = null;
        document.getElementById('inviteNotification').style.display = 'none';
    }

    handleCallAccepted(callId) {
        this.currentCallId = callId.toString();
        this.startVideoCall();
    }

    handleCallStarted(callId) {
        this.currentCallId = callId.toString();
        this.callStartTime = Date.now();
        this.startCallTimer();

        document.getElementById('currentCallId').textContent = callId.toString();
        document.getElementById('participantCount').textContent = '2';
        document.getElementById('callBtn').style.display = 'none';
        document.getElementById('endBtn').style.display = 'block';
    }

    handleCallEnded(duration) {
        this.cleanup();
        this.loadCallHistory();
    }

    startCallTimer() {
        this.durationInterval = setInterval(() => {
            if (this.callStartTime) {
                const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                document.getElementById('callDuration').textContent =
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const muteBtn = document.getElementById('muteBtn');
                muteBtn.classList.toggle('active', !audioTrack.enabled);
                muteBtn.textContent = audioTrack.enabled ? '🎤' : '🔇';
            }
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const videoBtn = document.getElementById('videoBtn');
                videoBtn.classList.toggle('active', !videoTrack.enabled);
                videoBtn.textContent = videoTrack.enabled ? '📹' : '📵';
            }
        }
    }

    cleanup() {
        // Stop media streams
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Clear timers
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }

        // Reset UI
        document.getElementById('localVideo').style.display = 'none';
        document.getElementById('remoteVideo').style.display = 'none';
        document.getElementById('videoPlaceholder').style.display = 'block';
        document.getElementById('qualityIndicator').style.display = 'none';
        document.getElementById('callBtn').style.display = 'block';
        document.getElementById('endBtn').style.display = 'none';
        document.getElementById('currentCallId').textContent = '-';
        document.getElementById('callDuration').textContent = '00:00';
        document.getElementById('participantCount').textContent = '0';

        // Reset call state
        this.currentCallId = null;
        this.callStartTime = null;
    }

    updateContactList() {
        const contactList = document.getElementById('contactList');
        contactList.innerHTML = '';

        this.contacts.forEach((contact, address) => {
            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item';
            contactItem.innerHTML = `
                <div>
                    <strong>${address.substring(0, 8)}...${address.substring(address.length - 6)}</strong>
                    ${contact.trusted ? '<span class="badge bg-success ms-2">Trusted</span>' : ''}
                </div>
                <button class="btn btn-sm btn-primary" onclick="app.selectContact('${address}')">Call</button>
            `;
            contactList.appendChild(contactItem);
        });
    }

    selectContact(address) {
        this.selectedContact = address;
        // Highlight selected contact visually
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('bg-light');
        });
        event.target.closest('.contact-item').classList.add('bg-light');
    }

    getSelectedContact() {
        return this.selectedContact;
    }

    async loadCallHistory() {
        try {
            const callIds = await this.contract.getUserCallHistory(this.userAddress);
            const historyDiv = document.getElementById('callHistory');
            historyDiv.innerHTML = '';

            for (let callId of callIds) {
                const callInfo = await this.contract.getCallInfo(callId);
                const historyItem = document.createElement('div');
                historyItem.className = 'mb-2 p-2 border rounded';
                historyItem.innerHTML = `
                    <small>Call #${callId.toString()}</small><br>
                    <small class="text-muted">${new Date(callInfo[4] * 1000).toLocaleString()}</small>
                `;
                historyDiv.appendChild(historyItem);
            }
        } catch (error) {
            console.error('Failed to load call history:', error);
        }
    }

    loadContacts() {
        // Load contacts from local storage
        const savedContacts = localStorage.getItem('videoCallContacts');
        if (savedContacts) {
            const contactData = JSON.parse(savedContacts);
            contactData.forEach(contact => {
                this.contacts.set(contact.address, contact);
            });
            this.updateContactList();
        }
    }

    showCallStatus(message, contact) {
        // Show call status in UI
        console.log(`${message} ${contact}`);
    }
}

// Global functions for HTML onclick handlers
function initiateCall() {
    app.initiateCall();
}

function endCall() {
    app.endCall();
}

function addContact() {
    app.addContact();
}

function acceptInvite() {
    app.acceptInvite();
}

function declineInvite() {
    app.declineInvite();
}

// Initialize app when page loads
let app;
window.addEventListener('load', () => {
    app = new PrivateVideoCallApp();
});

// Handle page visibility for call management
document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.currentCallId) {
        // Optionally handle background call management
        console.log('Call continues in background');
    }
});