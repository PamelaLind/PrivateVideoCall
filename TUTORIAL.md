# Hello FHEVM: Your First Confidential dApp Tutorial

Welcome to the complete beginner's guide to building your first confidential application using Fully Homomorphic Encryption Virtual Machine (FHEVM). This tutorial will guide you step-by-step through creating a privacy-preserving video calling system.

## 🎯 What You'll Learn

By the end of this tutorial, you'll understand:
- What FHEVM is and why it matters for privacy
- How to write smart contracts with encrypted data
- Building a frontend that interacts with confidential contracts
- Creating your first complete confidential dApp

## 📋 Prerequisites

Before starting, you should have:
- Basic Solidity knowledge (writing simple smart contracts)
- Familiarity with JavaScript/React
- Experience with MetaMask and Web3 tools
- **No FHE or cryptography knowledge required!**

## 🌟 What We're Building

We'll create a **Private Video Call System** that demonstrates key FHEVM concepts:
- Encrypted user registration
- Confidential call session management
- Privacy-preserving user authentication
- Secure data handling on-chain

## 📚 Table of Contents

1. [Understanding FHEVM](#understanding-fhevm)
2. [Project Setup](#project-setup)
3. [Writing Your First FHE Smart Contract](#writing-your-first-fhe-smart-contract)
4. [Building the Frontend](#building-the-frontend)
5. [Connecting Frontend to Contract](#connecting-frontend-to-contract)
6. [Testing Your dApp](#testing-your-dapp)
7. [Next Steps](#next-steps)

---

## Understanding FHEVM

### What is FHEVM?

FHEVM (Fully Homomorphic Encryption Virtual Machine) allows you to perform computations on encrypted data without ever decrypting it. Think of it as a magic box where you can:

- Put encrypted data in
- Perform operations on it
- Get encrypted results out
- Never expose the original data

### Why Does This Matter?

Traditional blockchains expose all data publicly. With FHEVM:
- ✅ Data stays private on a public blockchain
- ✅ Smart contracts can process sensitive information
- ✅ Users maintain control over their privacy
- ✅ Regulatory compliance becomes possible

### Key Concepts (No Math Required!)

**Encrypted Types**: Instead of `uint256`, you use `euint256` (encrypted uint256)
**Access Control**: Only authorized users can decrypt specific data
**Computations**: Math operations work on encrypted data directly

---

## Project Setup

### Step 1: Initialize Your Project

```bash
mkdir private-video-call
cd private-video-call
npm init -y
```

### Step 2: Install Dependencies

```bash
# Core dependencies
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install fhevmjs dotenv

# Frontend dependencies
npm install react react-dom react-scripts web3 @metamask/detect-provider
```

### Step 3: Initialize Hardhat

```bash
npx hardhat init
```

Choose "Create a JavaScript project" and accept all defaults.

### Step 4: Project Structure

Your project should look like this:
```
private-video-call/
├── contracts/
│   └── PrivateVideoCall.sol
├── scripts/
│   └── deploy.js
├── public/
│   └── index.html
├── src/
│   ├── App.js
│   ├── components/
│   └── utils/
└── hardhat.config.js
```

---

## Writing Your First FHE Smart Contract

### Step 1: Understanding FHE Contract Basics

Create `contracts/PrivateVideoCall.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "fhevm/lib/TFHE.sol";
import "fhevm/abstracts/EIP712WithModifier.sol";

contract PrivateVideoCall is EIP712WithModifier {
    // Encrypted user data structure
    struct EncryptedUser {
        euint32 userId;          // Encrypted user ID
        euint8 status;           // Encrypted status (online/offline)
        bool isRegistered;       // Public registration flag
    }

    // Encrypted call session structure
    struct EncryptedCallSession {
        euint32 callId;          // Encrypted call ID
        euint32 hostId;          // Encrypted host user ID
        euint8 participantCount; // Encrypted participant count
        euint64 startTime;       // Encrypted start timestamp
        bool isActive;           // Public active flag
    }

    mapping(address => EncryptedUser) private users;
    mapping(uint256 => EncryptedCallSession) private callSessions;

    uint256 public totalUsers;
    uint256 public totalCalls;

    event UserRegistered(address indexed user);
    event CallCreated(uint256 indexed callId, address indexed host);
    event CallJoined(uint256 indexed callId, address indexed participant);

    constructor() EIP712WithModifier("PrivateVideoCall", "1") {}
}
```

### Step 2: Understanding Encrypted Types

Let's break down what makes this "confidential":

```solidity
// ❌ Traditional (public) approach:
uint32 public userId = 12345;  // Everyone can see this!

// ✅ FHEVM (private) approach:
euint32 private userId = TFHE.asEuint32(12345);  // Encrypted!
```

**Key Points**:
- `euint32` = encrypted 32-bit unsigned integer
- `euint8` = encrypted 8-bit unsigned integer
- `euint64` = encrypted 64-bit unsigned integer
- Data is encrypted when stored, computed on while encrypted

### Step 3: Adding Core Functions

Add these functions to your contract:

```solidity
// Register a new user with encrypted data
function registerUser(bytes calldata encryptedUserId) external {
    require(!users[msg.sender].isRegistered, "User already registered");

    // Convert encrypted input to euint32
    euint32 userId = TFHE.asEuint32(encryptedUserId);

    users[msg.sender] = EncryptedUser({
        userId: userId,
        status: TFHE.asEuint8(1), // 1 = online, 0 = offline
        isRegistered: true
    });

    totalUsers++;
    emit UserRegistered(msg.sender);
}

// Create a new call session
function createCall(bytes calldata encryptedCallId) external {
    require(users[msg.sender].isRegistered, "User not registered");

    euint32 callId = TFHE.asEuint32(encryptedCallId);
    uint256 publicCallId = totalCalls;

    callSessions[publicCallId] = EncryptedCallSession({
        callId: callId,
        hostId: users[msg.sender].userId,
        participantCount: TFHE.asEuint8(1),
        startTime: TFHE.asEuint64(block.timestamp),
        isActive: true
    });

    totalCalls++;
    emit CallCreated(publicCallId, msg.sender);
}

// Join an existing call
function joinCall(uint256 publicCallId) external {
    require(users[msg.sender].isRegistered, "User not registered");
    require(callSessions[publicCallId].isActive, "Call not active");

    // Increment participant count (on encrypted data!)
    callSessions[publicCallId].participantCount = TFHE.add(
        callSessions[publicCallId].participantCount,
        TFHE.asEuint8(1)
    );

    emit CallJoined(publicCallId, msg.sender);
}
```

### Step 4: Adding Access Control

FHEVM includes powerful access control features:

```solidity
// Allow user to decrypt their own data
function getUserStatus() external view returns (bytes memory) {
    require(users[msg.sender].isRegistered, "User not registered");

    // User can only decrypt their own status
    return TFHE.decrypt(users[msg.sender].status);
}

// Allow call host to see participant count
function getParticipantCount(uint256 publicCallId)
    external
    view
    returns (bytes memory)
{
    require(callSessions[publicCallId].isActive, "Call not active");

    // Check if caller is the host (encrypted comparison!)
    ebool isHost = TFHE.eq(
        callSessions[publicCallId].hostId,
        users[msg.sender].userId
    );

    // Only decrypt if caller is host
    return TFHE.decrypt(
        TFHE.cmux(
            isHost,
            callSessions[publicCallId].participantCount,
            TFHE.asEuint8(0)
        )
    );
}
```

### Step 5: Understanding FHE Operations

FHEVM supports encrypted operations:

```solidity
// Encrypted arithmetic
euint32 a = TFHE.asEuint32(10);
euint32 b = TFHE.asEuint32(5);
euint32 sum = TFHE.add(a, b);        // Encrypted addition
euint32 product = TFHE.mul(a, b);    // Encrypted multiplication

// Encrypted comparisons
ebool isEqual = TFHE.eq(a, b);       // Encrypted equality check
ebool isGreater = TFHE.gt(a, b);     // Encrypted greater than

// Encrypted conditional (ternary)
euint32 result = TFHE.cmux(
    isGreater,  // condition (encrypted boolean)
    a,          // value if true
    b           // value if false
);
```

---

## Building the Frontend

### Step 1: Setting Up React App

Create `src/App.js`:

```javascript
import React, { useState, useEffect } from 'react';
import { initFhevm, createInstance } from 'fhevmjs';
import detectEthereumProvider from '@metamask/detect-provider';
import Web3 from 'web3';

// Import your contract ABI (generated after compilation)
import contractABI from './contracts/PrivateVideoCall.json';

const CONTRACT_ADDRESS = 'YOUR_DEPLOYED_CONTRACT_ADDRESS';

function App() {
  const [web3, setWeb3] = useState(null);
  const [account, setAccount] = useState('');
  const [contract, setContract] = useState(null);
  const [fhevmInstance, setFhevmInstance] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);

  // Initialize Web3 and FHEVM
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize FHEVM
      await initFhevm();
      const instance = await createInstance({
        chainId: 8009, // Zama testnet
        publicKey: 'YOUR_NETWORK_PUBLIC_KEY'
      });
      setFhevmInstance(instance);

      // Initialize Web3
      const provider = await detectEthereumProvider();
      if (provider) {
        const web3Instance = new Web3(provider);
        setWeb3(web3Instance);

        // Get accounts
        const accounts = await web3Instance.eth.getAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        }

        // Initialize contract
        const contractInstance = new web3Instance.eth.Contract(
          contractABI.abi,
          CONTRACT_ADDRESS
        );
        setContract(contractInstance);
      }
    } catch (error) {
      console.error('Initialization error:', error);
    }
  };

  return (
    <div className="App">
      <header>
        <h1>Private Video Call System</h1>
        <p>Your First Confidential dApp</p>
      </header>

      <main>
        {account ? (
          <UserDashboard
            web3={web3}
            account={account}
            contract={contract}
            fhevmInstance={fhevmInstance}
          />
        ) : (
          <ConnectWallet onConnect={connectWallet} />
        )}
      </main>
    </div>
  );

  async function connectWallet() {
    try {
      await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      initializeApp();
    } catch (error) {
      console.error('Connection error:', error);
    }
  }
}

export default App;
```

### Step 2: Creating User Dashboard Component

Create `src/components/UserDashboard.js`:

```javascript
import React, { useState, useEffect } from 'react';

function UserDashboard({ web3, account, contract, fhevmInstance }) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [userStatus, setUserStatus] = useState('offline');
  const [activeCalls, setActiveCalls] = useState([]);

  useEffect(() => {
    checkRegistration();
    loadActiveCalls();
  }, [contract, account]);

  const checkRegistration = async () => {
    try {
      // This is a public check - no encryption needed
      const totalUsers = await contract.methods.totalUsers().call();
      // In a real app, you'd have a mapping to check specific user
      setIsRegistered(totalUsers > 0);
    } catch (error) {
      console.error('Registration check error:', error);
    }
  };

  const registerUser = async () => {
    try {
      // Generate a random encrypted user ID
      const userId = Math.floor(Math.random() * 10000);

      // Encrypt the user ID using FHEVM
      const encryptedUserId = fhevmInstance.encrypt32(userId);

      // Send transaction
      await contract.methods
        .registerUser(encryptedUserId)
        .send({ from: account });

      setIsRegistered(true);
      alert('Registration successful!');
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed: ' + error.message);
    }
  };

  const createCall = async () => {
    try {
      // Generate encrypted call ID
      const callId = Math.floor(Math.random() * 100000);
      const encryptedCallId = fhevmInstance.encrypt32(callId);

      await contract.methods
        .createCall(encryptedCallId)
        .send({ from: account });

      alert('Call created successfully!');
      loadActiveCalls();
    } catch (error) {
      console.error('Create call error:', error);
      alert('Failed to create call: ' + error.message);
    }
  };

  const joinCall = async (publicCallId) => {
    try {
      await contract.methods
        .joinCall(publicCallId)
        .send({ from: account });

      alert('Joined call successfully!');
      loadActiveCalls();
    } catch (error) {
      console.error('Join call error:', error);
      alert('Failed to join call: ' + error.message);
    }
  };

  const loadActiveCalls = async () => {
    try {
      const totalCalls = await contract.methods.totalCalls().call();
      const calls = [];

      for (let i = 0; i < totalCalls; i++) {
        // In a real app, you'd check if call is still active
        calls.push({ id: i, participants: '?' }); // Encrypted data
      }

      setActiveCalls(calls);
    } catch (error) {
      console.error('Load calls error:', error);
    }
  };

  if (!isRegistered) {
    return (
      <div className="registration">
        <h2>Welcome to Private Video Calls</h2>
        <p>Register to start making confidential video calls</p>
        <button onClick={registerUser}>
          Register with Encrypted Identity
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>Your Private Dashboard</h2>
      <p>Account: {account}</p>

      <div className="actions">
        <button onClick={createCall}>Create New Call</button>
      </div>

      <div className="active-calls">
        <h3>Available Calls</h3>
        {activeCalls.length === 0 ? (
          <p>No active calls</p>
        ) : (
          activeCalls.map(call => (
            <div key={call.id} className="call-item">
              <span>Call #{call.id}</span>
              <span>Participants: {call.participants}</span>
              <button onClick={() => joinCall(call.id)}>
                Join Call
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default UserDashboard;
```

---

## Connecting Frontend to Contract

### Step 1: Handle Encrypted Data

The key difference in FHEVM dApps is handling encrypted data:

```javascript
// ❌ Traditional approach:
const value = 12345;
await contract.methods.setValue(value).send({ from: account });

// ✅ FHEVM approach:
const value = 12345;
const encryptedValue = fhevmInstance.encrypt32(value); // Encrypt first!
await contract.methods.setValue(encryptedValue).send({ from: account });
```

### Step 2: Understanding Encryption/Decryption

```javascript
// Encryption (frontend → contract)
const sensitiveData = 42;
const encrypted = fhevmInstance.encrypt32(sensitiveData);

// Decryption (contract → frontend)
// Note: Only authorized users can decrypt
const encryptedResult = await contract.methods.getMyData().call();
const decrypted = fhevmInstance.decrypt(encryptedResult);
```

### Step 3: Error Handling

FHEVM operations can fail in unique ways:

```javascript
const handleEncryptedTransaction = async (data) => {
  try {
    // Always validate before encrypting
    if (!data || data < 0) {
      throw new Error('Invalid data for encryption');
    }

    // Encrypt data
    const encrypted = fhevmInstance.encrypt32(data);

    // Send transaction
    const tx = await contract.methods
      .processEncryptedData(encrypted)
      .send({ from: account });

    console.log('Transaction successful:', tx.transactionHash);
  } catch (error) {
    if (error.message.includes('revert')) {
      alert('Transaction reverted - check access permissions');
    } else if (error.message.includes('encryption')) {
      alert('Encryption failed - check your data');
    } else {
      alert('Unknown error: ' + error.message);
    }
  }
};
```

---

## Testing Your dApp

### Step 1: Deploy Contract

Create `scripts/deploy.js`:

```javascript
const hre = require("hardhat");

async function main() {
  console.log("Deploying PrivateVideoCall contract...");

  const PrivateVideoCall = await hre.ethers.getContractFactory("PrivateVideoCall");
  const contract = await PrivateVideoCall.deploy();

  await contract.deployed();

  console.log("PrivateVideoCall deployed to:", contract.address);

  // Save address for frontend
  const fs = require('fs');
  const contractInfo = {
    address: contract.address,
    abi: contract.interface.format('json')
  };

  fs.writeFileSync(
    'src/contracts/PrivateVideoCall.json',
    JSON.stringify(contractInfo, null, 2)
  );

  console.log("Contract info saved to src/contracts/PrivateVideoCall.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Deploy to Zama testnet:

```bash
npx hardhat run scripts/deploy.js --network zama
```

### Step 2: Test Encrypted Operations

Create simple tests to verify your understanding:

```javascript
// Test file: test/PrivateVideoCall.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateVideoCall", function() {
  let contract;
  let owner, user1, user2;

  beforeEach(async function() {
    [owner, user1, user2] = await ethers.getSigners();

    const PrivateVideoCall = await ethers.getContractFactory("PrivateVideoCall");
    contract = await PrivateVideoCall.deploy();
    await contract.deployed();
  });

  it("Should register users with encrypted data", async function() {
    // This test verifies encrypted registration works
    const encryptedUserId = ethers.utils.randomBytes(32);

    await expect(
      contract.connect(user1).registerUser(encryptedUserId)
    ).to.emit(contract, "UserRegistered");

    expect(await contract.totalUsers()).to.equal(1);
  });

  it("Should create encrypted call sessions", async function() {
    // Register user first
    await contract.connect(user1).registerUser(ethers.utils.randomBytes(32));

    // Create call
    const encryptedCallId = ethers.utils.randomBytes(32);
    await expect(
      contract.connect(user1).createCall(encryptedCallId)
    ).to.emit(contract, "CallCreated");

    expect(await contract.totalCalls()).to.equal(1);
  });
});
```

Run tests:
```bash
npx hardhat test
```

---

## Next Steps

Congratulations! You've built your first confidential dApp. Here's what you can explore next:

### 🚀 Advanced FHEVM Features

1. **Complex Encrypted Operations**
   ```solidity
   // Encrypted conditional logic
   euint32 result = TFHE.cmux(
     TFHE.gt(encryptedAge, TFHE.asEuint32(18)),
     TFHE.asEuint32(1), // adult
     TFHE.asEuint32(0)  // minor
   );
   ```

2. **Batch Operations**
   ```solidity
   // Process multiple encrypted values
   function processBatch(bytes[] calldata encryptedValues) external {
     for (uint i = 0; i < encryptedValues.length; i++) {
       euint32 value = TFHE.asEuint32(encryptedValues[i]);
       // Process each encrypted value
     }
   }
   ```

3. **Access Control Lists**
   ```solidity
   // Grant decryption access to specific users
   mapping(address => mapping(address => bool)) decryptionAccess;

   function grantAccess(address user) external {
     decryptionAccess[msg.sender][user] = true;
   }
   ```

### 🛠️ Production Considerations

1. **Gas Optimization**: FHE operations are more expensive
2. **Key Management**: Secure handling of encryption keys
3. **Privacy Patterns**: Design patterns for maximum privacy
4. **Audit Requirements**: Security considerations for encrypted data

### 📚 Additional Resources

- [FHEVM Documentation](https://docs.fhevm.org)
- [Zama Developer Portal](https://docs.zama.ai)
- [FHE Examples Repository](https://github.com/zama-ai/fhevm)
- [Community Discord](https://discord.gg/zama)

### 🎯 Challenge Ideas

Try building these confidential dApps:
1. **Private Voting System** - Encrypted votes, public results
2. **Confidential Auction** - Hidden bids until reveal
3. **Private DeFi** - Encrypted balances and trades
4. **Secure Messaging** - End-to-end encrypted chat

---

## 🎉 Conclusion

You've successfully:
- ✅ Built your first FHEVM smart contract
- ✅ Created a privacy-preserving frontend
- ✅ Understood encrypted data handling
- ✅ Deployed a confidential dApp

**Key Takeaways**:
- FHEVM enables computation on encrypted data
- No cryptography expertise required to get started
- Privacy-first development is the future of Web3
- Your journey into confidential computing has just begun!

---

**🔗 Repository**: [https://github.com/PamelaLind/PrivateVideoCall](https://github.com/PamelaLind/PrivateVideoCall)

**🌐 Live Demo**: [https://private-video-call-kio7.vercel.app/](https://private-video-call-kio7.vercel.app/)

---

*Happy building with FHEVM! 🚀*