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
    
    // Simulate WebSocket connection for demo
    setInterval(updateRooms, 1000);
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

// Room Display Functions
function createRoom(roomCode, players, startingTokens, biddingTime) {
    // In a real app, you would send this to the server
    localStorage.setItem(`auction_${roomCode}`, JSON.stringify({
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
        auctionEnded: false
    }));
    
    // Show host room
    createRoomForm.classList.add('d-none');
    hostRoom.classList.remove('d-none');
    
    // Set room info
    document.getElementById('host-room-code').textContent = roomCode;
    document.getElementById('share-room-code').textContent = roomCode;
    
    // Set up event listeners
    document.getElementById('start-auction-btn').addEventListener('click', () => startAuction(roomCode));
    document.getElementById('next-player-btn').addEventListener('click', () => nextPlayer(roomCode));
    
    updateHostDisplay(roomCode);
}

function joinRoom(roomCode, teamName) {
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    
    if (!roomData) {
        alert('Room not found. Please check the room code.');
        return;
    }
    
    // Add team to room
    if (!roomData.teams[teamName]) {
        roomData.teams[teamName] = {
            tokens: roomData.startingTokens,
            players: []
        };
        localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
    }
    
    // Show team room
    joinRoomForm.classList.add('d-none');
    teamRoom.classList.remove('d-none');
    
    // Set team info
    document.getElementById('team-name-display').textContent = teamName;
    document.getElementById('team-tokens-display').textContent = roomData.teams[teamName].tokens;
    
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
}

// Auction Functions
function startAuction(roomCode) {
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    
    if (!roomData) return;
    
    roomData.auctionStarted = true;
    localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
    
    // Update UI for host
    document.getElementById('host-controls').classList.add('d-none');
    document.getElementById('host-auction-area').classList.remove('d-none');
    
    // Update UI for all teams
    const teamNames = Object.keys(roomData.teams);
    teamNames.forEach(team => {
        if (document.getElementById('team-name-display') && 
            document.getElementById('team-name-display').textContent === team) {
            document.getElementById('team-waiting').classList.add('d-none');
            document.getElementById('team-auction-area').classList.remove('d-none');
        }
    });
    
    // Start with first player
    nextPlayer(roomCode);
}

function nextPlayer(roomCode) {
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    
    if (!roomData || roomData.remainingPlayers.length === 0) {
        // Auction ended
        roomData.auctionEnded = true;
        localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
        showAuctionResults(roomCode);
        
        // Show alert only to host
        if (isHost) {
            alert('All players have been auctioned! Showing results...');
        }
        return;
    }
    
    // Select random player
    const randomIndex = Math.floor(Math.random() * roomData.remainingPlayers.length);
    roomData.currentPlayer = roomData.remainingPlayers[randomIndex];
    roomData.remainingPlayers.splice(randomIndex, 1);
    roomData.currentBid = 0;
    roomData.currentBidder = null;
    roomData.bidHistory = [];
    roomData.timer = roomData.biddingTime;
    
    localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
    
    // Start bid timer with configured time
    if (isHost) {
        startBidTimer(roomCode, roomData.biddingTime);
    } else {
        remainingTime = roomData.biddingTime;
        updateTimerDisplay(roomCode);
    }
    
    updateAllDisplays(roomCode);
}

