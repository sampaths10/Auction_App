// Application State
let currentRoomCode = '';
let currentTeamName = '';
let isHost = false;
let timerInterval = null;
let remainingTime = 0;
let db; // Firebase database reference
let firebaseTools; // Firebase functions

// Initialize Firebase and the app
(async function init() {
  try {
    // Import Firebase modules
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js");
    const { 
      getDatabase, 
      ref, 
      set, 
      onValue, 
      update, 
      push, 
      get, 
      off,
      runTransaction 
    } = await import("https://www.gstatic.com/firebasejs/10.11.1/firebase-database.js");

    // Firebase configuration
    const firebaseConfig = {
      apiKey: "AIzaSyAU9F5pBZY2Q91FCYp6PIpGTkP0B5nAKnU",
      authDomain: "auction-app-4fc70.firebaseapp.com",
      databaseURL: "https://auction-app-4fc70-default-rtdb.firebaseio.com",
      projectId: "auction-app-4fc70",
      storageBucket: "auction-app-4fc70.appspot.com",
      messagingSenderId: "314340623382",
      appId: "1:314340623382:web:6342f51bfe8a658d4fe137"
    };

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    firebaseTools = { ref, set, onValue, update, push, get, off, runTransaction };

    // Initialize the rest of the app
    initApp();
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    alert("Failed to initialize the app. Please refresh the page.");
  }
})();

