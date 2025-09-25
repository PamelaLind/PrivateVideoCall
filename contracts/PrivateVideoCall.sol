// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateVideoCall is SepoliaConfig {

    address public owner;
    uint256 public nextCallId;

    struct VideoCall {
        address initiator;
        address recipient;
        euint64 encryptedCallKey;
        euint32 encryptedSignalingData;
        bool isActive;
        bool isConnected;
        uint256 startTime;
        uint256 endTime;
        euint32 encryptedMetadata;
    }

    struct CallInvitation {
        address from;
        address to;
        euint64 encryptedInviteKey;
        uint256 timestamp;
        bool isAccepted;
        bool isDeclined;
    }

    struct UserProfile {
        bool isRegistered;
        euint32 encryptedStatus;
        euint64 encryptedPublicKey;
        mapping(address => bool) blockedUsers;
        mapping(address => bool) trustedContacts;
    }

    mapping(uint256 => VideoCall) public videoCalls;
    mapping(bytes32 => CallInvitation) public callInvitations;
    mapping(address => UserProfile) public userProfiles;
    mapping(address => uint256[]) public userCallHistory;

    event UserRegistered(address indexed user);
    event CallInvited(address indexed from, address indexed to, bytes32 inviteId);
    event CallAccepted(address indexed from, address indexed to, uint256 indexed callId);
    event CallDeclined(address indexed from, address indexed to, bytes32 inviteId);
    event CallStarted(uint256 indexed callId, address indexed initiator, address indexed recipient);
    event CallEnded(uint256 indexed callId, uint256 duration);
    event SignalingDataUpdated(uint256 indexed callId, address indexed user);
    event UserStatusUpdated(address indexed user);
    event ContactAdded(address indexed user, address indexed contact, bool isTrusted);
    event UserBlocked(address indexed blocker, address indexed blocked);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyRegistered() {
        require(userProfiles[msg.sender].isRegistered, "User not registered");
        _;
    }

    modifier callExists(uint256 callId) {
        require(callId < nextCallId, "Call does not exist");
        _;
    }

    modifier onlyCallParticipant(uint256 callId) {
        VideoCall storage call = videoCalls[callId];
        require(msg.sender == call.initiator || msg.sender == call.recipient, "Not a call participant");
        _;
    }

    constructor() {
        owner = msg.sender;
        nextCallId = 1;
    }

    function registerUser(uint32 _publicKey, uint32 _initialStatus) external {
        require(!userProfiles[msg.sender].isRegistered, "User already registered");

        euint64 encryptedPublicKey = FHE.asEuint64(uint64(_publicKey));
        euint32 encryptedStatus = FHE.asEuint32(_initialStatus);

        userProfiles[msg.sender].isRegistered = true;
        userProfiles[msg.sender].encryptedPublicKey = encryptedPublicKey;
        userProfiles[msg.sender].encryptedStatus = encryptedStatus;

        FHE.allowThis(encryptedPublicKey);
        FHE.allowThis(encryptedStatus);
        FHE.allow(encryptedPublicKey, msg.sender);
        FHE.allow(encryptedStatus, msg.sender);

        emit UserRegistered(msg.sender);
    }

    function updateUserStatus(uint32 _newStatus) external onlyRegistered {
        euint32 encryptedStatus = FHE.asEuint32(_newStatus);
        userProfiles[msg.sender].encryptedStatus = encryptedStatus;

        FHE.allowThis(encryptedStatus);
        FHE.allow(encryptedStatus, msg.sender);

        emit UserStatusUpdated(msg.sender);
    }

    function inviteToCall(address _recipient, uint64 _inviteKey) external onlyRegistered {
        require(_recipient != msg.sender, "Cannot invite yourself");
        require(userProfiles[_recipient].isRegistered, "Recipient not registered");
        require(!userProfiles[_recipient].blockedUsers[msg.sender], "You are blocked by this user");

        bytes32 inviteId = keccak256(abi.encodePacked(msg.sender, _recipient, block.timestamp));

        euint64 encryptedInviteKey = FHE.asEuint64(_inviteKey);

        callInvitations[inviteId] = CallInvitation({
            from: msg.sender,
            to: _recipient,
            encryptedInviteKey: encryptedInviteKey,
            timestamp: block.timestamp,
            isAccepted: false,
            isDeclined: false
        });

        FHE.allowThis(encryptedInviteKey);
        FHE.allow(encryptedInviteKey, msg.sender);
        FHE.allow(encryptedInviteKey, _recipient);

        emit CallInvited(msg.sender, _recipient, inviteId);
    }

    function acceptCallInvitation(bytes32 _inviteId, uint64 _callKey, uint32 _signalingData) external onlyRegistered {
        CallInvitation storage invitation = callInvitations[_inviteId];
        require(invitation.to == msg.sender, "Not your invitation");
        require(!invitation.isAccepted && !invitation.isDeclined, "Invitation already responded");

        invitation.isAccepted = true;

        euint64 encryptedCallKey = FHE.asEuint64(_callKey);
        euint32 encryptedSignalingData = FHE.asEuint32(_signalingData);

        uint256 callId = nextCallId++;

        videoCalls[callId] = VideoCall({
            initiator: invitation.from,
            recipient: msg.sender,
            encryptedCallKey: encryptedCallKey,
            encryptedSignalingData: encryptedSignalingData,
            isActive: true,
            isConnected: false,
            startTime: block.timestamp,
            endTime: 0,
            encryptedMetadata: FHE.asEuint32(0)
        });

        userCallHistory[invitation.from].push(callId);
        userCallHistory[msg.sender].push(callId);

        FHE.allowThis(encryptedCallKey);
        FHE.allowThis(encryptedSignalingData);
        FHE.allow(encryptedCallKey, invitation.from);
        FHE.allow(encryptedCallKey, msg.sender);
        FHE.allow(encryptedSignalingData, invitation.from);
        FHE.allow(encryptedSignalingData, msg.sender);

        emit CallAccepted(invitation.from, msg.sender, callId);
    }

    function declineCallInvitation(bytes32 _inviteId) external onlyRegistered {
        CallInvitation storage invitation = callInvitations[_inviteId];
        require(invitation.to == msg.sender, "Not your invitation");
        require(!invitation.isAccepted && !invitation.isDeclined, "Invitation already responded");

        invitation.isDeclined = true;

        emit CallDeclined(invitation.from, msg.sender, _inviteId);
    }

    function startVideoCall(uint256 _callId) external callExists(_callId) onlyCallParticipant(_callId) {
        VideoCall storage call = videoCalls[_callId];
        require(call.isActive && !call.isConnected, "Call not ready or already connected");

        call.isConnected = true;
        call.startTime = block.timestamp;

        emit CallStarted(_callId, call.initiator, call.recipient);
    }

    function updateSignalingData(uint256 _callId, uint32 _newSignalingData) external callExists(_callId) onlyCallParticipant(_callId) {
        VideoCall storage call = videoCalls[_callId];
        require(call.isActive, "Call not active");

        euint32 encryptedSignalingData = FHE.asEuint32(_newSignalingData);
        call.encryptedSignalingData = encryptedSignalingData;

        FHE.allowThis(encryptedSignalingData);
        FHE.allow(encryptedSignalingData, call.initiator);
        FHE.allow(encryptedSignalingData, call.recipient);

        emit SignalingDataUpdated(_callId, msg.sender);
    }

    function endVideoCall(uint256 _callId) external callExists(_callId) onlyCallParticipant(_callId) {
        VideoCall storage call = videoCalls[_callId];
        require(call.isActive, "Call already ended");

        call.isActive = false;
        call.endTime = block.timestamp;

        uint256 duration = call.endTime - call.startTime;

        emit CallEnded(_callId, duration);
    }

    function addTrustedContact(address _contact) external onlyRegistered {
        require(_contact != msg.sender, "Cannot add yourself");
        require(userProfiles[_contact].isRegistered, "Contact not registered");

        userProfiles[msg.sender].trustedContacts[_contact] = true;

        emit ContactAdded(msg.sender, _contact, true);
    }

    function blockUser(address _user) external onlyRegistered {
        require(_user != msg.sender, "Cannot block yourself");

        userProfiles[msg.sender].blockedUsers[_user] = true;

        emit UserBlocked(msg.sender, _user);
    }

    function unblockUser(address _user) external onlyRegistered {
        userProfiles[msg.sender].blockedUsers[_user] = false;
    }

    function getCallInfo(uint256 _callId) external view callExists(_callId) returns (
        address initiator,
        address recipient,
        bool isActive,
        bool isConnected,
        uint256 startTime,
        uint256 endTime
    ) {
        VideoCall storage call = videoCalls[_callId];
        return (
            call.initiator,
            call.recipient,
            call.isActive,
            call.isConnected,
            call.startTime,
            call.endTime
        );
    }

    function getUserCallHistory(address _user) external view returns (uint256[] memory) {
        return userCallHistory[_user];
    }

    function isUserRegistered(address _user) external view returns (bool) {
        return userProfiles[_user].isRegistered;
    }

    function isUserBlocked(address _blocker, address _blocked) external view returns (bool) {
        return userProfiles[_blocker].blockedUsers[_blocked];
    }

    function isTrustedContact(address _user, address _contact) external view returns (bool) {
        return userProfiles[_user].trustedContacts[_contact];
    }

    function getInvitationInfo(bytes32 _inviteId) external view returns (
        address from,
        address to,
        uint256 timestamp,
        bool isAccepted,
        bool isDeclined
    ) {
        CallInvitation storage invitation = callInvitations[_inviteId];
        return (
            invitation.from,
            invitation.to,
            invitation.timestamp,
            invitation.isAccepted,
            invitation.isDeclined
        );
    }
}