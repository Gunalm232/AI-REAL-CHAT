require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
let OpenAIClient = null;
try {
    OpenAIClient = require('openai');
} catch (_) {
    // openai package not installed; AI endpoint will return an error
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Database Configuration
let db;

async function initializeDatabase() {
    try {
        // Create (or open) SQLite database file
        db = new sqlite3.Database('./chat_app.db', (err) => {
            if (err) {
                console.error('❌ Error opening database:', err.message);
                process.exit(1);
            }
            console.log('✅ SQLite database connected successfully');
        });

        // Ensure sequential execution: create table before any other query
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('PRAGMA journal_mode = WAL');
                db.run('PRAGMA foreign_keys = ON');
                db.run(
                    `CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL,
                        text TEXT NOT NULL,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`,
                    (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        console.log('✅ Messages table ready');
                        resolve();
                    }
                );
            });
        });

        // Note: We intentionally skip inserting sample rows to avoid race conditions
        // on first run. You can seed manually if needed.

    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        process.exit(1);
    }
}

function ensureSchema(callback) {
    // Lightweight guard to make sure table exists before queries
    db.serialize(() => {
        db.run(
            `CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            (err) => {
                if (err) {
                    console.error('❌ Schema check failed:', err.message);
                }
                if (typeof callback === 'function') callback(err);
            }
        );
    });
}

// Store connected users
const connectedUsers = new Set();
const typingUsers = new Set();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`👤 User connected: ${socket.id}`);
    
    // Handle user joining
    socket.on('userJoined', async (data) => {
        const { username } = data;
        connectedUsers.add(username);
        socket.username = username;
        
        console.log(`👋 ${username} joined the chat`);
        
        // Notify all clients that user joined
        socket.broadcast.emit('userJoined', { username });
        
        // Send current user count
        io.emit('userCount', { count: connectedUsers.size });
    });
    
    // Handle getting message history
    socket.on('getMessageHistory', async () => {
        try {
            ensureSchema(() => {
                db.all(
                    'SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20',
                    [],
                    (err, rows) => {
                        if (err) {
                            console.error('Error fetching message history:', err);
                            socket.emit('error', { message: 'Failed to load message history' });
                            return;
                        }
                        
                        // Reverse to show oldest first
                        const messages = (rows || []).reverse();
                        socket.emit('messageHistory', messages);
                    }
                );
            });
        } catch (error) {
            console.error('Error fetching message history:', error);
            socket.emit('error', { message: 'Failed to load message history' });
        }
    });
    
    // Handle new messages
    socket.on('message', async (data) => {
        try {
            const { username, text, timestamp } = data;
            
            // Validate message data
            if (!username || !text || username.length > 50 || text.length > 255) {
                socket.emit('error', { message: 'Invalid message data' });
                return;
            }
            
            // Save message to database (after ensuring schema)
            ensureSchema(() => {
                db.run(
                    'INSERT INTO messages (username, text, timestamp) VALUES (?, ?, ?)',
                    [username, text, new Date(timestamp).toISOString()],
                    function(err) {
                        if (err) {
                            console.error('Error saving message:', err);
                            socket.emit('error', { message: 'Failed to send message' });
                            return;
                        }
                        
                        console.log(`💬 Message from ${username}: ${text.substring(0, 50)}...`);
                        
                        // Broadcast message to all connected clients
                        io.emit('message', {
                            id: this.lastID,
                            username,
                            text,
                            timestamp: new Date(timestamp)
                        });
                    }
                );
            });
            
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });
    
    // Handle typing indicators
    socket.on('typing', (data) => {
        const { username } = data;
        if (username && !typingUsers.has(username)) {
            typingUsers.add(username);
            socket.broadcast.emit('typing', { username });
        }
    });
    
    socket.on('stopTyping', (data) => {
        const { username } = data;
        if (username && typingUsers.has(username)) {
            typingUsers.delete(username);
            socket.broadcast.emit('stopTyping', { username });
        }
    });
    
    // Handle ping for connection health
    socket.on('ping', () => {
        socket.emit('pong');
    });
    
    // Handle user leaving
    socket.on('userLeft', (data) => {
        const { username } = data;
        if (username) {
            connectedUsers.delete(username);
            typingUsers.delete(username);
            console.log(`👋 ${username} left the chat`);
            socket.broadcast.emit('userLeft', { username });
            io.emit('userCount', { count: connectedUsers.size });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        if (socket.username) {
            connectedUsers.delete(socket.username);
            typingUsers.delete(socket.username);
            console.log(`👋 ${socket.username} disconnected`);
            socket.broadcast.emit('userLeft', { username: socket.username });
            io.emit('userCount', { count: connectedUsers.size });
        }
        console.log(`👤 User disconnected: ${socket.id}`);
    });
    
    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        connectedUsers: connectedUsers.size
    });
});

app.get('/api/stats', async (req, res) => {
    try {
        db.get('SELECT COUNT(*) as count FROM messages', [], (err, messageCount) => {
            if (err) {
                console.error('Error fetching message count:', err);
                res.status(500).json({ error: 'Failed to fetch statistics' });
                return;
            }
            
            db.all('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10', [], (err, recentMessages) => {
                if (err) {
                    console.error('Error fetching recent messages:', err);
                    res.status(500).json({ error: 'Failed to fetch statistics' });
                    return;
                }
                
                res.json({
                    totalMessages: messageCount.count,
                    connectedUsers: connectedUsers.size,
                    recentMessages: recentMessages
                });
            });
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// AI Chat endpoint (optional)
app.post('/api/ai-chat', async (req, res) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            // Demo fallback: generate a simple local reply without calling external APIs
            const { prompt } = req.body || {};
            const reply = prompt && typeof prompt === 'string'
                ? `Demo AI: You said "${prompt.slice(0, 200)}"`
                : 'Demo AI: Hello! Provide a prompt to chat.';
            return res.json({ reply });
        }
        if (!OpenAIClient) {
            return res.status(400).json({ error: 'openai package not installed' });
        }

        const { prompt, history } = req.body || {};
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Invalid prompt' });
        }

        const OpenAI = OpenAIClient.default || OpenAIClient;
        const openai = new OpenAI({ apiKey });

        // Compose messages for Chat Completions API
        const messages = [
            { role: 'system', content: 'You are a helpful AI assistant. Keep answers concise.' }
        ];
        if (Array.isArray(history)) {
            for (const m of history) {
                if (!m || !m.role || !m.content) continue;
                messages.push({ role: m.role, content: String(m.content).slice(0, 4000) });
            }
        }
        messages.push({ role: 'user', content: prompt.slice(0, 4000) });

        let replyText = '';
        try {
            // Prefer Chat Completions for robustness
            if (openai.chat && openai.chat.completions) {
                const response = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                    messages
                });
                replyText = response?.choices?.[0]?.message?.content || '';
            } else if (openai.responses && openai.responses.create) {
                const response = await openai.responses.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    input: messages.map(m => `${m.role}: ${m.content}`).join('\n')
                });
                if (response?.output && Array.isArray(response.output)) {
                    replyText = response.output.map(p => p.content?.[0]?.text?.value || '').join('').trim();
                }
                if (!replyText && response?.output_text) replyText = String(response.output_text).trim();
            } else {
                return res.status(500).json({ error: 'OpenAI client does not support responses/chat on this version' });
            }
        } catch (err) {
            console.error('AI API error:', err?.message || err);
            return res.status(502).json({ error: err?.message || 'AI provider error' });
        }

        if (!replyText || !replyText.trim()) {
            return res.status(502).json({ error: 'AI provider returned empty response' });
        }

        // Optionally store AI reply in messages table (as username "AI")
        ensureSchema(() => {
            db.run(
                'INSERT INTO messages (username, text, timestamp) VALUES (?, ?, ?)',
                ['AI', replyText, new Date().toISOString()],
                function(err) {
                    if (err) {
                        console.error('Error saving AI message:', err);
                    }
                }
            );
        });

        return res.json({ reply: replyText });
    } catch (error) {
        console.error('AI endpoint error:', error);
        return res.status(500).json({ error: 'Failed to get AI reply' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('✅ Database connection closed');
            }
        });
    }
    
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('✅ Database connection closed');
            }
        });
    }
    
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await initializeDatabase();
        
        server.listen(PORT, () => {
            console.log('🚀 Chat App Server Started!');
            console.log(`📡 Server running on http://localhost:${PORT}`);
            console.log(`💾 Database: SQLite (chat_app.db)`);
            console.log('👥 Ready for connections...');
            console.log('\n📋 Available endpoints:');
            console.log(`   • Main App: http://localhost:${PORT}`);
            console.log(`   • Health Check: http://localhost:${PORT}/api/health`);
            console.log(`   • Statistics: http://localhost:${PORT}/api/stats`);
            console.log('\n💡 Press Ctrl+C to stop the server');
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
