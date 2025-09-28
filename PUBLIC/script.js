// Global variables
let socket;
let currentUsername = '';
let isConnected = false;

// DOM elements
const usernameModal = document.getElementById('username-modal');
const usernameInput = document.getElementById('username-input');
const joinButton = document.getElementById('join-button');
const currentUserSpan = document.getElementById('current-user');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const aiToggle = document.getElementById('ai-toggle');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Show username modal on page load
    showUsernameModal();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize socket connection
    initializeSocket();
});

function setupEventListeners() {
    // Username modal events
    joinButton.addEventListener('click', joinChat);
    usernameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinChat();
        }
    });
    
    // Message input events
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendButton.addEventListener('click', sendMessage);
    
    // Auto-focus username input
    usernameInput.focus();
}

function initializeSocket() {
    // Connect to the server
    socket = io();
    
    // Connection events
    socket.on('connect', function() {
        console.log('Connected to server');
        isConnected = true;
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        isConnected = false;
        updateConnectionStatus(false);
    });
    
    socket.on('connect_error', function(error) {
        console.error('Connection error:', error);
        showNotification('Connection failed. Please refresh the page.', 'error');
    });
    
    // Message events
    socket.on('message', function(data) {
        const isOwnMessage = data && data.username === currentUsername;
        displayMessage(data, isOwnMessage);
    });
    
    socket.on('messageHistory', function(messages) {
        // Clear existing messages
        chatMessages.innerHTML = '';
        
        // Display message history
        messages.forEach(function(message) {
            const isOwnMessage = message.username === currentUsername;
            displayMessage(message, isOwnMessage);
        });
        
        // Scroll to bottom
        scrollToBottom();
    });
    
    socket.on('userJoined', function(username) {
        showNotification(`${username} joined the chat`, 'info');
    });
    
    socket.on('userLeft', function(username) {
        showNotification(`${username} left the chat`, 'info');
    });
    
    socket.on('typing', function(data) {
        showTypingIndicator(data.username);
    });
    
    socket.on('stopTyping', function(data) {
        hideTypingIndicator(data.username);
    });
}

function showUsernameModal() {
    usernameModal.style.display = 'flex';
    usernameInput.focus();
}

function hideUsernameModal() {
    usernameModal.style.display = 'none';
}

function joinChat() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        showNotification('Please enter a username', 'error');
        usernameInput.focus();
        return;
    }
    
    if (username.length > 50) {
        showNotification('Username must be 50 characters or less', 'error');
        usernameInput.focus();
        return;
    }
    
    currentUsername = username;
    currentUserSpan.textContent = currentUsername;
    
    // Hide modal and enable chat
    hideUsernameModal();
    enableChat();
    
    // Notify server that user joined
    socket.emit('userJoined', { username: currentUsername });
    
    // Load message history
    socket.emit('getMessageHistory');
}

function enableChat() {
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
    updateConnectionStatus(true);
}

function updateConnectionStatus(connected) {
    if (connected) {
        messageInput.placeholder = 'Type your message...';
        sendButton.textContent = 'Send';
    } else {
        messageInput.placeholder = 'Disconnected...';
        sendButton.textContent = 'Disconnected';
    }
}

function sendMessage() {
    const messageText = messageInput.value.trim();
    
    if (!messageText || !isConnected) {
        return;
    }
    
    if (messageText.length > 255) {
        showNotification('Message must be 255 characters or less', 'error');
        return;
    }
    
    // If AI mode: call AI endpoint and render reply
    if (aiToggle && aiToggle.checked) {
        const userMsg = {
            username: currentUsername,
            text: messageText,
            timestamp: new Date()
        };
        // Show my message immediately
        displayMessage(userMsg, true);
        messageInput.value = '';

        // Call AI
        fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: messageText })
        })
        .then(async (res) => {
            let data;
            try { data = await res.json(); } catch (_) { data = {}; }
            if (!res.ok) {
                const errText = (data && data.error) ? data.error : `AI error (${res.status})`;
                throw new Error(errText);
            }
            return data;
        })
        .then(data => {
            const aiText = (data && typeof data.reply === 'string' && data.reply.trim().length)
                ? data.reply
                : 'AI did not respond.';
            const aiMsg = { username: 'AI', text: aiText, timestamp: new Date() };
            displayMessage(aiMsg, false);
        })
        .catch((err) => {
            const aiMsg = { username: 'AI', text: `AI error: ${err.message}`, timestamp: new Date() };
            displayMessage(aiMsg, false);
        });
        return;
    }

    // Normal realtime mode
    const message = {
        username: currentUsername,
        text: messageText,
        timestamp: new Date()
    };
    socket.emit('message', message);
    messageInput.value = '';
}

function displayMessage(message, isOwnMessage) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'sent' : 'received'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageDiv.innerHTML = `
        <div class="message-username">${escapeHtml(message.username)}</div>
        <div class="message-text">${escapeHtml(message.text)}</div>
        <div class="message-time">${time}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Typing indicator functionality
let typingTimer;
let isTyping = false;

messageInput.addEventListener('input', function() {
    if (!isConnected) return;
    
    // Clear existing timer
    clearTimeout(typingTimer);
    
    // Start typing indicator if not already typing
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { username: currentUsername });
    }
    
    // Set timer to stop typing indicator
    typingTimer = setTimeout(function() {
        isTyping = false;
        socket.emit('stopTyping', { username: currentUsername });
    }, 1000);
});

// Typing indicators
const typingIndicators = {};

function showTypingIndicator(username) {
    if (username === currentUsername) return;
    
    // Remove existing indicator for this user
    hideTypingIndicator(username);
    
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = `typing-${username}`;
    indicator.innerHTML = `
        <span style="font-size: 0.8rem; color: #666;">${escapeHtml(username)} is typing</span>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    
    chatMessages.appendChild(indicator);
    typingIndicators[username] = indicator;
    scrollToBottom();
}

function hideTypingIndicator(username) {
    const indicator = document.getElementById(`typing-${username}`);
    if (indicator) {
        indicator.remove();
        delete typingIndicators[username];
    }
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4444ff'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 1001;
        font-size: 0.9rem;
        max-width: 300px;
        animation: slideInRight 0.3s ease-out;
    `;
    
    // Add animation keyframes if not already added
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // Page is hidden, stop typing indicator
        if (isTyping) {
            isTyping = false;
            socket.emit('stopTyping', { username: currentUsername });
        }
    }
});

// Handle beforeunload to notify server
window.addEventListener('beforeunload', function() {
    if (socket && currentUsername) {
        socket.emit('userLeft', { username: currentUsername });
    }
});

// Keep connection alive
setInterval(function() {
    if (socket && socket.connected) {
        socket.emit('ping');
    }
}, 30000);