function initApp() {
  // DOM Elements
  const startPage = document.getElementById('start-page');
  const createRoomBtn = document.getElementById('create-room-btn');
  const joinRoomBtn = document.getElementById('join-room-btn');
  const createRoomForm = document.getElementById('create-room-form');
  const joinRoomForm = document.getElementById('join-room-form');
  const cancelCreateBtn = document.getElementById('cancel-create');
  const cancelJoinBtn = document.getElementById('cancel-join');
  const createForm = document.getElementById('create-form');
  const joinForm = document.getElementById('join-form');
  const hostRoom = document.getElementById('host-room');
  const teamRoom = document.getElementById('team-room');

  // Event Listeners
  createRoomBtn.addEventListener('click', showCreateForm);
  joinRoomBtn.addEventListener('click', showJoinForm);
  cancelCreateBtn.addEventListener('click', showStartPage);
  cancelJoinBtn.addEventListener('click', showStartPage);
  createForm.addEventListener('submit', handleCreateRoom);
  joinForm.addEventListener('submit', handleJoinRoom);

  // Navigation Functions
  function showStartPage() {
    startPage.classList.remove('d-none');
    createRoomForm.classList.add('d-none');
    joinRoomForm.classList.add('d-none');
    hostRoom.classList.add('d-none');
    teamRoom.classList.add('d-none');
  }

  function showCreateForm() {
    startPage.classList.add('d-none');
    createRoomForm.classList.remove('d-none');
    joinRoomForm.classList.add('d-none');
    hostRoom.classList.add('d-none');
    teamRoom.classList.add('d-none');
  }

  function showJoinForm() {
    startPage.classList.add('d-none');
    createRoomForm.classList.add('d-none');
    joinRoomForm.classList.remove('d-none');
    hostRoom.classList.add('d-none');
    teamRoom.classList.add('d-none');
  }

  // Room Management
  async function handleCreateRoom(e) {
    e.preventDefault();
    
    const playerFile = document.getElementById('player-list').files[0];
    const startingTokens = parseInt(document.getElementById('starting-tokens').value);
    const biddingTime = parseInt(document.getElementById('bidding-time').value);
    
    if (!playerFile) {
      alert('Please upload a players list file');
      return;
    }
    
    // Generate random room code
    currentRoomCode = generateRoomCode();
    isHost = true;
    
    try {
      // Process the Excel file
      const players = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            resolve(XLSX.utils.sheet_to_json(firstSheet));
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(playerFile);
      });
      
      // Create room with the extracted data
      await createRoom(currentRoomCode, players, startingTokens, biddingTime);
    } catch (error) {
      console.error("Error processing player list:", error);
      alert("Failed to process player list. Please check the file format.");
    }
  }

  async function handleJoinRoom(e) {
    e.preventDefault();
    
    const roomCode = document.getElementById('room-code').value.toUpperCase();
    const teamName = document.getElementById('team-name').value.trim();
    
    if (!roomCode || !teamName) {
      alert('Please enter both room code and team name');
      return;
    }
    
    const joinBtn = document.querySelector('#join-form button[type="submit"]');
    joinBtn.disabled = true;
    joinBtn.textContent = "Joining...";
    
    try {
      currentRoomCode = roomCode;
      currentTeamName = teamName;
      isHost = false;
      
      await joinRoom(roomCode, teamName);
    } catch (error) {
      console.error("Join error:", error);
      alert(`Failed to join: ${error.message}`);
    } finally {
      joinBtn.disabled = false;
      joinBtn.textContent = "Join Room";
    }
  }

  function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  // Firebase Room Functions
  async function createRoom(roomCode, players, startingTokens, biddingTime) {
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    const roomData = {
      players,
      remainingPlayers: [...players],
      startingTokens,
      biddingTime,
      teams: {},
      currentPlayer: null,
      currentBid: 0,
      currentBidder: null,
      timer: null,
      bidHistory: {},
      auctionStarted: false,
      auctionEnded: false,
      createdAt: Date.now()
    };
    
    try {
      await firebaseTools.set(roomRef, roomData);
      
      // Show host room
      createRoomForm.classList.add('d-none');
      hostRoom.classList.remove('d-none');
      
      // Set room info
      document.getElementById('host-room-code').textContent = roomCode;
      document.getElementById('share-room-code').textContent = roomCode;
      
      // Set up event listeners
      document.getElementById('start-auction-btn').addEventListener('click', () => startAuction(roomCode));
      document.getElementById('next-player-btn').addEventListener('click', () => nextPlayer(roomCode));
      
      // Start listening for changes
      listenForRoomUpdates(roomCode);
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Failed to create room. Please try again.");
      showStartPage();
    }
  }

  async function joinRoom(roomCode, teamName) {
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    try {
      // First check if room exists
      const snapshot = await firebaseTools.get(roomRef);
      if (!snapshot.exists()) {
        throw new Error("Room doesn't exist");
      }
      
      const roomData = snapshot.val();
      
      // Check if team name is taken
      if (roomData.teams && roomData.teams[teamName]) {
        throw new Error("Team name already taken");
      }

      // Add team to room using transaction to prevent race conditions
      await firebaseTools.runTransaction(roomRef, (currentData) => {
        if (!currentData) {
          currentData = {
            players: [],
            remainingPlayers: [],
            startingTokens: 1000,
            biddingTime: 30,
            teams: {},
            currentPlayer: null,
            currentBid: 0,
            currentBidder: null,
            timer: null,
            bidHistory: {},
            auctionStarted: false,
            auctionEnded: false
          };
        }
        
        if (!currentData.teams) {
          currentData.teams = {};
        }
        
        currentData.teams[teamName] = {
          tokens: currentData.startingTokens,
          players: []
        };
        
        return currentData;
      });
      
      // Show team room
      joinRoomForm.classList.add('d-none');
      teamRoom.classList.remove('d-none');
      
      // Set team info
      document.getElementById('team-name-display').textContent = teamName;
      document.getElementById('team-tokens-display').textContent = roomData.startingTokens;
      
      // Set up event listeners
      document.getElementById('place-bid-btn').addEventListener('click', () => placeBid(roomCode, teamName));
      
      // Start listening for updates
      listenForRoomUpdates(roomCode);
    } catch (error) {
      console.error("Join error:", error);
      throw error;
    }
  }

  function listenForRoomUpdates(roomCode) {
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    // Remove any existing listener first
    firebaseTools.onValue(roomRef, (snapshot) => {
      const roomData = snapshot.val();
      if (!roomData) return;
      
      // Update timer for all users
      if (roomData.currentPlayer && roomData.timer !== null) {
        remainingTime = roomData.timer;
        updateTimerDisplay(roomCode);
      }
      
      if (isHost) {
        updateHostDisplay(roomCode, roomData);
      } else if (currentTeamName) {
        updateTeamDisplay(roomCode, currentTeamName, roomData);
      }
      
      // Check if auction has ended
      if ((!roomData.remainingPlayers || roomData.remainingPlayers.length === 0) && 
          (!roomData.currentPlayer || roomData.currentPlayer === null)) {
        const updates = {
          auctionEnded: true
        };
        firebaseTools.update(roomRef, updates);
        showAuctionResults(roomCode, roomData);
      }
    });
  }

  // Auction Functions
  async function startAuction(roomCode) {
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    try {
      await firebaseTools.update(roomRef, {
        auctionStarted: true
      });
      
      // Update UI for host
      document.getElementById('host-controls').classList.add('d-none');
      document.getElementById('host-auction-area').classList.remove('d-none');
      
      // Start with first player
      await nextPlayer(roomCode);
    } catch (error) {
      console.error("Error starting auction:", error);
      alert("Failed to start auction. Please try again.");
    }
  }

  async function nextPlayer(roomCode) {
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    try {
      const snapshot = await firebaseTools.get(roomRef);
      const roomData = snapshot.val();
      if (!roomData) return;
      
      // Check if there are no remaining players
      if (!roomData.remainingPlayers || roomData.remainingPlayers.length === 0) {
        // Auction ended
        await firebaseTools.update(roomRef, {
          auctionEnded: true,
          currentPlayer: null,
          currentBid: 0,
          currentBidder: null,
          timer: null
        });
        
        showAuctionResults(roomCode, roomData);
        
        // Show alert only to host
        if (isHost) {
          alert('All players have been auctioned! Showing results...');
        }
        return;
      }
      
      // Select random player
      const randomIndex = Math.floor(Math.random() * roomData.remainingPlayers.length);
      const currentPlayer = roomData.remainingPlayers[randomIndex];
      const remainingPlayers = [...roomData.remainingPlayers];
      remainingPlayers.splice(randomIndex, 1);
      
      await firebaseTools.update(roomRef, {
        currentPlayer,
        remainingPlayers,
        currentBid: 0,
        currentBidder: null,
        bidHistory: {},
        timer: roomData.biddingTime
      });
      
      // Start bid timer with configured time
      if (isHost) {
        startBidTimer(roomCode, roomData.biddingTime);
      } else {
        remainingTime = roomData.biddingTime;
        updateTimerDisplay(roomCode);
      }
    } catch (error) {
      console.error("Error moving to next player:", error);
      // If error occurs, try to show results anyway
      if (isHost) {
        const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
        await firebaseTools.update(roomRef, {
          auctionEnded: true,
          currentPlayer: null,
          currentBid: 0,
          currentBidder: null,
          timer: null
        });
        showAuctionResults(roomCode);
      }
    }
  }

  function startBidTimer(roomCode, seconds) {
    // Clear any existing timer
    if (timerInterval) clearInterval(timerInterval);
    
    remainingTime = seconds;
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    // Initial timer update
    firebaseTools.update(roomRef, { timer: remainingTime });
    updateTimerDisplay(roomCode);
    
    timerInterval = setInterval(async () => {
      remainingTime--;
      
      try {
        // Update timer in Firebase
        await firebaseTools.update(roomRef, { timer: remainingTime });
        updateTimerDisplay(roomCode);
        
        if (remainingTime <= 0) {
          clearInterval(timerInterval);
          await finalizePlayer(roomCode);
        }
      } catch (error) {
        console.error("Timer update error:", error);
        clearInterval(timerInterval);
      }
    }, 1000);
  }

  function updateTimerDisplay(roomCode) {
    const hostTimer = document.getElementById('host-bid-timer');
    const teamTimer = document.getElementById('team-bid-timer');
    
    if (hostTimer) hostTimer.textContent = remainingTime;
    if (teamTimer) teamTimer.textContent = remainingTime;
  }

  async function placeBid(roomCode, teamName) {
    const bidAmount = parseInt(document.getElementById('bid-amount').value);
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    if (!bidAmount || isNaN(bidAmount)) {
      alert('Please enter a valid bid amount');
      return;
    }
    
    try {
      const snapshot = await firebaseTools.get(roomRef);
      const roomData = snapshot.val();
      if (!roomData) return;
      
      // Validate bid
      if (bidAmount <= roomData.currentBid) {
        throw new Error(`Bid must be higher than current bid (${roomData.currentBid})`);
      }
      
      const teamTokens = roomData.teams?.[teamName]?.tokens || roomData.startingTokens;
      if (bidAmount > teamTokens) {
        throw new Error('Not enough tokens for this bid');
      }
      
      // Create new bid history entry
      const newBid = {
        team: teamName,
        amount: bidAmount,
        time: new Date().toLocaleTimeString()
      };
      
      // Update current bid and add to history
      await Promise.all([
        firebaseTools.update(roomRef, {
          currentBid: bidAmount,
          currentBidder: teamName
        }),
        firebaseTools.push(firebaseTools.ref(db, `auctions/${roomCode}/bidHistory`), newBid)
      ]);
      
      document.getElementById('bid-amount').value = '';
    } catch (error) {
      console.error("Error placing bid:", error);
      alert(error.message);
    }
  }

  async function finalizePlayer(roomCode) {
    const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
    
    try {
      const snapshot = await firebaseTools.get(roomRef);
      const roomData = snapshot.val();
      if (!roomData || !roomData.currentBidder) return;
      
      // Assign player to winning team
      const winningTeam = roomData.currentBidder;
      const teamPlayers = [...(roomData.teams?.[winningTeam]?.players || [])];
      teamPlayers.push(roomData.currentPlayer);
      
      await firebaseTools.update(roomRef, {
        [`teams/${winningTeam}/players`]: teamPlayers,
        [`teams/${winningTeam}/tokens`]: (roomData.teams?.[winningTeam]?.tokens || roomData.startingTokens) - roomData.currentBid,
        currentPlayer: null,
        currentBid: 0,
        currentBidder: null,
        timer: null
      });
      
      // Move to next player
      await nextPlayer(roomCode);
    } catch (error) {
      console.error("Error finalizing player:", error);
    }
  }

  // Results Display Function
  function showAuctionResults(roomCode, roomData) {
    if (!roomData) {
      // If no data provided, try to get it
      const roomRef = firebaseTools.ref(db, `auctions/${roomCode}`);
      firebaseTools.get(roomRef).then((snapshot) => {
        showAuctionResults(roomCode, snapshot.val());
      });
      return;
    }

    // Hide auction area and show results
    if (isHost) {
      document.getElementById('host-auction-area').classList.add('d-none');
      document.getElementById('host-results').classList.remove('d-none');
    } else {
      document.getElementById('team-auction-area').classList.add('d-none');
      document.getElementById('team-results').classList.remove('d-none');
    }

    // Prepare and display results
    const resultsBodyId = isHost ? 'host-results-body' : 'team-results-body';
    const resultsBody = document.getElementById(resultsBodyId);
    
    let sno = 1;
    resultsBody.innerHTML = Object.entries(roomData.teams || {}).map(([teamName, team]) => {
      const playersList = (team.players || []).map(player => {
        const posClass = getPositionClass(player?.Position);
        return `
          <span class="player-badge ${posClass}">
            ${player?.Name || 'Unknown'} (${player?.Position || 'All'})
          </span>
        `;
      }).join('');
      
      return `
        <tr>
          <td>${sno++}</td>
          <td><strong>${teamName}</strong></td>
          <td>${playersList || 'No players'}</td>
          <td>${team.tokens || 0}</td>
        </tr>
      `;
    }).join('');
  }

  // Helper Functions
  function countPositions(players = []) {
    let counts = { Front: 0, Center: 0, Back: 0 };
    players.forEach(player => {
      const pos = player?.Position || 'Center';
      if (pos.toLowerCase().includes('front')) counts.Front++;
      else if (pos.toLowerCase().includes('back')) counts.Back++;
      else counts.Center++;
    });
    return counts;
  }

  function getPositionClass(position) {
    if (!position) return 'position-badge-center';
    position = position.toLowerCase();
    if (position.includes('front')) return 'position-badge-front';
    if (position.includes('back')) return 'position-badge-back';
    return 'position-badge-center';
  }

  // Display Update Functions
  function updateHostDisplay(roomCode, roomData) {
    if (!roomData) return;
    
    // Update teams count
    const teamsCount = Object.keys(roomData.teams || {}).length;
    document.getElementById('teams-count-badge').textContent = `${teamsCount} Team${teamsCount !== 1 ? 's' : ''} Joined`;
    
    // Update teams list with position counts
    const teamsList = document.getElementById('host-teams-list');
    teamsList.innerHTML = Object.entries(roomData.teams || {}).map(([name, team]) => {
      const counts = countPositions(team.players || []);
      return `
        <div class="team-item">
          <span><strong>${name}</strong></span>
          <span>${(team.players || []).length} players (${counts.Front}F ${counts.Center}C ${counts.Back}B) | ${team.tokens} tokens</span>
        </div>
      `;
    }).join('');
    
    // Update current player display
    const currentPlayerDisplay = document.getElementById('host-current-player');
    if (roomData.currentPlayer) {
      const playerImage = roomData.currentPlayer.PhotoURL ? 
        `<img src="${roomData.currentPlayer.PhotoURL}" alt="${roomData.currentPlayer.Name}" class="player-image">` :
        `<div class="player-image-placeholder">${(roomData.currentPlayer.Name || 'P').charAt(0)}</div>`;
      
      currentPlayerDisplay.innerHTML = `
        ${playerImage}
        <h5>${roomData.currentPlayer.Name || 'Unknown Player'}</h5>
        <p>${roomData.currentPlayer.Position || 'All-rounder'} | Base Price: ${roomData.currentPlayer.BasePrice || '100'}</p>
      `;
      
      document.getElementById('host-current-bid').textContent = 
        roomData.currentBid > 0 
          ? `Current bid: ${roomData.currentBid} by ${roomData.currentBidder}`
          : "No bids yet";
          
      // Update bid history
      const bidHistoryContainer = document.getElementById('host-bid-history');
      bidHistoryContainer.innerHTML = '';
      
      if (roomData.bidHistory && typeof roomData.bidHistory === 'object') {
        Object.values(roomData.bidHistory).forEach(bid => {
          if (bid) {
            const bidItem = document.createElement('div');
            bidItem.className = 'bid-history-item';
            bidItem.textContent = `${bid.team} bid ${bid.amount} at ${bid.time}`;
            bidHistoryContainer.appendChild(bidItem);
          }
        });
      }
    } else {
      currentPlayerDisplay.innerHTML = '<p>No player selected yet</p>';
    }
  }

  function updateTeamDisplay(roomCode, teamName, roomData) {
    if (!roomData) return;
    
    // Update team info
    document.getElementById('team-tokens-display').textContent = 
      roomData.teams?.[teamName]?.tokens || roomData.startingTokens;
    
    // Show/hide auction area based on auction status
    if (roomData.auctionStarted && !roomData.auctionEnded) {
      document.getElementById('team-waiting').classList.add('d-none');
      document.getElementById('team-auction-area').classList.remove('d-none');
    } else if (roomData.auctionEnded) {
      showAuctionResults(roomCode, roomData);
    } else {
      document.getElementById('team-waiting').classList.remove('d-none');
      document.getElementById('team-auction-area').classList.add('d-none');
    }
    
    // Update current player display
    const currentPlayerDisplay = document.getElementById('team-current-player');
    if (roomData.currentPlayer) {
      const playerImage = roomData.currentPlayer.PhotoURL ? 
        `<img src="${roomData.currentPlayer.PhotoURL}" alt="${roomData.currentPlayer.Name}" class="player-image">` :
        `<div class="player-image-placeholder">${(roomData.currentPlayer.Name || 'P').charAt(0)}</div>`;
      
      currentPlayerDisplay.innerHTML = `
        ${playerImage}
        <h5>${roomData.currentPlayer.Name || 'Unknown Player'}</h5>
        <p>${roomData.currentPlayer.Position || 'All-rounder'} | Base Price: ${roomData.currentPlayer.BasePrice || '100'}</p>
      `;
      
      document.getElementById('team-current-bid').textContent = 
        roomData.currentBid > 0 
          ? `Current bid: ${roomData.currentBid} by ${roomData.currentBidder}`
          : "No bids yet";
          
      // Update bid history
      const bidHistoryContainer = document.getElementById('team-bid-history');
      bidHistoryContainer.innerHTML = '';
      
      if (roomData.bidHistory && typeof roomData.bidHistory === 'object') {
        Object.values(roomData.bidHistory).forEach(bid => {
          if (bid) {
            const bidItem = document.createElement('div');
            bidItem.className = 'bid-history-item';
            bidItem.textContent = `${bid.team} bid ${bid.amount}`;
            bidHistoryContainer.appendChild(bidItem);
          }
        });
      }
    } else {
      currentPlayerDisplay.innerHTML = '<p>No player selected yet</p>';
    }
    
    // Update team roster with position badges
    const teamRoster = document.getElementById('team-roster');
    const teamPlayers = roomData.teams?.[teamName]?.players || [];
    if (teamPlayers.length > 0) {
      teamRoster.innerHTML = teamPlayers.map(player => {
        const posClass = getPositionClass(player?.Position);
        return `
          <div class="team-item">
            <div>
              <strong>${player?.Name || 'Unknown'}</strong>
              <span class="badge ${posClass}">${player?.Position || 'All'}</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      teamRoster.innerHTML = '<p>No players yet</p>';
    }
  }
}