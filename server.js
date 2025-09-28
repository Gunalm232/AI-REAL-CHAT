require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
let OpenAIClient = null;
try {
    OpenAIClient = require('openai');
} catch (_) {
    // openai not installed
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

// MySQL Database Configuration
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '', // Change this to your MySQL password
    database: 'chat_app',
    charset: 'utf8mb4'
};

// Create MySQL connection pool
let db;
async function initializeDatabase() {
    try {
        // First, create database if it doesn't exist
        const tempConnection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            charset: 'utf8mb4'
        });
        
        await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await tempConnection.end();
        
        // Now connect to the specific database
        db = await mysql.createConnection(dbConfig);
        
        // Create messages table if it doesn't exist
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                text VARCHAR(255) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        console.log('✅ Database connected successfully');
        console.log('✅ Messages table ready');
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('Please make sure MySQL is running and credentials are correct');
        process.exit(1);
    }
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
            const [rows] = await db.execute(
                'SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20'
            );
            
            // Reverse to show oldest first
            const messages = rows.reverse();
            socket.emit('messageHistory', messages);
            
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
            
            // Save message to database
            const [result] = await db.execute(
                'INSERT INTO messages (username, text, timestamp) VALUES (?, ?, ?)',
                [username, text, new Date(timestamp)]
            );
            
            console.log(`💬 Message from ${username}: ${text.substring(0, 50)}...`);
            
            // Broadcast message to all connected clients
            io.emit('message', {
                id: result.insertId,
                username,
                text,
                timestamp: new Date(timestamp)
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
        const [messageCount] = await db.execute('SELECT COUNT(*) as count FROM messages');
        const [recentMessages] = await db.execute(
            'SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10'
        );
        
        res.json({
            totalMessages: messageCount[0].count,
            connectedUsers: connectedUsers.size,
            recentMessages: recentMessages
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
            return res.status(400).json({ error: 'Missing OPENAI_API_KEY in environment' });
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
            if (openai.responses && openai.responses.create) {
                const response = await openai.responses.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    input: messages.map(m => `${m.role}: ${m.content}`).join('\n')
                });
                if (response && response.output && Array.isArray(response.output)) {
                    replyText = response.output.map(p => p.content?.[0]?.text?.value || '').join('').trim();
                }
                if (!replyText && response?.output_text) replyText = String(response.output_text).trim();
            } else if (openai.chat && openai.chat.completions) {
                const response = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                    messages
                });
                replyText = response?.choices?.[0]?.message?.content || '';
            } else {
                return res.status(500).json({ error: 'OpenAI client does not support responses/chat on this version' });
            }
        } catch (err) {
            console.error('AI API error:', err?.message || err);
            return res.status(502).json({ error: 'AI provider error' });
        }

        if (!replyText) replyText = 'I could not generate a response.';

        // Store AI reply in MySQL as username 'AI' (best-effort)
        try {
            await db.execute(
                'INSERT INTO messages (username, text, timestamp) VALUES (?, ?, ?)',
                ['AI', replyText, new Date()]
            );
        } catch (e) {
            console.warn('Could not persist AI message:', e?.message || e);
        }

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
        await db.end();
        console.log('✅ Database connection closed');
    }
    
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    
    if (db) {
        await db.end();
        console.log('✅ Database connection closed');
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
            console.log(`💾 Database: ${dbConfig.database}@${dbConfig.host}`);
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
