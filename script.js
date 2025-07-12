// Application State
let currentRoomCode = '';
let currentTeamName = '';
let isHost = false;
let timerInterval = null;
let remainingTime = 0;

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

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    // Event Listeners
    createRoomBtn.addEventListener('click', showCreateForm);
    joinRoomBtn.addEventListener('click', showJoinForm);
    cancelCreateBtn.addEventListener('click', showStartPage);
    cancelJoinBtn.addEventListener('click', showStartPage);
    createForm.addEventListener('submit', handleCreateRoom);
    joinForm.addEventListener('submit', handleJoinRoom);
});

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
function handleCreateRoom(e) {
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
    
    // Process the Excel file
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const players = XLSX.utils.sheet_to_json(firstSheet);
        
        // Create room with the extracted data
        createRoom(currentRoomCode, players, startingTokens, biddingTime);
    };
    reader.readAsArrayBuffer(playerFile);
}

function handleJoinRoom(e) {
    e.preventDefault();
    
    const roomCode = document.getElementById('room-code').value.toUpperCase();
    const teamName = document.getElementById('team-name').value.trim();
    
    if (!roomCode || !teamName) {
        alert('Please enter both room code and team name');
        return;
    }
    
    currentRoomCode = roomCode;
    currentTeamName = teamName;
    isHost = false;
    
    joinRoom(roomCode, teamName);
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Firebase Room Functions
function createRoom(roomCode, players, startingTokens, biddingTime) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
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
        bidHistory: [],
        auctionStarted: false,
        auctionEnded: false,
        createdAt: Date.now()
    };
    
    firebase.set(roomRef, roomData)
        .then(() => {
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
        })
        .catch((error) => {
            console.error("Error creating room:", error);
            alert("Failed to create room. Please try again.");
        });
}

function joinRoom(roomCode, teamName) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        
        if (!roomData) {
            alert('Room not found. Please check the room code.');
            return;
        }
        
        // Check if team already exists
        if (!roomData.teams[teamName]) {
            // Add team to room
            const updates = {};
            updates[`teams/${teamName}`] = {
                tokens: roomData.startingTokens,
                players: []
            };
            
            firebase.update(roomRef, updates)
                .catch((error) => {
                    console.error("Error joining room:", error);
                    alert("Failed to join room. Please try again.");
                });
        }
        
        // Show team room
        joinRoomForm.classList.add('d-none');
        teamRoom.classList.remove('d-none');
        
        // Set team info
        document.getElementById('team-name-display').textContent = teamName;
        document.getElementById('team-tokens-display').textContent = 
            roomData.teams[teamName]?.tokens || roomData.startingTokens;
        
        // Set up event listeners
        document.getElementById('place-bid-btn').addEventListener('click', () => placeBid(roomCode, teamName));
        
        // Initialize UI based on auction state
        if (roomData.auctionStarted && !roomData.auctionEnded) {
            document.getElementById('team-waiting').classList.add('d-none');
            document.getElementById('team-auction-area').classList.remove('d-none');
        } else if (roomData.auctionEnded) {
            showAuctionResults(roomCode);
        } else {
            document.getElementById('team-waiting').classList.remove('d-none');
            document.getElementById('team-auction-area').classList.add('d-none');
        }
        
        updateTeamDisplay(roomCode, teamName);
    });
}

function listenForRoomUpdates(roomCode) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        // Update timer for all users
        if (roomData.currentPlayer && roomData.timer !== null) {
            remainingTime = roomData.timer;
            updateTimerDisplay(roomCode);
        }
        
        if (isHost) {
            updateHostDisplay(roomCode);
        } else if (currentTeamName) {
            // Make sure team screen updates when auction starts
            if (roomData.auctionStarted && !roomData.auctionEnded) {
                document.getElementById('team-waiting').classList.add('d-none');
                document.getElementById('team-auction-area').classList.remove('d-none');
            }
            updateTeamDisplay(roomCode, currentTeamName);
        }
        
        // Check if auction has ended
        if (roomData.remainingPlayers && roomData.remainingPlayers.length === 0 && 
            (!roomData.currentPlayer || roomData.currentPlayer === null)) {
            const updates = {
                auctionEnded: true
            };
            firebase.update(roomRef, updates);
            showAuctionResults(roomCode);
        }
    });
}

// Auction Functions
function startAuction(roomCode) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    const updates = {
        auctionStarted: true
    };
    
    firebase.update(roomRef, updates)
        .then(() => {
            // Update UI for host
            document.getElementById('host-controls').classList.add('d-none');
            document.getElementById('host-auction-area').classList.remove('d-none');
            
            // Start with first player
            nextPlayer(roomCode);
        })
        .catch((error) => {
            console.error("Error starting auction:", error);
        });
}

function nextPlayer(roomCode) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        if (roomData.remainingPlayers.length === 0) {
            // Auction ended
            const updates = {
                auctionEnded: true
            };
            firebase.update(roomRef, updates);
            showAuctionResults(roomCode);
            
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
        
        const updates = {
            currentPlayer,
            remainingPlayers,
            currentBid: 0,
            currentBidder: null,
            bidHistory: [],
            timer: roomData.biddingTime
        };
        
        firebase.update(roomRef, updates)
            .then(() => {
                // Start bid timer with configured time
                if (isHost) {
                    startBidTimer(roomCode, roomData.biddingTime);
                } else {
                    remainingTime = roomData.biddingTime;
                    updateTimerDisplay(roomCode);
                }
            })
            .catch((error) => {
                console.error("Error moving to next player:", error);
            });
    }, { onlyOnce: true });
}