function startBidTimer(roomCode, seconds) {
    // Clear any existing timer
    if (timerInterval) clearInterval(timerInterval);
    
    remainingTime = seconds;
    
    // Update the room data with the current timer value
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    if (roomData) {
        roomData.timer = remainingTime;
        localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
    }
    
    updateTimerDisplay(roomCode);
    
    timerInterval = setInterval(() => {
        remainingTime--;
        
        // Update the room data with the current timer value
        const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
        if (roomData) {
            roomData.timer = remainingTime;
            localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
        }
        
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
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    const bidAmount = parseInt(document.getElementById('bid-amount').value);
    
    if (!roomData || !bidAmount) return;
    
    // Validate bid
    if (bidAmount <= roomData.currentBid) {
        alert(`Bid must be higher than current bid (${roomData.currentBid})`);
        return;
    }
    
    if (bidAmount > roomData.teams[teamName].tokens) {
        alert('Not enough tokens for this bid');
        return;
    }
    
    // Update bid
    roomData.currentBid = bidAmount;
    roomData.currentBidder = teamName;
    roomData.bidHistory.push({
        team: teamName,
        amount: bidAmount,
        time: new Date().toLocaleTimeString()
    });
    
    localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
    document.getElementById('bid-amount').value = '';
    
    updateAllDisplays(roomCode);
}

function finalizePlayer(roomCode) {
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    
    if (!roomData || !roomData.currentBidder) return;
    
    // Assign player to winning team
    const winningTeam = roomData.currentBidder;
    roomData.teams[winningTeam].players.push(roomData.currentPlayer);
    roomData.teams[winningTeam].tokens -= roomData.currentBid;
    
    // Clear current player
    roomData.currentPlayer = null;
    roomData.currentBid = 0;
    roomData.currentBidder = null;
    
    localStorage.setItem(`auction_${roomCode}`, JSON.stringify(roomData));
    
    updateAllDisplays(roomCode);
}

// Results Display Function
function showAuctionResults(roomCode) {
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
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
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    if (!roomData) return;
    
    // Update timer display for all users
    if (roomData.currentPlayer && roomData.timer !== null) {
        remainingTime = roomData.timer;
        updateTimerDisplay(roomCode);
    }
    
    // Get all teams in this room
    const teamNames = Object.keys(roomData.teams);
    
    // Update host display
    if (isHost) {
        updateHostDisplay(roomCode);
    }
    
    // Update all team displays
    teamNames.forEach(team => {
        if (document.getElementById('team-name-display') && 
            document.getElementById('team-name-display').textContent === team) {
            updateTeamDisplay(roomCode, team);
        }
    });
}

function updateHostDisplay(roomCode) {
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
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
                
        document.getElementById('host-bid-history').innerHTML = roomData.bidHistory
            .map(bid => `<div class="bid-history-item">${bid.team} bid ${bid.amount} at ${bid.time}</div>`)
            .join('');
    } else {
        currentPlayerDisplay.innerHTML = '<p>No player selected yet</p>';
    }
}

function updateTeamDisplay(roomCode, teamName) {
    const roomData = JSON.parse(localStorage.getItem(`auction_${roomCode}`));
    if (!roomData) return;
    
    // Update team info
    document.getElementById('team-tokens-display').textContent = roomData.teams[teamName].tokens;
    
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
                
        document.getElementById('team-bid-history').innerHTML = roomData.bidHistory
            .map(bid => `<div class="bid-history-item">${bid.team} bid ${bid.amount}</div>`)
            .join('');
    } else {
        currentPlayerDisplay.innerHTML = '<p>No player selected yet</p>';
    }
    
    // Update team roster with position badges
    const teamRoster = document.getElementById('team-roster');
    if (roomData.teams[teamName].players.length > 0) {
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
}

// Simulate real-time updates
function updateRooms() {
    if (currentRoomCode) {
        const roomData = JSON.parse(localStorage.getItem(`auction_${currentRoomCode}`));
        if (!roomData) return;
        
        // Check if auction has ended
        if (roomData.remainingPlayers && roomData.remainingPlayers.length === 0 && 
            (!roomData.currentPlayer || roomData.currentPlayer === null)) {
            roomData.auctionEnded = true;
            localStorage.setItem(`auction_${currentRoomCode}`, JSON.stringify(roomData));
            showAuctionResults(currentRoomCode);
        }
        
        // Update timer for all users
        if (roomData.currentPlayer && roomData.timer !== null) {
            if (isHost) {
                // Host manages the timer
                if (!timerInterval && remainingTime !== roomData.timer) {
                    remainingTime = roomData.timer;
                    updateTimerDisplay(currentRoomCode);
                }
            } else {
                // Joiner syncs with host's timer
                remainingTime = roomData.timer;
                updateTimerDisplay(currentRoomCode);
            }
        }
        
        if (isHost) {
            updateHostDisplay(currentRoomCode);
        } else if (currentTeamName) {
            // Make sure team screen updates when auction starts
            if (roomData.auctionStarted && !roomData.auctionEnded) {
                document.getElementById('team-waiting').classList.add('d-none');
                document.getElementById('team-auction-area').classList.remove('d-none');
            }
            updateTeamDisplay(currentRoomCode, currentTeamName);
        }
    }
}