function startBidTimer(roomCode, seconds) {
    // Clear any existing timer
    if (timerInterval) clearInterval(timerInterval);
    
    remainingTime = seconds;
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    // Initial timer update
    firebase.update(roomRef, { timer: remainingTime });
    updateTimerDisplay(roomCode);
    
    timerInterval = setInterval(() => {
        remainingTime--;
        
        // Update timer in Firebase
        firebase.update(roomRef, { timer: remainingTime });
        updateTimerDisplay(roomCode);
        
        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            finalizePlayer(roomCode);
        }
    }, 1000);
}

function updateTimerDisplay(roomCode) {
    const hostTimer = document.getElementById('host-bid-timer');
    const teamTimer = document.getElementById('team-bid-timer');
    
    if (hostTimer) hostTimer.textContent = remainingTime;
    if (teamTimer) teamTimer.textContent = remainingTime;
}

function placeBid(roomCode, teamName) {
    const bidAmount = parseInt(document.getElementById('bid-amount').value);
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    if (!bidAmount) return;
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        // Validate bid
        if (bidAmount <= roomData.currentBid) {
            alert(`Bid must be higher than current bid (${roomData.currentBid})`);
            return;
        }
        
        if (bidAmount > (roomData.teams[teamName]?.tokens || roomData.startingTokens)) {
            alert('Not enough tokens for this bid');
            return;
        }
        
        // Create new bid history entry
        const newBid = {
            team: teamName,
            amount: bidAmount,
            time: new Date().toLocaleTimeString()
        };
        
        const updates = {
            currentBid: bidAmount,
            currentBidder: teamName
        };
        
        // Push new bid to history
        const bidHistoryRef = firebase.ref(firebase.db, `auctions/${roomCode}/bidHistory`);
        firebase.push(bidHistoryRef, newBid);
        
        // Update current bid
        firebase.update(roomRef, updates)
            .then(() => {
                document.getElementById('bid-amount').value = '';
            })
            .catch((error) => {
                console.error("Error placing bid:", error);
            });
    }, { onlyOnce: true });
}

function finalizePlayer(roomCode) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData || !roomData.currentBidder) return;
        
        // Assign player to winning team
        const winningTeam = roomData.currentBidder;
        const teamPlayers = [...(roomData.teams[winningTeam]?.players || [])];
        teamPlayers.push(roomData.currentPlayer);
        
        const updates = {
            [`teams/${winningTeam}/players`]: teamPlayers,
            [`teams/${winningTeam}/tokens`]: roomData.teams[winningTeam].tokens - roomData.currentBid,
            currentPlayer: null,
            currentBid: 0,
            currentBidder: null,
            timer: null
        };
        
        firebase.update(roomRef, updates)
            .catch((error) => {
                console.error("Error finalizing player:", error);
            });
    }, { onlyOnce: true });
}

// Results Display Function
function showAuctionResults(roomCode) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;

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
        resultsBody.innerHTML = Object.entries(roomData.teams).map(([teamName, team]) => {
            const playersList = team.players.map(player => {
                const posClass = getPositionClass(player.Position);
                return `
                    <span class="player-badge ${posClass}">
                        ${player.Name} (${player.Position || 'All'})
                    </span>
                `;
            }).join('');
            
            return `
                <tr>
                    <td>${sno++}</td>
                    <td><strong>${teamName}</strong></td>
                    <td>${playersList || 'No players'}</td>
                    <td>${team.tokens}</td>
                </tr>
            `;
        }).join('');
    });
}

// Helper Functions
function countPositions(players) {
    let counts = { Front: 0, Center: 0, Back: 0 };
    players.forEach(player => {
        const pos = player.Position || 'Center';
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
function updateAllDisplays(roomCode) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        // Update timer display for all users
        if (roomData.currentPlayer && roomData.timer !== null) {
            remainingTime = roomData.timer;
            updateTimerDisplay(roomCode);
        }
        
        if (isHost) {
            updateHostDisplay(roomCode);
        } else if (currentTeamName) {
            updateTeamDisplay(roomCode, currentTeamName);
        }
    });
}

function updateHostDisplay(roomCode) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        // Update teams count
        const teamsCount = Object.keys(roomData.teams).length;
        document.getElementById('teams-count-badge').textContent = `${teamsCount} Team${teamsCount !== 1 ? 's' : ''} Joined`;
        
        // Update teams list with position counts
        const teamsList = document.getElementById('host-teams-list');
        teamsList.innerHTML = Object.entries(roomData.teams).map(([name, team]) => {
            const counts = countPositions(team.players);
            return `
                <div class="team-item">
                    <span><strong>${name}</strong></span>
                    <span>${team.players.length} players (${counts.Front}F ${counts.Center}C ${counts.Back}B) | ${team.tokens} tokens</span>
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
    });
}

function updateTeamDisplay(roomCode, teamName) {
    const roomRef = firebase.ref(firebase.db, `auctions/${roomCode}`);
    
    firebase.onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        // Update team info
        document.getElementById('team-tokens-display').textContent = 
            roomData.teams[teamName]?.tokens || roomData.startingTokens;
        
        // Show/hide auction area based on auction status
        if (roomData.auctionStarted && !roomData.auctionEnded) {
            document.getElementById('team-waiting').classList.add('d-none');
            document.getElementById('team-auction-area').classList.remove('d-none');
        } else if (roomData.auctionEnded) {
            showAuctionResults(roomCode);
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
        if (roomData.teams[teamName]?.players?.length > 0) {
            teamRoster.innerHTML = roomData.teams[teamName].players.map(player => {
                const posClass = getPositionClass(player.Position);
                return `
                    <div class="team-item">
                        <div>
                            <strong>${player.Name}</strong>
                            <span class="badge ${posClass}">${player.Position || 'All'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            teamRoster.innerHTML = '<p>No players yet</p>';
        }
    });
}